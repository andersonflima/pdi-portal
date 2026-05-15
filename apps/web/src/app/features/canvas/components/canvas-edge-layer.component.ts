import { Component, input, output } from '@angular/core';
import { canvasSize } from '../canvas.constants';
import { getConnectorPath } from '../canvas.geometry';
import type { CanvasEdgeView, CanvasNodeView } from '../canvas.models';

@Component({
  selector: 'app-canvas-edge-layer',
  standalone: true,
  templateUrl: './canvas-edge-layer.component.html',
  styleUrl: './canvas-edge-layer.component.css'
})
export class CanvasEdgeLayerComponent {
  readonly nodes = input.required<CanvasNodeView[]>();
  readonly edges = input.required<CanvasEdgeView[]>();
  readonly selectedEdgeId = input<string | null>(null);
  readonly selectEdge = output<string>();

  protected readonly canvasSize = canvasSize;
  protected readonly markerColors = () => Array.from(new Set(this.edges().map((edge) => edge.style.color)));
  protected readonly markerIdForColor = (color: string) => `edge-arrow-head-${encodeURIComponent(color).replaceAll('%', '_')}`;
  protected readonly markerIdForEdge = (edge: CanvasEdgeView) => this.markerIdForColor(edge.style.color);

  protected readonly findNode = (nodeId: string) => this.nodes().find((node) => node.id === nodeId);

  protected readonly edgePath = (edge: CanvasEdgeView) => {
    const source = this.findNode(edge.source);
    const target = this.findNode(edge.target);

    return source && target
      ? getConnectorPath(source, target, edge.style.type, edge.sourceHandle, edge.targetHandle)
      : '';
  };

  protected readonly reverseEdge = (edge: CanvasEdgeView) =>
    this.edges().find((candidate) => candidate.source === edge.target && candidate.target === edge.source);

  protected readonly isBidirectional = (edge: CanvasEdgeView) => this.reverseEdge(edge) !== undefined;

  protected readonly shouldRenderEdge = (edge: CanvasEdgeView) => {
    const reverseEdge = this.reverseEdge(edge);

    if (!reverseEdge) return true;

    return edge.id < reverseEdge.id;
  };

  protected readonly handleSelect = (event: PointerEvent, edgeId: string) => {
    event.stopPropagation();
    this.selectEdge.emit(edgeId);
  };
}
