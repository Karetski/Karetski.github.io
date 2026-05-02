# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Static site for `karetski.com`, deployed to GitHub Pages from `main` via `.github/workflows/deploy.yml`. No framework — TypeScript bundled by Bun, served as plain HTML + ESM. The repo root *is* the deploy artifact: HTML files reference `dist/*.js` directly, so `dist/` must exist for the site to work locally even though it is gitignored.

## Commands

```bash
bun install              # install deps (devDependencies only)
bun run build            # one-shot bundle to dist/ (minified, browser target)
bun run dev              # rebuild on change (no dev server — serve the repo root yourself)
bun run typecheck        # tsc --noEmit, strict mode
bun run verify           # Playwright smoke test — REQUIRES a local server on :8123
```

`bun run verify` opens both `index.html` and `play/bubble.html`, exercises the theme toggle and a couple of bubble shots, and fails on any console/page error or failed request. Start a server first, e.g. `bunx serve -l 8123 .` or `python3 -m http.server 8123`. Output (JSON report + screenshots) goes to `/tmp/claude/verify`.

There is no test runner and no linter beyond `tsc`.

## Entry points and HTML wiring

Two HTML pages, two bundle entries:

| Page | HTML | Entry | Bundles |
|------|------|-------|---------|
| Home | `index.html` | `src/index.ts` | matrix only |
| Bubble shooter | `play/bubble.html` | `src/play-bubble.ts` | matrix + bubble game |

`play/bubble.html` sets `<body data-page="play">`. `src/matrix/state.ts` reads this attribute at module load and switches the matrix into "play mode" (calmer flip/noise rates) so the game reads as the foreground. Anything that needs the play-vs-home distinction should branch on `state.isPlayMode` rather than checking the DOM again.

## Architecture: matrix + game host

The "matrix" is the falling-character CRT background rendered via a WebGL post-process (`src/matrix/crt.ts`, `shaders.ts`). It owns the canvas, the cell grid, the panel layout, theming, and pointer input — and it runs on every page.

Games are layered *on top* by writing into the same grid as locked cells. The contract lives in `src/shared/types.ts` as the `MatrixGame` interface, which `src/matrix/hook.ts` implements. A game receives this object from `startMatrix()` and uses it to:

- Read grid geometry (`cols`, `rows`, `cellW`, `cellH`) and the bottom panel's bounds.
- Reserve a region with `setPlayfieldBounds(...)` — cells inside the playfield get a different palette so the game's writes stand out.
- Write/clear cells with `setCell(col, row, char, color)` / `clearCell(col, row)`. Locked cells survive matrix flips.
- Subscribe to `'regrid'` to recompute layout when the grid reflows (font load, resize, panel label change). The bubble game treats a column-count change as a hard reset because existing rows would otherwise have the wrong length.
- Trigger `flashBackground(durationMs)` for full-screen feedback.

Game registry is `src/games/index.ts` (currently just bubble). Each game exports a `Game` (`{ slug, title, start(matrix) }`).

## Bubble game shape (`src/games/bubble/`)

The game runs its own RAF loop independent of the matrix loop. Each tick: `updateAim → tick(physics) → checkLose → render`. State is a single mutable module (`state.ts`) — there is no store/dispatcher abstraction. Rendering is split per concern (`render-aim`, `render-bubbles`, `render-bursts`, `render-hud`, `render-pops`) and each writes through the `MatrixGame` cell API; nothing draws to the canvas directly.

When adding a feature, prefer extending the existing per-concern render module rather than introducing a new abstraction layer.

## TypeScript conventions enforced by tsconfig

`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`. Two practical consequences worth knowing up front:

- Indexed access returns `T | undefined`. Existing code asserts with `!` after bounds checks or relies on the `?.` chain — match that style rather than disabling the flag.
- `verbatimModuleSyntax` means type-only imports must use `import type { ... }`. Mixing values and types in a plain `import` will fail typecheck.

## Deploy

Push to `main` → GitHub Actions runs `bun install --frozen-lockfile && bun run build`, then uploads the entire repo (including the freshly built `dist/`) as the Pages artifact. There is no separate publish branch. `CNAME` pins the custom domain.
