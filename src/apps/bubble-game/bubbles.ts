import { INITIAL_ROWS, INITIAL_SHOTS_PER_DESCENT, MIN_SHOTS_PER_DESCENT, NUM_COLORS, REFILL_ROWS } from './constants';
import { type Bubble, type GameState, requireM } from './state';
import { addPointBurst } from './bursts';
import { dropFloaters } from './matching';
import { patternRow, pickPattern } from './patterns';

export const ensureRow = (state: GameState, j: number): void => {
  while (state.grid.length <= j) state.grid.push(new Array(state.slotCols).fill(null));
};

export const makeBubble = (state: GameState, rng: () => number = Math.random): Bubble => {
  const M = requireM(state);
  const present = new Set<number>();
  for (let j = 0; j < state.grid.length; j++) {
    const row = state.grid[j]!;
    for (let i = 0; i < row.length; i++) if (row[i]) present.add(row[i]!.colorIdx);
  }
  const choices = present.size > 0 ? [...present] : [0, 1, 2];
  const ci = choices[(rng() * choices.length) | 0]!;
  return { colorIdx: ci, char: M.charFor(ci) };
};

export const randomRow = (
  state: GameState,
  fill: number,
  rng: () => number = Math.random,
): Array<Bubble | null> => {
  const M = requireM(state);
  const row: Array<Bubble | null> = new Array(state.slotCols);
  for (let i = 0; i < row.length; i++) {
    if (rng() < fill) {
      const ci = (rng() * NUM_COLORS) | 0;
      row[i] = { colorIdx: ci, char: M.charFor(ci) };
    } else {
      row[i] = null;
    }
  }
  return row;
};

// Patterns guarantee that adjacent rows within the same pattern share at least
// one filled column, but the first row of a *new* pattern can land disjoint
// from the previous top row. When that happens, descending strips the previous
// pattern's only ceiling anchor and dropFloaters() wipes the whole stack out.
//
// Walk prevTop's horizontal connected components. A component touching col 0
// or col W-1 is wall-anchored and needs nothing. Every other component must
// share at least one column with the new row, otherwise its entire vertical
// stack loses its only anchor. Bridge each interior component independently
// — sparse patterns like `columns` produce multiple disconnected stripes per
// row, and a single connector only saves the first one.
const bridgeAcrossTransition = (
  state: GameState,
  newRow: Array<Bubble | null>,
  prevTop: Array<Bubble | null>,
  rng: () => number,
): void => {
  const W = Math.min(newRow.length, prevTop.length);
  if (W === 0) return;
  let i = 0;
  while (i < W) {
    if (!prevTop[i]) { i++; continue; }
    const start = i;
    while (i < W && prevTop[i]) i++;
    const end = i;
    if (start === 0 || end === W) continue;
    let overlapped = false;
    for (let k = start; k < end; k++) if (newRow[k]) { overlapped = true; break; }
    if (overlapped) continue;
    for (let k = start; k < end; k++) {
      if (!newRow[k]) {
        newRow[k] = makeBubble(state, rng);
        break;
      }
    }
  }
};

// Pull the next row from the active pattern, picking a new pattern (of a
// different kind) when the current one runs out. Each pattern's `step` is
// the row index it just emitted, so step++ moves the pattern forward.
const nextPatternRow = (state: GameState, rng: () => number): Array<Bubble | null> => {
  const transitioning = !state.pattern || state.pattern.step >= state.pattern.length;
  const pattern = transitioning ? pickPattern(rng, state.pattern?.kind) : state.pattern!;
  state.pattern = pattern;
  const row = patternRow(state, pattern, rng);
  if (transitioning && state.grid.length > 0) {
    bridgeAcrossTransition(state, row, state.grid[0]!, rng);
  }
  pattern.step++;
  return row;
};

// Lay down `count` rows from the pattern engine as if they had been dripping
// down before play started: oldest step at the bottom, newest at the top, so
// the next descent continues the same pattern without a visual seam.
const seedFromPattern = (state: GameState, count: number, rng: () => number): void => {
  state.pattern = null;
  for (let j = 0; j < count; j++) state.grid.unshift(nextPatternRow(state, rng));
};

export const reset = (state: GameState, rng: () => number = Math.random): void => {
  state.grid = [];
  state.shooter.angle = -Math.PI / 2;
  state.shooter.current = makeBubble(state, rng);
  state.shooter.next = makeBubble(state, rng);
  state.projectile = null;
  state.shotsSinceDescent = 0;
  state.shotsPerDescent = INITIAL_SHOTS_PER_DESCENT;
  state.level = 1;
  state.score = 0;
  state.gameOver = false;
  state.popping = [];
  state.activeBurst = null;
  seedFromPattern(state, INITIAL_ROWS, rng);
};

// Shared level bump used by both descents and refills, so clearing the
// playfield is progression instead of resetting the difficulty knob like it
// used to. Banner runs through the existing point-burst pipeline.
const advanceLevel = (state: GameState): void => {
  state.level++;
  if (state.shotsPerDescent > MIN_SHOTS_PER_DESCENT && state.level % 2 === 0) {
    state.shotsPerDescent--;
  }
  if (state.M) addPointBurst(state, '◇ level ' + state.level, state.M.theme().title, 'level');
};

export const descend = (state: GameState, rng: () => number = Math.random): void => {
  advanceLevel(state);
  state.grid.unshift(nextPatternRow(state, rng));
  // Existing pops were captured in absolute (col, row) before the unshift, so
  // shift them down to stay anchored to the bubbles they came from. Without
  // this, mid-flight match/float pops appear one row above their stack.
  for (let i = 0; i < state.popping.length; i++) state.popping[i]!.row++;
  dropFloaters(state);
};

export const refillIfEmpty = (state: GameState, rng: () => number = Math.random): boolean => {
  let any = false;
  for (let j = 0; j < state.grid.length && !any; j++) {
    const row = state.grid[j]!;
    for (let i = 0; i < row.length && !any; i++) if (row[i]) any = true;
  }
  if (any) return false;
  state.grid = [];
  state.shotsSinceDescent = 0;
  seedFromPattern(state, REFILL_ROWS, rng);
  advanceLevel(state);
  return true;
};
