import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  effect,
  input,
  output,
  viewChild
} from '@angular/core';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type ShortcutEntry = {
  readonly keys: readonly string[];
  readonly label: string;
};

type ShortcutGroup = {
  readonly title: string;
  readonly entries: readonly ShortcutEntry[];
};

const generalShortcuts: ShortcutGroup = {
  title: 'General',
  entries: [
    { keys: ['Ctrl/Cmd', 'Z'], label: 'Undo' },
    { keys: ['Shift', 'Ctrl/Cmd', 'Z'], label: 'Redo' },
    { keys: ['Ctrl', 'Y'], label: 'Redo (alternative)' },
    { keys: ['Ctrl/Cmd', 'A'], label: 'Select all elements' },
    { keys: ['Delete'], label: 'Delete selected element or connection' },
    { keys: ['Backspace'], label: 'Delete selected element or connection' },
    { keys: ['PageUp'], label: 'Bring selected element to front' },
    { keys: ['Shift', 'PageUp'], label: 'Move selected element one layer forward' },
    { keys: ['PageDown'], label: 'Send selected element to back' },
    { keys: ['Shift', 'PageDown'], label: 'Move selected element one layer back' }
  ]
};

const createElementShortcuts: ShortcutGroup = {
  title: 'Create element',
  entries: [
    { keys: ['1'], label: 'Post-it' },
    { keys: ['2'], label: 'Sticker' },
    { keys: ['3'], label: 'Card' },
    { keys: ['4'], label: 'Text' },
    { keys: ['5'], label: 'Task' },
    { keys: ['6'], label: 'Checklist' },
    { keys: ['7'], label: 'Goal' },
    { keys: ['8'], label: 'Frame' }
  ]
};

@Component({
  selector: 'app-keyboard-shortcuts',
  standalone: true,
  template: `
    @if (open()) {
      <div class="shortcuts-overlay" (click)="onOverlayClick($event)">
        <div
          #dialog
          class="shortcuts-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          tabindex="-1"
          (click)="$event.stopPropagation()"
          (keydown)="onDialogKeydown($event)"
        >
          <header class="shortcuts-header">
            <h2 id="shortcuts-title" class="shortcuts-title">Keyboard shortcuts</h2>
            <button #primary type="button" class="shortcuts-close" aria-label="Close" (click)="closed.emit()">
              &times;
            </button>
          </header>

          <div class="shortcuts-groups">
            @for (group of groups; track group.title) {
              <section class="shortcuts-group">
                <h3 class="shortcuts-group-title">{{ group.title }}</h3>
                <ul class="shortcuts-list">
                  @for (entry of group.entries; track entry.label + entry.keys.join('+')) {
                    <li class="shortcuts-row">
                      <span class="shortcuts-label">{{ entry.label }}</span>
                      <span class="shortcuts-keys">
                        @for (key of entry.keys; track key; let last = $last) {
                          <kbd>{{ key }}</kbd>
                          @if (!last) {
                            <span class="shortcuts-plus">+</span>
                          }
                        }
                      </span>
                    </li>
                  }
                </ul>
              </section>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .shortcuts-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: color-mix(in srgb, var(--color-overlay) 72%, transparent);
        backdrop-filter: blur(2px);
        animation: shortcuts-overlay-in 160ms ease-out;
      }

      .shortcuts-dialog {
        width: min(560px, 100%);
        max-height: min(80vh, 720px);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 22px 24px;
        background: var(--color-surface-floating);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        color: var(--color-content-primary);
        animation: shortcuts-dialog-in 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .shortcuts-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .shortcuts-title {
        margin: 0;
        font: var(--font-title-sm);
      }

      .shortcuts-close {
        cursor: pointer;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4rem;
        line-height: 1;
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--color-content-muted);
        transition: background 120ms ease, color 120ms ease;
      }

      .shortcuts-close:hover {
        background: var(--color-surface-raised);
        color: var(--color-content-primary);
      }

      .shortcuts-groups {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .shortcuts-group-title {
        margin: 0 0 10px;
        font: var(--font-label-md);
        color: var(--color-content-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .shortcuts-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .shortcuts-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .shortcuts-label {
        font: var(--font-body-sm);
        color: var(--color-content-primary);
      }

      .shortcuts-keys {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }

      .shortcuts-plus {
        font: var(--font-body-xs);
        color: var(--color-content-muted);
      }

      kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 24px;
        padding: 2px 7px;
        font: var(--font-mono-xs);
        color: var(--color-content-primary);
        background: var(--color-surface-raised);
        border: 1px solid var(--color-border-subtle);
        border-bottom-width: 2px;
        border-radius: var(--radius-sm);
      }

      @keyframes shortcuts-overlay-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes shortcuts-dialog-in {
        from {
          opacity: 0;
          transform: scale(0.96) translateY(6px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .shortcuts-overlay,
        .shortcuts-dialog {
          animation: none;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KeyboardShortcutsComponent {
  readonly open = input(false);
  readonly closed = output<void>();

  protected readonly groups: readonly ShortcutGroup[] = [generalShortcuts, createElementShortcuts];

  private readonly dialogRef = viewChild<ElementRef<HTMLElement>>('dialog');
  private readonly primaryRef = viewChild<ElementRef<HTMLElement>>('primary');

  private previouslyFocused: HTMLElement | null = null;
  private trapped = false;

  constructor() {
    effect(() => {
      const isOpen = this.open();
      const dialog = this.dialogRef()?.nativeElement;

      if (isOpen && dialog && !this.trapped) {
        this.trapped = true;
        this.previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;
        const primary = this.primaryRef()?.nativeElement ?? this.focusableElements(dialog)[0] ?? dialog;
        primary.focus();
      } else if (!isOpen && this.trapped) {
        this.trapped = false;
        this.restoreFocus();
      }
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape() {
    if (this.open()) {
      this.closed.emit();
    }
  }

  protected onOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  protected onDialogKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') {
      return;
    }

    const dialog = this.dialogRef()?.nativeElement;
    if (!dialog) {
      return;
    }

    const focusables = this.focusableElements(dialog);
    if (focusables.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey) {
      if (active === first || !dialog.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusableElements(dialog: HTMLElement): HTMLElement[] {
    return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1 && element.offsetParent !== null
    );
  }

  private restoreFocus() {
    const target = this.previouslyFocused;
    this.previouslyFocused = null;
    if (target && typeof target.focus === 'function' && document.contains(target)) {
      target.focus();
    }
  }
}
