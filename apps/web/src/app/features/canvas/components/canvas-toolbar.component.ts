import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { CanvasEdgeLineStyle, CanvasEdgeType, CanvasNodeKind, CanvasShapeVariant, CanvasTextAlign, CanvasTextVerticalAlign } from '@pdi/contracts';
import { LucideAngularModule } from 'lucide-angular';
import { nodeKindMeta, nodeKindOrder } from '../canvas.constants';
import type { CanvasEdgeDirection, CanvasEdgePatch, CanvasEdgeView, CanvasNodeProgressPatch, CanvasNodeStylePatch, CanvasNodeView, CanvasTextStyle } from '../canvas.models';

const inputValue = (event: Event) => (event.target as HTMLInputElement | HTMLSelectElement).value;

const progressKinds = new Set<CanvasNodeKind>(['TASK', 'TASK_LIST', 'GOAL', 'CARD', 'NOTE']);

const toDateInputValue = (iso?: string) => (iso ? iso.slice(0, 10) : '');

const toIsoDate = (value: string): string | null => (value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null);

@Component({
  selector: 'app-canvas-toolbar',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './canvas-toolbar.component.html',
  styleUrl: './canvas-toolbar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CanvasToolbarComponent {
  readonly selectedNode = input<CanvasNodeView | null>(null);
  readonly selectedEdge = input<CanvasEdgeView | null>(null);
  readonly selectedEdgeDirection = input<CanvasEdgeDirection>('left-to-right');
  readonly connectorSourceId = input<string | null>(null);
  readonly canUndo = input(false);
  readonly canRedo = input(false);
  readonly createNode = output<{ kind: CanvasNodeKind; variant?: CanvasShapeVariant }>();
  readonly nodeStyleChange = output<CanvasNodeStylePatch>();
  readonly textStyleChange = output<Partial<CanvasTextStyle>>();
  readonly edgeChange = output<CanvasEdgePatch>();
  readonly toggleConnectorMode = output<void>();
  readonly undo = output<void>();
  readonly redo = output<void>();
  readonly nodeProgressChange = output<CanvasNodeProgressPatch>();

  protected readonly nodeKindMeta = nodeKindMeta;
  protected readonly nodeKindOrder = nodeKindOrder;

  protected readonly supportsProgress = computed(() => {
    const node = this.selectedNode();
    return node ? progressKinds.has(node.kind) : false;
  });

  protected readonly progressValue = computed(() => this.selectedNode()?.progress ?? 0);
  protected readonly startDateValue = computed(() => toDateInputValue(this.selectedNode()?.startDate));
  protected readonly targetDateValue = computed(() => toDateInputValue(this.selectedNode()?.targetDate));

  protected readonly setProgress = (event: Event) => {
    const value = Number(inputValue(event));
    if (Number.isFinite(value)) this.nodeProgressChange.emit({ progress: value });
  };

  protected readonly setStartDate = (event: Event) => {
    this.nodeProgressChange.emit({ startDate: toIsoDate(inputValue(event)) });
  };

  protected readonly setTargetDate = (event: Event) => {
    this.nodeProgressChange.emit({ targetDate: toIsoDate(inputValue(event)) });
  };

  protected readonly handleCreateNode = (kind: CanvasNodeKind, variant?: CanvasShapeVariant) => {
    this.createNode.emit({ kind, variant });
  };

  protected readonly handleNodeColor = (event: Event) => {
    this.nodeStyleChange.emit({ color: inputValue(event) });
  };

  protected readonly handleFrameBackground = (event: Event) => {
    this.nodeStyleChange.emit({ backgroundColor: inputValue(event) });
  };

  protected readonly toggleTextStyle = (key: 'bold' | 'italic' | 'underline') => {
    const current = this.selectedNode()?.textStyle?.[key] ?? false;
    this.textStyleChange.emit({ [key]: !current });
  };

  protected readonly setTextAlign = (align: CanvasTextAlign) => {
    this.textStyleChange.emit({ align });
  };

  protected readonly setVerticalAlign = (verticalAlign: CanvasTextVerticalAlign) => {
    this.textStyleChange.emit({ verticalAlign });
  };

  protected readonly setFontSize = (event: Event) => {
    const value = Number(inputValue(event));
    this.textStyleChange.emit({ fontSize: Number.isFinite(value) && value > 0 ? value : undefined });
  };

  protected readonly setEdgeText = (event: Event) => {
    this.edgeChange.emit({ label: inputValue(event) });
  };

  protected readonly setEdgeColor = (event: Event) => {
    this.edgeChange.emit({ color: inputValue(event) });
  };

  protected readonly setEdgeType = (event: Event) => {
    this.edgeChange.emit({ type: inputValue(event) as CanvasEdgeType });
  };

  protected readonly setEdgeLineStyle = (event: Event) => {
    this.edgeChange.emit({ lineStyle: inputValue(event) as CanvasEdgeLineStyle });
  };

  protected readonly setEdgeDirection = (event: Event) => {
    this.edgeChange.emit({ direction: inputValue(event) as CanvasEdgeDirection });
  };
}
