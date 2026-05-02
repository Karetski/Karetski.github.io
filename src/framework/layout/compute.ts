import type { Layout, Region } from './types';

export const FONT_PX = 18;
export const LINE_HEIGHT = 1.0;
export const FONT_FAMILY = "'Sometype Mono', monospace";

export interface ViewportMetrics {
  width: number;
  height: number;
  dpr: number;
}

export const measureCell = (
  ctx: CanvasRenderingContext2D,
): { cellW: number; cellH: number; naturalCellW: number } => {
  ctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  const m = ctx.measureText('M');
  const naturalCellW = m.width;
  const ink = ctx.measureText('MgyjpqWf|/');
  const aboveMid = ink.actualBoundingBoxAscent || FONT_PX * 0.5;
  const belowMid = ink.actualBoundingBoxDescent || FONT_PX * 0.5;
  const cellW = Math.max(8, Math.ceil(naturalCellW));
  const cellH = Math.max(10, Math.ceil(Math.max(FONT_PX * LINE_HEIGHT, 2 * Math.max(aboveMid, belowMid))));
  return { cellW, cellH, naturalCellW };
};

export const computeGridLayout = (
  vp: ViewportMetrics,
  cellMetrics: { cellW: number; cellH: number; naturalCellW: number },
  regions: Map<string, Region> = new Map(),
): Layout => ({
  viewportW: vp.width,
  viewportH: vp.height,
  cellW: cellMetrics.cellW,
  cellH: cellMetrics.cellH,
  naturalCellW: cellMetrics.naturalCellW,
  cols: Math.floor(vp.width / cellMetrics.cellW),
  rows: Math.floor(vp.height / cellMetrics.cellH),
  dpr: vp.dpr,
  regions,
});

export const withRegions = (base: Layout, regions: Map<string, Region>): Layout => ({
  ...base,
  regions,
});
