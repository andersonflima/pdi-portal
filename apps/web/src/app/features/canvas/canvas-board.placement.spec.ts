import { describe, expect, it } from 'vitest';
import { canvasSize } from './canvas.constants';
import type { CanvasNodeView } from './canvas.models';
import {
  findAvailableNodePosition,
  nodePlacementGridPositions,
  nodePlacementRingOffsets,
  type PlacementViewport
} from './canvas-board.placement';

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

const viewport: PlacementViewport = { left: 0, top: 0, width: 1200, height: 800 };

describe('nodePlacementGridPositions', () => {
  it('returns an empty grid when the area is smaller than the node', () => {
    const node = { width: 400, height: 300 };
    const tiny: PlacementViewport = { left: 0, top: 0, width: 100, height: 100 };

    expect(nodePlacementGridPositions(node, tiny)).toEqual([]);
  });

  it('keeps every grid position inside the canvas for the node', () => {
    const node = { width: 200, height: 100 };
    const positions = nodePlacementGridPositions(node, viewport);

    expect(positions.length).toBeGreaterThan(0);
    for (const position of positions) {
      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeGreaterThanOrEqual(0);
      expect(position.x).toBeLessThanOrEqual(canvasSize.width - node.width);
      expect(position.y).toBeLessThanOrEqual(canvasSize.height - node.height);
    }
  });
});

describe('nodePlacementRingOffsets', () => {
  it('returns only the origin offset for ring 0 via findAvailableNodePosition path', () => {
    expect(nodePlacementRingOffsets(1).length).toBeGreaterThan(0);
  });

  it('produces a symmetric square ring of offsets', () => {
    const offsets = nodePlacementRingOffsets(1);
    const distance = 48;

    for (const offset of offsets) {
      const onVerticalEdge = Math.abs(offset.x) === distance;
      const onHorizontalEdge = Math.abs(offset.y) === distance;

      expect(onVerticalEdge || onHorizontalEdge).toBe(true);
    }
  });
});

describe('findAvailableNodePosition', () => {
  it('centers the first node in the viewport when nothing overlaps', () => {
    const node = makeNode();

    const position = findAvailableNodePosition(node, [], viewport);

    expect(position).toEqual({
      x: viewport.left + viewport.width / 2 - node.width / 2,
      y: viewport.top + viewport.height / 2 - node.height / 2
    });
  });

  it('avoids overlapping an existing node', () => {
    const node = makeNode();
    const centered = {
      x: viewport.left + viewport.width / 2 - node.width / 2,
      y: viewport.top + viewport.height / 2 - node.height / 2
    };
    const blocker = makeNode({ id: 'blocker', position: centered });

    const position = findAvailableNodePosition(node, [blocker], viewport);

    expect(position).not.toEqual(centered);
    expect(findAvailableNodePosition(node, [blocker], viewport)).toEqual(position);
  });

  it('falls back to a default viewport when the given one is empty', () => {
    const node = makeNode();
    const empty: PlacementViewport = { left: 0, top: 0, width: 0, height: 0 };

    const position = findAvailableNodePosition(node, [], empty);

    const fallbackLeft = Math.max(0, (canvasSize.width - 960) / 2);
    const fallbackTop = Math.max(0, (canvasSize.height - 720) / 2);

    expect(position).toEqual({
      x: fallbackLeft + 960 / 2 - node.width / 2,
      y: fallbackTop + 720 / 2 - node.height / 2
    });
  });
});
