# Shader stage

How the shader layer works and what an effect may assume.

## Model

```
page HTML ── src/site.ts
               ├─ theme: ?theme= → SCHEDULE window → 'base'
               └─ createStage({ canvas, background, logo?, frozenTime? })
                    ├─ background slot: fullscreen, opaque
                    └─ logo slot: drawn over <svg data-stage-logo>
```

- **Effect** (`src/stage/types.ts`): one fragment shader plus its own uniforms. It knows nothing about the page.
- **Theme** (`src/themes/types.ts`): one effect per slot. Seasons and occasions are themes.
- **Schedule** (`src/themes/schedule.ts`): `'MM-DD'` windows in local time, inclusive, may wrap the year; the first match wins.
- **Stage** (`src/stage/stage.ts`): one three.js renderer on one fixed canvas behind the page. It owns sizing, the frame loop, and the prelude uniforms.

The DOM owns layout: the logo slot follows the SVG's on-screen rect. CSS hides that SVG only under `html.gl`, which is set after a successful first frame. Without WebGL, or with a broken shader, the static SVG stays.

## Prelude

Prepended to every effect (`src/stage/glsl/prelude.glsl`):

| | |
|---|---|
| `uTime` | seconds since start; constant when motion is off |
| `uResolution` | drawing-buffer size, device px |
| `uPointer` | pointer, drawing-buffer px, origin bottom-left |
| `uPixelRatio` | device px per CSS px, including adaptive scale |
| `fragColor` | background: opaque; logo: straight alpha |

Also prepended to logo effects (`src/stage/glsl/logo.glsl`):

| | |
|---|---|
| `uLogoBox` | the logo's viewBox on screen, drawing-buffer px |
| `logoUv(px)` | 0..1 within the logo box |
| `logoDistance(px)` | signed distance to the outline, px, negative inside |
| `logoReach()` | how far `logoDistance` is valid; outside effects must fade to 0 by then |

Measure sizes as CSS px × `uPixelRatio`. Shared helpers live in `src/effects/glsl/` and are concatenated in TS, because there is no `#include`.

## Logo

`src/assets/ak.svg` is the canonical mark, straight edges only; `<Logo />` inlines it into each page. On mount the stage parses the inline copy's path (M/L/H/V/Z; curves are rejected), bakes an exact signed distance field once on the GPU, and re-bakes after context loss.

## Performance budget

- One pass per slot. The logo pass covers only the logo box plus `bleed`.
- Device pixel ratio is capped at 2. Adaptive scale steps 1 → 0.75 → 0.5 when frames run over 20 ms, and back up after about 5 s under 17.5 ms (`html[data-render-scale]`).
- Hidden tabs don't render. Reduced motion and `?t=` render a single frame.
- Per-frame JS is constant: one `getBoundingClientRect`, a few uniform writes, one draw.
- Background shaders get at most about 16 value-noise evaluations per pixel, no data-dependent loops, and no feedback buffers.
- three.js is about 140 KB gzipped in one shared chunk, loaded after the page has painted. Seasonal themes are separate chunks.

Not built yet; add only when an effect needs it: a reduced-resolution background target, and frame skipping for slow effects.

## Previewing

`npm run dev`, then `?theme=<id>` and `?t=<seconds>`. `npm run verify` screenshots every theme at a fixed time. A compile error logs `stage: shader compile failed` with the offending line, and the page falls back to the static SVG.
