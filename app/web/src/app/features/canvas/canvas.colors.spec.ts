import { describe, expect, it } from 'vitest';
import {
  getNodeTextColor,
  getReadableTextColor,
  getRelativeLuminance,
  mixRgbColors,
  parseCssColor
} from './canvas.colors';
import type { CanvasNodeView } from './canvas.models';

const node = (overrides: Partial<CanvasNodeView>): CanvasNodeView => ({
  color: '#2563eb',
  height: 100,
  id: 'n1',
  kind: 'NOTE',
  label: 'Node',
  position: { x: 0, y: 0 },
  width: 100,
  zIndex: 1000,
  ...overrides
});

describe('parseCssColor', () => {
  it('parses hex colors with and without a leading hash', () => {
    expect(parseCssColor('#ffffff')).toEqual({ red: 255, green: 255, blue: 255 });
    expect(parseCssColor('000000')).toEqual({ red: 0, green: 0, blue: 0 });
    expect(parseCssColor('  #2563EB  ')).toEqual({ red: 37, green: 99, blue: 235 });
  });

  it('parses rgb and rgba colors', () => {
    expect(parseCssColor('rgb(10, 20, 30)')).toEqual({ red: 10, green: 20, blue: 30 });
    expect(parseCssColor('rgba(1, 2, 3, 0.5)')).toEqual({ red: 1, green: 2, blue: 3 });
  });

  it('returns null for unsupported formats', () => {
    expect(parseCssColor('not-a-color')).toBeNull();
    expect(parseCssColor('#fff')).toBeNull();
  });
});

describe('color math', () => {
  it('mixes two colors by weight', () => {
    const mixed = mixRgbColors({ red: 0, green: 0, blue: 0 }, { red: 100, green: 100, blue: 100 }, 0.5);
    expect(mixed).toEqual({ red: 50, green: 50, blue: 50 });
  });

  it('computes relative luminance between 0 and 1', () => {
    expect(getRelativeLuminance({ red: 0, green: 0, blue: 0 })).toBeCloseTo(0, 5);
    expect(getRelativeLuminance({ red: 255, green: 255, blue: 255 })).toBeCloseTo(1, 5);
  });

  it('picks readable text color based on luminance', () => {
    expect(getReadableTextColor({ red: 255, green: 255, blue: 255 })).toBe('#172033');
    expect(getReadableTextColor({ red: 0, green: 0, blue: 0 })).toBe('#ffffff');
  });
});

describe('getNodeTextColor', () => {
  it('returns the raw color for text nodes', () => {
    expect(getNodeTextColor(node({ kind: 'TEXT', color: '#abcdef' }))).toBe('#abcdef');
  });

  it('returns a dark ink for cards, tasks and checklists', () => {
    expect(getNodeTextColor(node({ kind: 'CARD' }))).toBe('#172033');
    expect(getNodeTextColor(node({ kind: 'TASK' }))).toBe('#172033');
    expect(getNodeTextColor(node({ kind: 'TASK_LIST' }))).toBe('#172033');
  });

  it('derives frame text color from its background', () => {
    expect(getNodeTextColor(node({ kind: 'FRAME', backgroundColor: '#000000' }))).toBe('#ffffff');
    expect(getNodeTextColor(node({ kind: 'FRAME', backgroundColor: '#ffffff' }))).toBe('#172033');
  });

  it('derives a readable color for tinted surfaces', () => {
    for (const kind of ['NOTE', 'STICKER', 'SHAPE', 'GOAL'] as const) {
      expect(['#172033', '#ffffff']).toContain(getNodeTextColor(node({ kind, color: '#101010' })));
    }
  });

  it('falls back to dark ink for unhandled kinds', () => {
    expect(getNodeTextColor(node({ kind: 'TASK' }))).toBe('#172033');
  });
});
