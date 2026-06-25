import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_CONFIG_STORAGE_KEY,
  AI_NOT_IMPLEMENTED_MESSAGE,
  AiIntegrationService,
  AiNotImplementedError,
  DEFAULT_AI_CONFIG
} from './ai-integration.service';

const createStorageMock = (initial: Record<string, string> = {}) => {
  const store = new Map<string, string>(Object.entries(initial));

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => store.clear())
  };
};

let storageMock: ReturnType<typeof createStorageMock>;

const buildService = () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [AiIntegrationService] });
  return TestBed.inject(AiIntegrationService);
};

describe('AiIntegrationService', () => {
  beforeEach(() => {
    storageMock = createStorageMock();
    vi.stubGlobal('localStorage', storageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts from the recommended defaults (Anthropic Claude / claude-opus-4-8)', () => {
    const service = buildService();

    expect(service.config()).toEqual(DEFAULT_AI_CONFIG);
    expect(service.config().provider).toBe('anthropic');
    expect(service.config().model).toBe('claude-opus-4-8');
    expect(service.isConfigured()).toBe(false);
  });

  it('persists updates to localStorage under the expected key', () => {
    const service = buildService();

    service.update({ analysisInstructions: 'Focus on growth areas' });

    expect(storageMock.setItem).toHaveBeenCalledWith(AI_CONFIG_STORAGE_KEY, expect.any(String));
    const [, persisted] = storageMock.setItem.mock.calls.at(-1)!;
    expect(JSON.parse(persisted).analysisInstructions).toBe('Focus on growth areas');
  });

  it('restores a previously persisted config on construction', () => {
    storageMock = createStorageMock({
      [AI_CONFIG_STORAGE_KEY]: JSON.stringify({
        enabled: true,
        provider: 'anthropic',
        model: 'claude-opus-4-8',
        analysisInstructions: 'Be concise'
      })
    });
    vi.stubGlobal('localStorage', storageMock);

    const service = buildService();

    expect(service.config().enabled).toBe(true);
    expect(service.config().analysisInstructions).toBe('Be concise');
  });

  it('toggles enablement via setEnabled', () => {
    const service = buildService();

    service.setEnabled(true);

    expect(service.config().enabled).toBe(true);
    expect(service.isConfigured()).toBe(true);
  });

  it('reports not configured when enabled but provider or model is blank', () => {
    const service = buildService();

    service.update({ enabled: true, provider: '', model: 'claude-opus-4-8' });
    expect(service.isConfigured()).toBe(false);

    service.update({ provider: 'anthropic', model: '   ' });
    expect(service.isConfigured()).toBe(false);

    service.update({ model: 'claude-opus-4-8' });
    expect(service.isConfigured()).toBe(true);
  });

  it('resets back to defaults', () => {
    const service = buildService();
    service.update({ enabled: true, analysisInstructions: 'Something' });

    service.reset();

    expect(service.config()).toEqual(DEFAULT_AI_CONFIG);
  });

  it('falls back to defaults when stored JSON is corrupt', () => {
    storageMock = createStorageMock({ [AI_CONFIG_STORAGE_KEY]: 'not-json{' });
    vi.stubGlobal('localStorage', storageMock);

    const service = buildService();

    expect(service.config()).toEqual(DEFAULT_AI_CONFIG);
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);

    const service = buildService();

    expect(() => service.update({ enabled: true })).not.toThrow();
    expect(service.config().enabled).toBe(true);
  });

  it('analyzeBoard does not perform a live call and rejects as not implemented', async () => {
    const service = buildService();

    await expect(service.analyzeBoard({ planId: 'p1', boardTitle: 'Board' })).rejects.toBeInstanceOf(
      AiNotImplementedError
    );
    await expect(service.analyzeBoard({ planId: 'p1', boardTitle: 'Board' })).rejects.toThrow(
      AI_NOT_IMPLEMENTED_MESSAGE
    );
  });
});
