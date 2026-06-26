import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'pdi.theme';

const readStoredTheme = (): ThemeMode | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
};

const detectPreferredTheme = (): ThemeMode => {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
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

  readonly toggleTheme = () => {
    this.setTheme(this.themeSignal() === 'dark' ? 'light' : 'dark');
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
