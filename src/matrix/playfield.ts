import type { PlayfieldBounds } from '../shared/types';
import { state } from './state';

export const getBounds = (): PlayfieldBounds | null => state.playfieldBounds;

export const setBounds = (b: PlayfieldBounds | null): void => {
  state.playfieldBounds = b;
};

export const isInPlayfield = (col: number, row: number): boolean => {
  const b = state.playfieldBounds;
  return !!(b && row >= b.row && row < b.row + b.height
                && col >= b.col && col < b.col + b.width);
};
