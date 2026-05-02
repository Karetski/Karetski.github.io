import { state, requireM } from './state';
import { sectionWidths } from './layout';
import type { WriteBuf } from './render-bubbles';

export const renderHud = (buf: WriteBuf): void => {
  if (state.gameOver) return;
  const M = requireM(state);
  const frameColor = M.titleColor();
  const sepColor   = M.sepColor();
  const link       = M.linkColor();

  const hudTop   = state.panelTop - 5;
  const innerRow = hudTop + 1;
  const midRow   = hudTop + 2;
  const lowerRow = hudTop + 3;
  const botRow   = hudTop + 4;
  const widths   = sectionWidths(state.panelWidth, 3);
  const queueW = widths[0]!, currentW = widths[1]!, scoreW = widths[2]!;
  const queueLeft   = state.panelLeft;
  const currentLeft = queueLeft + queueW - 1;
  const scoreLeft   = currentLeft + currentW - 1;
  const totalRight  = state.panelLeft + state.panelWidth - 1;

  for (let x = 0; x < state.panelWidth; x++) {
    const col = state.panelLeft + x;
    let topCh = '═', botCh = '═';
    if (x === 0) { topCh = '╔'; botCh = '╚'; }
    else if (x === state.panelWidth - 1) { topCh = '╗'; botCh = '╝'; }
    buf.put(col, hudTop, topCh, frameColor);
    buf.put(col, botRow, botCh, frameColor);
    buf.frameKeys.add(col + ',' + hudTop);
    buf.frameKeys.add(col + ',' + botRow);
  }
  buf.put(currentLeft, hudTop, '╦', frameColor);
  buf.put(scoreLeft,   hudTop, '╦', frameColor);
  buf.put(scoreLeft,   botRow, '╩', frameColor);

  for (let x = 0; x < state.panelWidth; x++) {
    const col = state.panelLeft + x;
    let ch = '═';
    if (x === 0) ch = '╠';
    else if (x === state.panelWidth - 1) ch = '╣';
    buf.put(col, midRow, ch, frameColor);
    buf.frameKeys.add(col + ',' + midRow);
  }
  buf.put(currentLeft, midRow, '╩', frameColor);
  buf.put(scoreLeft,   midRow, '╬', frameColor);

  for (let x = 0; x < state.panelWidth; x++) {
    const col = state.panelLeft + x;
    buf.put(col, innerRow, ' ', frameColor);
    buf.put(col, lowerRow, ' ', frameColor);
  }
  buf.put(queueLeft,   innerRow, '║', frameColor);
  buf.put(totalRight,  innerRow, '║', frameColor);
  buf.put(currentLeft, innerRow, '║', sepColor);
  buf.put(scoreLeft,   innerRow, '║', sepColor);
  buf.frameKeys.add(queueLeft   + ',' + innerRow);
  buf.frameKeys.add(totalRight  + ',' + innerRow);
  buf.frameKeys.add(currentLeft + ',' + innerRow);
  buf.frameKeys.add(scoreLeft   + ',' + innerRow);

  buf.put(state.panelLeft, lowerRow, '║', frameColor);
  buf.put(totalRight,      lowerRow, '║', frameColor);
  buf.put(scoreLeft,       lowerRow, '║', sepColor);
  buf.frameKeys.add(state.panelLeft + ',' + lowerRow);
  buf.frameKeys.add(totalRight      + ',' + lowerRow);
  buf.frameKeys.add(scoreLeft       + ',' + lowerRow);

  const placeCentred = (sectLeft: number, sectW: number, char: string | undefined, color: number[] | readonly number[]) => {
    if (!char) return;
    const cx = sectLeft + Math.floor(sectW / 2);
    buf.put(cx, innerRow, char, color);
  };
  if (state.shooter.next) {
    placeCentred(queueLeft, queueW, state.shooter.next.char, M.vividColor(state.shooter.next.colorIdx));
  }
  if (state.shooter.current) {
    placeCentred(currentLeft, currentW, state.shooter.current.char, M.vividColor(state.shooter.current.colorIdx));
  }
  const scoreStr        = String(state.score);
  const scoreCenter     = scoreLeft + Math.floor(scoreW / 2);
  const scoreContentLeft = scoreCenter - Math.floor(scoreStr.length / 2);
  for (let i = 0; i < scoreStr.length; i++) {
    const col = scoreContentLeft + i;
    if (col <= scoreLeft || col >= scoreLeft + scoreW - 1) continue;
    buf.put(col, innerRow, scoreStr[i]!, link);
  }

  const levelStr = 'lv' + state.level;
  const lvCenter = state.levelSectLeft + Math.floor(state.levelSectW / 2);
  const lvStart  = lvCenter - Math.floor(levelStr.length / 2);
  for (let i = 0; i < levelStr.length; i++) {
    const col = lvStart + i;
    if (col <= state.levelSectLeft || col >= totalRight) continue;
    buf.put(col, lowerRow, levelStr[i]!, link);
  }
};
