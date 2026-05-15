import { NgStyle } from '@angular/common';
import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
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
  imports: [NgStyle, LucideAngularModule],
  templateUrl: './canvas-node.component.html',
  styleUrl: './canvas-node.component.css'
})
export class CanvasNodeComponent {
  readonly node = input.required<CanvasNodeView>();
  readonly selected = input(false);
  readonly dataChange = output<CanvasNodeDataPatch>();
  readonly connectorStart = output<{ event: PointerEvent; handle: CanvasHandlePosition }>();
  readonly resizeStart = output<PointerEvent>();

  private readonly hostElement = inject(ElementRef<HTMLElement>);
  protected readonly isEditing = signal(false);
  protected readonly editingChecklistItemId = signal<string | null>(null);
  private taskToggleTimeoutId: number | null = null;
  private readonly checklistToggleTimeoutById = new Map<string, number>();
  protected readonly nodeClasses = computed(() => toNodeClassName(this.node(), this.selected()));
  protected readonly textValue = computed(() =>
    this.node().kind === 'TASK_LIST' ? (this.node().taskItems ?? []).map((item) => item.label).join('\n') : this.node().label
  );
  protected readonly textRows = computed(() =>
    this.node().kind === 'TASK_LIST'
      ? Math.max((this.node().taskItems ?? []).length, 1)
      : Math.max(this.node().label.split('\n').length, 1)
  );
  protected readonly goalIconSize = computed(() => {
    const node = this.node();
    return Math.max(16, Math.min(24, Math.round(Math.min(node.width, node.height) * 0.14)));
  });

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

  protected readonly handleNodeDoubleClick = (event: Event) => {
    event.stopPropagation();

    this.isEditing.set(true);
    this.focusEditableControl();
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

  protected readonly handleTaskToggle = (event: MouseEvent) => {
    event.stopPropagation();

    if (event.detail > 1) {
      if (this.taskToggleTimeoutId !== null) {
        window.clearTimeout(this.taskToggleTimeoutId);
        this.taskToggleTimeoutId = null;
      }
      return;
    }

    this.taskToggleTimeoutId = window.setTimeout(() => {
      this.dataChange.emit({ checked: !this.node().checked });
      this.taskToggleTimeoutId = null;
    }, 200);
  };

  protected readonly handleTaskEditStart = (event: Event) => {
    event.stopPropagation();

    if (this.taskToggleTimeoutId !== null) {
      window.clearTimeout(this.taskToggleTimeoutId);
      this.taskToggleTimeoutId = null;
    }

    this.isEditing.set(true);
    this.focusEditableControl();
  };

  protected readonly handleTaskLabelInput = (event: Event) => {
    const value = (event.target as HTMLTextAreaElement).value;
    this.dataChange.emit({ label: value });
  };

  protected readonly handleTaskLabelBlur = () => {
    this.isEditing.set(false);
  };

  protected readonly handleTaskLabelKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      (event.target as HTMLTextAreaElement).blur();
    }
  };

  protected readonly handleChecklistToggle = (event: MouseEvent, itemId: string) => {
    event.stopPropagation();

    if (event.detail > 1) {
      const timeoutId = this.checklistToggleTimeoutById.get(itemId);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        this.checklistToggleTimeoutById.delete(itemId);
      }
      return;
    }

    const timeoutId = window.setTimeout(() => {
      this.dataChange.emit({
        taskItems: (this.node().taskItems ?? []).map((item) =>
          item.id === itemId ? { ...item, checked: !item.checked } : item
        )
      });
      this.checklistToggleTimeoutById.delete(itemId);
    }, 200);

    this.checklistToggleTimeoutById.set(itemId, timeoutId);
  };

  protected readonly handleChecklistEditStart = (event: Event, itemId: string) => {
    event.stopPropagation();

    const timeoutId = this.checklistToggleTimeoutById.get(itemId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      this.checklistToggleTimeoutById.delete(itemId);
    }

    const item = (this.node().taskItems ?? []).find((candidate) => candidate.id === itemId);

    if (!item) return;

    this.isEditing.set(true);
    this.editingChecklistItemId.set(itemId);
    this.focusEditableControl();
  };

  protected readonly handleChecklistLabelInput = (event: Event, itemId: string) => {
    const value = (event.target as HTMLTextAreaElement).value;

    this.dataChange.emit({
      taskItems: (this.node().taskItems ?? []).map((item) => (item.id === itemId ? { ...item, label: value } : item))
    });
  };

  protected readonly handleChecklistLabelBlur = () => {
    this.editingChecklistItemId.set(null);
    this.isEditing.set(false);
  };

  protected readonly handleChecklistLabelKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      (event.target as HTMLTextAreaElement).blur();
    }
  };

  protected readonly handleTextInput = (event: Event) => {
    const value = (event.target as HTMLTextAreaElement).value;

    this.dataChange.emit(
      this.node().kind === 'TASK_LIST'
        ? { taskItems: toTaskItemsFromText(value, this.node().taskItems) }
        : { label: value }
    );
  };

  protected readonly handleEditableKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;

    const control = event.target as HTMLTextAreaElement;
    const value = control.value;
    const selectionStart = control.selectionStart ?? value.length;
    const selectionEnd = control.selectionEnd ?? selectionStart;

    event.preventDefault();

    if (event.shiftKey) {
      const nextValue = `${value.slice(0, selectionEnd)}\n${value.slice(selectionEnd)}`;
      const nextCursor = selectionEnd + 1;

      control.value = nextValue;
      control.setSelectionRange(nextCursor, nextCursor);
      control.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    const currentLineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
    const nextValue = `${value.slice(0, currentLineStart)}\n${value.slice(currentLineStart)}`;

    control.value = nextValue;
    control.setSelectionRange(currentLineStart, currentLineStart);
    control.dispatchEvent(new Event('input', { bubbles: true }));
  };

  private readonly focusEditableControl = () => {
    window.requestAnimationFrame(() => {
      const control = this.hostElement.nativeElement.querySelector('.pdi-editable-control') as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;

      if (!control) return;

      control.focus();

      const length = control.value.length;

      if (typeof control.setSelectionRange === 'function') {
        control.setSelectionRange(length, length);
      }
    });
  };
}
