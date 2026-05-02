import { NEIGHBORS, POP_DURATION_MS, type PopKind } from './constants';
import { state, requireM } from './state';
import { addPointBurst } from './bursts';

const slotToCell = (i: number, j: number) => ({
  col: state.startSlotCol + i,
  row: state.startSlotRow + j,
});

const neighborsOf = (i: number, j: number): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let k = 0; k < NEIGHBORS.length; k++) {
    const [dx, dy] = NEIGHBORS[k]!;
    const ni = i + dx, nj = j + dy;
    if (nj >= 0 && nj < state.grid.length && ni >= 0 && ni < state.slotCols) out.push([ni, nj]);
  }
  return out;
};

// popCell only animates + clears the slot. Scoring is awarded per wave by the
// caller so we can show "+N" bursts and combo bonuses cohesively.
export const popCell = (i: number, j: number, kind: PopKind): { col: number; row: number } | null => {
  const row = state.grid[j];
  if (!row) return null;
  const cell = row[i];
  if (!cell) return null;
  const c = slotToCell(i, j);
  state.popping.push({
    col: c.col,
    row: c.row,
    char: cell.char,
    colorIdx: cell.colorIdx,
    kind,
    tStart: performance.now(),
  });
  row[i] = null;
  return c;
};

export const popGroup = (cells: ReadonlyArray<readonly [number, number]>, kind: PopKind): { col: number; row: number } | null => {
  let sumCol = 0, sumRow = 0, n = 0;
  for (let k = 0; k < cells.length; k++) {
    const p = popCell(cells[k]![0], cells[k]![1], kind);
    if (p) { sumCol += p.col; sumRow += p.row; n++; }
  }
  if (!n) return null;
  return { col: Math.round(sumCol / n), row: Math.round(sumRow / n) };
};

// Returns [[i, j], ...] of cells that should pop (linear-run + cluster
// rules), without mutating the grid.
export const collectMatch = (i: number, j: number): Array<[number, number]> => {
  const cell = state.grid[j]?.[i];
  if (!cell) return [];
  const targetColor = cell.colorIdx;
  const targetChar  = cell.char;
  const toPop = new Set<string>();

  // Linear runs through the placed bubble: any straight line of 2+ bubbles
  // sharing the *exact same symbol* pops (horizontal in the row, vertical
  // in the column). Symbols are stricter than colors, so this fires for
  // matching glyphs even when the cluster rule wouldn't trigger.
  const addRun = (di: number, dj: number) => {
    const run: Array<[number, number]> = [[i, j]];
    let ci = i + di, cj = j + dj;
    while (cj >= 0 && cj < state.grid.length && ci >= 0 && ci < state.slotCols
           && state.grid[cj]![ci] && state.grid[cj]![ci]!.char === targetChar) {
      run.push([ci, cj]);
      ci += di; cj += dj;
    }
    ci = i - di; cj = j - dj;
    while (cj >= 0 && cj < state.grid.length && ci >= 0 && ci < state.slotCols
           && state.grid[cj]![ci] && state.grid[cj]![ci]!.char === targetChar) {
      run.push([ci, cj]);
      ci -= di; cj -= dj;
    }
    if (run.length >= 2) {
      for (let k = 0; k < run.length; k++) toPop.add(run[k]![0] + ',' + run[k]![1]);
    }
  };
  addRun(1, 0);
  addRun(0, 1);

  // Connected cluster of 3+ same-color bubbles in any shape (classic Puzzle
  // Bobble rule — color-based, so different glyphs of the same hue count
  // toward the cluster).
  const seen = new Set<string>([i + ',' + j]);
  const stack: Array<[number, number]> = [[i, j]];
  const cluster: Array<[number, number]> = [];
  while (stack.length) {
    const [ci, cj] = stack.pop()!;
    const cur = state.grid[cj]?.[ci];
    if (!cur || cur.colorIdx !== targetColor) continue;
    cluster.push([ci, cj]);
    const ns = neighborsOf(ci, cj);
    for (let k = 0; k < ns.length; k++) {
      const [ni, nj] = ns[k]!;
      const key = ni + ',' + nj;
      const target2 = state.grid[nj]?.[ni];
      if (!seen.has(key) && target2 && target2.colorIdx === targetColor) {
        seen.add(key);
        stack.push([ni, nj]);
      }
    }
  }
  if (cluster.length >= 3) {
    for (let k = 0; k < cluster.length; k++) toPop.add(cluster[k]![0] + ',' + cluster[k]![1]);
  }

  if (!toPop.size) return [];
  const out: Array<[number, number]> = [];
  for (const key of toPop) {
    const ix = key.indexOf(',');
    out.push([+key.slice(0, ix), +key.slice(ix + 1)]);
  }
  return out;
};

// Returns [[i, j], ...] of bubbles disconnected from the ceiling row.
export const collectFloaters = (): Array<[number, number]> => {
  if (!state.grid.length || !state.grid[0]) return [];
  const reachable = new Set<string>();
  const stack: Array<[number, number]> = [];
  for (let i = 0; i < state.slotCols; i++) {
    if (state.grid[0]![i]) { reachable.add(i + ',0'); stack.push([i, 0]); }
  }
  while (stack.length) {
    const [ci, cj] = stack.pop()!;
    const ns = neighborsOf(ci, cj);
    for (let k = 0; k < ns.length; k++) {
      const [ni, nj] = ns[k]!;
      const key = ni + ',' + nj;
      if (!reachable.has(key) && state.grid[nj]?.[ni]) {
        reachable.add(key);
        stack.push([ni, nj]);
      }
    }
  }
  const out: Array<[number, number]> = [];
  for (let j = 0; j < state.grid.length; j++) {
    for (let i = 0; i < state.slotCols; i++) {
      if (state.grid[j]![i] && !reachable.has(i + ',' + j)) out.push([i, j]);
    }
  }
  return out;
};

// Standalone floater drop used by descend(): pops, scores and emits a burst,
// but doesn't participate in combo accounting (descents aren't shot-driven).
export const dropFloaters = (): void => {
  const cells = collectFloaters();
  if (!cells.length) return;
  const pts = cells.length * 3;
  popGroup(cells, 'float');
  state.score += pts;
  addPointBurst('+' + pts, requireM().linkColor());
};

export const checkLose = (): void => {
  if (state.gameOver) return;
  for (let j = 0; j < state.grid.length; j++) {
    for (let i = 0; i < state.slotCols; i++) {
      if (state.grid[j]![i]) {
        const py = (state.startSlotRow + j) * state.cellH + state.cellH / 2;
        if (py > state.dangerY) {
          state.gameOver = true;
          return;
        }
      }
    }
  }
};

export const tickPops = (): void => {
  if (!state.popping.length) return;
  const now = performance.now();
  let w = 0;
  for (let r = 0; r < state.popping.length; r++) {
    if (now - state.popping[r]!.tStart < POP_DURATION_MS) state.popping[w++] = state.popping[r]!;
  }
  state.popping.length = w;
};
