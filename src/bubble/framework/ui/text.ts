import type { RGB } from '../../shared/types';
import type { CellBuffer } from '../renderer/cell-buffer';

export type TextAlign = 'left' | 'center' | 'right';

export const writeText = (
  cells: CellBuffer,
  col: number,
  row: number,
  text: string,
  color: RGB | number[],
): void => {
  for (let i = 0; i < text.length; i++) {
    cells.put(col + i, row, text[i]!, color);
  }
};

export const writeCentered = (
  cells: CellBuffer,
  centerCol: number,
  row: number,
  text: string,
  color: RGB | number[],
): void => {
  writeText(cells, centerCol - (text.length >> 1), row, text, color);
};
