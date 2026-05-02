# Modular refactor + games scalability

Date: 2026-05-01
Status: approved, pending implementation plan

## Goal

Two motivations, one refactor:

1. **Modularity** — split a handful of files that have grown wide, and reverse a few inverted dependencies so cross-module access goes through a small API instead of reaching into the shared `state` singleton.
2. **Game scalability** — make adding a second game (and a third, etc.) a drop-in operation: new folder under `src/games/<slug>/`, new HTML shell, new entry, register.

Behaviour does not change. Same pixels, same timing, same input model.

## Background — current state

The codebase was recently reorganised from JS into bun + TypeScript modules. Most files are healthy (1–3 KB, one clear job). The remaining hotspots:

- **`src/matrix/layout.ts` (~270 lines)** — `setupGrid` does cell init, frame drawing, panel composition, *and* DOM creation for title/links/nav/toggle.
- **`src/matrix/render.ts` (~140 lines)** — single tight inner loop with flash composition, aging, and radial fade tangled inline.
- **`src/matrix/debug.ts` (~280 lines)** — one `setupDebugPanel`; slider/colorRow/section helpers inline.
- **`src/game/render.ts` (~300 lines)** — single `render()` doing bubbles, HUD frame, pops, bursts, aim line, projectile, game-over.
- **`src/matrix/cells.ts`** — has a "deferred import to break the cycle" workaround at the bottom (`getPaletteFor`); a code smell for an inverted boundary.
- **`state.ts` modules (matrix + game)** — mutable singletons read/written from many helpers; not changing this here, but several of its fields can be hidden behind small APIs.

The game lives at `src/game/` and is hard-wired to `src/play.ts` → `play.html`. There is no extension point for a second game.

## Architecture

### matrix/ — proposed shape

```
state.ts          (unchanged data; field shapes preserved)
constants.ts      (adds NAV_HOME_HREF, NAV_PLAY_HREF)
config.ts         (unchanged)
theme.ts          (unchanged)
shaders.ts        (unchanged)
crt.ts            (unchanged)
box-chars.ts      (unchanged)
noise.ts          (unchanged)
palette.ts        (reads flash via flash.ts, not state.flash)
flash.ts          OWNS state.flash; exposes getIntensity() + getRenderParams()
playfield.ts      NEW — owns state.playfieldBounds; isInPlayfield(c,r), getBounds(), setBounds()
cells.ts          (uses playfield.ts; cyclic-import workaround removed)
pointer.ts        (unchanged)
grid-init.ts      NEW — canvas sizing + cell array creation (extracted from layout.ts)
panel-frame.ts    NEW — drawFrame helper + title/link/button block (locked-cell writes)
panel-dom.ts      NEW — title/links/nav/toggle DOM elements
layout.ts         thin setupGrid orchestrator that calls the three above
render.ts         outer loop reads from composeCellColor() helper; flash logic gone from inline
debug.ts          wiring only
panel-controls.ts NEW — slider/colorRow/section factories
main.ts           (unchanged)
hook.ts           (uses playfield + flash modules)
```

### games/ — proposed shape

```
src/
  games/
    index.ts                NEW — exports games registry
    bubble/                 (renamed from src/game/)
      main.ts               exports bubbleGame: Game
      state.ts              (game-private singleton; not exported)
      constants.ts          (unchanged)
      bursts.ts             gains tickBurst() (split out of matching.ts)
      matching.ts           gains tickPops() (split out of tickPopAndBurst)
      bubbles.ts            (unchanged)
      physics.ts            calls tickPops() + tickBurst() instead of tickPopAndBurst()
      layout.ts             (unchanged)
      input.ts              (unchanged)
      render.ts             orchestrator: owns the writes buffer, calls sub-renderers, flushes
      render-bubbles.ts     NEW
      render-hud.ts         NEW
      render-pops.ts        NEW
      render-bursts.ts      NEW
      render-aim.ts         NEW
```

### Entry points + HTML

```
src/
  index.ts                  (matrix-only entry; unchanged)
  play-bubble.ts            NEW (was play.ts) — startMatrix() + bubbleGame.start(matrix)

play/
  bubble.html               NEW (was /play.html) — loads ../dist/play-bubble.js, ../css/style.css

(root)
  index.html                (unchanged content; nav target updated via constants)
```

`package.json` build line becomes:

```
bun build ./src/index.ts ./src/play-bubble.ts --outdir dist --target browser --minify
```

One additional entry per future game.

## The Game contract

Defined in `src/shared/types.ts`:

```ts
export interface Game {
  readonly slug: string;
  readonly title: string;
  start(matrix: MatrixGame): void;
}
```

A game exports a `Game` from its `main.ts`:

```ts
// src/games/bubble/main.ts
export const bubbleGame: Game = {
  slug: 'bubble',
  title: 'bubble shooter',
  start(matrix) { /* the existing startGame body */ },
};
```

The bubble game's internal `state` singleton stays inside `games/bubble/` and is **not** exported. Each game owns its own state.

## Registry

`src/games/index.ts`:

```ts
import type { Game } from '../shared/types';
import { bubbleGame } from './bubble/main';
export const games: readonly Game[] = [bubbleGame];
```

The registry is the single source of truth for: which games exist, what label they show, and what slug routes where. A future games-selector page reads from it directly.

## Communication contract for game sub-renderers

The render orchestrator hands every sub-renderer a tiny shared buffer:

```ts
interface WriteBuf {
  put(col: number, row: number, char: string, color: number[] | readonly number[]): void;
  bubbleKeys: Set<string>;  // populated by renderBubbles, read by pops + aim
  frameKeys: Set<string>;   // populated by renderHud, read by bursts + aim
}
```

Each `render*(buf, M)` is a pure-ish mutation on the buffer — no I/O, no `M.setCell` calls. The orchestrator calls them in fixed order:

```
bubbles → hud → pops → bursts → aim → projectile → game-over
```

Then it diffs against `state.lastWritten` and flushes through `M.setCell`/`M.clearCell` exactly once. This preserves the current single-flush behaviour.

## Reversed dependencies

### flash.ts

Becomes the only reader of `state.flash`. Exposes:

```ts
getIntensity(): number;
getRenderParams(): {
  active: boolean;
  cleanup: boolean;
  baseP: RGB[] | null;
  flipMul: number;
};
```

`render.ts` consumes `getRenderParams()` for the per-frame draw loop; `palette.ts` consumes `getIntensity()` for the play-mode lerp inside `getPalette()`. Neither imports `state.flash` again.

### playfield.ts (new)

Becomes the only reader/writer of `state.playfieldBounds`. Exposes:

```ts
isInPlayfield(c: number, r: number): boolean;
getBounds(): PlayfieldBounds | null;
setBounds(b: PlayfieldBounds | null): void;
```

Used by `render.ts`, `cells.ts`, `palette.ts`, `debug.ts` (the onColorChange recolor loop), and `hook.ts`.

### cells.ts

Loses the deferred-import workaround. `setUnlocked` calls `playfield.isInPlayfield(c, r)` and then `palette.getPalette(inPlay)` — no cycle.

## Why per-game HTML + per-game entry (not URL routing)

Two alternatives rejected:

- **One `play.html` with `?game=bubble`** — bundles every game into one JS file, runtime dispatch, harder to set per-game `<title>` / favicon / metadata.
- **Hash routing inside one bundle** — same downsides, weirder URLs.

Per-game HTML + per-game entry gives clean deep links, independent bundles (one game's bundle size doesn't cost the others), per-game `<title>`, and zero runtime dispatch. Cost is one tiny HTML shell per game.

## Adding a second game later (the test for "scalable")

```
1. mkdir src/games/snake && implement (anything that satisfies Game)
2. add src/play-snake.ts  (3 lines)
3. add play/snake.html    (copy of bubble.html, swap script src)
4. add to bun build entries in package.json
5. add snakeGame to src/games/index.ts
```

When game #2 ships, add a `play/index.html` selector page that iterates the registry and links to each `play/<slug>.html`. Until then the index page's nav button points straight at `play/bubble.html` — no selector needed for one game.

## Sequencing

The folder/entry restructure must land **before** the per-renderer-file split, so the new sub-files are created in their final `games/bubble/` location instead of being moved twice. Suggested order:

1. **Matrix dependency reversals** — add `flash.ts` API, add `playfield.ts`, fix `cells.ts` cycle. (Smallest blast radius; isolated changes.)
2. **Matrix file splits** — `grid-init.ts`, `panel-frame.ts`, `panel-dom.ts` out of `layout.ts`; `panel-controls.ts` out of `debug.ts`; `composeCellColor()` extracted from `render.ts`.
3. **Game scalability shell** — `Game` interface in `shared/types.ts`; rename `src/game/` → `src/games/bubble/`; add `games/index.ts`; rename `src/play.ts` → `src/play-bubble.ts`; move `play.html` → `play/bubble.html`; update `package.json`, matrix nav constants, `verify.ts`.
4. **Game render split** — `render-bubbles.ts`, `render-hud.ts`, `render-pops.ts`, `render-bursts.ts`, `render-aim.ts` inside `games/bubble/`; thin `render.ts` orchestrator; split `tickPopAndBurst` into `tickPops` (matching) + `tickBurst` (bursts).

Each step is independently verifiable.

## Verification

After each step:

- `bun typecheck` — catches import cycles and missed call sites
- `bun verify` — playwright check in `scripts/verify.ts`

After the full refactor:

- Visual smoke test on `index.html` and `play/bubble.html`: matrix flips, theme toggle, panel layout, game shooting + combos + level banner.

## Risk

- Mostly mechanical splits. Risk is import cycles or missed call sites; typecheck catches both.
- Dependency reversals are localised (flash, playfield) and small enough for one commit each.
- No `state.ts` shape changes; the data layer stays as-is.
- `play.html` → `play/bubble.html` move is the one URL-visible change. Mitigated by updating the matrix nav constants and `verify.ts` together.

## Out of scope

- Replacing the global `state` singletons with explicit context objects (heavy, no test suite to anchor it).
- A games-selector page (added when game #2 ships).
- Any gameplay/balance/visual changes.
