import type { RGB } from '../shared/types';
import { COL_TITLE, COL_FRAME } from './constants';
import { state } from './state';

export interface ThemeColors {
  bg: string;
  bgRGB: RGB;
  title: RGB | number[];
  link: RGB | number[];
  frame: RGB | number[];
  sep: RGB;
}

export const getThemeColors = (): ThemeColors => {
  if (state.isLightMode) {
    return {
      bg: '#fff',
      bgRGB: [255, 255, 255],
      title: [0, 0, 0],
      link: state.config.linkLight,
      frame: [0, 0, 0],
      sep: [180, 180, 180],
    };
  }
  return {
    bg: '#000',
    bgRGB: [0, 0, 0],
    title: COL_TITLE,
    link: state.config.linkDark,
    frame: COL_FRAME,
    sep: [80, 80, 80],
  };
};
