import {
  AfterViewInit,
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
import { findContainingFrame, getConnectorLabelPoint, getConnectorPath, getNodeCenter, isPointInsideNode } from './canvas.geometry';
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
const exportZoomScale = 1;
const arrowNeckOffset = 18;
const exportBoundsPadding = 64;
const historyMaxEntries = 200;

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

const toFiniteNumber = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
const toSvgSafeId = (prefix: string, rawValue: string) => {
  const normalized = rawValue
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  return `${prefix}-${normalized || 'id'}`;
};

const estimateTextWidth = (text: string, fontSize: number) => text.length * fontSize * 0.56;

const wrapSvgLineToWidth = (line: string, maxWidth: number, fontSize: number) => {
  const normalizedLine = line.trim();

  if (!normalizedLine) return [''];

  const maxCharsPerLine = Math.max(1, Math.floor(maxWidth / Math.max(fontSize * 0.56, 1)));
  const chunks = normalizedLine
    .split(/\s+/)
    .flatMap((token) => {
      if (token.length <= maxCharsPerLine) return [token];

      const tokenChunks: string[] = [];

      for (let index = 0; index < token.length; index += maxCharsPerLine) {
        tokenChunks.push(token.slice(index, index + maxCharsPerLine));
      }

      return tokenChunks;
    });

  const wrapped: string[] = [];
  let current = '';

  for (const chunk of chunks) {
    const candidate = current ? `${current} ${chunk}` : chunk;

    if (current && estimateTextWidth(candidate, fontSize) > maxWidth) {
      wrapped.push(current);
      current = chunk;
      continue;
    }

    current = candidate;
  }

  if (current) wrapped.push(current);

  return wrapped.length > 0 ? wrapped : [''];
};

const toExportBounds = (nodes: CanvasNodeView[]) => {
  const normalizedNodes = nodes
    .map((node) => ({
      height: toFiniteNumber(node.height, 0),
      width: toFiniteNumber(node.width, 0),
      x: toFiniteNumber(node.position.x, 0),
      y: toFiniteNumber(node.position.y, 0)
    }))
    .filter((node) => node.width > 0 && node.height > 0);

  if (normalizedNodes.length === 0) {
    return {
      height: canvasSize.height,
      minX: 0,
      minY: 0,
      width: canvasSize.width
    };
  }

  const left = Math.min(...normalizedNodes.map((node) => node.x));
  const top = Math.min(...normalizedNodes.map((node) => node.y));
  const right = Math.max(...normalizedNodes.map((node) => node.x + node.width));
  const bottom = Math.max(...normalizedNodes.map((node) => node.y + node.height));
  const minX = Math.max(0, left - exportBoundsPadding);
  const minY = Math.max(0, top - exportBoundsPadding);
  const maxX = Math.min(canvasSize.width, right + exportBoundsPadding);
  const maxY = Math.min(canvasSize.height, bottom + exportBoundsPadding);

  return {
    height: Math.max(1, maxY - minY),
    minX,
    minY,
    width: Math.max(1, maxX - minX)
  };
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
export class CanvasBoardComponent implements AfterViewInit, OnChanges, OnDestroy {
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
  private isRestoringHistory = false;
  private lastPersistedPlanId: string | null = null;
  private lastPersistedBoardSnapshot: string | null = null;
  private isPersistingBoard = false;
  private queuedAutosaveSnapshot: { board: ReturnType<typeof toSaveBoard>; planId: string; snapshot: string } | null = null;
  private removeStageWheelListener: (() => void) | null = null;
  private historySnapshot: string | null = null;
  private historyPast: string[] = [];
  private historyFuture: string[] = [];
  private historyBatchDepth = 0;
  private historyBatchBaseSnapshot: string | null = null;

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

    effect(() => {
      const planId = this.currentPlanId();
      const title = this.boardTitle() || this.plan.title;
      const nodes = this.nodes();
      const edges = this.edges();

      if (!planId) return;

      const nextSnapshot = JSON.stringify(toSaveBoard(title, nodes, edges));

      if (this.historySnapshot === null) {
        this.historySnapshot = nextSnapshot;
        this.historyPast = [];
        this.historyFuture = [];
        return;
      }

      if (nextSnapshot === this.historySnapshot) return;

      if (this.historyBatchDepth > 0) return;

      if (this.isApplyingRemoteBoard || this.isRestoringHistory) {
        this.historySnapshot = nextSnapshot;
        return;
      }

      this.historyPast.push(this.historySnapshot);

      if (this.historyPast.length > historyMaxEntries) {
        this.historyPast = this.historyPast.slice(this.historyPast.length - historyMaxEntries);
      }

      this.historyFuture = [];
      this.historySnapshot = nextSnapshot;
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['plan']?.currentValue && this.plan.id !== this.currentPlanId()) {
      void this.loadBoard(this.plan.id);
    }
  }

  ngAfterViewInit() {
    const stage = this.stageElement()?.nativeElement;

    if (!stage) return;

    const wheelListener = (event: WheelEvent) => {
      this.handleStageWheel(event);
    };

    stage.addEventListener('wheel', wheelListener, { passive: false });
    this.removeStageWheelListener = () => {
      stage.removeEventListener('wheel', wheelListener);
    };
  }

  ngOnDestroy() {
    this.removeStageWheelListener?.();
    this.removeStageWheelListener = null;
    this.closeLiveConnection();
  }

  @HostListener('window:keydown', ['$event'])
  protected readonly handleWindowKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const isUndoShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'z';
    const isRedoShortcut =
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      ((event.key.toLowerCase() === 'z' && event.shiftKey) || (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'y'));
    const isSelectAllShortcut =
      (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'a';

    if (isRedoShortcut) {
      event.preventDefault();
      event.stopPropagation();
      this.redoBoardChange();
      return;
    }

    if (isUndoShortcut) {
      event.preventDefault();
      event.stopPropagation();
      this.undoBoardChange();
      return;
    }

    if (isEditableTarget(event.target)) return;

    if (isSelectAllShortcut) {
      event.preventDefault();
      event.stopPropagation();

      const allNodeIds = this.nodes().map((node) => node.id);

      this.selectedNodeIds.set(allNodeIds);
      this.selectedNodeId.set(allNodeIds.at(-1) ?? null);
      this.selectedEdgeId.set(null);
      this.connectorSourceId.set(null);
      this.activeConnector.set(null);
      this.marqueeSelection.set(null);
      return;
    }

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
    event.stopPropagation();

    const normalizedDelta = normalizeWheelDeltaY(event, stage.clientHeight);
    if (Math.abs(normalizedDelta) < 0.01) return;
    const boundedDelta = Math.max(-240, Math.min(240, normalizedDelta));

    const currentZoom = this.zoom();
    const zoomFactor = Math.exp(-boundedDelta * wheelZoomSensitivity);
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

  protected readonly handleNodeEditSessionStart = () => {
    this.beginHistoryBatch();
  };

  protected readonly handleNodeEditSessionEnd = () => {
    this.endHistoryBatch();
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
    const bidirectional = this.edges().some((candidate) => candidate.source === edge.target && candidate.target === edge.source);

    return getConnectorLabelPoint(source, target, edge.style.type, edge.sourceHandle, edge.targetHandle, {
      end: arrowNeckOffset,
      start: bidirectional ? arrowNeckOffset : 0
    });
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
    const title = this.boardTitle() || this.plan.title;
    const visualExportNode = this.createVisualExportNode(exportZoomScale);

    if (visualExportNode) {
      try {
        if ('fonts' in document) {
          await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
        }

        const dataUrl = await toDomSvg(visualExportNode.node, {
          cacheBust: true,
          height: visualExportNode.height,
          width: visualExportNode.width
        });
        const svgMarkup = this.svgDataUrlToMarkup(dataUrl);
        const svgBlob = svgMarkup
          ? new Blob([this.injectSvgInteractivity(this.sanitizeExportedSvgMarkup(svgMarkup))], {
              type: 'image/svg+xml;charset=utf-8'
            })
          : await this.dataUrlToBlob(dataUrl);
        this.downloadBlob(svgBlob, toFileName(title, 'svg'));
        return;
      } finally {
        visualExportNode.cleanup();
      }
    }

    const { markup: fallbackMarkup } = this.buildBoardSvgMarkup();
    const finalMarkup = this.injectSvgInteractivity(this.sanitizeExportedSvgMarkup(fallbackMarkup));
    const fallbackBlob = new Blob([finalMarkup], { type: 'image/svg+xml;charset=utf-8' });
    this.downloadBlob(fallbackBlob, toFileName(title, 'svg'));
  };

  protected readonly exportBoardToPng = async () => {
    const title = this.boardTitle() || this.plan.title;
    const visualExportNode = this.createVisualExportNode(exportZoomScale);

    if (visualExportNode) {
      try {
        if ('fonts' in document) {
          await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
        }

        const pngBlob = await toDomBlob(visualExportNode.node, {
          cacheBust: true,
          canvasHeight: visualExportNode.height,
          canvasWidth: visualExportNode.width,
          height: visualExportNode.height,
          pixelRatio: exportImagePixelRatio,
          width: visualExportNode.width
        });

        if (pngBlob) {
          this.downloadBlob(pngBlob, toFileName(title, 'png'));
          return;
        }
      } finally {
        visualExportNode.cleanup();
      }
    }

    const { height, markup: fallbackMarkup, width } = this.buildBoardSvgMarkup();
    const fallbackSvg = new Blob([this.sanitizeExportedSvgMarkup(fallbackMarkup)], { type: 'image/svg+xml;charset=utf-8' });
    const pngBlob = await this.svgBlobToPngBlob(fallbackSvg, width, height, exportImagePixelRatio);
    this.downloadBlob(pngBlob, toFileName(title, 'png'));
  };

  private readonly loadBoard = async (planId: string) => {
    const token = ++this.loadToken;
    this.closeLiveConnection();
    this.isApplyingRemoteBoard = true;
    this.historySnapshot = null;
    this.historyPast = [];
    this.historyFuture = [];
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
    const bounds = toExportBounds(this.renderedNodes());
    const width = Math.max(1, toFiniteNumber(bounds.width, canvasSize.width));
    const height = Math.max(1, toFiniteNumber(bounds.height, canvasSize.height));
    const minX = toFiniteNumber(bounds.minX, 0);
    const minY = toFiniteNumber(bounds.minY, 0);
    const boardEdges = this.renderEdgesToSvg();
    const boardNodes = this.renderNodesToSvg();
    const translateX = -minX;
    const translateY = -minY;

    const markup = `
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="grid-pattern" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#d8dee8" />
    </pattern>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f6f4ef" />
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#grid-pattern)" />
  <g transform="translate(${translateX} ${translateY})">
    ${boardEdges}
    ${boardNodes}
  </g>
</svg>`.trim();

    return {
      height,
      markup,
      width
    };
  };

  private readonly renderEdgesToSvg = () => {
    const nodesById = new Map(this.nodes().map((node) => [node.id, node]));
    const markerIdForColorAndAngle = (color: string, angle: number) =>
      `export-edge-arrow-head-${encodeURIComponent(color).replaceAll('%', '_')}-${angle}`;
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
    const inferTargetHandle = (source: CanvasNodeView, target: CanvasNodeView): CanvasHandlePosition => {
      const sourceCenter = getNodeCenter(source);
      const targetCenter = getNodeCenter(target);
      const dx = targetCenter.x - sourceCenter.x;
      const dy = targetCenter.y - sourceCenter.y;

      if (Math.abs(dx) > Math.abs(dy)) {
        return dx >= 0 ? 'left' : 'right';
      }

      return dy >= 0 ? 'top' : 'bottom';
    };
    const inferSourceHandle = (source: CanvasNodeView, target: CanvasNodeView): CanvasHandlePosition => {
      const sourceCenter = getNodeCenter(source);
      const targetCenter = getNodeCenter(target);
      const dx = targetCenter.x - sourceCenter.x;
      const dy = targetCenter.y - sourceCenter.y;

      if (Math.abs(dx) > Math.abs(dy)) {
        return dx >= 0 ? 'right' : 'left';
      }

      return dy >= 0 ? 'bottom' : 'top';
    };
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

        const path = getConnectorPath(source, target, edge.style.type, edge.sourceHandle, edge.targetHandle, {
          end: arrowNeckOffset,
          start: isBidirectional(edge) ? arrowNeckOffset : 0
        });
        const color = escapeXml(edge.style.color);
        const label = edge.label?.trim() ?? '';
        const labelPoint = getConnectorLabelPoint(source, target, edge.style.type, edge.sourceHandle, edge.targetHandle, {
          end: arrowNeckOffset,
          start: isBidirectional(edge) ? arrowNeckOffset : 0
        });
        const labelX = labelPoint.x;
        const labelY = labelPoint.y - 10;
        const targetHandle = toHandleSide(edge.targetHandle) ?? inferTargetHandle(source, target);
        const sourceHandle = toHandleSide(edge.sourceHandle) ?? inferSourceHandle(source, target);
        const endMarkerId = markerIdForColorAndAngle(edge.style.color, toInboundAngle(targetHandle));
        const startMarkerId = markerIdForColorAndAngle(edge.style.color, toInboundAngle(sourceHandle));
        const bidirectional = isBidirectional(edge);
        const markerStart = bidirectional ? ` marker-start="url(#${startMarkerId})"` : '';
        const liveLineStyleClass = edge.style.lineStyle === 'dashed' ? 'edge-line-live-dashed' : 'edge-line-live-solid';

        return `
<g>
  <path d="${path}" fill="none" stroke="${color}" class="edge-line-live-export edge-line-live-export-forward ${liveLineStyleClass}"${markerStart} marker-end="url(#${endMarkerId})" />
  ${
    label
      ? `<text x="${labelX}" y="${labelY}" fill="${color}" font-size="13" font-weight="700" paint-order="stroke" stroke="#ffffff" stroke-opacity="0.92" stroke-linejoin="round" stroke-width="8" text-anchor="middle">${escapeXml(label)}</text>`
      : ''
  }
</g>`.trim();
      })
      .filter(Boolean)
      .join('\n');

    const markerDefsByColor = Array.from(new Set(this.edges().map((edge) => edge.style.color)))
      .map((color) => {
        const escapedColor = escapeXml(color);
        const angles = [0, 90, 180, -90];
        return angles
          .map((angle) => {
            const markerId = markerIdForColorAndAngle(color, angle);
            return `<marker id="${markerId}" viewBox="0 0 20 14" markerWidth="20" markerHeight="14" refX="0" refY="7" orient="${angle}" markerUnits="userSpaceOnUse"><path d="M 18 7 L 0 1 L 0 13 Z" fill="${escapedColor}" /></marker>`;
          })
          .join('');
      })
      .join('');

    const edgeAnimationStyles = `
<style>
  .edge-line-live-export {
    animation: edge-dash-flow 0.95s linear infinite;
    opacity: 0.95;
    pointer-events: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 2.6;
  }
  .edge-line-live-solid {
    stroke-dasharray: 30 16;
  }
  .edge-line-live-dashed {
    stroke-dasharray: 24 12;
  }
  .edge-line-live-export-reverse {
    animation-name: edge-dash-flow-reverse;
  }
  @keyframes edge-dash-flow {
    to {
      stroke-dashoffset: -46;
    }
  }
  @keyframes edge-dash-flow-reverse {
    to {
      stroke-dashoffset: 46;
    }
  }
</style>`.trim();

    const markerDefs = `
<defs>
  ${markerDefsByColor}
</defs>`.trim();

    return `${edgeAnimationStyles}\n${markerDefs}\n${edgeGroups}`;
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
    const textClipId = toSvgSafeId('export-node-text-clip', node.id);
    const textClipX = node.kind === 'TASK' ? 16 : node.kind === 'GOAL' ? 24 : 8;
    const textClipY = node.kind === 'GOAL' ? 12 : 8;
    const textClipWidth = Math.max(1, node.width - textClipX - 8);
    const textClipHeight = Math.max(1, node.height - textClipY - 8);
    const textMarkup = this.renderNodeTextSvg(node);

    return `
<g transform="translate(${node.position.x} ${node.position.y})">
  ${shapeMarkup}
  ${iconMarkup}
  <defs>
    <clipPath id="${textClipId}">
      <rect x="${textClipX}" y="${textClipY}" width="${textClipWidth}" height="${textClipHeight}" />
    </clipPath>
  </defs>
  <g clip-path="url(#${textClipId})">
    ${textMarkup}
  </g>
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
    const fontSize = node.textStyle?.fontSize ?? (node.kind === 'TEXT' ? 22 : 14);
    const horizontalPadding = node.kind === 'TASK' ? 36 : node.kind === 'GOAL' ? 36 : 12;
    const maxTextWidth = Math.max(24, node.width - horizontalPadding - 12);
    const lines = toNodeTextLines(node).flatMap((line) => wrapSvgLineToWidth(line, maxTextWidth, fontSize));

    if (lines.length === 0) return '';

    const lineHeight = Math.max(14, Math.round(fontSize * 1.22));
    const anchor = toTextAnchor(node.textStyle?.align);
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

  private readonly svgDataUrlToMarkup = (dataUrl: string): string | null => {
    const separatorIndex = dataUrl.indexOf(',');

    if (separatorIndex < 0) return null;

    const metadata = dataUrl.slice(0, separatorIndex);
    const payload = dataUrl.slice(separatorIndex + 1);

    try {
      if (metadata.includes(';base64')) {
        return atob(payload);
      }

      return decodeURIComponent(payload);
    } catch {
      return null;
    }
  };

  private readonly sanitizeExportedSvgMarkup = (svgMarkup: string) => {
    const parser = new DOMParser();
    const parsedDocument = parser.parseFromString(svgMarkup, 'image/svg+xml');
    const root = parsedDocument.documentElement;

    if (!root || root.nodeName.toLowerCase() !== 'svg') return svgMarkup;

    parsedDocument
      .querySelectorAll<SVGPathElement>(
        'path.edge-line, path.edge-line-live, path.edge-line-preview, path.edge-line-live-export, path.edge-hit-area'
      )
      .forEach((path) => {
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.removeAttribute('filter');

        const style = path.getAttribute('style');

        if (!style) return;

        const sanitizedStyle = style
          .replace(/(^|;)\s*filter\s*:[^;]*/gi, '$1')
          .replace(/(^|;)\s*-webkit-filter\s*:[^;]*/gi, '$1')
          .replace(/;;+/g, ';')
          .trim()
          .replace(/^;|;$/g, '');

        if (!sanitizedStyle) {
          path.removeAttribute('style');
          return;
        }

        path.setAttribute('style', sanitizedStyle);
      });

    return new XMLSerializer().serializeToString(parsedDocument);
  };

  private readonly injectSvgInteractivity = (svgMarkup: string) => {
    if (!svgMarkup.includes('<svg') || svgMarkup.includes('id="pdi-svg-interactive-runtime"')) {
      return svgMarkup;
    }

    const runtimeStyle = `<style id="pdi-svg-interactive-style"><![CDATA[
svg[data-pdi-interactive="true"] {
  cursor: grab;
  display: block;
  height: 100vh;
  width: 100vw;
}
svg[data-pdi-panning="true"] { cursor: grabbing; }
.edge-line {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}
.edge-line-dashed {
  stroke-dasharray: 8 6;
}
.edge-line-live {
  animation: edge-dash-flow 0.95s linear infinite !important;
  fill: none;
  opacity: 0.95;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.6;
  stroke-dasharray: 30 16;
}
.edge-line-live-solid {
  stroke-dasharray: 30 16;
}
.edge-line-live-dashed {
  stroke-dasharray: 24 12;
}
.edge-line-live-export {
  animation: edge-dash-flow 0.95s linear infinite !important;
  fill: none;
  opacity: 0.95;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.6;
}
.edge-line-live-bidirectional {
  animation: none !important;
}
.edge-line-live-bidirectional-forward {
  animation: edge-dash-flow 0.95s linear infinite !important;
}
.edge-line-live-bidirectional-reverse {
  animation: edge-dash-flow-reverse 0.95s linear infinite !important;
}
.edge-line-live-export-reverse {
  animation: edge-dash-flow-reverse 0.95s linear infinite !important;
}
@keyframes edge-dash-flow {
  to {
    stroke-dashoffset: -46;
  }
}
@keyframes edge-dash-flow-reverse {
  to {
    stroke-dashoffset: 46;
  }
}
@media (prefers-reduced-motion: reduce) {
  .edge-line-live {
    animation: edge-dash-flow 0.95s linear infinite !important;
  }
}
]]></style>`;

    const runtimeScript = `<script id="pdi-svg-interactive-runtime" type="application/ecmascript"><![CDATA[
(function () {
  var svg = document.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') return;
  if (svg.getAttribute('data-pdi-interactive') === 'true') return;
  svg.setAttribute('width', '100vw');
  svg.setAttribute('height', '100vh');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.width = '100vw';
  svg.style.height = '100vh';
  svg.style.display = 'block';
  svg.style.margin = '0';
  var ns = 'http://www.w3.org/2000/svg';
  var contentGroup = svg.querySelector('#pdi-svg-panzoom-content');

  if (!contentGroup) {
    contentGroup = document.createElementNS(ns, 'g');
    contentGroup.setAttribute('id', 'pdi-svg-panzoom-content');

    var toMove = [];
    Array.from(svg.childNodes).forEach(function (node) {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      var tag = node.nodeName.toLowerCase();
      if (tag === 'defs' || tag === 'style' || tag === 'script' || tag === 'title' || tag === 'desc') return;
      toMove.push(node);
    });

    toMove.forEach(function (node) {
      contentGroup.appendChild(node);
    });

    svg.appendChild(contentGroup);
  }

  var viewBoxValues = (svg.getAttribute('viewBox') || '')
    .trim()
    .split(/[\\s,]+/)
    .map(function (value) {
      return Number(value);
    });
  var viewBoxWidth = viewBoxValues.length >= 4 && Number.isFinite(viewBoxValues[2]) ? viewBoxValues[2] : 0;
  var viewBoxHeight = viewBoxValues.length >= 4 && Number.isFinite(viewBoxValues[3]) ? viewBoxValues[3] : 0;
  var initialScale = 0.8;
  var state = {
    scale: initialScale,
    tx: viewBoxWidth > 0 ? ((1 - initialScale) * viewBoxWidth) / 2 : 0,
    ty: viewBoxHeight > 0 ? ((1 - initialScale) * viewBoxHeight) / 2 : 0
  };
  var minScale = 0.8;
  var maxScale = 1.6;
  var panState = null;

  var applyTransform = function () {
    contentGroup.setAttribute('transform', 'translate(' + state.tx + ' ' + state.ty + ') scale(' + state.scale + ')');
  };

  var toSvgPoint = function (event) {
    if (!svg.createSVGPoint || !svg.getScreenCTM) return null;
    var ctm = svg.getScreenCTM();
    if (!ctm || !ctm.inverse) return null;
    var point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(ctm.inverse());
  };

  var startPan = function (event) {
    if (event.button !== 0) return;
    var point = toSvgPoint(event);
    if (!point) return;

    panState = { pointerId: event.pointerId, x: point.x, y: point.y };
    svg.setAttribute('data-pdi-panning', 'true');
    if (svg.setPointerCapture) {
      try {
        svg.setPointerCapture(event.pointerId);
      } catch (_) {}
    }
  };

  var movePan = function (event) {
    if (!panState || event.pointerId !== panState.pointerId) return;
    var point = toSvgPoint(event);
    if (!point) return;

    state.tx += point.x - panState.x;
    state.ty += point.y - panState.y;
    panState.x = point.x;
    panState.y = point.y;
    applyTransform();
  };

  var endPan = function (event) {
    if (!panState || event.pointerId !== panState.pointerId) return;
    panState = null;
    svg.removeAttribute('data-pdi-panning');
    if (svg.releasePointerCapture) {
      try {
        svg.releasePointerCapture(event.pointerId);
      } catch (_) {}
    }
  };

  var zoomAtPoint = function (event) {
    if (event.cancelable) event.preventDefault();
    var point = toSvgPoint(event);
    if (!point) return;

    var factor = Math.exp(-event.deltaY * 0.0018);
    var nextScale = Math.min(maxScale, Math.max(minScale, state.scale * factor));
    if (nextScale === state.scale) return;

    var appliedFactor = nextScale / state.scale;
    state.tx = point.x - appliedFactor * (point.x - state.tx);
    state.ty = point.y - appliedFactor * (point.y - state.ty);
    state.scale = nextScale;
    applyTransform();
  };

  var resetView = function () {
    state = {
      scale: initialScale,
      tx: viewBoxWidth > 0 ? ((1 - initialScale) * viewBoxWidth) / 2 : 0,
      ty: viewBoxHeight > 0 ? ((1 - initialScale) * viewBoxHeight) / 2 : 0
    };
    applyTransform();
  };

  svg.setAttribute('data-pdi-interactive', 'true');
  applyTransform();
  svg.addEventListener('pointerdown', startPan);
  svg.addEventListener('pointermove', movePan);
  svg.addEventListener('pointerup', endPan);
  svg.addEventListener('pointercancel', endPan);
  svg.addEventListener('wheel', zoomAtPoint, { passive: false });
  svg.addEventListener('dblclick', function (event) {
    if (event.cancelable) event.preventDefault();
    resetView();
  });
})();
]]></script>`;

    return svgMarkup.replace(/<\/svg>\s*$/i, `${runtimeStyle}${runtimeScript}</svg>`);
  };

  private readonly createVisualExportNode = (zoomScale: number) => {
    const plane = this.planeElement()?.nativeElement;

    if (!plane) return null;

    const bounds = toExportBounds(this.renderedNodes());
    const width = Math.max(1, toFiniteNumber(bounds.width, canvasSize.width));
    const height = Math.max(1, toFiniteNumber(bounds.height, canvasSize.height));
    const minX = toFiniteNumber(bounds.minX, 0);
    const minY = toFiniteNumber(bounds.minY, 0);
    const exportNode = document.createElement('div');

    exportNode.style.background = 'radial-gradient(circle at 1px 1px, #d8dee8 1px, transparent 0), #f6f4ef';
    exportNode.style.backgroundSize = '24px 24px';
    exportNode.style.height = `${height}px`;
    exportNode.style.left = '0';
    exportNode.style.overflow = 'hidden';
    exportNode.style.pointerEvents = 'none';
    exportNode.style.position = 'fixed';
    exportNode.style.top = '0';
    exportNode.style.width = `${width}px`;
    exportNode.style.zIndex = '-1';

    const planeClone = plane.cloneNode(true);

    if (!(planeClone instanceof HTMLDivElement)) return null;

    const safeZoomScale = Number.isFinite(zoomScale) && zoomScale > 0 ? zoomScale : 1;

    planeClone.style.height = `${canvasSize.height}px`;
    planeClone.style.left = '0';
    planeClone.style.position = 'relative';
    planeClone.style.top = '0';
    planeClone.style.transform = `translate(${-minX}px, ${-minY}px) scale(${safeZoomScale})`;
    planeClone.style.transformOrigin = 'left top';
    planeClone.style.width = `${canvasSize.width}px`;

    planeClone
      .querySelectorAll<SVGPathElement>('path.edge-line, path.edge-line-live, path.edge-line-preview, path.edge-line-live-export')
      .forEach((edgeLine) => {
        edgeLine.style.filter = 'none';
        edgeLine.style.webkitFilter = 'none';
        edgeLine.style.fill = 'none';
        edgeLine.style.strokeLinecap = 'round';
        edgeLine.style.strokeLinejoin = 'round';

        if (edgeLine.classList.contains('edge-line-dashed')) {
          edgeLine.style.strokeDasharray = '8 6';
          return;
        }

        if (edgeLine.classList.contains('edge-line-live-dashed')) {
          edgeLine.style.strokeDasharray = '24 12';
          return;
        }

        if (edgeLine.classList.contains('edge-line-live') || edgeLine.classList.contains('edge-line-live-export')) {
          edgeLine.style.strokeDasharray = '30 16';
        }
      });

    exportNode.appendChild(planeClone);
    document.body.appendChild(exportNode);

    return {
      cleanup: () => {
        if (exportNode.parentNode) {
          exportNode.parentNode.removeChild(exportNode);
        }
      },
      height,
      node: exportNode,
      width
    };
  };

  private readonly undoBoardChange = () => {
    this.finalizeHistoryBatch();

    if (this.historyPast.length === 0) return false;

    const previousSnapshot = this.historyPast.pop();

    if (!previousSnapshot) return false;

    const currentSnapshot = JSON.stringify(toSaveBoard(this.boardTitle() || this.plan.title, this.nodes(), this.edges()));
    this.historyFuture.push(currentSnapshot);

    if (this.historyFuture.length > historyMaxEntries) {
      this.historyFuture = this.historyFuture.slice(this.historyFuture.length - historyMaxEntries);
    }

    this.applyHistorySnapshot(previousSnapshot);
    return true;
  };

  private readonly redoBoardChange = () => {
    this.finalizeHistoryBatch();

    if (this.historyFuture.length === 0) return false;

    const nextSnapshot = this.historyFuture.pop();

    if (!nextSnapshot) return false;

    const currentSnapshot = JSON.stringify(toSaveBoard(this.boardTitle() || this.plan.title, this.nodes(), this.edges()));
    this.historyPast.push(currentSnapshot);

    if (this.historyPast.length > historyMaxEntries) {
      this.historyPast = this.historyPast.slice(this.historyPast.length - historyMaxEntries);
    }

    this.applyHistorySnapshot(nextSnapshot);
    return true;
  };

  private readonly applyHistorySnapshot = (snapshot: string) => {
    const planId = this.currentPlanId() ?? this.plan.id;
    const parsed = JSON.parse(snapshot) as ReturnType<typeof toSaveBoard>;
    const boardPayload = {
      edges: parsed.edges,
      id: this.lastPersistedPlanId ?? `local-history-${planId}`,
      nodes: parsed.nodes,
      pdiPlanId: planId,
      title: parsed.title,
      updatedAt: new Date().toISOString()
    } as Parameters<typeof toCanvasNodes>[0];

    this.isRestoringHistory = true;
    this.boardTitle.set(parsed.title);
    this.nodes.set(toCanvasNodes(boardPayload));
    this.edges.set(toCanvasEdges(boardPayload));
    this.selectedNodeIds.set([]);
    this.selectedNodeId.set(null);
    this.selectedEdgeId.set(null);
    this.connectorSourceId.set(null);
    this.activeConnector.set(null);
    this.historySnapshot = snapshot;
    this.isRestoringHistory = false;

    window.requestAnimationFrame(() => {
      this.syncStageViewport();
    });
  };

  private readonly withHistoryBatch = (operation: () => void) => {
    this.beginHistoryBatch();

    try {
      operation();
    } finally {
      this.endHistoryBatch();
    }
  };

  private readonly beginHistoryBatch = () => {
    if (this.historyBatchDepth === 0) {
      this.historyBatchBaseSnapshot = JSON.stringify(toSaveBoard(this.boardTitle() || this.plan.title, this.nodes(), this.edges()));
    }

    this.historyBatchDepth += 1;
  };

  private readonly endHistoryBatch = () => {
    if (this.historyBatchDepth === 0) return;

    this.historyBatchDepth -= 1;

    if (this.historyBatchDepth > 0) return;

    this.commitHistoryBatch();
  };

  private readonly finalizeHistoryBatch = () => {
    if (this.historyBatchDepth === 0) return;

    this.historyBatchDepth = 0;
    this.commitHistoryBatch();
  };

  private readonly commitHistoryBatch = () => {
    const baseSnapshot = this.historyBatchBaseSnapshot;
    this.historyBatchBaseSnapshot = null;
    const nextSnapshot = JSON.stringify(toSaveBoard(this.boardTitle() || this.plan.title, this.nodes(), this.edges()));

    if (this.historySnapshot === null) {
      this.historySnapshot = nextSnapshot;
      this.historyPast = [];
      this.historyFuture = [];
      return;
    }

    if (!baseSnapshot || nextSnapshot === baseSnapshot) {
      this.historySnapshot = nextSnapshot;
      return;
    }

    if (this.isApplyingRemoteBoard || this.isRestoringHistory) {
      this.historySnapshot = nextSnapshot;
      return;
    }

    this.historyPast.push(baseSnapshot);

    if (this.historyPast.length > historyMaxEntries) {
      this.historyPast = this.historyPast.slice(this.historyPast.length - historyMaxEntries);
    }

    this.historyFuture = [];
    this.historySnapshot = nextSnapshot;
  };

  private readonly svgBlobToPngBlob = async (svgBlob: Blob, width: number, height: number, pixelRatio: number) => {
    const objectUrl = URL.createObjectURL(svgBlob);

    try {
      const image = await this.loadImageFromUrl(objectUrl);
      const canvas = document.createElement('canvas');

      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);

      const context = canvas.getContext('2d');

      if (!context) throw new Error('Failed to create canvas 2D context');

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.drawImage(image, 0, 0, width, height);

      const pngBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      });

      if (!pngBlob) throw new Error('Failed to encode board PNG');

      return pngBlob;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  private readonly loadImageFromUrl = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load board SVG image'));
      image.src = url;
    });

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

    this.withHistoryBatch(() => {
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
    });

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
