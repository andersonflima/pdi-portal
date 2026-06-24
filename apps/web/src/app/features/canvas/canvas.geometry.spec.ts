import { describe, expect, it } from 'vitest';
import {
  findContainingFrame,
  getConnectorEndpoints,
  getConnectorLabelPoint,
  getConnectorPath,
  getNodeCenter,
  isPointInsideNode
} from './canvas.geometry';
import type { CanvasNodeView } from './canvas.models';

const node = (overrides: Partial<CanvasNodeView>): CanvasNodeView => ({
  color: '#000000',
  height: 100,
  id: 'n',
  kind: 'NOTE',
  label: 'n',
  position: { x: 0, y: 0 },
  width: 100,
  zIndex: 1000,
  ...overrides
});

describe('getNodeCenter', () => {
  it('returns the geometric center', () => {
    expect(getNodeCenter(node({ position: { x: 10, y: 20 }, width: 100, height: 40 }))).toEqual({
      x: 60,
      y: 40
    });
  });
});

describe('isPointInsideNode', () => {
  const target = node({ position: { x: 0, y: 0 }, width: 100, height: 100 });

  it('detects points inside and on the border', () => {
    expect(isPointInsideNode({ x: 50, y: 50 }, target)).toBe(true);
    expect(isPointInsideNode({ x: 0, y: 0 }, target)).toBe(true);
    expect(isPointInsideNode({ x: 100, y: 100 }, target)).toBe(true);
  });

  it('rejects points outside the node', () => {
    expect(isPointInsideNode({ x: -1, y: 50 }, target)).toBe(false);
    expect(isPointInsideNode({ x: 50, y: 101 }, target)).toBe(false);
  });
});

describe('findContainingFrame', () => {
  it('finds the frame whose area contains the node center', () => {
    const frame = node({ id: 'f1', kind: 'FRAME', position: { x: 0, y: 0 }, width: 400, height: 400 });
    const child = node({ id: 'c1', position: { x: 100, y: 100 }, width: 50, height: 50 });

    expect(findContainingFrame(child, [frame, child])?.id).toBe('f1');
  });

  it('returns undefined when no frame contains the node', () => {
    const frame = node({ id: 'f1', kind: 'FRAME', position: { x: 1000, y: 1000 }, width: 100, height: 100 });
    const child = node({ id: 'c1', position: { x: 0, y: 0 }, width: 10, height: 10 });

    expect(findContainingFrame(child, [frame, child])).toBeUndefined();
  });
});

describe('connector geometry', () => {
  const source = node({ id: 's', position: { x: 0, y: 0 }, width: 100, height: 100 });
  const target = node({ id: 't', position: { x: 300, y: 0 }, width: 100, height: 100 });

  it('computes endpoints using closest handles', () => {
    const { start, end } = getConnectorEndpoints(source, target);
    expect(start).toEqual({ x: 100, y: 50 });
    expect(end).toEqual({ x: 300, y: 50 });
  });

  it('honors explicit handle hints', () => {
    const { start } = getConnectorEndpoints(source, target, 'top-source');
    expect(start).toEqual({ x: 50, y: 0 });
  });

  it('builds straight, step and curved paths', () => {
    expect(getConnectorPath(source, target, 'straight')).toMatch(/^M .* L .*/);
    expect(getConnectorPath(source, target, 'step')).toContain('L');
    expect(getConnectorPath(source, target, 'smoothstep')).toContain('C');
  });

  it('honors endpoint offsets', () => {
    const withOffset = getConnectorPath(source, target, 'straight', undefined, undefined, { start: 10, end: 10 });
    expect(withOffset).toMatch(/^M 110 50/);
  });

  it('computes label points for each path type', () => {
    expect(getConnectorLabelPoint(source, target, 'straight')).toEqual({ x: 200, y: 50 });
    const step = getConnectorLabelPoint(source, target, 'step');
    expect(step.x).toBeCloseTo(200, 5);
    const curve = getConnectorLabelPoint(source, target, 'smoothstep');
    expect(curve.x).toBeCloseTo(200, 0);
  });
});
