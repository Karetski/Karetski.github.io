import { state, requireM } from './state';
import {
  renderBubbles,
  renderGameOver,
  renderProjectile,
  type WriteBuf,
} from './render-bubbles';
import { renderHud } from './render-hud';
import { renderPops } from './render-pops';
import { renderBursts } from './render-bursts';
import { renderAim } from './render-aim';

export const render = (): void => {
  const M = requireM();
  const writes = new Map<string, { char: string; color: number[] | readonly number[] }>();
  const buf: WriteBuf = {
    put: (col, row, char, color) => {
      if (col < 0 || col >= state.cols || row < 0 || row >= state.rows) return;
      writes.set(col + ',' + row, { char, color });
    },
    bubbleKeys: new Set<string>(),
    frameKeys: new Set<string>(),
  };

  renderBubbles(buf);
  renderHud(buf);
  renderPops(buf);
  renderBursts(buf);
  renderAim(buf);
  renderProjectile(buf);
  renderGameOver(buf);

  for (const key of state.lastWritten) {
    if (!writes.has(key)) {
      const ix = key.indexOf(',');
      M.clearCell(+key.slice(0, ix), +key.slice(ix + 1));
    }
  }
  for (const [key, val] of writes) {
    const ix = key.indexOf(',');
    M.setCell(+key.slice(0, ix), +key.slice(ix + 1), val.char, val.color as number[]);
  }
  state.lastWritten = new Set(writes.keys());
};
