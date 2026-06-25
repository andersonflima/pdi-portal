import { describe, expect, it } from 'vitest';
import {
  daysRemainingUntil,
  expectedProgressAt,
  isProgressTracked,
  resolveProgressStatus,
  summarizeBoardProgress,
  type ProgressTrackable
} from './progress-analysis';

const node = (overrides: Partial<ProgressTrackable>): ProgressTrackable => ({
  id: 'n1',
  kind: 'TASK',
  label: 'Read a book',
  ...overrides
});

const NOW = new Date('2026-02-01T00:00:00.000Z');
const START = '2026-01-01T00:00:00.000Z';
const TARGET = '2026-03-01T00:00:00.000Z'; // ~59 days span; NOW is ~31 days in

describe('isProgressTracked', () => {
  it('tracks nodes with progress or any schedule field', () => {
    expect(isProgressTracked(node({ progress: 0 }))).toBe(true);
    expect(isProgressTracked(node({ startDate: START }))).toBe(true);
    expect(isProgressTracked(node({ targetDate: TARGET }))).toBe(true);
    expect(isProgressTracked(node({}))).toBe(false);
  });
});

describe('expectedProgressAt', () => {
  it('returns null without a valid start/target window', () => {
    expect(expectedProgressAt(node({ progress: 50 }), NOW)).toBeNull();
    expect(expectedProgressAt(node({ startDate: TARGET, targetDate: START }), NOW)).toBeNull();
  });

  it('computes the elapsed percentage of the schedule window', () => {
    const expected = expectedProgressAt(node({ startDate: START, targetDate: TARGET }), NOW);
    expect(expected).toBeGreaterThan(45);
    expect(expected).toBeLessThan(60);
  });

  it('clamps before start and after target', () => {
    expect(expectedProgressAt(node({ startDate: START, targetDate: TARGET }), new Date('2025-12-01T00:00:00Z'))).toBe(0);
    expect(expectedProgressAt(node({ startDate: START, targetDate: TARGET }), new Date('2026-06-01T00:00:00Z'))).toBe(100);
  });
});

describe('resolveProgressStatus', () => {
  it('marks completed work as done', () => {
    expect(resolveProgressStatus(node({ progress: 100, startDate: START, targetDate: TARGET }), NOW)).toBe('done');
  });

  it('flags overdue unfinished work past the target date', () => {
    expect(resolveProgressStatus(node({ progress: 80, targetDate: '2026-01-15T00:00:00Z' }), NOW)).toBe('overdue');
  });

  it('classifies ahead / on-track / behind against the schedule', () => {
    const scheduled = { startDate: START, targetDate: TARGET };
    expect(resolveProgressStatus(node({ progress: 90, ...scheduled }), NOW)).toBe('ahead');
    expect(resolveProgressStatus(node({ progress: 50, ...scheduled }), NOW)).toBe('on-track');
    expect(resolveProgressStatus(node({ progress: 10, ...scheduled }), NOW)).toBe('behind');
  });

  it('treats unscheduled nodes by activity', () => {
    expect(resolveProgressStatus(node({ progress: 0 }), NOW)).toBe('not-started');
    expect(resolveProgressStatus(node({ progress: 40 }), NOW)).toBe('on-track');
  });
});

describe('daysRemainingUntil', () => {
  it('returns whole days to target or null', () => {
    expect(daysRemainingUntil(node({ targetDate: '2026-02-11T00:00:00Z' }), NOW)).toBe(10);
    expect(daysRemainingUntil(node({}), NOW)).toBeNull();
  });
});

describe('summarizeBoardProgress', () => {
  it('aggregates tracked nodes only', () => {
    const summary = summarizeBoardProgress(
      [
        node({ id: 'a', progress: 100, startDate: START, targetDate: TARGET }),
        node({ id: 'b', progress: 10, startDate: START, targetDate: TARGET }),
        node({ id: 'c', kind: 'FRAME', label: 'group' }) // untracked
      ],
      NOW
    );

    expect(summary.trackedCount).toBe(2);
    expect(summary.completedCount).toBe(1);
    expect(summary.averageProgress).toBe(55);
    expect(summary.statusCounts.done).toBe(1);
    expect(summary.statusCounts.behind).toBe(1);
    expect(summary.insights).toHaveLength(2);
  });

  it('returns an empty, safe summary when nothing is tracked', () => {
    const summary = summarizeBoardProgress([node({})], NOW);

    expect(summary.trackedCount).toBe(0);
    expect(summary.averageProgress).toBe(0);
    expect(summary.averageExpectedProgress).toBeNull();
  });
});
