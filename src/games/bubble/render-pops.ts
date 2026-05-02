import { POP_DURATION_MS } from './constants';
import { state, requireM } from './state';
import { blendToBg } from '../../shared/math';
import type { WriteBuf } from './render-bubbles';

export const renderPops = (buf: WriteBuf): void => {
  if (!state.popping.length) return;
  const M = requireM();
  const now = performance.now();
  const isLight = M.isLight;
  const bg = isLight ? 255 : 0;
  const titleC = M.titleColor();

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
        baseColor = phase ? titleC : M.vividColor(pc.colorIdx);
        glyph = t < 0.55 ? '✦' : t < 0.8 ? '◇' : '·';
        fadeMul = t < 0.7 ? 1 : Math.max(0, (1 - t) / 0.3);
      }
      const color = blendToBg(baseColor, fadeMul, bg);
      const k = pc.col + ',' + pc.row;
      if (!buf.bubbleKeys.has(k)) buf.put(pc.col, pc.row, glyph, color);
    } else {
      const drawRow = pc.row + Math.floor(t * 3);
      const fade = 1 - t;
      const color = blendToBg(M.vividColor(pc.colorIdx), fade, bg);
      const k = pc.col + ',' + drawRow;
      if (!buf.bubbleKeys.has(k)) buf.put(pc.col, drawRow, pc.char, color);
    }
  }
};
