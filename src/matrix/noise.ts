import { COLOR_NOISE_Z_STRIDE, NOISE_TIME_BASE } from './constants';
import { state } from './state';
import { noise3 } from '../shared/math';
import { getPalette } from './palette';

// Per-frame flip probability for one cell. Baseline rate everywhere, with
// mild spatial variation so the activity drifts without forming wave fronts.
export const sampleFlipProb = (c: number, r: number, now: number, dt: number): number => {
  const { config } = state;
  const n = noise3(
    c * config.noiseScale,
    r * config.noiseScale,
    now * NOISE_TIME_BASE * config.noiseSpeed,
  );
  const mod = 1 + (n - 0.5) * 2 * config.flipVariation;
  return config.flipRate * Math.max(0, mod) * dt * 0.001;
};

const colorWeights: number[] = [];

// Each palette color has its own noise field (offset on z). On flip, pick
// weighted-randomly across them — dominant fields produce that color most
// often but never exclusively, so boundaries dissolve into a stipple.
export const sampleColorIndex = (c: number, r: number, now: number): number => {
  const { config } = state;
  const palette = getPalette();
  const x = c * config.colorNoiseScale;
  const y = r * config.colorNoiseScale;
  const tBase = now * NOISE_TIME_BASE * config.colorNoiseSpeed;
  let total = 0;
  for (let i = 0; i < palette.length; i++) {
    const w = Math.max(0, noise3(x, y, tBase + COLOR_NOISE_Z_STRIDE * (i + 1)) - config.colorBias);
    colorWeights[i] = w;
    total += w;
  }
  if (total <= 0) return (Math.random() * palette.length) | 0;
  let pick = Math.random() * total;
  for (let i = 0; i < palette.length; i++) {
    pick -= colorWeights[i]!;
    if (pick <= 0) return i;
  }
  return palette.length - 1;
};
