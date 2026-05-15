import type { Board, CanvasNodeKind, CanvasShapeVariant, SaveBoardInput } from '@pdi/contracts';
import { nodeKindMeta, shapeVariantMeta, temporaryPasswordAlphabet } from './canvas.constants';
import type { CanvasEdgeView, CanvasNodeView, CanvasTaskItem, XYPosition } from './canvas.models';

const frameLayerMax = 999;
const objectLayerBase = 1000;

export const generateTemporaryPassword = () => {
  const values = new Uint32Array(12);
  crypto.getRandomValues(values);

  return Array.from(values, (value) => temporaryPasswordAlphabet[value % temporaryPasswordAlphabet.length]).join('');
};

export const defaultTaskItems = (): CanvasTaskItem[] => [
  { checked: false, id: crypto.randomUUID(), label: 'First step' },
  { checked: false, id: crypto.randomUUID(), label: 'Next step' },
  { checked: false, id: crypto.randomUUID(), label: 'Final step' }
];

export const toTaskItemsFromText = (text: string, currentItems: CanvasTaskItem[] = []) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label, index) => ({
      checked: currentItems[index]?.checked ?? false,
      id: currentItems[index]?.id ?? crypto.randomUUID(),
      label
    }));

const orderNodesByLayer = (nodes: CanvasNodeView[]) =>
  [...nodes].sort((leftNode, rightNode) => {
    if (leftNode.zIndex !== rightNode.zIndex) {
      return leftNode.zIndex - rightNode.zIndex;
    }

    if (leftNode.kind === 'FRAME' && rightNode.kind !== 'FRAME') return -1;
    if (leftNode.kind !== 'FRAME' && rightNode.kind === 'FRAME') return 1;

    return 0;
  });

const toNodeLayer = (node: Board['nodes'][number], index: number) => {
  if (node.kind === 'FRAME') {
    const source = Number.isInteger(node.zIndex) ? (node.zIndex as number) : index;
    return Math.max(0, Math.min(frameLayerMax, source));
  }

  const source = Number.isInteger(node.zIndex) ? (node.zIndex as number) : objectLayerBase + index;
  return Math.max(objectLayerBase, source);
};

const toNodeSize = (node: Board['nodes'][number]) => {
  if (node.kind !== 'GOAL' && (node.kind !== 'SHAPE' || node.variant !== 'CIRCLE')) {
    return {
      height: node.style.height ?? nodeKindMeta[node.kind].height,
      width: node.style.width ?? nodeKindMeta[node.kind].width
    };
  }

  const meta = nodeKindMeta[node.kind];
  const size = Math.max(node.style.height ?? meta.height, node.style.width ?? meta.width);

  return {
    height: size,
    width: size
  };
};

const toAbsolutePosition = (node: Board['nodes'][number], nodes: Board['nodes']): XYPosition => {
  if (!node.parentId) return node.position;

  const parentNode = nodes.find((candidate) => candidate.id === node.parentId);

  return parentNode
    ? {
        x: node.position.x + toAbsolutePosition(parentNode, nodes).x,
        y: node.position.y + toAbsolutePosition(parentNode, nodes).y
      }
    : node.position;
};

const toRelativePosition = (node: CanvasNodeView, nodes: CanvasNodeView[]): XYPosition => {
  if (!node.parentId) return node.position;

  const parentNode = nodes.find((candidate) => candidate.id === node.parentId);

  return parentNode
    ? {
        x: node.position.x - parentNode.position.x,
        y: node.position.y - parentNode.position.y
      }
    : node.position;
};

export const toCanvasNodes = (board: Board): CanvasNodeView[] =>
  orderNodesByLayer(
    board.nodes.map((node, index) => {
      const size = toNodeSize(node);

      return {
        backgroundColor: node.style.backgroundColor,
        checked: node.checked,
        color: node.style.color,
        description: node.description,
        height: size.height,
        id: node.id,
        kind: node.kind,
        label: node.label,
        parentId: node.parentId,
        position: toAbsolutePosition(node, board.nodes),
        taskItems: node.taskItems,
        textStyle: node.style.textStyle,
        variant: node.variant,
        width: size.width,
        zIndex: toNodeLayer(node, index)
      };
    })
  );

export const toCanvasEdges = (board: Board): CanvasEdgeView[] =>
  board.edges.map((edge) => ({
    id: edge.id,
    label: edge.label,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    style: {
      color: edge.style?.color ?? '#64748b',
      lineStyle: edge.style?.lineStyle ?? 'solid',
      type: edge.style?.type ?? 'smoothstep'
    },
    target: edge.target,
    targetHandle: edge.targetHandle
  }));

export const toSaveBoard = (title: string, nodes: CanvasNodeView[], edges: CanvasEdgeView[]): SaveBoardInput => ({
  edges: edges.map((edge) => ({
    id: edge.id,
    label: edge.label,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    style: edge.style,
    target: edge.target,
    targetHandle: edge.targetHandle
  })),
  nodes: nodes.map((node) => ({
    checked: node.checked,
    description: node.description,
    id: node.id,
    kind: node.kind,
    label: node.label,
    parentId: node.parentId,
    position: toRelativePosition(node, nodes),
    zIndex: node.zIndex,
    style: {
      backgroundColor: node.backgroundColor,
      color: node.color,
      height: node.height,
      textStyle: node.textStyle,
      width: node.width
    },
    taskItems: node.taskItems,
    variant: node.variant
  })),
  title
});

export const createCanvasNode = (
  kind: CanvasNodeKind,
  nodes: CanvasNodeView[],
  index: number,
  variant?: CanvasShapeVariant
): CanvasNodeView => {
  const meta = nodeKindMeta[kind];
  const size = kind === 'GOAL' || (kind === 'SHAPE' && variant === 'CIRCLE') ? meta.height : undefined;
  const zIndex =
    kind === 'FRAME'
      ? Math.max(
          0,
          Math.min(
            frameLayerMax,
            nodes
              .filter((node) => node.kind === 'FRAME')
              .reduce((highest, node) => Math.max(highest, node.zIndex), -1) + 1
          )
        )
      : nodes.filter((node) => node.kind !== 'FRAME').reduce((highest, node) => Math.max(highest, node.zIndex), objectLayerBase - 1) + 1;

  return {
    backgroundColor: kind === 'FRAME' ? '#f8fafc' : undefined,
    checked: kind === 'TASK' ? false : undefined,
    color: meta.color,
    description: meta.defaultDescription,
    height: size ?? meta.height,
    id: `${kind.toLowerCase()}-${crypto.randomUUID()}`,
    kind,
    label:
      kind === 'SHAPE' && variant
        ? shapeVariantMeta[variant].label
        : kind === 'NOTE' || kind === 'STICKER'
          ? kind === 'NOTE'
            ? 'Write your note'
            : 'Priority'
          : `${meta.label} ${index + 1}`,
    position: { x: 160 + index * 28, y: 120 + index * 28 },
    taskItems: kind === 'TASK_LIST' ? defaultTaskItems() : undefined,
    textStyle: {
      align: kind === 'TEXT' || kind === 'GOAL' || kind === 'SHAPE' || kind === 'STICKER' ? 'center' : 'left'
    },
    variant,
    width: size ?? meta.width,
    zIndex
  };
};
