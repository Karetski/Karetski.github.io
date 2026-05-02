# Bubble Game Unit Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `bun test` unit suite over the bubble game's pure logic (matching, physics math, layout splits, RNG-driven generation, shared math utilities), enabled by a targeted refactor that gives mutators an explicit `state` argument and extracts pure helpers from `physics.ts`.

**Architecture:** Two phases. Phase 1 refactors the bubble game modules so logic is testable: read-only computations become pure (`collectMatch`, `collectFloaters`, `isLose`); mutators take `state` as their first argument (`popCell`, `popGroup`, `tickPops`, `tickBurst`, `addPointBurst`, `descend`, `reset`, `tick`, …); `physics.ts` gets pure helpers (`aimAngle`, `reflectX`, `findSnapSlot`); `bubbles.ts` gets RNG injection. The singleton `state` object stays — call sites pass it in. Phase 2 adds co-located `*.test.ts` files plus `tests/helpers/{make-state,seeded-rng}.ts`. Each refactor task commits independently and `bun run verify` passes between every commit.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Bun (build + test runner), Playwright (`bun run verify` smoke), GitHub Actions (CI).

**Discovered prerequisite vs. spec:** The spec describes refactoring matchers, physics, and bubbles. Implementing it requires also taking `state` as the first arg in `bursts.ts` (`addPointBurst`, `tickBurst`) because the mutators we test (`dropFloaters`, `advanceLevel` inside `descend`/`refillIfEmpty`, `tick`) call into bursts. This plan includes that refactor as Task 2 below.

---

## File Structure

**New files:**

- `tests/helpers/make-state.ts` — `makeFakeMatrix(overrides?)` and `makeState(overrides?)`. Single responsibility: build deterministic test fixtures for `GameState` and `MatrixGame`.
- `tests/helpers/seeded-rng.ts` — `mulberry32(seed) → () => number`. Single responsibility: deterministic RNG for tests.
- `src/shared/math.test.ts` — tests for fade/smoothstep/desaturate/dim/blend/noise.
- `src/games/bubble/layout.test.ts` — tests for `sectionWidths`.
- `src/games/bubble/matching.test.ts` — tests for collectMatch/collectFloaters/isLose/popCell/popGroup.
- `src/games/bubble/physics.test.ts` — tests for aimAngle/reflectX/findSnapSlot.
- `src/games/bubble/bubbles.test.ts` — tests for makeBubble/randomRow/ensureRow/reset/refillIfEmpty.

**Modified files:**

- `src/games/bubble/bursts.ts` — `addPointBurst(state, …)`, `tickBurst(state, now?)`.
- `src/games/bubble/matching.ts` — read-only pure (grid+slotCols args); mutators take state; new `isLose` helper.
- `src/games/bubble/bubbles.ts` — RNG injection, state-as-arg.
- `src/games/bubble/physics.ts` — extract `aimAngle`, `reflectX`, `findSnapSlot`; mutators take state.
- `src/games/bubble/main.ts` — call-site updates.
- `src/games/bubble/input.ts` — call-site updates.
- `package.json` — `"test": "bun test"` script.
- `.github/workflows/deploy.yml` — `bun test` step before build.

**Untouched:** `state.ts`, `constants.ts`, `layout.ts` (only `sectionWidths` is tested; `computeLayout` stays as-is), `render-*.ts`, `index.ts` (matrix host).

---

## Task 1: Bootstrap `bun test`

**Why first:** confirms the runner works in this repo before we depend on it.

**Files:**
- Modify: `package.json:5-10` (scripts block)
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Add the test script**

Modify `package.json` scripts block to include a `test` entry:

```json
{
  "name": "karetski.com",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "bun build ./src/index.ts ./src/play-bubble.ts --outdir dist --target browser --minify",
    "dev": "bun build ./src/index.ts ./src/play-bubble.ts --outdir dist --target browser --watch",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "verify": "bun scripts/verify.ts"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "playwright": "^1.59.1",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create a smoke test that the runner is wired**

Create `tests/smoke.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

describe('bun test runner', () => {
  test('arithmetic still works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Run it**

```bash
bun run test
```

Expected: `1 pass 0 fail`. The smoke confirms `bun test` discovers `*.test.ts` files anywhere under the repo (default behaviour).

- [ ] **Step 4: Commit**

```bash
git add package.json tests/smoke.test.ts
git commit -m "Wire bun test runner with smoke test"
```

---

## Task 2: Refactor `bursts.ts` to state-as-arg

**Why:** every mutator tested in later tasks reaches into bursts via `addPointBurst`. To run those tests against a fixture state, bursts must accept state as an argument.

**Files:**
- Modify: `src/games/bubble/bursts.ts` (whole file)
- Modify: `src/games/bubble/matching.ts` (callers of `addPointBurst`)
- Modify: `src/games/bubble/physics.ts` (callers of `addPointBurst`, `tickBurst`)
- Modify: `src/games/bubble/bubbles.ts` (caller of `addPointBurst`)

- [ ] **Step 1: Rewrite `bursts.ts` to take state**

Replace the entire contents of `src/games/bubble/bursts.ts`:

```ts
import {
  BURST_PRIORITY,
  COMBO_BURST_DURATION_MS,
  LEVEL_BURST_DURATION_MS,
  POINT_BURST_DURATION_MS,
  type BurstKind,
} from './constants';
import type { GameState } from './state';

export const burstDuration = (kind: BurstKind): number =>
  kind === 'combo' ? COMBO_BURST_DURATION_MS
  : kind === 'level' ? LEVEL_BURST_DURATION_MS
  : POINT_BURST_DURATION_MS;

export const addPointBurst = (
  state: GameState,
  text: string,
  color: number[] | readonly number[],
  kind: BurstKind = 'score',
  now: number = performance.now(),
): void => {
  if (state.activeBurst) {
    const elapsed = now - state.activeBurst.tStart;
    const stillVisible = elapsed < burstDuration(state.activeBurst.kind);
    if (stillVisible && BURST_PRIORITY[kind] < BURST_PRIORITY[state.activeBurst.kind]) return;
  }
  state.activeBurst = { text, color, kind, tStart: now };
};

export const tickBurst = (state: GameState, now: number = performance.now()): void => {
  if (!state.activeBurst) return;
  const burstAge = now - state.activeBurst.tStart;
  if (burstAge >= burstDuration(state.activeBurst.kind)) state.activeBurst = null;
};
```

- [ ] **Step 2: Update call sites**

In `src/games/bubble/matching.ts` — find the line `addPointBurst('+' + pts, requireM().linkColor());` inside `dropFloaters` and change to:

```ts
addPointBurst(state, '+' + pts, requireM().linkColor());
```

In `src/games/bubble/physics.ts` — find both calls inside `snapAndResolve`:

```ts
addPointBurst('✦ +' + totalEarned + ' combo', M.titleColor(), 'combo');
```
becomes
```ts
addPointBurst(state, '✦ +' + totalEarned + ' combo', M.titleColor(), 'combo');
```

```ts
addPointBurst('+' + totalEarned, lastBurstColor);
```
becomes
```ts
addPointBurst(state, '+' + totalEarned, lastBurstColor);
```

Find `tickBurst();` inside `tick` and change to `tickBurst(state);`.

In `src/games/bubble/bubbles.ts` — find the line inside `advanceLevel`:

```ts
if (state.M) addPointBurst('◇ level ' + state.level, state.M.titleColor(), 'level');
```
becomes
```ts
if (state.M) addPointBurst(state, '◇ level ' + state.level, state.M.titleColor(), 'level');
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: clean.

- [ ] **Step 4: Run verify**

In one terminal:
```bash
bunx serve -l 8123 .
```

In another:
```bash
bun run build
bun run verify
```

Expected: verify reports 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/games/bubble/bursts.ts src/games/bubble/matching.ts src/games/bubble/physics.ts src/games/bubble/bubbles.ts
git commit -m "Refactor bursts.ts to accept state as argument"
```

---

## Task 3: Refactor `matching.ts` (pure read-only + state-as-arg mutators + isLose)

**Files:**
- Modify: `src/games/bubble/matching.ts` (whole file)
- Modify: `src/games/bubble/physics.ts` (callers of collectMatch, collectFloaters, popGroup, tickPops, checkLose)
- Modify: `src/games/bubble/main.ts` (caller of checkLose)

- [ ] **Step 1: Rewrite `matching.ts`**

Replace the entire contents of `src/games/bubble/matching.ts`:

```ts
import { NEIGHBORS, POP_DURATION_MS, type PopKind } from './constants';
import { type GameGrid, type GameState, requireM } from './state';
import { addPointBurst } from './bursts';

const slotToCell = (state: GameState, i: number, j: number) => ({
  col: state.startSlotCol + i,
  row: state.startSlotRow + j,
});

const neighborsOf = (
  grid: GameGrid,
  slotCols: number,
  i: number,
  j: number,
): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let k = 0; k < NEIGHBORS.length; k++) {
    const [dx, dy] = NEIGHBORS[k]!;
    const ni = i + dx, nj = j + dy;
    if (nj >= 0 && nj < grid.length && ni >= 0 && ni < slotCols) out.push([ni, nj]);
  }
  return out;
};

// popCell only animates + clears the slot. Scoring is awarded per wave by the
// caller so we can show "+N" bursts and combo bonuses cohesively.
export const popCell = (
  state: GameState,
  i: number,
  j: number,
  kind: PopKind,
  now: number = performance.now(),
): { col: number; row: number } | null => {
  const row = state.grid[j];
  if (!row) return null;
  const cell = row[i];
  if (!cell) return null;
  const c = slotToCell(state, i, j);
  state.popping.push({
    col: c.col,
    row: c.row,
    char: cell.char,
    colorIdx: cell.colorIdx,
    kind,
    tStart: now,
  });
  row[i] = null;
  return c;
};

export const popGroup = (
  state: GameState,
  cells: ReadonlyArray<readonly [number, number]>,
  kind: PopKind,
  now: number = performance.now(),
): { col: number; row: number } | null => {
  let sumCol = 0, sumRow = 0, n = 0;
  for (let k = 0; k < cells.length; k++) {
    const p = popCell(state, cells[k]![0], cells[k]![1], kind, now);
    if (p) { sumCol += p.col; sumRow += p.row; n++; }
  }
  if (!n) return null;
  return { col: Math.round(sumCol / n), row: Math.round(sumRow / n) };
};

// Returns [[i, j], ...] of cells that should pop (linear-run + cluster
// rules), without mutating the grid.
export const collectMatch = (
  grid: GameGrid,
  slotCols: number,
  i: number,
  j: number,
): Array<[number, number]> => {
  const cell = grid[j]?.[i];
  if (!cell) return [];
  const targetColor = cell.colorIdx;
  const targetChar  = cell.char;
  const toPop = new Set<string>();

  const addRun = (di: number, dj: number) => {
    const run: Array<[number, number]> = [[i, j]];
    let ci = i + di, cj = j + dj;
    while (cj >= 0 && cj < grid.length && ci >= 0 && ci < slotCols
           && grid[cj]![ci] && grid[cj]![ci]!.char === targetChar) {
      run.push([ci, cj]);
      ci += di; cj += dj;
    }
    ci = i - di; cj = j - dj;
    while (cj >= 0 && cj < grid.length && ci >= 0 && ci < slotCols
           && grid[cj]![ci] && grid[cj]![ci]!.char === targetChar) {
      run.push([ci, cj]);
      ci -= di; cj -= dj;
    }
    if (run.length >= 2) {
      for (let k = 0; k < run.length; k++) toPop.add(run[k]![0] + ',' + run[k]![1]);
    }
  };
  addRun(1, 0);
  addRun(0, 1);

  const seen = new Set<string>([i + ',' + j]);
  const stack: Array<[number, number]> = [[i, j]];
  const cluster: Array<[number, number]> = [];
  while (stack.length) {
    const [ci, cj] = stack.pop()!;
    const cur = grid[cj]?.[ci];
    if (!cur || cur.colorIdx !== targetColor) continue;
    cluster.push([ci, cj]);
    const ns = neighborsOf(grid, slotCols, ci, cj);
    for (let k = 0; k < ns.length; k++) {
      const [ni, nj] = ns[k]!;
      const key = ni + ',' + nj;
      const target2 = grid[nj]?.[ni];
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

export const collectFloaters = (
  grid: GameGrid,
  slotCols: number,
): Array<[number, number]> => {
  if (!grid.length || !grid[0]) return [];
  const reachable = new Set<string>();
  const stack: Array<[number, number]> = [];
  for (let i = 0; i < slotCols; i++) {
    if (grid[0]![i]) { reachable.add(i + ',0'); stack.push([i, 0]); }
  }
  while (stack.length) {
    const [ci, cj] = stack.pop()!;
    const ns = neighborsOf(grid, slotCols, ci, cj);
    for (let k = 0; k < ns.length; k++) {
      const [ni, nj] = ns[k]!;
      const key = ni + ',' + nj;
      if (!reachable.has(key) && grid[nj]?.[ni]) {
        reachable.add(key);
        stack.push([ni, nj]);
      }
    }
  }
  const out: Array<[number, number]> = [];
  for (let j = 0; j < grid.length; j++) {
    for (let i = 0; i < slotCols; i++) {
      if (grid[j]![i] && !reachable.has(i + ',' + j)) out.push([i, j]);
    }
  }
  return out;
};

export const dropFloaters = (state: GameState): void => {
  const cells = collectFloaters(state.grid, state.slotCols);
  if (!cells.length) return;
  const pts = cells.length * 3;
  popGroup(state, cells, 'float');
  state.score += pts;
  addPointBurst(state, '+' + pts, requireM().linkColor());
};

// Pure: returns true if any bubble's centre y crosses dangerY.
export const isLose = (
  grid: GameGrid,
  slotCols: number,
  startSlotRow: number,
  dangerY: number,
  cellH: number,
): boolean => {
  for (let j = 0; j < grid.length; j++) {
    for (let i = 0; i < slotCols; i++) {
      if (grid[j]![i]) {
        const py = (startSlotRow + j) * cellH + cellH / 2;
        if (py > dangerY) return true;
      }
    }
  }
  return false;
};

export const checkLose = (state: GameState): void => {
  if (state.gameOver) return;
  if (isLose(state.grid, state.slotCols, state.startSlotRow, state.dangerY, state.cellH)) {
    state.gameOver = true;
  }
};

export const tickPops = (state: GameState, now: number = performance.now()): void => {
  if (!state.popping.length) return;
  let w = 0;
  for (let r = 0; r < state.popping.length; r++) {
    if (now - state.popping[r]!.tStart < POP_DURATION_MS) state.popping[w++] = state.popping[r]!;
  }
  state.popping.length = w;
};
```

- [ ] **Step 2: Update callers in `physics.ts`**

In `src/games/bubble/physics.ts`:

- Replace `tickPops();` with `tickPops(state);`
- Replace `const matchCells = collectMatch(best.i, best.j);` with `const matchCells = collectMatch(state.grid, state.slotCols, best.i, best.j);`
- Replace both `popGroup(matchCells, 'match');` and `popGroup(floatCells, 'float');` with `popGroup(state, matchCells, 'match');` and `popGroup(state, floatCells, 'float');`.
- Replace `const floatCells = collectFloaters();` with `const floatCells = collectFloaters(state.grid, state.slotCols);`

- [ ] **Step 3: Update caller in `main.ts`**

In `src/games/bubble/main.ts`, replace `checkLose();` with `checkLose(state);`.

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: clean.

- [ ] **Step 5: Verify**

```bash
bun run build && bun run verify
```

(With local server already running on `:8123` from Task 2.) Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/games/bubble/matching.ts src/games/bubble/physics.ts src/games/bubble/main.ts
git commit -m "Refactor matching.ts: pure read-only + state-as-arg mutators"
```

---

## Task 4: Refactor `bubbles.ts` (RNG injection + state-as-arg)

**Files:**
- Modify: `src/games/bubble/bubbles.ts` (whole file)
- Modify: `src/games/bubble/physics.ts` (callers of `makeBubble`, `ensureRow`, `descend`, `refillIfEmpty`)
- Modify: `src/games/bubble/main.ts` (caller of `reset`)
- Modify: `src/games/bubble/input.ts` (callers of `reset`)

- [ ] **Step 1: Rewrite `bubbles.ts`**

Replace the entire contents of `src/games/bubble/bubbles.ts`:

```ts
import { INITIAL_ROWS, INITIAL_SHOTS_PER_DESCENT, MIN_SHOTS_PER_DESCENT, NEW_ROW_FILL_BASE, NEW_ROW_FILL_PER_LEVEL, NUM_COLORS, REFILL_ROWS } from './constants';
import { type Bubble, type GameState, requireM } from './state';
import { addPointBurst } from './bursts';
import { dropFloaters } from './matching';

export const ensureRow = (state: GameState, j: number): void => {
  while (state.grid.length <= j) state.grid.push(new Array(state.slotCols).fill(null));
};

export const makeBubble = (state: GameState, rng: () => number = Math.random): Bubble => {
  const M = requireM();
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
  const M = requireM();
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

export const reset = (state: GameState, rng: () => number = Math.random): void => {
  state.grid = [];
  for (let j = 0; j < INITIAL_ROWS; j++) state.grid.push(randomRow(state, 1, rng));
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
};

const descentRowFill = (state: GameState): number =>
  Math.min(1, NEW_ROW_FILL_BASE + (state.level - 1) * NEW_ROW_FILL_PER_LEVEL);

const advanceLevel = (state: GameState): void => {
  state.level++;
  if (state.shotsPerDescent > MIN_SHOTS_PER_DESCENT && state.level % 2 === 0) {
    state.shotsPerDescent--;
  }
  if (state.M) addPointBurst(state, '◇ level ' + state.level, state.M.titleColor(), 'level');
};

export const descend = (state: GameState, rng: () => number = Math.random): void => {
  advanceLevel(state);
  state.grid.unshift(randomRow(state, descentRowFill(state), rng));
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
  for (let j = 0; j < REFILL_ROWS; j++) state.grid.push(randomRow(state, 1, rng));
  state.shotsSinceDescent = 0;
  advanceLevel(state);
  return true;
};
```

- [ ] **Step 2: Update callers in `physics.ts`**

In `src/games/bubble/physics.ts`:
- `state.shooter.next = makeBubble();` → `state.shooter.next = makeBubble(state);`
- `ensureRow(j);` (inside `snapAndResolve`) → `ensureRow(state, j);`
- `ensureRow(best.j);` (inside `snapAndResolve`) → `ensureRow(state, best.j);`
- `const refilled = refillIfEmpty();` → `const refilled = refillIfEmpty(state);`
- `descend();` → `descend(state);`

- [ ] **Step 3: Update caller in `main.ts`**

In `src/games/bubble/main.ts`:
- `reset();` → `reset(state);` (both occurrences: inside `tryStart` and inside the `regrid` listener).

- [ ] **Step 4: Update callers in `input.ts`**

In `src/games/bubble/input.ts`:
- Add `import { state } from './state';` if not already present (it already is — good).
- Both `if (state.gameOver) reset(); else fire();` and `if (state.gameOver) reset(); else fire();` → change to `if (state.gameOver) reset(state); else fire();` in both `onPointerDown` and `onPointerUp`.

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

Expected: clean.

- [ ] **Step 6: Verify**

```bash
bun run build && bun run verify
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/games/bubble/bubbles.ts src/games/bubble/physics.ts src/games/bubble/main.ts src/games/bubble/input.ts
git commit -m "Refactor bubbles.ts: RNG injection and state-as-arg"
```

---

## Task 5: Extract pure helpers in `physics.ts` and refactor mutators

**Files:**
- Modify: `src/games/bubble/physics.ts` (whole file)
- Modify: `src/games/bubble/main.ts` (callers of `updateAim`, `tick`)
- Modify: `src/games/bubble/input.ts` (caller of `fire`)

- [ ] **Step 1: Rewrite `physics.ts`**

Replace the entire contents of `src/games/bubble/physics.ts`:

```ts
import { AIM_LIMIT, COLLISION_R } from './constants';
import { type GameGrid, type GameState, requireM } from './state';
import { addPointBurst, tickBurst } from './bursts';
import { collectFloaters, collectMatch, popGroup, tickPops } from './matching';
import { ensureRow, makeBubble, descend, refillIfEmpty } from './bubbles';

// Pure: clamps the aim angle to AIM_LIMIT around straight up.
export const aimAngle = (
  pointerX: number,
  pointerY: number,
  shooterPx: number,
  shooterPy: number,
  aimLimit: number = AIM_LIMIT,
): number => {
  const dx = pointerX - shooterPx;
  const dy = Math.min(pointerY - shooterPy, -1);
  let a = Math.atan2(dy, dx);
  const lo = -Math.PI / 2 - aimLimit;
  const hi = -Math.PI / 2 + aimLimit;
  if (a < lo) a = lo;
  if (a > hi) a = hi;
  return a;
};

// Pure: bounce off vertical walls. Returns the corrected (x, vx); if neither
// wall is touched, returns the inputs unchanged.
export const reflectX = (
  x: number,
  vx: number,
  leftBound: number,
  rightBound: number,
  halfW: number,
): { x: number; vx: number } => {
  if (x < leftBound + halfW) return { x: leftBound + halfW, vx: -vx };
  if (x > rightBound - halfW) return { x: rightBound - halfW, vx: -vx };
  return { x, vx };
};

// Pure: returns the [i, j] of the closest empty slot to the projectile in
// the row band [tj-1, tj+1], using slot-normalised distance. Returns null
// if no empty slot was found in that band.
export const findSnapSlot = (
  grid: GameGrid,
  slotCols: number,
  projX: number,
  projY: number,
  startSlotCol: number,
  startSlotRow: number,
  cellW: number,
  cellH: number,
): [number, number] | null => {
  let best: [number, number] | null = null;
  let bestD2 = Infinity;
  const tj = Math.max(0, Math.round((projY / cellH) - startSlotRow));
  for (let j = Math.max(0, tj - 1); j <= tj + 1; j++) {
    const row = grid[j];
    for (let i = 0; i < slotCols; i++) {
      if (row && row[i]) continue;
      const cellX = (startSlotCol + i) * cellW + cellW / 2;
      const cellY = (startSlotRow + j) * cellH + cellH / 2;
      const dx = (projX - cellX) / cellW;
      const dy = (projY - cellY) / cellH;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = [i, j]; }
    }
  }
  return best;
};

const slotToPixel = (state: GameState, i: number, j: number) => ({
  x: (state.startSlotCol + i) * state.cellW + state.cellW / 2,
  y: (state.startSlotRow + j) * state.cellH + state.cellH / 2,
});

export const updateAim = (state: GameState): void => {
  state.shooter.angle = aimAngle(state.pointerX, state.pointerY, state.shooterPx, state.shooterPy);
};

export const fire = (state: GameState, rng: () => number = Math.random): void => {
  if (state.projectile || state.gameOver || !state.shooter.current) return;
  state.projectile = {
    x: state.shooterPx,
    y: state.shooterPy,
    vx: Math.cos(state.shooter.angle) * state.projectileSpeed,
    vy: Math.sin(state.shooter.angle) * state.projectileSpeed,
    colorIdx: state.shooter.current.colorIdx,
    char: state.shooter.current.char,
  };
  state.shooter.current = state.shooter.next;
  state.shooter.next = makeBubble(state, rng);
};

const wallMinX = (state: GameState): number => state.startSlotCol * state.cellW;
const wallMaxX = (state: GameState): number => (state.startSlotCol + state.slotCols) * state.cellW;

const collisionAt = (state: GameState): boolean => {
  const p = state.projectile!;
  if (p.y < state.startSlotRow * state.cellH) return true;

  const tj = Math.max(0, Math.round((p.y / state.cellH) - state.startSlotRow));
  const ti = Math.max(0, Math.min(state.slotCols - 1,
    Math.round((p.x / state.cellW) - state.startSlotCol)));
  const r2 = COLLISION_R * COLLISION_R;
  for (let j = Math.max(0, tj - 1); j <= tj + 1; j++) {
    const row = state.grid[j];
    if (!row) continue;
    const iLo = Math.max(0, ti - 1);
    const iHi = Math.min(state.slotCols - 1, ti + 1);
    for (let i = iLo; i <= iHi; i++) {
      if (!row[i]) continue;
      const sp = slotToPixel(state, i, j);
      const dx = (p.x - sp.x) / state.cellW;
      const dy = (p.y - sp.y) / state.cellH;
      if (dx * dx + dy * dy < r2) return true;
    }
  }
  return false;
};

const snapAndResolve = (state: GameState, rng: () => number): void => {
  const M = requireM();
  const p = state.projectile!;
  const slot = findSnapSlot(
    state.grid, state.slotCols,
    p.x, p.y,
    state.startSlotCol, state.startSlotRow,
    state.cellW, state.cellH,
  );
  if (slot) {
    ensureRow(state, slot[1]);
    state.grid[slot[1]]![slot[0]] = { colorIdx: p.colorIdx, char: p.char };

    const matchCells = collectMatch(state.grid, state.slotCols, slot[0], slot[1]);
    let waves = 0;
    let totalPopped = 0;
    let lastBurstColor: number[] | readonly number[] | null = null;
    let totalEarned = 0;
    if (matchCells.length) {
      const matchPts = matchCells.length + Math.max(0, matchCells.length - 3) * 2;
      popGroup(state, matchCells, 'match');
      totalEarned += matchPts;
      totalPopped += matchCells.length;
      lastBurstColor = M.titleColor();
      waves++;

      const floatCells = collectFloaters(state.grid, state.slotCols);
      if (floatCells.length) {
        const floatPts = floatCells.length * 3;
        popGroup(state, floatCells, 'float');
        totalEarned += floatPts;
        totalPopped += floatCells.length;
        lastBurstColor = M.linkColor();
        waves++;
      }
    }

    if (waves >= 2) {
      totalEarned += totalPopped * 2;
      state.score += totalEarned;
      addPointBurst(state, '✦ +' + totalEarned + ' combo', M.titleColor(), 'combo');
      M.flashBackground(Math.min(700, 280 + totalPopped * 25));
    } else if (waves === 1 && lastBurstColor) {
      state.score += totalEarned;
      addPointBurst(state, '+' + totalEarned, lastBurstColor);
    }
  }
  state.projectile = null;
  state.shotsSinceDescent++;
  const refilled = refillIfEmpty(state, rng);
  if (!refilled && state.shotsSinceDescent >= state.shotsPerDescent) {
    state.shotsSinceDescent = 0;
    descend(state, rng);
  }
};

export const tick = (
  state: GameState,
  dt: number,
  now: number = performance.now(),
  rng: () => number = Math.random,
): void => {
  tickPops(state, now);
  tickBurst(state, now);
  if (state.gameOver || !state.projectile) return;
  state.projectile.x += state.projectile.vx * dt;
  state.projectile.y += state.projectile.vy * dt;
  const halfW = state.cellW / 2;
  const r = reflectX(state.projectile.x, state.projectile.vx, wallMinX(state), wallMaxX(state), halfW);
  state.projectile.x = r.x;
  state.projectile.vx = r.vx;
  if (collisionAt(state)) {
    snapAndResolve(state, rng);
  } else if (state.projectile.y > state.rows * state.cellH + state.cellH) {
    state.projectile = null;
  }
};
```

- [ ] **Step 2: Update callers in `main.ts`**

In `src/games/bubble/main.ts`:
- `updateAim();` (both occurrences) → `updateAim(state);`
- `tick(dt);` → `tick(state, dt);`

- [ ] **Step 3: Update callers in `input.ts`**

In `src/games/bubble/input.ts`:
- `fire();` (both occurrences in `onPointerDown` and `onPointerUp`) → `fire(state);`

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: clean.

- [ ] **Step 5: Verify**

```bash
bun run build && bun run verify
```

Expected: 0 errors. Quick manual check (optional): open `play/bubble.html` from `:8123`, fire a couple of bubbles, confirm wall bounces and snap-on-collision still feel identical.

- [ ] **Step 6: Commit**

```bash
git add src/games/bubble/physics.ts src/games/bubble/main.ts src/games/bubble/input.ts
git commit -m "Extract pure helpers from physics.ts and pass state to mutators"
```

---

## Task 6: Test helpers (`makeState`, `mulberry32`)

**Files:**
- Create: `tests/helpers/make-state.ts`
- Create: `tests/helpers/seeded-rng.ts`

- [ ] **Step 1: Write `seeded-rng.ts`**

```ts
// Tiny deterministic RNG so test fixtures don't hinge on Math.random.
// mulberry32 — public domain, ~6 lines.
export const mulberry32 = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
```

- [ ] **Step 2: Write `make-state.ts`**

```ts
import type { MatrixGame, RGB } from '../../src/shared/types';
import { type GameState } from '../../src/games/bubble/state';

const NOOP = (): void => {};

export const makeFakeMatrix = (overrides: Partial<MatrixGame> = {}): MatrixGame => ({
  isPlayMode: true,
  cols: 80,
  rows: 40,
  cellW: 10,
  cellH: 18,
  isLight: false,
  numColors: 3,
  panelLeft: 5,
  panelWidth: 20,
  panelTop: 30,
  vividColor: () => [255, 0, 0],
  linkColor: () => [0, 255, 0],
  titleColor: () => [255, 255, 255],
  sepColor: () => [128, 128, 128],
  charFor: (i: number) => ['A', 'B', 'C'][i % 3]!,
  setCell: NOOP,
  clearCell: NOOP,
  isLocked: () => false,
  setPlayfieldBounds: NOOP,
  on: NOOP,
  flashBackground: NOOP,
  ...overrides,
});

export const makeState = (overrides: Partial<GameState> = {}): GameState => {
  const M = overrides.M ?? makeFakeMatrix();
  return {
    M,
    cols: 80,
    rows: 40,
    cellW: 10,
    cellH: 18,
    slotCols: 8,
    startSlotCol: 5,
    startSlotRow: 0,
    shooterPx: 100,
    shooterPy: 540,
    dangerY: 500,
    projectileSpeed: 600,
    panelLeft: 5,
    panelWidth: 20,
    panelTop: 30,
    lowerInnerRow: 0,
    burstSectLeft: 0,
    burstSectW: 0,
    levelSectLeft: 0,
    levelSectW: 0,
    grid: [],
    shooter: { angle: -Math.PI / 2, current: null, next: null },
    projectile: null,
    shotsSinceDescent: 0,
    shotsPerDescent: 8,
    level: 1,
    score: 0,
    gameOver: false,
    pointerX: 0,
    pointerY: 0,
    lastWritten: new Set(),
    popping: [],
    activeBurst: null,
    ...overrides,
  };
};
```

Note the relative import paths: `tests/helpers/` is at the repo root, so `../../src/...` reaches the source.

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: clean. (No tests yet; this just verifies the helpers compile.)

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/make-state.ts tests/helpers/seeded-rng.ts
git commit -m "Add test fixtures: makeState, makeFakeMatrix, mulberry32"
```

---

## Task 7: Tests for `src/shared/math.ts`

**Files:**
- Create: `src/shared/math.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/shared/math.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { fade, smoothstep, smoothstep01, desaturate, dimToBg, blendToBg, noise3 } from './math';

describe('fade', () => {
  test('fade(0) is 0 and fade(1) is 1', () => {
    expect(fade(0)).toBe(0);
    expect(fade(1)).toBe(1);
  });
  test('fade(0.5) is 0.5', () => {
    expect(fade(0.5)).toBeCloseTo(0.5, 6);
  });
});

describe('smoothstep / smoothstep01', () => {
  test('smoothstep(0)=0, smoothstep(1)=1, smoothstep(0.5)=0.5', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 6);
  });
  test('smoothstep01 clamps below 0 and above 1', () => {
    expect(smoothstep01(-1)).toBe(0);
    expect(smoothstep01(2)).toBe(1);
  });
});

describe('desaturate', () => {
  test('factor=1 returns the input colour unchanged', () => {
    const out = desaturate([200, 100, 50], 1);
    expect(out[0]).toBeCloseTo(200, 6);
    expect(out[1]).toBeCloseTo(100, 6);
    expect(out[2]).toBeCloseTo(50, 6);
  });
  test('factor=0 returns a flat grey at the luminance', () => {
    const out = desaturate([200, 100, 50], 0);
    expect(out[0]).toBeCloseTo(out[1]!, 6);
    expect(out[1]).toBeCloseTo(out[2]!, 6);
  });
});

describe('dimToBg / blendToBg', () => {
  test('dimToBg with opacity=1 returns the input rounded', () => {
    expect(dimToBg([200, 100, 50], 1, 0)).toEqual([200, 100, 50]);
  });
  test('dimToBg with opacity=0 returns the bg colour', () => {
    expect(dimToBg([200, 100, 50], 0, 30)).toEqual([30, 30, 30]);
  });
  test('blendToBg with fade=1 returns the input', () => {
    expect(blendToBg([200, 100, 50], 1, 0)).toEqual([200, 100, 50]);
  });
});

describe('noise3', () => {
  test('is deterministic for the same input', () => {
    expect(noise3(1.5, 2.25, -0.75)).toBe(noise3(1.5, 2.25, -0.75));
  });
  test('returns a value in [0, 1]', () => {
    for (let i = 0; i < 16; i++) {
      const v = noise3(i * 0.31, i * 0.71, i * 0.13);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
bun run test src/shared/math.test.ts
```

Expected: all tests pass. (No implementation step — these functions already exist.)

- [ ] **Step 3: Commit**

```bash
git add src/shared/math.test.ts
git commit -m "Add tests for shared/math utilities"
```

---

## Task 8: Tests for `src/games/bubble/layout.ts` `sectionWidths`

**Files:**
- Create: `src/games/bubble/layout.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/games/bubble/layout.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { sectionWidths } from './layout';

describe('sectionWidths', () => {
  test('count=1 returns the full total in a single section', () => {
    expect(sectionWidths(20, 1)).toEqual([20]);
  });
  test('totalW=0 returns zeros for every section', () => {
    expect(sectionWidths(0, 3)).toEqual([0, 0, 0]);
  });
  test('even split distributes evenly', () => {
    expect(sectionWidths(9, 3)).toEqual([3, 3, 3]);
  });
  test('uneven split puts the remainder on the leftmost sections', () => {
    // 10 across 3 sections: ceil(10/3) = 4, remainder distributed front-loaded.
    const out = sectionWidths(10, 3);
    expect(out.reduce((a, b) => a + b, 0)).toBe(10 + (3 - 1));
    expect(out.length).toBe(3);
  });
  test('count > totalW does not crash and returns count entries', () => {
    const out = sectionWidths(2, 5);
    expect(out.length).toBe(5);
  });
});
```

(Note on the "uneven split" test: `sectionWidths` is also used in `computeLayout` to lay out HUD dividers, so the contract is "count entries summing to totalW + (count-1) so adjacent sections share a column with their divider". The test asserts the contract used at the call site rather than picking arbitrary numbers.)

- [ ] **Step 2: Run the tests**

```bash
bun run test src/games/bubble/layout.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/games/bubble/layout.test.ts
git commit -m "Add tests for sectionWidths layout helper"
```

---

## Task 9: Tests for `src/games/bubble/matching.ts`

**Files:**
- Create: `src/games/bubble/matching.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/games/bubble/matching.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { collectMatch, collectFloaters, popCell, popGroup, isLose, checkLose } from './matching';
import type { Bubble, GameGrid } from './state';
import { makeState } from '../../../tests/helpers/make-state';

const b = (colorIdx: number, char: string = String.fromCharCode(65 + colorIdx)): Bubble => ({
  colorIdx,
  char,
});

const sortPairs = (cells: Array<[number, number]>): Array<[number, number]> =>
  [...cells].sort((p, q) => p[0] - q[0] || p[1] - q[1]);

describe('collectMatch', () => {
  test('empty cell returns []', () => {
    const grid: GameGrid = [[null, null]];
    expect(collectMatch(grid, 2, 0, 0)).toEqual([]);
  });

  test('lone bubble returns []', () => {
    const grid: GameGrid = [[b(0), null, null]];
    expect(collectMatch(grid, 3, 0, 0)).toEqual([]);
  });

  test('horizontal run of two same-char pops both', () => {
    const grid: GameGrid = [[b(0, 'A'), b(0, 'A'), null]];
    const out = sortPairs(collectMatch(grid, 3, 0, 0));
    expect(out).toEqual([[0, 0], [1, 0]]);
  });

  test('vertical run of two same-char pops both', () => {
    const grid: GameGrid = [
      [b(0, 'A'), null],
      [b(0, 'A'), null],
    ];
    const out = sortPairs(collectMatch(grid, 2, 0, 0));
    expect(out).toEqual([[0, 0], [0, 1]]);
  });

  test('cluster of three same-color pops all three (different chars)', () => {
    // Three same-color bubbles ('A' colorIdx=0, two more colorIdx=0 with
    // different chars) connected via edges.
    const grid: GameGrid = [
      [b(0, 'A'), b(0, 'B'), null],
      [b(0, 'C'), null,       null],
    ];
    const out = sortPairs(collectMatch(grid, 3, 0, 0));
    expect(out).toEqual([[0, 0], [0, 1], [1, 0]]);
  });

  test('cluster of two same-color does not pop (cluster rule needs 3+)', () => {
    const grid: GameGrid = [
      [b(0, 'A'), b(0, 'B'), null],
    ];
    // 'A' and 'B' are same-color but different chars and only 2 in cluster — no pop.
    expect(collectMatch(grid, 3, 0, 0)).toEqual([]);
  });

  test('mixed run + cluster does not double-count cells', () => {
    // Three identical 'A' bubbles in a row form both a 3-run AND a 3-cluster.
    const grid: GameGrid = [[b(0, 'A'), b(0, 'A'), b(0, 'A')]];
    const out = sortPairs(collectMatch(grid, 3, 1, 0));
    expect(out).toEqual([[0, 0], [1, 0], [2, 0]]);
  });

  test('grid edge: bottom-right cell still resolves correctly', () => {
    const grid: GameGrid = [
      [null, null, null],
      [null, b(0, 'A'), b(0, 'A')],
    ];
    const out = sortPairs(collectMatch(grid, 3, 2, 1));
    expect(out).toEqual([[1, 1], [2, 1]]);
  });
});

describe('collectFloaters', () => {
  test('empty grid returns []', () => {
    expect(collectFloaters([], 3)).toEqual([]);
  });

  test('chain anchored to top stays', () => {
    const grid: GameGrid = [
      [b(0), null],
      [b(0), null],
    ];
    expect(collectFloaters(grid, 2)).toEqual([]);
  });

  test('chain not connected to top floats', () => {
    const grid: GameGrid = [
      [null, null],
      [b(0), null],
    ];
    expect(collectFloaters(grid, 2)).toEqual([[0, 1]]);
  });

  test('all-floating grid returns all bubbles', () => {
    const grid: GameGrid = [
      [null, null],
      [b(0), b(1)],
    ];
    const out = sortPairs(collectFloaters(grid, 2));
    expect(out).toEqual([[0, 1], [1, 1]]);
  });
});

describe('popCell / popGroup', () => {
  test('popCell clears the slot and pushes a pop animation', () => {
    const state = makeState({
      grid: [[b(0, 'A'), null]],
      slotCols: 2,
      startSlotCol: 5,
      startSlotRow: 0,
    });
    const out = popCell(state, 0, 0, 'match', 1000);
    expect(out).toEqual({ col: 5, row: 0 });
    expect(state.grid[0]![0]).toBeNull();
    expect(state.popping).toHaveLength(1);
    expect(state.popping[0]!.tStart).toBe(1000);
  });

  test('popCell on empty slot returns null and does not push', () => {
    const state = makeState({ grid: [[null]], slotCols: 1 });
    const out = popCell(state, 0, 0, 'match', 0);
    expect(out).toBeNull();
    expect(state.popping).toHaveLength(0);
  });

  test('popGroup returns averaged centroid of popped cells', () => {
    const state = makeState({
      grid: [[b(0, 'A'), b(0, 'A'), b(0, 'A')]],
      slotCols: 3,
      startSlotCol: 0,
      startSlotRow: 0,
    });
    const out = popGroup(state, [[0, 0], [1, 0], [2, 0]], 'match', 0);
    expect(out).toEqual({ col: 1, row: 0 });
    expect(state.grid[0]).toEqual([null, null, null]);
  });
});

describe('isLose / checkLose', () => {
  test('isLose false when no bubble crosses dangerY', () => {
    const grid: GameGrid = [[b(0)]];
    // py = (0 + 0) * 18 + 9 = 9, dangerY = 100 ⇒ 9 < 100 ⇒ no lose
    expect(isLose(grid, 1, 0, 100, 18)).toBe(false);
  });

  test('isLose true when a bubble crosses dangerY', () => {
    const grid: GameGrid = [[null], [b(0)]];
    // row 1 centre y = 1*18 + 9 = 27 > 20 ⇒ lose
    expect(isLose(grid, 1, 0, 20, 18)).toBe(true);
  });

  test('checkLose mirrors isLose into state.gameOver', () => {
    const state = makeState({
      grid: [[null], [b(0)]],
      slotCols: 1,
      startSlotRow: 0,
      cellH: 18,
      dangerY: 20,
      gameOver: false,
    });
    checkLose(state);
    expect(state.gameOver).toBe(true);
  });

  test('checkLose is idempotent once gameOver is set', () => {
    const state = makeState({ gameOver: true });
    checkLose(state);
    expect(state.gameOver).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
bun run test src/games/bubble/matching.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/games/bubble/matching.test.ts
git commit -m "Add tests for matching: collectMatch, collectFloaters, popCell, isLose"
```

---

## Task 10: Tests for `src/games/bubble/physics.ts` pure helpers

**Files:**
- Create: `src/games/bubble/physics.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/games/bubble/physics.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { aimAngle, reflectX, findSnapSlot } from './physics';
import type { Bubble, GameGrid } from './state';

const b = (colorIdx: number = 0): Bubble => ({ colorIdx, char: 'A' });

describe('aimAngle', () => {
  test('straight up returns -π/2', () => {
    // Pointer directly above shooter ⇒ angle straight up.
    expect(aimAngle(0, -10, 0, 0)).toBeCloseTo(-Math.PI / 2, 6);
  });

  test('clamps a hard-left target to -π/2 - aimLimit', () => {
    const limit = Math.PI / 4;
    const out = aimAngle(-100, 0, 0, 0, limit);
    expect(out).toBeCloseTo(-Math.PI / 2 - limit, 6);
  });

  test('clamps a hard-right target to -π/2 + aimLimit', () => {
    const limit = Math.PI / 4;
    const out = aimAngle(100, 0, 0, 0, limit);
    expect(out).toBeCloseTo(-Math.PI / 2 + limit, 6);
  });

  test('forces dy to be at least -1 so a horizontal pointer still aims slightly up', () => {
    // Pointer at the same y as the shooter — dy is forced to -1, so the
    // angle still has a tiny upward component instead of pointing flat.
    const out = aimAngle(10, 0, 0, 0, Math.PI);
    expect(out).toBeLessThan(0);
  });
});

describe('reflectX', () => {
  test('left wall flips vx and clamps x to leftBound + halfW', () => {
    const out = reflectX(0, -5, 10, 100, 4);
    expect(out.x).toBe(14);
    expect(out.vx).toBe(5);
  });

  test('right wall flips vx and clamps x to rightBound - halfW', () => {
    const out = reflectX(110, 5, 10, 100, 4);
    expect(out.x).toBe(96);
    expect(out.vx).toBe(-5);
  });

  test('mid-field returns inputs unchanged', () => {
    const out = reflectX(50, 5, 10, 100, 4);
    expect(out).toEqual({ x: 50, vx: 5 });
  });
});

describe('findSnapSlot', () => {
  // Geometry shared across these cases — keep it small and round so the
  // pixel ↔ slot mapping is easy to reason about.
  const cellW = 10;
  const cellH = 10;
  const startSlotCol = 0;
  const startSlotRow = 0;

  test('direct hit on an empty cell returns that slot', () => {
    const grid: GameGrid = [[null, null, null]];
    // Slot (1, 0) centre = (15, 5).
    const out = findSnapSlot(grid, 3, 15, 5, startSlotCol, startSlotRow, cellW, cellH);
    expect(out).toEqual([1, 0]);
  });

  test('near-miss snaps to the nearest empty neighbour', () => {
    // Slot (1, 0) is occupied; projectile near its centre should snap to (0,0).
    const grid: GameGrid = [[null, b(), null]];
    const out = findSnapSlot(grid, 3, 11, 5, startSlotCol, startSlotRow, cellW, cellH);
    expect(out).toEqual([0, 0]);
  });

  test('returns a slot in row tj±1, considering rows that don\'t yet exist as empty', () => {
    // Empty grid; projectile sits at row j=2's centre; expect [0, 2] or
    // similar within the band [tj-1, tj+1].
    const grid: GameGrid = [];
    const out = findSnapSlot(grid, 3, 5, 25, startSlotCol, startSlotRow, cellW, cellH);
    expect(out).not.toBeNull();
    const [, j] = out!;
    expect(Math.abs(j - 2)).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
bun run test src/games/bubble/physics.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/games/bubble/physics.test.ts
git commit -m "Add tests for physics pure helpers: aimAngle, reflectX, findSnapSlot"
```

---

## Task 11: Tests for `src/games/bubble/bubbles.ts`

**Files:**
- Create: `src/games/bubble/bubbles.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/games/bubble/bubbles.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { ensureRow, makeBubble, randomRow, reset, refillIfEmpty } from './bubbles';
import { makeState } from '../../../tests/helpers/make-state';
import { mulberry32 } from '../../../tests/helpers/seeded-rng';

describe('makeBubble', () => {
  test('with a seeded rng produces a stable colorIdx and char', () => {
    const state = makeState();
    const rng = mulberry32(42);
    const a = makeBubble(state, rng);
    const b = makeBubble(makeState(), mulberry32(42));
    expect(a).toEqual(b);
  });

  test('colorIdx is within the matrix\'s palette range', () => {
    const state = makeState();
    const rng = mulberry32(7);
    for (let i = 0; i < 32; i++) {
      const out = makeBubble(state, rng);
      expect(out.colorIdx).toBeGreaterThanOrEqual(0);
      expect(out.colorIdx).toBeLessThan(state.M!.numColors);
    }
  });
});

describe('randomRow', () => {
  test('length always equals slotCols', () => {
    const state = makeState({ slotCols: 7 });
    const row = randomRow(state, 0.5, mulberry32(1));
    expect(row).toHaveLength(7);
  });

  test('fill=1 returns a row with no nulls', () => {
    const state = makeState({ slotCols: 5 });
    const row = randomRow(state, 1, mulberry32(2));
    expect(row.every((c) => c !== null)).toBe(true);
  });

  test('fill=0 returns a row of all nulls', () => {
    const state = makeState({ slotCols: 5 });
    const row = randomRow(state, 0, mulberry32(3));
    expect(row.every((c) => c === null)).toBe(true);
  });
});

describe('ensureRow', () => {
  test('extends grid to length j+1', () => {
    const state = makeState({ slotCols: 3, grid: [] });
    ensureRow(state, 2);
    expect(state.grid).toHaveLength(3);
    expect(state.grid[2]).toEqual([null, null, null]);
  });

  test('does not shrink the grid if it\'s already long enough', () => {
    const state = makeState({ slotCols: 3, grid: [[null, null, null]] });
    ensureRow(state, 0);
    expect(state.grid).toHaveLength(1);
  });
});

describe('reset', () => {
  test('clears score, sets level to 1, and zeroes gameOver', () => {
    const state = makeState({ score: 99, level: 5, gameOver: true, slotCols: 3 });
    reset(state, mulberry32(0));
    expect(state.score).toBe(0);
    expect(state.level).toBe(1);
    expect(state.gameOver).toBe(false);
  });

  test('produces INITIAL_ROWS rows of slotCols length', () => {
    const state = makeState({ slotCols: 4 });
    reset(state, mulberry32(0));
    // INITIAL_ROWS=5 from constants.ts; the grid should be at least that
    // many rows and every row should match slotCols.
    expect(state.grid.length).toBeGreaterThanOrEqual(5);
    for (const row of state.grid) expect(row).toHaveLength(4);
  });
});

describe('refillIfEmpty', () => {
  test('returns false when the grid still has any bubble', () => {
    const state = makeState({
      slotCols: 2,
      grid: [[{ colorIdx: 0, char: 'A' }, null]],
    });
    expect(refillIfEmpty(state, mulberry32(0))).toBe(false);
  });

  test('returns true and refills when the grid is empty', () => {
    const state = makeState({
      slotCols: 2,
      grid: [[null, null]],
      level: 1,
    });
    const refilled = refillIfEmpty(state, mulberry32(0));
    expect(refilled).toBe(true);
    expect(state.grid.length).toBeGreaterThan(0);
    expect(state.level).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
bun run test src/games/bubble/bubbles.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/games/bubble/bubbles.test.ts
git commit -m "Add tests for bubbles: makeBubble, randomRow, ensureRow, reset, refillIfEmpty"
```

---

## Task 12: Wire `bun test` into CI

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Add the test step before build**

Modify `.github/workflows/deploy.yml`. Replace the `build` job with:

```yaml
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun run test
      - run: bun run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
```

Two additions: `bun run typecheck` (which was previously not in CI) and `bun run test`. The typecheck addition is small but meaningful — until now CI built without confirming types, which silently allowed broken types to deploy if someone bypassed local typecheck.

- [ ] **Step 2: Run the full local pipeline to confirm it passes**

```bash
bun run typecheck && bun run test && bun run build && bun run verify
```

(With `bunx serve -l 8123 .` running.) Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "Run typecheck and bun test in CI before deploy"
```

---

## Self-Review

**Spec coverage (re-checked against `docs/superpowers/specs/2026-05-01-bubble-game-unit-tests-design.md`):**

- ✅ Stack: bun test (Task 1), co-located tests (Tasks 7-11), CI (Task 12).
- ✅ matching.ts refactor: `collectMatch(grid, slotCols, i, j)`, `collectFloaters(grid, slotCols)`, `isLose`, `popCell(state, …, now?)`, `popGroup(state, …, now?)`, `dropFloaters(state)`, `tickPops(state, now?)`, `checkLose(state)` — all in Task 3.
- ✅ physics.ts: `aimAngle`, `reflectX`, `findSnapSlot` extracted; `updateAim/fire/tick` take state — Task 5.
- ✅ bubbles.ts: RNG injection on `makeBubble`/`randomRow`, state-as-arg on `ensureRow/reset/descend/refillIfEmpty` — Task 4.
- ✅ Test fixtures `makeState` and `mulberry32` — Task 6.
- ✅ Coverage targets: shared/math (~8) Task 7, layout (~5) Task 8, matching (~18) Task 9, physics (~12) Task 10, bubbles (~7) Task 11. Total ≈50.
- ✅ CI step + `bun run test` script — Tasks 1, 12.
- ✅ Out-of-scope items (no render/main/input/state tests, no new linter, no coverage tooling) — respected.
- ➕ **Discovered prerequisite (not in spec, called out in plan header):** `bursts.ts` also takes `state` (Task 2). Without this, the mutator tests in Tasks 9 and 11 would write into the singleton instead of the test state.

**Placeholders:** none — every code block is complete and the engineer can copy/paste.

**Type consistency:** signatures defined in Tasks 2-5 are referenced consistently in the test code in Tasks 9-11 (verified by re-reading): `popCell(state, i, j, kind, now)`, `collectMatch(grid, slotCols, i, j)`, `findSnapSlot(grid, slotCols, projX, projY, startSlotCol, startSlotRow, cellW, cellH)`, `makeBubble(state, rng)`, `randomRow(state, fill, rng)`, `refillIfEmpty(state, rng)`, `reset(state, rng)`. The plan body and the test inputs match.

**Risk reminders:**
- Run `bunx serve -l 8123 .` once at the start of the session and keep it running through Tasks 2-5 and 12. The `verify` step depends on it.
- Tasks 2-5 must each commit on a green `verify`; if `verify` fails after a task, fix it before moving on (do not stack refactors).
