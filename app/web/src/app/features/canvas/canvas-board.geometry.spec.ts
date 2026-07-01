import { describe, expect, it } from 'vitest';
import { canvasSize } from './canvas.constants';
import type { CanvasNodeView, XYPosition } from './canvas.models';
import {
  clampNodePositionToCanvas,
  clampPointToCanvas,
  clampZoom,
  findDescendantNodeIds,
  findNodeHandleAtPoint,
  findTopNodeAtPoint,
  hasNodeOverlap,
  maxZoom,
  minZoom,
  normalizeWheelDeltaY,
  roundZoom,
  toClosestHandle,
  toConnectorHandlePoint,
  toConnectorPath,
  toOppositeHandle,
  toSelectionBounds
} from './canvas-board.geometry';

const makeNode = (overrides: Partial<CanvasNodeView> = {}): CanvasNodeView =>
  ({
    id: 'n1',
    kind: 'CARD',
    zIndex: 1000,
    parentId: undefined,
    position: { x: 0, y: 0 },
    width: 100,
    height: 80,
    ...overrides
  }) as CanvasNodeView;

const makeWheel = (deltaY: number, deltaMode: number): WheelEvent =>
  ({ deltaMode, deltaY }) as WheelEvent;

describe('roundZoom / clampZoom', () => {
  it('rounds zoom to two decimal places', () => {
    expect(roundZoom(1.234)).toBe(1.23);
    expect(roundZoom(0.555)).toBe(0.56);
  });

  it('clamps into the [minZoom, maxZoom] range', () => {
    expect(clampZoom(0.1)).toBe(minZoom);
    expect(clampZoom(5)).toBe(maxZoom);
    expect(clampZoom(1)).toBe(1);
  });
});

describe('normalizeWheelDeltaY', () => {
  it('scales line deltas by the line height', () => {
    expect(normalizeWheelDeltaY(makeWheel(3, WheelEvent.DOM_DELTA_LINE), 1000)).toBe(48);
  });

  it('scales page deltas by the viewport height', () => {
    expect(normalizeWheelDeltaY(makeWheel(2, WheelEvent.DOM_DELTA_PAGE), 700)).toBe(1400);
  });

  it('returns pixel deltas unchanged', () => {
    expect(normalizeWheelDeltaY(makeWheel(42, WheelEvent.DOM_DELTA_PIXEL), 700)).toBe(42);
  });
});

describe('clampPointToCanvas', () => {
  it('keeps points within the canvas bounds', () => {
    expect(clampPointToCanvas({ x: -50, y: -10 })).toEqual({ x: 0, y: 0 });
    expect(clampPointToCanvas({ x: 999999, y: 999999 })).toEqual({
      x: canvasSize.width,
      y: canvasSize.height
    });
    expect(clampPointToCanvas({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  });
});

describe('clampNodePositionToCanvas', () => {
  it('keeps the node fully inside the canvas', () => {
    const node = { width: 200, height: 100 };

    expect(clampNodePositionToCanvas(node, { x: -10, y: -10 })).toEqual({ x: 0, y: 0 });
    expect(clampNodePositionToCanvas(node, { x: 999999, y: 999999 })).toEqual({
      x: canvasSize.width - node.width,
      y: canvasSize.height - node.height
    });
  });

  it('never produces a negative anchor when the node is wider than the canvas', () => {
    const node = { width: canvasSize.width + 500, height: canvasSize.height + 500 };

    expect(clampNodePositionToCanvas(node, { x: 100, y: 100 })).toEqual({ x: 0, y: 0 });
  });
});

describe('hasNodeOverlap', () => {
  it('detects overlap within the placement padding', () => {
    const candidate = makeNode({ position: { x: 200, y: 200 }, width: 100, height: 80 });
    const near = makeNode({ id: 'near', position: { x: 250, y: 220 } });

    expect(hasNodeOverlap(candidate, [near])).toBe(true);
  });

  it('returns false when nodes are clearly apart', () => {
    const candidate = makeNode({ position: { x: 0, y: 0 } });
    const far = makeNode({ id: 'far', position: { x: 2000, y: 2000 } });

    expect(hasNodeOverlap(candidate, [far])).toBe(false);
  });

  it('returns false for an empty node list', () => {
    expect(hasNodeOverlap(makeNode(), [])).toBe(false);
  });
});

describe('toSelectionBounds', () => {
  it('normalizes two corners regardless of order', () => {
    const forward = toSelectionBounds({ x: 10, y: 20 }, { x: 100, y: 200 });
    const reversed = toSelectionBounds({ x: 100, y: 200 }, { x: 10, y: 20 });

    expect(forward).toEqual({ left: 10, top: 20, right: 100, bottom: 200 });
    expect(reversed).toEqual(forward);
  });
});

describe('toConnectorPath', () => {
  it('uses a minimum curve offset of 80', () => {
    expect(toConnectorPath({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(
      'M 0 0 C 80 0, -70 0, 10 0'
    );
  });

  it('scales the curve offset with horizontal distance', () => {
    expect(toConnectorPath({ x: 0, y: 0 }, { x: 400, y: 100 })).toBe(
      'M 0 0 C 200 0, 200 100, 400 100'
    );
  });
});

describe('toConnectorHandlePoint', () => {
  const node = makeNode({ position: { x: 100, y: 100 }, width: 200, height: 100 });

  it('returns the midpoint of each edge', () => {
    expect(toConnectorHandlePoint(node, 'top')).toEqual({ x: 200, y: 100 });
    expect(toConnectorHandlePoint(node, 'right')).toEqual({ x: 300, y: 150 });
    expect(toConnectorHandlePoint(node, 'bottom')).toEqual({ x: 200, y: 200 });
    expect(toConnectorHandlePoint(node, 'left')).toEqual({ x: 100, y: 150 });
  });
});

describe('toClosestHandle', () => {
  const node = makeNode({ position: { x: 0, y: 0 }, width: 100, height: 100 });

  it('picks the handle nearest to the point', () => {
    expect(toClosestHandle(node, { x: 200, y: 50 })).toBe('right');
    expect(toClosestHandle(node, { x: -200, y: 50 })).toBe('left');
    expect(toClosestHandle(node, { x: 50, y: -200 })).toBe('top');
    expect(toClosestHandle(node, { x: 50, y: 200 })).toBe('bottom');
  });
});

describe('toOppositeHandle', () => {
  it('maps each handle to its opposite', () => {
    expect(toOppositeHandle('top')).toBe('bottom');
    expect(toOppositeHandle('bottom')).toBe('top');
    expect(toOppositeHandle('left')).toBe('right');
    expect(toOppositeHandle('right')).toBe('left');
  });
});

describe('findDescendantNodeIds', () => {
  it('collects the root and all transitive children', () => {
    const nodes = [
      makeNode({ id: 'root' }),
      makeNode({ id: 'child-a', parentId: 'root' }),
      makeNode({ id: 'child-b', parentId: 'root' }),
      makeNode({ id: 'grandchild', parentId: 'child-a' }),
      makeNode({ id: 'unrelated' })
    ];

    const result = findDescendantNodeIds('root', nodes);

    expect(result).toContain('root');
    expect(result).toContain('child-a');
    expect(result).toContain('child-b');
    expect(result).toContain('grandchild');
    expect(result).not.toContain('unrelated');
    expect(result).toHaveLength(4);
  });

  it('does not loop forever on a parent cycle', () => {
    const nodes = [
      makeNode({ id: 'a', parentId: 'b' }),
      makeNode({ id: 'b', parentId: 'a' })
    ];

    const result = findDescendantNodeIds('a', nodes);

    expect(new Set(result)).toEqual(new Set(['a', 'b']));
  });

  it('returns just the root when it has no children', () => {
    expect(findDescendantNodeIds('lonely', [makeNode({ id: 'lonely' })])).toEqual(['lonely']);
  });
});

describe('findTopNodeAtPoint', () => {
  const point: XYPosition = { x: 50, y: 50 };

  it('prefers the object node over an overlapping frame', () => {
    const frame = makeNode({ id: 'frame', kind: 'FRAME', zIndex: 10, position: { x: 0, y: 0 }, width: 100, height: 100 });
    const card = makeNode({ id: 'card', kind: 'CARD', zIndex: 1001, position: { x: 0, y: 0 }, width: 100, height: 100 });

    expect(findTopNodeAtPoint(point, [frame, card], 'none')?.id).toBe('card');
  });

  it('ignores the excluded node', () => {
    const card = makeNode({ id: 'card', position: { x: 0, y: 0 }, width: 100, height: 100 });

    expect(findTopNodeAtPoint(point, [card], 'card')).toBeUndefined();
  });

  it('returns undefined when the point hits nothing', () => {
    const card = makeNode({ id: 'card', position: { x: 500, y: 500 }, width: 100, height: 100 });

    expect(findTopNodeAtPoint(point, [card], 'none')).toBeUndefined();
  });
});

describe('findNodeHandleAtPoint', () => {
  const node = makeNode({ id: 'card', position: { x: 100, y: 100 }, width: 200, height: 100 });

  it('returns the handle within the hit radius', () => {
    const hit = findNodeHandleAtPoint({ x: 200, y: 102 }, [node], 'none');

    expect(hit?.handle).toBe('top');
    expect(hit?.node.id).toBe('card');
  });

  it('returns null when no handle is close enough', () => {
    expect(findNodeHandleAtPoint({ x: 0, y: 0 }, [node], 'none')).toBeNull();
  });

  it('ignores the excluded node', () => {
    expect(findNodeHandleAtPoint({ x: 200, y: 100 }, [node], 'card')).toBeNull();
  });
});
