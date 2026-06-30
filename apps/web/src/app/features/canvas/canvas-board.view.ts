import { toSelectionBounds } from './canvas-board.geometry';
import type { CanvasNodeView, XYPosition } from './canvas.models';

export type MinimapNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isSelected: boolean;
};

export type MinimapViewport = { x: number; y: number; width: number; height: number };

export type StageViewport = { left: number; top: number; width: number; height: number };

export type MarqueeSelection = { origin: XYPosition; current: XYPosition };

export type MarqueeBoxStyle = { height: string; left: string; top: string; width: string };

export const toMinimapNodes = (
  nodes: CanvasNodeView[],
  scale: number,
  selectedNodeIds: ReadonlySet<string>
): MinimapNode[] =>
  nodes.map((node) => ({
    height: Math.max(2, node.height * scale),
    id: node.id,
    isSelected: selectedNodeIds.has(node.id),
    width: Math.max(2, node.width * scale),
    x: node.position.x * scale,
    y: node.position.y * scale
  }));

export const toMinimapViewport = (viewport: StageViewport, scale: number): MinimapViewport => ({
  height: Math.max(6, viewport.height * scale),
  width: Math.max(6, viewport.width * scale),
  x: viewport.left * scale,
  y: viewport.top * scale
});

export const toMarqueeBoxStyle = (selection: MarqueeSelection | null): MarqueeBoxStyle | null => {
  if (!selection) return null;

  const bounds = toSelectionBounds(selection.origin, selection.current);

  return {
    height: `${bounds.bottom - bounds.top}px`,
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.right - bounds.left}px`
  };
};
