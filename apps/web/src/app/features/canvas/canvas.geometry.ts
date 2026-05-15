import type { CanvasNodeView, XYPosition } from './canvas.models';

type ConnectorHandlePosition = 'top' | 'right' | 'bottom' | 'left';

export const getNodeCenter = (node: CanvasNodeView): XYPosition => ({
  x: node.position.x + node.width / 2,
  y: node.position.y + node.height / 2
});

const toHandlePosition = (handle?: string): ConnectorHandlePosition | undefined => {
  if (!handle) return undefined;
  if (handle.includes('top')) return 'top';
  if (handle.includes('right')) return 'right';
  if (handle.includes('bottom')) return 'bottom';
  if (handle.includes('left')) return 'left';

  return undefined;
};

const toHandlePoint = (node: CanvasNodeView, handle: ConnectorHandlePosition): XYPosition => {
  const center = getNodeCenter(node);

  if (handle === 'top') return { x: center.x, y: node.position.y };
  if (handle === 'right') return { x: node.position.x + node.width, y: center.y };
  if (handle === 'bottom') return { x: center.x, y: node.position.y + node.height };
  return { x: node.position.x, y: center.y };
};

const toClosestHandle = (node: CanvasNodeView, point: XYPosition): ConnectorHandlePosition => {
  const center = getNodeCenter(node);
  const horizontalDistance = point.x - center.x;
  const verticalDistance = point.y - center.y;

  if (Math.abs(horizontalDistance) > Math.abs(verticalDistance)) {
    return horizontalDistance < 0 ? 'left' : 'right';
  }

  return verticalDistance < 0 ? 'top' : 'bottom';
};

const toNodeAnchorPoint = (node: CanvasNodeView, explicitHandle: string | undefined, oppositePoint: XYPosition) => {
  const handle = toHandlePosition(explicitHandle) ?? toClosestHandle(node, oppositePoint);
  return toHandlePoint(node, handle);
};

export const getConnectorEndpoints = (
  source: CanvasNodeView,
  target: CanvasNodeView,
  sourceHandle?: string,
  targetHandle?: string
) => {
  const sourceCenter = getNodeCenter(source);
  const targetCenter = getNodeCenter(target);
  const start = toNodeAnchorPoint(source, sourceHandle, targetCenter);
  const end = toNodeAnchorPoint(target, targetHandle, sourceCenter);

  return { end, start };
};

export const getConnectorPath = (
  source: CanvasNodeView,
  target: CanvasNodeView,
  type: string,
  sourceHandle?: string,
  targetHandle?: string
) => {
  const { start, end } = getConnectorEndpoints(source, target, sourceHandle, targetHandle);
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
