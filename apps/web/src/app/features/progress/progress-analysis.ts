import type { CanvasNodeKind } from '@pdi/contracts';

export type ProgressStatus = 'not-started' | 'on-track' | 'behind' | 'ahead' | 'done' | 'overdue';

export type ProgressTrackable = {
  id: string;
  kind: CanvasNodeKind;
  label: string;
  progress?: number;
  startDate?: string;
  targetDate?: string;
};

export type NodeProgressInsight = {
  id: string;
  kind: CanvasNodeKind;
  label: string;
  progress: number;
  expectedProgress: number | null;
  status: ProgressStatus;
  daysRemaining: number | null;
};

export type BoardProgressSummary = {
  trackedCount: number;
  completedCount: number;
  averageProgress: number;
  averageExpectedProgress: number | null;
  statusCounts: Record<ProgressStatus, number>;
  insights: NodeProgressInsight[];
};

const MS_PER_DAY = 86_400_000;
const ON_TRACK_MARGIN = 10;

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const emptyStatusCounts = (): Record<ProgressStatus, number> => ({
  ahead: 0,
  behind: 0,
  done: 0,
  'not-started': 0,
  'on-track': 0,
  overdue: 0
});

const parseTime = (value?: string): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

export const isProgressTracked = (node: ProgressTrackable) =>
  typeof node.progress === 'number' || Boolean(node.startDate) || Boolean(node.targetDate);

export const expectedProgressAt = (node: ProgressTrackable, now: Date): number | null => {
  const start = parseTime(node.startDate);
  const target = parseTime(node.targetDate);

  if (start === null || target === null || target <= start) return null;

  const elapsedRatio = (now.getTime() - start) / (target - start);
  return clampPercent(elapsedRatio * 100);
};

export const daysRemainingUntil = (node: ProgressTrackable, now: Date): number | null => {
  const target = parseTime(node.targetDate);
  if (target === null) return null;

  return Math.ceil((target - now.getTime()) / MS_PER_DAY);
};

export const resolveProgressStatus = (node: ProgressTrackable, now: Date): ProgressStatus => {
  const progress = clampPercent(node.progress ?? 0);

  if (progress >= 100) return 'done';

  const target = parseTime(node.targetDate);
  if (target !== null && now.getTime() > target) return 'overdue';

  const expected = expectedProgressAt(node, now);

  if (expected === null) return progress <= 0 ? 'not-started' : 'on-track';
  if (progress <= 0 && expected < ON_TRACK_MARGIN) return 'not-started';
  if (progress >= expected + ON_TRACK_MARGIN) return 'ahead';
  if (progress <= expected - ON_TRACK_MARGIN) return 'behind';

  return 'on-track';
};

export const toNodeProgressInsight = (node: ProgressTrackable, now: Date): NodeProgressInsight => ({
  id: node.id,
  kind: node.kind,
  label: node.label,
  progress: clampPercent(node.progress ?? 0),
  expectedProgress: expectedProgressAt(node, now),
  status: resolveProgressStatus(node, now),
  daysRemaining: daysRemainingUntil(node, now)
});

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

export const summarizeBoardProgress = (nodes: ProgressTrackable[], now: Date): BoardProgressSummary => {
  const tracked = nodes.filter(isProgressTracked);
  const insights = tracked.map((node) => toNodeProgressInsight(node, now));

  const statusCounts = insights.reduce((counts, insight) => {
    counts[insight.status] += 1;
    return counts;
  }, emptyStatusCounts());

  const expectedValues = insights
    .map((insight) => insight.expectedProgress)
    .filter((value): value is number => value !== null);

  return {
    trackedCount: tracked.length,
    completedCount: insights.filter((insight) => insight.progress >= 100).length,
    averageProgress: Math.round(average(insights.map((insight) => insight.progress))),
    averageExpectedProgress: expectedValues.length === 0 ? null : Math.round(average(expectedValues)),
    statusCounts,
    insights
  };
};
