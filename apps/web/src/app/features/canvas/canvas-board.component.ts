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
import { toBlob as toDomBlob, toSvg as toDomSvg } from 'html-to-image';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api/api.service';
import { CanvasEdgeLayerComponent } from './components/canvas-edge-layer.component';
import { CanvasHeaderComponent } from './components/canvas-header.component';
import { CanvasNodeComponent } from './components/canvas-node.component';
import { CanvasToolbarComponent } from './components/canvas-toolbar.component';
import { canvasSize } from './canvas.constants';
import { findContainingFrame, getConnectorEndpoints, getConnectorPath, getNodeCenter, isPointInsideNode } from './canvas.geometry';
import { createCanvasNode, toCanvasEdges, toCanvasNodes, toSaveBoard } from './canvas.mappers';
import type {
  CanvasEdgeDirection,
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

type SvgTextAnchor = 'middle' | 'start' | 'end';

const minZoom = 0.4;
const maxZoom = 1.6;
const zoomStep = 0.1;
const wheelLineHeightPx = 16;
const wheelZoomSensitivity = 0.0022;
const dragStartThreshold = 4;
const frameLayerMax = 999;
const objectLayerBase = 1000;
const autosaveDelayMs = 1200;
const marqueeStartThreshold = 6;
const minimapWidth = 240;
const minimapHeight = Math.round((minimapWidth * canvasSize.height) / canvasSize.width);
const connectorHandleHitRadius = 14;
const exportImagePixelRatio = 2;

const roundZoom = (value: number) => Math.round(value * 100) / 100;

const clampZoom = (value: number) => Math.min(maxZoom, Math.max(minZoom, roundZoom(value)));

const normalizeWheelDeltaY = (event: WheelEvent, viewportHeight: number) => {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * wheelLineHeightPx;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * viewportHeight;
  }

  return event.deltaY;
};

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

const toOppositeHandle = (handle: CanvasHandlePosition): CanvasHandlePosition => {
  if (handle === 'top') return 'bottom';
  if (handle === 'right') return 'left';
  if (handle === 'bottom') return 'top';
  return 'right';
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

const findNodeHandleAtPoint = (point: XYPosition, nodes: CanvasNodeView[], excludedNodeId: string) => {
  const sortedNodes = [...nodes]
    .filter((node) => node.id !== excludedNodeId)
    .sort((leftNode, rightNode) => {
      const leftLayer = leftNode.kind === 'FRAME' ? Math.min(frameLayerMax, leftNode.zIndex) : Math.max(objectLayerBase, leftNode.zIndex);
      const rightLayer =
        rightNode.kind === 'FRAME' ? Math.min(frameLayerMax, rightNode.zIndex) : Math.max(objectLayerBase, rightNode.zIndex);

      return rightLayer - leftLayer;
    });

  for (const node of sortedNodes) {
    const handles: CanvasHandlePosition[] = ['top', 'right', 'bottom', 'left'];

    for (const handle of handles) {
      const handlePoint = toConnectorHandlePoint(node, handle);
      const distance = Math.hypot(point.x - handlePoint.x, point.y - handlePoint.y);

      if (distance <= connectorHandleHitRadius) {
        return { handle, node };
      }
    }
  }

  return null;
};

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const toFileName = (title: string, extension: 'png' | 'svg') => {
  const normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${normalized || 'pdi-board'}.${extension}`;
};

const toTextAnchor = (align?: CanvasTextStyle['align']): SvgTextAnchor => {
  if (align === 'center') return 'middle';
  if (align === 'right') return 'end';
  return 'start';
};

const toTextX = (anchor: SvgTextAnchor, width: number, padding: number) => {
  if (anchor === 'middle') return width / 2;
  if (anchor === 'end') return Math.max(padding, width - padding);
  return padding;
};

const getVerticalOffset = (verticalAlign: CanvasTextStyle['verticalAlign'], height: number, blockHeight: number, padding: number) => {
  if (verticalAlign === 'center') return Math.max(padding, (height - blockHeight) / 2);
  if (verticalAlign === 'bottom') return Math.max(padding, height - blockHeight - padding);
  return padding;
};

const toNodeTextLines = (node: CanvasNodeView): string[] => {
  if (node.kind === 'TASK_LIST') {
    return (node.taskItems ?? []).map((item) => `${item.checked ? '✓' : '□'} ${item.label}`);
  }

  if (node.kind === 'TASK') {
    return [`${node.checked ? '✓' : '□'} ${node.label}`];
  }

  return (node.label || '').split('\n');
};

const toNodeFillColor = (node: CanvasNodeView) => {
  if (node.kind === 'TEXT') return 'transparent';
  if (node.kind === 'FRAME') return node.backgroundColor ?? '#d8e6f4';
  if (node.kind === 'NOTE') return node.backgroundColor ?? '#ffe08a';
  if (node.kind === 'STICKER') return node.backgroundColor ?? '#f4f4f5';
  if (node.kind === 'SHAPE') return node.backgroundColor ?? `${node.color}22`;
  return node.backgroundColor ?? '#ffffff';
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
  protected readonly selectedEdgeDirection = computed<CanvasEdgeDirection>(() => {
    const selectedEdge = this.selectedEdge();

    if (!selectedEdge) return 'left-to-right';

    const reverseEdge = this.edges().find((edge) => edge.source === selectedEdge.target && edge.target === selectedEdge.source);

    if (reverseEdge) return 'both';

    return this.edgeHorizontalDirection(selectedEdge);
  });
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

    const stage = this.stageElement()?.nativeElement;
    if (!stage) return;

    event.preventDefault();

    const normalizedDelta = normalizeWheelDeltaY(event, stage.clientHeight);
    if (Math.abs(normalizedDelta) < 0.01) return;

    const currentZoom = this.zoom();
    const zoomFactor = Math.exp(-normalizedDelta * wheelZoomSensitivity);
    const nextZoom = clampZoom(currentZoom * zoomFactor);

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
      const nodes = this.nodes();
      const handleHit = findNodeHandleAtPoint(dropPoint, nodes, connector.sourceNodeId);
      const targetNode = handleHit?.node ?? findTopNodeAtPoint(dropPoint, nodes, connector.sourceNodeId);

      if (!targetNode || targetNode.id === connector.sourceNodeId) return;

      const targetHandle = handleHit?.handle ?? toOppositeHandle(connector.sourceHandle) ?? toClosestHandle(targetNode, dropPoint);

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

    const { direction, ...edgePatch } = input;

    this.edges.update((edges) => {
      const currentEdge = edges.find((edge) => edge.id === selectedEdge.id) ?? selectedEdge;
      const reverseEdge =
        edges.find((edge) => edge.source === currentEdge.target && edge.target === currentEdge.source) ?? null;

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
        this.edgeHorizontalDirection(patchedCurrent) === 'left-to-right'
          ? patchedCurrent
          : patchedReverse ?? this.createReverseEdge(patchedCurrent);
      const rightToLeftEdge =
        this.edgeHorizontalDirection(patchedCurrent) === 'right-to-left'
          ? patchedCurrent
          : patchedReverse ?? this.createReverseEdge(patchedCurrent);

      const pairlessEdges = edges.filter((edge) => edge.id !== patchedCurrent.id && edge.id !== patchedReverse?.id);

      if (direction === 'both') {
        return pairlessEdges.concat(leftToRightEdge, rightToLeftEdge);
      }

      if (direction === 'left-to-right') {
        this.selectedEdgeId.set(leftToRightEdge.id);
        return pairlessEdges.concat(leftToRightEdge);
      }

      if (direction === 'right-to-left') {
        this.selectedEdgeId.set(rightToLeftEdge.id);
        return pairlessEdges.concat(rightToLeftEdge);
      }

      if (patchedReverse) {
        return pairlessEdges.concat(patchedCurrent, patchedReverse);
      }

      return pairlessEdges.concat(patchedCurrent);
    });
  };

  protected readonly isNodeSelected = (nodeId: string) => this.selectedNodeIdSet().has(nodeId);
  protected readonly shouldRenderEdgeLabel = (edge: CanvasEdgeView) => {
    const reverseEdge = this.edges().find((candidate) => candidate.source === edge.target && candidate.target === edge.source);

    if (!reverseEdge) return true;

    return edge.id < reverseEdge.id;
  };
  protected readonly edgeLabelPosition = (edge: CanvasEdgeView) => {
    const source = this.nodes().find((node) => node.id === edge.source);
    const target = this.nodes().find((node) => node.id === edge.target);

    if (!source || !target) return { x: 0, y: 0 };

    const { start, end } = getConnectorEndpoints(source, target, edge.sourceHandle, edge.targetHandle);

    return {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
  };

  protected readonly startNodeResize = (event: PointerEvent, node: CanvasNodeView) => {
    event.preventDefault();

    const start = { x: event.clientX, y: event.clientY };
    const initialSize = { height: node.height, width: node.width };
    const initialZoom = this.zoom();

    const handleMove = (moveEvent: PointerEvent) => {
      const width = Math.max(96, initialSize.width + (moveEvent.clientX - start.x) / initialZoom);
      const height = Math.max(72, initialSize.height + (moveEvent.clientY - start.y) / initialZoom);
      const shouldKeepAspectRatio = node.kind === 'SHAPE' && node.variant === 'CIRCLE';
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

  protected readonly exportBoardToSvg = async () => {
    const exportNode = this.createBoardExportNode();

    if (!exportNode) return;

    const title = this.boardTitle() || this.plan.title;

    try {
      const dataUrl = await toDomSvg(exportNode, {
        cacheBust: true,
        height: canvasSize.height,
        width: canvasSize.width
      });
      const blob = await this.dataUrlToBlob(dataUrl);
      this.downloadBlob(blob, toFileName(title, 'svg'));
    } finally {
      document.body.removeChild(exportNode);
    }
  };

  protected readonly exportBoardToPng = async () => {
    const exportNode = this.createBoardExportNode();

    if (!exportNode) return;

    const title = this.boardTitle() || this.plan.title;

    try {
      const pngBlob = await toDomBlob(exportNode, {
        cacheBust: true,
        canvasHeight: canvasSize.height,
        canvasWidth: canvasSize.width,
        height: canvasSize.height,
        pixelRatio: exportImagePixelRatio,
        width: canvasSize.width
      });

      if (!pngBlob) throw new Error('Failed to encode board PNG');

      this.downloadBlob(pngBlob, toFileName(title, 'png'));
    } finally {
      document.body.removeChild(exportNode);
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
      window.requestAnimationFrame(() => {
        this.centerStageViewport();
      });
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
    event.preventDefault();

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
      moveEvent.preventDefault();

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
    const stage = this.stageElement()?.nativeElement;

    if (!stage) return null;

    const stageRect = stage.getBoundingClientRect();
    const zoom = this.zoom();

    return clampPointToCanvas({
      x: (stage.scrollLeft + (clientX - stageRect.left)) / zoom,
      y: (stage.scrollTop + (clientY - stageRect.top)) / zoom
    });
  };

  private readonly centerStageViewport = () => {
    const stage = this.stageElement()?.nativeElement;

    if (!stage) return;

    const zoom = this.zoom();
    const viewportWidthInCanvas = stage.clientWidth / zoom;
    const viewportHeightInCanvas = stage.clientHeight / zoom;
    const centerXInCanvas = canvasSize.width / 2;
    const centerYInCanvas = canvasSize.height / 2;
    const nextCanvasLeft = Math.max(0, centerXInCanvas - viewportWidthInCanvas / 2);
    const nextCanvasTop = Math.max(0, centerYInCanvas - viewportHeightInCanvas / 2);

    stage.scrollLeft = nextCanvasLeft * zoom;
    stage.scrollTop = nextCanvasTop * zoom;
    this.syncStageViewport();
  };

  private readonly buildBoardSvgMarkup = () => {
    const boardEdges = this.renderEdgesToSvg();
    const boardNodes = this.renderNodesToSvg();

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize.width}" height="${canvasSize.height}" viewBox="0 0 ${canvasSize.width} ${canvasSize.height}">
  <defs>
    <pattern id="grid-pattern" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#d8dee8" />
    </pattern>
  </defs>
  <rect x="0" y="0" width="${canvasSize.width}" height="${canvasSize.height}" fill="#f6f4ef" />
  <rect x="0" y="0" width="${canvasSize.width}" height="${canvasSize.height}" fill="url(#grid-pattern)" />
  ${boardEdges}
  ${boardNodes}
</svg>`.trim();
  };

  private readonly renderEdgesToSvg = () => {
    const nodesById = new Map(this.nodes().map((node) => [node.id, node]));
    const shouldRenderEdge = (edge: CanvasEdgeView) => {
      const reverseEdge = this.edges().find((candidate) => candidate.source === edge.target && candidate.target === edge.source);
      if (!reverseEdge) return true;
      return edge.id < reverseEdge.id;
    };
    const isBidirectional = (edge: CanvasEdgeView) =>
      this.edges().some((candidate) => candidate.source === edge.target && candidate.target === edge.source);

    const edgeGroups = this.edges()
      .filter(shouldRenderEdge)
      .map((edge) => {
        const source = nodesById.get(edge.source);
        const target = nodesById.get(edge.target);

        if (!source || !target) return '';

        const path = getConnectorPath(source, target, edge.style.type, edge.sourceHandle, edge.targetHandle);
        const lineStyle = edge.style.lineStyle === 'dashed' ? ' stroke-dasharray="8 6"' : '';
        const color = escapeXml(edge.style.color);
        const label = edge.label?.trim() ?? '';
        const sourceCenter = getNodeCenter(source);
        const targetCenter = getNodeCenter(target);
        const labelX = (sourceCenter.x + targetCenter.x) / 2;
        const labelY = (sourceCenter.y + targetCenter.y) / 2 - 10;
        const markerStart = isBidirectional(edge) ? ' marker-start="url(#export-edge-arrow-head)"' : '';

        return `
<g>
  <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${lineStyle}${markerStart} marker-end="url(#export-edge-arrow-head)" />
  ${
    label
      ? `<text x="${labelX}" y="${labelY}" fill="${color}" font-size="13" font-weight="700" text-anchor="middle">${escapeXml(label)}</text>`
      : ''
  }
</g>`.trim();
      })
      .filter(Boolean)
      .join('\n');

    const markerDefs = `
<defs>
  <marker id="export-edge-arrow-head" viewBox="0 0 20 14" markerWidth="20" markerHeight="14" refX="0" refY="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
    <path d="M 0 7 L 18 1 L 18 13 Z" fill="context-stroke" />
  </marker>
</defs>`.trim();

    return `${markerDefs}\n${edgeGroups}`;
  };

  private readonly renderNodesToSvg = () =>
    this.renderedNodes()
      .map((node) => this.renderNodeToSvg(node))
      .join('\n');

  private readonly renderNodeToSvg = (node: CanvasNodeView) => {
    const fillColor = escapeXml(toNodeFillColor(node));
    const borderColor = escapeXml(node.color);
    const borderWidth = node.kind === 'TEXT' ? 0 : node.kind === 'FRAME' ? 2 : 1.6;
    const shapeMarkup = this.renderNodeShapeSvg(node, fillColor, borderColor, borderWidth);
    const iconMarkup = node.kind === 'GOAL' ? this.renderGoalIconSvg(node, borderColor) : '';
    const textMarkup = this.renderNodeTextSvg(node);

    return `
<g transform="translate(${node.position.x} ${node.position.y})">
  ${shapeMarkup}
  ${iconMarkup}
  ${textMarkup}
</g>`.trim();
  };

  private readonly renderGoalIconSvg = (node: CanvasNodeView, stroke: string) => {
    const iconInset = 14;
    const maxRadius = Math.max(7, Math.min(12, Math.min(node.width, node.height) * 0.1));
    const midRadius = Math.max(4.5, maxRadius * 0.66);
    const innerRadius = Math.max(2.4, maxRadius * 0.26);
    const centerX = iconInset + maxRadius;
    const centerY = iconInset + maxRadius;

    return `
<circle cx="${centerX}" cy="${centerY}" r="${maxRadius}" fill="none" stroke="${stroke}" stroke-width="2.2" />
<circle cx="${centerX}" cy="${centerY}" r="${midRadius}" fill="none" stroke="${stroke}" stroke-width="2.2" />
<circle cx="${centerX}" cy="${centerY}" r="${innerRadius}" fill="${stroke}" />`.trim();
  };

  private readonly renderNodeShapeSvg = (node: CanvasNodeView, fill: string, stroke: string, strokeWidth: number) => {
    if (node.kind === 'TEXT') {
      return '';
    }

    if (node.kind === 'NOTE') {
      const foldStartX = Math.max(0, node.width - 26);
      const foldStartY = Math.max(0, node.height - 26);

      return `
<polygon points="0,0 ${node.width},0 ${node.width},${foldStartY} ${foldStartX},${node.height} 0,${node.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
<polygon points="${foldStartX},${node.height} ${node.width},${foldStartY} ${node.width},${node.height}" fill="${stroke}" fill-opacity="0.15" />`.trim();
    }

    if (node.kind === 'SHAPE') {
      const variant = node.variant ?? 'DIAMOND';

      if (variant === 'DIAMOND') {
        return `<polygon points="${node.width / 2},0 ${node.width},${node.height / 2} ${node.width / 2},${node.height} 0,${node.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      }

      if (variant === 'TRIANGLE') {
        return `<polygon points="${node.width / 2},0 ${node.width},${node.height} 0,${node.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      }

      if (variant === 'PARALLELOGRAM') {
        return `<polygon points="${node.width * 0.18},0 ${node.width},0 ${node.width * 0.82},${node.height} 0,${node.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      }

      if (variant === 'HEXAGON') {
        return `<polygon points="${node.width * 0.24},0 ${node.width * 0.76},0 ${node.width},${node.height / 2} ${node.width * 0.76},${node.height} ${node.width * 0.24},${node.height} 0,${node.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      }

      if (variant === 'CYLINDER') {
        const capRadiusY = Math.max(8, Math.min(20, node.height * 0.16));

        return `
<rect x="0" y="${capRadiusY / 2}" width="${node.width}" height="${Math.max(0, node.height - capRadiusY)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
<ellipse cx="${node.width / 2}" cy="${capRadiusY / 2}" rx="${node.width / 2}" ry="${capRadiusY / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
<ellipse cx="${node.width / 2}" cy="${Math.max(capRadiusY / 2, node.height - capRadiusY / 2)}" rx="${node.width / 2}" ry="${capRadiusY / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`.trim();
      }

      if (variant === 'DOCUMENT') {
        const cut = Math.max(18, Math.min(node.width * 0.2, 34));

        return `<polygon points="0,0 ${node.width - cut},0 ${node.width},${cut} ${node.width},${node.height} 0,${node.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      }

      if (variant === 'CLOUD') {
        const path = [
          `M ${node.width * 0.12} ${node.height * 0.7}`,
          `C ${node.width * 0.04} ${node.height * 0.7}, ${node.width * 0.02} ${node.height * 0.58}, ${node.width * 0.09} ${node.height * 0.52}`,
          `C ${node.width * 0.09} ${node.height * 0.36}, ${node.width * 0.23} ${node.height * 0.25}, ${node.width * 0.36} ${node.height * 0.3}`,
          `C ${node.width * 0.43} ${node.height * 0.14}, ${node.width * 0.64} ${node.height * 0.12}, ${node.width * 0.74} ${node.height * 0.28}`,
          `C ${node.width * 0.87} ${node.height * 0.24}, ${node.width * 0.97} ${node.height * 0.35}, ${node.width * 0.92} ${node.height * 0.49}`,
          `C ${node.width * 0.99} ${node.height * 0.54}, ${node.width * 0.98} ${node.height * 0.7}, ${node.width * 0.85} ${node.height * 0.74}`,
          `C ${node.width * 0.75} ${node.height * 0.79}, ${node.width * 0.24} ${node.height * 0.8}, ${node.width * 0.12} ${node.height * 0.7}`,
          'Z'
        ].join(' ');

        return `<path d="${path}" fill="${fill}" stroke="none" />`;
      }

      if (variant === 'CIRCLE') {
        const radius = Math.min(node.width, node.height) / 2;
        return `<circle cx="${node.width / 2}" cy="${node.height / 2}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      }

      if (variant === 'ROUNDED_RECTANGLE') {
        return `<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="20" ry="20" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      }

      return `<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="4" ry="4" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }

    if (node.kind === 'STICKER') {
      return `<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="18" ry="18" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }

    if (node.kind === 'GOAL') {
      return `<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="10" ry="10" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }

    if (node.kind === 'FRAME') {
      return `<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="8" ry="8" fill="${fill}" fill-opacity="0.4" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="8 5" />`;
    }

    return `<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="6" ry="6" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  };

  private readonly renderNodeTextSvg = (node: CanvasNodeView) => {
    const lines = toNodeTextLines(node);

    if (lines.length === 0) return '';

    const fontSize = node.textStyle?.fontSize ?? (node.kind === 'TEXT' ? 22 : 14);
    const lineHeight = Math.max(14, Math.round(fontSize * 1.22));
    const anchor = toTextAnchor(node.textStyle?.align);
    const horizontalPadding = node.kind === 'TASK' ? 36 : node.kind === 'GOAL' ? 36 : 12;
    const x = toTextX(anchor, node.width, horizontalPadding);
    const yOffset = getVerticalOffset(node.textStyle?.verticalAlign, node.height, lines.length * lineHeight, 12);
    const firstLineY = yOffset + fontSize;
    const fill = escapeXml(node.color);
    const fontWeight = node.textStyle?.bold ? 800 : node.kind === 'TEXT' ? 700 : 650;
    const fontStyle = node.textStyle?.italic ? 'italic' : 'normal';
    const textDecoration = node.textStyle?.underline ? ' underline' : '';
    const escapedLines = lines.map((line) => escapeXml(line));
    const tspans = escapedLines
      .map((line, index) => {
        const dy = index === 0 ? 0 : lineHeight;
        return `<tspan x="${x}" dy="${dy}">${line || ' '}</tspan>`;
      })
      .join('');

    return `<text x="${x}" y="${firstLineY}" fill="${fill}" font-size="${fontSize}" font-style="${fontStyle}" font-weight="${fontWeight}" text-anchor="${anchor}" text-decoration="${textDecoration.trim()}" dominant-baseline="text-before-edge">${tspans}</text>`;
  };

  private readonly downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  private readonly dataUrlToBlob = async (dataUrl: string) => {
    const response = await fetch(dataUrl);
    return response.blob();
  };

  private readonly createBoardExportNode = () => {
    const plane = this.planeElement()?.nativeElement;

    if (!plane) return null;

    const exportNode = document.createElement('div');
    exportNode.style.background = 'radial-gradient(circle at 1px 1px, #d8dee8 1px, transparent 0), #f6f4ef';
    exportNode.style.backgroundSize = '24px 24px';
    exportNode.style.height = `${canvasSize.height}px`;
    exportNode.style.left = '-100000px';
    exportNode.style.overflow = 'hidden';
    exportNode.style.pointerEvents = 'none';
    exportNode.style.position = 'fixed';
    exportNode.style.top = '0';
    exportNode.style.width = `${canvasSize.width}px`;
    exportNode.style.zIndex = '-1';

    const planeClone = plane.cloneNode(true);

    if (!(planeClone instanceof HTMLDivElement)) return null;

    planeClone.style.height = `${canvasSize.height}px`;
    planeClone.style.transform = 'scale(1)';
    planeClone.style.transformOrigin = 'left top';
    planeClone.style.width = `${canvasSize.width}px`;
    exportNode.appendChild(planeClone);
    document.body.appendChild(exportNode);

    return exportNode;
  };

  private readonly edgeHorizontalDirection = (edge: CanvasEdgeView): Exclude<CanvasEdgeDirection, 'both'> => {
    const source = this.nodes().find((node) => node.id === edge.source);
    const target = this.nodes().find((node) => node.id === edge.target);

    if (!source || !target) return 'left-to-right';

    return getNodeCenter(source).x <= getNodeCenter(target).x ? 'left-to-right' : 'right-to-left';
  };

  private readonly flipHandleRole = (handle?: string) => {
    if (!handle) return undefined;
    if (handle.includes('-source')) return handle.replace('-source', '-target');
    if (handle.includes('-target')) return handle.replace('-target', '-source');

    return handle;
  };

  private readonly createReverseEdge = (edge: CanvasEdgeView): CanvasEdgeView => ({
    ...edge,
    id: crypto.randomUUID(),
    source: edge.target,
    sourceHandle: this.flipHandleRole(edge.targetHandle),
    target: edge.source,
    targetHandle: this.flipHandleRole(edge.sourceHandle)
  });

  private readonly removeSelectedEdge = () => {
    const selectedEdgeId = this.selectedEdgeId();

    if (!selectedEdgeId) return false;

    const selectedEdge = this.edges().find((edge) => edge.id === selectedEdgeId) ?? null;
    const reverseEdgeId =
      selectedEdge
        ? this.edges().find((edge) => edge.source === selectedEdge.target && edge.target === selectedEdge.source)?.id
        : undefined;

    this.edges.update((edges) =>
      edges.filter((edge) => edge.id !== selectedEdgeId && edge.id !== reverseEdgeId)
    );
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
    const createEdge = (reverseEdge?: CanvasEdgeView): CanvasEdgeView => ({
      id: crypto.randomUUID(),
      label: reverseEdge?.label ?? '',
      source,
      sourceHandle,
      style: reverseEdge?.style ?? {
        color: '#64748b',
        lineStyle: 'solid' as const,
        type: 'smoothstep' as const
      },
      target,
      targetHandle
    });

    this.edges.update((edges) => {
      const hasSameDirection = edges.some((edge) => edge.source === source && edge.target === target);
      const reverseEdge = edges.find((edge) => edge.source === target && edge.target === source);

      if (hasSameDirection) return edges;

      return edges.concat(createEdge(reverseEdge));
    });
  };
}
