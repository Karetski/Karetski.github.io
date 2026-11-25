import type { MatrixConfig } from './types';

export const defaultConfig: MatrixConfig = {
  flipRate: 0.012,
  flipVariation: 0.35,
  noiseScale: 0.18,
  noiseSpeed: 0.6,
  colorNoiseScale: 0.06,
  colorNoiseSpeed: 0.18,
  colorBias: 0.25,
  brightnessVar: 0,
  agingHalfLife: 2.5,
  agingFloor: 0.45,
  centerFade: 0.85,
  centerFadeNoise: 0.22,

  chromaticAberration: 0.0035,
  saturation: 1.12,
  scanlineMin: 0.88,
  scanlineMax: 1.02,
  phosphorMaskAmount: 0.08,
  vignette: 1.0,
  flicker: 0.015,
  bloom: 0,
  bloomRadius: 4.0,
  breathe: 0,

  paletteDark: [
    [255, 215, 0],
    [210, 55, 255],
    [255, 35, 120],
  ],
  paletteLight: [
    [215, 180, 0],
    [150, 35, 220],
    [225, 20, 95],
  ],

  linkDark: [70, 130, 255],
  linkLight: [0, 0, 230],
};

export const cloneConfig = (c: MatrixConfig): MatrixConfig =>
  JSON.parse(JSON.stringify(c)) as MatrixConfig;
