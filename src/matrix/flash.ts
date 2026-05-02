import { state } from './state';
import { smoothstep } from '../shared/math';

// Smooth attack/hold/decay envelope. Smoothstep on each ramp eases the
// transitions so the bg breathes in and out instead of jumping.
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
  // Sum durationMs into the envelope's hold time so combo size scales
  // how long the field lingers vivid; attack and decay stay fixed so
  // the onset feel is consistent across all combos.
  f.hold = Math.max(60, Math.min(700, (durationMs || 250) - f.attack));
  f.start = performance.now();
};
