import type { RGB } from '../../shared/types';
import { desaturate, dimToBg } from '../../shared/math';

export const PLAY_BG_SAT = 0.05;
export const PLAY_BG_OPACITY_VISIBLE = 0.55;
export const PLAY_BG_OPACITY_FADED = 0.32;

export const NUM_BACKGROUND_COLORS = 3;

export const dampenedPalette = (
  base: readonly RGB[],
  bgLevel: number,
  inPlay: boolean,
): number[][] => {
  const op = inPlay ? PLAY_BG_OPACITY_FADED : PLAY_BG_OPACITY_VISIBLE;
  return base.map((c) => dimToBg(desaturate(c, PLAY_BG_SAT), op, bgLevel));
};

export const lerpPalette = (
  toward: readonly RGB[],
  from: readonly (number[] | RGB)[],
  t: number,
): number[][] =>
  from.map((d, i) => [
    d[0]! + (toward[i]![0] - d[0]!) * t,
    d[1]! + (toward[i]![1] - d[1]!) * t,
    d[2]! + (toward[i]![2] - d[2]!) * t,
  ]);

export const applyBrightness = (
  color: readonly number[],
  brightnessVar: number,
): number[] => {
  if (brightnessVar <= 0) return Array.from(color);
  const b = 1 - Math.random() * brightnessVar;
  return [
    Math.round(color[0]! * b),
    Math.round(color[1]! * b),
    Math.round(color[2]! * b),
  ];
};

const colorStrCache = new Map<number, string>();

export const colorToStr = (color: readonly number[]): string => {
  const key = ((color[0]! | 0) << 16) | ((color[1]! | 0) << 8) | (color[2]! | 0);
  let s = colorStrCache.get(key);
  if (s) return s;
  s = `rgb(${color[0]! | 0},${color[1]! | 0},${color[2]! | 0})`;
  colorStrCache.set(key, s);
  return s;
};

export const resetColorStrCache = (): void => {
  colorStrCache.clear();
};
