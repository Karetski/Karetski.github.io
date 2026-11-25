import type { Component } from '../../../framework/scene/types';
import { state } from '../state';
import { burstDuration } from '../bursts';
import { blendToBg } from '../../../shared/math';

export const burstComponent: Component = {
  paint: ({ cells, theme }) => {
    if (!state.activeBurst) return;
    const pb = state.activeBurst;
    const dur = burstDuration(pb.kind);
    const now = performance.now();
    const elapsed = now - pb.tStart;
    const t = Math.max(0, Math.min(1, elapsed / dur));
    const bg = theme.bgLevel;
    const titleC = theme.title;
    const linkC  = theme.link;

    let baseColor: number[] | readonly number[];
    let fade: number;
    if (pb.kind === 'combo' || pb.kind === 'level') {
      const flashOn = (Math.floor(elapsed / 90) & 1) === 0;
      if (pb.kind === 'level') {
        const accent = theme.vivid[Math.floor(elapsed / 180) % theme.vivid.length]!;
        baseColor = flashOn ? titleC : accent;
      } else {
        baseColor = flashOn ? linkC : titleC;
      }
      if (t < 0.08)      fade = t / 0.08;
      else if (t < 0.7)  fade = 1;
      else               fade = Math.max(0, 1 - (t - 0.7) / 0.3);
    } else {
      baseColor = elapsed < 140 ? titleC : pb.color;
      fade = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
    }
    const color = blendToBg(baseColor, fade, bg);

    const text = pb.text.length % 2 === 0 ? pb.text + ' ' : pb.text;
    const minCol = state.burstSectLeft + 1;
    const maxCol = state.levelSectLeft - 1;
    const center = (minCol + maxCol) >> 1;
    let startCol = center - (text.length >> 1);
    if (startCol < minCol) startCol = minCol;
    if (startCol + text.length - 1 > maxCol) startCol = maxCol - text.length + 1;
    if (startCol < minCol) startCol = minCol;
    for (let i = 0; i < text.length; i++) {
      const col = startCol + i;
      if (col < minCol || col > maxCol) continue;
      if (text[i] === ' ') continue;
      cells.put(col, state.lowerInnerRow, text[i]!, color);
    }
  },
};
