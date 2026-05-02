import type { MatrixGame, PlayfieldBounds, RGB } from '../shared/types';
import { COL_TITLE, NUM_COLORS, SAT_LEVELS } from './constants';
import { state } from './state';
import { isInPlayfield, setBounds } from './playfield';
import { applyBrightness, getColorStr, getPalette, getVividPalette, randChar } from './palette';
import { setLocked, setUnlocked } from './cells';
import { getThemeColors } from './theme';
import { flashBackground } from './flash';

export const createMatrixGame = (): MatrixGame => ({
  isPlayMode: state.isPlayMode,
  get cols() { return state.cols; },
  get rows() { return state.rows; },
  get cellW() { return state.cellW; },
  get cellH() { return state.cellH; },
  get isLight() { return state.isLightMode; },
  get panelLeft() { return state.bottomPanelLeft; },
  get panelWidth() { return state.bottomPanelWidth; },
  get panelTop() { return state.bottomPanelTop; },
  numColors: NUM_COLORS,
  vividColor: (i) => Array.from(getVividPalette()[i]!),
  linkColor: () => Array.from(state.isLightMode ? state.config.linkLight : state.config.linkDark),
  titleColor: () => state.isLightMode ? [0, 0, 0] : Array.from(COL_TITLE),
  sepColor: () => Array.from(getThemeColors().sep),
  charFor: (i) => randChar(i),
  setCell: (col, row, char, color) => setLocked(row, col, char, color as RGB),
  clearCell: (col, row) => setUnlocked(row, col),
  isLocked: (col, row) => {
    if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return false;
    return !!state.cells[row * state.cols + col]?.locked;
  },
  setPlayfieldBounds: (b: PlayfieldBounds | null) => {
    setBounds(b);
    if (!state.cells.length) return;
    // Re-color every unlocked cell with the palette that matches its new
    // inside/outside-the-playfield status — without this, cells that
    // haven't flipped yet would keep stale opacity.
    const innerP = getPalette(true);
    const outerP = getPalette(false);
    for (let i = 0; i < state.cells.length; i++) {
      const cell = state.cells[i]!;
      if (cell.locked) { cell.dirty = true; continue; }
      const r = (i / state.cols) | 0;
      const c = i - r * state.cols;
      const inPlay = isInPlayfield(c, r);
      const palette = inPlay ? innerP : outerP;
      cell.color = applyBrightness(palette[cell.colorIndex]!);
      cell.colorStr = getColorStr(cell.color);
      cell.flipTime = performance.now();
      cell.satLevel = SAT_LEVELS;
      cell.dirty = true;
    }
  },
  on: (evt, fn) => {
    state.gameListeners[evt].push(fn);
  },
  flashBackground,
});
