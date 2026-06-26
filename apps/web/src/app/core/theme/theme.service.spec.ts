import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear()
    });
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to dark and applies it to the document root', () => {
    const service = new ThemeService();

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('cycles through dark, light and high-contrast', () => {
    const service = new ThemeService();

    service.cycleTheme();
    expect(service.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    service.cycleTheme();
    expect(service.theme()).toBe('high-contrast');
    expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast');

    service.cycleTheme();
    expect(service.theme()).toBe('dark');
  });

  it('persists the chosen theme and restores it', () => {
    new ThemeService().setTheme('light');

    const restored = new ThemeService();
    expect(restored.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('falls back to the system preference when nothing is stored', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('light'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }));

    const service = new ThemeService();
    expect(service.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('prefers high-contrast when the system requests more contrast', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('contrast'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }));

    const service = new ThemeService();
    expect(service.theme()).toBe('high-contrast');
    expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast');
  });
});
