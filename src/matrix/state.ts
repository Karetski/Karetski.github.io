import type { PlayfieldBounds, RGB } from '../shared/types';
import { type MatrixConfig, defaultConfig, cloneConfig, playProfile } from './config';
import { THEME_KEY } from './constants';

export interface Cell {
  char: string;
  locked: boolean;
  color: RGB | number[];
  colorStr: string;
  heat: number;
  dirty: boolean;
  colorIndex: number;
  flipTime: number;
  satLevel: number;
  distNorm: number;
  fadeNoise: number;
  visibility: number;
  isFrameBorder?: boolean;
}

export interface PanelRect { x: number; y: number; z: number; w: number }

export interface PointerState {
  active: boolean;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
}

export interface FlashState {
  start: number;
  attack: number;
  hold: number;
  decay: number;
  intensity: number;
  wasActive: boolean;
}

export type GameEvent = 'regrid' | 'theme-change';
export type GameListener = () => void;

const readStoredTheme = (): string | null => {
  try { return localStorage.getItem(THEME_KEY); } catch { return null; }
};

const isPlayMode = document.body.dataset['page'] === 'play';

const config: MatrixConfig = {
  ...cloneConfig(defaultConfig),
  ...(isPlayMode ? playProfile : {}),
};

export interface MatrixState {
  readonly isPlayMode: boolean;
  config: MatrixConfig;
  isLightMode: boolean;
  dpr: number;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  cells: Cell[];
  colorStrCache: Map<number, string>;
  bottomPanelLeft: number;
  bottomPanelWidth: number;
  bottomPanelTop: number;
  playfieldBounds: PlayfieldBounds | null;
  panelRect: PanelRect;
  pointer: PointerState;
  flash: FlashState;
  startTime: number;
  lastFrameTime: number;
  gameListeners: Record<GameEvent, GameListener[]>;
  refreshPickers: () => void;
}

export const state: MatrixState = {
  isPlayMode,
  config,
  isLightMode: readStoredTheme() !== 'dark',
  dpr: 1,
  cols: 0,
  rows: 0,
  cellW: 0,
  cellH: 0,
  cells: [],
  colorStrCache: new Map(),
  bottomPanelLeft: 0,
  bottomPanelWidth: 0,
  bottomPanelTop: 0,
  playfieldBounds: null,
  panelRect: { x: 0, y: 0, z: 1, w: 1 },
  pointer: { active: false, x: 0, y: 0, lastX: 0, lastY: 0 },
  flash: { start: 0, attack: 120, hold: 180, decay: 520, intensity: 0, wasActive: false },
  startTime: performance.now(),
  lastFrameTime: 0,
  gameListeners: { regrid: [], 'theme-change': [] },
  refreshPickers: () => {},
};

export const writeStoredTheme = (value: string): void => {
  try { localStorage.setItem(THEME_KEY, value); } catch { /* ignore */ }
};

export const emit = (evt: GameEvent): void => {
  const list = state.gameListeners[evt];
  for (let i = 0; i < list.length; i++) {
    try { list[i]!(); } catch (e) { console.error(e); }
  }
};
