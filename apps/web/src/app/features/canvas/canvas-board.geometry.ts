import { canvasSize } from './canvas.constants';
import { getNodeCenter, isPointInsideNode } from './canvas.geometry';
import type { CanvasHandlePosition, CanvasNodeView, XYPosition } from './canvas.models';

export const minZoom = 0.4;
export const maxZoom = 1.6;
export const wheelLineHeightPx = 16;
export const frameLayerMax = 999;
export const objectLayerBase = 1000;
export const connectorHandleHitRadius = 14;
export const nodePlacementPadding = 28;

export const roundZoom = (value: number) => Math.round(value * 100) / 100;

export const clampZoom = (value: number) => Math.min(maxZoom, Math.max(minZoom, roundZoom(value)));

export const normalizeWheelDeltaY = (event: WheelEvent, viewportHeight: number) => {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * wheelLineHeightPx;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * viewportHeight;
  }

  return event.deltaY;
};

export const clampPointToCanvas = (point: XYPosition): XYPosition => ({
  x: Math.min(canvasSize.width, Math.max(0, point.x)),
  y: Math.min(canvasSize.height, Math.max(0, point.y))
});

export const clampNodePositionToCanvas = (
  node: Pick<CanvasNodeView, 'height' | 'width'>,
  point: XYPosition
): XYPosition => ({
  x: Math.min(Math.max(0, canvasSize.width - node.width), Math.max(0, point.x)),
  y: Math.min(Math.max(0, canvasSize.height - node.height), Math.max(0, point.y))
});

export const hasNodeOverlap = (candidate: CanvasNodeView, nodes: CanvasNodeView[]) =>
  nodes.some((node) => {
    const candidateLeft = candidate.position.x - nodePlacementPadding;
    const candidateTop = candidate.position.y - nodePlacementPadding;
    const candidateRight = candidate.position.x + candidate.width + nodePlacementPadding;
    const candidateBottom = candidate.position.y + candidate.height + nodePlacementPadding;
    const nodeLeft = node.position.x;
    const nodeTop = node.position.y;
    const nodeRight = node.position.x + node.width;
    const nodeBottom = node.position.y + node.height;

    return !(candidateRight <= nodeLeft || candidateLeft >= nodeRight || candidateBottom <= nodeTop || candidateTop >= nodeBottom);
  });

export const toSelectionBounds = (first: XYPosition, second: XYPosition) => ({
  bottom: Math.max(first.y, second.y),
  left: Math.min(first.x, second.x),
  right: Math.max(first.x, second.x),
  top: Math.min(first.y, second.y)
});

export const toConnectorPath = (source: XYPosition, target: XYPosition) => {
  const curveOffset = Math.max(80, Math.abs(target.x - source.x) / 2);

  return `M ${source.x} ${source.y} C ${source.x + curveOffset} ${source.y}, ${target.x - curveOffset} ${target.y}, ${target.x} ${target.y}`;
};

export const toConnectorHandlePoint = (node: CanvasNodeView, handle: CanvasHandlePosition): XYPosition => {
  const center = getNodeCenter(node);

  if (handle === 'top') return { x: center.x, y: node.position.y };
  if (handle === 'right') return { x: node.position.x + node.width, y: center.y };
  if (handle === 'bottom') return { x: center.x, y: node.position.y + node.height };

  return { x: node.position.x, y: center.y };
};

export const toClosestHandle = (node: CanvasNodeView, point: XYPosition): CanvasHandlePosition => {
  const center = getNodeCenter(node);
  const horizontalDistance = point.x - center.x;
  const verticalDistance = point.y - center.y;

  if (Math.abs(horizontalDistance) > Math.abs(verticalDistance)) {
    return horizontalDistance < 0 ? 'left' : 'right';
  }

  return verticalDistance < 0 ? 'top' : 'bottom';
};

export const toOppositeHandle = (handle: CanvasHandlePosition): CanvasHandlePosition => {
  if (handle === 'top') return 'bottom';
  if (handle === 'right') return 'left';
  if (handle === 'bottom') return 'top';
  return 'right';
};

export const findDescendantNodeIds = (rootId: string, nodes: CanvasNodeView[]) => {
  const childrenByParent = nodes.reduce((accumulator, node) => {
    if (!node.parentId) return accumulator;

    return new Map(accumulator).set(node.parentId, [...(accumulator.get(node.parentId) ?? []), node.id]);
  }, new Map<string, string[]>());

  const collect = (queue: string[], collected: Set<string>): Set<string> => {
    if (queue.length === 0) return collected;

    const head = queue[0];
    const tail = queue.slice(1);

    if (!head) return collected;

    if (collected.has(head)) return collect(tail, collected);

    const children = childrenByParent.get(head) ?? [];

    return collect([...tail, ...children], new Set(collected).add(head));
  };

  return Array.from(collect([rootId], new Set<string>()));
};

const toNodeStackLayer = (node: CanvasNodeView) =>
  node.kind === 'FRAME' ? Math.min(frameLayerMax, node.zIndex) : Math.max(objectLayerBase, node.zIndex);

const byTopMostStackLayer = (leftNode: CanvasNodeView, rightNode: CanvasNodeView) =>
  toNodeStackLayer(rightNode) - toNodeStackLayer(leftNode);

export const findTopNodeAtPoint = (point: XYPosition, nodes: CanvasNodeView[], excludedNodeId: string) =>
  [...nodes]
    .filter((node) => node.id !== excludedNodeId)
    .sort(byTopMostStackLayer)
    .find((node) => isPointInsideNode(point, node));

export const findNodeHandleAtPoint = (point: XYPosition, nodes: CanvasNodeView[], excludedNodeId: string) => {
  const sortedNodes = [...nodes].filter((node) => node.id !== excludedNodeId).sort(byTopMostStackLayer);

  for (const node of sortedNodes) {
    const handles: CanvasHandlePosition[] = ['top', 'right', 'bottom', 'left'];

    for (const handle of handles) {
      const handlePoint = toConnectorHandlePoint(node, handle);
      const distance = Math.hypot(point.x - handlePoint.x, point.y - handlePoint.y);

      if (distance <= connectorHandleHitRadius) {
        return { handle, node };
      }
    }
  }

  return null;
};
