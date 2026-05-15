import { Component, input, output } from '@angular/core';
import { canvasSize } from '../canvas.constants';
import { getConnectorEndpoints } from '../canvas.geometry';
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

  protected readonly reverseEdge = (edge: CanvasEdgeView) =>
    this.edges().find((candidate) => candidate.source === edge.target && candidate.target === edge.source);

  protected readonly isBidirectional = (edge: CanvasEdgeView) => this.reverseEdge(edge) !== undefined;

  protected readonly shouldRenderEdge = (edge: CanvasEdgeView) => {
    const reverseEdge = this.reverseEdge(edge);

    if (!reverseEdge) return true;

    return edge.id < reverseEdge.id;
  };

  private readonly toEdgePath = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    type: string
  ) => {
    const curveOffset = Math.max(80, Math.abs(end.x - start.x) / 2);

    if (type === 'straight') return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    if (type === 'step') {
      const middleX = (start.x + end.x) / 2;
      return `M ${start.x} ${start.y} L ${middleX} ${start.y} L ${middleX} ${end.y} L ${end.x} ${end.y}`;
    }

    return `M ${start.x} ${start.y} C ${start.x + curveOffset} ${start.y}, ${end.x - curveOffset} ${end.y}, ${end.x} ${end.y}`;
  };

  private readonly toArrowPoints = (
    tip: { x: number; y: number },
    base: { x: number; y: number },
    unitDirection: { x: number; y: number }
  ) => {
    const halfWidth = 6;
    const perpendicular = { x: -unitDirection.y, y: unitDirection.x };
    const left = {
      x: base.x - perpendicular.x * halfWidth,
      y: base.y - perpendicular.y * halfWidth
    };
    const right = {
      x: base.x + perpendicular.x * halfWidth,
      y: base.y + perpendicular.y * halfWidth
    };

    return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`;
  };

  protected readonly edgeGeometry = (edge: CanvasEdgeView) => {
    const source = this.findNode(edge.source);
    const target = this.findNode(edge.target);

    if (!source || !target) return null;

    const arrowSize = 14;
    const { start, end } = getConnectorEndpoints(source, target, edge.sourceHandle, edge.targetHandle);
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const length = Math.hypot(deltaX, deltaY) || 1;
    const unitForward = { x: deltaX / length, y: deltaY / length };
    const unitBackward = { x: -unitForward.x, y: -unitForward.y };
    const bidirectional = this.isBidirectional(edge);
    const startForLine = bidirectional
      ? { x: start.x + unitForward.x * arrowSize, y: start.y + unitForward.y * arrowSize }
      : start;
    const endForLine = { x: end.x - unitForward.x * arrowSize, y: end.y - unitForward.y * arrowSize };
    const forwardArrow = this.toArrowPoints(end, endForLine, unitForward);
    const backwardArrow = bidirectional ? this.toArrowPoints(start, startForLine, unitBackward) : null;

    return {
      backwardArrow,
      path: this.toEdgePath(startForLine, endForLine, edge.style.type),
      forwardArrow
    };
  };

  protected readonly handleSelect = (event: PointerEvent, edgeId: string) => {
    event.stopPropagation();
    this.selectEdge.emit(edgeId);
  };
}
