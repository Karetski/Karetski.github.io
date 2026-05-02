import { NUM_COLORS } from './constants';
import { state, requireM } from './state';
import { burstDuration } from './bursts';
import { blendToBg } from '../../shared/math';
import type { WriteBuf } from './render-bubbles';

export const renderBursts = (buf: WriteBuf): void => {
  if (!state.activeBurst) return;
  const pb = state.activeBurst;
  const M = requireM();
  const dur = burstDuration(pb.kind);
  const now = performance.now();
  const elapsed = now - pb.tStart;
  const t = Math.max(0, Math.min(1, elapsed / dur));
  const isLight = M.isLight;
  const bg = isLight ? 255 : 0;
  const titleC = M.titleColor();
  const linkC  = M.linkColor();

  let baseColor: number[] | readonly number[];
  let fade: number;
  if (pb.kind === 'combo' || pb.kind === 'level') {
    const flashOn = (Math.floor(elapsed / 90) & 1) === 0;
    if (pb.kind === 'level') {
      const accent = M.vividColor(Math.floor(elapsed / 180) % NUM_COLORS);
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
    if (buf.frameKeys.has(col + ',' + state.lowerInnerRow)) continue;
    if (text[i] === ' ') continue;
    buf.put(col, state.lowerInnerRow, text[i]!, color);
  }
};
