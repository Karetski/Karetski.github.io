import type { Component } from '../../../framework/scene/types';
import type { RGB } from '../../../shared/types';
import { state } from '../state';
import { drawFrame } from '../../../framework/ui/frame';
import { writeText } from '../../../framework/ui/text';

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
    const lines: Array<{ text: string; color: RGB | number[] }> = [
      { text: 'GAME OVER',          color: theme.title },
      { text: '',                   color: theme.title },
      { text: `score ${state.score}`, color: theme.title },
      { text: `level ${state.level}`, color: theme.title },
      { text: '',                   color: theme.title },
      { text: 'click to restart',   color: theme.link  },
    ];
    let maxLen = 0;
    for (const l of lines) if (l.text.length > maxLen) maxLen = l.text.length;
    const padX = 2;
    const w = maxLen + padX * 2 + 2;
    const h = lines.length + 2;
    const top  = Math.max(0, Math.floor((state.rows - h) / 2));
    const left = Math.max(0, Math.floor((state.cols - w) / 2));
    drawFrame(cells, top, left, w, h, theme.frame);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.text) continue;
      const lineLeft = left + Math.floor((w - line.text.length) / 2);
      writeText(cells, lineLeft, top + 1 + i, line.text, line.color);
    }
  },
};
