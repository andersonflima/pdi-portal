import { Injectable, computed, signal } from '@angular/core';

/**
 * Provider-agnostic configuration for the AI / Agents integration.
 *
 * No provider is assumed: the integration is fully custom so any HTTP-based
 * LLM/agent backend can be plugged in later by describing its endpoint, model
 * and how the (server-side) credential is attached. No API key is ever stored
 * here — secrets must live server-side (env / Doppler) and live analysis will
 * run through a future backend endpoint, never directly from the browser.
 */
export type AiIntegrationConfig = {
  enabled: boolean;
  /** Free-text label for the chosen provider (e.g. "OpenAI", "Anthropic", "Internal"). */
  providerName: string;
  /** Base URL of the provider/agent endpoint the backend will call. */
  baseUrl: string;
  /** Free-text model / deployment / agent id. */
  model: string;
  /** Header the backend will use to attach the credential (e.g. "Authorization", "x-api-key"). */
  authHeaderName: string;
  /** Optional scheme prefix for the credential (e.g. "Bearer", or empty for a raw key header). */
  authScheme: string;
  /** Extra instructions to steer how the board is analyzed. */
  analysisInstructions: string;
};

export type AiIntegrationConfigPatch = Partial<AiIntegrationConfig>;

/** Input for the (future) board analysis call. */
export type AiBoardAnalysisRequest = {
  planId: string;
  boardTitle: string;
};

/**
 * Optional, non-binding presets surfaced in the settings UI to speed up setup.
 * They only prefill editable fields — the integration stays fully custom and
 * defaults to no provider until one is chosen.
 */
export type AiProviderPreset = {
  id: string;
  label: string;
  providerName: string;
  baseUrl: string;
  model: string;
  authHeaderName: string;
  authScheme: string;
};

export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  { id: 'custom', label: 'Custom', providerName: '', baseUrl: '', model: '', authHeaderName: 'Authorization', authScheme: 'Bearer' },
  { id: 'openai', label: 'OpenAI-compatible', providerName: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: '', authHeaderName: 'Authorization', authScheme: 'Bearer' },
  { id: 'anthropic', label: 'Anthropic', providerName: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: '', authHeaderName: 'x-api-key', authScheme: '' },
  { id: 'azure-openai', label: 'Azure OpenAI', providerName: 'Azure OpenAI', baseUrl: '', model: '', authHeaderName: 'api-key', authScheme: '' },
  { id: 'local', label: 'Local / self-hosted', providerName: 'Local', baseUrl: 'http://localhost:11434/v1', model: '', authHeaderName: 'Authorization', authScheme: 'Bearer' }
];

export const AI_CONFIG_STORAGE_KEY = 'pdi.ai.config';

export const AI_NOT_IMPLEMENTED_MESSAGE =
  'AI board analysis is not connected yet — configure a provider and wire the backend endpoint.';

/** Neutral defaults: no provider is chosen until the user configures one. */
export const DEFAULT_AI_CONFIG: AiIntegrationConfig = {
  enabled: false,
  providerName: '',
  baseUrl: '',
  model: '',
  authHeaderName: 'Authorization',
  authScheme: 'Bearer',
  analysisInstructions: ''
};

/**
 * Error thrown by the not-yet-connected integration point. Catch this to
 * distinguish "backend not wired up" from a genuine analysis failure once a
 * provider-backed endpoint exists.
 */
export class AiNotImplementedError extends Error {
  constructor() {
    super(AI_NOT_IMPLEMENTED_MESSAGE);
    this.name = 'AiNotImplementedError';
  }
}

/** Maps a board-analysis failure to the user-facing notice, falling back to the default message. */
export const analysisNoticeFor = (error: unknown): string =>
  error instanceof AiNotImplementedError ? error.message : AI_NOT_IMPLEMENTED_MESSAGE;

const asString = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);

const sanitizeConfig = (value: Partial<AiIntegrationConfig> | null | undefined): AiIntegrationConfig => ({
  enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_AI_CONFIG.enabled,
  providerName: asString(value?.providerName, DEFAULT_AI_CONFIG.providerName),
  baseUrl: asString(value?.baseUrl, DEFAULT_AI_CONFIG.baseUrl),
  model: asString(value?.model, DEFAULT_AI_CONFIG.model),
  authHeaderName: asString(value?.authHeaderName, DEFAULT_AI_CONFIG.authHeaderName) || DEFAULT_AI_CONFIG.authHeaderName,
  authScheme: asString(value?.authScheme, DEFAULT_AI_CONFIG.authScheme),
  analysisInstructions: asString(value?.analysisInstructions, DEFAULT_AI_CONFIG.analysisInstructions)
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

  readonly presets = AI_PROVIDER_PRESETS;

  readonly isConfigured = computed(() => {
    const config = this.state();

    return (
      config.enabled &&
      config.providerName.trim().length > 0 &&
      config.baseUrl.trim().length > 0 &&
      config.model.trim().length > 0
    );
  });

  readonly update = (patch: AiIntegrationConfigPatch) => {
    this.commit({ ...this.state(), ...patch });
  };

  readonly setEnabled = (enabled: boolean) => {
    this.commit({ ...this.state(), enabled });
  };

  readonly applyPreset = (presetId: string) => {
    const preset = AI_PROVIDER_PRESETS.find((candidate) => candidate.id === presetId);
    if (!preset) return;

    this.commit({
      ...this.state(),
      providerName: preset.providerName,
      baseUrl: preset.baseUrl,
      model: preset.model,
      authHeaderName: preset.authHeaderName,
      authScheme: preset.authScheme
    });
  };

  readonly reset = () => {
    this.commit({ ...DEFAULT_AI_CONFIG });
  };

  /**
   * Integration point for the future provider-backed analysis endpoint.
   *
   * This is intentionally a stub: it performs NO network call and assumes NO
   * provider. Live analysis will run server-side (where the credential lives)
   * once the backend route is available. Until then this rejects with
   * {@link AiNotImplementedError}.
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
