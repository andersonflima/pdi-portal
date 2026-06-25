import { Injectable, signal } from '@angular/core';
import type { Toast, ToastKind } from './toast.models';

const AUTO_DISMISS_MS = 4500;

const createToast = (kind: ToastKind, message: string): Toast => ({
  id: crypto.randomUUID(),
  kind,
  message
});

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastsSignal = signal<Toast[]>([]);

  readonly toasts = this.toastsSignal.asReadonly();

  readonly success = (message: string) => this.push('success', message);
  readonly error = (message: string) => this.push('error', message);
  readonly info = (message: string) => this.push('info', message);

  readonly dismiss = (id: string) => {
    this.toastsSignal.update((toasts) => toasts.filter((toast) => toast.id !== id));
  };

  private readonly push = (kind: ToastKind, message: string): string => {
    const toast = createToast(kind, message);

    this.toastsSignal.update((toasts) => [...toasts, toast]);
    setTimeout(() => this.dismiss(toast.id), AUTO_DISMISS_MS);

    return toast.id;
  };
}
