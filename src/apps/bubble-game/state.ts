import type { GameDeps } from './deps';
import type { BurstKind, PopKind } from './constants';

export interface Bubble { colorIdx: number; char: string }

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  colorIdx: number;
  char: string;
}

export interface Shooter {
  angle: number;
  current: Bubble | null;
  next: Bubble | null;
}

export interface Pop {
  col: number;
  row: number;
  char: string;
  colorIdx: number;
  kind: PopKind;
  tStart: number;
}

export interface Burst {
  text: string;
  color: number[] | readonly number[];
  kind: BurstKind;
  tStart: number;
}

export type GameGrid = Array<Array<Bubble | null>>;

export interface GameState {
  M: GameDeps | null;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  slotCols: number;
  startSlotCol: number;
  startSlotRow: number;
  shooterPx: number;
  shooterPy: number;
  dangerY: number;
  projectileSpeed: number;
  panelLeft: number;
  panelWidth: number;
  panelTop: number;
  // Lower panel (status row beneath the queue/current/score HUD) layout:
  // bursts render in the left section, the persistent level readout sits
  // in the right section. computeLayout fills these in.
  lowerInnerRow: number;
  burstSectLeft: number;
  burstSectW: number;
  levelSectLeft: number;
  levelSectW: number;

  grid: GameGrid;
  shooter: Shooter;
  projectile: Projectile | null;
  shotsSinceDescent: number;
  shotsPerDescent: number;
  level: number;
  score: number;
  gameOver: boolean;
  pointerX: number;
  pointerY: number;
  popping: Pop[];
  // Status row hosts a single burst at a time so messages don't compete
  // for space or jitter around the panel. Higher-priority events (combo >
  // level > score) preempt anything still on screen; same- or lower-
  // priority events wait their turn.
  activeBurst: Burst | null;
}

export const state: GameState = {
  M: null,
  cols: 0, rows: 0, cellW: 0, cellH: 0,
  slotCols: 0,
  startSlotCol: 0,
  startSlotRow: 0,
  shooterPx: 0, shooterPy: 0,
  dangerY: 0,
  projectileSpeed: 0,
  panelLeft: 0, panelWidth: 0, panelTop: 0,
  lowerInnerRow: 0,
  burstSectLeft: 0, burstSectW: 0,
  levelSectLeft: 0, levelSectW: 0,

  grid: [],
  shooter: { angle: -Math.PI / 2, current: null, next: null },
  projectile: null,
  shotsSinceDescent: 0,
  shotsPerDescent: 0,
  level: 1,
  score: 0,
  gameOver: false,
  pointerX: 0,
  pointerY: 0,
  popping: [],
  activeBurst: null,
};

export const requireM = (s: GameState): GameDeps => {
  if (!s.M) throw new Error('bubble game deps not yet initialised');
  return s.M;
};
