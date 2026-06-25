import { Injectable, computed, signal } from '@angular/core';

/**
 * Configuration for the AI / Agents integration.
 *
 * The recommended default is Anthropic Claude with the latest Opus model id
 * (`claude-opus-4-8`). No API key is ever stored here: secrets must live
 * server-side (env / Doppler) and live analysis will run through a future
 * backend endpoint — never directly from the browser.
 */
export type AiIntegrationConfig = {
  enabled: boolean;
  provider: string;
  model: string;
  analysisInstructions: string;
};

export type AiIntegrationConfigPatch = Partial<AiIntegrationConfig>;

/** Input for the (future) board analysis call. */
export type AiBoardAnalysisRequest = {
  planId: string;
  boardTitle: string;
};

export const AI_CONFIG_STORAGE_KEY = 'pdi.ai.config';

export const AI_NOT_IMPLEMENTED_MESSAGE =
  'AI board analysis is not implemented yet — backend integration pending.';

export const DEFAULT_AI_CONFIG: AiIntegrationConfig = {
  enabled: false,
  // Recommended default provider: Anthropic Claude.
  provider: 'anthropic',
  // Recommended default model id: latest Claude Opus.
  model: 'claude-opus-4-8',
  analysisInstructions: ''
};

/**
 * Error thrown by the not-yet-implemented integration point. Catch this to
 * distinguish "backend not wired up" from a genuine analysis failure once the
 * Claude-backed endpoint exists.
 */
export class AiNotImplementedError extends Error {
  constructor() {
    super(AI_NOT_IMPLEMENTED_MESSAGE);
    this.name = 'AiNotImplementedError';
  }
}

const sanitizeConfig = (value: Partial<AiIntegrationConfig> | null | undefined): AiIntegrationConfig => ({
  enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_AI_CONFIG.enabled,
  provider: typeof value?.provider === 'string' ? value.provider : DEFAULT_AI_CONFIG.provider,
  model: typeof value?.model === 'string' ? value.model : DEFAULT_AI_CONFIG.model,
  analysisInstructions:
    typeof value?.analysisInstructions === 'string'
      ? value.analysisInstructions
      : DEFAULT_AI_CONFIG.analysisInstructions
});

const readStoredConfig = (): AiIntegrationConfig => {
  try {
    const raw = globalThis.localStorage?.getItem(AI_CONFIG_STORAGE_KEY);

    return raw ? sanitizeConfig(JSON.parse(raw) as Partial<AiIntegrationConfig>) : { ...DEFAULT_AI_CONFIG };
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
};

const writeStoredConfig = (config: AiIntegrationConfig) => {
  try {
    globalThis.localStorage?.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Persistence is best-effort: a disabled/blocked localStorage must not break the UI.
  }
};

@Injectable({ providedIn: 'root' })
export class AiIntegrationService {
  private readonly state = signal<AiIntegrationConfig>(readStoredConfig());

  readonly config = this.state.asReadonly();

  readonly isConfigured = computed(() => {
    const config = this.state();

    return config.enabled && config.provider.trim().length > 0 && config.model.trim().length > 0;
  });

  readonly update = (patch: AiIntegrationConfigPatch) => {
    this.commit({ ...this.state(), ...patch });
  };

  readonly setEnabled = (enabled: boolean) => {
    this.commit({ ...this.state(), enabled });
  };

  readonly reset = () => {
    this.commit({ ...DEFAULT_AI_CONFIG });
  };

  /**
   * Integration point for the future Claude-backed analysis endpoint.
   *
   * This is intentionally a stub: it performs NO network call. Live analysis
   * will run server-side (where the API key lives) once the backend route is
   * available. Until then this rejects with {@link AiNotImplementedError}.
   */
  readonly analyzeBoard = async (_request: AiBoardAnalysisRequest): Promise<never> => {
    throw new AiNotImplementedError();
  };

  private readonly commit = (config: AiIntegrationConfig) => {
    const next = sanitizeConfig(config);
    this.state.set(next);
    writeStoredConfig(next);
  };
}
