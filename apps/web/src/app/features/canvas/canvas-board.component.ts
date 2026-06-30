import {
  AfterViewInit,
  ChangeDetectionStrategy,
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
import { FeatureFlagsService } from '../../core/platform/feature-flags.service';
import { CanvasEdgeOperationsService } from './application/canvas-edge-operations.service';
import { CanvasFacade } from './application/canvas.facade';
import { CanvasHistoryService } from './application/canvas-history.service';
import { CanvasInteractionControllerService } from './application/canvas-interaction-controller.service';
import { CanvasLiveSyncService } from './application/canvas-live-sync.service';
import { ApiService } from '../../core/api/api.service';
import { CanvasEdgeLayerComponent } from './components/canvas-edge-layer.component';
import { CanvasHeaderComponent } from './components/canvas-header.component';
import { CanvasNodeComponent } from './components/canvas-node.component';
import { CanvasToolbarComponent } from './components/canvas-toolbar.component';
import { canvasSize, nodeKindMeta, nodeKindOrder } from './canvas.constants';
import { getConnectorLabelPoint } from './canvas.geometry';
import { createCanvasNode, toCanvasEdges, toCanvasNodes, toSaveBoard } from './canvas.mappers';
import type {
  CanvasEdgeDirection,
  CanvasEdgePatch,
  CanvasEdgeView,
  CanvasHandlePosition,
  CanvasNodeDataPatch,
  CanvasNodeProgressPatch,
  CanvasNodeStylePatch,
  CanvasNodeView,
  CanvasTextStyle,
  XYPosition
} from './canvas.models';
import { arrowNeckOffset, toExportBounds, toFileName, toFiniteNumber } from './canvas-board.export-helpers';
import { buildBoardSvgMarkup } from './canvas-board.svg-export';
import {
  clampNodePositionToCanvas,
  clampPointToCanvas,
  clampZoom,
  findDescendantNodeIds,
  findNodeHandleAtPoint,
  findTopNodeAtPoint,
  hasNodeOverlap,
  normalizeWheelDeltaY,
  nodePlacementPadding,
  toClosestHandle,
  toConnectorHandlePoint,
  toConnectorPath,
  toOppositeHandle,
  toSelectionBounds
} from './canvas-board.geometry';
import {
  bringNodeToFront,
  moveNodeBackward,
  moveNodeForward,
  nodeStackLevel,
  sendNodeToBack,
  sortNodesForRender
} from './canvas-board.layers';

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

const zoomStep = 0.1;
const wheelZoomSensitivity = 0.0022;
const dragStartThreshold = 4;
const autosaveDelayMs = 1200;
const marqueeStartThreshold = 6;
const minimapWidth = 240;
const minimapHeight = Math.round((minimapWidth * canvasSize.height) / canvasSize.width);
const exportImagePixelRatio = 2;
const exportZoomScale = 1;
const nodePlacementStep = 48;
const nodePlacementSearchRings = Math.ceil(Math.max(canvasSize.width, canvasSize.height) / nodePlacementStep);

const nodeCreationShortcuts = new Map<string, CanvasNodeKind>(
  nodeKindOrder.flatMap((kind) => {
    const shortcut = nodeKindMeta[kind].shortcut;

    return shortcut ? [[shortcut.toLowerCase(), kind]] : [];
  })
);

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target.closest('input') !== null ||
    target.closest('textarea') !== null ||
    target.closest('select') !== null
  );
};


@Component({
  selector: 'app-canvas-board',
  standalone: true,
  imports: [CanvasEdgeLayerComponent, CanvasHeaderComponent, CanvasNodeComponent, CanvasToolbarComponent, LucideAngularModule],
  templateUrl: './canvas-board.component.html',
  styleUrl: './canvas-board.component.css',
  providers: [
    CanvasFacade,
    CanvasHistoryService,
    CanvasEdgeOperationsService,
    CanvasInteractionControllerService,
    CanvasLiveSyncService
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CanvasBoardComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) isCreatingPlan = false;
  @Input({ required: true }) isExportingPlan = false;
  @Input({ required: true }) isImportingPlan = false;
  @Input({ required: true }) plan!: PdiPlan;
  @Input({ required: true }) plans: PdiPlan[] = [];
  @Input({ required: true }) user!: User;
  @Input({ required: true }) users: User[] = [];
  @Input({ required: true }) usersCount = 0;

  readonly createPlan = output<{ objective: string; ownerId?: string; title: string }>();
  readonly exportPlan = output<string>();
  readonly importPlan = output<File>();
  readonly logout = output<void>();
  readonly selectPlan = output<string>();

  private readonly api = inject(ApiService);
  private readonly edgeOperations = inject(CanvasEdgeOperationsService);
  private readonly interactionController = inject(CanvasInteractionControllerService);
  private readonly canvasFacade = inject(CanvasFacade);
  private readonly historyService = inject(CanvasHistoryService);
  private readonly liveSync = inject(CanvasLiveSyncService);
  private readonly featureFlags = inject(FeatureFlagsService);
  private readonly stageElement = viewChild<ElementRef<HTMLDivElement>>('canvasStage');
  private readonly planeElement = viewChild<ElementRef<HTMLDivElement>>('canvasPlane');
  private loadToken = 0;
  private isApplyingRemoteBoard = false;
  private isRestoringHistory = false;
  private lastPersistedPlanId: string | null = null;
  private lastPersistedBoardSnapshot: string | null = null;
  private isPersistingBoard = false;
  private queuedAutosaveSnapshot: { board: ReturnType<typeof toSaveBoard>; planId: string; snapshot: string } | null = null;
  private removeStageWheelListener: (() => void) | null = null;

  protected readonly canvasSize = canvasSize;
  protected readonly canvasEngineMode = this.featureFlags.canvasEngineMode;
  protected readonly minimapSize = { height: minimapHeight, width: minimapWidth };
  protected readonly activeConnector = this.canvasFacade.activeConnector;
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  protected readonly boardTitle = this.canvasFacade.boardTitle;
  protected readonly connectorSourceId = this.canvasFacade.connectorSourceId;
  protected readonly currentPlanId = this.canvasFacade.currentPlanId;
  protected readonly edges = this.canvasFacade.edges;
  protected readonly isPanning = this.canvasFacade.isPanning;
  protected readonly isSaving = this.canvasFacade.isSaving;
  protected readonly marqueeSelection = this.canvasFacade.marqueeSelection;
  protected readonly nodes = this.canvasFacade.nodes;
  protected readonly selectedEdgeId = this.canvasFacade.selectedEdgeId;
  protected readonly selectedNodeIds = this.canvasFacade.selectedNodeIds;
  protected readonly selectedNodeId = this.canvasFacade.selectedNodeId;
  protected readonly stageViewport = this.canvasFacade.stageViewport;
  protected readonly zoom = this.canvasFacade.zoom;

  protected readonly selectedNode = this.canvasFacade.selectedNode;
  protected readonly selectedEdge = this.canvasFacade.selectedEdge;
  protected readonly selectedEdgeDirection = computed<CanvasEdgeDirection>(() => {
    const selectedEdge = this.selectedEdge();

    if (!selectedEdge) return 'left-to-right';

    const reverseEdge = this.edges().find((edge) => edge.source === selectedEdge.target && edge.target === selectedEdge.source);

    if (reverseEdge) return 'both';

    return this.edgeOperations.edgeHorizontalDirection(selectedEdge, this.nodes());
  });
  protected readonly selectedNodeIdSet = computed(() => new Set(this.selectedNodeIds()));
  protected readonly nodeStackLevel = nodeStackLevel;
  protected readonly renderedNodes = computed(() => sortNodesForRender(this.nodes()));
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
        this.sendLiveBoard(title, nodes, edges);
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
      this.historyService.observeSnapshot(nextSnapshot, {
        isApplyingRemoteBoard: this.isApplyingRemoteBoard,
        isRestoringHistory: this.isRestoringHistory
      });
      this.refreshHistoryAvailability();
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

    const shortcutKind = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey ? nodeCreationShortcuts.get(event.key.toLowerCase()) : null;

    if (shortcutKind) {
      event.preventDefault();
      event.stopPropagation();
      this.createNodeOnBoard(shortcutKind);
      return;
    }

    if (isSelectAllShortcut) {
      event.preventDefault();
      event.stopPropagation();

      const allNodeIds = this.nodes().map((node) => node.id);

      this.canvasFacade.setNodeSelection(allNodeIds, true);
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
    this.canvasFacade.clearSelection();
  };

  protected readonly handleCreateNode = (event: { kind: CanvasNodeKind; variant?: CanvasShapeVariant }) => {
    this.createNodeOnBoard(event.kind, event.variant);
  };

  private readonly createNodeOnBoard = (kind: CanvasNodeKind, variant?: CanvasShapeVariant) => {
    const currentNodes = this.nodes();
    const node = createCanvasNode(kind, currentNodes, currentNodes.length, variant);
    const positionedNode = {
      ...node,
      position: this.findAvailableNodePosition(node, currentNodes)
    };

    this.nodes.set(currentNodes.concat(positionedNode));
    this.canvasFacade.selectSingleNode(positionedNode.id);
    this.connectorSourceId.set(null);
    this.activeConnector.set(null);
  };

  private readonly findAvailableNodePosition = (node: CanvasNodeView, nodes: CanvasNodeView[]) => {
    const viewport = this.stageViewport();
    const fallbackViewport = {
      height: Math.min(canvasSize.height, 720),
      left: Math.max(0, (canvasSize.width - 960) / 2),
      top: Math.max(0, (canvasSize.height - 720) / 2),
      width: Math.min(canvasSize.width, 960)
    };
    const placementViewport = viewport.width > 0 && viewport.height > 0 ? viewport : fallbackViewport;
    const origin = clampNodePositionToCanvas(node, {
      x: placementViewport.left + placementViewport.width / 2 - node.width / 2,
      y: placementViewport.top + placementViewport.height / 2 - node.height / 2
    });
    const candidates = [
      origin,
      ...this.nodePlacementGridPositions(node, placementViewport),
      ...this.nodePlacementGridPositions(node, {
        height: canvasSize.height,
        left: 0,
        top: 0,
        width: canvasSize.width
      })
    ];

    for (const position of candidates) {
      const candidate = { ...node, position };

      if (!hasNodeOverlap(candidate, nodes)) return position;
    }

    for (let ring = 0; ring <= nodePlacementSearchRings; ring += 1) {
      const offsets = ring === 0 ? [{ x: 0, y: 0 }] : this.nodePlacementRingOffsets(ring);

      for (const offset of offsets) {
        const position = clampNodePositionToCanvas(node, {
          x: origin.x + offset.x,
          y: origin.y + offset.y
        });
        const candidate = { ...node, position };

        if (!hasNodeOverlap(candidate, nodes)) return position;
      }
    }

    return origin;
  };

  private readonly nodePlacementGridPositions = (
    node: Pick<CanvasNodeView, 'height' | 'width'>,
    area: { height: number; left: number; top: number; width: number }
  ): XYPosition[] => {
    const left = Math.max(0, Math.floor(area.left) + nodePlacementPadding);
    const top = Math.max(0, Math.floor(area.top) + nodePlacementPadding);
    const right = Math.min(canvasSize.width - node.width, Math.ceil(area.left + area.width) - node.width - nodePlacementPadding);
    const bottom = Math.min(canvasSize.height - node.height, Math.ceil(area.top + area.height) - node.height - nodePlacementPadding);

    if (right < left || bottom < top) return [];

    const positions: XYPosition[] = [];

    for (let y = top; y <= bottom; y += nodePlacementStep) {
      for (let x = left; x <= right; x += nodePlacementStep) {
        positions.push({ x, y });
      }
    }

    return positions;
  };

  private readonly nodePlacementRingOffsets = (ring: number): XYPosition[] => {
    const distance = ring * nodePlacementStep;
    const offsets: XYPosition[] = [];

    for (let x = -distance; x <= distance; x += nodePlacementStep) {
      offsets.push({ x, y: -distance }, { x, y: distance });
    }

    for (let y = -distance + nodePlacementStep; y <= distance - nodePlacementStep; y += nodePlacementStep) {
      offsets.push({ x: -distance, y }, { x: distance, y });
    }

    return offsets;
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
      this.canvasFacade.setNodeSelection([]);
      return;
    }

    const isAdditiveSelection = event.shiftKey || event.metaKey || event.ctrlKey;

    if (isAdditiveSelection) {
      this.canvasFacade.toggleNodeSelection(node.id);
      this.selectedEdgeId.set(null);
      return;
    }

    const selectedNodeIdSet = this.selectedNodeIdSet();

    if (!selectedNodeIdSet.has(node.id) || selectedNodeIdSet.size <= 1) {
      this.canvasFacade.selectSingleNode(node.id);
    }

    this.canvasFacade.setActiveNode(node.id);
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

    this.canvasFacade.selectSingleNode(node.id);
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
    this.canvasFacade.selectEdge(edgeId);
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

  protected readonly updateSelectedNodeProgress = (input: CanvasNodeProgressPatch) => {
    const selectedNode = this.selectedNode();

    if (!selectedNode) return;

    this.nodes.update((nodes) =>
      nodes.map((node) => {
        if (node.id !== selectedNode.id) return node;

        return {
          ...node,
          progress:
            input.progress === undefined ? node.progress : Math.max(0, Math.min(100, Math.round(input.progress))),
          startDate: input.startDate === undefined ? node.startDate : (input.startDate ?? undefined),
          targetDate: input.targetDate === undefined ? node.targetDate : (input.targetDate ?? undefined)
        };
      })
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

    this.edges.update((edges) => {
      const mutationResult = this.edgeOperations.mutateSelectedEdge(edges, this.nodes(), selectedEdge, input);
      this.selectedEdgeId.set(mutationResult.selectedEdgeId);
      return mutationResult.edges;
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

    const { markup: fallbackMarkup } = buildBoardSvgMarkup({ renderedNodes: this.renderedNodes(), nodes: this.nodes(), edges: this.edges() });
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

    const { height, markup: fallbackMarkup, width } = buildBoardSvgMarkup({ renderedNodes: this.renderedNodes(), nodes: this.nodes(), edges: this.edges() });
    const fallbackSvg = new Blob([this.sanitizeExportedSvgMarkup(fallbackMarkup)], { type: 'image/svg+xml;charset=utf-8' });
    const pngBlob = await this.svgBlobToPngBlob(fallbackSvg, width, height, exportImagePixelRatio);
    this.downloadBlob(pngBlob, toFileName(title, 'png'));
  };

  private readonly loadBoard = async (planId: string) => {
    const token = ++this.loadToken;
    this.closeLiveConnection();
    this.isApplyingRemoteBoard = true;
    this.historyService.reset();
    this.boardTitle.set('');
    this.currentPlanId.set(planId);
    this.nodes.set([]);
    this.edges.set([]);
    this.canvasFacade.setNodeSelection([], true);
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
    this.liveSync.connect({
      apiUrl: this.api.apiUrl,
      planId,
      token: this.api.getToken(),
      onRemoteBoard: (payload) => this.applyRemoteBoard(payload)
    });
  };

  private readonly applyRemoteBoard = (payload: Parameters<typeof toCanvasNodes>[0] & { pdiPlanId: string }) => {
    this.isApplyingRemoteBoard = true;
    const boardNodes = toCanvasNodes(payload);
    const boardEdges = toCanvasEdges(payload);

    this.boardTitle.set(payload.title);
    this.nodes.set(boardNodes);
    this.edges.set(boardEdges);
    this.markBoardAsPersisted(payload.pdiPlanId, payload.title, boardNodes, boardEdges);
    this.syncStageViewport();
    window.setTimeout(() => {
      this.isApplyingRemoteBoard = false;
    }, 0);
  };

  private readonly closeLiveConnection = () => {
    this.liveSync.close();
  };

  private readonly sendLiveBoard = (title: string, nodes: CanvasNodeView[], edges: CanvasEdgeView[]) => {
    this.liveSync.send(toSaveBoard(title, nodes, edges));
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
    const nodeIdsToMove = this.interactionController.resolveNodeIdsToMove(
      node,
      this.nodes(),
      this.selectedNodeIdSet(),
      findDescendantNodeIds
    );
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

        this.nodes.update((nodes) => this.interactionController.updateNodeParents(nodes, movedNonFrameNodeIds));
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd, { once: true });
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

      const nextSelection = this.interactionController.computeMarqueeSelection(
        this.nodes(),
        origin,
        currentPoint,
        initialSelection,
        append
      );
      this.canvasFacade.setNodeSelection(nextSelection);
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

      const nextSelection = this.interactionController.computeMarqueeSelection(
        this.nodes(),
        origin,
        releasePoint,
        initialSelection,
        append
      );
      this.canvasFacade.setNodeSelection(nextSelection);
      this.marqueeSelection.set(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd, { once: true });
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

  private readonly bringSelectedNodeToFront = () => this.applyNodeOrderChange(bringNodeToFront);

  private readonly sendSelectedNodeToBack = () => this.applyNodeOrderChange(sendNodeToBack);

  private readonly moveSelectedNodeOneLayerForward = () => this.applyNodeOrderChange(moveNodeForward);

  private readonly moveSelectedNodeOneLayerBackward = () => this.applyNodeOrderChange(moveNodeBackward);

  private readonly applyNodeOrderChange = (
    reorder: (nodes: CanvasNodeView[], selectedNodeId: string) => { changed: boolean; nodes: CanvasNodeView[] }
  ) => {
    const selectedNodeId = this.selectedNodeId();

    if (!selectedNodeId) return false;

    let hasChanged = false;

    this.nodes.update((nodes) => {
      const result = reorder(nodes, selectedNodeId);
      hasChanged = result.changed;

      return result.nodes;
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
  stroke-dasharray: 6 12;
}
.edge-line-live {
  animation: edge-dash-flow 0.45s linear infinite !important;
  fill: none;
  opacity: 0.95;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.6;
  stroke-dasharray: 30 10;
}
.edge-line-live-solid {
  stroke-dasharray: 30 10;
}
.edge-line-live-dashed {
  stroke-dasharray: 10 24;
}
.edge-line-live-export {
  animation: edge-dash-flow 0.45s linear infinite !important;
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
  animation: edge-dash-flow 0.45s linear infinite !important;
}
.edge-line-live-bidirectional-reverse {
  animation: edge-dash-flow-reverse 0.45s linear infinite !important;
}
.edge-line-live-export-reverse {
  animation: edge-dash-flow-reverse 0.45s linear infinite !important;
}
@keyframes edge-dash-flow {
  to {
    stroke-dashoffset: -72;
  }
}
@keyframes edge-dash-flow-reverse {
  to {
    stroke-dashoffset: 72;
  }
}
@media (prefers-reduced-motion: reduce) {
  .edge-line-live {
    animation: edge-dash-flow 0.45s linear infinite !important;
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
          edgeLine.style.strokeDasharray = '6 12';
          return;
        }

        if (edgeLine.classList.contains('edge-line-live-dashed')) {
          edgeLine.style.strokeDasharray = '10 24';
          return;
        }

        if (edgeLine.classList.contains('edge-line-live') || edgeLine.classList.contains('edge-line-live-export')) {
          edgeLine.style.strokeDasharray = '30 10';
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

  protected readonly handleUndo = () => {
    this.undoBoardChange();
  };

  protected readonly handleRedo = () => {
    this.redoBoardChange();
  };

  private readonly refreshHistoryAvailability = () => {
    this.canUndo.set(this.historyService.canUndo());
    this.canRedo.set(this.historyService.canRedo());
  };

  private readonly undoBoardChange = () => {
    this.finalizeHistoryBatch();
    const previousSnapshot = this.historyService.undo(this.currentBoardSnapshot());
    if (!previousSnapshot) return false;
    this.applyHistorySnapshot(previousSnapshot);
    this.refreshHistoryAvailability();
    return true;
  };

  private readonly redoBoardChange = () => {
    this.finalizeHistoryBatch();
    const nextSnapshot = this.historyService.redo(this.currentBoardSnapshot());
    if (!nextSnapshot) return false;
    this.applyHistorySnapshot(nextSnapshot);
    this.refreshHistoryAvailability();
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
    this.canvasFacade.clearSelection();
    this.historyService.setSnapshot(snapshot);
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
    this.historyService.beginBatch(this.currentBoardSnapshot());
  };

  private readonly endHistoryBatch = () => {
    this.historyService.endBatch(this.currentBoardSnapshot(), this.historyCommitOptions());
  };

  private readonly finalizeHistoryBatch = () => {
    this.historyService.finalizeBatch(this.currentBoardSnapshot(), this.historyCommitOptions());
  };

  private readonly currentBoardSnapshot = () =>
    JSON.stringify(toSaveBoard(this.boardTitle() || this.plan.title, this.nodes(), this.edges()));

  private readonly historyCommitOptions = () => ({
    isApplyingRemoteBoard: this.isApplyingRemoteBoard,
    isRestoringHistory: this.isRestoringHistory
  });

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
    this.canvasFacade.selectEdge(null);

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

      this.canvasFacade.clearSelection();
    });

    return true;
  };

  private readonly createConnector = (
    source: string,
    target: string,
    sourceHandle?: string,
    targetHandle?: string
  ) => {
    this.edges.update((edges) => this.edgeOperations.createConnector(edges, source, target, sourceHandle, targetHandle));
  };
}
