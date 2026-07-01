import { describe, expect, it } from 'vitest';
import { CanvasInteractionControllerService } from './canvas-interaction-controller.service';
import type { CanvasNodeView } from '../canvas.models';

const node = (overrides: Partial<CanvasNodeView>): CanvasNodeView => ({
  color: '#000000',
  height: 100,
  id: 'n',
  kind: 'NOTE',
  label: 'n',
  position: { x: 0, y: 0 },
  width: 100,
  zIndex: 1000,
  ...overrides
});

const descendants = (rootId: string, nodes: CanvasNodeView[]) =>
  nodes.filter((item) => item.id === rootId || item.parentId === rootId).map((item) => item.id);

describe('CanvasInteractionControllerService', () => {
  const service = new CanvasInteractionControllerService();

  describe('resolveNodeIdsToMove', () => {
    it('moves a single non-frame node', () => {
      const dragged = node({ id: 'a' });
      const result = service.resolveNodeIdsToMove(dragged, [dragged], new Set(), descendants);
      expect([...result]).toEqual(['a']);
    });

    it('moves a frame together with its descendants', () => {
      const frame = node({ id: 'f', kind: 'FRAME' });
      const child = node({ id: 'c', parentId: 'f' });
      const result = service.resolveNodeIdsToMove(frame, [frame, child], new Set(), descendants);
      expect(result).toEqual(new Set(['f', 'c']));
    });

    it('moves the whole multi-selection when the dragged node is part of it', () => {
      const a = node({ id: 'a' });
      const frame = node({ id: 'f', kind: 'FRAME' });
      const child = node({ id: 'c', parentId: 'f' });
      const selection = new Set(['a', 'f']);

      const result = service.resolveNodeIdsToMove(a, [a, frame, child], selection, descendants);
      expect(result).toEqual(new Set(['a', 'f', 'c']));
    });
  });

  describe('updateNodeParents', () => {
    it('returns the same nodes when no ids are provided', () => {
      const nodes = [node({ id: 'a' })];
      expect(service.updateNodeParents(nodes, [])).toBe(nodes);
    });

    it('assigns the containing frame as parent for moved nodes', () => {
      const frame = node({ id: 'f', kind: 'FRAME', position: { x: 0, y: 0 }, width: 400, height: 400 });
      const child = node({ id: 'c', position: { x: 100, y: 100 }, width: 50, height: 50 });

      const updated = service.updateNodeParents([frame, child], ['c']);
      expect(updated.find((item) => item.id === 'c')?.parentId).toBe('f');
    });
  });

  describe('computeMarqueeSelection', () => {
    const nodes = [
      node({ id: 'inside', position: { x: 10, y: 10 }, width: 20, height: 20 }),
      node({ id: 'outside', position: { x: 500, y: 500 }, width: 20, height: 20 })
    ];

    it('selects nodes intersecting the marquee bounds', () => {
      const result = service.computeMarqueeSelection(nodes, { x: 0, y: 0 }, { x: 100, y: 100 }, [], false);
      expect(result).toEqual(['inside']);
    });

    it('appends to the initial selection when requested', () => {
      const result = service.computeMarqueeSelection(nodes, { x: 0, y: 0 }, { x: 100, y: 100 }, ['outside'], true);
      expect(new Set(result)).toEqual(new Set(['outside', 'inside']));
    });
  });
});
