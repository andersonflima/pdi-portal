import { describe, expect, it } from 'vitest';
import {
  barWidths,
  circleCircumference,
  clampPercent,
  donutDashArray,
  percentToLength,
  polarToCartesian
} from './report-charts';

describe('clampPercent', () => {
  it('clamps values into the 0-100 range', () => {
    expect(clampPercent(-20)).toBe(0);
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(42)).toBe(42);
    expect(clampPercent(100)).toBe(100);
    expect(clampPercent(150)).toBe(100);
  });

  it('treats non-finite values as zero', () => {
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(100);
  });
});

describe('circleCircumference', () => {
  it('computes 2*pi*r', () => {
    expect(circleCircumference(0)).toBe(0);
    expect(circleCircumference(10)).toBeCloseTo(2 * Math.PI * 10, 6);
  });

  it('never goes negative', () => {
    expect(circleCircumference(-5)).toBe(0);
  });
});

describe('donutDashArray', () => {
  const circumference = circleCircumference(50);

  it('renders no visible arc at 0%', () => {
    const { dash, gap } = donutDashArray(0, circumference);
    expect(dash).toBe(0);
    expect(gap).toBeCloseTo(circumference, 6);
  });

  it('renders half the ring at 50%', () => {
    const { dash, gap } = donutDashArray(50, circumference);
    expect(dash).toBeCloseTo(circumference / 2, 6);
    expect(gap).toBeCloseTo(circumference / 2, 6);
  });

  it('renders the full ring at 100% with no gap', () => {
    const { dash, gap } = donutDashArray(100, circumference);
    expect(dash).toBeCloseTo(circumference, 6);
    expect(gap).toBe(0);
  });

  it('clamps out-of-range percentages', () => {
    expect(donutDashArray(-30, circumference).dash).toBe(0);
    expect(donutDashArray(130, circumference).gap).toBe(0);
  });
});

describe('polarToCartesian', () => {
  it('places 0 degrees at the top (12 o\'clock)', () => {
    const point = polarToCartesian(0, 0, 10, 0);
    expect(point.x).toBeCloseTo(0, 6);
    expect(point.y).toBeCloseTo(-10, 6);
  });

  it('places 90 degrees at the right (3 o\'clock)', () => {
    const point = polarToCartesian(0, 0, 10, 90);
    expect(point.x).toBeCloseTo(10, 6);
    expect(point.y).toBeCloseTo(0, 6);
  });

  it('places 180 degrees at the bottom (6 o\'clock)', () => {
    const point = polarToCartesian(0, 0, 10, 180);
    expect(point.x).toBeCloseTo(0, 6);
    expect(point.y).toBeCloseTo(10, 6);
  });

  it('honours the center offset', () => {
    const point = polarToCartesian(50, 60, 10, 90);
    expect(point.x).toBeCloseTo(60, 6);
    expect(point.y).toBeCloseTo(60, 6);
  });
});

describe('barWidths', () => {
  it('scales counts relative to the largest count', () => {
    expect(barWidths([1, 2, 4], 100)).toEqual([25, 50, 100]);
  });

  it('returns all zeros when every count is zero', () => {
    expect(barWidths([0, 0, 0], 100)).toEqual([0, 0, 0]);
  });

  it('clamps negative counts to zero width', () => {
    expect(barWidths([-3, 5], 100)).toEqual([0, 100]);
  });

  it('never exceeds the max width', () => {
    const widths = barWidths([3, 9], 200);
    expect(Math.max(...widths)).toBe(200);
  });
});

describe('percentToLength', () => {
  it('maps a percentage onto a track length', () => {
    expect(percentToLength(0, 200)).toBe(0);
    expect(percentToLength(50, 200)).toBe(100);
    expect(percentToLength(100, 200)).toBe(200);
  });

  it('clamps out-of-range percentages', () => {
    expect(percentToLength(-10, 200)).toBe(0);
    expect(percentToLength(180, 200)).toBe(200);
  });
});
