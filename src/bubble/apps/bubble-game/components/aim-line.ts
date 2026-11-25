import type { Component } from '../../../framework/scene/types';
import { AIM_REACH_CELLS } from '../constants';
import { state } from '../state';

export const aimLineComponent: Component = {
  paint: ({ cells, theme }) => {
    if (state.gameOver || !state.shooter.current) return;
    const aimColor = theme.vivid[state.shooter.current.colorIdx]!;
    const ceilingPx = state.startSlotRow * state.cellH;
    const subW = state.cellW / 2;
    const subH = state.cellH / 4;
    const sampleStep = Math.min(subW, subH) * 0.5;
    const maxLen = AIM_REACH_CELLS * state.cellH;
    const dx = Math.cos(state.shooter.angle);
    const dy = Math.sin(state.shooter.angle);
    const dotBits = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]];

    // Stop the aim line at the first cell currently occupied by a bubble so it
    // doesn't draw through the placed pieces.
    const occupied = new Set<number>();
    for (let j = 0; j < state.grid.length; j++) {
      for (let i = 0; i < state.slotCols; i++) {
        if (!state.grid[j]![i]) continue;
        occupied.add((state.startSlotRow + j) * 1_000_000 + (state.startSlotCol + i));
      }
    }

    const masks = new Map<number, number>();
    for (let d = sampleStep; d <= maxLen; d += sampleStep) {
      const px = state.shooterPx + dx * d;
      const py = state.shooterPy + dy * d;
      if (py < ceilingPx) break;
      const col = Math.floor(px / state.cellW);
      const row = Math.floor(py / state.cellH);
      const key = row * 1_000_000 + col;
      if (occupied.has(key)) break;
      if (py >= state.dangerY) continue;
      const sx = Math.min(1, Math.max(0, Math.floor((px - col * state.cellW) / subW)));
      const sy = Math.min(3, Math.max(0, Math.floor((py - row * state.cellH) / subH)));
      masks.set(key, (masks.get(key) ?? 0) | dotBits[sx]![sy]!);
    }
    for (const [key, mask] of masks) {
      if (!mask) continue;
      const row = (key / 1_000_000) | 0;
      const col = key - row * 1_000_000;
      cells.put(col, row, String.fromCharCode(0x2800 + mask), aimColor);
    }
  },
};
