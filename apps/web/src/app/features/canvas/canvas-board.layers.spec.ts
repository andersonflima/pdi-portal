import { describe, expect, it } from 'vitest';
import {
  bringNodeToFront,
  moveNodeBackward,
  moveNodeForward,
  nodeStackLevel,
  sendNodeToBack,
  sortNodesForRender
} from './canvas-board.layers';
import type { CanvasNodeView } from './canvas.models';

const makeNode = (overrides: Partial<CanvasNodeView> = {}): CanvasNodeView =>
  ({
    id: 'n1',
    kind: 'CARD',
    zIndex: 1000,
    position: { x: 0, y: 0 },
    width: 100,
    height: 80,
    ...overrides
  }) as CanvasNodeView;

const zById = (nodes: CanvasNodeView[]) => Object.fromEntries(nodes.map((node) => [node.id, node.zIndex]));

describe('nodeStackLevel', () => {
  it('keeps frames below the object layer base', () => {
    expect(nodeStackLevel(makeNode({ kind: 'FRAME', zIndex: 5 }))).toBe(5);
    expect(nodeStackLevel(makeNode({ kind: 'FRAME', zIndex: 5000 }))).toBe(999);
  });

  it('keeps objects at or above the object layer base', () => {
    expect(nodeStackLevel(makeNode({ kind: 'CARD', zIndex: 1 }))).toBe(1000);
    expect(nodeStackLevel(makeNode({ kind: 'CARD', zIndex: 1500 }))).toBe(1500);
  });
});

describe('sortNodesForRender', () => {
  it('renders frames before objects and orders by stack level', () => {
    const frame = makeNode({ id: 'frame', kind: 'FRAME', zIndex: 10 });
    const lower = makeNode({ id: 'lower', zIndex: 1000 });
    const higher = makeNode({ id: 'higher', zIndex: 1005 });

    const ordered = sortNodesForRender([higher, lower, frame]).map((node) => node.id);

    expect(ordered).toEqual(['frame', 'lower', 'higher']);
  });

  it('does not mutate the input array', () => {
    const nodes = [makeNode({ id: 'a', zIndex: 1002 }), makeNode({ id: 'b', zIndex: 1001 })];
    const snapshot = nodes.map((node) => node.id);

    sortNodesForRender(nodes);

    expect(nodes.map((node) => node.id)).toEqual(snapshot);
  });
});

describe('bringNodeToFront', () => {
  it('raises the selected object above every other object', () => {
    const nodes = [makeNode({ id: 'a', zIndex: 1000 }), makeNode({ id: 'b', zIndex: 1005 })];

    const result = bringNodeToFront(nodes, 'a');

    expect(result.changed).toBe(true);
    expect(zById(result.nodes)).toEqual({ a: 1006, b: 1005 });
  });

  it('still bumps a top object to highest + 1 (matches legacy behavior)', () => {
    const nodes = [makeNode({ id: 'a', zIndex: 1006 }), makeNode({ id: 'b', zIndex: 1005 })];

    const result = bringNodeToFront(nodes, 'a');

    expect(result.changed).toBe(true);
    expect(zById(result.nodes)).toEqual({ a: 1007, b: 1005 });
  });

  it('never reorders frames', () => {
    const nodes = [makeNode({ id: 'frame', kind: 'FRAME', zIndex: 5 })];

    const result = bringNodeToFront(nodes, 'frame');

    expect(result.changed).toBe(false);
    expect(result.nodes).toBe(nodes);
  });

  it('is a no-op for an unknown node', () => {
    const nodes = [makeNode({ id: 'a' })];

    expect(bringNodeToFront(nodes, 'ghost').changed).toBe(false);
  });
});

describe('sendNodeToBack', () => {
  it('drops the selected object below every other object', () => {
    const nodes = [makeNode({ id: 'a', zIndex: 1005 }), makeNode({ id: 'b', zIndex: 1002 })];

    const result = sendNodeToBack(nodes, 'a');

    expect(result.changed).toBe(true);
    expect(zById(result.nodes)).toEqual({ a: 1001, b: 1002 });
  });

  it('never drops below the object layer base', () => {
    const nodes = [makeNode({ id: 'a', zIndex: 1000 }), makeNode({ id: 'b', zIndex: 1001 })];

    const result = sendNodeToBack(nodes, 'a');

    expect(result.changed).toBe(false);
    expect(result.nodes).toBe(nodes);
  });
});

describe('moveNodeForward / moveNodeBackward', () => {
  it('swaps z-index with the next content node', () => {
    const nodes = [makeNode({ id: 'a', zIndex: 1000 }), makeNode({ id: 'b', zIndex: 1001 })];

    const result = moveNodeForward(nodes, 'a');

    expect(result.changed).toBe(true);
    expect(zById(result.nodes)).toEqual({ a: 1001, b: 1000 });
  });

  it('swaps z-index with the previous content node', () => {
    const nodes = [makeNode({ id: 'a', zIndex: 1000 }), makeNode({ id: 'b', zIndex: 1001 })];

    const result = moveNodeBackward(nodes, 'b');

    expect(result.changed).toBe(true);
    expect(zById(result.nodes)).toEqual({ a: 1001, b: 1000 });
  });

  it('is a no-op at the top edge for forward', () => {
    const nodes = [makeNode({ id: 'a', zIndex: 1000 }), makeNode({ id: 'b', zIndex: 1001 })];

    const result = moveNodeForward(nodes, 'b');

    expect(result.changed).toBe(false);
    expect(result.nodes).toBe(nodes);
  });

  it('is a no-op at the bottom edge for backward', () => {
    const nodes = [makeNode({ id: 'a', zIndex: 1000 }), makeNode({ id: 'b', zIndex: 1001 })];

    const result = moveNodeBackward(nodes, 'a');

    expect(result.changed).toBe(false);
    expect(result.nodes).toBe(nodes);
  });

  it('ignores frames when computing neighbors', () => {
    const nodes = [
      makeNode({ id: 'frame', kind: 'FRAME', zIndex: 5 }),
      makeNode({ id: 'a', zIndex: 1000 }),
      makeNode({ id: 'b', zIndex: 1001 })
    ];

    const result = moveNodeForward(nodes, 'a');

    expect(zById(result.nodes)).toEqual({ frame: 5, a: 1001, b: 1000 });
  });
});
