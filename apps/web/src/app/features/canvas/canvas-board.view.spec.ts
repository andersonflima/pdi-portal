import { describe, expect, it } from 'vitest';
import type { CanvasNodeView } from './canvas.models';
import { toMarqueeBoxStyle, toMinimapNodes, toMinimapViewport } from './canvas-board.view';

const makeNode = (overrides: Partial<CanvasNodeView> = {}): CanvasNodeView =>
  ({
    id: 'n1',
    kind: 'CARD',
    zIndex: 1000,
    position: { x: 100, y: 200 },
    width: 80,
    height: 40,
    ...overrides
  }) as CanvasNodeView;

describe('toMinimapNodes', () => {
  it('scales position and size and flags selection', () => {
    const node = makeNode({ id: 'a', position: { x: 100, y: 200 }, width: 80, height: 40 });

    const [mapped] = toMinimapNodes([node], 0.5, new Set(['a']));

    expect(mapped).toEqual({ id: 'a', x: 50, y: 100, width: 40, height: 20, isSelected: true });
  });

  it('clamps tiny nodes to a minimum visible size', () => {
    const node = makeNode({ width: 1, height: 1 });

    const mapped = toMinimapNodes([node], 0.01, new Set())[0];

    expect(mapped).toMatchObject({ width: 2, height: 2, isSelected: false });
  });
});

describe('toMinimapViewport', () => {
  it('scales the viewport rectangle', () => {
    const viewport = { left: 200, top: 100, width: 400, height: 300 };

    expect(toMinimapViewport(viewport, 0.5)).toEqual({ x: 100, y: 50, width: 200, height: 150 });
  });

  it('clamps the viewport to a minimum visible size', () => {
    const viewport = { left: 0, top: 0, width: 1, height: 1 };

    const mapped = toMinimapViewport(viewport, 0.01);

    expect(mapped.width).toBe(6);
    expect(mapped.height).toBe(6);
  });
});

describe('toMarqueeBoxStyle', () => {
  it('returns null when there is no active selection', () => {
    expect(toMarqueeBoxStyle(null)).toBeNull();
  });

  it('builds a normalized box regardless of drag direction', () => {
    const style = toMarqueeBoxStyle({ origin: { x: 100, y: 200 }, current: { x: 40, y: 80 } });

    expect(style).toEqual({ left: '40px', top: '80px', width: '60px', height: '120px' });
  });
});
