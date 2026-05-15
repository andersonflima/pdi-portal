import { NgStyle } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import type { CanvasHandlePosition, CanvasNodeDataPatch, CanvasNodeView } from '../canvas.models';
import { getNodeTextColor } from '../canvas.colors';
import { toTaskItemsFromText } from '../canvas.mappers';

const toContentAlignment = (verticalAlign?: string) => {
  if (verticalAlign === 'bottom') return 'end';
  if (verticalAlign === 'center') return 'center';
  return 'start';
};

const toNodeClassName = (node: CanvasNodeView, selected: boolean) =>
  [
    'pdi-node',
    `pdi-node-${node.kind.toLowerCase().replace('_', '-')}`,
    node.kind === 'SHAPE' ? `pdi-shape-${(node.variant ?? 'DIAMOND').toLowerCase().replace('_', '-')}` : '',
    `pdi-align-${node.textStyle?.align ?? 'left'}`,
    `pdi-valign-${node.textStyle?.verticalAlign ?? 'top'}`,
    selected ? 'is-selected' : ''
  ]
    .filter(Boolean)
    .join(' ');

@Component({
  selector: 'app-canvas-node',
  standalone: true,
  imports: [NgStyle],
  templateUrl: './canvas-node.component.html',
  styleUrl: './canvas-node.component.css'
})
export class CanvasNodeComponent {
  readonly node = input.required<CanvasNodeView>();
  readonly selected = input(false);
  readonly dataChange = output<CanvasNodeDataPatch>();
  readonly connectorStart = output<{ event: PointerEvent; handle: CanvasHandlePosition }>();
  readonly resizeStart = output<PointerEvent>();

  protected readonly isEditing = signal(false);
  protected readonly nodeClasses = computed(() => toNodeClassName(this.node(), this.selected()));
  protected readonly textValue = computed(() =>
    this.node().kind === 'TASK_LIST' ? (this.node().taskItems ?? []).map((item) => item.label).join('\n') : this.node().label
  );
  protected readonly textRows = computed(() =>
    this.node().kind === 'TASK_LIST'
      ? Math.max((this.node().taskItems ?? []).length, 1)
      : Math.max(this.node().label.split('\n').length, 1)
  );

  protected readonly nodeStyle = computed(() => {
    const node = this.node();

    return {
      '--node-background': node.backgroundColor ?? 'transparent',
      '--node-color': node.color,
      '--node-font-size': node.textStyle?.fontSize ? `${node.textStyle.fontSize}px` : null,
      '--node-font-style': node.textStyle?.italic ? 'italic' : null,
      '--node-font-weight': node.textStyle?.bold ? '800' : null,
      '--node-text-align': node.textStyle?.align ?? 'left',
      '--node-text-color': getNodeTextColor(node),
      '--node-text-decoration': node.textStyle?.underline ? 'underline' : null,
      '--node-vertical-align': toContentAlignment(node.textStyle?.verticalAlign)
    };
  });

  protected readonly editLabel = computed(() => {
    const node = this.node();

    if (node.kind === 'TASK_LIST') return 'Checklist steps';
    if (node.kind === 'NOTE' || node.kind === 'STICKER') return `${node.kind.toLowerCase()} body`;

    return `${node.kind.toLowerCase()} text`;
  });

  protected readonly stopCanvasInteraction = (event: Event) => {
    event.stopPropagation();
  };

  protected readonly handleResizeStart = (event: PointerEvent) => {
    event.stopPropagation();
    this.resizeStart.emit(event);
  };

  protected readonly handleConnectorStart = (event: PointerEvent, handle: CanvasHandlePosition) => {
    event.preventDefault();
    event.stopPropagation();
    this.connectorStart.emit({ event, handle });
  };

  protected readonly handleTaskToggle = (event: Event) => {
    event.stopPropagation();
    this.dataChange.emit({ checked: !this.node().checked });
  };

  protected readonly handleChecklistToggle = (event: Event, itemId: string) => {
    event.stopPropagation();
    this.dataChange.emit({
      taskItems: (this.node().taskItems ?? []).map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item
      )
    });
  };

  protected readonly handleTextInput = (event: Event) => {
    const value = (event.target as HTMLTextAreaElement).value;

    this.dataChange.emit(
      this.node().kind === 'TASK_LIST'
        ? { taskItems: toTaskItemsFromText(value, this.node().taskItems) }
        : { label: value }
    );
  };
}
