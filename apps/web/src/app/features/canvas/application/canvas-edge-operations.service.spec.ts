import { describe, expect, it } from 'vitest';
import { CanvasEdgeOperationsService } from './canvas-edge-operations.service';
import type { CanvasEdgeView, CanvasNodeView } from '../canvas.models';

const node = (id: string, x: number): CanvasNodeView => ({
  color: '#000000',
  height: 100,
  id,
  kind: 'NOTE',
  label: id,
  position: { x, y: 0 },
  width: 100,
  zIndex: 1000
});

const edge = (overrides: Partial<CanvasEdgeView>): CanvasEdgeView => ({
  id: 'e1',
  source: 'a',
  target: 'b',
  style: { color: '#64748b', lineStyle: 'solid', type: 'smoothstep' },
  ...overrides
});

const nodes = [node('a', 0), node('b', 300)];

describe('CanvasEdgeOperationsService', () => {
  const service = new CanvasEdgeOperationsService();

  describe('edgeHorizontalDirection', () => {
    it('detects left-to-right and right-to-left', () => {
      expect(service.edgeHorizontalDirection(edge({ source: 'a', target: 'b' }), nodes)).toBe('left-to-right');
      expect(service.edgeHorizontalDirection(edge({ source: 'b', target: 'a' }), nodes)).toBe('right-to-left');
    });

    it('defaults to left-to-right when a node is missing', () => {
      expect(service.edgeHorizontalDirection(edge({ source: 'x', target: 'y' }), nodes)).toBe('left-to-right');
    });
  });

  describe('createConnector', () => {
    it('adds a new connector', () => {
      const result = service.createConnector([], 'a', 'b');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ source: 'a', target: 'b' });
    });

    it('does not duplicate an existing same-direction connector', () => {
      const existing = [edge({ source: 'a', target: 'b' })];
      expect(service.createConnector(existing, 'a', 'b')).toBe(existing);
    });

    it('inherits style and label from a reverse connector', () => {
      const reverse = edge({ id: 'r', source: 'b', target: 'a', label: 'reverse', style: { color: '#ff0000', lineStyle: 'dashed', type: 'step' } });
      const result = service.createConnector([reverse], 'a', 'b');
      const created = result.find((item) => item.source === 'a' && item.target === 'b');

      expect(created?.label).toBe('reverse');
      expect(created?.style.color).toBe('#ff0000');
    });
  });

  describe('mutateSelectedEdge', () => {
    it('applies a style patch to the selected edge', () => {
      const selected = edge({ source: 'a', target: 'b' });
      const result = service.mutateSelectedEdge([selected], nodes, selected, { color: '#123456', lineStyle: 'dashed' });
      const patched = result.edges.find((item) => item.id === result.selectedEdgeId);

      expect(patched?.style.color).toBe('#123456');
      expect(patched?.style.lineStyle).toBe('dashed');
    });

    it('produces both directions when requested', () => {
      const selected = edge({ source: 'a', target: 'b' });
      const result = service.mutateSelectedEdge([selected], nodes, selected, { direction: 'both' });

      expect(result.edges).toHaveLength(2);
      const directions = result.edges.map((item) =>
        service.edgeHorizontalDirection(item, nodes)
      );
      expect(directions).toContain('left-to-right');
      expect(directions).toContain('right-to-left');
    });

    it('keeps only the requested single direction', () => {
      const selected = edge({ source: 'a', target: 'b' });
      const result = service.mutateSelectedEdge([selected], nodes, selected, { direction: 'right-to-left' });

      expect(result.edges).toHaveLength(1);
      expect(service.edgeHorizontalDirection(result.edges[0]!, nodes)).toBe('right-to-left');
    });

    it('preserves an existing reverse edge when no direction is given', () => {
      const current = edge({ id: 'c', source: 'a', target: 'b' });
      const reverse = edge({ id: 'r', source: 'b', target: 'a' });
      const result = service.mutateSelectedEdge([current, reverse], nodes, current, { label: 'hi' });

      expect(result.edges).toHaveLength(2);
      expect(result.selectedEdgeId).toBe('c');
    });
  });
});
