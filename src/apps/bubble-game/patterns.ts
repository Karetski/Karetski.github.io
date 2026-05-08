import { NUM_COLORS } from './constants';
import { type Bubble, type GameState, requireM } from './state';

export type PatternKind = 'dna' | 'zigzag' | 'columns' | 'checker';

interface DnaParams     { thickness: number }
interface ZigzagParams  { thickness: number }
interface ColumnsParams { stripeCols: number[]; thickness: number }
type CheckerParams = Record<string, never>;

// Patterns are SPARSE (the shape's empty space defines its identity), but
// adjacent rows are tuned to share at least one column so the stack stays
// orthogonally connected to the ceiling. Cell colors are independently
// random — the pattern is geometric, not chromatic.
export type Pattern =
  | { kind: 'dna';     step: number; length: number; params: DnaParams }
  | { kind: 'zigzag';  step: number; length: number; params: ZigzagParams }
  | { kind: 'columns'; step: number; length: number; params: ColumnsParams }
  | { kind: 'checker'; step: number; length: number; params: CheckerParams };

const KINDS: PatternKind[] = ['dna', 'zigzag', 'columns', 'checker'];

const buildPattern = (kind: PatternKind): Pattern => {
  switch (kind) {
    case 'dna':     return { kind, step: 0, length: 10, params: { thickness: 4 } };
    case 'zigzag':  return { kind, step: 0, length: 8,  params: { thickness: 6 } };
    case 'columns': return { kind, step: 0, length: 8,  params: { stripeCols: [0, 3, 6], thickness: 2 } };
    case 'checker': return { kind, step: 0, length: 8,  params: {} };
  }
};

// Pick a fresh pattern, avoiding the same kind twice in a row so back-to-back
// descents always change shape.
export const pickPattern = (rng: () => number, exclude?: PatternKind): Pattern => {
  const choices = exclude ? KINDS.filter((k) => k !== exclude) : KINDS;
  const kind = choices[(rng() * choices.length) | 0]!;
  return buildPattern(kind);
};

const tri = (j: number, period: number): number => {
  const p = ((j % period) + period) % period;
  const half = period / 2;
  return p < half ? p / half : (period - p) / half;
};

const cellFor = (state: GameState, ci: number): Bubble => ({
  colorIdx: ci,
  char: requireM(state).charFor(ci),
});

const randomCell = (state: GameState, rng: () => number): Bubble =>
  cellFor(state, (rng() * NUM_COLORS) | 0);

// Zigzag: a single solid band of `thickness` cells tracing a triangle wave.
// Period is 2 × span so the start position only ever shifts by one column
// per row — adjacent rows share `thickness − 1` columns, anchoring the
// stack via the overlap.
const zigzagRow = (
  state: GameState,
  p: Pattern & { kind: 'zigzag' },
  rng: () => number,
): Array<Bubble | null> => {
  const W = state.slotCols;
  if (W <= 0) return [];
  const { thickness } = p.params;
  const span = Math.max(0, W - thickness);
  const period = Math.max(2, 2 * span);
  const start = Math.round(tri(p.step, period) * span);
  const row: Array<Bubble | null> = new Array(W).fill(null);
  for (let i = 0; i < thickness && start + i < W; i++) {
    row[start + i] = randomCell(state, rng);
  }
  return row;
};

// DNA: two independent 2-wide strands moving on triangle waves π out of
// phase. Same one-column-per-row shift as zigzag, so each strand keeps a
// vertical anchor. Strands cross at the centre and split at the edges.
const dnaRow = (
  state: GameState,
  p: Pattern & { kind: 'dna' },
  rng: () => number,
): Array<Bubble | null> => {
  const W = state.slotCols;
  if (W <= 0) return [];
  const { thickness } = p.params;
  const span = Math.max(0, W - thickness);
  const period = Math.max(2, 2 * span);
  const strA = Math.round(tri(p.step, period) * span);
  const strB = Math.round(tri(p.step + Math.floor(period / 2), period) * span);
  const row: Array<Bubble | null> = new Array(W).fill(null);
  for (let i = 0; i < thickness; i++) {
    if (strA + i < W) row[strA + i] = randomCell(state, rng);
  }
  for (let i = 0; i < thickness; i++) {
    if (strB + i < W && row[strB + i] == null) row[strB + i] = randomCell(state, rng);
  }
  return row;
};

// Columns: fixed vertical stripes (default 2 stripes, 2 wide each). Stripes
// don't move at all, so every row shares both stripe columns with the next
// — anchoring is trivial as long as a stripe column survives.
const columnsRow = (
  state: GameState,
  p: Pattern & { kind: 'columns' },
  rng: () => number,
): Array<Bubble | null> => {
  const W = state.slotCols;
  if (W <= 0) return [];
  const { stripeCols, thickness } = p.params;
  const row: Array<Bubble | null> = new Array(W).fill(null);
  for (const sc of stripeCols) {
    for (let i = 0; i < thickness && sc + i < W; i++) {
      row[sc + i] = randomCell(state, rng);
    }
  }
  return row;
};

// Checker: alternating block rows and full-width bridge rows. Block rows
// show 2-wide segments offset every other block-row, so the visual reads
// as a coarse checkerboard; bridges fully fill the row in between, both
// anchoring the stack and averaging the density to ~75%.
const checkerRow = (
  state: GameState,
  p: Pattern & { kind: 'checker' },
  rng: () => number,
): Array<Bubble | null> => {
  const W = state.slotCols;
  if (W <= 0) return [];
  const row: Array<Bubble | null> = new Array(W).fill(null);
  if (p.step % 2 === 1) {
    // Bridge row: fully filled.
    for (let i = 0; i < W; i++) row[i] = randomCell(state, rng);
    return row;
  }
  // Block row: 2-wide segments. Shift one block-pair every other block row.
  const shift = (Math.floor(p.step / 2) % 2);
  for (let i = 0; i < W; i++) {
    const blockI = Math.floor(i / 2);
    if (((blockI + shift) % 2 + 2) % 2 === 0) {
      row[i] = randomCell(state, rng);
    }
  }
  return row;
};

export const patternRow = (
  state: GameState,
  p: Pattern,
  rng: () => number,
): Array<Bubble | null> => {
  switch (p.kind) {
    case 'dna':     return dnaRow(state, p, rng);
    case 'zigzag':  return zigzagRow(state, p, rng);
    case 'columns': return columnsRow(state, p, rng);
    case 'checker': return checkerRow(state, p, rng);
  }
};
