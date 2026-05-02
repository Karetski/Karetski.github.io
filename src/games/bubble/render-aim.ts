import { AIM_REACH_CELLS } from './constants';
import { state, requireM } from './state';
import type { WriteBuf } from './render-bubbles';

export const renderAim = (buf: WriteBuf): void => {
  if (state.gameOver || !state.shooter.current) return;
  const M = requireM(state);
  const aimColor = M.vividColor(state.shooter.current.colorIdx);
  const ceilingPx = state.startSlotRow * state.cellH;
  const subW = state.cellW / 2;
  const subH = state.cellH / 4;
  const sampleStep = Math.min(subW, subH) * 0.5;
  const maxLen = AIM_REACH_CELLS * state.cellH;
  const dx = Math.cos(state.shooter.angle);
  const dy = Math.sin(state.shooter.angle);
  const dotBits = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]];
  const masks = new Map<string, number>();
  for (let d = sampleStep; d <= maxLen; d += sampleStep) {
    const px = state.shooterPx + dx * d;
    const py = state.shooterPy + dy * d;
    if (py < ceilingPx) break;
    const col = Math.floor(px / state.cellW);
    const row = Math.floor(py / state.cellH);
    const k = col + ',' + row;
    if (buf.frameKeys.has(k)) continue;
    if (buf.bubbleKeys.has(k)) break;
    if (py >= state.dangerY) continue;
    const sx = Math.min(1, Math.max(0, Math.floor((px - col * state.cellW) / subW)));
    const sy = Math.min(3, Math.max(0, Math.floor((py - row * state.cellH) / subH)));
    masks.set(k, (masks.get(k) ?? 0) | dotBits[sx]![sy]!);
  }
  for (const [k, mask] of masks) {
    if (!mask) continue;
    const ix = k.indexOf(',');
    const col = +k.slice(0, ix);
    const row = +k.slice(ix + 1);
    buf.put(col, row, String.fromCharCode(0x2800 + mask), aimColor);
  }
};
