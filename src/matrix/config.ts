import type { RGB } from '../shared/types';

export interface MatrixConfig {
  flipRate: number;
  flipVariation: number;
  noiseScale: number;
  noiseSpeed: number;
  colorNoiseScale: number;
  colorNoiseSpeed: number;
  colorBias: number;
  brightnessVar: number;
  agingHalfLife: number;
  centerFade: number;
  centerFadeNoise: number;
  livenessFloor: number;

  chromaticAberration: number;
  saturation: number;
  scanlineMin: number;
  scanlineMax: number;
  phosphorMaskAmount: number;
  vignette: number;
  flicker: number;
  bloom: number;
  bloomRadius: number;
  breathe: number;

  paletteDark: [RGB, RGB, RGB];
  paletteLight: [RGB, RGB, RGB];
  linkDark: RGB;
  linkLight: RGB;
}

export const defaultConfig: MatrixConfig = {
  flipRate: 0.025,
  flipVariation: 0.35,
  noiseScale: 0.18,
  noiseSpeed: 0.6,
  colorNoiseScale: 0.06,
  colorNoiseSpeed: 0.18,
  colorBias: 0.25,
  brightnessVar: 0,
  agingHalfLife: 2.5,
  centerFade: 0.85,
  centerFadeNoise: 0.22,
  livenessFloor: 0.08,

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

export const playProfile: Partial<MatrixConfig> = {
  noiseSpeed: 0.2,
  colorNoiseSpeed: 0.06,
  flipVariation: 0.2,
  livenessFloor: 0,
};
