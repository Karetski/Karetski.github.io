import type { RGB } from '../../shared/types';

export type ThemeMode = 'light' | 'dark';

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

export interface ThemeSnapshot {
  mode: ThemeMode;
  isLight: boolean;
  bg: string;
  bgLevel: number;
  title: RGB | number[];
  link: RGB | number[];
  frame: RGB | number[];
  sep: RGB;
  vivid: readonly RGB[];
  config: MatrixConfig;
}
