import type { RGB } from '../../shared/types';
import type { MatrixConfig, ThemeMode, ThemeSnapshot } from './types';
import { cloneConfig, defaultConfig } from './config';
import { resetColorStrCache } from './palette';

const COL_TITLE_DARK: RGB = [255, 255, 255];
const COL_FRAME_DARK: RGB = [255, 255, 255];

const STORAGE_KEY = 'ak.theme';

const readStoredMode = (): ThemeMode => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

const writeStoredMode = (mode: ThemeMode): void => {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
};

export interface ThemeProvider {
  snapshot(): ThemeSnapshot;
  mode(): ThemeMode;
  setMode(mode: ThemeMode): void;
  toggle(): void;
  config(): MatrixConfig;
  invalidate(): void;
  subscribe(cb: (snap: ThemeSnapshot) => void): () => void;
  storageKey(): string;
}

export const createThemeProvider = (): ThemeProvider => {
  let mode: ThemeMode = readStoredMode();
  const config = cloneConfig(defaultConfig);
  const subs = new Set<(snap: ThemeSnapshot) => void>();
  let cached: ThemeSnapshot | null = null;

  const buildSnapshot = (): ThemeSnapshot => {
    const isLight = mode === 'light';
    return {
      mode,
      isLight,
      bg: isLight ? '#fff' : '#000',
      bgLevel: isLight ? 255 : 0,
      title: isLight ? [0, 0, 0] : COL_TITLE_DARK,
      link: isLight ? config.linkLight : config.linkDark,
      frame: isLight ? [0, 0, 0] : COL_FRAME_DARK,
      sep: isLight ? [180, 180, 180] : [80, 80, 80],
      vivid: isLight ? config.paletteLight : config.paletteDark,
      config,
    };
  };

  const snapshot = (): ThemeSnapshot => {
    if (!cached) cached = buildSnapshot();
    return cached;
  };

  const notify = (): void => {
    cached = null;
    const snap = snapshot();
    document.documentElement.classList.toggle('light', snap.isLight);
    for (const cb of subs) {
      try { cb(snap); } catch (e) { console.error(e); }
    }
  };

  const setMode = (next: ThemeMode): void => {
    if (next === mode) return;
    mode = next;
    writeStoredMode(mode);
    resetColorStrCache();
    notify();
  };

  const provider: ThemeProvider = {
    snapshot,
    mode: () => mode,
    setMode,
    toggle: () => setMode(mode === 'light' ? 'dark' : 'light'),
    config: () => config,
    invalidate: () => {
      resetColorStrCache();
      notify();
    },
    subscribe: (cb) => {
      subs.add(cb);
      return () => { subs.delete(cb); };
    },
    storageKey: () => STORAGE_KEY,
  };

  // Mirror theme changes from other tabs/pages.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const wantMode: ThemeMode = e.newValue === 'dark' ? 'dark' : 'light';
    if (wantMode === mode) return;
    mode = wantMode;
    resetColorStrCache();
    notify();
  });

  document.documentElement.classList.toggle('light', mode === 'light');

  return provider;
};
