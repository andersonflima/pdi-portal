/**
 * Pure SVG geometry helpers for the progress report charts.
 *
 * Everything here is side-effect free and deterministic so it can be unit
 * tested in isolation and kept out of the rendering component.
 */

const TWO_PI = Math.PI * 2;

/** Clamp any number into the inclusive 0-100 percentage range. */
export const clampPercent = (value: number): number => {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

/** Circumference of a circle for a given radius. */
export const circleCircumference = (radius: number): number => TWO_PI * Math.max(0, radius);

/**
 * Stroke dash array for a donut/progress ring rendered with a single stroked
 * circle. `dash` is the visible arc length for `percent` of the circle and
 * `gap` is the remaining (hidden) length.
 */
export const donutDashArray = (
  percent: number,
  circumference: number
): { dash: number; gap: number } => {
  const ratio = clampPercent(percent) / 100;
  const dash = circumference * ratio;
  return { dash, gap: Math.max(0, circumference - dash) };
};

/**
 * Convert a polar coordinate into a cartesian point. Angle is measured in
 * degrees starting from 12 o'clock (top) and increasing clockwise, matching
 * the orientation used for the progress ring.
 */
export const polarToCartesian = (
  cx: number,
  cy: number,
  radius: number,
  angleDegrees: number
): { x: number; y: number } => {
  const radians = ((angleDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians)
  };
};

/**
 * Scale a list of counts into pixel widths relative to the largest count.
 * The largest count maps to `maxWidth`; zero counts map to `0`. When every
 * count is zero the result is all zeros (no division by zero).
 */
export const barWidths = (counts: readonly number[], maxWidth: number): number[] => {
  const safeMax = Math.max(0, maxWidth);
  const peak = counts.reduce((max, value) => Math.max(max, value), 0);
  if (peak <= 0) return counts.map(() => 0);
  return counts.map((value) => (Math.max(0, value) / peak) * safeMax);
};

/** Length along a track for a given percentage (0-100 clamped). */
export const percentToLength = (percent: number, length: number): number =>
  (clampPercent(percent) / 100) * Math.max(0, length);
