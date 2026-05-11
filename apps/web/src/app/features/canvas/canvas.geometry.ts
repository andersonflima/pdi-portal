import type { CanvasNodeView, XYPosition } from './canvas.models';

export const getNodeCenter = (node: CanvasNodeView): XYPosition => ({
  x: node.position.x + node.width / 2,
  y: node.position.y + node.height / 2
});

export const getConnectorPath = (source: CanvasNodeView, target: CanvasNodeView, type: string) => {
  const start = getNodeCenter(source);
  const end = getNodeCenter(target);
  const curveOffset = Math.max(80, Math.abs(end.x - start.x) / 2);

  if (type === 'straight') return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  if (type === 'step') return `M ${start.x} ${start.y} L ${(start.x + end.x) / 2} ${start.y} L ${(start.x + end.x) / 2} ${end.y} L ${end.x} ${end.y}`;

  return `M ${start.x} ${start.y} C ${start.x + curveOffset} ${start.y}, ${end.x - curveOffset} ${end.y}, ${end.x} ${end.y}`;
};

export const isPointInsideNode = (point: XYPosition, node: CanvasNodeView) =>
  point.x >= node.position.x &&
  point.x <= node.position.x + node.width &&
  point.y >= node.position.y &&
  point.y <= node.position.y + node.height;

export const findContainingFrame = (node: CanvasNodeView, nodes: CanvasNodeView[]) => {
  const nodeCenter = getNodeCenter(node);

  return nodes
    .filter((candidate) => candidate.kind === 'FRAME' && candidate.id !== node.id)
    .find((frameNode) => isPointInsideNode(nodeCenter, frameNode));
};
