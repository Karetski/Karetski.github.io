# Bubble Game Unit Tests — Design

**Date:** 2026-05-01
**Status:** Approved (pending plan)

## Goal

Add unit tests for the bubble game's logic-heavy modules so regressions in the math (matching rules, floating-bubble cleanup, projectile snapping, aim, layout splits) get caught at `bun test` time rather than during manual play or by the Playwright `verify` smoke.

## Non-goals

- No tests for `render-*` modules (visual output is the `verify` smoke's job).
- No tests for `main.ts` or `input.ts` (orchestration + DOM wiring).
- No tests for `state.ts` itself (it's a shape, not behaviour).
- No new linter, no coverage tooling, no Vitest/Jest.
- No matrix-host tests (the contract is exercised through the game).

## Stack

- **Runner:** `bun test` (built into Bun, zero new deps, runs TS natively, Jest-compatible API).
- **Layout:** Co-located `*.test.ts` next to source files. Shared helpers under `tests/helpers/`.
- **CI:** Add `bun test` step in `.github/workflows/deploy.yml` between `bun install` and `bun run build`.

## Refactor strategy: pure read-only + state-as-arg mutators

The bubble game logic currently reaches into the shared `state` singleton from `src/games/bubble/state.ts`. To unit-test cleanly we make a targeted refactor — read-only computations become pure (return values, take inputs explicitly); mutators keep their existing semantics but accept `state` as their first argument so tests can build fixture states. The "single mutable state module" architecture from `CLAUDE.md` stays intact.

### `src/games/bubble/matching.ts`

Read-only → pure:

- `collectMatch(grid, slotCols, i, j) → Array<[number, number]>`
- `collectFloaters(grid, slotCols) → Array<[number, number]>`
- New: `isLose(grid, slotCols, startSlotRow, dangerY, cellH) → boolean`, extracted from `checkLose`.

Mutators → `state` as first arg:

- `popCell(state, i, j, kind)`
- `popGroup(state, cells, kind)`
- `dropFloaters(state)`
- `tickPops(state, now?)` — accept an injectable timestamp for deterministic tests (defaults to `performance.now()`).
- `checkLose(state)` — thin wrapper that calls `isLose(...)` and sets `state.gameOver`.

### `src/games/bubble/physics.ts`

Extract pure helpers:

- `aimAngle(pointerX, pointerY, shooterPx, shooterPy) → number`
- `reflectX(x, vx, leftBound, rightBound) → { x: number; vx: number }`
- `findSnapSlot(grid, slotCols, projX, projY, startSlotCol, startSlotRow, cellW, cellH) → [number, number] | null`

Mutators → `state` as first arg:

- `updateAim(state)`
- `fire(state)`
- `tick(state, dt, now?)`

### `src/games/bubble/bubbles.ts`

RNG injection:

- `makeBubble(rng?: () => number) → Bubble`
- `randomRow(fill, slotCols, rng?: () => number) → Array<Bubble | null>`

Mutators → `state` as first arg:

- `ensureRow(state, j)`
- `reset(state)`
- `descend(state)`
- `refillIfEmpty(state) → boolean`

### Already pure — no refactor

- `src/shared/math.ts` (all functions)
- `src/games/bubble/layout.ts` `sectionWidths(totalW, count)` (the surrounding `computeLayout()` stays as a state mutator and is not unit-tested)

### Call-site updates

`main.ts`, the remaining physics/matching internals, and any other callers must pass `state` (or `state.grid`, `state.slotCols`, etc.) explicitly. Behaviour is unchanged.

## Test fixtures

Two helpers under `tests/helpers/`:

- `make-state.ts` — `makeState(overrides?: Partial<GameState>) → GameState`. Returns a `GameState` with sensible geometry defaults (small grid, deterministic shooter position, empty `grid: GameGrid`, empty `popping`/`activeBurst`, score/level zeroed). Tests pass overrides for the bits they care about.
- `seeded-rng.ts` — `mulberry32(seed) → () => number`. Tiny deterministic RNG for `makeBubble`/`randomRow` tests.

These live in `tests/helpers/` rather than co-located because they're shared.

## Coverage plan (~50 tests)

| File | Tests | What it covers |
|---|---:|---|
| `src/shared/math.test.ts` | ~8 | `fade`/`smoothstep`/`smoothstep01` boundaries (0, 1, midpoint); `desaturate`/`dimToBg`/`blendToBg` channel arithmetic; `noise3` determinism (same input ⇒ same output) and approximate range. |
| `src/games/bubble/layout.test.ts` | ~5 | `sectionWidths`: `count=1` returns `[totalW]`; `totalW=0` returns zeros; even split; uneven split distributes remainder; `count > totalW` doesn't crash. |
| `src/games/bubble/matching.test.ts` | ~18 | `collectMatch`: empty cell ⇒ `[]`; lone bubble ⇒ `[]`; horizontal run of identical chars ≥2 ⇒ all popped; vertical run; cluster-of-3+ same-color rule; mixed run+cluster (no double-count); grid-edge cell. `collectFloaters`: chain anchored to top stays; chain disconnected from top floats; all-floating; empty grid. `popCell` mutates `popping` and clears the slot; `popGroup` returns averaged centroid. `isLose` true when bubble crosses `dangerY`, false otherwise. |
| `src/games/bubble/physics.test.ts` | ~12 | `aimAngle`: straight up, 45°, clamping at horizon. `reflectX`: bounce left wall, bounce right wall, no bounce mid-field, sign of `vx` flips. `findSnapSlot`: direct hit on empty cell, near-miss snaps to nearest empty neighbour, slot already occupied returns `null`, projectile far from grid returns `null`. |
| `src/games/bubble/bubbles.test.ts` | ~7 | `makeBubble(seededRng)` produces stable bubble; colorIdx within palette, char within charset. `randomRow(fill, slotCols, seededRng)` length matches `slotCols`, non-null count is approximately `fill * slotCols`. `ensureRow(state, j)` extends `state.grid` to length `j+1`. `reset(state)` zeroes score, sets level to 1, clears grid. `refillIfEmpty(state)` returns true when projectile/current is empty and refills. |

## Sequencing

The refactor lands first (mechanical, no behaviour change, verified by `bun run typecheck` + `bun run verify`), then the tests come on top. The implementation plan should split it that way so a regression in the refactor is identifiable independently of test additions.

## Risk

- **Refactor regressions.** Mitigated by `bun run verify` covering the integration path; the refactor passes if `verify` still passes.
- **Time-dependent code (`performance.now()` in pop/burst tweens).** Solved by the optional `now?` arg on `tickPops` / `tick` — tests pass a fixed timestamp.
- **Math.random in `bubbles.ts`.** Solved by RNG injection.
