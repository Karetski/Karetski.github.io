import { state, requireM } from './state';

const slotToCell = (i: number, j: number) => ({
  col: state.startSlotCol + i,
  row: state.startSlotRow + j,
});

export interface WriteBuf {
  put(col: number, row: number, char: string, color: number[] | readonly number[]): void;
  bubbleKeys: Set<string>;
  frameKeys: Set<string>;
}

export const renderBubbles = (buf: WriteBuf): void => {
  const M = requireM(state);
  for (let j = 0; j < state.grid.length; j++) {
    for (let i = 0; i < state.slotCols; i++) {
      const cell = state.grid[j]![i];
      if (!cell) continue;
      const c = slotToCell(i, j);
      buf.bubbleKeys.add(c.col + ',' + c.row);
      buf.put(c.col, c.row, cell.char, M.vividColor(cell.colorIdx));
    }
  }
};

export const renderProjectile = (buf: WriteBuf): void => {
  if (!state.projectile) return;
  const M = requireM(state);
  const col = Math.floor(state.projectile.x / state.cellW);
  const row = Math.floor(state.projectile.y / state.cellH);
  buf.put(col, row, state.projectile.char, M.vividColor(state.projectile.colorIdx));
};

export const renderGameOver = (buf: WriteBuf): void => {
  if (!state.gameOver) return;
  const M = requireM(state);
  const link = M.linkColor();
  const msg = `score ${state.score} — click to restart`;
  const startCol = Math.max(0, Math.floor((state.cols - msg.length) / 2));
  const midRow = Math.floor(state.rows / 2);
  for (let i = 0; i < msg.length; i++) {
    buf.put(startCol + i, midRow, msg[i]!, link);
  }
};
