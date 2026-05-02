import type { RGB } from '../shared/types';
import { CHARSETS, PLAY_BG_OPACITY_FADED, PLAY_BG_SAT } from './constants';
import { state } from './state';
import { desaturate, dimToBg } from '../shared/math';

export const getColorStr = (color: RGB | number[]): string => {
  const key = ((color[0]! | 0) << 16) | ((color[1]! | 0) << 8) | (color[2]! | 0);
  let s = state.colorStrCache.get(key);
  if (s) return s;
  s = `rgb(${color[0]! | 0},${color[1]! | 0},${color[2]! | 0})`;
  state.colorStrCache.set(key, s);
  return s;
};

export const resetColorCache = (): void => {
  state.colorStrCache = new Map();
};

export const randChar = (colorIndex: number): string => {
  const set = CHARSETS[colorIndex] ?? CHARSETS[0]!;
  return set[(Math.random() * set.length) | 0]!;
};

const themeBg = (): number => (state.isLightMode ? 255 : 0);

export const getPalette = (inPlay = false): (RGB | number[])[] => {
  const base = state.isLightMode ? state.config.paletteLight : state.config.paletteDark;
  if (!inPlay) return base.map((c) => c.slice());
  const op = PLAY_BG_OPACITY_FADED;
  const bg = themeBg();
  return base.map((c) => dimToBg(desaturate(c, PLAY_BG_SAT), op, bg));
};

export const getVividPalette = (): readonly RGB[] =>
  state.isLightMode ? state.config.paletteLight : state.config.paletteDark;

export const applyBrightness = (color: RGB | number[]): number[] => {
  if (state.config.brightnessVar <= 0) return Array.from(color);
  const b = 1 - Math.random() * state.config.brightnessVar;
  return [
    Math.round(color[0]! * b),
    Math.round(color[1]! * b),
    Math.round(color[2]! * b),
  ];
};
