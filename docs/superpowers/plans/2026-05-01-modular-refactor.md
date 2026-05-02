# Modular Refactor + Games Scalability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split four oversized files into focused submodules, reverse three inverted dependencies (flash, playfield, cells/palette cycle), and restructure the game folder + entry/HTML so additional games can be added by dropping a folder + entry + HTML shell.

**Architecture:** No runtime behaviour changes. Matrix-side: `state.flash` becomes private to a new `flash.ts` API; `state.playfieldBounds` becomes private to a new `playfield.ts` module. `layout.ts` and `debug.ts` get split by responsibility. Game-side: `src/game/` → `src/games/bubble/`, the bubble shooter exports a `Game` interface, a tiny registry lists shipped games, and `play.html` moves to `play/bubble.html` so per-game HTML shells become the extension point.

**Tech Stack:** TypeScript (strict), bun (build + script runner), Playwright (visual + console smoke check via `scripts/verify.ts`), WebGL + Canvas2D for the matrix renderer, vanilla DOM for overlays.

---

## Pre-flight

This plan has no automated test framework. Verification is:

- `bun run typecheck` — catches missed call sites and import cycles.
- `bun run build` — catches build/bundler issues.
- `bun run verify` — Playwright probe of `index.html` and `play.html` (or `play/bubble.html` after Task 12). **Requires a local static server on port 8123.** Start one in another terminal before running verify:

```bash
python3 -m http.server 8123
# or
bunx serve -p 8123 .
```

Run all three after every task. The playwright probe writes screenshots to `/tmp/claude/verify/` for visual diffing if anything looks off.

Frequent commits — one per task, message format matches the existing log (sentence case, no prefix tags).

---

## File Structure (post-refactor)

```
src/
  index.ts                  unchanged (matrix-only entry)
  play-bubble.ts            NEW (was play.ts)
  shared/
    types.ts                adds Game interface
    math.ts                 unchanged
  matrix/
    state.ts                unchanged data shape
    constants.ts            adds NAV_HOME_HREF, NAV_PLAY_HREF
    config.ts               unchanged
    theme.ts                unchanged
    shaders.ts              unchanged
    crt.ts                  unchanged
    box-chars.ts            unchanged
    noise.ts                unchanged
    palette.ts              reads flash.getIntensity() instead of state.flash
    flash.ts                owns state.flash; exposes getIntensity + getRenderParams
    playfield.ts            NEW — owns state.playfieldBounds
    cells.ts                uses playfield.isInPlayfield; cycle workaround removed
    pointer.ts              unchanged
    grid-init.ts            NEW — canvas sizing + cell creation (from layout.ts)
    panel-frame.ts          NEW — drawFrame + locked-cell title/link/button writes
    panel-dom.ts            NEW — title/links/nav/toggle DOM creation
    layout.ts               thin orchestrator
    render.ts               outer loop with composeCellColor() helper
    debug.ts                wiring only
    panel-controls.ts       NEW — slider/colorRow/section factories
    main.ts                 unchanged
    hook.ts                 uses playfield + flash modules
  games/
    index.ts                NEW — registry: export const games
    bubble/                 (renamed from src/game/)
      main.ts               exports bubbleGame: Game
      state.ts              unchanged (private to this game)
      constants.ts          unchanged
      bursts.ts             gains tickBurst()
      matching.ts           keeps tickPops()
      bubbles.ts            unchanged
      physics.ts            calls tickPops() + tickBurst()
      layout.ts             unchanged
      input.ts              unchanged
      render.ts             orchestrator (WriteBuf + flush)
      render-bubbles.ts     NEW
      render-hud.ts         NEW
      render-pops.ts        NEW
      render-bursts.ts      NEW
      render-aim.ts         NEW

play/
  bubble.html               NEW (was /play.html)

(root)
  index.html                unchanged content; nav target updated via constants
  package.json              build entries: index.ts + play-bubble.ts
  scripts/verify.ts         updated URL: play.html → play/bubble.html
```

---

## Phase 1 — Matrix dependency reversals

### Task 1: Encapsulate `state.flash` behind `flash.ts`

**Why:** `state.flash` is currently read directly from `render.ts` (inline branching for active/cleanup/baseP/flipMul) and `palette.ts` (intensity for play-mode lerp). Centralising read access in `flash.ts` makes the flash sub-system self-contained.

**Files:**
- Modify: `src/matrix/flash.ts`
- Modify: `src/matrix/render.ts`
- Modify: `src/matrix/palette.ts`

- [ ] **Step 1: Add the new flash API**

Replace the contents of `src/matrix/flash.ts` with:

```ts
import type { RGB } from '../shared/types';
import { state } from './state';
import { smoothstep } from '../shared/math';

export interface FlashRenderParams {
  active: boolean;
  cleanup: boolean;
  baseP: ReadonlyArray<RGB | readonly number[]> | null;
  flipMul: number;
  intensity: number;
}

export const updateFlashIntensity = (now: number): void => {
  const f = state.flash;
  if (!f.start) { f.intensity = 0; return; }
  const e = now - f.start;
  if (e < 0) { f.intensity = 0; return; }
  if (e < f.attack) {
    f.intensity = smoothstep(e / f.attack);
  } else if (e < f.attack + f.hold) {
    f.intensity = 1;
  } else if (e < f.attack + f.hold + f.decay) {
    f.intensity = 1 - smoothstep((e - f.attack - f.hold) / f.decay);
  } else {
    f.intensity = 0;
    f.start = 0;
  }
};

export const flashBackground = (durationMs: number): void => {
  const f = state.flash;
  f.hold = Math.max(60, Math.min(700, (durationMs || 250) - f.attack));
  f.start = performance.now();
};

export const getFlashIntensity = (): number => state.flash.intensity;

export const getFlashRenderParams = (): FlashRenderParams => {
  const f = state.flash;
  const active = f.intensity > 0.001;
  const cleanup = !active && f.wasActive;
  f.wasActive = active;
  const baseP = (active || cleanup)
    ? (state.isLightMode ? state.config.paletteLight : state.config.paletteDark)
    : null;
  const flipMul = active ? 1 + f.intensity * 6 : 1;
  return { active, cleanup, baseP, flipMul, intensity: f.intensity };
};
```

- [ ] **Step 2: Migrate `palette.ts` to use `getFlashIntensity()`**

In `src/matrix/palette.ts`, replace the inline `state.flash.intensity` read inside `getPalette`. The current block:

```ts
  const t = state.flash.intensity;
  if (!inPlay && t > 0.001) {
```

becomes:

```ts
  const t = getFlashIntensity();
  if (!inPlay && t > 0.001) {
```

Add the import at the top of `palette.ts`:

```ts
import { getFlashIntensity } from './flash';
```

- [ ] **Step 3: Migrate `render.ts` to use `getFlashRenderParams()`**

In `src/matrix/render.ts`, the block currently between the `bg` declaration and the cell loop:

```ts
  const flashActive  = state.flash.intensity > 0.001;
  const flashCleanup = !flashActive && state.flash.wasActive;
  state.flash.wasActive = flashActive;
  const flashBaseP   = (flashActive || flashCleanup)
    ? (state.isLightMode ? config.paletteLight : config.paletteDark)
    : null;
  const flashFlipMul = flashActive ? 1 + state.flash.intensity * 6 : 1;
```

becomes:

```ts
  const flash = getFlashRenderParams();
  const flashActive  = flash.active;
  const flashCleanup = flash.cleanup;
  const flashBaseP   = flash.baseP;
  const flashFlipMul = flash.flipMul;
```

Inside the inner cell loop, the line `const t = state.flash.intensity;` becomes `const t = flash.intensity;`. Add `import { getFlashRenderParams } from './flash';` at the top of `render.ts`.

- [ ] **Step 4: Verify**

```
bun run typecheck
bun run build
bun run verify
```

Expected: all three exit 0. The verify JSON should report `ok: true`. Visually compare `/tmp/claude/verify/index-toggled.png` and `/tmp/claude/verify/play-after-shots.png` — should be visually identical to before.

- [ ] **Step 5: Commit**

```bash
git add src/matrix/flash.ts src/matrix/palette.ts src/matrix/render.ts
git commit -m "Encapsulate flash state behind flash module API"
```

(`src/matrix/state.ts` is **not** in the staged set — its shape is unchanged; the new flash API just hides field-level access from outside.)

---

### Task 2: Extract `playfield.ts`

**Why:** `state.playfieldBounds` is currently read by `render.ts`, `palette.ts`, `cells.ts` (via the cyclic-import workaround), `debug.ts` (the onColorChange recolor), and written by `hook.ts`. A dedicated owner module gives all those callers a small API and removes the temptation to recompute the same `inPlay` predicate in five places.

**Files:**
- Create: `src/matrix/playfield.ts`
- Modify: `src/matrix/state.ts`
- Modify: `src/matrix/render.ts`
- Modify: `src/matrix/palette.ts`
- Modify: `src/matrix/debug.ts`
- Modify: `src/matrix/hook.ts`

- [ ] **Step 1: Create `src/matrix/playfield.ts`**

```ts
import type { PlayfieldBounds } from '../shared/types';
import { state } from './state';

export const getBounds = (): PlayfieldBounds | null => state.playfieldBounds;

export const setBounds = (b: PlayfieldBounds | null): void => {
  state.playfieldBounds = b;
};

export const isInPlayfield = (col: number, row: number): boolean => {
  const b = state.playfieldBounds;
  return !!(b && row >= b.row && row < b.row + b.height
                && col >= b.col && col < b.col + b.width);
};
```

- [ ] **Step 2: Migrate `palette.ts`**

`palette.ts` does not currently call `playfieldBounds` directly — it accepts an `inPlay` boolean. No change required here; this step is a no-op so callers stay symmetric. Leave a one-line comment is **not** needed; just confirm no edit is necessary and move on.

- [ ] **Step 3: Migrate `render.ts`**

In `src/matrix/render.ts`, replace:

```ts
  const pb = state.playfieldBounds;
```

with:

```ts
  const pb = getBounds();
```

Add `import { getBounds } from './playfield';` at the top. The inline `inPlayRow`/`inPlay` computations stay as they are — they use `pb`'s fields and benefit from being inlined per-row for the hot loop.

- [ ] **Step 4: Migrate `cells.ts`**

In `src/matrix/cells.ts`, replace `setUnlocked`'s body — specifically the block:

```ts
  const pb = state.playfieldBounds;
  const inPlay = !!(pb && r >= pb.row && r < pb.row + pb.height && c >= pb.col && c < pb.col + pb.width);
  // Defer palette import to runtime to break the cycle palette → cells.
  // Safe because by the time this is called the modules are fully evaluated.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const palette = getPaletteFor(inPlay);
```

becomes:

```ts
  const inPlay = isInPlayfield(c, r);
  const palette = getPalette(inPlay);
```

Add `import { isInPlayfield } from './playfield';` at the top. **Move** the existing `import { getPalette } from './palette';` from the bottom of the file to the top with the other imports. Delete the trailing `getPaletteFor` indirection block (the last 3 lines of the current file). The cycle is gone because `palette.ts` no longer imports `cells.ts` indirectly.

- [ ] **Step 5: Migrate `debug.ts`**

In `src/matrix/debug.ts`, inside the `onColorChange` callback, replace:

```ts
    const pb = state.playfieldBounds;
    for (let i = 0; i < state.cells.length; i++) {
      const cell = state.cells[i]!;
      if (cell.locked) continue;
      const r = (i / state.cols) | 0;
      const c = i - r * state.cols;
      const inPlay = !!(pb && r >= pb.row && r < pb.row + pb.height && c >= pb.col && c < pb.col + pb.width);
```

with:

```ts
    for (let i = 0; i < state.cells.length; i++) {
      const cell = state.cells[i]!;
      if (cell.locked) continue;
      const r = (i / state.cols) | 0;
      const c = i - r * state.cols;
      const inPlay = isInPlayfield(c, r);
```

Add `import { isInPlayfield } from './playfield';` at the top.

- [ ] **Step 6: Migrate `hook.ts`**

In `src/matrix/hook.ts`, replace the body of `setPlayfieldBounds` — specifically the line:

```ts
    state.playfieldBounds = b;
```

with:

```ts
    setBounds(b);
```

Add `import { setBounds } from './playfield';` at the top. The rest of the method (the recolor loop) keeps the local `b` parameter; no other change.

- [ ] **Step 7: Verify**

```
bun run typecheck
bun run build
bun run verify
```

Expected: all three pass. In particular, the playfield-edge transition between dimmed-and-vivid cells should look unchanged in `play-after-shots.png`.

- [ ] **Step 8: Commit**

```bash
git add src/matrix/playfield.ts src/matrix/render.ts \
        src/matrix/cells.ts src/matrix/debug.ts src/matrix/hook.ts
git commit -m "Extract playfield bounds into dedicated module"
```

(`src/matrix/state.ts` is unchanged — `state.playfieldBounds` still lives there as a field; only its access path moved.)

---

## Phase 2 — Matrix file splits

### Task 3: Extract `grid-init.ts` from `layout.ts`

**Why:** `setupGrid` does four jobs. The first job — sizing the canvas, computing cell metrics, initialising the cell array — has no dependency on the panel composition that follows it.

**Files:**
- Create: `src/matrix/grid-init.ts`
- Modify: `src/matrix/layout.ts`

- [ ] **Step 1: Create `src/matrix/grid-init.ts`**

The new file owns the cell metrics + cell array creation. The exported function returns the per-cell data the panel composition step needs (the natural width of an `M` glyph, used later for letter-spacing of the title `<div>`).

```ts
import { FONT_FAMILY, FONT_PX, LINE_HEIGHT, SAT_LEVELS } from './constants';
import { state, type Cell } from './state';
import { applyBrightness, getColorStr, getPalette, randChar } from './palette';
import { sampleColorIndex } from './noise';
import { computeVisibility } from './cells';
import { getThemeColors } from './theme';
import { hash3 } from '../shared/math';
import type { CRTPipeline } from './crt';

export interface GridMetrics {
  W: number;
  H: number;
  naturalCellW: number;
}

export const initGrid = (crt: CRTPipeline): GridMetrics => {
  const { gctx, gridCanvas, screenCanvas } = crt;
  document.documentElement.classList.toggle('light', state.isLightMode);
  state.dpr = window.devicePixelRatio || 1;

  gctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
  gctx.textBaseline = 'middle';
  const m = gctx.measureText('M');
  const naturalCellW = m.width;
  const ink = gctx.measureText('MgyjpqWf|/');
  const aboveMid = ink.actualBoundingBoxAscent || FONT_PX * 0.5;
  const belowMid = ink.actualBoundingBoxDescent || FONT_PX * 0.5;
  state.cellW = Math.max(8, Math.ceil(naturalCellW));
  state.cellH = Math.max(10, Math.ceil(Math.max(FONT_PX * LINE_HEIGHT, 2 * Math.max(aboveMid, belowMid))));

  const W = window.innerWidth;
  const H = window.innerHeight;

  gridCanvas.width = W;
  gridCanvas.height = H;
  screenCanvas.width = Math.floor(W * state.dpr);
  screenCanvas.height = Math.floor(H * state.dpr);
  screenCanvas.style.width = W + 'px';
  screenCanvas.style.height = H + 'px';

  gctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
  gctx.textBaseline = 'middle';
  const theme = getThemeColors();
  gctx.fillStyle = theme.bg;
  gctx.fillRect(0, 0, W, H);

  state.cols = Math.floor(W / state.cellW);
  state.rows = Math.floor(H / state.cellH);

  const now = performance.now();
  const palette = getPalette();
  const cx0 = W * 0.5;
  const cy0 = H * 0.5;
  const maxR = Math.max(1, Math.hypot(cx0, cy0));
  const cells: Cell[] = new Array(state.cols * state.rows);
  for (let i = 0; i < cells.length; i++) {
    const r = (i / state.cols) | 0;
    const c = i - r * state.cols;
    const colorIndex = sampleColorIndex(c, r, now);
    const color = applyBrightness(palette[colorIndex]!);
    const px = c * state.cellW + state.cellW * 0.5;
    const py = r * state.cellH + state.cellH * 0.5;
    const distNorm = Math.min(1, Math.hypot(px - cx0, py - cy0) / maxR);
    const noise = (hash3(c, r, 31) - 0.5) * 2;
    cells[i] = {
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
  }
  state.cells = cells;

  return { W, H, naturalCellW };
};
```

- [ ] **Step 2: Update `layout.ts` to call `initGrid`**

In `src/matrix/layout.ts`, replace the entire block from `document.documentElement.classList.toggle('light', state.isLightMode);` down through `state.cells = cells;` (lines 26–88 of the current file) with:

```ts
  const { W, H, naturalCellW } = initGrid(crt);
```

Add `import { initGrid } from './grid-init';` at the top. Delete the now-unused imports: `FONT_FAMILY`, `LINE_HEIGHT`, `SAT_LEVELS`, `applyBrightness`, `getColorStr`, `getPalette` (only if no longer referenced elsewhere in this file — `getPalette` and `getThemeColors` are still used below), `randChar`, `sampleColorIndex`, `computeVisibility`, `hash3`, `Cell` type. Run typecheck after to find any you missed.

The `naturalCellW` returned value is used later in the title `<div>`'s letter-spacing (`titleEl.style.letterSpacing = (state.cellW - naturalCellW) + 'px';`).

- [ ] **Step 3: Verify**

```
bun run typecheck
bun run build
bun run verify
```

Expected: title letter-spacing renders identically; cells animate identically.

- [ ] **Step 4: Commit**

```bash
git add src/matrix/grid-init.ts src/matrix/layout.ts
git commit -m "Split grid initialisation out of layout"
```

---

### Task 4: Extract `panel-frame.ts` from `layout.ts`

**Why:** The frame composition (drawFrame helper + the locked-cell writes that lay down the title/links/nav/toggle borders and labels) is its own concern, separate from the DOM elements created on top of those locked cells.

**Files:**
- Create: `src/matrix/panel-frame.ts`
- Modify: `src/matrix/layout.ts`

- [ ] **Step 1: Create `src/matrix/panel-frame.ts`**

```ts
import {
  FRAME_CHARS,
  FRAME_GAP,
  FRAME_PAD,
  LINKS,
  NAV_BACK_LABEL,
  NAV_PLAY_LABEL,
  TITLE,
  TOGGLE_DARK_LABEL,
  TOGGLE_LIGHT_LABEL,
} from './constants';
import { state } from './state';
import { setLocked } from './cells';
import { getThemeColors } from './theme';

export interface PanelLayout {
  W: number;
  H: number;
  stackLeft: number;
  stackW: number;
  stackInteriorW: number;
  groupTop: number;
  totalH: number;
  titleFrameTop: number | null;   // null when isPlayMode
  titleRow: number | null;
  titleStartCol: number | null;
  linkFrameTop: number | null;
  linkRows: number[];             // empty when isPlayMode
  linkStartCols: number[];
  buttonFrameTop: number;
  navRow: number;
  navStartCol: number;
  navLabel: string;
  navHref: string;
  toggleRow: number;
  toggleStartCol: number;
  toggleLabel: string;
}

const drawFrame = (
  top: number, left: number, w: number, h: number,
  color: number[] | readonly number[],
): void => {
  for (let c = 0; c < w; c++) {
    let topCh: string, botCh: string;
    if (c === 0) { topCh = FRAME_CHARS.tl; botCh = FRAME_CHARS.bl; }
    else if (c === w - 1) { topCh = FRAME_CHARS.tr; botCh = FRAME_CHARS.br; }
    else { topCh = FRAME_CHARS.h; botCh = FRAME_CHARS.h; }
    setLocked(top, left + c, topCh, color);
    setLocked(top + h - 1, left + c, botCh, color);
  }
  for (let r = 1; r < h - 1; r++) {
    setLocked(top + r, left, FRAME_CHARS.v, color);
    setLocked(top + r, left + w - 1, FRAME_CHARS.v, color);
  }
  for (let r = 1; r < h - 1; r++) {
    for (let c = 1; c < w - 1; c++) {
      setLocked(top + r, left + c, ' ', color);
    }
  }
};

export const composePanelFrames = (W: number, H: number): PanelLayout => {
  const theme = getThemeColors();
  const toggleLabel = state.isLightMode ? TOGGLE_DARK_LABEL : TOGGLE_LIGHT_LABEL;
  const navLabel = state.isPlayMode ? NAV_BACK_LABEL : NAV_PLAY_LABEL;
  const navHref = state.isPlayMode ? 'index.html' : 'play.html';

  const longestLink = Math.max(...LINKS.map((l) => l.label.length));
  const longestButtonLabel = Math.max(
    TOGGLE_DARK_LABEL.length, TOGGLE_LIGHT_LABEL.length,
    NAV_PLAY_LABEL.length, NAV_BACK_LABEL.length,
  );
  const titleNaturalW = TITLE.length + 2 * FRAME_PAD + 2;
  const linksNaturalW = longestLink + 2 * FRAME_PAD + 2;
  const buttonNaturalW = longestButtonLabel + 2 * FRAME_PAD + 2;
  const stackW = Math.max(titleNaturalW, linksNaturalW, buttonNaturalW);
  const stackInteriorW = stackW - 2;

  const titleFrameH = 3;
  const linkFrameH = LINKS.length * 2 + 1;
  const buttonFrameH = 5;

  const stackLeft = Math.floor((state.cols - stackW) / 2);

  let totalH: number, groupTop: number;
  if (state.isPlayMode) {
    totalH = buttonFrameH;
    groupTop = state.rows - buttonFrameH;
  } else {
    totalH = titleFrameH + FRAME_GAP + linkFrameH + FRAME_GAP + buttonFrameH;
    groupTop = Math.floor((state.rows - totalH) / 2);
  }

  state.panelRect.x = (stackLeft * state.cellW) / W;
  state.panelRect.z = ((stackLeft + stackW) * state.cellW) / W;
  state.panelRect.y = 1 - ((groupTop + totalH) * state.cellH) / H;
  state.panelRect.w = 1 - (groupTop * state.cellH) / H;

  let titleFrameTop: number | null = null;
  let titleRow: number | null = null;
  let titleStartCol: number | null = null;
  let linkFrameTop: number | null = null;
  const linkRows: number[] = [];
  const linkStartCols: number[] = [];
  let buttonFrameTop: number;

  if (state.isPlayMode) {
    buttonFrameTop = groupTop;
  } else {
    titleFrameTop = groupTop;
    titleRow = titleFrameTop + 1;
    titleStartCol = stackLeft + 1 + Math.floor((stackInteriorW - TITLE.length) / 2);

    drawFrame(titleFrameTop, stackLeft, stackW, titleFrameH, theme.frame);
    for (let i = 0; i < TITLE.length; i++) {
      setLocked(titleRow, titleStartCol + i, TITLE[i]!, theme.title);
    }

    linkFrameTop = titleFrameTop + titleFrameH + FRAME_GAP;
    drawFrame(linkFrameTop, stackLeft, stackW, linkFrameH, theme.frame);

    for (let li = 0; li < LINKS.length; li++) {
      const link = LINKS[li]!;
      const linkRow = linkFrameTop + 1 + li * 2;
      const startCol = stackLeft + 1 + Math.floor((stackInteriorW - link.label.length) / 2);
      linkRows.push(linkRow);
      linkStartCols.push(startCol);

      for (let i = 0; i < link.label.length; i++) {
        setLocked(linkRow, startCol + i, link.label[i]!, theme.link);
      }

      if (li < LINKS.length - 1) {
        const sepRow = linkRow + 1;
        setLocked(sepRow, stackLeft, '╠', theme.frame);
        for (let c = 0; c < stackInteriorW; c++) {
          setLocked(sepRow, stackLeft + 1 + c, '═', theme.sep);
        }
        setLocked(sepRow, stackLeft + stackW - 1, '╣', theme.frame);
      }
    }

    buttonFrameTop = linkFrameTop + linkFrameH + FRAME_GAP;
  }

  drawFrame(buttonFrameTop, stackLeft, stackW, buttonFrameH, theme.frame);
  state.bottomPanelLeft = stackLeft;
  state.bottomPanelWidth = stackW;
  state.bottomPanelTop = buttonFrameTop;

  const navRow = buttonFrameTop + 1;
  const navStartCol = stackLeft + 1 + Math.floor((stackInteriorW - navLabel.length) / 2);
  for (let i = 0; i < navLabel.length; i++) {
    setLocked(navRow, navStartCol + i, navLabel[i]!, theme.link);
  }

  const buttonSepRow = navRow + 1;
  setLocked(buttonSepRow, stackLeft, '╠', theme.frame);
  for (let c = 0; c < stackInteriorW; c++) {
    setLocked(buttonSepRow, stackLeft + 1 + c, '═', theme.sep);
  }
  setLocked(buttonSepRow, stackLeft + stackW - 1, '╣', theme.frame);

  const toggleRow = buttonSepRow + 1;
  const toggleStartCol = stackLeft + 1 + Math.floor((stackInteriorW - toggleLabel.length) / 2);
  for (let i = 0; i < toggleLabel.length; i++) {
    setLocked(toggleRow, toggleStartCol + i, toggleLabel[i]!, theme.link);
  }

  return {
    W, H,
    stackLeft, stackW, stackInteriorW,
    groupTop, totalH,
    titleFrameTop, titleRow, titleStartCol,
    linkFrameTop, linkRows, linkStartCols,
    buttonFrameTop,
    navRow, navStartCol, navLabel, navHref,
    toggleRow, toggleStartCol, toggleLabel,
  };
};
```

- [ ] **Step 2: Update `layout.ts`**

Strip everything between the title-frame setup and the toggle-button label loop (the locked-cell writes) out of `setupGrid`, replacing it with one call:

```ts
  const panel = composePanelFrames(W, H);
```

Use `panel.*` fields for the DOM creation step that follows (we'll move that in Task 5). For this task, just keep the DOM-creation code in `layout.ts` and rewrite it to read positions from `panel` instead of recomputing them. Specifically:

- `titleEl.style.left = (panel.titleStartCol! * state.cellW) + 'px';`
- `titleEl.style.top = (panel.titleRow! * state.cellH) + 'px';`
- The link `<a>` loop uses `panel.linkRows[li]` and `panel.linkStartCols[li]`.
- The nav `<a>` uses `panel.navRow`, `panel.navStartCol`, `panel.navLabel`, `panel.navHref`.
- The toggle `<button>` uses `panel.toggleRow`, `panel.toggleStartCol`, `panel.toggleLabel`.

Add `import { composePanelFrames } from './panel-frame';` at the top. Drop now-unused imports (`FRAME_CHARS`, `FRAME_GAP`, `FRAME_PAD`, `setLocked`, etc.) — typecheck will tell you which ones are dead.

- [ ] **Step 3: Verify**

```
bun run typecheck
bun run build
bun run verify
```

Expected: identical visuals on both `index` and `play`. Toggle button still flips theme; nav button still navigates.

- [ ] **Step 4: Commit**

```bash
git add src/matrix/panel-frame.ts src/matrix/layout.ts
git commit -m "Split panel frame composition out of layout"
```

---

### Task 5: Extract `panel-dom.ts` from `layout.ts`

**Why:** The DOM elements (title, link `<a>`s, nav `<a>`, toggle `<button>`) are positioned over locked cells already drawn by `panel-frame.ts`. Their setup is mechanical — sizing and event wiring — and reads cleaner as its own module.

**Files:**
- Create: `src/matrix/panel-dom.ts`
- Modify: `src/matrix/layout.ts`

- [ ] **Step 1: Create `src/matrix/panel-dom.ts`**

```ts
import { FONT_FAMILY, FONT_PX, LINKS, TITLE } from './constants';
import { state, writeStoredTheme } from './state';
import { resetColorCache } from './palette';
import type { PanelLayout } from './panel-frame';

export const setupPanelDOM = (
  panel: PanelLayout,
  naturalCellW: number,
  rebuild: () => void,
): void => {
  const titleEl = document.getElementById('title')!;
  const linksEl = document.getElementById('links')!;
  const navEl = document.getElementById('nav')!;
  const toggleEl = document.getElementById('theme-toggle')!;

  titleEl.textContent = '';
  linksEl.innerHTML = '';
  navEl.innerHTML = '';
  toggleEl.innerHTML = '';

  if (!state.isPlayMode && panel.titleStartCol !== null && panel.titleRow !== null) {
    titleEl.textContent = TITLE;
    titleEl.style.font = `${FONT_PX}px ${FONT_FAMILY}`;
    titleEl.style.letterSpacing = (state.cellW - naturalCellW) + 'px';
    titleEl.style.lineHeight = state.cellH + 'px';
    titleEl.style.left = (panel.titleStartCol * state.cellW) + 'px';
    titleEl.style.top = (panel.titleRow * state.cellH) + 'px';
  }

  if (!state.isPlayMode) {
    for (let li = 0; li < LINKS.length; li++) {
      const link = LINKS[li]!;
      const linkRow = panel.linkRows[li]!;
      const startCol = panel.linkStartCols[li]!;
      const a = document.createElement('a');
      a.href = link.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', link.label);
      a.style.left = (startCol * state.cellW) + 'px';
      a.style.top = (linkRow * state.cellH) + 'px';
      a.style.width = (link.label.length * state.cellW) + 'px';
      a.style.height = state.cellH + 'px';
      linksEl.appendChild(a);
    }
  }

  const navA = document.createElement('a');
  navA.href = panel.navHref;
  navA.setAttribute('aria-label', panel.navLabel);
  navA.style.left = (panel.navStartCol * state.cellW) + 'px';
  navA.style.top = (panel.navRow * state.cellH) + 'px';
  navA.style.width = (panel.navLabel.length * state.cellW) + 'px';
  navA.style.height = state.cellH + 'px';
  navEl.appendChild(navA);

  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = panel.toggleLabel;
  toggleBtn.setAttribute('aria-label', panel.toggleLabel);
  toggleBtn.style.left = (panel.toggleStartCol * state.cellW) + 'px';
  toggleBtn.style.top = (panel.toggleRow * state.cellH) + 'px';
  toggleBtn.style.width = (panel.toggleLabel.length * state.cellW) + 'px';
  toggleBtn.style.height = state.cellH + 'px';
  toggleBtn.onclick = () => {
    state.isLightMode = !state.isLightMode;
    writeStoredTheme(state.isLightMode ? 'light' : 'dark');
    resetColorCache();
    rebuild();
    state.refreshPickers();
  };
  toggleEl.appendChild(toggleBtn);
};
```

- [ ] **Step 2: Slim down `layout.ts`**

`layout.ts` becomes a thin orchestrator:

```ts
import { state, emit } from './state';
import { initGrid } from './grid-init';
import { composePanelFrames } from './panel-frame';
import { setupPanelDOM } from './panel-dom';
import type { CRTPipeline } from './crt';

export const setupGrid = (crt: CRTPipeline): void => {
  const { W, H, naturalCellW } = initGrid(crt);
  const panel = composePanelFrames(W, H);
  setupPanelDOM(panel, naturalCellW, () => setupGrid(crt));
  crt.resize();
  emit('regrid');
};
```

- [ ] **Step 3: Verify**

```
bun run typecheck
bun run build
bun run verify
```

Expected: title `<div>` selectable, links clickable, nav navigates, theme toggle flips. The verify script's `probeInteraction` clicks the theme toggle, so toggle behaviour is exercised.

- [ ] **Step 4: Commit**

```bash
git add src/matrix/panel-dom.ts src/matrix/layout.ts
git commit -m "Split panel DOM creation out of layout"
```

---

### Task 6: Extract `panel-controls.ts` from `debug.ts`

**Why:** The slider/colorRow/section helpers inside `setupDebugPanel` are reusable factories. Pulling them out leaves `debug.ts` as the wiring (which controls in which order, with which callbacks).

**Files:**
- Create: `src/matrix/panel-controls.ts`
- Modify: `src/matrix/debug.ts`

- [ ] **Step 1: Create `src/matrix/panel-controls.ts`**

```ts
import type { MatrixConfig } from './config';
import { state } from './state';

export const rgbToHex = ([r, g, b]: number[] | readonly number[]): string =>
  '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, n! | 0)).toString(16).padStart(2, '0')).join('');

export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export interface SliderEntry {
  key: keyof MatrixConfig;
  input: HTMLInputElement;
  valEl: HTMLSpanElement;
  step: number;
}

export const fmt = (v: number, step: number): string =>
  step >= 1 ? String(v | 0) : v.toFixed(step >= 0.01 ? 3 : 4);

export const makeSection = (body: HTMLElement) =>
  (label: string): void => {
    const h = document.createElement('div');
    h.textContent = label;
    h.style.cssText = 'opacity: 0.5; margin: 12px 0 4px; text-transform: uppercase; font-size: 9px; letter-spacing: 0.1em;';
    body.appendChild(h);
  };

export const makeSlider = (body: HTMLElement, sliders: SliderEntry[]) =>
  (
    label: string,
    key: keyof MatrixConfig,
    min: number,
    max: number,
    step: number,
    onChange?: () => void,
  ): void => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom: 6px;';
    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 1px;';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valEl = document.createElement('span');
    valEl.style.opacity = '0.7';
    valEl.textContent = fmt(state.config[key] as number, step);
    labelRow.append(labelEl, valEl);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(state.config[key]);
    input.style.cssText = 'width: 100%; accent-color: #ff195f;';
    input.oninput = () => {
      const v = parseFloat(input.value);
      (state.config as unknown as Record<string, number>)[key as string] = v;
      valEl.textContent = fmt(v, step);
      if (onChange) onChange();
    };
    wrap.append(labelRow, input);
    body.appendChild(wrap);
    sliders.push({ key, input, valEl, step });
  };

export const makeColorRow = (body: HTMLElement) =>
  (
    label: string,
    getter: () => number[] | readonly number[],
    setter: (v: [number, number, number]) => void,
    onChange: () => void,
  ): HTMLInputElement => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-size: 10px;';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = rgbToHex(getter());
    input.style.cssText = 'width: 36px; height: 20px; border: 1px solid #444; padding: 0; cursor: pointer; background: none;';
    input.oninput = () => {
      setter(hexToRgb(input.value));
      onChange();
    };
    wrap.append(labelEl, input);
    body.appendChild(wrap);
    return input;
  };
```

- [ ] **Step 2: Update `debug.ts`**

Replace the inline `rgbToHex`, `hexToRgb`, `fmt`, `section`, `slider`, `colorRow` definitions with imports from `./panel-controls`. Inside `setupDebugPanel`, after the body element is created, build the helpers:

```ts
  const sliders: SliderEntry[] = [];
  const section = makeSection(body);
  const slider = makeSlider(body, sliders);
  const colorRow = makeColorRow(body);
```

The rest of `setupDebugPanel` is unchanged.

Add at the top:

```ts
import {
  fmt, makeColorRow, makeSection, makeSlider,
  rgbToHex, type SliderEntry,
} from './panel-controls';
```

Drop the now-unused `MatrixConfig` import if it's only used by `SliderEntry` (it's used by the reset button, so keep it).

- [ ] **Step 3: Verify**

```
bun run typecheck
bun run build
bun run verify
```

Open the page in your browser, run `debug()` in the console, and confirm: sliders render, colors render, reset button restores defaults, log button dumps to console.

- [ ] **Step 4: Commit**

```bash
git add src/matrix/panel-controls.ts src/matrix/debug.ts
git commit -m "Split debug panel control factories into own module"
```

---

### Task 7: Extract `composeCellColor()` helper from `render.ts`

**Why:** The inner cell loop is doing two things: deciding what to draw, then drawing it. Extracting the colour-composition decision (aging factor, fade visibility, flash blend, desaturation) into a pure helper leaves the loop body as "for each cell: maybe flip it, compose its draw colour, draw it".

**Files:**
- Modify: `src/matrix/render.ts`

- [ ] **Step 1: Add the helper function in `render.ts`**

Add this above `updateAndDrawGrid` in `src/matrix/render.ts`:

```ts
import type { Cell } from './state';
import type { FlashRenderParams } from './flash';

interface ComposeArgs {
  cell: Cell;
  now: number;
  agingActive: boolean;
  agingDecay: number;
  fadeActive: boolean;
  inPlay: boolean;
  flash: FlashRenderParams;
  bg: number;
}

const composeCellColor = ({
  cell, now, agingActive, agingDecay, fadeActive, inPlay, flash, bg,
}: ComposeArgs): string => {
  if (cell.locked) return cell.colorStr;

  let qf = 1;
  if (agingActive) {
    const factor = Math.pow(0.5, (now - cell.flipTime) * agingDecay);
    const level = Math.round(factor * SAT_LEVELS);
    if (level !== cell.satLevel) {
      cell.satLevel = level;
      cell.dirty = true;
    }
    qf = level / SAT_LEVELS;
  }
  const vis = fadeActive ? cell.visibility : 1;
  const opacity = qf * vis;

  const flashThisCell = flash.active && !inPlay;
  let baseColor: number[] | readonly number[] = cell.color;
  if (flashThisCell && flash.baseP) {
    const v = flash.baseP[cell.colorIndex]!;
    const t = flash.intensity;
    baseColor = [
      cell.color[0]! + (v[0]! - cell.color[0]!) * t,
      cell.color[1]! + (v[1]! - cell.color[1]!) * t,
      cell.color[2]! + (v[2]! - cell.color[2]!) * t,
    ];
    cell.dirty = true;
  } else if (flash.cleanup && !inPlay) {
    cell.dirty = true;
  }

  if (qf < 1 || vis < 1 || flashThisCell) {
    const colorIn = state.isPlayMode ? desaturate(baseColor, qf) : baseColor;
    const aged = dimToBg(colorIn, opacity, bg);
    return getColorStr(aged);
  }
  return cell.colorStr;
};
```

- [ ] **Step 2: Replace the inline composition block in the main loop**

In the inner cell loop of `updateAndDrawGrid`, replace this whole block:

```ts
      // Compose two opacity terms into a single dimToBg pass: ...
      let drawColorStr = cell.colorStr;
      if (!cell.locked) {
        let qf = 1;
        // ... ~30 lines through ...
          drawColorStr = getColorStr(aged);
        }
      }
```

with:

```ts
      const drawColorStr = composeCellColor({
        cell, now, agingActive, agingDecay, fadeActive, inPlay, flash, bg,
      });
```

(`flash` is already in scope from Task 1; `inPlay` is computed earlier in the loop.)

- [ ] **Step 3: Verify**

```
bun run typecheck
bun run build
bun run verify
```

Expected: identical visuals; the matrix flips, ages, fades, and flashes as before. Flash a combo on the play page (verify already does two clicks at 640,200 and 700,220) and confirm the bg pulse is visible in `play-after-shots.png`.

- [ ] **Step 4: Commit**

```bash
git add src/matrix/render.ts
git commit -m "Extract per-cell colour composition into a helper"
```

---

## Phase 3 — Game scalability shell

### Task 8: Add `Game` interface in `shared/types.ts`

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add the interface**

Append to `src/shared/types.ts`:

```ts
export interface Game {
  readonly slug: string;
  readonly title: string;
  start(matrix: MatrixGame): void;
}
```

(`MatrixGame` is already declared above in the file, so the reference resolves.)

- [ ] **Step 2: Verify**

```
bun run typecheck
```

Expected: no errors. Nothing references `Game` yet — that comes in Task 10.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "Add Game interface for multi-game support"
```

---

### Task 9: Rename `src/game/` → `src/games/bubble/` and add registry

**Why:** The folder rename is the structural change that lets us add more games. Doing it now (before splitting `render.ts` further) means the new sub-renderer files in Task 13 land in their final location.

**Files:**
- Move: every file in `src/game/` → `src/games/bubble/` (preserve names)
- Modify: `src/play.ts` (intermediate; renamed in Task 11)

- [ ] **Step 1: Move the folder**

```bash
mkdir -p src/games
git mv src/game src/games/bubble
```

- [ ] **Step 2: Update the import in `src/play.ts`**

```ts
import { startMatrix } from './matrix/main';
import { startGame } from './games/bubble/main';

const matrix = startMatrix();
startGame(matrix);
```

(Path changed from `./game/main` to `./games/bubble/main`.)

- [ ] **Step 3: Verify**

```
bun run typecheck
bun run build
bun run verify
```

Expected: typecheck clean; play page works identically. The Playwright probe still hits `play.html` — that's fine for now; it will move in Task 11.

- [ ] **Step 4: Commit**

The folder rename is recorded by `git mv`; only `src/play.ts` was edited on top. Stage everything `git status` shows and commit:

```bash
git add src/games src/play.ts
git status   # confirm only games/ rename + play.ts edit
git commit -m "Move bubble shooter into games/ directory"
```

---

### Task 10: Convert `bubble/main.ts` to export `bubbleGame: Game` + add registry

**Files:**
- Modify: `src/games/bubble/main.ts`
- Create: `src/games/index.ts`
- Modify: `src/play.ts`

- [ ] **Step 1: Wrap the existing `startGame` in a `Game`**

In `src/games/bubble/main.ts`, change the export:

```ts
import type { Game, MatrixGame } from '../../shared/types';
import { state } from './state';
import { computeLayout } from './layout';
import { reset } from './bubbles';
import { fire as _fire, tick, updateAim } from './physics';
import { checkLose } from './matching';
import { render } from './render';
import { installGameInput } from './input';

const start = (matrix: MatrixGame): void => {
  state.M = matrix;

  const tryStart = () => {
    if (matrix.cols === 0) {
      requestAnimationFrame(tryStart);
      return;
    }
    computeLayout();
    reset();
    state.pointerX = state.shooterPx;
    state.pointerY = state.shooterPy - 200;
    updateAim();
    matrix.on('regrid', () => {
      const oldSlotCols = state.slotCols;
      computeLayout();
      if (state.slotCols !== oldSlotCols) reset();
      state.lastWritten = new Set();
    });
    installGameInput();

    let lastT = 0;
    const loop = (now: number) => {
      if (document.hidden) {
        lastT = 0;
        requestAnimationFrame(loop);
        return;
      }
      const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0;
      lastT = now;
      updateAim();
      tick(dt);
      checkLose();
      render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  tryStart();

  void _fire;
};

export const bubbleGame: Game = {
  slug: 'bubble',
  title: 'bubble shooter',
  start,
};
```

(The `startGame` named export is gone; `bubbleGame.start` replaces it.)

- [ ] **Step 2: Create the registry**

```ts
// src/games/index.ts
import type { Game } from '../shared/types';
import { bubbleGame } from './bubble/main';

export const games: readonly Game[] = [bubbleGame];
```

- [ ] **Step 3: Update `play.ts`**

```ts
import { startMatrix } from './matrix/main';
import { bubbleGame } from './games/bubble/main';

const matrix = startMatrix();
bubbleGame.start(matrix);
```

- [ ] **Step 4: Verify**

```
bun run typecheck
bun run build
bun run verify
```

Expected: no behaviour change.

- [ ] **Step 5: Commit**

```bash
git add src/games/bubble/main.ts src/games/index.ts src/play.ts
git commit -m "Define Game contract and bubble game registry entry"
```

---

### Task 11: Move `play.html` → `play/bubble.html`, rename entry, update build + verify

**Why:** Per-game HTML shells are the extension point. Moving `play.html` into a `play/` directory now means future games drop in alongside without reorganising again.

**Files:**
- Move: `play.html` → `play/bubble.html`
- Modify: `play/bubble.html` (asset paths)
- Move: `src/play.ts` → `src/play-bubble.ts`
- Modify: `package.json` (build entries)
- Modify: `src/matrix/constants.ts` (nav hrefs)
- Modify: `src/matrix/panel-frame.ts` (consume the constants)
- Modify: `scripts/verify.ts` (probe new URL)

- [ ] **Step 1: Move + rewrite `play.html`**

```bash
mkdir -p play
git mv play.html play/bubble.html
```

Edit `play/bubble.html`. Adjust the asset paths to climb one directory:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Alexey Karetski — bubble shooter</title>
  <link rel="icon" type="image/png" href="../favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sometype+Mono:wght@400;500&display=swap">
  <link rel="stylesheet" href="../css/style.css">
</head>
<body data-page="play">
  <canvas id="screen"></canvas>
  <div id="title"></div>
  <div id="links"></div>
  <div id="nav"></div>
  <div id="theme-toggle"></div>
  <script type="module" src="../dist/play-bubble.js"></script>
</body>
</html>
```

- [ ] **Step 2: Rename the entry**

```bash
git mv src/play.ts src/play-bubble.ts
```

(Contents already correct from Task 10.)

- [ ] **Step 3: Update `package.json`**

```json
{
  "name": "karetski.com",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "bun build ./src/index.ts ./src/play-bubble.ts --outdir dist --target browser --minify",
    "dev": "bun build ./src/index.ts ./src/play-bubble.ts --outdir dist --target browser --watch",
    "typecheck": "tsc --noEmit",
    "verify": "bun scripts/verify.ts"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "playwright": "^1.59.1",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 4: Centralise nav hrefs in matrix constants**

Append to `src/matrix/constants.ts`:

```ts
export const NAV_HOME_HREF = '/index.html';
export const NAV_PLAY_HREF = '/play/bubble.html';
```

Root-absolute paths (leading `/`) are used because the bubble page lives in a subdirectory now — a relative `index.html` from `/play/bubble.html` would resolve to `/play/index.html`, which doesn't exist. The site is served at the domain root (CNAME), and the local Python server in pre-flight serves the project root at `/`, so root-absolute resolves correctly in both environments.

In `src/matrix/panel-frame.ts`, import the constants:

```ts
import {
  // ...existing imports...
  NAV_BACK_LABEL,
  NAV_HOME_HREF,
  NAV_PLAY_HREF,
  NAV_PLAY_LABEL,
  // ...
} from './constants';
```

Replace the line:

```ts
  const navHref = state.isPlayMode ? 'index.html' : 'play.html';
```

with:

```ts
  const navHref = state.isPlayMode ? NAV_HOME_HREF : NAV_PLAY_HREF;
```

- [ ] **Step 5: Update `scripts/verify.ts`**

In `scripts/verify.ts`, change:

```ts
    reports.push(await probe(playPage, 'play', `${BASE}/play.html`));
```

to:

```ts
    reports.push(await probe(playPage, 'play', `${BASE}/play/bubble.html`));
```

- [ ] **Step 6: Verify**

```
bun run typecheck
bun run build
# In a separate terminal:
python3 -m http.server 8123
# Then:
bun run verify
```

Expected: both pages load (index from `/index.html`, bubble from `/play/bubble.html`), JSON reports `ok: true`. Click the nav button on the index — should land on `play/bubble.html`. Click "back" on the bubble page — should land on `index.html`.

- [ ] **Step 7: Commit**

```bash
git add play/ src/play-bubble.ts package.json \
        src/matrix/constants.ts src/matrix/panel-frame.ts \
        scripts/verify.ts
git status   # confirm play.html removal + src/play.ts removal show as renames
git commit -m "Move play page into play/ directory and centralise nav hrefs"
```

---

## Phase 4 — Game render split

### Task 12: Split `tickPopAndBurst` into `tickPops` (matching) + `tickBurst` (bursts)

**Why:** Pop ticking and burst ticking are unrelated lifetime logic that happen to be called together. Putting them in their owners' modules is a small clean-up that the render split benefits from.

**Files:**
- Modify: `src/games/bubble/matching.ts`
- Modify: `src/games/bubble/bursts.ts`
- Modify: `src/games/bubble/physics.ts`

- [ ] **Step 1: Replace `tickPopAndBurst` with `tickPops` in `matching.ts`**

In `src/games/bubble/matching.ts`, replace the existing `tickPopAndBurst` export with:

```ts
export const tickPops = (): void => {
  if (!state.popping.length) return;
  const now = performance.now();
  let w = 0;
  for (let r = 0; r < state.popping.length; r++) {
    if (now - state.popping[r]!.tStart < POP_DURATION_MS) state.popping[w++] = state.popping[r]!;
  }
  state.popping.length = w;
};
```

Drop the `burstDuration` import (no longer used here).

- [ ] **Step 2: Add `tickBurst` to `bursts.ts`**

Append to `src/games/bubble/bursts.ts`:

```ts
export const tickBurst = (): void => {
  if (!state.activeBurst) return;
  const burstAge = performance.now() - state.activeBurst.tStart;
  if (burstAge >= burstDuration(state.activeBurst.kind)) state.activeBurst = null;
};
```

- [ ] **Step 3: Update `physics.ts`**

In `src/games/bubble/physics.ts`, replace the import:

```ts
import { collectFloaters, collectMatch, popGroup, tickPopAndBurst } from './matching';
```

with:

```ts
import { collectFloaters, collectMatch, popGroup, tickPops } from './matching';
import { tickBurst } from './bursts';
```

Then in `tick`:

```ts
export const tick = (dt: number): void => {
  tickPops();
  tickBurst();
  if (state.gameOver || !state.projectile) return;
  // ...rest unchanged
};
```

- [ ] **Step 4: Verify**

```
bun run typecheck
bun run build
bun run verify
```

Expected: pops still animate for ~520ms, bursts still hold their full window.

- [ ] **Step 5: Commit**

```bash
git add src/games/bubble/matching.ts src/games/bubble/bursts.ts src/games/bubble/physics.ts
git commit -m "Split pop and burst ticking into their owning modules"
```

---

### Task 13: Extract sub-renderers from `games/bubble/render.ts`

**Why:** `render()` does five distinct draw jobs against a shared writes buffer. Splitting each into its own file makes the orchestrator obvious and isolates future changes (e.g. a new HUD field changes only `render-hud.ts`).

**Files:**
- Create: `src/games/bubble/render-bubbles.ts`
- Create: `src/games/bubble/render-hud.ts`
- Create: `src/games/bubble/render-pops.ts`
- Create: `src/games/bubble/render-bursts.ts`
- Create: `src/games/bubble/render-aim.ts`
- Modify: `src/games/bubble/render.ts`

- [ ] **Step 1: Define the shared `WriteBuf` contract**

Create `src/games/bubble/render-bubbles.ts` first — it owns the `WriteBuf` type:

```ts
import { state, requireM } from './state';

const slotToCell = (i: number, j: number) => ({
  col: state.startSlotCol + i,
  row: state.startSlotRow + j,
});

export interface WriteBuf {
  put(col: number, row: number, char: string, color: number[] | readonly number[]): void;
  bubbleKeys: Set<string>;
  frameKeys: Set<string>;
}

export const renderBubbles = (buf: WriteBuf): void => {
  const M = requireM();
  for (let j = 0; j < state.grid.length; j++) {
    for (let i = 0; i < state.slotCols; i++) {
      const cell = state.grid[j]![i];
      if (!cell) continue;
      const c = slotToCell(i, j);
      buf.bubbleKeys.add(c.col + ',' + c.row);
      buf.put(c.col, c.row, cell.char, M.vividColor(cell.colorIdx));
    }
  }
};

export const renderProjectile = (buf: WriteBuf): void => {
  if (!state.projectile) return;
  const M = requireM();
  const col = Math.floor(state.projectile.x / state.cellW);
  const row = Math.floor(state.projectile.y / state.cellH);
  buf.put(col, row, state.projectile.char, M.vividColor(state.projectile.colorIdx));
};

export const renderGameOver = (buf: WriteBuf): void => {
  if (!state.gameOver) return;
  const M = requireM();
  const link = M.linkColor();
  const msg = `score ${state.score} — click to restart`;
  const startCol = Math.max(0, Math.floor((state.cols - msg.length) / 2));
  const midRow = Math.floor(state.rows / 2);
  for (let i = 0; i < msg.length; i++) {
    buf.put(startCol + i, midRow, msg[i]!, link);
  }
};
```

- [ ] **Step 2: Create `render-hud.ts`**

```ts
import { state, requireM } from './state';
import { sectionWidths } from './layout';
import type { WriteBuf } from './render-bubbles';

export const renderHud = (buf: WriteBuf): void => {
  if (state.gameOver) return;
  const M = requireM();
  const frameColor = M.titleColor();
  const sepColor   = M.sepColor();
  const link       = M.linkColor();

  const hudTop   = state.panelTop - 5;
  const innerRow = hudTop + 1;
  const midRow   = hudTop + 2;
  const lowerRow = hudTop + 3;
  const botRow   = hudTop + 4;
  const widths   = sectionWidths(state.panelWidth, 3);
  const queueW = widths[0]!, currentW = widths[1]!, scoreW = widths[2]!;
  const queueLeft   = state.panelLeft;
  const currentLeft = queueLeft + queueW - 1;
  const scoreLeft   = currentLeft + currentW - 1;
  const totalRight  = state.panelLeft + state.panelWidth - 1;

  for (let x = 0; x < state.panelWidth; x++) {
    const col = state.panelLeft + x;
    let topCh = '═', botCh = '═';
    if (x === 0) { topCh = '╔'; botCh = '╚'; }
    else if (x === state.panelWidth - 1) { topCh = '╗'; botCh = '╝'; }
    buf.put(col, hudTop, topCh, frameColor);
    buf.put(col, botRow, botCh, frameColor);
    buf.frameKeys.add(col + ',' + hudTop);
    buf.frameKeys.add(col + ',' + botRow);
  }
  buf.put(currentLeft, hudTop, '╦', frameColor);
  buf.put(scoreLeft,   hudTop, '╦', frameColor);
  buf.put(scoreLeft,   botRow, '╩', frameColor);

  for (let x = 0; x < state.panelWidth; x++) {
    const col = state.panelLeft + x;
    let ch = '═';
    if (x === 0) ch = '╠';
    else if (x === state.panelWidth - 1) ch = '╣';
    buf.put(col, midRow, ch, frameColor);
    buf.frameKeys.add(col + ',' + midRow);
  }
  buf.put(currentLeft, midRow, '╩', frameColor);
  buf.put(scoreLeft,   midRow, '╬', frameColor);

  for (let x = 0; x < state.panelWidth; x++) {
    const col = state.panelLeft + x;
    buf.put(col, innerRow, ' ', frameColor);
    buf.put(col, lowerRow, ' ', frameColor);
  }
  buf.put(queueLeft,   innerRow, '║', frameColor);
  buf.put(totalRight,  innerRow, '║', frameColor);
  buf.put(currentLeft, innerRow, '║', sepColor);
  buf.put(scoreLeft,   innerRow, '║', sepColor);
  buf.frameKeys.add(queueLeft   + ',' + innerRow);
  buf.frameKeys.add(totalRight  + ',' + innerRow);
  buf.frameKeys.add(currentLeft + ',' + innerRow);
  buf.frameKeys.add(scoreLeft   + ',' + innerRow);

  buf.put(state.panelLeft, lowerRow, '║', frameColor);
  buf.put(totalRight,      lowerRow, '║', frameColor);
  buf.put(scoreLeft,       lowerRow, '║', sepColor);
  buf.frameKeys.add(state.panelLeft + ',' + lowerRow);
  buf.frameKeys.add(totalRight      + ',' + lowerRow);
  buf.frameKeys.add(scoreLeft       + ',' + lowerRow);

  const placeCentred = (sectLeft: number, sectW: number, char: string | undefined, color: number[] | readonly number[]) => {
    if (!char) return;
    const cx = sectLeft + Math.floor(sectW / 2);
    buf.put(cx, innerRow, char, color);
  };
  if (state.shooter.next) {
    placeCentred(queueLeft, queueW, state.shooter.next.char, M.vividColor(state.shooter.next.colorIdx));
  }
  if (state.shooter.current) {
    placeCentred(currentLeft, currentW, state.shooter.current.char, M.vividColor(state.shooter.current.colorIdx));
  }
  const scoreStr        = String(state.score);
  const scoreCenter     = scoreLeft + Math.floor(scoreW / 2);
  const scoreContentLeft = scoreCenter - Math.floor(scoreStr.length / 2);
  for (let i = 0; i < scoreStr.length; i++) {
    const col = scoreContentLeft + i;
    if (col <= scoreLeft || col >= scoreLeft + scoreW - 1) continue;
    buf.put(col, innerRow, scoreStr[i]!, link);
  }

  const levelStr = 'lv' + state.level;
  const lvCenter = state.levelSectLeft + Math.floor(state.levelSectW / 2);
  const lvStart  = lvCenter - Math.floor(levelStr.length / 2);
  for (let i = 0; i < levelStr.length; i++) {
    const col = lvStart + i;
    if (col <= state.levelSectLeft || col >= totalRight) continue;
    buf.put(col, lowerRow, levelStr[i]!, link);
  }
};
```

- [ ] **Step 3: Create `render-pops.ts`**

```ts
import { POP_DURATION_MS } from './constants';
import { state, requireM } from './state';
import { blendToBg } from '../../shared/math';
import type { WriteBuf } from './render-bubbles';

export const renderPops = (buf: WriteBuf): void => {
  if (!state.popping.length) return;
  const M = requireM();
  const now = performance.now();
  const isLight = M.isLight;
  const bg = isLight ? 255 : 0;
  const titleC = M.titleColor();

  for (let p = 0; p < state.popping.length; p++) {
    const pc = state.popping[p]!;
    const elapsed = now - pc.tStart;
    const t = Math.max(0, Math.min(1, elapsed / POP_DURATION_MS));

    if (pc.kind === 'match') {
      let glyph: string, baseColor: number[] | readonly number[], fadeMul: number;
      if (elapsed < 110) {
        glyph = '✶';
        baseColor = titleC;
        fadeMul = 1;
      } else {
        const phase = (Math.floor(elapsed / 70) & 1) === 0;
        baseColor = phase ? titleC : M.vividColor(pc.colorIdx);
        glyph = t < 0.55 ? '✦' : t < 0.8 ? '◇' : '·';
        fadeMul = t < 0.7 ? 1 : Math.max(0, (1 - t) / 0.3);
      }
      const color = blendToBg(baseColor, fadeMul, bg);
      const k = pc.col + ',' + pc.row;
      if (!buf.bubbleKeys.has(k)) buf.put(pc.col, pc.row, glyph, color);
    } else {
      const drawRow = pc.row + Math.floor(t * 3);
      const fade = 1 - t;
      const color = blendToBg(M.vividColor(pc.colorIdx), fade, bg);
      const k = pc.col + ',' + drawRow;
      if (!buf.bubbleKeys.has(k)) buf.put(pc.col, drawRow, pc.char, color);
    }
  }
};
```

(Note: the original render uses `if (!writes.has(k) && !bubbleKeys.has(k))`. Since pops run after bubbles in the orchestrator and the buf collapses by `Map.set`, the `!writes.has` check is naturally satisfied: a pop never paints over a bubble that's already been put because bubbles are stored in `bubbleKeys` *and* in the writes map. The only collision the original guarded against was a bubble write — which is the `bubbleKeys` check. Confirm by visual diff.)

- [ ] **Step 4: Create `render-bursts.ts`**

```ts
import { NUM_COLORS } from './constants';
import { state, requireM } from './state';
import { burstDuration } from './bursts';
import { blendToBg } from '../../shared/math';
import type { WriteBuf } from './render-bubbles';

export const renderBursts = (buf: WriteBuf): void => {
  if (!state.activeBurst) return;
  const pb = state.activeBurst;
  const M = requireM();
  const dur = burstDuration(pb.kind);
  const now = performance.now();
  const elapsed = now - pb.tStart;
  const t = Math.max(0, Math.min(1, elapsed / dur));
  const isLight = M.isLight;
  const bg = isLight ? 255 : 0;
  const titleC = M.titleColor();
  const linkC  = M.linkColor();

  let baseColor: number[] | readonly number[];
  let fade: number;
  if (pb.kind === 'combo' || pb.kind === 'level') {
    const flashOn = (Math.floor(elapsed / 90) & 1) === 0;
    if (pb.kind === 'level') {
      const accent = M.vividColor(Math.floor(elapsed / 180) % NUM_COLORS);
      baseColor = flashOn ? titleC : accent;
    } else {
      baseColor = flashOn ? linkC : titleC;
    }
    if (t < 0.08)      fade = t / 0.08;
    else if (t < 0.7)  fade = 1;
    else               fade = Math.max(0, 1 - (t - 0.7) / 0.3);
  } else {
    baseColor = elapsed < 140 ? titleC : pb.color;
    fade = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
  }
  const color = blendToBg(baseColor, fade, bg);

  const text = pb.text.length % 2 === 0 ? pb.text + ' ' : pb.text;
  const minCol = state.burstSectLeft + 1;
  const maxCol = state.levelSectLeft - 1;
  const center = (minCol + maxCol) >> 1;
  let startCol = center - (text.length >> 1);
  if (startCol < minCol) startCol = minCol;
  if (startCol + text.length - 1 > maxCol) startCol = maxCol - text.length + 1;
  if (startCol < minCol) startCol = minCol;
  for (let i = 0; i < text.length; i++) {
    const col = startCol + i;
    if (col < minCol || col > maxCol) continue;
    if (buf.frameKeys.has(col + ',' + state.lowerInnerRow)) continue;
    if (text[i] === ' ') continue;
    buf.put(col, state.lowerInnerRow, text[i]!, color);
  }
};
```

- [ ] **Step 5: Create `render-aim.ts`**

```ts
import { AIM_REACH_CELLS } from './constants';
import { state, requireM } from './state';
import type { WriteBuf } from './render-bubbles';

export const renderAim = (buf: WriteBuf): void => {
  if (state.gameOver || !state.shooter.current) return;
  const M = requireM();
  const aimColor = M.vividColor(state.shooter.current.colorIdx);
  const ceilingPx = state.startSlotRow * state.cellH;
  const subW = state.cellW / 2;
  const subH = state.cellH / 4;
  const sampleStep = Math.min(subW, subH) * 0.5;
  const maxLen = AIM_REACH_CELLS * state.cellH;
  const dx = Math.cos(state.shooter.angle);
  const dy = Math.sin(state.shooter.angle);
  const dotBits = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]];
  const masks = new Map<string, number>();
  for (let d = sampleStep; d <= maxLen; d += sampleStep) {
    const px = state.shooterPx + dx * d;
    const py = state.shooterPy + dy * d;
    if (py < ceilingPx) break;
    const col = Math.floor(px / state.cellW);
    const row = Math.floor(py / state.cellH);
    const k = col + ',' + row;
    if (buf.frameKeys.has(k)) continue;
    if (buf.bubbleKeys.has(k)) break;
    if (py >= state.dangerY) continue;
    const sx = Math.min(1, Math.max(0, Math.floor((px - col * state.cellW) / subW)));
    const sy = Math.min(3, Math.max(0, Math.floor((py - row * state.cellH) / subH)));
    masks.set(k, (masks.get(k) ?? 0) | dotBits[sx]![sy]!);
  }
  for (const [k, mask] of masks) {
    if (!mask) continue;
    const ix = k.indexOf(',');
    const col = +k.slice(0, ix);
    const row = +k.slice(ix + 1);
    buf.put(col, row, String.fromCharCode(0x2800 + mask), aimColor);
  }
};
```

- [ ] **Step 6: Replace `render.ts` with the orchestrator**

Replace the entire `src/games/bubble/render.ts` with:

```ts
import { state, requireM } from './state';
import {
  renderBubbles,
  renderGameOver,
  renderProjectile,
  type WriteBuf,
} from './render-bubbles';
import { renderHud } from './render-hud';
import { renderPops } from './render-pops';
import { renderBursts } from './render-bursts';
import { renderAim } from './render-aim';

export const render = (): void => {
  const M = requireM();
  const writes = new Map<string, { char: string; color: number[] | readonly number[] }>();
  const buf: WriteBuf = {
    put: (col, row, char, color) => {
      if (col < 0 || col >= state.cols || row < 0 || row >= state.rows) return;
      writes.set(col + ',' + row, { char, color });
    },
    bubbleKeys: new Set<string>(),
    frameKeys: new Set<string>(),
  };

  renderBubbles(buf);
  renderHud(buf);
  renderPops(buf);
  renderBursts(buf);
  renderAim(buf);
  renderProjectile(buf);
  renderGameOver(buf);

  for (const key of state.lastWritten) {
    if (!writes.has(key)) {
      const ix = key.indexOf(',');
      M.clearCell(+key.slice(0, ix), +key.slice(ix + 1));
    }
  }
  for (const [key, val] of writes) {
    const ix = key.indexOf(',');
    M.setCell(+key.slice(0, ix), +key.slice(ix + 1), val.char, val.color as number[]);
  }
  state.lastWritten = new Set(writes.keys());
};
```

- [ ] **Step 7: Verify**

```
bun run typecheck
bun run build
# server still running on :8123
bun run verify
```

Expected: `play-after-shots.png` shows the same scene as before — bubbles in place, HUD intact (queue/current/score, level), aim line visible, no rendering glitches near the panel borders.

Manual check: open `play/bubble.html` in your browser and shoot enough to land a combo. Confirm:
- combo banner shows in the burst section
- level banner replaces it when you advance
- pop sparkles animate over popped slots
- aim line trails the cursor
- game-over screen appears when bubbles cross the danger line

- [ ] **Step 8: Commit**

```bash
git add src/games/bubble/render.ts \
        src/games/bubble/render-bubbles.ts \
        src/games/bubble/render-hud.ts \
        src/games/bubble/render-pops.ts \
        src/games/bubble/render-bursts.ts \
        src/games/bubble/render-aim.ts
git commit -m "Split bubble game render into per-concern submodules"
```

---

## Wrap-up

After Task 13, the project shape matches the spec's File Structure section. Quick smoke check:

- `bun run typecheck` — clean
- `bun run build` — clean, produces `dist/index.js` and `dist/play-bubble.js`
- `bun run verify` — `ok: true`, no console errors, no failed requests
- Manual: visit `index.html`, click "play" → lands on `play/bubble.html`. Click "back" → returns to `index.html`. Toggle theme on both pages. Play a combo — bg flashes, banner appears.

Adding a second game later is now:

```
1. mkdir src/games/<slug> && implement (export <slug>Game: Game)
2. add src/play-<slug>.ts (3 lines: startMatrix + <slug>Game.start)
3. add play/<slug>.html (copy of bubble.html, swap script src + title)
4. add to bun build entries in package.json
5. add <slug>Game to src/games/index.ts
```

When game #2 lands, add `play/index.html` that iterates the `games` registry and links to each `play/<slug>.html` — and update `NAV_PLAY_HREF` to point at it.
