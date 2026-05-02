import type { RGB } from '../shared/types';
import { state } from './state';
import { smoothstep } from '../shared/math';

export interface FlashRenderParams {
  active: boolean;
  cleanup: boolean;
  baseP: readonly [RGB, RGB, RGB] | null;
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

export const consumeFlashRenderParams = (): FlashRenderParams => {
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
