import { FRAME_BORDER_CHARS } from './constants';
import { state, type Cell } from './state';
import { applyBrightness, getColorStr, getPalette, randChar } from './palette';
import { sampleColorIndex } from './noise';
import { smoothstep01 } from '../shared/math';
import { isInPlayfield } from './playfield';
import { seedFlip } from './seed-flip';

// Smoothstep-based radial visibility. distNorm ∈ [0,1] is normalised
// distance from screen centre on the half-diagonal; noise ∈ [-1,1] is a
// per-cell stipple. centerFade scales how much of the centre dims to bg.
export const computeVisibility = (distNorm: number, noise: number): number => {
  const fade = state.config.centerFade;
  if (fade <= 0) return 1;
  const jittered = distNorm + noise * state.config.centerFadeNoise;
  const t = smoothstep01(jittered);
  return 1 - (1 - t) * fade;
};

const cellAt = (r: number, c: number): Cell | null => {
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return null;
  return state.cells[r * state.cols + c] ?? null;
};

export const setLocked = (r: number, c: number, ch: string, color: number[] | readonly number[]): void => {
  const cell = cellAt(r, c);
  if (!cell) return;
  const newColStr = getColorStr(color as number[]);
  // Idempotent: stable game cells (a placed bubble re-asserted each frame)
  // skip the redraw path entirely.
  if (cell.locked && cell.char === ch && cell.colorStr === newColStr) return;
  cell.locked = true;
  cell.color = color as number[];
  cell.colorStr = newColStr;
  cell.char = ch;
  cell.isFrameBorder = FRAME_BORDER_CHARS.indexOf(ch) >= 0;
  cell.dirty = true;
};

// Returns a previously-locked cell to the flipping background, picking a
// fresh char/colour from the current noise field so the gap blends in.
// Picks the palette based on whether the cell sits inside the play rect —
// otherwise an unlocked aim-line cell would briefly flash at the wrong
// opacity, leaving a visible trail behind the cursor.
export const setUnlocked = (r: number, c: number): void => {
  const cell = cellAt(r, c);
  if (!cell || !cell.locked) return;
  const inPlay = isInPlayfield(c, r);
  const palette = getPalette(inPlay);
  const colorIndex = sampleColorIndex(c, r, performance.now());
  const color = applyBrightness(palette[colorIndex]!);
  cell.locked = false;
  cell.isFrameBorder = false;
  cell.colorIndex = colorIndex;
  cell.color = color;
  cell.colorStr = getColorStr(color);
  cell.char = randChar(colorIndex);
  cell.heat = 0;
  cell.dirty = true;
  seedFlip(cell, c, r, performance.now(), 'random');
};

