import { state, emit } from './state';
import { initGrid } from './grid-init';
import { applyPanelFrames } from './panel-frame';
import { setupPanelDOM } from './panel-dom';
import { applyBrightness, getColorStr, getPalette, resetColorCache } from './palette';
import type { CRTPipeline } from './crt';

let lastGeometryKey: string | null = null;

const refreshAfterSoftPass = (): void => {
  resetColorCache();
  const pb = state.playfieldBounds;
  const outerPalette = getPalette(false);
  const innerPalette = pb ? getPalette(true) : outerPalette;
  for (let i = 0; i < state.cells.length; i++) {
    const cell = state.cells[i]!;
    cell.dirty = true;
    if (cell.locked) continue;
    const r = (i / state.cols) | 0;
    const c = i - r * state.cols;
    const inPlay = !!(pb && r >= pb.row && r < pb.row + pb.height && c >= pb.col && c < pb.col + pb.width);
    const pick = inPlay ? innerPalette : outerPalette;
    cell.color = applyBrightness(pick[cell.colorIndex]!);
    cell.colorStr = getColorStr(cell.color);
  }
};

export const setupGrid = (crt: CRTPipeline): void => {
  const prevKey = lastGeometryKey;
  const { W, H, naturalCellW } = initGrid(crt, prevKey);
  const geometryKey = `${state.cellW}:${state.cellH}:${state.cols}:${state.rows}`;
  const geometryChanged = geometryKey !== prevKey;
  lastGeometryKey = geometryKey;

  if (!geometryChanged && prevKey !== null) {
    refreshAfterSoftPass();
  }

  const panel = applyPanelFrames(W, H);
  setupPanelDOM(panel, naturalCellW, () => setupGrid(crt));
  crt.resize();

  if (geometryChanged) {
    emit('regrid');
  } else {
    emit('theme-change');
  }
};
