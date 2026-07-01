import { canvasSize } from './canvas.constants';
import { clampPointToCanvas } from './canvas-board.geometry';
import type { CanvasNodeView, XYPosition } from './canvas.models';

export const dragStartThreshold = 4;
export const marqueeStartThreshold = 6;
const minNodeWidth = 96;
const minNodeHeight = 72;

export type StageMetrics = {
  rectLeft: number;
  rectTop: number;
  scrollLeft: number;
  scrollTop: number;
  zoom: number;
};

export const hasCrossedThreshold = (deltaX: number, deltaY: number, threshold: number) =>
  Math.hypot(deltaX, deltaY) >= threshold;

export const clientToCanvasPoint = (clientX: number, clientY: number, stage: StageMetrics): XYPosition =>
  clampPointToCanvas({
    x: (stage.scrollLeft + (clientX - stage.rectLeft)) / stage.zoom,
    y: (stage.scrollTop + (clientY - stage.rectTop)) / stage.zoom
  });

export type ZoomScrollInput = {
  currentZoom: number;
  nextZoom: number;
  clientWidth: number;
  clientHeight: number;
  scrollLeft: number;
  scrollTop: number;
  /** Pointer offset relative to the stage's left/top edge; omit to anchor on the viewport center. */
  pointerOffsetX?: number;
  pointerOffsetY?: number;
};

export const computeZoomScroll = (input: ZoomScrollInput): { scrollLeft: number; scrollTop: number } => {
  const pointerOffsetX = input.pointerOffsetX ?? input.clientWidth / 2;
  const pointerOffsetY = input.pointerOffsetY ?? input.clientHeight / 2;
  const clampedPointerOffsetX = Math.min(input.clientWidth, Math.max(0, pointerOffsetX));
  const clampedPointerOffsetY = Math.min(input.clientHeight, Math.max(0, pointerOffsetY));
  const canvasX = (input.scrollLeft + clampedPointerOffsetX) / input.currentZoom;
  const canvasY = (input.scrollTop + clampedPointerOffsetY) / input.currentZoom;
  const maxScrollLeft = Math.max(0, canvasSize.width * input.nextZoom - input.clientWidth);
  const maxScrollTop = Math.max(0, canvasSize.height * input.nextZoom - input.clientHeight);

  return {
    scrollLeft: Math.min(maxScrollLeft, Math.max(0, canvasX * input.nextZoom - clampedPointerOffsetX)),
    scrollTop: Math.min(maxScrollTop, Math.max(0, canvasY * input.nextZoom - clampedPointerOffsetY))
  };
};

export const applyNodeDragDelta = (
  nodes: CanvasNodeView[],
  nodeIdsToMove: ReadonlySet<string>,
  initialPositions: ReadonlyMap<string, XYPosition>,
  rootInitialPosition: XYPosition,
  rawDeltaX: number,
  rawDeltaY: number
): CanvasNodeView[] => {
  const deltaX = Math.max(-rootInitialPosition.x, rawDeltaX);
  const deltaY = Math.max(-rootInitialPosition.y, rawDeltaY);

  return nodes.map((candidate) => {
    if (!nodeIdsToMove.has(candidate.id)) return candidate;

    const initialPosition = initialPositions.get(candidate.id) ?? candidate.position;

    return {
      ...candidate,
      position: {
        x: Math.max(0, initialPosition.x + deltaX),
        y: Math.max(0, initialPosition.y + deltaY)
      }
    };
  });
};

export const computeResizedDimensions = (
  node: Pick<CanvasNodeView, 'kind' | 'variant'>,
  initialSize: { width: number; height: number },
  zoomAdjustedDeltaX: number,
  zoomAdjustedDeltaY: number
): { width: number; height: number } => {
  const width = Math.max(minNodeWidth, initialSize.width + zoomAdjustedDeltaX);
  const height = Math.max(minNodeHeight, initialSize.height + zoomAdjustedDeltaY);
  const shouldKeepAspectRatio = node.kind === 'SHAPE' && node.variant === 'CIRCLE';
  const nextSize = shouldKeepAspectRatio ? Math.max(width, height) : null;

  return { width: nextSize ?? width, height: nextSize ?? height };
};
