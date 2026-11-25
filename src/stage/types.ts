import type { IUniform } from 'three';

/**
 * A fragment shader the stage can run in one of its slots. The stage owns the
 * canvas, geometry, frame loop, and the prelude uniforms (see glsl/prelude.glsl
 * and, for the logo slot, glsl/logo.glsl); an effect owns only its pixels.
 */
export interface Effect {
  /** Unique kebab-case id; used as the material name in errors and tooling. */
  readonly id: string;
  /** GLSL ES 3.00 source defining `void main()` that writes `fragColor`. */
  readonly fragment: string;
  /** Effect-owned uniforms with their defaults; cloned per mount. Must not reuse prelude names. */
  readonly uniforms?: Readonly<Record<string, IUniform>>;
  /** Logo slot only: CSS px beyond the logo's box the effect may draw into (glows, particles). */
  readonly bleed?: number;
}
