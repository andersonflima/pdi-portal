import { Injectable, computed, signal } from '@angular/core';
import type { CanvasEdgeView, CanvasHandlePosition, CanvasNodeView, XYPosition } from '../canvas.models';

@Injectable()
export class CanvasFacade {
  readonly activeConnector = signal<{
    sourceHandle: CanvasHandlePosition;
    sourceNodeId: string;
    sourcePoint: XYPosition;
    targetPoint: XYPosition;
  } | null>(null);
  readonly boardTitle = signal('');
  readonly connectorSourceId = signal<string | null>(null);
  readonly currentPlanId = signal<string | null>(null);
  readonly edges = signal<CanvasEdgeView[]>([]);
  readonly isPanning = signal(false);
  readonly isSaving = signal(false);
  readonly marqueeSelection = signal<{
    append: boolean;
    current: XYPosition;
    origin: XYPosition;
  } | null>(null);
  readonly nodes = signal<CanvasNodeView[]>([]);
  readonly selectedEdgeId = signal<string | null>(null);
  readonly selectedNodeId = signal<string | null>(null);
  readonly selectedNodeIds = signal<string[]>([]);
  readonly stageViewport = signal({ height: 0, left: 0, top: 0, width: 0 });
  readonly zoom = signal(1);

  readonly selectedEdge = computed(() => this.edges().find((edge) => edge.id === this.selectedEdgeId()) ?? null);
  readonly selectedNode = computed(() => this.nodes().find((node) => node.id === this.selectedNodeId()) ?? null);

  clearSelection() {
    this.selectedNodeIds.set([]);
    this.selectedNodeId.set(null);
    this.selectedEdgeId.set(null);
    this.connectorSourceId.set(null);
    this.activeConnector.set(null);
    this.marqueeSelection.set(null);
  }

  selectEdge(edgeId: string | null) {
    this.selectedEdgeId.set(edgeId);
    if (edgeId) {
      this.selectedNodeId.set(null);
      this.selectedNodeIds.set([]);
      this.connectorSourceId.set(null);
      this.activeConnector.set(null);
      this.marqueeSelection.set(null);
    }
  }

  selectSingleNode(nodeId: string) {
    this.selectedNodeIds.set([nodeId]);
    this.selectedNodeId.set(nodeId);
    this.selectedEdgeId.set(null);
  }

  setNodeSelection(nodeIds: string[], clearEdge = false) {
    this.selectedNodeIds.set(nodeIds);
    this.selectedNodeId.set(nodeIds.at(-1) ?? null);
    if (clearEdge) this.selectedEdgeId.set(null);
  }

  setActiveNode(nodeId: string | null) {
    this.selectedNodeId.set(nodeId);
  }

  toggleNodeSelection(nodeId: string) {
    const selectedIds = this.selectedNodeIds();
    const hasNode = selectedIds.includes(nodeId);
    const nextSelection = hasNode ? selectedIds.filter((id) => id !== nodeId) : [...selectedIds, nodeId];

    this.selectedNodeIds.set(nextSelection);
    this.selectedNodeId.set(nextSelection.at(-1) ?? null);
  }
}
