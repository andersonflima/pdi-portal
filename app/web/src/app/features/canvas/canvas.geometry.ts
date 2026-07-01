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

const resolveNodeHandle = (node: CanvasNodeView, explicitHandle: string | undefined, oppositePoint: XYPosition) =>
  toHandlePosition(explicitHandle) ?? toClosestHandle(node, oppositePoint);

const toHandleVector = (handle: ConnectorHandlePosition): XYPosition => {
  if (handle === 'top') return { x: 0, y: -1 };
  if (handle === 'right') return { x: 1, y: 0 };
  if (handle === 'bottom') return { x: 0, y: 1 };
  return { x: -1, y: 0 };
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
  targetHandle?: string,
  endpointOffsets?: { end?: number; start?: number }
) => {
  const sourceCenter = getNodeCenter(source);
  const targetCenter = getNodeCenter(target);
  const sourceResolvedHandle = resolveNodeHandle(source, sourceHandle, targetCenter);
  const targetResolvedHandle = resolveNodeHandle(target, targetHandle, sourceCenter);
  const sourceAnchor = toHandlePoint(source, sourceResolvedHandle);
  const targetAnchor = toHandlePoint(target, targetResolvedHandle);
  const sourceVector = toHandleVector(sourceResolvedHandle);
  const targetVector = toHandleVector(targetResolvedHandle);
  const startOffset = endpointOffsets?.start ?? 0;
  const endOffset = endpointOffsets?.end ?? 0;
  const start = {
    x: sourceAnchor.x + sourceVector.x * startOffset,
    y: sourceAnchor.y + sourceVector.y * startOffset
  };
  const end = {
    x: targetAnchor.x + targetVector.x * endOffset,
    y: targetAnchor.y + targetVector.y * endOffset
  };
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const curveOffset = Math.max(56, Math.min(220, Math.hypot(dx, dy) * 0.45));

  if (type === 'straight') return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  if (type === 'step') return `M ${start.x} ${start.y} L ${(start.x + end.x) / 2} ${start.y} L ${(start.x + end.x) / 2} ${end.y} L ${end.x} ${end.y}`;

  const controlStart = {
    x: start.x + sourceVector.x * curveOffset,
    y: start.y + sourceVector.y * curveOffset
  };
  const controlEnd = {
    x: end.x + targetVector.x * curveOffset,
    y: end.y + targetVector.y * curveOffset
  };

  return `M ${start.x} ${start.y} C ${controlStart.x} ${controlStart.y}, ${controlEnd.x} ${controlEnd.y}, ${end.x} ${end.y}`;
};

const toCubicPoint = (start: XYPosition, controlStart: XYPosition, controlEnd: XYPosition, end: XYPosition, t: number) => {
  const oneMinusT = 1 - t;
  const oneMinusTSquared = oneMinusT * oneMinusT;
  const oneMinusTCubed = oneMinusTSquared * oneMinusT;
  const tSquared = t * t;
  const tCubed = tSquared * t;

  return {
    x:
      oneMinusTCubed * start.x +
      3 * oneMinusTSquared * t * controlStart.x +
      3 * oneMinusT * tSquared * controlEnd.x +
      tCubed * end.x,
    y:
      oneMinusTCubed * start.y +
      3 * oneMinusTSquared * t * controlStart.y +
      3 * oneMinusT * tSquared * controlEnd.y +
      tCubed * end.y
  };
};

const toPointAlongPolyline = (points: XYPosition[], ratio: number) => {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };

  const clampedRatio = Math.min(1, Math.max(0, ratio));
  const segments = points
    .slice(0, -1)
    .map((point, index) => {
      const nextPoint = points[index + 1] ?? point;
      const length = Math.hypot(nextPoint.x - point.x, nextPoint.y - point.y);
      return { end: nextPoint, length, start: point };
    })
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) return points[0] ?? { x: 0, y: 0 };

  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  const targetLength = totalLength * clampedRatio;
  let coveredLength = 0;

  for (const segment of segments) {
    const segmentEndLength = coveredLength + segment.length;

    if (targetLength <= segmentEndLength) {
      const localRatio = (targetLength - coveredLength) / segment.length;

      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * localRatio,
        y: segment.start.y + (segment.end.y - segment.start.y) * localRatio
      };
    }

    coveredLength = segmentEndLength;
  }

  const lastSegment = segments[segments.length - 1];
  return lastSegment?.end ?? points[points.length - 1] ?? { x: 0, y: 0 };
};

export const getConnectorLabelPoint = (
  source: CanvasNodeView,
  target: CanvasNodeView,
  type: string,
  sourceHandle?: string,
  targetHandle?: string,
  endpointOffsets?: { end?: number; start?: number }
) => {
  const sourceCenter = getNodeCenter(source);
  const targetCenter = getNodeCenter(target);
  const sourceResolvedHandle = resolveNodeHandle(source, sourceHandle, targetCenter);
  const targetResolvedHandle = resolveNodeHandle(target, targetHandle, sourceCenter);
  const sourceAnchor = toHandlePoint(source, sourceResolvedHandle);
  const targetAnchor = toHandlePoint(target, targetResolvedHandle);
  const sourceVector = toHandleVector(sourceResolvedHandle);
  const targetVector = toHandleVector(targetResolvedHandle);
  const startOffset = endpointOffsets?.start ?? 0;
  const endOffset = endpointOffsets?.end ?? 0;
  const start = {
    x: sourceAnchor.x + sourceVector.x * startOffset,
    y: sourceAnchor.y + sourceVector.y * startOffset
  };
  const end = {
    x: targetAnchor.x + targetVector.x * endOffset,
    y: targetAnchor.y + targetVector.y * endOffset
  };

  if (type === 'straight') {
    return {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
  }

  if (type === 'step') {
    const middleX = (start.x + end.x) / 2;
    return toPointAlongPolyline(
      [
        start,
        { x: middleX, y: start.y },
        { x: middleX, y: end.y },
        end
      ],
      0.5
    );
  }

  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const curveOffset = Math.max(56, Math.min(220, Math.hypot(dx, dy) * 0.45));
  const controlStart = {
    x: start.x + sourceVector.x * curveOffset,
    y: start.y + sourceVector.y * curveOffset
  };
  const controlEnd = {
    x: end.x + targetVector.x * curveOffset,
    y: end.y + targetVector.y * curveOffset
  };

  return toCubicPoint(start, controlStart, controlEnd, end, 0.5);
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
