import type { CanvasEdgeView } from './canvas.models';

const findReverseEdge = (edge: Pick<CanvasEdgeView, 'source' | 'target'>, edges: CanvasEdgeView[]) =>
  edges.find((candidate) => candidate.source === edge.target && candidate.target === edge.source);

/**
 * For a bidirectional edge pair only one label is drawn; the edge with the
 * lexicographically smaller id wins so the choice is stable across renders.
 */
export const shouldRenderEdgeLabel = (edge: CanvasEdgeView, edges: CanvasEdgeView[]) => {
  const reverseEdge = findReverseEdge(edge, edges);

  if (!reverseEdge) return true;

  return edge.id < reverseEdge.id;
};

/** Removes the selected edge and its reverse counterpart (if any). */
export const removeEdgePair = (edges: CanvasEdgeView[], selectedEdgeId: string): CanvasEdgeView[] => {
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const reverseEdgeId = selectedEdge ? findReverseEdge(selectedEdge, edges)?.id : undefined;

  return edges.filter((edge) => edge.id !== selectedEdgeId && edge.id !== reverseEdgeId);
};
