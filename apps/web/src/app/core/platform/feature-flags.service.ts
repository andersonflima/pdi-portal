import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

export type CanvasEngineMode = 'dom' | 'hybrid';

const resolveCanvasEngineMode = (): CanvasEngineMode => {
  const queryValue = new URLSearchParams(globalThis.location?.search ?? '').get('canvasEngine');

  if (queryValue === 'hybrid' || queryValue === 'dom') {
    return queryValue;
  }

  return environment.flags.canvasEngineMode;
};

@Injectable({ providedIn: 'root' })
export class FeatureFlagsService {
  private readonly canvasEngineModeState = signal<CanvasEngineMode>(resolveCanvasEngineMode());

  readonly canvasEngineMode = computed(() => this.canvasEngineModeState());

  readonly isCanvasHybridModeEnabled = computed(() => this.canvasEngineMode() === 'hybrid');
}
