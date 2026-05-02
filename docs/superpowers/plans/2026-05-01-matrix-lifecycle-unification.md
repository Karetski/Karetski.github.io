# Matrix Lifecycle Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the matrix background's per-mode forks (`isPlayMode` reads scattered across the render path), per-cell ad-hoc fields (`minOpacity`), and divergent flip-seeding sites into a single render path driven by config (`livenessFloor`, `playProfile`) and a single `seedFlip` helper, while turning theme toggles into a non-destructive geometry-keyed soft pass.

**Architecture:** Five small commits, one per design section in the spec at `docs/superpowers/specs/2026-05-01-matrix-lifecycle-unification-design.md`. Order is (1) config foundation, (2) seedFlip helper + call-sites, (3) opacity model unification, (4) flash-path collapse, (5) layout geometry-keyed branch. Each commit type-checks and `bun test` passes; visual verification deferred to manual checks at the end. The unstaged diff on `src/matrix/{grid-init,render,state}.ts` is discarded as a pre-flight step — its intent is captured by `livenessFloor` plus `seedFlip('aged')`.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`), Bun (build + test runner), Playwright (`bun run verify` smoke), no framework.

**Spec divergence to flag:** The spec's Section 1 formula reads `opacity = qf * vis` with `vis = floor + (1-floor) * smoothstep01(...)`. This is implemented literally — `livenessFloor` becomes a *visibility* floor at the radial centre, not an *opacity* floor for aged cells. Aged cells therefore extinguish to bg in both modes; the home page's "faint coloured stipple" comes from fresh-but-centre cells at `vis = floor`, not from aged remnants. If manual verification shows aged cells extinguish too aggressively on home, the alternative composition `opacity = floor + (1-floor) * qf * vis` is a one-line revisit; flag this to the user before changing.

---

## File Structure

**New files:**

- `src/matrix/seed-flip.ts` — Exports `SeedMode` type and `seedFlip(cell, c, r, now, mode)`. Single responsibility: write `flipTime` + `satLevel` consistently for every "this cell got a new glyph" event. Owns the transition-shaping constants (`RANDOM_MAX_HALFLIVES`, `AGED_BASE`, `AGED_SPREAD`).

**Modified files:**

- `src/matrix/config.ts` — adds `livenessFloor` to `MatrixConfig` + `defaultConfig`; exports `playProfile`.
- `src/matrix/state.ts` — replaces post-merge mutation with object-spread merge of `playProfile`; adds `'theme-change'` to `GameEvent` and `gameListeners`; `Cell` no longer carries `minOpacity` (the unstaged diff is discarded before any commit).
- `src/matrix/cells.ts` — `setUnlocked` calls `seedFlip(cell, c, r, performance.now(), 'random')`; `computeVisibility` returns `floor + (1 - floor) * smoothstep01(...)` when fade is enabled.
- `src/matrix/grid-init.ts` — discards the unstaged diff; loop calls `seedFlip(cell, c, r, now, 'aged')`. No `minOpacity`, no per-mode `isPlayMode` constants.
- `src/matrix/render.ts` — discards the unstaged staggered-flip block; flip site calls `seedFlip(cell, c, r, now, 'random')`. Drops the `state.isPlayMode ? desaturate(...) : ...` branch in `composeCellColor`. Drops the `state.isPlayMode ?` gate around `innerPalette` (uses `pb` presence instead).
- `src/matrix/palette.ts` — drops the `!state.isPlayMode` short-circuit (dampening is keyed on `inPlay` only). Drops the flash-lerp branch — flash is now exclusively a per-cell `composeCellColor` lerp.
- `src/matrix/layout.ts` — `setupGrid` becomes the geometry-keyed branch: soft path re-colours unlocked cells in-place and emits `'theme-change'`; hard path rebuilds `state.cells` and emits `'regrid'`.

**Untouched per spec:** `noise.ts`, `theme.ts`, `playfield.ts`, `pointer.ts`, `panel-controls.ts`, `panel-dom.ts`, `panel-frame.ts`, `crt.ts`, `shaders.ts`, `box-chars.ts`, `debug.ts`, `flash.ts`, `hook.ts`, `main.ts`, `constants.ts`, all of `src/games/bubble/`. Verify each at the end of every task.

---

## Pre-flight: discard the unstaged diff

This is **not** a commit — it resets the working tree to a clean baseline so the new commits build on `main`'s head, not on the patch the spec subsumes.

- [ ] **Step 1: Confirm the unstaged diff is the expected one**

Run: `git status --short`
Expected output (exactly):
```
 M src/matrix/grid-init.ts
 M src/matrix/render.ts
 M src/matrix/state.ts
```

If anything else is dirty, stop and surface it to the user — the plan assumes a clean tree apart from the three matrix files.

- [ ] **Step 2: Discard the unstaged diff**

Run: `git restore src/matrix/grid-init.ts src/matrix/render.ts src/matrix/state.ts`

- [ ] **Step 3: Verify the working tree is clean**

Run: `git status --short`
Expected output: empty (no modified files).

- [ ] **Step 4: Verify the baseline still type-checks and tests pass**

Run: `bun run typecheck && bun test`
Expected: typecheck passes silently; `bun test` reports all existing tests passing.

---

## Task 1: Config foundation — `livenessFloor`, `playProfile`, `'theme-change'` event

**Why first:** the seedFlip module reads `state.config.agingHalfLife` (already in config), the opacity-model task reads `state.config.livenessFloor` (added here), and the layout task emits `'theme-change'` (added here). Landing the foundation first means later commits don't need to forward-declare types.

**Files:**
- Modify: `src/matrix/config.ts:1-74` (add `livenessFloor` to interface and default; add `playProfile` export)
- Modify: `src/matrix/state.ts:1-115` (object-spread merge; widen `GameEvent`; add `theme-change` listener bucket)

- [ ] **Step 1: Add `livenessFloor` to `MatrixConfig` and `defaultConfig`**

Edit `src/matrix/config.ts`. In the `MatrixConfig` interface, after `centerFadeNoise: number;`:

```ts
  centerFadeNoise: number;
  livenessFloor: number;
```

In `defaultConfig`, after `centerFadeNoise: 0.22,`:

```ts
  centerFadeNoise: 0.22,
  livenessFloor: 0.08,
```

- [ ] **Step 2: Export `playProfile` from `config.ts`**

Append to the bottom of `src/matrix/config.ts` (after the existing `cloneConfig` export):

```ts
export const playProfile: Partial<MatrixConfig> = {
  noiseSpeed: 0.2,
  colorNoiseSpeed: 0.06,
  flipVariation: 0.2,
  livenessFloor: 0,
};
```

- [ ] **Step 3: Replace the post-merge mutation in `state.ts` with an object-spread merge**

Edit `src/matrix/state.ts`.

Change the import line at `src/matrix/state.ts:2`:

```ts
import { type MatrixConfig, defaultConfig, cloneConfig, playProfile } from './config';
```

Replace lines `src/matrix/state.ts:48-56` (the `isPlayMode` constant and the post-merge `if (isPlayMode) { ... }` block):

```ts
const isPlayMode = document.body.dataset['page'] === 'play';

const config: MatrixConfig = {
  ...cloneConfig(defaultConfig),
  ...(isPlayMode ? playProfile : {}),
};
```

- [ ] **Step 4: Widen `GameEvent` and add the `'theme-change'` listener bucket**

In `src/matrix/state.ts`, change line 41:

```ts
export type GameEvent = 'regrid' | 'theme-change';
```

In the `state` object literal at line 102, replace `gameListeners: { regrid: [] },` with:

```ts
  gameListeners: { regrid: [], 'theme-change': [] },
```

- [ ] **Step 5: Verify typecheck and tests**

Run: `bun run typecheck && bun test`
Expected: typecheck passes silently; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/matrix/config.ts src/matrix/state.ts
git commit -m "$(cat <<'EOF'
Add livenessFloor config and playProfile, plumb theme-change event

Replace the per-field post-merge mutation in state.ts with an object-
spread of playProfile. livenessFloor is unused for now — consumed by
the opacity model in a follow-up commit. theme-change is unused —
emitted by layout in a follow-up commit.
EOF
)"
```

---

## Task 2: `seedFlip` helper + three call-sites

**Files:**
- Create: `src/matrix/seed-flip.ts`
- Modify: `src/matrix/cells.ts:1-61` (setUnlocked uses seedFlip)
- Modify: `src/matrix/grid-init.ts` (loop uses seedFlip with 'aged')
- Modify: `src/matrix/render.ts` (flip block uses seedFlip with 'random')

- [ ] **Step 1: Create `src/matrix/seed-flip.ts`**

Create the new file with this content:

```ts
import { SAT_LEVELS } from './constants';
import { state, type Cell } from './state';
import { hash3 } from '../shared/math';

export type SeedMode = 'fresh' | 'random' | 'aged';

const RANDOM_MAX_HALFLIVES = 1;
const AGED_BASE = 1.5;
const AGED_SPREAD = 2;

export const seedFlip = (
  cell: Cell,
  c: number,
  r: number,
  now: number,
  mode: SeedMode = 'fresh',
): void => {
  const halfLifeMs = state.config.agingHalfLife * 1000;
  if (halfLifeMs <= 0 || mode === 'fresh') {
    cell.flipTime = now;
    cell.satLevel = SAT_LEVELS;
    return;
  }
  const ageHalfLives = mode === 'random'
    ? Math.random() * RANDOM_MAX_HALFLIVES
    : AGED_BASE + hash3(c, r, 71) * AGED_SPREAD;
  cell.flipTime = now - ageHalfLives * halfLifeMs;
  cell.satLevel = Math.round(Math.pow(0.5, ageHalfLives) * SAT_LEVELS);
};
```

- [ ] **Step 2: Update `setUnlocked` in `cells.ts` to call `seedFlip`**

Edit `src/matrix/cells.ts`.

Change the imports at the top — replace the line `import { FRAME_BORDER_CHARS, SAT_LEVELS } from './constants';` with:

```ts
import { FRAME_BORDER_CHARS } from './constants';
```

Add a new import line after the other matrix imports (next to the `getPalette` import on line 3):

```ts
import { seedFlip } from './seed-flip';
```

Replace the trailing two lines of `setUnlocked` (currently `cell.flipTime = performance.now();` and `cell.satLevel = SAT_LEVELS;`):

```ts
  cell.dirty = true;
  seedFlip(cell, c, r, performance.now(), 'random');
};
```

(The `cell.dirty = true;` line is already there — keep it. Remove the two flipTime/satLevel lines.)

- [ ] **Step 3: Update `initGrid` in `grid-init.ts` to call `seedFlip('aged')`**

Edit `src/matrix/grid-init.ts`.

Add to imports (after the existing `import { computeVisibility } from './cells';` line):

```ts
import { seedFlip } from './seed-flip';
```

Replace the cell-construction loop body (currently `cells[i] = { ... };` with `flipTime: now, satLevel: SAT_LEVELS,` inline) with:

```ts
    const cell: Cell = {
      char: randChar(colorIndex),
      locked: false,
      color,
      colorStr: getColorStr(color),
      heat: 0,
      dirty: true,
      colorIndex,
      flipTime: now,
      satLevel: SAT_LEVELS,
      distNorm,
      fadeNoise: noise,
      visibility: computeVisibility(distNorm, noise),
    };
    seedFlip(cell, c, r, now, 'aged');
    cells[i] = cell;
```

- [ ] **Step 4: Update the flip block in `render.ts` to call `seedFlip('random')`**

Edit `src/matrix/render.ts`.

Add to imports at the top:

```ts
import { seedFlip } from './seed-flip';
```

In the flip block inside `updateAndDrawGrid`, replace the two lines:

```ts
          cell.flipTime = now;
          cell.satLevel = SAT_LEVELS;
```

with:

```ts
          seedFlip(cell, c, r, now, 'random');
```

- [ ] **Step 5: Verify typecheck and tests**

Run: `bun run typecheck && bun test`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/matrix/seed-flip.ts src/matrix/cells.ts src/matrix/grid-init.ts src/matrix/render.ts
git commit -m "$(cat <<'EOF'
Unify cell-flip seeding behind seedFlip helper

Three sites used to set flipTime/satLevel inline: initGrid (boot), the
render flip block, and setUnlocked. They drift apart whenever any one
gets tweaked. Route all three through seedFlip(cell, c, r, now, mode)
so divergence is impossible. Boot uses 'aged' (deterministic per-cell
stagger past the first half-life), flips and unlocks use 'random'.
EOF
)"
```

---

## Task 3: Unified opacity model — drop per-mode forks from render path

**Files:**
- Modify: `src/matrix/cells.ts:11-17` (`computeVisibility` bakes `livenessFloor`)
- Modify: `src/matrix/render.ts` (drop `state.isPlayMode` reads and `desaturate`; key `innerPalette` on `pb`)
- Modify: `src/matrix/palette.ts:27-45` (drop `!state.isPlayMode` short-circuit; dampening keyed on `inPlay` only)

- [ ] **Step 1: Update `computeVisibility` in `cells.ts` to bake `livenessFloor`**

Edit `src/matrix/cells.ts`. Replace the body of `computeVisibility`:

```ts
export const computeVisibility = (distNorm: number, noise: number): number => {
  const fade = state.config.centerFade;
  if (fade <= 0) return 1;
  const floor = state.config.livenessFloor;
  const jittered = distNorm + noise * state.config.centerFadeNoise;
  const t = smoothstep01(jittered);
  return floor + (1 - floor) * t;
};
```

(Note: `centerFade` becomes a binary "is fading enabled?" gate. Its previous role as a multiplicative strength knob is subsumed by `livenessFloor`. Debug-panel slider continues to work — moving it to 0 still disables fading entirely, and any non-zero value yields the same `floor`-anchored gradient. This matches the spec's literal Section 1 formula; flag if visual verification shows the home page is too dim at centre.)

- [ ] **Step 2: Drop the `state.isPlayMode` desaturate branch in `render.ts`**

Edit `src/matrix/render.ts`.

In the imports block, remove `desaturate,` from the `import { desaturate, dimToBg } from '../shared/math';` line:

```ts
import { dimToBg } from '../shared/math';
```

In `composeCellColor`, replace the trailing branch:

```ts
  if (qf < 1 || vis < 1 || flashThisCell) {
    const colorIn = state.isPlayMode ? desaturate(baseColor, qf) : baseColor;
    const aged = dimToBg(colorIn, opacity, bg);
    return getColorStr(aged);
  }
  return cell.colorStr;
```

with:

```ts
  if (qf < 1 || vis < 1 || flashThisCell) {
    const aged = dimToBg(baseColor, opacity, bg);
    return getColorStr(aged);
  }
  return cell.colorStr;
```

- [ ] **Step 3: Key `innerPalette` on `pb` instead of `state.isPlayMode`**

In `updateAndDrawGrid` in `src/matrix/render.ts`, find this block:

```ts
  const outerPalette = getPalette(false);
  const innerPalette = state.isPlayMode ? getPalette(true) : outerPalette;
  const theme = getThemeColors();
  const pb = getBounds();
```

Reorder so `pb` is read first, then derive `innerPalette` from its presence:

```ts
  const pb = getBounds();
  const outerPalette = getPalette(false);
  const innerPalette = pb ? getPalette(true) : outerPalette;
  const theme = getThemeColors();
```

(`pb` is `null` on the home page since no game registers a playfield, so `innerPalette` aliases `outerPalette` there. On the bubble page `pb` is non-null whenever the playfield is registered, matching the prior `state.isPlayMode` gate behaviour for that mode.)

- [ ] **Step 4: Drop the `!state.isPlayMode` short-circuit in `getPalette`**

Edit `src/matrix/palette.ts`. Replace the body of `getPalette` (currently lines 27-45):

```ts
export const getPalette = (inPlay = false): (RGB | number[])[] => {
  const base = state.isLightMode ? state.config.paletteLight : state.config.paletteDark;
  if (!inPlay) return base.map((c) => c.slice());
  const op = PLAY_BG_OPACITY_FADED;
  const bg = themeBg();
  return base.map((c) => dimToBg(desaturate(c, PLAY_BG_SAT), op, bg));
};
```

(Dampening is now exclusively triggered by `inPlay=true`. On home, no caller passes `inPlay=true`, so the un-dampened branch returns. On play, only cells inside the playfield receive the dampened palette; outer-of-play cells use the un-dampened palette and rely on `playProfile`'s lower noise/`livenessFloor=0` for their calmer character. `PLAY_BG_OPACITY_VISIBLE` is no longer referenced here — leave the constant in `constants.ts`; the spec keeps it for documentation and any future consumer.)

- [ ] **Step 5: Verify typecheck and tests**

Run: `bun run typecheck && bun test`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/matrix/cells.ts src/matrix/render.ts src/matrix/palette.ts
git commit -m "$(cat <<'EOF'
Unify opacity model — drop isPlayMode reads from the render path

computeVisibility now lerps between livenessFloor (centre) and 1 (edges)
based on the existing radial+noise smoothstep, so home retains a faint
coloured stipple at centre while play's livenessFloor=0 lets cells fade
fully to bg between flips. The render path no longer desaturates or
short-circuits on isPlayMode; getPalette dampens on inPlay alone.
EOF
)"
```

---

## Task 4: Single flash path — drop the palette-level flash lerp

**Files:**
- Modify: `src/matrix/palette.ts:27-45` (drop `getFlashIntensity` import and the lerp branch)

The per-cell flash lerp inside `composeCellColor` already drives newly flipped cells toward the un-dampened palette via `flash.baseP`. The parallel palette-level lerp in `getPalette` is redundant and is the second source of truth the spec collapses.

- [ ] **Step 1: Remove the flash branch from `getPalette`**

Edit `src/matrix/palette.ts`.

Remove the `import { getFlashIntensity } from './flash';` line at the top.

The body of `getPalette` was already simplified in Task 3 to:

```ts
export const getPalette = (inPlay = false): (RGB | number[])[] => {
  const base = state.isLightMode ? state.config.paletteLight : state.config.paletteDark;
  if (!inPlay) return base.map((c) => c.slice());
  const op = PLAY_BG_OPACITY_FADED;
  const bg = themeBg();
  return base.map((c) => dimToBg(desaturate(c, PLAY_BG_SAT), op, bg));
};
```

After Task 3 there is no `getFlashIntensity()` call site left in `palette.ts` — verify by reading the file. If a `t = getFlashIntensity()` reference or `if (!inPlay && t > 0.001)` block survived (it shouldn't if Task 3 was applied as written), remove it now.

- [ ] **Step 2: Sanity-check `getFlashIntensity` is still used elsewhere or remove it**

Run: `grep -rn "getFlashIntensity" src/`
Expected output: only the export in `src/matrix/flash.ts` (`export const getFlashIntensity = ...`) and no consumers. The function is now unused.

If the only reference is the export itself, remove the export from `src/matrix/flash.ts`:

```ts
// delete this line:
export const getFlashIntensity = (): number => state.flash.intensity;
```

(`consumeFlashRenderParams` already exposes `intensity` to the render path via `FlashRenderParams`. `getFlashIntensity` was only used by the palette-level lerp.)

- [ ] **Step 3: Verify typecheck and tests**

Run: `bun run typecheck && bun test`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/matrix/palette.ts src/matrix/flash.ts
git commit -m "$(cat <<'EOF'
Collapse flash to a single per-cell lerp

getPalette no longer lerps the dampened play palette toward the un-
dampened palette by flashIntensity. composeCellColor's per-cell
flash.baseP lerp already drives newly flipped cells toward vivid
during a flash; the parallel palette-level path was redundant. With
its only consumer gone, getFlashIntensity is removed.
EOF
)"
```

---

## Task 5: Geometry-keyed `setupGrid` — non-destructive theme toggle

**Files:**
- Modify: `src/matrix/layout.ts:1-13` (split into hard/soft path; emit `'regrid'` only on geometry change, `'theme-change'` on soft pass)

- [ ] **Step 1: Rewrite `src/matrix/layout.ts` with the geometry-keyed branch**

`initGrid` currently rebuilds `state.cells` unconditionally. The soft path needs unlocked cells to *survive*, so the rebuild decision moves *inside* `initGrid` (next step), and `setupGrid` consults the geometry key it returned.

Resizing `gridCanvas.width`/`.height` to its current value still clears the 2D context, so the soft path must mark **every** cell dirty (locked + unlocked) — otherwise locked panel cells vanish until something else marks them dirty. `applyPanelFrames` calls `setLocked` which is idempotent on unchanged char/colorStr, so we can't rely on it to re-mark.

Replace the entire contents of `src/matrix/layout.ts`:

```ts
import { state, emit } from './state';
import { initGrid } from './grid-init';
import { applyPanelFrames } from './panel-frame';
import { setupPanelDOM } from './panel-dom';
import { applyBrightness, getColorStr, getPalette, resetColorCache } from './palette';
import type { CRTPipeline } from './crt';

let lastGeometryKey: string | null = null;

const refreshAfterSoftPass = (): void => {
  resetColorCache();
  const pb = state.playfieldBounds;
  const outerPalette = getPalette(false);
  const innerPalette = pb ? getPalette(true) : outerPalette;
  for (let i = 0; i < state.cells.length; i++) {
    const cell = state.cells[i]!;
    cell.dirty = true;
    if (cell.locked) continue;
    const r = (i / state.cols) | 0;
    const c = i - r * state.cols;
    const inPlay = !!(pb && r >= pb.row && r < pb.row + pb.height && c >= pb.col && c < pb.col + pb.width);
    const pick = inPlay ? innerPalette : outerPalette;
    cell.color = applyBrightness(pick[cell.colorIndex]!);
    cell.colorStr = getColorStr(cell.color);
  }
};

export const setupGrid = (crt: CRTPipeline): void => {
  const prevKey = lastGeometryKey;
  const { W, H, naturalCellW } = initGrid(crt, prevKey);
  const geometryKey = `${state.cellW}:${state.cellH}:${state.cols}:${state.rows}`;
  const geometryChanged = geometryKey !== prevKey;
  lastGeometryKey = geometryKey;

  if (!geometryChanged && prevKey !== null) {
    refreshAfterSoftPass();
  }

  const panel = applyPanelFrames(W, H);
  setupPanelDOM(panel, naturalCellW, () => setupGrid(crt));
  crt.resize();

  if (geometryChanged) {
    emit('regrid');
  } else {
    emit('theme-change');
  }
};
```

- [ ] **Step 2: Make `initGrid` skip the cell rebuild when geometry is unchanged**

Edit `src/matrix/grid-init.ts`. Change the function signature and add the early-return:

```ts
export const initGrid = (crt: CRTPipeline, prevGeometryKey: string | null): GridMetrics => {
```

After the canvas resize and theme-bg fill (right after the `gctx.fillRect(0, 0, W, H);` call) and after `state.cols`/`state.rows` are computed, add the geometry-key check that short-circuits the cell rebuild:

```ts
  state.cols = Math.floor(W / state.cellW);
  state.rows = Math.floor(H / state.cellH);

  const geometryKey = `${state.cellW}:${state.cellH}:${state.cols}:${state.rows}`;
  if (geometryKey === prevGeometryKey) {
    return { W, H, naturalCellW };
  }

  const now = performance.now();
  const palette = getPalette();
  // ...rest of the function (cell construction loop) unchanged
```

(Insert the `if (geometryKey === prevGeometryKey) return { W, H, naturalCellW };` right after `state.rows = Math.floor(...)` and before `const now = performance.now();`. The early-return preserves existing `state.cells` so unlocked cells keep their flipTime/satLevel/heat across the soft pass.)

- [ ] **Step 3: Verify typecheck and tests**

Run: `bun run typecheck && bun test`
Expected: passes.

- [ ] **Step 4: Manual verification — boot path**

Start a local server in one terminal:

```bash
bunx serve -l 8123 .
```

In another, run `bun run build`, then open `http://localhost:8123/index.html` in a browser. Expected:
- Field opens dim and ramps to steady state (no global flash on first paint).
- Theme toggle (the toggle in the bottom panel) re-colours unlocked cells in place — cells that were dim stay dim, no global flash.

Then open `http://localhost:8123/play/bubble.html`. Expected:
- Field opens calmer than home, fades fully between flips.
- Bubble shots fire and trigger a flash; flash decays smoothly.
- Theme toggle does **not** reset the bubble game (existing rows of bubbles survive).
- Resize the window such that the column count changes (drag wider/narrower); expected: bubble game resets, matrix reseeds with the calm 'aged' distribution.
- Game cell unlock (clear a bubble) blends back into the field with no visible pop.

If any of these fail, capture details and stop before committing — the spec's "Risks" section may need revisiting.

- [ ] **Step 5: Run the Playwright smoke**

With the server still running on :8123, run: `bun run verify`
Expected: smoke passes (output to `/tmp/claude/verify`).

- [ ] **Step 6: Commit**

```bash
git add src/matrix/layout.ts src/matrix/grid-init.ts
git commit -m "$(cat <<'EOF'
Make setupGrid geometry-keyed; theme toggle stops resetting the field

Theme toggle, debug palette edits, and no-op resizes used to rebuild
state.cells from scratch — re-seeding flipTime/satLevel/heat on every
unlocked cell and emitting 'regrid' which the bubble game treats as a
hard reset. Now setupGrid hashes (cellW, cellH, cols, rows); if the
key matches the previous call it just resets the colour cache, re-
applies brightness to every unlocked cell's stored colorIndex, and
emits the new 'theme-change' event. 'regrid' fires only when grid
geometry actually changes, so the bubble game's column-count reset
no longer over-fires on theme toggle.
EOF
)"
```

---

## Final verification

- [ ] **Step 1: Full pre-merge checklist**

Run all three:

```bash
bun run typecheck
bun test
bun run verify
```

Expected: all pass. (`bun run verify` requires a server on :8123.)

- [ ] **Step 2: Re-walk the spec's Testing section against the implementation**

Open `docs/superpowers/specs/2026-05-01-matrix-lifecycle-unification-design.md` to the Testing section. For each bullet, confirm the manual case still passes:

- Boot on `index.html`: field opens dim, no global flash.
- Boot on `play/bubble.html`: same.
- Theme toggle on `index.html`: field re-colours in place, no aging reset.
- Theme toggle on `play/bubble.html`: same; bubble state survives.
- Resize that changes column count: field reseeds; bubble game resets.
- Bubble shot triggers flash: field flashes vivid and decays smoothly.
- Game cell unlock: no visible pop where the cell returns to background.

If any check fails, stop and ask before merging — the spec's Risks section flagged "Preserved cells across theme toggle could look stale," and the implementation choice (literal Section 1 formula vs. `opacity = floor + (1-floor) * qf * vis`) may need revisiting.

- [ ] **Step 3: Confirm `git log` shows five clean commits matching the design sections**

Run: `git log --oneline main..HEAD`
Expected: five commits, in this order (oldest first):

1. Add livenessFloor config and playProfile, plumb theme-change event
2. Unify cell-flip seeding behind seedFlip helper
3. Unify opacity model — drop isPlayMode reads from the render path
4. Collapse flash to a single per-cell lerp
5. Make setupGrid geometry-keyed; theme toggle stops resetting the field
