import type { RGB } from '../../shared/types';
import type { CellBuffer } from '../renderer/cell-buffer';

export const FRAME_CHARS = {
  tl: '╔', tr: '╗', bl: '╚', br: '╝',
  h:  '═', v:  '║',
} as const;

// Draws a double-lined box with `color` borders and `bg` (space) inside.
export const drawFrame = (
  cells: CellBuffer,
  top: number,
  left: number,
  w: number,
  h: number,
  color: RGB | number[],
): void => {
  for (let c = 0; c < w; c++) {
    let topCh: string, botCh: string;
    if (c === 0) { topCh = FRAME_CHARS.tl; botCh = FRAME_CHARS.bl; }
    else if (c === w - 1) { topCh = FRAME_CHARS.tr; botCh = FRAME_CHARS.br; }
    else { topCh = FRAME_CHARS.h; botCh = FRAME_CHARS.h; }
    cells.put(left + c, top, topCh, color);
    cells.put(left + c, top + h - 1, botCh, color);
  }
  for (let r = 1; r < h - 1; r++) {
    cells.put(left, top + r, FRAME_CHARS.v, color);
    cells.put(left + w - 1, top + r, FRAME_CHARS.v, color);
  }
  for (let r = 1; r < h - 1; r++) {
    for (let c = 1; c < w - 1; c++) {
      cells.put(left + c, top + r, ' ', color);
    }
  }
};

// Horizontal divider bar that joins into the surrounding frame's verticals.
export const drawSeparator = (
  cells: CellBuffer,
  row: number,
  left: number,
  w: number,
  frameColor: RGB | number[],
  sepColor: RGB | number[],
): void => {
  cells.put(left, row, '╠', frameColor);
  for (let c = 0; c < w - 2; c++) {
    cells.put(left + 1 + c, row, '═', sepColor);
  }
  cells.put(left + w - 1, row, '╣', frameColor);
};
