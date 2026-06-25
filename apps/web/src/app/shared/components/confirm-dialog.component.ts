import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    @if (open()) {
      <div class="confirm-overlay" (click)="onOverlayClick($event)">
        <div
          class="confirm-dialog"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId"
          (click)="$event.stopPropagation()"
        >
          <h2 class="confirm-title" [id]="titleId">{{ title() }}</h2>
          <p class="confirm-message">{{ message() }}</p>

          <div class="confirm-actions">
            <button type="button" class="confirm-cancel" (click)="cancelled.emit()">
              {{ cancelLabel() }}
            </button>
            <button
              type="button"
              class="confirm-accept"
              [class.is-danger]="tone() === 'danger'"
              (click)="confirmed.emit()"
            >
              {{ confirmLabel() }}
            </button>
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

      .confirm-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: color-mix(in srgb, var(--color-overlay) 72%, transparent);
        backdrop-filter: blur(2px);
        animation: confirm-overlay-in 160ms ease-out;
      }

      .confirm-dialog {
        width: min(420px, 100%);
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 22px 24px;
        background: var(--color-surface-floating);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        color: var(--color-content-primary);
        animation: confirm-dialog-in 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .confirm-title {
        margin: 0;
        font: var(--font-title-sm);
        color: var(--color-content-primary);
      }

      .confirm-message {
        margin: 0;
        font: var(--font-body-sm);
        color: var(--color-content-muted);
      }

      .confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 8px;
      }

      .confirm-actions button {
        cursor: pointer;
        padding: 8px 16px;
        border-radius: var(--radius-sm);
        font: var(--font-label-md);
        border: 1px solid transparent;
        transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
      }

      .confirm-cancel {
        background: transparent;
        border-color: var(--color-border-subtle);
        color: var(--color-content-primary);
      }

      .confirm-cancel:hover {
        background: var(--color-surface-raised);
      }

      .confirm-accept {
        background: var(--color-action-primary);
        color: var(--color-content-on-primary);
      }

      .confirm-accept:hover {
        background: var(--color-action-primary-strong);
      }

      .confirm-accept.is-danger {
        background: #e5484d;
        color: #fff5f5;
      }

      .confirm-accept.is-danger:hover {
        background: #d13438;
      }

      @keyframes confirm-overlay-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes confirm-dialog-in {
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
        .confirm-overlay,
        .confirm-dialog {
          animation: none;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfirmDialogComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly message = input('');
  readonly confirmLabel = input('Confirm');
  readonly cancelLabel = input('Cancel');
  readonly tone = input<'default' | 'danger'>('danger');

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly titleId = `confirm-dialog-${Math.random().toString(36).slice(2, 9)}`;

  @HostListener('document:keydown.escape')
  protected onEscape() {
    if (this.open()) {
      this.cancelled.emit();
    }
  }

  protected onOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.cancelled.emit();
    }
  }
}
