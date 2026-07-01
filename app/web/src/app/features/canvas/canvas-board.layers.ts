import { frameLayerMax, objectLayerBase } from './canvas-board.geometry';
import type { CanvasNodeView } from './canvas.models';

export type NodeOrderResult = { changed: boolean; nodes: CanvasNodeView[] };

const unchanged = (nodes: CanvasNodeView[]): NodeOrderResult => ({ changed: false, nodes });

export const nodeStackLevel = (node: CanvasNodeView) =>
  node.kind === 'FRAME' ? Math.min(frameLayerMax, node.zIndex) : Math.max(objectLayerBase, node.zIndex);

export const sortNodesForRender = (nodes: CanvasNodeView[]) =>
  [...nodes].sort((leftNode, rightNode) => {
    const leftLayer = nodeStackLevel(leftNode);
    const rightLayer = nodeStackLevel(rightNode);

    if (leftLayer !== rightLayer) {
      return leftLayer - rightLayer;
    }

    if (leftNode.kind === 'FRAME' && rightNode.kind !== 'FRAME') return -1;
    if (leftNode.kind !== 'FRAME' && rightNode.kind === 'FRAME') return 1;

    return 0;
  });

export const bringNodeToFront = (nodes: CanvasNodeView[], selectedNodeId: string): NodeOrderResult => {
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);

  if (!selectedNode || selectedNode.kind === 'FRAME') return unchanged(nodes);

  const highestObjectLayer = nodes
    .filter((node) => node.kind !== 'FRAME')
    .reduce((highest, node) => Math.max(highest, node.zIndex), objectLayerBase - 1);
  const nextZIndex = highestObjectLayer + 1;

  if (selectedNode.zIndex === nextZIndex) return unchanged(nodes);

  return {
    changed: true,
    nodes: nodes.map((node) => (node.id === selectedNodeId ? { ...node, zIndex: nextZIndex } : node))
  };
};

export const sendNodeToBack = (nodes: CanvasNodeView[], selectedNodeId: string): NodeOrderResult => {
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);

  if (!selectedNode || selectedNode.kind === 'FRAME') return unchanged(nodes);

  const lowestObjectLayer = nodes
    .filter((node) => node.kind !== 'FRAME')
    .reduce((lowest, node) => Math.min(lowest, node.zIndex), Number.POSITIVE_INFINITY);
  const nextZIndex = Math.max(objectLayerBase, lowestObjectLayer - 1);

  if (selectedNode.zIndex === nextZIndex) return unchanged(nodes);

  return {
    changed: true,
    nodes: nodes.map((node) => (node.id === selectedNodeId ? { ...node, zIndex: nextZIndex } : node))
  };
};

const swapAdjacentContentLayer = (
  nodes: CanvasNodeView[],
  selectedNodeId: string,
  neighborOffset: 1 | -1
): NodeOrderResult => {
  const contentNodes = [...nodes]
    .filter((node) => node.kind !== 'FRAME')
    .sort((leftNode, rightNode) => leftNode.zIndex - rightNode.zIndex);
  const selectedIndex = contentNodes.findIndex((node) => node.id === selectedNodeId);

  if (selectedIndex === -1) return unchanged(nodes);

  const neighborIndex = selectedIndex + neighborOffset;

  if (neighborIndex < 0 || neighborIndex > contentNodes.length - 1) return unchanged(nodes);

  const selectedNode = contentNodes[selectedIndex];
  const neighborNode = contentNodes[neighborIndex];

  if (!selectedNode || !neighborNode) return unchanged(nodes);

  return {
    changed: true,
    nodes: nodes.map((node) => {
      if (node.id === selectedNode.id) return { ...node, zIndex: neighborNode.zIndex };
      if (node.id === neighborNode.id) return { ...node, zIndex: selectedNode.zIndex };
      return node;
    })
  };
};

export const moveNodeForward = (nodes: CanvasNodeView[], selectedNodeId: string): NodeOrderResult =>
  swapAdjacentContentLayer(nodes, selectedNodeId, 1);

export const moveNodeBackward = (nodes: CanvasNodeView[], selectedNodeId: string): NodeOrderResult =>
  swapAdjacentContentLayer(nodes, selectedNodeId, -1);
