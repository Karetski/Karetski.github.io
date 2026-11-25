import type { Layout, Region } from '../../framework/layout/types';
import { state } from './state';

export const sectionWidths = (totalW: number, count: number): number[] => {
  const base = Math.floor((totalW + count - 1) / count);
  const rem  = totalW + (count - 1) - base * count;
  const out  = new Array<number>(count).fill(base);
  for (let i = 0; i < rem; i++) out[i] = (out[i] ?? base) + 1;
  return out;
};

// Recomputes derived geometry into `state` and returns the playfield region
// the caller should publish so the matrix-background dampens its palette
// inside it.
export const computeBubbleLayout = (
  layout: Layout,
  panel: Region,
): Region => {
  state.cols  = layout.cols;
  state.rows  = layout.rows;
  state.cellW = layout.cellW;
  state.cellH = layout.cellH;
  state.panelLeft  = panel.col;
  state.panelWidth = panel.width;
  state.panelTop   = panel.row;

  // Playfield perimeter matches the bottom buttons panel width. The two
  // outermost columns are reserved for the visible side walls (closing the
  // outer loop with the HUD frame), so playable slots are panelWidth - 2.
  state.slotCols     = Math.max(0, state.panelWidth - 2);
  state.startSlotCol = state.panelLeft + 1;
  // Bubbles run flush with the top horizontal of the playfield frame: HUD +
  // lower status panel sit beneath the playfield instead of above it.
  state.startSlotRow = 1;

  // One merged 5-row panel sitting directly on top of the bottom-button
  // frame: HUD inner row up top (queue|current|score), shared border with
  // T-junctions, status inner row below it (burst|level). Shooter sits inside
  // the HUD's row exactly like before.
  const centreCol  = state.panelLeft + Math.floor(state.panelWidth / 2);
  const hudTop     = state.panelTop - 5;
  const shooterRow = hudTop + 1;
  state.shooterPx = centreCol * state.cellW + state.cellW / 2;
  state.shooterPy = shooterRow * state.cellH + state.cellH / 2;
  state.dangerY = hudTop * state.cellH;

  state.projectileSpeed = (state.rows * state.cellH) / 1.0;

  const widths = sectionWidths(state.panelWidth, 3);
  state.burstSectLeft = state.panelLeft;
  state.levelSectLeft = state.panelLeft + widths[0]! - 1 + widths[1]! - 1;
  state.burstSectW    = state.levelSectLeft - state.panelLeft + 1;
  state.levelSectW    = state.panelLeft + state.panelWidth - state.levelSectLeft;
  state.lowerInnerRow = hudTop + 3;

  // Region covers the full perimeter (panel width, all rows above the HUD)
  // so the matrix-background's dampened palette extends behind the walls,
  // not just behind the playable slots.
  return {
    col: state.panelLeft,
    row: 0,
    width: state.panelWidth,
    height: hudTop,
  };
};
