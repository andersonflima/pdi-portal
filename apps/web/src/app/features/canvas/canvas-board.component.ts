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

const minZoom = 0.4;
const maxZoom = 1.6;
const zoomStep = 0.1;
const dragStartThreshold = 4;
const objectLayerBase = 1000;

const roundZoom = (value: number) => Math.round(value * 100) / 100;

const clampZoom = (value: number) => Math.min(maxZoom, Math.max(minZoom, roundZoom(value)));

const clampPointToCanvas = (point: XYPosition): XYPosition => ({
  x: Math.min(canvasSize.width, Math.max(0, point.x)),
  y: Math.min(canvasSize.height, Math.max(0, point.y))
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
    .sort((leftNode, rightNode) => rightNode.zIndex - leftNode.zIndex)
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

  protected readonly canvasSize = canvasSize;
  protected readonly activeConnector = signal<ConnectorDraft | null>(null);
  protected readonly boardTitle = signal('');
  protected readonly connectorSourceId = signal<string | null>(null);
  protected readonly currentPlanId = signal<string | null>(null);
  protected readonly edges = signal<CanvasEdgeView[]>([]);
  protected readonly isPanning = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly nodes = signal<CanvasNodeView[]>([]);
  protected readonly selectedEdgeId = signal<string | null>(null);
  protected readonly selectedNodeId = signal<string | null>(null);
  protected readonly zoom = signal(1);

  protected readonly selectedNode = computed(() => this.nodes().find((node) => node.id === this.selectedNodeId()) ?? null);
  protected readonly selectedEdge = computed(() => this.edges().find((edge) => edge.id === this.selectedEdgeId()) ?? null);
  protected readonly renderedNodes = computed(() =>
    [...this.nodes()].sort((leftNode, rightNode) => {
      if (leftNode.zIndex !== rightNode.zIndex) {
        return leftNode.zIndex - rightNode.zIndex;
      }

      if (leftNode.kind === 'FRAME' && rightNode.kind !== 'FRAME') return -1;
      if (leftNode.kind !== 'FRAME' && rightNode.kind === 'FRAME') return 1;

      return 0;
    })
  );
  protected readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  protected readonly nodeStackLevel = (node: CanvasNodeView) => node.zIndex;

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
    this.selectedNodeId.set(null);
    this.selectedEdgeId.set(null);
    this.connectorSourceId.set(null);
    this.activeConnector.set(null);
  };

  protected readonly handleCreateNode = (event: { kind: CanvasNodeKind; variant?: CanvasShapeVariant }) => {
    this.nodes.update((currentNodes) =>
      currentNodes.concat(createCanvasNode(event.kind, currentNodes, currentNodes.length, event.variant))
    );
  };

  protected readonly handlePlanePointerDown = (event: PointerEvent) => {
    if (event.target !== event.currentTarget) return;

    this.clearSelection();

    if (event.button !== 0 && event.button !== 1) return;

    this.startCanvasPan(event);
  };

  protected readonly handleStageWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;

    const stage = this.stageElement()?.nativeElement;

    if (!stage) return;

    event.preventDefault();

    const currentZoom = this.zoom();
    const nextZoom = clampZoom(currentZoom + (event.deltaY < 0 ? zoomStep : -zoomStep));

    if (nextZoom === currentZoom) return;

    const stageRect = stage.getBoundingClientRect();
    const pointerOffsetX = event.clientX - stageRect.left;
    const pointerOffsetY = event.clientY - stageRect.top;
    const canvasX = (stage.scrollLeft + pointerOffsetX) / currentZoom;
    const canvasY = (stage.scrollTop + pointerOffsetY) / currentZoom;

    this.zoom.set(nextZoom);
    stage.scrollLeft = canvasX * nextZoom - pointerOffsetX;
    stage.scrollTop = canvasY * nextZoom - pointerOffsetY;
  };

  protected readonly handleNodePointerDown = (event: PointerEvent, node: CanvasNodeView) => {
    if (event.button !== 0) return;

    event.stopPropagation();

    const connectorSourceId = this.connectorSourceId();

    if (connectorSourceId && connectorSourceId !== node.id) {
      this.createConnector(connectorSourceId, node.id);
      this.connectorSourceId.set(null);
      this.selectedNodeId.set(null);
      return;
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
    this.selectedNodeId.set(null);
    this.connectorSourceId.set(null);
  };

  protected readonly handleToggleConnectorMode = () => {
    const selectedNode = this.selectedNode();

    if (!selectedNode) return;

    this.connectorSourceId.set(this.connectorSourceId() === selectedNode.id ? null : selectedNode.id);
  };

  protected readonly zoomIn = () => {
    this.zoom.update((currentZoom) => clampZoom(currentZoom + zoomStep));
  };

  protected readonly zoomOut = () => {
    this.zoom.update((currentZoom) => clampZoom(currentZoom - zoomStep));
  };

  protected readonly resetZoom = () => {
    this.zoom.set(1);
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
    if (!this.currentPlanId()) return;

    this.isSaving.set(true);

    try {
      const board = await this.api.saveBoard(this.currentPlanId()!, toSaveBoard(this.boardTitle() || this.plan.title, this.nodes(), this.edges()));
      this.boardTitle.set(board.title);
    } finally {
      this.isSaving.set(false);
    }
  };

  private readonly loadBoard = async (planId: string) => {
    const token = ++this.loadToken;
    this.closeLiveConnection();
    this.isApplyingRemoteBoard = true;
    this.boardTitle.set('');
    this.currentPlanId.set(planId);
    this.nodes.set([]);
    this.edges.set([]);
    this.selectedNodeId.set(null);
    this.selectedEdgeId.set(null);
    this.activeConnector.set(null);

    try {
      const board = await this.api.board(planId);

      if (token !== this.loadToken) return;

      this.boardTitle.set(board.title);
      this.nodes.set(toCanvasNodes(board));
      this.edges.set(toCanvasEdges(board));
      this.openLiveConnection(planId);
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
      this.boardTitle.set(message.payload.title);
      this.nodes.set(toCanvasNodes(message.payload));
      this.edges.set(toCanvasEdges(message.payload));
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
    const nodeIdsToMove = new Set(node.kind === 'FRAME' ? findDescendantNodeIds(node.id, this.nodes()) : [node.id]);
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

      if (isDragging && node.kind !== 'FRAME') {
        this.updateNodeParent(node.id);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd, { once: true });
  };

  private readonly updateNodeParent = (nodeId: string) => {
    this.nodes.update((nodes) => {
      const draggedNode = nodes.find((node) => node.id === nodeId);

      if (!draggedNode || draggedNode.kind === 'FRAME') return nodes;

      const targetFrame = findContainingFrame(draggedNode, nodes);

      return nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              parentId: targetFrame?.id
            }
          : node
      );
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
    const selectedNodeId = this.selectedNodeId();

    if (!selectedNodeId) return false;

    const nodeIdsToDelete = new Set(findDescendantNodeIds(selectedNodeId, this.nodes()));

    this.nodes.update((nodes) => nodes.filter((node) => !nodeIdsToDelete.has(node.id)));
    this.edges.update((edges) =>
      edges.filter((edge) => !nodeIdsToDelete.has(edge.source) && !nodeIdsToDelete.has(edge.target))
    );

    if (this.connectorSourceId() && nodeIdsToDelete.has(this.connectorSourceId()!)) {
      this.connectorSourceId.set(null);
    }

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
