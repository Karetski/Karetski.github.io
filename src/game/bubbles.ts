import { INITIAL_ROWS, INITIAL_SHOTS_PER_DESCENT, MIN_SHOTS_PER_DESCENT, NEW_ROW_FILL_BASE, NEW_ROW_FILL_PER_LEVEL, NUM_COLORS, REFILL_ROWS } from './constants';
import { state, requireM, type Bubble } from './state';
import { addPointBurst } from './bursts';
import { dropFloaters } from './matching';

export const ensureRow = (j: number): void => {
  while (state.grid.length <= j) state.grid.push(new Array(state.slotCols).fill(null));
};

export const makeBubble = (): Bubble => {
  const M = requireM();
  const present = new Set<number>();
  for (let j = 0; j < state.grid.length; j++) {
    const row = state.grid[j]!;
    for (let i = 0; i < row.length; i++) if (row[i]) present.add(row[i]!.colorIdx);
  }
  const choices = present.size > 0 ? [...present] : [0, 1, 2];
  const ci = choices[(Math.random() * choices.length) | 0]!;
  return { colorIdx: ci, char: M.charFor(ci) };
};

export const randomRow = (fill: number): Array<Bubble | null> => {
  const M = requireM();
  const row: Array<Bubble | null> = new Array(state.slotCols);
  for (let i = 0; i < row.length; i++) {
    if (Math.random() < fill) {
      const ci = (Math.random() * NUM_COLORS) | 0;
      row[i] = { colorIdx: ci, char: M.charFor(ci) };
    } else {
      row[i] = null;
    }
  }
  return row;
};

export const reset = (): void => {
  state.grid = [];
  for (let j = 0; j < INITIAL_ROWS; j++) state.grid.push(randomRow(1));
  state.shooter.angle = -Math.PI / 2;
  state.shooter.current = makeBubble();
  state.shooter.next = makeBubble();
  state.projectile = null;
  state.shotsSinceDescent = 0;
  state.shotsPerDescent = INITIAL_SHOTS_PER_DESCENT;
  state.level = 1;
  state.score = 0;
  state.gameOver = false;
  state.popping = [];
  state.activeBurst = null;
};

const descentRowFill = (): number =>
  Math.min(1, NEW_ROW_FILL_BASE + (state.level - 1) * NEW_ROW_FILL_PER_LEVEL);

// Shared level bump used by both descents and refills, so clearing the
// playfield is progression instead of resetting the difficulty knob like it
// used to. Banner runs through the existing point-burst pipeline.
const advanceLevel = (): void => {
  state.level++;
  if (state.shotsPerDescent > MIN_SHOTS_PER_DESCENT && state.level % 2 === 0) {
    state.shotsPerDescent--;
  }
  if (state.M) addPointBurst('◇ level ' + state.level, state.M.titleColor(), 'level');
};

export const descend = (): void => {
  advanceLevel();
  state.grid.unshift(randomRow(descentRowFill()));
  dropFloaters();
};

export const refillIfEmpty = (): boolean => {
  let any = false;
  for (let j = 0; j < state.grid.length && !any; j++) {
    const row = state.grid[j]!;
    for (let i = 0; i < row.length && !any; i++) if (row[i]) any = true;
  }
  if (any) return false;
  state.grid = [];
  for (let j = 0; j < REFILL_ROWS; j++) state.grid.push(randomRow(1));
  state.shotsSinceDescent = 0;
  advanceLevel();
  return true;
};
