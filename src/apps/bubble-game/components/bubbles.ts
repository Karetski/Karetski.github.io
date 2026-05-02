import type { Component } from '../../../framework/scene/types';
import { state } from '../state';

const slotToCell = (i: number, j: number) => ({
  col: state.startSlotCol + i,
  row: state.startSlotRow + j,
});

export const bubblesComponent: Component = {
  paint: ({ cells, theme }) => {
    for (let j = 0; j < state.grid.length; j++) {
      for (let i = 0; i < state.slotCols; i++) {
        const cell = state.grid[j]![i];
        if (!cell) continue;
        const c = slotToCell(i, j);
        cells.put(c.col, c.row, cell.char, theme.vivid[cell.colorIdx]!);
      }
    }
  },
};

export const projectileComponent: Component = {
  paint: ({ cells, theme }) => {
    if (!state.projectile) return;
    const col = Math.floor(state.projectile.x / state.cellW);
    const row = Math.floor(state.projectile.y / state.cellH);
    cells.put(col, row, state.projectile.char, theme.vivid[state.projectile.colorIdx]!);
  },
};

export const gameOverComponent: Component = {
  paint: ({ cells, theme }) => {
    if (!state.gameOver) return;
    const msg = `score ${state.score} — click to restart`;
    const startCol = Math.max(0, Math.floor((state.cols - msg.length) / 2));
    const midRow = Math.floor(state.rows / 2);
    for (let i = 0; i < msg.length; i++) {
      cells.put(startCol + i, midRow, msg[i]!, theme.link);
    }
  },
};
