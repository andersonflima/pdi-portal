import { Component, input, output } from '@angular/core';
import { canvasSize } from '../canvas.constants';
import { getConnectorPath, getNodeCenter } from '../canvas.geometry';
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

  protected readonly findNode = (nodeId: string) => this.nodes().find((node) => node.id === nodeId);

  protected readonly edgePath = (edge: CanvasEdgeView) => {
    const source = this.findNode(edge.source);
    const target = this.findNode(edge.target);

    return source && target ? getConnectorPath(source, target, edge.style.type) : '';
  };

  protected readonly labelPosition = (edge: CanvasEdgeView) => {
    const source = this.findNode(edge.source);
    const target = this.findNode(edge.target);

    if (!source || !target) return { x: 0, y: 0 };

    const start = getNodeCenter(source);
    const end = getNodeCenter(target);

    return {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
  };

  protected readonly handleSelect = (event: PointerEvent, edgeId: string) => {
    event.stopPropagation();
    this.selectEdge.emit(edgeId);
  };
}
