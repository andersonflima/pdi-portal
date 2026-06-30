import type { NodeProgressInsight, ProgressStatus } from '../progress/progress-analysis';
import { barWidths, percentToLength } from './report-charts';

export const STATUS_COLORS: Record<ProgressStatus, string> = {
  done: 'var(--color-success)',
  'on-track': 'var(--color-success)',
  ahead: 'var(--color-info)',
  behind: 'var(--color-warning)',
  overdue: 'var(--color-danger)',
  'not-started': 'var(--color-content-muted)'
};

export const STATUS_LABELS: Record<ProgressStatus, string> = {
  done: 'Done',
  'on-track': 'On track',
  ahead: 'Ahead',
  behind: 'Behind',
  overdue: 'Overdue',
  'not-started': 'Not started'
};

/** Order the status bars are rendered in (stable, color-coded). */
export const STATUS_ORDER: readonly ProgressStatus[] = [
  'done',
  'on-track',
  'ahead',
  'behind',
  'overdue',
  'not-started'
];

const BAR_TRACK_WIDTH = 240;
const STEP_TRACK_WIDTH = 100;

export type StatusBar = {
  status: ProgressStatus;
  label: string;
  color: string;
  count: number;
  width: number;
};

export type StepView = {
  id: string;
  label: string;
  status: ProgressStatus;
  statusLabel: string;
  color: string;
  progress: number;
  progressWidth: number;
  expectedProgress: number | null;
  expectedOffset: number | null;
  deadline: string | null;
};

export const toDeadlineLabel = (days: number | null): string | null => {
  if (days === null) return null;
  if (days === 0) return 'Due today';
  return days > 0 ? `${days} days left` : `${Math.abs(days)} days late`;
};

export const toStepView = (insight: NodeProgressInsight): StepView => ({
  id: insight.id,
  label: insight.label,
  status: insight.status,
  statusLabel: STATUS_LABELS[insight.status],
  color: STATUS_COLORS[insight.status],
  progress: insight.progress,
  progressWidth: percentToLength(insight.progress, STEP_TRACK_WIDTH),
  expectedProgress: insight.expectedProgress,
  expectedOffset:
    insight.expectedProgress === null ? null : percentToLength(insight.expectedProgress, STEP_TRACK_WIDTH),
  deadline: toDeadlineLabel(insight.daysRemaining)
});

export const buildStatusBars = (counts: Record<ProgressStatus, number>): StatusBar[] => {
  const widths = barWidths(
    STATUS_ORDER.map((status) => counts[status]),
    BAR_TRACK_WIDTH
  );

  return STATUS_ORDER.map((status, index) => ({
    status,
    label: STATUS_LABELS[status],
    color: STATUS_COLORS[status],
    count: counts[status],
    width: widths[index] ?? 0
  }));
};
