import { canvasSize } from './canvas.constants';
import { clampNodePositionToCanvas, hasNodeOverlap, nodePlacementPadding } from './canvas-board.geometry';
import type { CanvasNodeView, XYPosition } from './canvas.models';

export type PlacementViewport = { height: number; left: number; top: number; width: number };

const nodePlacementStep = 48;
const nodePlacementSearchRings = Math.ceil(Math.max(canvasSize.width, canvasSize.height) / nodePlacementStep);

export const nodePlacementGridPositions = (
  node: Pick<CanvasNodeView, 'height' | 'width'>,
  area: PlacementViewport
): XYPosition[] => {
  const left = Math.max(0, Math.floor(area.left) + nodePlacementPadding);
  const top = Math.max(0, Math.floor(area.top) + nodePlacementPadding);
  const right = Math.min(canvasSize.width - node.width, Math.ceil(area.left + area.width) - node.width - nodePlacementPadding);
  const bottom = Math.min(canvasSize.height - node.height, Math.ceil(area.top + area.height) - node.height - nodePlacementPadding);

  if (right < left || bottom < top) return [];

  const positions: XYPosition[] = [];

  for (let y = top; y <= bottom; y += nodePlacementStep) {
    for (let x = left; x <= right; x += nodePlacementStep) {
      positions.push({ x, y });
    }
  }

  return positions;
};

export const nodePlacementRingOffsets = (ring: number): XYPosition[] => {
  const distance = ring * nodePlacementStep;
  const offsets: XYPosition[] = [];

  for (let x = -distance; x <= distance; x += nodePlacementStep) {
    offsets.push({ x, y: -distance }, { x, y: distance });
  }

  for (let y = -distance + nodePlacementStep; y <= distance - nodePlacementStep; y += nodePlacementStep) {
    offsets.push({ x: -distance, y }, { x: distance, y });
  }

  return offsets;
};

export const findAvailableNodePosition = (
  node: CanvasNodeView,
  nodes: CanvasNodeView[],
  viewport: PlacementViewport
): XYPosition => {
  const fallbackViewport = {
    height: Math.min(canvasSize.height, 720),
    left: Math.max(0, (canvasSize.width - 960) / 2),
    top: Math.max(0, (canvasSize.height - 720) / 2),
    width: Math.min(canvasSize.width, 960)
  };
  const placementViewport = viewport.width > 0 && viewport.height > 0 ? viewport : fallbackViewport;
  const origin = clampNodePositionToCanvas(node, {
    x: placementViewport.left + placementViewport.width / 2 - node.width / 2,
    y: placementViewport.top + placementViewport.height / 2 - node.height / 2
  });
  const candidates = [
    origin,
    ...nodePlacementGridPositions(node, placementViewport),
    ...nodePlacementGridPositions(node, {
      height: canvasSize.height,
      left: 0,
      top: 0,
      width: canvasSize.width
    })
  ];

  for (const position of candidates) {
    const candidate = { ...node, position };

    if (!hasNodeOverlap(candidate, nodes)) return position;
  }

  for (let ring = 0; ring <= nodePlacementSearchRings; ring += 1) {
    const offsets = ring === 0 ? [{ x: 0, y: 0 }] : nodePlacementRingOffsets(ring);

    for (const offset of offsets) {
      const position = clampNodePositionToCanvas(node, {
        x: origin.x + offset.x,
        y: origin.y + offset.y
      });
      const candidate = { ...node, position };

      if (!hasNodeOverlap(candidate, nodes)) return position;
    }
  }

  return origin;
};
