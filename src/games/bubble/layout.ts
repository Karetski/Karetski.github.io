import { state, requireM } from './state';

export const sectionWidths = (totalW: number, count: number): number[] => {
  const base = Math.floor((totalW + count - 1) / count);
  const rem  = totalW + (count - 1) - base * count;
  const out  = new Array<number>(count).fill(base);
  for (let i = 0; i < rem; i++) out[i] = (out[i] ?? base) + 1;
  return out;
};

export const computeLayout = (): void => {
  const M = requireM(state);
  state.cols = M.cols;
  state.rows = M.rows;
  state.cellW = M.cellW;
  state.cellH = M.cellH;
  state.panelLeft  = M.panelLeft;
  state.panelWidth = M.panelWidth;
  state.panelTop   = M.panelTop;

  // Playfield exactly matches the bottom buttons panel width — same left edge,
  // same right edge, no in-between gaps because slots are 1 cell.
  state.slotCols     = state.panelWidth;
  state.startSlotCol = state.panelLeft;
  // Bubbles run flush with the canvas top: HUD + lower status panel sit
  // beneath the playfield instead of above it.
  state.startSlotRow = 0;

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

  // Status row: bursts in the left section, persistent level readout in
  // the right section. The status divider is locked to the HUD's score
  // divider column so the merged panel reads as a single grid — the shared
  // mid-row gets a clean ╬ junction at that column.
  const widths = sectionWidths(state.panelWidth, 3);
  state.burstSectLeft = state.panelLeft;
  state.levelSectLeft = state.panelLeft + widths[0]! - 1 + widths[1]! - 1;
  state.burstSectW    = state.levelSectLeft - state.panelLeft + 1;
  state.levelSectW    = state.panelLeft + state.panelWidth - state.levelSectLeft;
  state.lowerInnerRow = hudTop + 3;

  // Tell the matrix to render the playable rectangle's symbol-animation at
  // a higher opacity so the field reads "lit" against the faded outside.
  M.setPlayfieldBounds({
    col: state.startSlotCol,
    row: 0,
    width: state.slotCols,
    height: hudTop,
  });
};
