# Matrix lifecycle unification

Date: 2026-05-01

## Problem

The matrix background works, but the code has accumulated edge cases around lifecycle transitions (boot, theme toggle, resize, flip, game-cell unlock, flash) and per-mode forks (`isPlayMode`). Each new visual tweak adds another conditional branch or per-cell field instead of resolving the underlying inconsistency. The most recent unstaged patch — adding `cell.minOpacity`, four `isPlayMode`-branched constants in `initGrid`, and a parallel post-flip aging path in `render` — is symptomatic: it patches three transitions independently rather than removing the divergence.

## Goals

- One render path, regardless of page (`home` vs `play`).
- One source of truth for "what does a freshly flipped cell look like."
- Theme toggle does not reset aging or flash the field.
- Per-mode visual differences live in *config*, not in render-time branches.
- The pending unstaged diff is subsumed by the new model and removed.

## Non-goals

- No change to the visual contract on either page (home keeps its faint coloured stipple, play keeps its calmer field that fades fully between flips).
- No new abstractions for hypothetical future games or modes.
- No changes to CRT shader, bubble game internals, panel layout, or pointer/heat behaviour.

## Design

### 1. Unified opacity model

Every unlocked cell composes its displayed colour through the same path:

```
qf  = pow(0.5, (now - flipTime) / halfLife)   // quantised to SAT_LEVELS, ∈ [0, 1]
vis = floor + (1 - floor) * smoothstep01(distNorm + fadeNoise * fadeJitter)
opacity = qf * vis
displayed = lerp(baseColor, bg, 1 - opacity)
```

- `baseColor` is the cell's palette colour at flip time. The play-mode "muted" look comes from a *different palette*, not a different render path.
- `bg` is the theme background. Same in both modes.
- `floor` is `state.config.livenessFloor`. With `floor > 0`, aged cells leave a faint coloured remnant of `baseColor` instead of fully extinguishing. The per-cell stipple variation already in `fadeNoise` carries through naturally because it's baked into `vis`.
- The `if (state.isPlayMode) desaturate(...)` branch in `composeCellColor` is removed.
- The pending diff's per-cell `cell.minOpacity` field is removed; its role is absorbed by `livenessFloor` plus `fadeNoise`.

### 2. seedFlip helper

A single helper sets `flipTime` and `satLevel` consistently for every "this cell got a new glyph" event:

```ts
export type SeedMode = 'fresh' | 'random' | 'aged';
export const seedFlip = (cell: Cell, now: number, mode: SeedMode = 'fresh'): void
```

| Mode      | Age sampled                                  | Used by |
|-----------|-----------------------------------------------|---------|
| `fresh`   | `0` (peak saturation)                         | reserved (no current caller) |
| `random`  | `random() * halfLife * randomMaxHalflives`    | `render.ts` flip block, `setUnlocked` |
| `aged`    | `(ageBase + hash3(c, r) * ageSpread) * halfLife` | `initGrid` |

`randomMaxHalflives`, `ageBase`, `ageSpread` are constants in the seedFlip module (not config knobs — they shape *transitions*, not steady-state visuals). Hash inputs use the cell's `(c, r)` so initial seeding is deterministic per location.

The helper replaces three divergent sites:
- `initGrid` cell loop (currently sets `flipTime: now, satLevel: SAT_LEVELS`, but the unstaged diff rewrites this).
- `render.ts` flip block (currently `cell.flipTime = now; cell.satLevel = SAT_LEVELS`; unstaged diff rewrites this differently).
- `setUnlocked` (currently `cell.flipTime = performance.now(); cell.satLevel = SAT_LEVELS`).

After this change, all three call `seedFlip(cell, now, mode)` and divergence is impossible.

### 3. playProfile in config

Add `livenessFloor: number` to `MatrixConfig` (default `0.08`). Add `playProfile`:

```ts
// config.ts
export const playProfile: Partial<MatrixConfig> = {
  noiseSpeed: 0.2,
  colorNoiseSpeed: 0.06,
  flipVariation: 0.2,
  livenessFloor: 0,
};
```

`state.ts` merges it once at module load:

```ts
const isPlayMode = document.body.dataset['page'] === 'play';
const config = {
  ...cloneConfig(defaultConfig),
  ...(isPlayMode ? playProfile : {}),
};
```

The hardcoded post-merge mutation block in `state.ts` (`config.noiseSpeed = 0.2; ...`) is deleted. After this change, no code in `render.ts`, `palette.ts`, `cells.ts`, `noise.ts`, or `grid-init.ts` reads `state.isPlayMode`. The flag survives only for layout/wiring decisions made outside the render path (debug panel, layout module).

`getPalette` keeps its `inPlay` parameter (playfield-bounds dampening is orthogonal to mode), but the dampening itself is config-driven via `PLAY_BG_OPACITY_VISIBLE` / `PLAY_BG_OPACITY_FADED` / `PLAY_BG_SAT` constants as today.

### 4. Non-destructive setupGrid

Replace the unconditional rebuild in `initGrid` with a geometry-keyed branch:

```
setupGrid:
  recompute cellW, cellH, cols, rows
  geometryKey = `${cellW}:${cellH}:${cols}:${rows}`
  if geometryKey === lastGeometryKey:
    // soft change (theme toggle, debug palette edit, no-op resize)
    resetColorCache()
    palette = getPalette()
    for each cell:
      if !cell.locked:
        cell.color = applyBrightness(palette[cell.colorIndex])
        cell.colorStr = getColorStr(cell.color)
        cell.dirty = true
    emit 'theme-change'
  else:
    // hard change (initial boot, resize that changes grid metrics)
    state.cells = build new array, seedFlip(_, now, 'aged') per cell
    lastGeometryKey = geometryKey
    emit 'regrid'
  applyPanelFrames(W, H)        // existing flow re-locks panel cells
  setupPanelDOM(...)
```

`'regrid'` becomes more honest: it fires only when grid geometry actually changes, so the bubble game's "column count changed → reset" handler stops over-firing on theme toggle. `'theme-change'` is a new soft event the bubble game ignores (its locked cells survive the soft path because the loop skips locked, and the bubble palette is theme-independent — verified, no `getThemeColors` references in `src/games/bubble/`).

`GameEvent` type widens to `'regrid' | 'theme-change'`. `state.gameListeners` initialiser adds the new bucket.

Locked cells (title text, frame border, link text, panel separators) are re-asserted by `applyPanelFrames` on every `setupGrid` call — that's the existing flow and is unchanged. So a theme toggle: unlocked cells get re-coloured in-place (preserving aging), locked cells get re-coloured by panel re-application.

### 5. Single flash path

Remove the flash-lerp branch in `getPalette` (`palette.ts:36-43`). Flash is implemented exclusively as the per-cell colour lerp in `composeCellColor` (`render.ts:43-51`). One source of truth.

The per-cell lerp already uses `cell.colorIndex` to look up the un-dampened palette colour and lerps from `cell.color` toward it by `flash.intensity`. With the palette branch removed, `getPalette` becomes a pure function of `(isLightMode, inPlay)` — no time dependency, no flash awareness. Newly flipped cells during a flash inherit the dampened-palette `baseColor`, but the per-cell render lerp in the same frame brings them up to vivid; visually identical to today.

`flash.consumeFlashRenderParams` no longer needs to compute `baseP` lazily for the palette branch — `composeCellColor` already reads `state.config.paletteLight/paletteDark` directly via `flash.baseP`, which is unchanged.

## Module-level diff summary

| File | Change |
|------|--------|
| `config.ts` | Add `livenessFloor` to `MatrixConfig` and `defaultConfig`. Add exported `playProfile`. |
| `state.ts` | Replace post-merge mutation with object-spread merge of `playProfile`. Do not add `cell.minOpacity` to `Cell` (the unstaged diff's addition is dropped). Add `'theme-change'` to `GameEvent`. |
| `cells.ts` | `setUnlocked` calls `seedFlip(cell, now, 'random')` instead of setting `flipTime`/`satLevel` inline. `computeVisibility` updated to bake `livenessFloor` into the returned value. |
| `grid-init.ts` | Discard the unstaged diff. Loop calls `seedFlip(cell, now, 'aged')`. No `minOpacity`, no four `isPlayMode` constants. |
| `render.ts` | Discard unstaged post-flip block; flip site calls `seedFlip(cell, now, 'random')`. Remove `Math.max(cell.minOpacity, ...)` (vis already floored). Remove `if (state.isPlayMode) desaturate(...)` branch — composeCellColor lerps `baseColor → bg` directly. |
| `palette.ts` | Remove flash-lerp branch in `getPalette`. |
| `layout.ts` | `setupGrid` becomes the geometry-keyed branch described above. Tracks `lastGeometryKey` as a module-local variable (no consumer needs to invalidate it from outside). |
| `flash.ts` | No structural change; `consumeFlashRenderParams.baseP` continues to populate as today. |
| `noise.ts`, `theme.ts`, `playfield.ts`, `pointer.ts`, `panel-*.ts`, `crt.ts`, `shaders.ts`, `box-chars.ts`, `debug.ts` | Unchanged (debug panel's `agingHalfLife` slider continues to work because the model still reads `config.agingHalfLife`). |
| `seedFlip.ts` (new) | New module exporting `seedFlip` and the `SeedMode` type. Keeps the seeding constants (`randomMaxHalflives`, `ageBase`, `ageSpread`) co-located. |

## Testing

The repo has no test runner; verification relies on `bun run typecheck` and the Playwright smoke (`bun run verify`) which exercises theme toggle and bubble shots. The smoke covers:
- Boot doesn't error.
- Theme toggle doesn't error or produce console errors.
- Bubble shots fire without errors.

The smoke does *not* assert visual stability across theme toggle. Manual verification will cover:
- Boot on `index.html`: field opens dim, no global flash.
- Boot on `play/bubble.html`: same.
- Theme toggle on `index.html`: field re-colours in place, no aging reset (cells that were dim stay dim).
- Theme toggle on `play/bubble.html`: same; bubble game state survives unchanged.
- Resize that changes column count: field reseeds with the calm `'aged'` distribution; bubble game resets (existing `regrid` behaviour).
- Bubble shot triggers flash: field flashes vivid and decays smoothly; no popcorn after decay.
- Game cell unlock (e.g. bubble cleared): no visible pop where the cell returns to background.

## Risks

- **Preserved cells across theme toggle could look stale.** A cell that was holding a dim purple stipple in dark mode will, after theme toggle, hold a dim purple stipple in light mode (re-coloured via `applyBrightness(palette[colorIndex])`). The cell's *brightness multiplier* from `applyBrightness` is re-randomised on the soft pass — acceptable because `brightnessVar` defaults to 0, so the multiplier is 1 and the result is deterministic from `colorIndex` + theme.
- **`seedFlip` constants live in code, not config.** Deliberate: they shape transitions, not steady state. If we later want them tunable, lifting to config is mechanical.
- **`'theme-change'` event is new but unused.** The bubble game ignores it. The event exists for symmetry with `'regrid'` and as a hook for future games. If unused after a few months, it can be removed.

## Out of scope (separate work)

- Tuning the `livenessFloor` default value across both modes is a follow-up visual pass, not part of this restructure.
- The `noise.ts:24-43` allocation in `sampleColorIndex` (calls `getPalette()` per cell per flip just to read length) is a separate perf cleanup.
- The dual-flash collapse decision documented here doesn't preclude a future "flash also briefly raises `livenessFloor`" effect — that would compose cleanly with the new model.
