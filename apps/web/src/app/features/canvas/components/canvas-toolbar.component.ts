import { Component, input, output } from '@angular/core';
import type { CanvasEdgeLineStyle, CanvasEdgeType, CanvasNodeKind, CanvasShapeVariant, CanvasTextAlign, CanvasTextVerticalAlign } from '@pdi/contracts';
import { LucideAngularModule } from 'lucide-angular';
import { nodeKindMeta, nodeKindOrder } from '../canvas.constants';
import type { CanvasEdgeDirection, CanvasEdgePatch, CanvasEdgeView, CanvasNodeStylePatch, CanvasNodeView, CanvasTextStyle } from '../canvas.models';

const inputValue = (event: Event) => (event.target as HTMLInputElement | HTMLSelectElement).value;

@Component({
  selector: 'app-canvas-toolbar',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './canvas-toolbar.component.html',
  styleUrl: './canvas-toolbar.component.css'
})
export class CanvasToolbarComponent {
  readonly selectedNode = input<CanvasNodeView | null>(null);
  readonly selectedEdge = input<CanvasEdgeView | null>(null);
  readonly selectedEdgeDirection = input<CanvasEdgeDirection>('left-to-right');
  readonly connectorSourceId = input<string | null>(null);
  readonly createNode = output<{ kind: CanvasNodeKind; variant?: CanvasShapeVariant }>();
  readonly nodeStyleChange = output<CanvasNodeStylePatch>();
  readonly textStyleChange = output<Partial<CanvasTextStyle>>();
  readonly edgeChange = output<CanvasEdgePatch>();
  readonly toggleConnectorMode = output<void>();

  protected readonly nodeKindMeta = nodeKindMeta;
  protected readonly nodeKindOrder = nodeKindOrder;

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
