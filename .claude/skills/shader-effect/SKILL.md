---
name: shader-effect
description: Write or change a shader effect for the karetski.com stage — a background effect (fullscreen) or a logo effect (drawn over the AK mark). Use when asked to create, port (e.g. from Shadertoy), tune, or debug a GLSL effect under src/effects/, or when a theme needs a new look.
---

# Shader effect

Read `docs/shaders.md` first. It defines the prelude, the logo helpers, and the budget.

## Write

Add two files under `src/effects/background/` or `src/effects/logo/`: `<name>.frag.glsl`, plus a `<name>.ts` exporting one `Effect`. Copy `background/drift.ts` or `logo/solid.ts`:

```ts
import type { Effect } from '../../stage/types';
import noise from '../glsl/noise.glsl?raw';
import source from './<name>.frag.glsl?raw';

export const <name>: Effect = {
  id: '<slot>-<name>',
  fragment: `${noise}\n${source}`,
  uniforms: { uSpeed: { value: 0.03 } },
};
```

- Don't redeclare prelude symbols.
- Sizes are CSS px × `uPixelRatio`.
- Background effects output opaque color; add `dither(gl_FragCoord.xy)` to smooth gradients.
- Logo effects output straight alpha. For the edge, use `clamp(0.5 - logoDistance(p), 0.0, 1.0)`. Fade outside-distance effects to 0 by `logoReach()`, or small logos show a box.
- Stay grayscale, on the light baseline (pale background, dark logo), unless asked otherwise.
- Reuse chunks in `src/effects/glsl/`. Add a chunk only when a second effect needs it.
- Porting from Shadertoy: `iTime→uTime`, `iResolution.xy→uResolution`, `iMouse.xy→uPointer`, `mainImage→main` writing `fragColor`. Channels and multipass don't exist here; raise it with the user rather than building them.

## Budget checklist

- [ ] ≤ ~16 value-noise evaluations per pixel (background).
- [ ] Loops have constant bounds.
- [ ] No NaN sources: no `pow`/`sqrt`/`log` of a negative, no divide by a value that can reach 0.
- [ ] `uTime` stays precise for hours: keep multipliers small, or wrap with `fract`.
- [ ] No derivatives inside non-uniform branches.
- [ ] Needing a second pass or a render target means changing the stage. Propose it; don't hide it inside an effect.

Then run `hot-path-budget-audit`.

## Verify

1. `npm run typecheck && npm test`.
2. Point a theme at the effect and preview under `npm run dev` with `?theme=<id>`, plus `?t=` for still frames.
3. Run `npm run verify` outside the sandbox and look at `/tmp/claude/verify/theme-<id>.png`.
4. Say what wasn't checked. Headless Chromium renders WebGL in software, so it proves correctness, not speed.
