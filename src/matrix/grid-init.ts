import { FONT_FAMILY, FONT_PX, LINE_HEIGHT, SAT_LEVELS } from './constants';
import { state, type Cell } from './state';
import { applyBrightness, getColorStr, getPalette, randChar } from './palette';
import { sampleColorIndex } from './noise';
import { computeVisibility } from './cells';
import { getThemeColors } from './theme';
import { hash3 } from '../shared/math';
import type { CRTPipeline } from './crt';

export interface GridMetrics {
  W: number;
  H: number;
  naturalCellW: number;
}

export const initGrid = (crt: CRTPipeline): GridMetrics => {
  const { gctx, gridCanvas, screenCanvas } = crt;
  document.documentElement.classList.toggle('light', state.isLightMode);
  state.dpr = window.devicePixelRatio || 1;

  gctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
  gctx.textBaseline = 'middle';
  const m = gctx.measureText('M');
  const naturalCellW = m.width;
  const ink = gctx.measureText('MgyjpqWf|/');
  const aboveMid = ink.actualBoundingBoxAscent || FONT_PX * 0.5;
  const belowMid = ink.actualBoundingBoxDescent || FONT_PX * 0.5;
  state.cellW = Math.max(8, Math.ceil(naturalCellW));
  state.cellH = Math.max(10, Math.ceil(Math.max(FONT_PX * LINE_HEIGHT, 2 * Math.max(aboveMid, belowMid))));

  const W = window.innerWidth;
  const H = window.innerHeight;

  gridCanvas.width = W;
  gridCanvas.height = H;
  screenCanvas.width = Math.floor(W * state.dpr);
  screenCanvas.height = Math.floor(H * state.dpr);
  screenCanvas.style.width = W + 'px';
  screenCanvas.style.height = H + 'px';

  gctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
  gctx.textBaseline = 'middle';
  const theme = getThemeColors();
  gctx.fillStyle = theme.bg;
  gctx.fillRect(0, 0, W, H);

  state.cols = Math.floor(W / state.cellW);
  state.rows = Math.floor(H / state.cellH);

  const now = performance.now();
  const palette = getPalette();
  const cx0 = W * 0.5;
  const cy0 = H * 0.5;
  const maxR = Math.max(1, Math.hypot(cx0, cy0));
  const cells: Cell[] = new Array(state.cols * state.rows);
  for (let i = 0; i < cells.length; i++) {
    const r = (i / state.cols) | 0;
    const c = i - r * state.cols;
    const colorIndex = sampleColorIndex(c, r, now);
    const color = applyBrightness(palette[colorIndex]!);
    const px = c * state.cellW + state.cellW * 0.5;
    const py = r * state.cellH + state.cellH * 0.5;
    const distNorm = Math.min(1, Math.hypot(px - cx0, py - cy0) / maxR);
    const noise = (hash3(c, r, 31) - 0.5) * 2;
    cells[i] = {
      char: randChar(colorIndex),
      locked: false,
      color,
      colorStr: getColorStr(color),
      heat: 0,
      dirty: true,
      colorIndex,
      flipTime: now,
      satLevel: SAT_LEVELS,
      distNorm,
      fadeNoise: noise,
      visibility: computeVisibility(distNorm, noise),
    };
  }
  state.cells = cells;

  return { W, H, naturalCellW };
};
