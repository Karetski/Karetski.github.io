import type { Component } from '../../../framework/scene/types';
import { POP_DURATION_MS } from '../constants';
import { state } from '../state';
import { blendToBg } from '../../../shared/math';

export const popComponent: Component = {
  paint: ({ cells, theme }) => {
    if (!state.popping.length) return;
    const now = performance.now();
    const bg = theme.bgLevel;
    const titleC = theme.title;

    for (let p = 0; p < state.popping.length; p++) {
      const pc = state.popping[p]!;
      const elapsed = now - pc.tStart;
      const t = Math.max(0, Math.min(1, elapsed / POP_DURATION_MS));

      if (pc.kind === 'match') {
        let glyph: string, baseColor: number[] | readonly number[], fadeMul: number;
        if (elapsed < 110) {
          glyph = '✶';
          baseColor = titleC;
          fadeMul = 1;
        } else {
          const phase = (Math.floor(elapsed / 70) & 1) === 0;
          baseColor = phase ? titleC : theme.vivid[pc.colorIdx]!;
          glyph = t < 0.55 ? '✦' : t < 0.8 ? '◇' : '·';
          fadeMul = t < 0.7 ? 1 : Math.max(0, (1 - t) / 0.3);
        }
        const color = blendToBg(baseColor, fadeMul, bg);
        cells.put(pc.col, pc.row, glyph, color);
      } else {
        const drawRow = pc.row + Math.floor(t * 3);
        const fade = 1 - t;
        const color = blendToBg(theme.vivid[pc.colorIdx]!, fade, bg);
        cells.put(pc.col, drawRow, pc.char, color);
      }
    }
  },
};
