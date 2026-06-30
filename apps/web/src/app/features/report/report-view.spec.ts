import { describe, expect, it } from 'vitest';
import type { NodeProgressInsight, ProgressStatus } from '../progress/progress-analysis';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_ORDER,
  buildStatusBars,
  toDeadlineLabel,
  toStepView
} from './report-view';

const emptyCounts = (): Record<ProgressStatus, number> => ({
  done: 0,
  'on-track': 0,
  ahead: 0,
  behind: 0,
  overdue: 0,
  'not-started': 0
});

const makeInsight = (overrides: Partial<NodeProgressInsight> = {}): NodeProgressInsight =>
  ({
    id: 'node-1',
    label: 'Step',
    status: 'on-track',
    progress: 50,
    expectedProgress: 40,
    daysRemaining: 5,
    ...overrides
  }) as NodeProgressInsight;

describe('toDeadlineLabel', () => {
  it('returns null when there is no deadline', () => {
    expect(toDeadlineLabel(null)).toBeNull();
  });

  it('labels the due-today case', () => {
    expect(toDeadlineLabel(0)).toBe('Due today');
  });

  it('labels remaining and late days', () => {
    expect(toDeadlineLabel(5)).toBe('5 days left');
    expect(toDeadlineLabel(-3)).toBe('3 days late');
  });
});

describe('toStepView', () => {
  it('maps status to label and color', () => {
    const view = toStepView(makeInsight({ status: 'overdue' }));

    expect(view.statusLabel).toBe(STATUS_LABELS.overdue);
    expect(view.color).toBe(STATUS_COLORS.overdue);
  });

  it('derives progress and expected widths on the step track', () => {
    const view = toStepView(makeInsight({ progress: 50, expectedProgress: 40 }));

    expect(view.progressWidth).toBe(50);
    expect(view.expectedOffset).toBe(40);
  });

  it('keeps a null expected offset when no expected progress is known', () => {
    const view = toStepView(makeInsight({ expectedProgress: null }));

    expect(view.expectedProgress).toBeNull();
    expect(view.expectedOffset).toBeNull();
  });

  it('carries the deadline label through', () => {
    expect(toStepView(makeInsight({ daysRemaining: 0 })).deadline).toBe('Due today');
    expect(toStepView(makeInsight({ daysRemaining: null })).deadline).toBeNull();
  });
});

describe('buildStatusBars', () => {
  it('returns one bar per status in the stable render order', () => {
    const bars = buildStatusBars(emptyCounts());

    expect(bars.map((bar) => bar.status)).toEqual([...STATUS_ORDER]);
  });

  it('maps each status to its count, label and color', () => {
    const counts = { ...emptyCounts(), done: 3, overdue: 1 };
    const bars = buildStatusBars(counts);
    const doneBar = bars.find((bar) => bar.status === 'done');

    expect(doneBar?.count).toBe(3);
    expect(doneBar?.label).toBe(STATUS_LABELS.done);
    expect(doneBar?.color).toBe(STATUS_COLORS.done);
  });

  it('gives the larger count a wider bar', () => {
    const counts = { ...emptyCounts(), done: 10, overdue: 1 };
    const bars = buildStatusBars(counts);
    const doneWidth = bars.find((bar) => bar.status === 'done')?.width ?? 0;
    const overdueWidth = bars.find((bar) => bar.status === 'overdue')?.width ?? 0;

    expect(doneWidth).toBeGreaterThan(overdueWidth);
  });

  it('produces zero-width bars when every count is zero', () => {
    const bars = buildStatusBars(emptyCounts());

    expect(bars.every((bar) => bar.width === 0)).toBe(true);
  });
});
