import type {
  Board,
  CanvasEdgeLineStyle,
  CanvasEdgeType,
  CanvasNodeKind,
  CanvasShapeVariant,
  CanvasTextAlign,
  CanvasTextVerticalAlign,
  PdiPlan,
  User
} from '@pdi/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  addEdge,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Handle,
  NodeResizer,
  Position,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type OnNodeDrag,
  type XYPosition
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Check,
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  ChevronDown,
  Circle,
  Cloud,
  Database,
  Diamond,
  FileText,
  Frame,
  Goal,
  Hexagon,
  Italic,
  ListChecks,
  LogOut,
  MousePointer2,
  Pencil,
  Plus,
  Square,
  Save,
  Sparkles,
  SquarePen,
  StickyNote,
  Trash2,
  Triangle,
  Trello,
  Underline,
  UserCircle2
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent
} from 'react';
import { api, getApiUrl, getToken } from '../../api/client';

type CanvasBoardProps = {
  isCreatingUser: boolean;
  isCreatingPlan: boolean;
  isDeletingPlan: boolean;
  isUpdatingPlan: boolean;
  onCreatePlan: (input: { ownerId?: string; title: string; objective: string }) => void;
  onCreateUser: (input: { email: string; name: string; password: string; role: User['role'] }) => void;
  onDeletePlan: (planId: string) => void;
  onLogout: () => void;
  onSelectPlan: (planId: string) => void;
  onUpdatePlan: (
    planId: string,
    input: { objective?: string; ownerId?: string; status?: PdiPlan['status']; title?: string }
  ) => void;
  plan: PdiPlan;
  plans: PdiPlan[];
  user: User;
  users: User[];
  usersCount: number;
};

type CanvasNodeData = {
  kind: CanvasNodeKind;
  label: string;
  checked?: boolean;
  description?: string;
  color: string;
  backgroundColor?: string;
  taskItems?: CanvasTaskItem[];
  textStyle?: CanvasTextStyle;
  variant?: CanvasShapeVariant;
};

type CanvasTaskItem = {
  checked: boolean;
  id: string;
  label: string;
};

type CanvasTextStyle = {
  align?: CanvasTextAlign;
  bold?: boolean;
  fontSize?: number;
  italic?: boolean;
  underline?: boolean;
  verticalAlign?: CanvasTextVerticalAlign;
};

type CanvasNodeMeta = {
  action: string;
  color: string;
  defaultDescription?: string;
  height: number;
  icon: typeof StickyNote;
  label: string;
  width: number;
};

type RgbColor = {
  blue: number;
  green: number;
  red: number;
};

const canvasSurfaceColor: RgbColor = { blue: 239, green: 244, red: 246 };
const whiteColor: RgbColor = { blue: 255, green: 255, red: 255 };
const temporaryPasswordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

const generateTemporaryPassword = () => {
  const values = new Uint32Array(12);
  crypto.getRandomValues(values);

  return Array.from(values, (value) => temporaryPasswordAlphabet[value % temporaryPasswordAlphabet.length]).join('');
};

const toContentAlignment = (verticalAlign?: CanvasTextVerticalAlign) => {
  if (verticalAlign === 'bottom') return 'end';
  if (verticalAlign === 'center') return 'center';
  return undefined;
};

const parseCssColor = (color: string): RgbColor | null => {
  const normalizedColor = color.trim();
  const hexColor = normalizedColor.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (hexColor?.[1] && hexColor[2] && hexColor[3]) {
    return {
      blue: Number.parseInt(hexColor[3], 16),
      green: Number.parseInt(hexColor[2], 16),
      red: Number.parseInt(hexColor[1], 16)
    };
  }

  const rgbColor = normalizedColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgbColor) return null;

  return {
    blue: Number(rgbColor[3]),
    green: Number(rgbColor[2]),
    red: Number(rgbColor[1])
  };
};

const mixRgbColors = (foreground: RgbColor, background: RgbColor, foregroundWeight: number): RgbColor => ({
  blue: Math.round(foreground.blue * foregroundWeight + background.blue * (1 - foregroundWeight)),
  green: Math.round(foreground.green * foregroundWeight + background.green * (1 - foregroundWeight)),
  red: Math.round(foreground.red * foregroundWeight + background.red * (1 - foregroundWeight))
});

const getRelativeLuminance = (color: RgbColor) => {
  const toLinearChannel = (channel: number) => {
    const normalizedChannel = channel / 255;
    return normalizedChannel <= 0.03928
      ? normalizedChannel / 12.92
      : ((normalizedChannel + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * toLinearChannel(color.red) + 0.7152 * toLinearChannel(color.green) + 0.0722 * toLinearChannel(color.blue);
};

const getReadableTextColor = (background: RgbColor) => (getRelativeLuminance(background) > 0.48 ? '#172033' : '#ffffff');

const getNodeTextColor = (data: CanvasNodeData) => {
  const nodeColor = parseCssColor(data.color) ?? canvasSurfaceColor;

  if (data.kind === 'TEXT') return data.color;
  if (data.kind === 'CARD' || data.kind === 'TASK' || data.kind === 'TASK_LIST') return '#172033';
  if (data.kind === 'FRAME') {
    return getReadableTextColor(parseCssColor(data.backgroundColor ?? '#f8fafc') ?? canvasSurfaceColor);
  }
  if (data.kind === 'NOTE') return getReadableTextColor(mixRgbColors(nodeColor, whiteColor, 0.54));
  if (data.kind === 'STICKER') return getReadableTextColor(mixRgbColors(nodeColor, whiteColor, 0.12));
  if (data.kind === 'SHAPE') return getReadableTextColor(mixRgbColors(nodeColor, whiteColor, 0.1));
  if (data.kind === 'GOAL') return getReadableTextColor(mixRgbColors(nodeColor, whiteColor, 0.08));

  return '#172033';
};

const nodeKindOrder: CanvasNodeKind[] = ['NOTE', 'STICKER', 'CARD', 'SHAPE', 'TEXT', 'TASK', 'TASK_LIST', 'GOAL', 'FRAME'];
const shapeVariantOrder: CanvasShapeVariant[] = [
  'RECTANGLE',
  'ROUNDED_RECTANGLE',
  'CIRCLE',
  'DIAMOND',
  'TRIANGLE',
  'PARALLELOGRAM',
  'HEXAGON',
  'CYLINDER',
  'DOCUMENT',
  'CLOUD'
];

const shapeVariantMeta: Record<CanvasShapeVariant, { icon: typeof Square; label: string }> = {
  CIRCLE: { icon: Circle, label: 'Circle' },
  CLOUD: { icon: Cloud, label: 'Cloud' },
  CYLINDER: { icon: Database, label: 'Cylinder' },
  DIAMOND: { icon: Diamond, label: 'Diamond' },
  DOCUMENT: { icon: FileText, label: 'Document' },
  HEXAGON: { icon: Hexagon, label: 'Hexagon' },
  PARALLELOGRAM: { icon: Square, label: 'Parallelogram' },
  RECTANGLE: { icon: Square, label: 'Rectangle' },
  ROUNDED_RECTANGLE: { icon: Square, label: 'Rounded' },
  TRIANGLE: { icon: Triangle, label: 'Triangle' }
};

const orderFrameParentsFirst = (nodes: Node<CanvasNodeData>[]) =>
  [...nodes].sort((leftNode: Node<CanvasNodeData>, rightNode: Node<CanvasNodeData>) => {
    if (leftNode.data.kind === 'FRAME' && rightNode.data.kind !== 'FRAME') return -1;
    if (leftNode.data.kind !== 'FRAME' && rightNode.data.kind === 'FRAME') return 1;
    return 0;
  });

const nodeKindMeta: Record<CanvasNodeKind, CanvasNodeMeta> = {
  CARD: {
    action: 'Decision',
    color: '#0f766e',
    defaultDescription: 'Use cards for structured notes, decisions or references.',
    height: 150,
    icon: Trello,
    label: 'Card',
    width: 280
  },
  FRAME: {
    action: 'Group',
    color: '#475569',
    defaultDescription: 'Group related work inside this frame.',
    height: 260,
    icon: Frame,
    label: 'Frame',
    width: 420
  },
  GOAL: {
    action: 'Outcome',
    color: '#2563eb',
    defaultDescription: 'Describe the expected development outcome.',
    height: 168,
    icon: Goal,
    label: 'Goal',
    width: 168
  },
  NOTE: {
    action: 'Idea',
    color: '#facc15',
    defaultDescription: undefined,
    height: 170,
    icon: StickyNote,
    label: 'Post-it',
    width: 190
  },
  SHAPE: {
    action: 'Diagram',
    color: '#7c3aed',
    defaultDescription: 'Use shapes to create areas, emphasis or diagrams.',
    height: 150,
    icon: Circle,
    label: 'Shape',
    width: 220
  },
  STICKER: {
    action: 'Mark',
    color: '#ec4899',
    defaultDescription: undefined,
    height: 128,
    icon: Sparkles,
    label: 'Sticker',
    width: 128
  },
  TASK: {
    action: 'Action',
    color: '#16a34a',
    defaultDescription: 'Action item with a clear owner and next step.',
    height: 128,
    icon: Check,
    label: 'Task',
    width: 260
  },
  TASK_LIST: {
    action: 'Steps',
    color: '#0891b2',
    defaultDescription: 'Checklist with multiple task steps.',
    height: 190,
    icon: ListChecks,
    label: 'Checklist',
    width: 300
  },
  TEXT: {
    action: 'Annotate',
    color: '#c2410c',
    defaultDescription: 'Free text for titles, labels and annotations.',
    height: 96,
    icon: SquarePen,
    label: 'Text',
    width: 300
  }
};

const connectionHandles = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left }
];

const defaultTaskItems = (): CanvasTaskItem[] => [
  { checked: false, id: crypto.randomUUID(), label: 'First step' },
  { checked: false, id: crypto.randomUUID(), label: 'Next step' },
  { checked: false, id: crypto.randomUUID(), label: 'Final step' }
];

const toTaskItemsFromText = (text: string, currentItems: CanvasTaskItem[] = []) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label, index) => ({
      checked: currentItems[index]?.checked ?? false,
      id: currentItems[index]?.id ?? crypto.randomUUID(),
      label
    }));

const nodeTypes = {
  pdiNode: ({ data, id, selected }: { data: CanvasNodeData; id: string; selected: boolean }) => {
    const meta = nodeKindMeta[data.kind];
    const Icon = meta.icon;
    const { setNodes } = useReactFlow<Node<CanvasNodeData>, Edge>();
    const [isEditing, setIsEditing] = useState(false);
    const updateNodeData = (input: Partial<Pick<CanvasNodeData, 'checked' | 'description' | 'label' | 'taskItems'>>) =>
      setNodes((currentNodes) =>
        currentNodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...input } } : node))
      );
    const taskItemsText = (data.taskItems ?? []).map((item) => item.label).join('\n');
    const stopCanvasInteraction = (event: PointerEvent) => event.stopPropagation();

    return (
      <article
        className={`pdi-node pdi-node-${data.kind.toLowerCase().replace('_', '-')} ${
          data.kind === 'SHAPE' ? `pdi-shape-${(data.variant ?? 'DIAMOND').toLowerCase().replace('_', '-')}` : ''
        } pdi-align-${data.textStyle?.align ?? 'left'} pdi-valign-${data.textStyle?.verticalAlign ?? 'top'} ${
          selected ? 'is-selected' : ''
        }`}
        onDoubleClick={() => setIsEditing(true)}
        style={
          {
            '--node-background': data.backgroundColor ?? 'transparent',
            '--node-color': data.color,
            '--node-font-size': data.textStyle?.fontSize ? `${data.textStyle.fontSize}px` : undefined,
            '--node-font-style': data.textStyle?.italic ? 'italic' : undefined,
            '--node-font-weight': data.textStyle?.bold ? 800 : undefined,
            '--node-text-align': data.textStyle?.align,
            '--node-text-color': getNodeTextColor(data),
            '--node-text-decoration': data.textStyle?.underline ? 'underline' : undefined,
            '--node-vertical-align': toContentAlignment(data.textStyle?.verticalAlign)
          } as CSSProperties
        }
      >
        <NodeResizer
          color={data.color}
          handleClassName="pdi-node-resize-handle"
          isVisible={selected}
          keepAspectRatio={data.kind === 'GOAL' || (data.kind === 'SHAPE' && data.variant === 'CIRCLE')}
          lineClassName="pdi-node-resize-line"
          minHeight={72}
          minWidth={96}
        />
        {connectionHandles.map((handle) => (
          <Handle
            className="pdi-node-handle pdi-node-handle-target"
            id={`${handle.id}-target`}
            key={`${handle.id}-target`}
            position={handle.position}
            type="target"
          />
        ))}
        {connectionHandles.map((handle) => (
          <Handle
            className="pdi-node-handle pdi-node-handle-source"
            id={`${handle.id}-source`}
            key={`${handle.id}-source`}
            position={handle.position}
            type="source"
          />
        ))}
        <span className="pdi-node-pin" />
        {data.kind === 'TASK' ? (
          <button
            aria-label={data.checked ? 'Mark task as open' : 'Mark task as done'}
            aria-pressed={data.checked ?? false}
            className="pdi-task-check"
            onClick={(event) => {
              event.stopPropagation();
              updateNodeData({ checked: !data.checked });
            }}
            onDoubleClick={(event) => event.stopPropagation()}
            onPointerDown={stopCanvasInteraction}
            type="button"
          >
            {data.checked ? '✓' : ''}
          </button>
        ) : null}
        {isEditing ? (
          <div className="pdi-node-editor" onPointerDown={stopCanvasInteraction}>
            <textarea
              aria-label={
                data.kind === 'TASK_LIST'
                  ? 'Checklist steps'
                  : data.kind === 'NOTE' || data.kind === 'STICKER'
                    ? `${meta.label} body`
                    : `${meta.label} text`
              }
              autoFocus
              onBlur={() => setIsEditing(false)}
              onChange={(event) =>
                data.kind === 'TASK_LIST'
                  ? updateNodeData({ taskItems: toTaskItemsFromText(event.target.value, data.taskItems) })
                  : updateNodeData({ label: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === 'Escape') setIsEditing(false);
              }}
              rows={data.kind === 'TASK_LIST' ? Math.max((data.taskItems ?? []).length, 1) : Math.max(data.label.split('\n').length, 1)}
              value={data.kind === 'TASK_LIST' ? taskItemsText : data.label}
            />
          </div>
        ) : data.kind === 'TASK_LIST' ? (
          <div className="pdi-task-list">
            {(data.taskItems ?? []).map((item) => (
              <button
                aria-pressed={item.checked}
                key={item.id}
                onClick={(event) => {
                  event.stopPropagation();
                  updateNodeData({
                    taskItems: (data.taskItems ?? []).map((candidate) =>
                      candidate.id === item.id ? { ...candidate, checked: !candidate.checked } : candidate
                    )
                  });
                }}
                onDoubleClick={(event) => event.stopPropagation()}
                onPointerDown={stopCanvasInteraction}
                type="button"
              >
                <span>{item.checked ? '✓' : ''}</span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </div>
        ) : (
          <strong>{data.label}</strong>
        )}
      </article>
    );
  }
};

const toFlowNodes = (board: Board): Node<CanvasNodeData>[] =>
  orderFrameParentsFirst(
    board.nodes.map((node) => {
      const size = toFlowNodeSize(node);

      return {
      id: node.id,
      data: {
        backgroundColor: node.style.backgroundColor,
        checked: node.checked,
        color: node.style.color,
        description: node.description,
        kind: node.kind,
        label: node.label,
        taskItems: node.taskItems,
        textStyle: node.style.textStyle,
        variant: node.variant
      },
        parentId: node.parentId,
        position: node.position,
        style: {
          backgroundColor: node.style.backgroundColor,
          borderColor: node.style.color,
          height: size.height,
          width: size.width
        },
        type: 'pdiNode',
        zIndex: node.kind === 'FRAME' ? 0 : 10
      };
    })
  );

const toFlowEdges = (board: Board): Edge[] =>
  board.edges.map((edge) => ({
    animated: true,
    className: edge.style?.lineStyle === 'dashed' ? 'pdi-edge-dashed' : 'pdi-edge-solid',
    id: edge.id,
    label: edge.label,
    labelBgBorderRadius: 6,
    labelBgPadding: [8, 4],
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
    labelStyle: { fill: edge.style?.color ?? '#64748b', fontWeight: 700 },
    style: {
      stroke: edge.style?.color ?? '#64748b',
      strokeWidth: 2
    },
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
    type: edge.style?.type ?? 'smoothstep'
  }));

const fromFlowState = (title: string, nodes: Node<CanvasNodeData>[], edges: Edge[]) => ({
  edges: edges.map((edge) => ({
    id: edge.id,
    label: typeof edge.label === 'string' ? edge.label : undefined,
    source: edge.source,
    sourceHandle: edge.sourceHandle ?? undefined,
    style: {
      color: typeof edge.style?.stroke === 'string' ? edge.style.stroke : '#64748b',
      lineStyle: (edge.className?.includes('pdi-edge-dashed') ? 'dashed' : 'solid') as CanvasEdgeLineStyle,
      type: (edge.type ?? 'smoothstep') as CanvasEdgeType
    },
    target: edge.target,
    targetHandle: edge.targetHandle ?? undefined
  })),
  nodes: nodes.map((node) => ({
    id: node.id,
    kind: node.data.kind,
    checked: node.data.checked,
    label: node.data.label,
    description: node.data.description,
    parentId: node.parentId,
    position: node.position,
    taskItems: node.data.taskItems,
    variant: node.data.variant,
    style: {
      backgroundColor: node.data.backgroundColor,
      color: node.data.color,
      textStyle: node.data.textStyle,
      height:
        node.measured?.height ??
        node.height ??
        (typeof node.style?.height === 'number' ? node.style.height : nodeKindMeta[node.data.kind].height),
      width:
        node.measured?.width ??
        node.width ??
        (typeof node.style?.width === 'number' ? node.style.width : nodeKindMeta[node.data.kind].width)
    }
  })),
  title
});

const toLiveWebSocketUrl = (pdiPlanId: string, clientId: string) => {
  const url = new URL(getApiUrl());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/pdi-plans/${pdiPlanId}/board/live`;
  url.searchParams.set('clientId', clientId);
  url.searchParams.set('token', getToken() ?? '');

  return url.toString();
};

const toFlowNodeSize = (node: Board['nodes'][number]) => {
  if (node.kind !== 'GOAL' && (node.kind !== 'SHAPE' || node.variant !== 'CIRCLE')) {
    return {
      height: node.style.height,
      width: node.style.width
    };
  }

  const meta = nodeKindMeta[node.kind];
  const size = Math.max(node.style.height ?? meta.height, node.style.width ?? meta.width);

  return {
    height: size,
    width: size
  };
};

const getFlowNodeSize = (node: Node<CanvasNodeData>) => ({
  height:
    node.measured?.height ??
    node.height ??
    (typeof node.style?.height === 'number' ? node.style.height : nodeKindMeta[node.data.kind].height),
  width:
    node.measured?.width ??
    node.width ??
    (typeof node.style?.width === 'number' ? node.style.width : nodeKindMeta[node.data.kind].width)
});

const getAbsoluteNodePosition = (node: Node<CanvasNodeData>, nodes: Node<CanvasNodeData>[]): XYPosition => {
  if (!node.parentId) return node.position;

  const parentNode = nodes.find((candidate) => candidate.id === node.parentId);
  if (!parentNode) return node.position;

  const parentPosition: XYPosition = getAbsoluteNodePosition(parentNode, nodes);

  return {
    x: parentPosition.x + node.position.x,
    y: parentPosition.y + node.position.y
  };
};

const findContainingFrame = (node: Node<CanvasNodeData>, nodes: Node<CanvasNodeData>[]) => {
  const nodePosition = getAbsoluteNodePosition(node, nodes);
  const nodeSize = getFlowNodeSize(node);
  const nodeCenter = {
    x: nodePosition.x + nodeSize.width / 2,
    y: nodePosition.y + nodeSize.height / 2
  };

  return nodes
    .filter((candidate) => candidate.data.kind === 'FRAME' && candidate.id !== node.id)
    .find((frameNode) => {
      const framePosition = getAbsoluteNodePosition(frameNode, nodes);
      const frameSize = getFlowNodeSize(frameNode);

      return (
        nodeCenter.x >= framePosition.x &&
        nodeCenter.x <= framePosition.x + frameSize.width &&
        nodeCenter.y >= framePosition.y &&
        nodeCenter.y <= framePosition.y + frameSize.height
      );
    });
};

const createNode = (kind: CanvasNodeKind, index: number, variant?: CanvasShapeVariant): Node<CanvasNodeData> => {
  const meta = nodeKindMeta[kind];
  const size = kind === 'GOAL' || (kind === 'SHAPE' && variant === 'CIRCLE') ? meta.height : undefined;

  return {
    id: `${kind.toLowerCase()}-${crypto.randomUUID()}`,
    data: {
      backgroundColor: kind === 'FRAME' ? '#f8fafc' : undefined,
      checked: kind === 'TASK' ? false : undefined,
      color: meta.color,
      kind,
      label:
        kind === 'SHAPE' && variant
          ? shapeVariantMeta[variant].label
          : kind === 'NOTE' || kind === 'STICKER'
            ? kind === 'NOTE'
              ? 'Write your note'
              : 'Priority'
            : `${meta.label} ${index + 1}`,
      description: meta.defaultDescription,
      taskItems: kind === 'TASK_LIST' ? defaultTaskItems() : undefined,
      textStyle: { align: kind === 'TEXT' || kind === 'GOAL' || kind === 'SHAPE' || kind === 'STICKER' ? 'center' : 'left' },
      variant
    },
    position: { x: 160 + index * 28, y: 120 + index * 28 },
    style: {
      borderColor: meta.color,
      height: size ?? meta.height,
      width: size ?? meta.width
    },
    type: 'pdiNode',
    zIndex: kind === 'FRAME' ? 0 : 10
  };
};

export const CanvasBoard = ({
  isCreatingUser,
  isCreatingPlan,
  isDeletingPlan,
  isUpdatingPlan,
  onCreatePlan,
  onCreateUser,
  onDeletePlan,
  onLogout,
  onSelectPlan,
  onUpdatePlan,
  plan,
  plans,
  user,
  users,
  usersCount
}: CanvasBoardProps) => {
  const boardQuery = useQuery({
    queryFn: () => api.board(plan.id),
    queryKey: ['board', plan.id]
  });
  const clientId = useMemo(() => crypto.randomUUID(), []);
  const socketRef = useRef<WebSocket | null>(null);
  const isApplyingRemoteBoard = useRef(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CanvasNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const saveBoard = useMutation({
    mutationFn: () => api.saveBoard(plan.id, fromFlowState(boardQuery.data?.title ?? plan.title, nodes, edges))
  });
  const [newUser, setNewUser] = useState(() => ({
    email: '',
    name: '',
    password: generateTemporaryPassword(),
    role: 'MEMBER' as User['role']
  }));
  const [newPlan, setNewPlan] = useState({
    objective: '',
    ownerId: users.find((item) => item.role === 'MEMBER')?.id ?? users[0]?.id ?? '',
    title: ''
  });
  const [isShapeToolOpen, setIsShapeToolOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState(plan.id);
  const selectedPlanForEdit = useMemo(
    () => plans.find((item) => item.id === editingPlanId) ?? plan,
    [editingPlanId, plan, plans]
  );
  const [editPlan, setEditPlan] = useState({
    objective: plan.objective,
    ownerId: plan.ownerId,
    status: plan.status,
    title: plan.title
  });
  const ownerById = useMemo(() => new Map(users.map((item) => [item.id, item])), [users]);
  const planOwner = ownerById.get(plan.ownerId);
  const selectedNode = useMemo(() => nodes.find((node) => node.selected), [nodes]);
  const selectedEdge = useMemo(() => edges.find((edge) => edge.selected), [edges]);

  useEffect(() => {
    if (!boardQuery.data) return;
    isApplyingRemoteBoard.current = true;
    setNodes(toFlowNodes(boardQuery.data));
    setEdges(toFlowEdges(boardQuery.data));
    window.setTimeout(() => {
      isApplyingRemoteBoard.current = false;
    }, 0);
  }, [boardQuery.data, setEdges, setNodes]);

  useEffect(() => {
    const socket = new WebSocket(toLiveWebSocketUrl(plan.id, clientId));
    socketRef.current = socket;

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        clientId: string;
        payload: Board;
        type: 'BOARD_SYNC';
      };

      if (message.type !== 'BOARD_SYNC' || message.clientId === clientId) return;

      isApplyingRemoteBoard.current = true;
      setNodes(toFlowNodes(message.payload));
      setEdges(toFlowEdges(message.payload));
      window.setTimeout(() => {
        isApplyingRemoteBoard.current = false;
      }, 0);
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [clientId, plan.id, setEdges, setNodes]);

  useEffect(() => {
    if (!boardQuery.data || isApplyingRemoteBoard.current) return;

    const timeoutId = window.setTimeout(() => {
      const socket = socketRef.current;

      if (!socket || socket.readyState !== WebSocket.OPEN) return;

      socket.send(
        JSON.stringify({
          clientId,
          payload: fromFlowState(boardQuery.data.title, nodes, edges),
          type: 'BOARD_SYNC'
        })
      );
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [boardQuery.data, clientId, edges, nodes]);

  useEffect(() => {
    setEditingPlanId(plan.id);
  }, [plan.id]);

  useEffect(() => {
    setNewPlan((current) =>
      current.ownerId
        ? current
        : {
            ...current,
            ownerId: users.find((item) => item.role === 'MEMBER')?.id ?? users[0]?.id ?? ''
          }
    );
  }, [users]);

  useEffect(() => {
    setEditPlan({
      objective: selectedPlanForEdit.objective,
      ownerId: selectedPlanForEdit.ownerId,
      status: selectedPlanForEdit.status,
      title: selectedPlanForEdit.title
    });
  }, [selectedPlanForEdit]);

  const handleConnect = (connection: Connection) =>
    setEdges((currentEdges) =>
      addEdge(
        {
          ...connection,
          animated: true,
          className: 'pdi-edge-solid',
          id: crypto.randomUUID(),
          label: '',
          labelBgBorderRadius: 6,
          labelBgPadding: [8, 4],
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
          labelStyle: { fill: '#64748b', fontWeight: 700 },
          sourceHandle: connection.sourceHandle,
          style: { stroke: '#64748b', strokeWidth: 2 },
          targetHandle: connection.targetHandle,
          type: 'smoothstep'
        },
        currentEdges
      )
    );

  const handleCreateNode = (kind: CanvasNodeKind, variant?: CanvasShapeVariant) => {
    setNodes((currentNodes) => currentNodes.concat(createNode(kind, currentNodes.length, variant)));
    if (kind === 'SHAPE') setIsShapeToolOpen(false);
  };

  const handleNodeDragStop: OnNodeDrag<Node<CanvasNodeData>> = (_event, draggedNode) => {
    if (draggedNode.data.kind === 'FRAME') return;

    setNodes((currentNodes) => {
      const currentDraggedNode = currentNodes.find((node) => node.id === draggedNode.id);
      if (!currentDraggedNode) return currentNodes;

      const targetFrame = findContainingFrame(currentDraggedNode, currentNodes);
      const draggedPosition = getAbsoluteNodePosition(currentDraggedNode, currentNodes);

      if (!targetFrame && currentDraggedNode.parentId) {
        return orderFrameParentsFirst(
          currentNodes.map((node) =>
            node.id === currentDraggedNode.id
              ? {
                  ...node,
                  parentId: undefined,
                  position: draggedPosition,
                  zIndex: 10
                }
              : node
          )
        );
      }

      if (!targetFrame || currentDraggedNode.parentId === targetFrame.id) return currentNodes;

      const framePosition = getAbsoluteNodePosition(targetFrame, currentNodes);

      return orderFrameParentsFirst(
        currentNodes.map((node) =>
          node.id === currentDraggedNode.id
            ? {
                ...node,
                parentId: targetFrame.id,
                position: {
                  x: draggedPosition.x - framePosition.x,
                  y: draggedPosition.y - framePosition.y
                },
                zIndex: 10
              }
            : node
        )
      );
    });
  };

  const updateSelectedNodeStyle = (input: Partial<Pick<CanvasNodeData, 'backgroundColor' | 'color'>>) => {
    if (!selectedNode) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                ...input
              },
              style: {
                ...node.style,
                backgroundColor: input.backgroundColor ?? node.style?.backgroundColor,
                borderColor: input.color ?? node.style?.borderColor
              }
            }
          : node
      )
    );
  };

  const updateSelectedTextStyle = (input: Partial<CanvasTextStyle>) => {
    if (!selectedNode) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                textStyle: {
                  ...node.data.textStyle,
                  ...input
                }
              }
            }
          : node
      )
    );
  };

  const updateSelectedEdge = (input: {
    color?: string;
    label?: string;
    lineStyle?: CanvasEdgeLineStyle;
    type?: CanvasEdgeType;
  }) => {
    if (!selectedEdge) return;

    setEdges((currentEdges) =>
      currentEdges.map((edge) =>
        edge.id === selectedEdge.id
          ? {
              ...edge,
              className:
                input.lineStyle === 'dashed'
                  ? 'pdi-edge-dashed'
                  : input.lineStyle === 'solid'
                    ? 'pdi-edge-solid'
                    : edge.className,
              label: input.label ?? edge.label,
              labelStyle: {
                ...edge.labelStyle,
                fill: input.color ?? (typeof edge.style?.stroke === 'string' ? edge.style.stroke : '#64748b'),
                fontWeight: 700
              },
              style: {
                ...edge.style,
                stroke: input.color ?? edge.style?.stroke ?? '#64748b',
                strokeWidth: 2
              },
              type: input.type ?? edge.type ?? 'smoothstep'
            }
          : edge
      )
    );
  };

  const handleCreateUser = (event: FormEvent) => {
    event.preventDefault();
    onCreateUser(newUser);
    setNewUser({ email: '', name: '', password: generateTemporaryPassword(), role: 'MEMBER' });
  };

  const handleCreatePlan = (event: FormEvent) => {
    event.preventDefault();
    const ownerId = newPlan.ownerId || users.find((item) => item.role === 'MEMBER')?.id || users[0]?.id;

    if (!ownerId) return;

    onCreatePlan({
      objective: newPlan.objective,
      ownerId,
      title: newPlan.title
    });
    setNewPlan({ objective: '', ownerId, title: '' });
  };

  const handleUpdatePlan = (event: FormEvent) => {
    event.preventDefault();
    onUpdatePlan(selectedPlanForEdit.id, editPlan);
  };

  const handleDeletePlan = (targetPlan: PdiPlan = selectedPlanForEdit) => {
    const canDelete = window.confirm(`Remove "${targetPlan.title}" and its board?`);

    if (canDelete) {
      onDeletePlan(targetPlan.id);
    }
  };

  return (
    <div className="canvas-shell">
      <header className="canvas-header">
        <div className="canvas-title">
          <span>PDI Portal</span>
          <div className="plan-picker">
            <select aria-label="Select PDI plan" onChange={(event) => onSelectPlan(event.target.value)} value={plan.id}>
              {plans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                  {ownerById.get(item.ownerId) ? ` - ${ownerById.get(item.ownerId)?.name}` : ''}
                </option>
              ))}
            </select>
            <button
              disabled={isCreatingPlan}
              onClick={() =>
                onCreatePlan({
                  objective: 'Define a measurable development outcome.',
                  ownerId: users.find((candidate) => candidate.role === 'MEMBER')?.id,
                  title: 'New PDI plan'
                })
              }
              title="Create PDI plan"
              type="button"
            >
              <Plus size={17} />
            </button>
          </div>
          <p>
            {plan.objective}
            {planOwner ? ` Owner: ${planOwner.name}` : ''}
          </p>
        </div>

        <div className="canvas-header-actions">
          <button className="save-board" onClick={() => saveBoard.mutate()} type="button">
            <Save size={17} />
            {saveBoard.isPending ? 'Saving' : 'Save board'}
          </button>

          {user.role === 'ADMIN' ? (
            <details className="admin-menu">
              <summary>
                <UserCircle2 size={21} />
                <span>Users</span>
                <ChevronDown size={16} />
              </summary>
              <div className="admin-menu-panel">
                <section>
                  <div className="admin-panel-title">
                    <strong>Users</strong>
                    <span>{usersCount} registered</span>
                  </div>
                  <div className="admin-user-list">
                    {users.map((item) => (
                      <div key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.email}</span>
                        </div>
                        <small>{item.role}</small>
                      </div>
                    ))}
                  </div>
                </section>

                <form onSubmit={handleCreateUser}>
                  <strong>New user</strong>
                  <input
                    onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Name"
                    required
                    value={newUser.name}
                  />
                  <input
                    onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))}
                    placeholder="Email"
                    required
                    type="email"
                    value={newUser.email}
                  />
                  <div className="temporary-password-field">
                    <input
                      minLength={6}
                      onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))}
                      placeholder="Temporary password"
                      required
                      type="text"
                      value={newUser.password}
                    />
                    <button
                      onClick={() =>
                        setNewUser((current) => ({ ...current, password: generateTemporaryPassword() }))
                      }
                      title="Generate temporary password"
                      type="button"
                    >
                      <Sparkles size={15} />
                    </button>
                  </div>
                  <select
                    onChange={(event) =>
                      setNewUser((current) => ({ ...current, role: event.target.value as User['role'] }))
                    }
                    value={newUser.role}
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <button disabled={isCreatingUser} type="submit">
                    {isCreatingUser ? 'Creating user' : 'Create user'}
                  </button>
                </form>
              </div>
            </details>
          ) : null}

          {user.role === 'ADMIN' ? (
            <details className="admin-menu">
              <summary>
                <Pencil size={19} />
                <span>PDIs</span>
                <ChevronDown size={16} />
              </summary>
              <div className="admin-menu-panel admin-pdi-menu-panel">
                <section>
                  <div className="admin-panel-title">
                    <strong>PDIs</strong>
                    <span>{plans.length} plans</span>
                  </div>
                  <div className="admin-pdi-list">
                    {plans.map((item) => {
                      const owner = ownerById.get(item.ownerId);

                      return (
                        <div className={item.id === selectedPlanForEdit.id ? 'is-active' : ''} key={item.id}>
                          <button
                            className="admin-pdi-select"
                            onClick={() => setEditingPlanId(item.id)}
                            type="button"
                          >
                            <Pencil size={14} />
                            <span>{item.title}</span>
                            <small>
                              {owner?.name ?? 'No owner'} - {item.status}
                            </small>
                          </button>
                          <button
                            className="admin-pdi-remove"
                            disabled={isDeletingPlan}
                            onClick={() => handleDeletePlan(item)}
                            title="Remove PDI"
                            type="button"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <form onSubmit={handleCreatePlan}>
                  <strong>New PDI</strong>
                  <select
                    onChange={(event) => setNewPlan((current) => ({ ...current, ownerId: event.target.value }))}
                    required
                    value={newPlan.ownerId}
                  >
                    <option value="">Select owner</option>
                    {users.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <input
                    onChange={(event) => setNewPlan((current) => ({ ...current, title: event.target.value }))}
                    placeholder="PDI title"
                    required
                    value={newPlan.title}
                  />
                  <textarea
                    onChange={(event) => setNewPlan((current) => ({ ...current, objective: event.target.value }))}
                    placeholder="Development objective"
                    required
                    value={newPlan.objective}
                  />
                  <button disabled={isCreatingPlan} type="submit">
                    {isCreatingPlan ? 'Creating PDI' : 'Create linked PDI'}
                  </button>
                </form>

                <form onSubmit={handleUpdatePlan}>
                  <strong>Edit PDI</strong>
                  <select
                    onChange={(event) => setEditPlan((current) => ({ ...current, ownerId: event.target.value }))}
                    required
                    value={editPlan.ownerId}
                  >
                    {users.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <select
                    onChange={(event) =>
                      setEditPlan((current) => ({ ...current, status: event.target.value as PdiPlan['status'] }))
                    }
                    value={editPlan.status}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="ACTIVE">Active</option>
                    <option value="DONE">Done</option>
                  </select>
                  <input
                    onChange={(event) => setEditPlan((current) => ({ ...current, title: event.target.value }))}
                    placeholder="PDI title"
                    required
                    value={editPlan.title}
                  />
                  <textarea
                    onChange={(event) => setEditPlan((current) => ({ ...current, objective: event.target.value }))}
                    placeholder="Development objective"
                    required
                    value={editPlan.objective}
                  />
                  <div className="admin-form-actions">
                    <button disabled={isUpdatingPlan} type="submit">
                      {isUpdatingPlan ? 'Saving PDI' : 'Save changes'}
                    </button>
                    <button
                      className="danger"
                      disabled={isDeletingPlan}
                      onClick={() => handleDeletePlan()}
                      title="Remove PDI"
                      type="button"
                    >
                      <Trash2 size={16} />
                      {isDeletingPlan ? 'Removing' : 'Remove'}
                    </button>
                  </div>
                </form>
              </div>
            </details>
          ) : null}

          <details className="user-menu">
            <summary aria-label="Open user menu">
              <UserCircle2 size={24} />
              <span>{user.name}</span>
              <ChevronDown size={16} />
            </summary>
            <div className="user-menu-panel">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
              <small>{user.role === 'ADMIN' ? `${usersCount} users managed` : 'Personal workspace'}</small>
              <button onClick={onLogout} type="button">
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </details>
        </div>
      </header>

      <div className="canvas-toolbar" aria-label="Canvas tools">
        <button className="is-passive" title="Select and move nodes" type="button">
          <MousePointer2 size={17} />
          <span>Select</span>
        </button>
        {nodeKindOrder.map((kind) => {
          const meta = nodeKindMeta[kind];
          const Icon = meta.icon;

          if (kind === 'SHAPE') {
            return (
              <details
                className="shape-tool"
                key={kind}
                onToggle={(event) => setIsShapeToolOpen(event.currentTarget.open)}
                open={isShapeToolOpen}
              >
                <summary title="Add shape">
                  <Icon size={18} />
                  <span>{meta.label}</span>
                  <small>{meta.action}</small>
                </summary>
                <div className="shape-tool-panel">
                  {shapeVariantOrder.map((variant) => {
                    const shapeMeta = shapeVariantMeta[variant];
                    const ShapeIcon = shapeMeta.icon;

                    return (
                      <button
                        key={variant}
                        onClick={() => handleCreateNode('SHAPE', variant)}
                        title={`Add ${shapeMeta.label}`}
                        type="button"
                      >
                        <ShapeIcon size={17} />
                        <span>{shapeMeta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </details>
            );
          }

          return (
            <button key={kind} onClick={() => handleCreateNode(kind)} title={`Add ${meta.label}`} type="button">
              <Icon size={18} />
              <span>{meta.label}</span>
              <small>{meta.action}</small>
            </button>
          );
        })}
        <button className="is-passive" title="Connect nodes by dragging handles" type="button">
          <Diamond size={17} />
          <span>Connect</span>
        </button>
        {selectedNode ? (
          <div className="node-style-panel" aria-label="Selected item style">
            <label title="Change selected item color">
              <span>Stroke</span>
              <input
                onChange={(event) => updateSelectedNodeStyle({ color: event.target.value })}
                type="color"
                value={selectedNode.data.color}
              />
            </label>
            {selectedNode.data.kind === 'FRAME' ? (
              <label title="Change frame background">
                <span>Bg</span>
                <input
                  onChange={(event) => updateSelectedNodeStyle({ backgroundColor: event.target.value })}
                  type="color"
                  value={selectedNode.data.backgroundColor ?? '#f8fafc'}
                />
              </label>
            ) : null}
            <div className="text-format-group" aria-label="Text emphasis">
              <button
                className={selectedNode.data.textStyle?.bold ? 'is-active' : ''}
                onClick={() => updateSelectedTextStyle({ bold: !selectedNode.data.textStyle?.bold })}
                title="Bold"
                type="button"
              >
                <Bold size={14} />
              </button>
              <button
                className={selectedNode.data.textStyle?.italic ? 'is-active' : ''}
                onClick={() => updateSelectedTextStyle({ italic: !selectedNode.data.textStyle?.italic })}
                title="Italic"
                type="button"
              >
                <Italic size={14} />
              </button>
              <button
                className={selectedNode.data.textStyle?.underline ? 'is-active' : ''}
                onClick={() => updateSelectedTextStyle({ underline: !selectedNode.data.textStyle?.underline })}
                title="Underline"
                type="button"
              >
                <Underline size={14} />
              </button>
            </div>
            <div className="text-format-group" aria-label="Text alignment">
              {[
                { align: 'left' as const, icon: AlignLeft, title: 'Align left' },
                { align: 'center' as const, icon: AlignCenter, title: 'Align center' },
                { align: 'right' as const, icon: AlignRight, title: 'Align right' }
              ].map((item) => {
                const AlignIcon = item.icon;

                return (
                  <button
                    className={(selectedNode.data.textStyle?.align ?? 'left') === item.align ? 'is-active' : ''}
                    key={item.align}
                    onClick={() => updateSelectedTextStyle({ align: item.align })}
                    title={item.title}
                    type="button"
                  >
                    <AlignIcon size={14} />
                  </button>
                );
              })}
            </div>
            <div className="text-format-group" aria-label="Vertical alignment">
              {[
                { icon: AlignVerticalJustifyStart, title: 'Align top', verticalAlign: 'top' as const },
                { icon: AlignVerticalJustifyCenter, title: 'Align middle', verticalAlign: 'center' as const },
                { icon: AlignVerticalJustifyEnd, title: 'Align bottom', verticalAlign: 'bottom' as const }
              ].map((item) => {
                const VerticalAlignIcon = item.icon;

                return (
                  <button
                    className={(selectedNode.data.textStyle?.verticalAlign ?? 'top') === item.verticalAlign ? 'is-active' : ''}
                    key={item.verticalAlign}
                    onClick={() => updateSelectedTextStyle({ verticalAlign: item.verticalAlign })}
                    title={item.title}
                    type="button"
                  >
                    <VerticalAlignIcon size={14} />
                  </button>
                );
              })}
            </div>
            <label className="font-size-control" title="Font size">
              <span>Size</span>
              <input
                max={96}
                min={8}
                onChange={(event) => updateSelectedTextStyle({ fontSize: Number(event.target.value) })}
                type="number"
                value={selectedNode.data.textStyle?.fontSize ?? ''}
              />
            </label>
          </div>
        ) : null}
        {selectedEdge && !selectedNode ? (
          <div className="edge-style-panel" aria-label="Selected connector style">
            <label title="Connector text">
              <span>Text</span>
              <input
                onChange={(event) => updateSelectedEdge({ label: event.target.value })}
                placeholder="Label"
                type="text"
                value={typeof selectedEdge.label === 'string' ? selectedEdge.label : ''}
              />
            </label>
            <label title="Connector color">
              <span>Color</span>
              <input
                onChange={(event) => updateSelectedEdge({ color: event.target.value })}
                type="color"
                value={typeof selectedEdge.style?.stroke === 'string' ? selectedEdge.style.stroke : '#64748b'}
              />
            </label>
            <label title="Connector type">
              <span>Type</span>
              <select
                onChange={(event) => updateSelectedEdge({ type: event.target.value as CanvasEdgeType })}
                value={(selectedEdge.type ?? 'smoothstep') as CanvasEdgeType}
              >
                <option value="smoothstep">Smooth</option>
                <option value="straight">Straight</option>
                <option value="step">Step</option>
                <option value="default">Bezier</option>
              </select>
            </label>
            <label title="Connector line style">
              <span>Line</span>
              <select
                onChange={(event) => updateSelectedEdge({ lineStyle: event.target.value as CanvasEdgeLineStyle })}
                value={selectedEdge.className?.includes('pdi-edge-dashed') ? 'dashed' : 'solid'}
              >
                <option value="solid">Line</option>
                <option value="dashed">Dashed</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>

      <div className="canvas-stage">
        <ReactFlow
          connectionMode={ConnectionMode.Loose}
          edges={edges}
          fitView
          nodes={nodes}
          nodeTypes={nodeTypes}
          minZoom={0.2}
          multiSelectionKeyCode={null}
          onConnect={handleConnect}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={handleNodeDragStop}
          onNodesChange={onNodesChange}
          panOnDrag={[1, 2]}
          panOnScroll
          selectionMode={SelectionMode.Partial}
          selectionOnDrag
        >
          <Background color="#d8dee8" gap={24} size={1} variant={BackgroundVariant.Dots} />
          <Controls position="bottom-right" />
        </ReactFlow>
      </div>
    </div>
  );
};
