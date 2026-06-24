import { describe, expect, it } from 'vitest';
import { CanvasFacade } from './canvas.facade';
import type { CanvasEdgeView, CanvasNodeView } from '../canvas.models';

const node = (id: string): CanvasNodeView => ({
  color: '#000000',
  height: 100,
  id,
  kind: 'NOTE',
  label: id,
  position: { x: 0, y: 0 },
  width: 100,
  zIndex: 1000
});

const edge = (id: string): CanvasEdgeView => ({
  id,
  source: 'a',
  target: 'b',
  style: { color: '#64748b', lineStyle: 'solid', type: 'smoothstep' }
});

describe('CanvasFacade', () => {
  it('derives the selected node and edge from ids', () => {
    const facade = new CanvasFacade();
    facade.nodes.set([node('n1'), node('n2')]);
    facade.edges.set([edge('e1')]);

    facade.selectSingleNode('n2');
    expect(facade.selectedNode()?.id).toBe('n2');

    facade.selectEdge('e1');
    expect(facade.selectedEdge()?.id).toBe('e1');
    expect(facade.selectedNodeId()).toBeNull();
  });

  it('clears every selection signal', () => {
    const facade = new CanvasFacade();
    facade.selectSingleNode('n1');
    facade.connectorSourceId.set('n1');

    facade.clearSelection();

    expect(facade.selectedNodeIds()).toEqual([]);
    expect(facade.selectedNodeId()).toBeNull();
    expect(facade.selectedEdgeId()).toBeNull();
    expect(facade.connectorSourceId()).toBeNull();
  });

  it('replaces the node selection and tracks the active node', () => {
    const facade = new CanvasFacade();
    facade.setNodeSelection(['n1', 'n2'], true);

    expect(facade.selectedNodeIds()).toEqual(['n1', 'n2']);
    expect(facade.selectedNodeId()).toBe('n2');
    expect(facade.selectedEdgeId()).toBeNull();
  });

  it('toggles node membership in the selection', () => {
    const facade = new CanvasFacade();
    facade.toggleNodeSelection('n1');
    facade.toggleNodeSelection('n2');
    expect(facade.selectedNodeIds()).toEqual(['n1', 'n2']);

    facade.toggleNodeSelection('n1');
    expect(facade.selectedNodeIds()).toEqual(['n2']);
    expect(facade.selectedNodeId()).toBe('n2');
  });

  it('sets the active node directly', () => {
    const facade = new CanvasFacade();
    facade.setActiveNode('n9');
    expect(facade.selectedNodeId()).toBe('n9');
  });
});
