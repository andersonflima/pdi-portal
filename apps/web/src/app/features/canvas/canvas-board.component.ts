import { Component, Input, OnChanges, OnDestroy, SimpleChanges, computed, effect, inject, output, signal } from '@angular/core';
import type { CanvasNodeKind, CanvasShapeVariant, PdiPlan, User } from '@pdi/contracts';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api/api.service';
import { CanvasEdgeLayerComponent } from './components/canvas-edge-layer.component';
import { CanvasHeaderComponent } from './components/canvas-header.component';
import { CanvasNodeComponent } from './components/canvas-node.component';
import { CanvasToolbarComponent } from './components/canvas-toolbar.component';
import { canvasSize } from './canvas.constants';
import { findContainingFrame } from './canvas.geometry';
import { createCanvasNode, toCanvasEdges, toCanvasNodes, toSaveBoard } from './canvas.mappers';
import type {
  CanvasEdgePatch,
  CanvasEdgeView,
  CanvasNodeDataPatch,
  CanvasNodeStylePatch,
  CanvasNodeView,
  CanvasTextStyle
} from './canvas.models';

const orderFrameParentsFirst = (nodes: CanvasNodeView[]) =>
  [...nodes].sort((leftNode, rightNode) => {
    if (leftNode.kind === 'FRAME' && rightNode.kind !== 'FRAME') return -1;
    if (leftNode.kind !== 'FRAME' && rightNode.kind === 'FRAME') return 1;
    return 0;
  });

const minZoom = 0.4;
const maxZoom = 1.6;
const zoomStep = 0.1;

const roundZoom = (value: number) => Math.round(value * 100) / 100;

const clampZoom = (value: number) => Math.min(maxZoom, Math.max(minZoom, roundZoom(value)));

const toLiveWebSocketUrl = (apiUrl: string, pdiPlanId: string, clientId: string, token: string | null) => {
  const url = new URL(apiUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/pdi-plans/${pdiPlanId}/board/live`;
  url.searchParams.set('clientId', clientId);
  url.searchParams.set('token', token ?? '');

  return url.toString();
};

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
  @Input({ required: true }) isUpdatingPlan = false;
  @Input({ required: true }) plan!: PdiPlan;
  @Input({ required: true }) plans: PdiPlan[] = [];
  @Input({ required: true }) user!: User;
  @Input({ required: true }) users: User[] = [];
  @Input({ required: true }) usersCount = 0;

  readonly createPlan = output<{ objective: string; ownerId?: string; title: string }>();
  readonly createUser = output<{ email: string; name: string; password: string; role: User['role'] }>();
  readonly deletePlan = output<string>();
  readonly logout = output<void>();
  readonly selectPlan = output<string>();
  readonly updatePlan = output<{ id: string; data: Partial<Pick<PdiPlan, 'objective' | 'ownerId' | 'status' | 'title'>> }>();

  private readonly api = inject(ApiService);
  private readonly clientId = crypto.randomUUID();
  private socket: WebSocket | null = null;
  private loadToken = 0;
  private isApplyingRemoteBoard = false;

  protected readonly canvasSize = canvasSize;
  protected readonly boardTitle = signal('');
  protected readonly connectorSourceId = signal<string | null>(null);
  protected readonly currentPlanId = signal<string | null>(null);
  protected readonly edges = signal<CanvasEdgeView[]>([]);
  protected readonly isSaving = signal(false);
  protected readonly nodes = signal<CanvasNodeView[]>([]);
  protected readonly selectedEdgeId = signal<string | null>(null);
  protected readonly selectedNodeId = signal<string | null>(null);
  protected readonly zoom = signal(1);

  protected readonly selectedNode = computed(() => this.nodes().find((node) => node.id === this.selectedNodeId()) ?? null);
  protected readonly selectedEdge = computed(() => this.edges().find((edge) => edge.id === this.selectedEdgeId()) ?? null);
  protected readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));

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

  protected readonly clearSelection = () => {
    this.selectedNodeId.set(null);
    this.selectedEdgeId.set(null);
    this.connectorSourceId.set(null);
  };

  protected readonly handleCreateNode = (event: { kind: CanvasNodeKind; variant?: CanvasShapeVariant }) => {
    this.nodes.update((currentNodes) => currentNodes.concat(createCanvasNode(event.kind, currentNodes.length, event.variant)));
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
    this.startNodeDrag(event, node);
  };

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

  private readonly startNodeDrag = (event: PointerEvent, node: CanvasNodeView) => {
    event.preventDefault();

    const start = { x: event.clientX, y: event.clientY };
    const initialPosition = { ...node.position };
    const initialZoom = this.zoom();

    const handleMove = (moveEvent: PointerEvent) => {
      const nextPosition = {
        x: Math.max(0, initialPosition.x + (moveEvent.clientX - start.x) / initialZoom),
        y: Math.max(0, initialPosition.y + (moveEvent.clientY - start.y) / initialZoom)
      };

      this.nodes.update((nodes) =>
        nodes.map((candidate) => (candidate.id === node.id ? { ...candidate, position: nextPosition } : candidate))
      );
    };

    const handleEnd = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      this.updateNodeParent(node.id);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd, { once: true });
  };

  private readonly updateNodeParent = (nodeId: string) => {
    this.nodes.update((nodes) => {
      const draggedNode = nodes.find((node) => node.id === nodeId);

      if (!draggedNode || draggedNode.kind === 'FRAME') return nodes;

      const targetFrame = findContainingFrame(draggedNode, nodes);

      return orderFrameParentsFirst(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                parentId: targetFrame?.id,
                zIndex: targetFrame ? 10 : node.zIndex
              }
            : node
        )
      );
    });
  };

  private readonly createConnector = (source: string, target: string) => {
    this.edges.update((edges) =>
      edges.concat({
        id: crypto.randomUUID(),
        label: '',
        source,
        style: {
          color: '#64748b',
          lineStyle: 'solid',
          type: 'smoothstep'
        },
        target
      })
    );
  };
}
