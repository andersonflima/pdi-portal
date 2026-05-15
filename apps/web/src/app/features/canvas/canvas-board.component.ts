import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild
} from '@angular/core';
import type { CanvasNodeKind, CanvasShapeVariant, PdiPlan, User } from '@pdi/contracts';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api/api.service';
import { CanvasEdgeLayerComponent } from './components/canvas-edge-layer.component';
import { CanvasHeaderComponent } from './components/canvas-header.component';
import { CanvasNodeComponent } from './components/canvas-node.component';
import { CanvasToolbarComponent } from './components/canvas-toolbar.component';
import { canvasSize } from './canvas.constants';
import { findContainingFrame, getNodeCenter, isPointInsideNode } from './canvas.geometry';
import { createCanvasNode, toCanvasEdges, toCanvasNodes, toSaveBoard } from './canvas.mappers';
import type {
  CanvasEdgePatch,
  CanvasEdgeView,
  CanvasHandlePosition,
  CanvasNodeDataPatch,
  CanvasNodeStylePatch,
  CanvasNodeView,
  CanvasTextStyle,
  XYPosition
} from './canvas.models';

type ConnectorDraft = {
  sourceHandle: CanvasHandlePosition;
  sourceNodeId: string;
  sourcePoint: XYPosition;
  targetPoint: XYPosition;
};

type MarqueeSelectionDraft = {
  append: boolean;
  current: XYPosition;
  origin: XYPosition;
};

const minZoom = 0.4;
const maxZoom = 1.6;
const zoomStep = 0.1;
const dragStartThreshold = 4;
const frameLayerMax = 999;
const objectLayerBase = 1000;
const autosaveDelayMs = 1200;
const marqueeStartThreshold = 6;
const minimapWidth = 240;
const minimapHeight = Math.round((minimapWidth * canvasSize.height) / canvasSize.width);

const roundZoom = (value: number) => Math.round(value * 100) / 100;

const clampZoom = (value: number) => Math.min(maxZoom, Math.max(minZoom, roundZoom(value)));

const clampPointToCanvas = (point: XYPosition): XYPosition => ({
  x: Math.min(canvasSize.width, Math.max(0, point.x)),
  y: Math.min(canvasSize.height, Math.max(0, point.y))
});

const toSelectionBounds = (first: XYPosition, second: XYPosition) => ({
  bottom: Math.max(first.y, second.y),
  left: Math.min(first.x, second.x),
  right: Math.max(first.x, second.x),
  top: Math.min(first.y, second.y)
});

const toLiveWebSocketUrl = (apiUrl: string, pdiPlanId: string, clientId: string, token: string | null) => {
  const url = new URL(apiUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/pdi-plans/${pdiPlanId}/board/live`;
  url.searchParams.set('clientId', clientId);
  url.searchParams.set('token', token ?? '');

  return url.toString();
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target.closest('input') !== null ||
    target.closest('textarea') !== null ||
    target.closest('select') !== null
  );
};

const toConnectorPath = (source: XYPosition, target: XYPosition) => {
  const curveOffset = Math.max(80, Math.abs(target.x - source.x) / 2);

  return `M ${source.x} ${source.y} C ${source.x + curveOffset} ${source.y}, ${target.x - curveOffset} ${target.y}, ${target.x} ${target.y}`;
};

const toConnectorHandlePoint = (node: CanvasNodeView, handle: CanvasHandlePosition): XYPosition => {
  const center = getNodeCenter(node);

  if (handle === 'top') return { x: center.x, y: node.position.y };
  if (handle === 'right') return { x: node.position.x + node.width, y: center.y };
  if (handle === 'bottom') return { x: center.x, y: node.position.y + node.height };

  return { x: node.position.x, y: center.y };
};

const toClosestHandle = (node: CanvasNodeView, point: XYPosition): CanvasHandlePosition => {
  const center = getNodeCenter(node);
  const horizontalDistance = point.x - center.x;
  const verticalDistance = point.y - center.y;

  if (Math.abs(horizontalDistance) > Math.abs(verticalDistance)) {
    return horizontalDistance < 0 ? 'left' : 'right';
  }

  return verticalDistance < 0 ? 'top' : 'bottom';
};

const findDescendantNodeIds = (rootId: string, nodes: CanvasNodeView[]) => {
  const childrenByParent = nodes.reduce((accumulator, node) => {
    if (!node.parentId) return accumulator;

    return new Map(accumulator).set(node.parentId, [...(accumulator.get(node.parentId) ?? []), node.id]);
  }, new Map<string, string[]>());

  const collect = (queue: string[], collected: Set<string>): Set<string> => {
    if (queue.length === 0) return collected;

    const head = queue[0];
    const tail = queue.slice(1);

    if (!head) return collected;

    if (collected.has(head)) return collect(tail, collected);

    const children = childrenByParent.get(head) ?? [];

    return collect([...tail, ...children], new Set(collected).add(head));
  };

  return Array.from(collect([rootId], new Set<string>()));
};

const findTopNodeAtPoint = (point: XYPosition, nodes: CanvasNodeView[], excludedNodeId: string) =>
  [...nodes]
    .filter((node) => node.id !== excludedNodeId)
    .sort((leftNode, rightNode) => {
      const leftLayer = leftNode.kind === 'FRAME' ? Math.min(frameLayerMax, leftNode.zIndex) : Math.max(objectLayerBase, leftNode.zIndex);
      const rightLayer =
        rightNode.kind === 'FRAME' ? Math.min(frameLayerMax, rightNode.zIndex) : Math.max(objectLayerBase, rightNode.zIndex);

      return rightLayer - leftLayer;
    })
    .find((node) => isPointInsideNode(point, node));

@Component({
  selector: 'app-canvas-board',
  standalone: true,
  imports: [CanvasEdgeLayerComponent, CanvasHeaderComponent, CanvasNodeComponent, CanvasToolbarComponent, LucideAngularModule],
  templateUrl: './canvas-board.component.html',
  styleUrl: './canvas-board.component.css'
})
export class CanvasBoardComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) isCreatingPlan = false;
  @Input({ required: true }) isCreatingUser = false;
  @Input({ required: true }) isDeletingPlan = false;
  @Input({ required: true }) isExportingPlan = false;
  @Input({ required: true }) isImportingPlan = false;
  @Input({ required: true }) isUpdatingPlan = false;
  @Input({ required: true }) plan!: PdiPlan;
  @Input({ required: true }) plans: PdiPlan[] = [];
  @Input({ required: true }) user!: User;
  @Input({ required: true }) users: User[] = [];
  @Input({ required: true }) usersCount = 0;

  readonly createPlan = output<{ objective: string; ownerId?: string; title: string }>();
  readonly createUser = output<{ email: string; name: string; password: string; role: User['role'] }>();
  readonly deletePlan = output<string>();
  readonly exportPlan = output<string>();
  readonly importPlan = output<File>();
  readonly logout = output<void>();
  readonly selectPlan = output<string>();
  readonly updatePlan = output<{ id: string; data: Partial<Pick<PdiPlan, 'objective' | 'ownerId' | 'status' | 'title'>> }>();

  private readonly api = inject(ApiService);
  private readonly stageElement = viewChild<ElementRef<HTMLDivElement>>('canvasStage');
  private readonly planeElement = viewChild<ElementRef<HTMLDivElement>>('canvasPlane');
  private readonly clientId = crypto.randomUUID();
  private socket: WebSocket | null = null;
  private loadToken = 0;
  private isApplyingRemoteBoard = false;
  private lastPersistedPlanId: string | null = null;
  private lastPersistedBoardSnapshot: string | null = null;
  private isPersistingBoard = false;
  private queuedAutosaveSnapshot: { board: ReturnType<typeof toSaveBoard>; planId: string; snapshot: string } | null = null;

  protected readonly canvasSize = canvasSize;
  protected readonly minimapSize = { height: minimapHeight, width: minimapWidth };
  protected readonly activeConnector = signal<ConnectorDraft | null>(null);
  protected readonly boardTitle = signal('');
  protected readonly connectorSourceId = signal<string | null>(null);
  protected readonly currentPlanId = signal<string | null>(null);
  protected readonly edges = signal<CanvasEdgeView[]>([]);
  protected readonly isPanning = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly marqueeSelection = signal<MarqueeSelectionDraft | null>(null);
  protected readonly nodes = signal<CanvasNodeView[]>([]);
  protected readonly selectedEdgeId = signal<string | null>(null);
  protected readonly selectedNodeIds = signal<string[]>([]);
  protected readonly selectedNodeId = signal<string | null>(null);
  protected readonly stageViewport = signal({ height: 0, left: 0, top: 0, width: 0 });
  protected readonly zoom = signal(1);

  protected readonly selectedNode = computed(() => this.nodes().find((node) => node.id === this.selectedNodeId()) ?? null);
  protected readonly selectedEdge = computed(() => this.edges().find((edge) => edge.id === this.selectedEdgeId()) ?? null);
  protected readonly selectedNodeIdSet = computed(() => new Set(this.selectedNodeIds()));
  protected readonly nodeStackLevel = (node: CanvasNodeView) =>
    node.kind === 'FRAME' ? Math.min(frameLayerMax, node.zIndex) : Math.max(objectLayerBase, node.zIndex);
  protected readonly renderedNodes = computed(() =>
    [...this.nodes()].sort((leftNode, rightNode) => {
      const leftLayer = this.nodeStackLevel(leftNode);
      const rightLayer = this.nodeStackLevel(rightNode);

      if (leftLayer !== rightLayer) {
        return leftLayer - rightLayer;
      }

      if (leftNode.kind === 'FRAME' && rightNode.kind !== 'FRAME') return -1;
      if (leftNode.kind !== 'FRAME' && rightNode.kind === 'FRAME') return 1;

      return 0;
    })
  );
  protected readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  protected readonly minimapScale = computed(() => minimapWidth / canvasSize.width);
  protected readonly minimapNodes = computed(() => {
    const scale = this.minimapScale();

    return this.nodes().map((node) => ({
      height: Math.max(2, node.height * scale),
      id: node.id,
      isSelected: this.selectedNodeIdSet().has(node.id),
      width: Math.max(2, node.width * scale),
      x: node.position.x * scale,
      y: node.position.y * scale
    }));
  });
  protected readonly minimapViewport = computed(() => {
    const scale = this.minimapScale();
    const viewport = this.stageViewport();

    return {
      height: Math.max(6, viewport.height * scale),
      width: Math.max(6, viewport.width * scale),
      x: viewport.left * scale,
      y: viewport.top * scale
    };
  });
  protected readonly marqueeBoxStyle = computed(() => {
    const selection = this.marqueeSelection();

    if (!selection) return null;

    const bounds = toSelectionBounds(selection.origin, selection.current);

    return {
      height: `${bounds.bottom - bounds.top}px`,
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.right - bounds.left}px`
    };
  });

  constructor() {
    effect((onCleanup) => {
      const planId = this.currentPlanId();
      const title = this.boardTitle();
      const nodes = this.nodes();
      const edges = this.edges();

      if (!planId || !title || this.isApplyingRemoteBoard) return;

      const timeoutId = window.setTimeout(() => {
        this.sendLiveBoard(planId, title, nodes, edges);
      }, 180);

      onCleanup(() => window.clearTimeout(timeoutId));
    });

    effect((onCleanup) => {
      const planId = this.currentPlanId();
      const title = this.boardTitle();
      const nodes = this.nodes();
      const edges = this.edges();

      if (!planId || !title || this.isApplyingRemoteBoard) return;

      const board = toSaveBoard(title || this.plan.title, nodes, edges);
      const snapshot = JSON.stringify(board);

      if (this.lastPersistedPlanId === planId && this.lastPersistedBoardSnapshot === snapshot) return;

      const timeoutId = window.setTimeout(() => {
        void this.persistBoard(planId, board, snapshot);
      }, autosaveDelayMs);

      onCleanup(() => window.clearTimeout(timeoutId));
    });

    effect((onCleanup) => {
      this.zoom();
      this.nodes();
      this.edges();
      this.selectedNodeIds();

      const frameId = window.requestAnimationFrame(() => {
        this.syncStageViewport();
      });

      onCleanup(() => window.cancelAnimationFrame(frameId));
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['plan']?.currentValue && this.plan.id !== this.currentPlanId()) {
      void this.loadBoard(this.plan.id);
    }
  }

  ngOnDestroy() {
    this.closeLiveConnection();
  }

  @HostListener('window:keydown', ['$event'])
  protected readonly handleWindowKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (isEditableTarget(event.target)) return;

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const hasRemovedEdge = this.removeSelectedEdge();
      const hasRemovedNode = hasRemovedEdge ? false : this.removeSelectedNode();

      if (!hasRemovedEdge && !hasRemovedNode) return;

      event.preventDefault();
      return;
    }

    if (event.key === 'PageUp') {
      const hasMoved = event.shiftKey ? this.moveSelectedNodeOneLayerForward() : this.bringSelectedNodeToFront();
      if (!hasMoved) return;

      event.preventDefault();
      return;
    }

    if (event.key === 'PageDown') {
      const hasMoved = event.shiftKey ? this.moveSelectedNodeOneLayerBackward() : this.sendSelectedNodeToBack();
      if (!hasMoved) return;

      event.preventDefault();
    }
  };

  protected readonly clearSelection = () => {
    this.selectedNodeIds.set([]);
    this.selectedNodeId.set(null);
    this.selectedEdgeId.set(null);
    this.connectorSourceId.set(null);
    this.activeConnector.set(null);
    this.marqueeSelection.set(null);
  };

  protected readonly handleCreateNode = (event: { kind: CanvasNodeKind; variant?: CanvasShapeVariant }) => {
    this.nodes.update((currentNodes) =>
      currentNodes.concat(createCanvasNode(event.kind, currentNodes, currentNodes.length, event.variant))
    );
  };

  protected readonly handlePlanePointerDown = (event: PointerEvent) => {
    if (event.target !== event.currentTarget) return;

    if (event.button === 1) {
      this.startCanvasPan(event);
      return;
    }

    if (event.button !== 0) return;

    this.startMarqueeSelection(event);
  };

  protected readonly handleStageWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;

    event.preventDefault();

    const currentZoom = this.zoom();
    const nextZoom = clampZoom(currentZoom + (event.deltaY < 0 ? zoomStep : -zoomStep));
    this.applyZoom(nextZoom, { clientX: event.clientX, clientY: event.clientY });
  };

  protected readonly handleNodePointerDown = (event: PointerEvent, node: CanvasNodeView) => {
    if (event.button !== 0) return;

    event.stopPropagation();

    const connectorSourceId = this.connectorSourceId();

    if (connectorSourceId && connectorSourceId !== node.id) {
      this.createConnector(connectorSourceId, node.id);
      this.connectorSourceId.set(null);
      this.selectedNodeIds.set([]);
      this.selectedNodeId.set(null);
      return;
    }

    const isAdditiveSelection = event.shiftKey || event.metaKey || event.ctrlKey;

    if (isAdditiveSelection) {
      this.toggleNodeSelection(node.id);
      this.selectedEdgeId.set(null);
      return;
    }

    const selectedNodeIdSet = this.selectedNodeIdSet();

    if (!selectedNodeIdSet.has(node.id) || selectedNodeIdSet.size <= 1) {
      this.selectedNodeIds.set([node.id]);
    }

    this.selectedNodeId.set(node.id);
    this.selectedEdgeId.set(null);
    this.bringSelectedNodeToFront();
    this.startNodeDrag(event, node);
  };

  protected readonly startConnectorDrag = (
    payload: { event: PointerEvent; handle: CanvasHandlePosition },
    node: CanvasNodeView
  ) => {
    const sourcePoint = toConnectorHandlePoint(node, payload.handle);
    const initialTargetPoint = this.toCanvasPoint(payload.event.clientX, payload.event.clientY) ?? sourcePoint;

    this.selectedNodeIds.set([node.id]);
    this.selectedNodeId.set(node.id);
    this.selectedEdgeId.set(null);
    this.connectorSourceId.set(null);
    this.activeConnector.set({
      sourceHandle: payload.handle,
      sourceNodeId: node.id,
      sourcePoint,
      targetPoint: initialTargetPoint
    });

    const handleMove = (moveEvent: PointerEvent) => {
      const nextTargetPoint = this.toCanvasPoint(moveEvent.clientX, moveEvent.clientY);

      if (!nextTargetPoint) return;

      this.activeConnector.update((currentConnector) =>
        currentConnector
          ? {
              ...currentConnector,
              targetPoint: nextTargetPoint
            }
          : currentConnector
      );
    };

    const handleEnd = (endEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);

      const connector = this.activeConnector();

      this.activeConnector.set(null);

      if (!connector) return;

      const dropPoint = this.toCanvasPoint(endEvent.clientX, endEvent.clientY) ?? connector.targetPoint;
      const targetNode = findTopNodeAtPoint(dropPoint, this.nodes(), connector.sourceNodeId);

      if (!targetNode || targetNode.id === connector.sourceNodeId) return;

      const targetHandle = toClosestHandle(targetNode, dropPoint);

      this.createConnector(
        connector.sourceNodeId,
        targetNode.id,
        `${connector.sourceHandle}-source`,
        `${targetHandle}-target`
      );
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd, { once: true });
  };

  protected readonly connectorPreviewPath = (connector: ConnectorDraft) =>
    toConnectorPath(connector.sourcePoint, connector.targetPoint);

  protected readonly handleSelectEdge = (edgeId: string) => {
    this.selectedEdgeId.set(edgeId);
    this.selectedNodeIds.set([]);
    this.selectedNodeId.set(null);
    this.connectorSourceId.set(null);
  };

  protected readonly handleToggleConnectorMode = () => {
    const selectedNode = this.selectedNode();

    if (!selectedNode) return;

    this.connectorSourceId.set(this.connectorSourceId() === selectedNode.id ? null : selectedNode.id);
  };

  protected readonly zoomIn = () => {
    this.applyZoom(clampZoom(this.zoom() + zoomStep));
  };

  protected readonly zoomOut = () => {
    this.applyZoom(clampZoom(this.zoom() - zoomStep));
  };

  protected readonly resetZoom = () => {
    this.applyZoom(1);
  };

  protected readonly handleStageScroll = () => {
    this.syncStageViewport();
  };

  protected readonly handleMinimapPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const stage = this.stageElement()?.nativeElement;

    if (!stage || event.button !== 0) return;

    const minimapElement = event.currentTarget as HTMLElement | null;

    if (!minimapElement) return;

    const rect = minimapElement.getBoundingClientRect();
    const pointerX = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
    const pointerY = Math.min(rect.height, Math.max(0, event.clientY - rect.top));
    const scale = this.minimapScale();
    const viewport = this.stageViewport();
    const centerX = pointerX / scale;
    const centerY = pointerY / scale;

    const nextCanvasLeft = Math.min(canvasSize.width - viewport.width, Math.max(0, centerX - viewport.width / 2));
    const nextCanvasTop = Math.min(canvasSize.height - viewport.height, Math.max(0, centerY - viewport.height / 2));

    stage.scrollLeft = nextCanvasLeft * this.zoom();
    stage.scrollTop = nextCanvasTop * this.zoom();
    this.syncStageViewport();
  };

  protected readonly updateNodeData = (nodeId: string, input: CanvasNodeDataPatch) => {
    this.nodes.update((nodes) =>
      nodes.map((node) => (node.id === nodeId ? { ...node, ...input } : node))
    );
  };

  protected readonly updateSelectedNodeStyle = (input: CanvasNodeStylePatch) => {
    const selectedNode = this.selectedNode();

    if (!selectedNode) return;

    this.nodes.update((nodes) =>
      nodes.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              backgroundColor: input.backgroundColor ?? node.backgroundColor,
              color: input.color ?? node.color
            }
          : node
      )
    );
  };

  protected readonly updateSelectedTextStyle = (input: Partial<CanvasTextStyle>) => {
    const selectedNode = this.selectedNode();

    if (!selectedNode) return;

    this.nodes.update((nodes) =>
      nodes.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              textStyle: {
                ...node.textStyle,
                ...input
              }
            }
          : node
      )
    );
  };

  protected readonly updateSelectedEdge = (input: CanvasEdgePatch) => {
    const selectedEdge = this.selectedEdge();

    if (!selectedEdge) return;

    this.edges.update((edges) =>
      edges.map((edge) =>
        edge.id === selectedEdge.id
          ? {
              ...edge,
              label: input.label ?? edge.label,
              style: {
                color: input.color ?? edge.style.color,
                lineStyle: input.lineStyle ?? edge.style.lineStyle,
                type: input.type ?? edge.style.type
              }
            }
          : edge
      )
    );
  };

  protected readonly isNodeSelected = (nodeId: string) => this.selectedNodeIdSet().has(nodeId);

  protected readonly startNodeResize = (event: PointerEvent, node: CanvasNodeView) => {
    event.preventDefault();

    const start = { x: event.clientX, y: event.clientY };
    const initialSize = { height: node.height, width: node.width };
    const initialZoom = this.zoom();

    const handleMove = (moveEvent: PointerEvent) => {
      const width = Math.max(96, initialSize.width + (moveEvent.clientX - start.x) / initialZoom);
      const height = Math.max(72, initialSize.height + (moveEvent.clientY - start.y) / initialZoom);
      const shouldKeepAspectRatio = node.kind === 'GOAL' || (node.kind === 'SHAPE' && node.variant === 'CIRCLE');
      const nextSize = shouldKeepAspectRatio ? Math.max(width, height) : null;

      this.nodes.update((nodes) =>
        nodes.map((candidate) =>
          candidate.id === node.id
            ? {
                ...candidate,
                height: nextSize ?? height,
                width: nextSize ?? width
              }
            : candidate
        )
      );
    };

    const handleEnd = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd, { once: true });
  };

  protected readonly saveCurrentBoard = async () => {
    const planId = this.currentPlanId();

    if (!planId) return;

    const board = toSaveBoard(this.boardTitle() || this.plan.title, this.nodes(), this.edges());
    const snapshot = JSON.stringify(board);
    await this.persistBoard(planId, board, snapshot, true);
  };

  private readonly loadBoard = async (planId: string) => {
    const token = ++this.loadToken;
    this.closeLiveConnection();
    this.isApplyingRemoteBoard = true;
    this.boardTitle.set('');
    this.currentPlanId.set(planId);
    this.nodes.set([]);
    this.edges.set([]);
    this.selectedNodeIds.set([]);
    this.selectedNodeId.set(null);
    this.selectedEdgeId.set(null);
    this.activeConnector.set(null);

    try {
      const board = await this.api.board(planId);

      if (token !== this.loadToken) return;

      const boardNodes = toCanvasNodes(board);
      const boardEdges = toCanvasEdges(board);

      this.boardTitle.set(board.title);
      this.nodes.set(boardNodes);
      this.edges.set(boardEdges);
      this.markBoardAsPersisted(planId, board.title, boardNodes, boardEdges);
      this.openLiveConnection(planId);
      this.syncStageViewport();
    } finally {
      if (token === this.loadToken) {
        window.setTimeout(() => {
          this.isApplyingRemoteBoard = false;
        }, 0);
      }
    }
  };

  private readonly openLiveConnection = (planId: string) => {
    const socket = new WebSocket(toLiveWebSocketUrl(this.api.apiUrl, planId, this.clientId, this.api.getToken()));
    this.socket = socket;

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        clientId: string;
        payload: Parameters<typeof toCanvasNodes>[0];
        type: 'BOARD_SYNC';
      };

      if (message.type !== 'BOARD_SYNC' || message.clientId === this.clientId) return;

      this.isApplyingRemoteBoard = true;
      const boardNodes = toCanvasNodes(message.payload);
      const boardEdges = toCanvasEdges(message.payload);

      this.boardTitle.set(message.payload.title);
      this.nodes.set(boardNodes);
      this.edges.set(boardEdges);
      this.markBoardAsPersisted(message.payload.pdiPlanId, message.payload.title, boardNodes, boardEdges);
      this.syncStageViewport();
      window.setTimeout(() => {
        this.isApplyingRemoteBoard = false;
      }, 0);
    });
  };

  private readonly closeLiveConnection = () => {
    this.socket?.close();
    this.socket = null;
  };

  private readonly sendLiveBoard = (planId: string, title: string, nodes: CanvasNodeView[], edges: CanvasEdgeView[]) => {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    this.socket.send(
      JSON.stringify({
        clientId: this.clientId,
        payload: toSaveBoard(title, nodes, edges),
        type: 'BOARD_SYNC'
      })
    );
  };

  private readonly applyZoom = (nextZoom: number, pointer?: { clientX: number; clientY: number }) => {
    const stage = this.stageElement()?.nativeElement;
    const currentZoom = this.zoom();

    if (!stage || nextZoom === currentZoom) return;

    const stageRect = stage.getBoundingClientRect();
    const pointerOffsetX = pointer ? pointer.clientX - stageRect.left : stage.clientWidth / 2;
    const pointerOffsetY = pointer ? pointer.clientY - stageRect.top : stage.clientHeight / 2;
    const clampedPointerOffsetX = Math.min(stage.clientWidth, Math.max(0, pointerOffsetX));
    const clampedPointerOffsetY = Math.min(stage.clientHeight, Math.max(0, pointerOffsetY));
    const canvasX = (stage.scrollLeft + clampedPointerOffsetX) / currentZoom;
    const canvasY = (stage.scrollTop + clampedPointerOffsetY) / currentZoom;

    this.zoom.set(nextZoom);

    const maxScrollLeft = Math.max(0, canvasSize.width * nextZoom - stage.clientWidth);
    const maxScrollTop = Math.max(0, canvasSize.height * nextZoom - stage.clientHeight);

    stage.scrollLeft = Math.min(maxScrollLeft, Math.max(0, canvasX * nextZoom - clampedPointerOffsetX));
    stage.scrollTop = Math.min(maxScrollTop, Math.max(0, canvasY * nextZoom - clampedPointerOffsetY));
    this.syncStageViewport();
  };

  private readonly markBoardAsPersisted = (
    planId: string,
    title: string,
    nodes: CanvasNodeView[],
    edges: CanvasEdgeView[]
  ) => {
    this.lastPersistedPlanId = planId;
    this.lastPersistedBoardSnapshot = JSON.stringify(toSaveBoard(title || this.plan.title, nodes, edges));
  };

  private readonly persistBoard = async (
    planId: string,
    board: ReturnType<typeof toSaveBoard>,
    snapshot: string,
    force = false
  ) => {
    if (!force && this.lastPersistedPlanId === planId && this.lastPersistedBoardSnapshot === snapshot) return;

    if (this.isPersistingBoard) {
      this.queuedAutosaveSnapshot = { board, planId, snapshot };
      return;
    }

    this.isPersistingBoard = true;
    this.isSaving.set(true);

    try {
      const savedBoard = await this.api.saveBoard(planId, board);
      const savedNodes = toCanvasNodes(savedBoard);
      const savedEdges = toCanvasEdges(savedBoard);
      this.markBoardAsPersisted(planId, savedBoard.title, savedNodes, savedEdges);
      this.boardTitle.set(savedBoard.title);
    } finally {
      this.isPersistingBoard = false;
      this.isSaving.set(false);
    }

    const queuedSnapshot = this.queuedAutosaveSnapshot;
    this.queuedAutosaveSnapshot = null;

    if (!queuedSnapshot) return;
    if (this.currentPlanId() !== queuedSnapshot.planId) return;

    await this.persistBoard(queuedSnapshot.planId, queuedSnapshot.board, queuedSnapshot.snapshot);
  };

  private readonly startCanvasPan = (event: PointerEvent) => {
    const stage = this.stageElement()?.nativeElement;

    if (!stage) return;

    event.preventDefault();

    const start = { x: event.clientX, y: event.clientY };
    const initialScroll = { left: stage.scrollLeft, top: stage.scrollTop };

    this.isPanning.set(true);

    const handleMove = (moveEvent: PointerEvent) => {
      stage.scrollLeft = initialScroll.left - (moveEvent.clientX - start.x);
      stage.scrollTop = initialScroll.top - (moveEvent.clientY - start.y);
    };

    const handleEnd = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      this.isPanning.set(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd, { once: true });
  };

  private readonly startNodeDrag = (event: PointerEvent, node: CanvasNodeView) => {
    const nodeIdsToMove = this.resolveNodeIdsToMove(node);
    const initialPositions = new Map(
      this.nodes()
        .filter((candidate) => nodeIdsToMove.has(candidate.id))
        .map((candidate) => [candidate.id, { ...candidate.position }])
    );
    const rootInitialPosition = initialPositions.get(node.id) ?? { ...node.position };
    const start = { x: event.clientX, y: event.clientY };
    const initialZoom = this.zoom();
    let isDragging = false;

    const handleMove = (moveEvent: PointerEvent) => {
      const pointerDeltaX = moveEvent.clientX - start.x;
      const pointerDeltaY = moveEvent.clientY - start.y;

      if (!isDragging && Math.hypot(pointerDeltaX, pointerDeltaY) < dragStartThreshold) {
        return;
      }

      if (!isDragging) {
        isDragging = true;
        moveEvent.preventDefault();
      }

      const rawDeltaX = (moveEvent.clientX - start.x) / initialZoom;
      const rawDeltaY = (moveEvent.clientY - start.y) / initialZoom;
      const deltaX = Math.max(-rootInitialPosition.x, rawDeltaX);
      const deltaY = Math.max(-rootInitialPosition.y, rawDeltaY);

      this.nodes.update((nodes) =>
        nodes.map((candidate) => {
          if (!nodeIdsToMove.has(candidate.id)) return candidate;

          const initialPosition = initialPositions.get(candidate.id) ?? candidate.position;

          return {
            ...candidate,
            position: {
              x: Math.max(0, initialPosition.x + deltaX),
              y: Math.max(0, initialPosition.y + deltaY)
            }
          };
        })
      );
    };

    const handleEnd = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);

      if (isDragging) {
        const nodesById = new Map(this.nodes().map((candidate) => [candidate.id, candidate]));
        const movedNonFrameNodeIds = [...nodeIdsToMove].filter((nodeId) => {
          const candidate = nodesById.get(nodeId);
          return candidate !== undefined && candidate.kind !== 'FRAME';
        });

        this.updateNodeParents(movedNonFrameNodeIds);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd, { once: true });
  };

  private readonly updateNodeParents = (nodeIds: string[]) => {
    if (nodeIds.length === 0) return;

    const nodeIdSet = new Set(nodeIds);

    this.nodes.update((nodes) => {
      return nodes.map((node) =>
        nodeIdSet.has(node.id) && node.kind !== 'FRAME'
          ? {
              ...node,
              parentId: findContainingFrame(node, nodes)?.id
            }
          : node
      );
    });
  };

  private readonly toggleNodeSelection = (nodeId: string) => {
    const selectedIds = this.selectedNodeIds();
    const hasNode = selectedIds.includes(nodeId);
    const nextSelection = hasNode ? selectedIds.filter((id) => id !== nodeId) : [...selectedIds, nodeId];

    this.selectedNodeIds.set(nextSelection);
    this.selectedNodeId.set(nextSelection[nextSelection.length - 1] ?? null);
  };

  private readonly startMarqueeSelection = (event: PointerEvent) => {
    const origin = this.toCanvasPoint(event.clientX, event.clientY);

    if (!origin) {
      this.clearSelection();
      return;
    }

    const append = event.shiftKey || event.metaKey || event.ctrlKey;
    const initialSelection = append ? this.selectedNodeIds() : [];
    let isSelecting = false;

    this.selectedEdgeId.set(null);
    this.connectorSourceId.set(null);
    this.marqueeSelection.set({
      append,
      current: origin,
      origin
    });

    const handleMove = (moveEvent: PointerEvent) => {
      const currentPoint = this.toCanvasPoint(moveEvent.clientX, moveEvent.clientY);

      if (!currentPoint) return;

      const distance = Math.hypot(currentPoint.x - origin.x, currentPoint.y - origin.y);

      if (!isSelecting && distance >= marqueeStartThreshold) {
        isSelecting = true;
      }

      this.marqueeSelection.set({
        append,
        current: currentPoint,
        origin
      });

      if (!isSelecting) return;

      this.applyMarqueeSelection(origin, currentPoint, initialSelection, append);
    };

    const handleEnd = (endEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);

      const releasePoint = this.toCanvasPoint(endEvent.clientX, endEvent.clientY) ?? origin;

      if (!isSelecting) {
        this.marqueeSelection.set(null);
        if (!append) this.clearSelection();
        return;
      }

      this.applyMarqueeSelection(origin, releasePoint, initialSelection, append);
      this.marqueeSelection.set(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd, { once: true });
  };

  private readonly applyMarqueeSelection = (
    origin: XYPosition,
    current: XYPosition,
    initialSelection: string[],
    append: boolean
  ) => {
    const bounds = toSelectionBounds(origin, current);
    const selectedByBounds = this.nodes()
      .filter((node) => {
        const nodeLeft = node.position.x;
        const nodeTop = node.position.y;
        const nodeRight = node.position.x + node.width;
        const nodeBottom = node.position.y + node.height;

        return !(
          nodeRight < bounds.left ||
          nodeLeft > bounds.right ||
          nodeBottom < bounds.top ||
          nodeTop > bounds.bottom
        );
      })
      .map((node) => node.id);

    const nextSelection = append
      ? Array.from(new Set([...initialSelection, ...selectedByBounds]))
      : selectedByBounds;

    this.selectedNodeIds.set(nextSelection);
    this.selectedNodeId.set(nextSelection[nextSelection.length - 1] ?? null);
  };

  private readonly resolveNodeIdsToMove = (draggedNode: CanvasNodeView) => {
    const selectedSet = this.selectedNodeIdSet();
    const nodes = this.nodes();
    const canMoveSelection = selectedSet.size > 1 && selectedSet.has(draggedNode.id);

    if (!canMoveSelection) {
      return new Set(draggedNode.kind === 'FRAME' ? findDescendantNodeIds(draggedNode.id, nodes) : [draggedNode.id]);
    }

    return nodes.reduce((accumulator, node) => {
      if (!selectedSet.has(node.id)) return accumulator;

      const ids = node.kind === 'FRAME' ? findDescendantNodeIds(node.id, nodes) : [node.id];

      for (const id of ids) accumulator.add(id);

      return accumulator;
    }, new Set<string>());
  };

  private readonly syncStageViewport = () => {
    const stage = this.stageElement()?.nativeElement;

    if (!stage) return;

    const zoom = this.zoom();

    this.stageViewport.set({
      height: Math.min(canvasSize.height, stage.clientHeight / zoom),
      left: Math.min(canvasSize.width, Math.max(0, stage.scrollLeft / zoom)),
      top: Math.min(canvasSize.height, Math.max(0, stage.scrollTop / zoom)),
      width: Math.min(canvasSize.width, stage.clientWidth / zoom)
    });
  };

  private readonly bringSelectedNodeToFront = () => {
    const selectedNodeId = this.selectedNodeId();

    if (!selectedNodeId) return false;

    let hasChanged = false;

    this.nodes.update((nodes) => {
      const selectedNode = nodes.find((node) => node.id === selectedNodeId);

      if (!selectedNode || selectedNode.kind === 'FRAME') return nodes;

      const highestObjectLayer = nodes
        .filter((node) => node.kind !== 'FRAME')
        .reduce((highest, node) => Math.max(highest, node.zIndex), objectLayerBase - 1);
      const nextZIndex = highestObjectLayer + 1;

      if (selectedNode.zIndex === nextZIndex) return nodes;

      hasChanged = true;

      return nodes.map((node) => (node.id === selectedNodeId ? { ...node, zIndex: nextZIndex } : node));
    });

    return hasChanged;
  };

  private readonly sendSelectedNodeToBack = () => {
    const selectedNodeId = this.selectedNodeId();

    if (!selectedNodeId) return false;

    let hasChanged = false;

    this.nodes.update((nodes) => {
      const selectedNode = nodes.find((node) => node.id === selectedNodeId);

      if (!selectedNode || selectedNode.kind === 'FRAME') return nodes;

      const lowestObjectLayer = nodes
        .filter((node) => node.kind !== 'FRAME')
        .reduce((lowest, node) => Math.min(lowest, node.zIndex), Number.POSITIVE_INFINITY);
      const nextZIndex = Math.max(objectLayerBase, lowestObjectLayer - 1);

      if (selectedNode.zIndex === nextZIndex) return nodes;

      hasChanged = true;

      return nodes.map((node) => (node.id === selectedNodeId ? { ...node, zIndex: nextZIndex } : node));
    });

    return hasChanged;
  };

  private readonly moveSelectedNodeOneLayerForward = () => {
    const selectedNodeId = this.selectedNodeId();

    if (!selectedNodeId) return false;

    let hasChanged = false;

    this.nodes.update((nodes) => {
      const contentNodes = [...nodes]
        .filter((node) => node.kind !== 'FRAME')
        .sort((leftNode, rightNode) => leftNode.zIndex - rightNode.zIndex);
      const selectedIndex = contentNodes.findIndex((node) => node.id === selectedNodeId);

      if (selectedIndex === -1 || selectedIndex >= contentNodes.length - 1) return nodes;

      const selectedNode = contentNodes[selectedIndex];
      const nextNode = contentNodes[selectedIndex + 1];

      if (!selectedNode || !nextNode) return nodes;

      hasChanged = true;

      return nodes.map((node) => {
        if (node.id === selectedNode.id) return { ...node, zIndex: nextNode.zIndex };
        if (node.id === nextNode.id) return { ...node, zIndex: selectedNode.zIndex };
        return node;
      });
    });

    return hasChanged;
  };

  private readonly moveSelectedNodeOneLayerBackward = () => {
    const selectedNodeId = this.selectedNodeId();

    if (!selectedNodeId) return false;

    let hasChanged = false;

    this.nodes.update((nodes) => {
      const contentNodes = [...nodes]
        .filter((node) => node.kind !== 'FRAME')
        .sort((leftNode, rightNode) => leftNode.zIndex - rightNode.zIndex);
      const selectedIndex = contentNodes.findIndex((node) => node.id === selectedNodeId);

      if (selectedIndex <= 0) return nodes;

      const selectedNode = contentNodes[selectedIndex];
      const previousNode = contentNodes[selectedIndex - 1];

      if (!selectedNode || !previousNode) return nodes;

      hasChanged = true;

      return nodes.map((node) => {
        if (node.id === selectedNode.id) return { ...node, zIndex: previousNode.zIndex };
        if (node.id === previousNode.id) return { ...node, zIndex: selectedNode.zIndex };
        return node;
      });
    });

    return hasChanged;
  };

  private readonly toCanvasPoint = (clientX: number, clientY: number): XYPosition | null => {
    const plane = this.planeElement()?.nativeElement;

    if (!plane) return null;

    const planeRect = plane.getBoundingClientRect();

    return clampPointToCanvas({
      x: (clientX - planeRect.left) / this.zoom(),
      y: (clientY - planeRect.top) / this.zoom()
    });
  };

  private readonly removeSelectedEdge = () => {
    const selectedEdgeId = this.selectedEdgeId();

    if (!selectedEdgeId) return false;

    this.edges.update((edges) => edges.filter((edge) => edge.id !== selectedEdgeId));
    this.selectedEdgeId.set(null);

    return true;
  };

  private readonly removeSelectedNode = () => {
    const selectedIds = this.selectedNodeIds();
    const selectedNodeId = this.selectedNodeId();
    const baseSelection = selectedIds.length > 0 ? selectedIds : selectedNodeId ? [selectedNodeId] : [];
    const nodes = this.nodes();

    if (baseSelection.length === 0) return false;

    const nodeIdsToDelete = nodes.reduce((accumulator, node) => {
      if (!baseSelection.includes(node.id)) return accumulator;

      const ids = node.kind === 'FRAME' ? findDescendantNodeIds(node.id, nodes) : [node.id];

      for (const id of ids) accumulator.add(id);

      return accumulator;
    }, new Set<string>());

    this.nodes.update((nodes) => nodes.filter((node) => !nodeIdsToDelete.has(node.id)));
    this.edges.update((edges) =>
      edges.filter((edge) => !nodeIdsToDelete.has(edge.source) && !nodeIdsToDelete.has(edge.target))
    );

    if (this.connectorSourceId() && nodeIdsToDelete.has(this.connectorSourceId()!)) {
      this.connectorSourceId.set(null);
    }

    this.selectedNodeIds.set([]);
    this.selectedNodeId.set(null);
    this.selectedEdgeId.set(null);

    return true;
  };

  private readonly createConnector = (
    source: string,
    target: string,
    sourceHandle?: string,
    targetHandle?: string
  ) => {
    this.edges.update((edges) =>
      edges.concat({
        id: crypto.randomUUID(),
        label: '',
        source,
        sourceHandle,
        style: {
          color: '#64748b',
          lineStyle: 'solid',
          type: 'smoothstep'
        },
        target,
        targetHandle
      })
    );
  };
}
