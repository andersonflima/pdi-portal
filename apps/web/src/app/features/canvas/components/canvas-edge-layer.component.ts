import { Component, input, output } from '@angular/core';
import { canvasSize } from '../canvas.constants';
import { getConnectorPath, getNodeCenter } from '../canvas.geometry';
import type { CanvasEdgeView, CanvasHandlePosition, CanvasNodeView } from '../canvas.models';

const toHandleSide = (handle?: string): CanvasHandlePosition | undefined => {
  if (!handle) return undefined;
  if (handle.includes('top')) return 'top';
  if (handle.includes('right')) return 'right';
  if (handle.includes('bottom')) return 'bottom';
  if (handle.includes('left')) return 'left';
  return undefined;
};

const toInboundAngle = (handle: CanvasHandlePosition) => {
  if (handle === 'left') return 0;
  if (handle === 'right') return 180;
  if (handle === 'top') return 90;
  return -90;
};
const arrowNeckOffset = 18;

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
  readonly editEdge = output<string>();

  protected readonly canvasSize = canvasSize;
  protected readonly markerColors = () => Array.from(new Set(this.edges().map((edge) => edge.style.color)));
  protected readonly markerAngles = [0, 90, 180, -90];
  protected readonly markerIdForColorAndAngle = (color: string, angle: number) =>
    `edge-arrow-head-${encodeURIComponent(color).replaceAll('%', '_')}-${angle}`;
  protected readonly edgeLiveMaskId = (edgeId: string, segment: 'start' | 'end') =>
    `edge-live-mask-${encodeURIComponent(edgeId).replaceAll('%', '_')}-${segment}`;

  protected readonly findNode = (nodeId: string) => this.nodes().find((node) => node.id === nodeId);
  protected readonly inferTargetHandle = (edge: CanvasEdgeView): CanvasHandlePosition => {
    const source = this.findNode(edge.source);
    const target = this.findNode(edge.target);

    if (!source || !target) return 'left';

    const sourceCenter = getNodeCenter(source);
    const targetCenter = getNodeCenter(target);
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx >= 0 ? 'left' : 'right';
    }

    return dy >= 0 ? 'top' : 'bottom';
  };
  protected readonly inferSourceHandle = (edge: CanvasEdgeView): CanvasHandlePosition => {
    const source = this.findNode(edge.source);
    const target = this.findNode(edge.target);

    if (!source || !target) return 'right';

    const sourceCenter = getNodeCenter(source);
    const targetCenter = getNodeCenter(target);
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx >= 0 ? 'right' : 'left';
    }

    return dy >= 0 ? 'bottom' : 'top';
  };
  protected readonly edgeEndMarkerId = (edge: CanvasEdgeView) => {
    const handle = toHandleSide(edge.targetHandle) ?? this.inferTargetHandle(edge);
    return this.markerIdForColorAndAngle(edge.style.color, toInboundAngle(handle));
  };
  protected readonly edgeStartMarkerId = (edge: CanvasEdgeView) => {
    const handle = toHandleSide(edge.sourceHandle) ?? this.inferSourceHandle(edge);
    return this.markerIdForColorAndAngle(edge.style.color, toInboundAngle(handle));
  };

  protected readonly edgePath = (edge: CanvasEdgeView) => {
    const source = this.findNode(edge.source);
    const target = this.findNode(edge.target);
    const hasStartArrow = this.isBidirectional(edge);

    return source && target
      ? getConnectorPath(source, target, edge.style.type, edge.sourceHandle, edge.targetHandle, {
          end: arrowNeckOffset,
          start: hasStartArrow ? arrowNeckOffset : 0
        })
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

  protected readonly handleEdit = (event: MouseEvent, edgeId: string) => {
    event.preventDefault();
    event.stopPropagation();
    this.editEdge.emit(edgeId);
  };
}
