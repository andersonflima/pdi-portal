import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'dark' | 'light' | 'high-contrast';

const STORAGE_KEY = 'pdi.theme';
const THEME_ORDER: readonly ThemeMode[] = ['dark', 'light', 'high-contrast'];

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === 'dark' || value === 'light' || value === 'high-contrast';

const readStoredTheme = (): ThemeMode | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemeMode(stored) ? stored : null;
  } catch {
    return null;
  }
};

const detectPreferredTheme = (): ThemeMode => {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      if (window.matchMedia('(prefers-contrast: more)').matches) {
        return 'high-contrast';
      }
      if (window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
    }
  } catch {
    // Ignore matchMedia failures (unsupported environments).
  }
  return 'dark';
};

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly themeSignal = signal<ThemeMode>(readStoredTheme() ?? detectPreferredTheme());

  readonly theme = this.themeSignal.asReadonly();

  constructor() {
    this.applyTheme(this.themeSignal());
  }

  readonly setTheme = (mode: ThemeMode) => {
    this.themeSignal.set(mode);
    this.persistTheme(mode);
    this.applyTheme(mode);
  };

  readonly cycleTheme = () => {
    const index = THEME_ORDER.indexOf(this.themeSignal());
    const next = THEME_ORDER[(index + 1) % THEME_ORDER.length] ?? 'dark';
    this.setTheme(next);
  };

  private readonly persistTheme = (mode: ThemeMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Ignore storage failures (private mode, disabled storage).
    }
  };

  private readonly applyTheme = (mode: ThemeMode) => {
    document.documentElement.setAttribute('data-theme', mode);
  };
}
