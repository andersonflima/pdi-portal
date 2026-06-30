import { describe, expect, it } from 'vitest';
import { canvasSize } from './canvas.constants';
import type { CanvasNodeView, XYPosition } from './canvas.models';
import {
  applyNodeDragDelta,
  clientToCanvasPoint,
  computeResizedDimensions,
  computeZoomScroll,
  hasCrossedThreshold
} from './canvas-board.interactions';

const makeNode = (overrides: Partial<CanvasNodeView> = {}): CanvasNodeView =>
  ({
    id: 'n1',
    kind: 'CARD',
    zIndex: 1000,
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    ...overrides
  }) as CanvasNodeView;

describe('hasCrossedThreshold', () => {
  it('is false below the threshold and true at or above it', () => {
    expect(hasCrossedThreshold(2, 2, 4)).toBe(false);
    expect(hasCrossedThreshold(3, 4, 4)).toBe(true);
    expect(hasCrossedThreshold(4, 0, 4)).toBe(true);
  });
});

describe('clientToCanvasPoint', () => {
  it('subtracts the stage rect, adds scroll and divides by zoom', () => {
    const point = clientToCanvasPoint(120, 80, { rectLeft: 20, rectTop: 10, scrollLeft: 100, scrollTop: 50, zoom: 2 });

    expect(point).toEqual({ x: (100 + (120 - 20)) / 2, y: (50 + (80 - 10)) / 2 });
  });

  it('clamps the result into the canvas bounds', () => {
    const point = clientToCanvasPoint(-9999, -9999, { rectLeft: 0, rectTop: 0, scrollLeft: 0, scrollTop: 0, zoom: 1 });

    expect(point).toEqual({ x: 0, y: 0 });
  });
});

describe('computeZoomScroll', () => {
  it('keeps the pointer anchor stable while zooming in', () => {
    const result = computeZoomScroll({
      currentZoom: 1,
      nextZoom: 2,
      clientWidth: 800,
      clientHeight: 600,
      scrollLeft: 0,
      scrollTop: 0,
      pointerOffsetX: 400,
      pointerOffsetY: 300
    });

    // canvas point under the pointer is (400, 300); after 2x zoom it should sit under the same offset.
    expect(result.scrollLeft).toBe(400);
    expect(result.scrollTop).toBe(300);
  });

  it('anchors on the viewport center when no pointer offset is given', () => {
    const withCenter = computeZoomScroll({
      currentZoom: 1,
      nextZoom: 2,
      clientWidth: 800,
      clientHeight: 600,
      scrollLeft: 0,
      scrollTop: 0
    });
    const withExplicitCenter = computeZoomScroll({
      currentZoom: 1,
      nextZoom: 2,
      clientWidth: 800,
      clientHeight: 600,
      scrollLeft: 0,
      scrollTop: 0,
      pointerOffsetX: 400,
      pointerOffsetY: 300
    });

    expect(withCenter).toEqual(withExplicitCenter);
  });

  it('never scrolls past the zoomed canvas bounds', () => {
    const result = computeZoomScroll({
      currentZoom: 1,
      nextZoom: 0.4,
      clientWidth: 800,
      clientHeight: 600,
      scrollLeft: 5000,
      scrollTop: 5000
    });

    expect(result.scrollLeft).toBeLessThanOrEqual(Math.max(0, canvasSize.width * 0.4 - 800));
    expect(result.scrollTop).toBeLessThanOrEqual(Math.max(0, canvasSize.height * 0.4 - 600));
    expect(result.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(result.scrollTop).toBeGreaterThanOrEqual(0);
  });
});

describe('applyNodeDragDelta', () => {
  const initialPositions = new Map<string, XYPosition>([
    ['a', { x: 100, y: 100 }],
    ['b', { x: 300, y: 50 }]
  ]);

  it('moves only the nodes in the move set, from their initial positions', () => {
    const nodes = [makeNode({ id: 'a', position: { x: 100, y: 100 } }), makeNode({ id: 'b', position: { x: 300, y: 50 } }), makeNode({ id: 'c', position: { x: 0, y: 0 } })];

    const moved = applyNodeDragDelta(nodes, new Set(['a', 'b']), initialPositions, { x: 100, y: 100 }, 40, 20);

    expect(moved.find((n) => n.id === 'a')?.position).toEqual({ x: 140, y: 120 });
    expect(moved.find((n) => n.id === 'b')?.position).toEqual({ x: 340, y: 70 });
    expect(moved.find((n) => n.id === 'c')?.position).toEqual({ x: 0, y: 0 });
  });

  it('clamps the group so the root never crosses the canvas origin', () => {
    const nodes = [makeNode({ id: 'a', position: { x: 100, y: 100 } })];

    const moved = applyNodeDragDelta(nodes, new Set(['a']), initialPositions, { x: 100, y: 100 }, -9999, -9999);

    expect(moved[0]?.position).toEqual({ x: 0, y: 0 });
  });
});

describe('computeResizedDimensions', () => {
  it('enforces the minimum size', () => {
    const size = computeResizedDimensions({ kind: 'CARD' }, { width: 200, height: 100 }, -9999, -9999);

    expect(size).toEqual({ width: 96, height: 72 });
  });

  it('grows freely for non-circle shapes', () => {
    const size = computeResizedDimensions({ kind: 'CARD' }, { width: 200, height: 100 }, 50, 30);

    expect(size).toEqual({ width: 250, height: 130 });
  });

  it('keeps a square aspect ratio for circle shapes', () => {
    const size = computeResizedDimensions({ kind: 'SHAPE', variant: 'CIRCLE' }, { width: 200, height: 100 }, 50, 30);

    expect(size.width).toBe(size.height);
    expect(size.width).toBe(250);
  });
});
