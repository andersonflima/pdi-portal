import { Injectable } from '@angular/core';
import type { CanvasEdgeLineStyle, CanvasEdgeType } from '@pdi/contracts';
import { getNodeCenter } from '../canvas.geometry';
import type { CanvasEdgeDirection, CanvasEdgePatch, CanvasEdgeView, CanvasNodeView } from '../canvas.models';

type EdgeMutationResult = {
  edges: CanvasEdgeView[];
  selectedEdgeId: string | null;
};

@Injectable()
export class CanvasEdgeOperationsService {
  edgeHorizontalDirection(edge: CanvasEdgeView, nodes: CanvasNodeView[]): Exclude<CanvasEdgeDirection, 'both'> {
    const source = nodes.find((node) => node.id === edge.source);
    const target = nodes.find((node) => node.id === edge.target);

    if (!source || !target) return 'left-to-right';

    return getNodeCenter(source).x <= getNodeCenter(target).x ? 'left-to-right' : 'right-to-left';
  }

  mutateSelectedEdge(
    edges: CanvasEdgeView[],
    nodes: CanvasNodeView[],
    selectedEdge: CanvasEdgeView,
    input: CanvasEdgePatch
  ): EdgeMutationResult {
    const { direction, ...edgePatch } = input;
    const currentEdge = edges.find((edge) => edge.id === selectedEdge.id) ?? selectedEdge;
    const reverseEdge = edges.find((edge) => edge.source === currentEdge.target && edge.target === currentEdge.source) ?? null;

    const applyPatch = (edge: CanvasEdgeView): CanvasEdgeView => ({
      ...edge,
      label: edgePatch.label ?? edge.label,
      style: {
        color: edgePatch.color ?? edge.style.color,
        lineStyle: edgePatch.lineStyle ?? edge.style.lineStyle,
        type: edgePatch.type ?? edge.style.type
      }
    });

    const patchedCurrent = applyPatch(currentEdge);
    const patchedReverse = reverseEdge ? applyPatch(reverseEdge) : null;
    const leftToRightEdge =
      this.edgeHorizontalDirection(patchedCurrent, nodes) === 'left-to-right'
        ? patchedCurrent
        : patchedReverse ?? this.createReverseEdge(patchedCurrent);
    const rightToLeftEdge =
      this.edgeHorizontalDirection(patchedCurrent, nodes) === 'right-to-left'
        ? patchedCurrent
        : patchedReverse ?? this.createReverseEdge(patchedCurrent);

    const pairlessEdges = edges.filter((edge) => edge.id !== patchedCurrent.id && edge.id !== patchedReverse?.id);

    if (direction === 'both') {
      return {
        edges: pairlessEdges.concat(leftToRightEdge, rightToLeftEdge),
        selectedEdgeId: selectedEdge.id
      };
    }

    if (direction === 'left-to-right') {
      return {
        edges: pairlessEdges.concat(leftToRightEdge),
        selectedEdgeId: leftToRightEdge.id
      };
    }

    if (direction === 'right-to-left') {
      return {
        edges: pairlessEdges.concat(rightToLeftEdge),
        selectedEdgeId: rightToLeftEdge.id
      };
    }

    if (patchedReverse) {
      return {
        edges: pairlessEdges.concat(patchedCurrent, patchedReverse),
        selectedEdgeId: patchedCurrent.id
      };
    }

    return {
      edges: pairlessEdges.concat(patchedCurrent),
      selectedEdgeId: patchedCurrent.id
    };
  }

  createConnector(
    edges: CanvasEdgeView[],
    source: string,
    target: string,
    sourceHandle?: string,
    targetHandle?: string
  ) {
    const hasSameDirection = edges.some((edge) => edge.source === source && edge.target === target);
    if (hasSameDirection) return edges;

    const reverseEdge = edges.find((edge) => edge.source === target && edge.target === source);

    return edges.concat(this.createEdge(reverseEdge, source, target, sourceHandle, targetHandle));
  }

  private createEdge(
    reverseEdge: CanvasEdgeView | undefined,
    source: string,
    target: string,
    sourceHandle?: string,
    targetHandle?: string
  ): CanvasEdgeView {
    return {
      id: crypto.randomUUID(),
      label: reverseEdge?.label ?? '',
      source,
      sourceHandle,
      style: reverseEdge?.style ?? {
        color: '#64748b',
        lineStyle: 'solid' satisfies CanvasEdgeLineStyle,
        type: 'smoothstep' satisfies CanvasEdgeType
      },
      target,
      targetHandle
    };
  }

  private flipHandleRole(handle?: string) {
    if (!handle) return undefined;
    if (handle.includes('-source')) return handle.replace('-source', '-target');
    if (handle.includes('-target')) return handle.replace('-target', '-source');

    return handle;
  }

  private createReverseEdge(edge: CanvasEdgeView): CanvasEdgeView {
    return {
      ...edge,
      id: crypto.randomUUID(),
      source: edge.target,
      sourceHandle: this.flipHandleRole(edge.targetHandle),
      target: edge.source,
      targetHandle: this.flipHandleRole(edge.sourceHandle)
    };
  }
}
