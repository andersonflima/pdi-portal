import { Injectable } from '@angular/core';
import { findContainingFrame } from '../canvas.geometry';
import type { CanvasNodeView, XYPosition } from '../canvas.models';

const toSelectionBounds = (first: XYPosition, second: XYPosition) => ({
  bottom: Math.max(first.y, second.y),
  left: Math.min(first.x, second.x),
  right: Math.max(first.x, second.x),
  top: Math.min(first.y, second.y)
});

@Injectable()
export class CanvasInteractionControllerService {
  resolveNodeIdsToMove(
    draggedNode: CanvasNodeView,
    nodes: CanvasNodeView[],
    selectedNodeIdSet: Set<string>,
    findDescendantNodeIds: (rootId: string, allNodes: CanvasNodeView[]) => string[]
  ) {
    const canMoveSelection = selectedNodeIdSet.size > 1 && selectedNodeIdSet.has(draggedNode.id);

    if (!canMoveSelection) {
      return new Set(draggedNode.kind === 'FRAME' ? findDescendantNodeIds(draggedNode.id, nodes) : [draggedNode.id]);
    }

    return nodes.reduce((accumulator, node) => {
      if (!selectedNodeIdSet.has(node.id)) return accumulator;

      const ids = node.kind === 'FRAME' ? findDescendantNodeIds(node.id, nodes) : [node.id];

      for (const id of ids) accumulator.add(id);

      return accumulator;
    }, new Set<string>());
  }

  updateNodeParents(nodes: CanvasNodeView[], nodeIds: string[]) {
    if (nodeIds.length === 0) return nodes;

    const nodeIdSet = new Set(nodeIds);

    return nodes.map((node) =>
      nodeIdSet.has(node.id) && node.kind !== 'FRAME'
        ? {
            ...node,
            parentId: findContainingFrame(node, nodes)?.id
          }
        : node
    );
  }

  computeMarqueeSelection(
    nodes: CanvasNodeView[],
    origin: XYPosition,
    current: XYPosition,
    initialSelection: string[],
    append: boolean
  ) {
    const bounds = toSelectionBounds(origin, current);
    const selectedByBounds = nodes
      .filter((node) => {
        const nodeLeft = node.position.x;
        const nodeTop = node.position.y;
        const nodeRight = node.position.x + node.width;
        const nodeBottom = node.position.y + node.height;

        return !(nodeRight < bounds.left || nodeLeft > bounds.right || nodeBottom < bounds.top || nodeTop > bounds.bottom);
      })
      .map((node) => node.id);

    return append ? Array.from(new Set([...initialSelection, ...selectedByBounds])) : selectedByBounds;
  }
}
