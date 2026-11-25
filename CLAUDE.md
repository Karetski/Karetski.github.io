# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@.claude/agentkit-conduct.md

## Stack

Static site for `karetski.com`, deployed to GitHub Pages from `main` via `.github/workflows/deploy.yml`. No framework — TypeScript bundled by Bun, served as plain HTML + ESM. The repo root *is* the deploy artifact: HTML files reference `dist/*.js` directly, so `dist/` must exist for the site to work locally even though it is gitignored.

## Commands

```bash
bun install              # install deps (devDependencies only)
bun run build            # one-shot bundle to dist/ (minified, browser target)
bun run dev              # rebuild on change (no dev server — serve the repo root yourself)
bun run typecheck        # tsc --noEmit, strict mode
bun run test             # bun test — unit tests (*.test.ts under src/ and tests/)
bun run verify           # Playwright smoke test — REQUIRES a local server on :8123
```

Run a single test file with `bun test src/bubble/apps/bubble-game/physics.test.ts`. Test helpers live in `tests/helpers/` (`make-state.ts` builds a `GameState` with a fake theme/deps, `seeded-rng.ts` for deterministic randomness).

`bun run verify` opens both `index.html` and `play/bubble.html`, exercises the theme toggle and a couple of bubble shots, and fails on any console/page error or failed request. Start a server first, e.g. `bunx serve -l 8123 .` or `python3 -m http.server 8123`. Output (JSON report + screenshots) goes to `/tmp/claude/verify`.

There is no linter beyond `tsc`.

## Source layout

```
src/
  bubble/
    framework/ reusable engine: scene host, layout, renderer (cell buffer + WebGL CRT), theme, ui helpers
    apps/      scenes built on the framework: matrix-background, site-chrome, bubble-game
    shared/    small pure utilities (math)
  pages/       one entry per HTML page; wires a theme + scene host and mounts scenes
```

`framework/` must not import from `apps/` or `pages/`. Apps may import from `framework/` and, sparingly, from each other (e.g. bubble-game borrows `CHARSETS` from matrix-background).

## Entry points and HTML wiring

| Page | HTML | Entry (`dist/` output) | Scenes mounted |
|------|------|------------------------|----------------|
| Home | `index.html` | `src/pages/home.ts` (`home.js`) | matrix-background, site-chrome |
| Bubble shooter | `play/bubble.html` | `src/pages/play-bubble.ts` (`play-bubble.js`) | matrix-background, site-chrome, bubble-game |

Play-vs-home is decided in the page entry, not the DOM: `play-bubble.ts` calms the theme config (noise/flip rates), creates the matrix with `calmField: true`, and passes `isPlayMode: true` to site-chrome. Add new pages by adding an entry in `src/pages/`, an HTML file, and the entry path to both `build` and `dev` scripts in `package.json`.

## Architecture: scene host

`createSceneHost({ screen, theme })` (`src/bubble/framework/scene/host.ts`) owns the canvas, the cell buffer, the WebGL CRT post-process, layout, input, and the single RAF loop. Each frame it calls every scene's `update(dt, now)`, then `paint(ctx)` on every component (in `zIndex` order), then flushes the cell buffer through the CRT.

Contracts are in `src/bubble/framework/scene/types.ts`:

- **`Scene`** — `name`, `zIndex`, `components` (array or function of `RenderContext`), plus optional `update`, `onMount`, `onUnmount`, `onLayout`, `onTheme` hooks. Current z-order: matrix-background `0`, bubble-game `50`, site-chrome `100`.
- **`Component`** — just `paint(ctx: RenderContext)`. `RenderContext` gives `cells` (`put`/`clear`), `theme` snapshot, `layout`, `dt`, `now`, `input`. Nothing draws to the canvas directly.
- **`SceneHostServices`** — `flash.trigger(ms)` for full-screen feedback, `setRegion(name, region)` to publish a named grid region, `setPanelMask(rect)` for the CRT panel cutout, `requestLayoutRefresh()`.

Named regions are how scenes coordinate: site-chrome publishes `'panel'`; bubble-game reads `'panel'` in `onLayout` and publishes `'playfield'`; matrix-background reads `'playfield'` to switch palette/behaviour inside it. Changing a region re-runs `onLayout` on all scenes.

Errors thrown by scene hooks or components are caught and logged by the host, so one broken component doesn't stop the loop — but `verify` will still fail on the console error.

## Bubble game shape (`src/bubble/apps/bubble-game/`)

- `scene.ts` adapts the game to the host. `update` runs `updateAim → tick (physics) → checkLose`.
- State is a single mutable module (`state.ts`) — no store/dispatcher. Host-provided capabilities the logic needs are injected as `state.M: GameDeps` (`deps.ts`); components don't use `GameDeps`, they read from `RenderContext`.
- Logic is split by concern: `physics`, `matching`, `bubbles`, `bursts`, `patterns`, `layout`, `input`. Rendering is split per concern under `components/` (`aim-line`, `bubbles`, `burst`, `hud`, `pop`).
- A change in slot-column count on layout is treated as a hard reset, because existing rows would otherwise have the wrong length.

When adding a feature, prefer extending the existing per-concern logic/component module rather than introducing a new abstraction layer. Logic modules are unit-tested; add tests alongside (`*.test.ts`) using `tests/helpers/make-state.ts`.

## TypeScript conventions enforced by tsconfig

`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`. Two practical consequences worth knowing up front:

- Indexed access returns `T | undefined`. Existing code asserts with `!` after bounds checks or relies on the `?.` chain — match that style rather than disabling the flag.
- `verbatimModuleSyntax` means type-only imports must use `import type { ... }`. Mixing values and types in a plain `import` will fail typecheck.

## Skills

Adapted from agentkit and maintained here: `architecture-canon`, `behavioral-testing`, `commit-discipline`, `debugging-methodology`, `function-shape`, `hot-path-budget-audit`, `principle-review`, `simplify-ruthless`. The coding conduct imported above comes from the same place.

- `hot-path-budget-audit` — run when touching anything called per frame: the host loop, a scene's `update`, or a component's `paint`.
- `principle-review` — treats this file (layout rules, scene contracts, TS conventions) as the project's principles.

## Deploy

Push to `main` → GitHub Actions runs `bun install --frozen-lockfile`, `bun run typecheck`, `bun run test`, `bun run build`, then uploads the entire repo (including the freshly built `dist/`) as the Pages artifact. There is no separate publish branch. `CNAME` pins the custom domain.
