import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import type { Toast, ToastKind } from './toast.models';
import { ToastService } from './toast.service';

const iconNameByKind: Record<ToastKind, string> = {
  success: 'circle-check',
  error: 'circle-alert',
  info: 'info'
};

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-stack" role="status" aria-live="polite">
      @for (toast of toasts(); track toast.id) {
        <div
          class="toast"
          [class.toast-success]="toast.kind === 'success'"
          [class.toast-error]="toast.kind === 'error'"
          [class.toast-info]="toast.kind === 'info'"
        >
          <i-lucide class="toast-icon" [name]="iconName(toast.kind)" [size]="18" />
          <span class="toast-message">{{ toast.message }}</span>
          <button
            class="toast-dismiss"
            type="button"
            aria-label="Dismiss notification"
            (click)="dismiss(toast.id)"
          >
            <i-lucide name="x" [size]="15" />
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .toast-stack {
        bottom: auto;
        display: grid;
        gap: 10px;
        max-width: min(360px, calc(100vw - 32px));
        pointer-events: none;
        position: fixed;
        right: 16px;
        top: 16px;
        z-index: 1000;
      }

      .toast {
        align-items: center;
        animation: toast-in 220ms ease;
        background: var(--color-surface-floating);
        border: 1px solid var(--color-border-subtle);
        border-left-width: 3px;
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        color: var(--color-content-primary);
        display: grid;
        gap: 10px;
        grid-template-columns: auto minmax(0, 1fr) auto;
        padding: 11px 12px;
        pointer-events: auto;
      }

      .toast-icon {
        color: var(--color-content-muted);
      }

      .toast-message {
        font: var(--font-body-sm);
        word-break: break-word;
      }

      .toast-success {
        border-left-color: #5dd6a0;
      }

      .toast-success .toast-icon {
        color: #5dd6a0;
      }

      .toast-error {
        border-left-color: #f4787f;
      }

      .toast-error .toast-icon {
        color: #f4787f;
      }

      .toast-info {
        border-left-color: var(--color-action-primary);
      }

      .toast-info .toast-icon {
        color: var(--color-action-primary);
      }

      .toast-dismiss {
        background: transparent;
        border-radius: var(--radius-sm);
        color: var(--color-content-muted);
        padding: 4px;
        transition: color 120ms ease, background-color 120ms ease;
      }

      .toast-dismiss:hover {
        background: color-mix(in srgb, var(--color-content-muted) 16%, transparent);
        color: var(--color-content-primary);
      }

      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translateY(-8px) translateX(8px);
        }

        to {
          opacity: 1;
          transform: translateY(0) translateX(0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .toast {
          animation: none;
        }
      }
    `
  ]
})
export class ToastComponent {
  private readonly toastService = inject(ToastService);

  protected readonly toasts = this.toastService.toasts;
  protected readonly dismiss = this.toastService.dismiss;
  protected readonly iconName = (kind: Toast['kind']) => iconNameByKind[kind];
}
