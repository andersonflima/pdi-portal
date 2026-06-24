import { afterEach, describe, expect, it } from 'vitest';
import { FeatureFlagsService } from './feature-flags.service';

const resetUrl = () => window.history.replaceState({}, '', '/');

describe('FeatureFlagsService', () => {
  afterEach(resetUrl);

  it('defaults to the dom canvas engine mode', () => {
    resetUrl();
    const service = new FeatureFlagsService();

    expect(service.canvasEngineMode()).toBe('dom');
    expect(service.isCanvasHybridModeEnabled()).toBe(false);
  });

  it('honors the canvasEngine query parameter', () => {
    window.history.replaceState({}, '', '/?canvasEngine=hybrid');
    const service = new FeatureFlagsService();

    expect(service.canvasEngineMode()).toBe('hybrid');
    expect(service.isCanvasHybridModeEnabled()).toBe(true);
  });

  it('ignores invalid query values', () => {
    window.history.replaceState({}, '', '/?canvasEngine=webgl');
    const service = new FeatureFlagsService();

    expect(service.canvasEngineMode()).toBe('dom');
  });
});
