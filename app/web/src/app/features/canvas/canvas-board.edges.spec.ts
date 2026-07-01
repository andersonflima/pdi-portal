import { describe, expect, it } from 'vitest';
import type { CanvasEdgeView } from './canvas.models';
import { removeEdgePair, shouldRenderEdgeLabel } from './canvas-board.edges';

const makeEdge = (id: string, source: string, target: string): CanvasEdgeView =>
  ({ id, source, target }) as CanvasEdgeView;

describe('shouldRenderEdgeLabel', () => {
  it('renders the label for a one-directional edge', () => {
    const edge = makeEdge('e1', 'a', 'b');

    expect(shouldRenderEdgeLabel(edge, [edge])).toBe(true);
  });

  it('renders the label only on the lower-id edge of a bidirectional pair', () => {
    const forward = makeEdge('e1', 'a', 'b');
    const reverse = makeEdge('e2', 'b', 'a');
    const edges = [forward, reverse];

    expect(shouldRenderEdgeLabel(forward, edges)).toBe(true);
    expect(shouldRenderEdgeLabel(reverse, edges)).toBe(false);
  });
});

describe('removeEdgePair', () => {
  it('removes a single selected edge', () => {
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'c')];

    expect(removeEdgePair(edges, 'e1').map((edge) => edge.id)).toEqual(['e2']);
  });

  it('also removes the reverse edge of a bidirectional pair', () => {
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'a'), makeEdge('e3', 'c', 'd')];

    expect(removeEdgePair(edges, 'e1').map((edge) => edge.id)).toEqual(['e3']);
  });

  it('returns the edges unchanged when the id is unknown', () => {
    const edges = [makeEdge('e1', 'a', 'b')];

    expect(removeEdgePair(edges, 'ghost').map((edge) => edge.id)).toEqual(['e1']);
  });
});
