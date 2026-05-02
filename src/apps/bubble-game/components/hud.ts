import type { Component } from '../../../framework/scene/types';
import { writeCentered } from '../../../framework/ui/text';
import { state } from '../state';
import { sectionWidths } from '../layout';

export const hudComponent: Component = {
  paint: ({ cells, theme }) => {
    if (state.gameOver) return;
    const frameColor = theme.title;
    const sepColor   = theme.sep;
    const link       = theme.link;

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
      cells.put(col, hudTop, topCh, frameColor);
      cells.put(col, botRow, botCh, frameColor);
    }
    cells.put(currentLeft, hudTop, '╦', frameColor);
    cells.put(scoreLeft,   hudTop, '╦', frameColor);
    cells.put(scoreLeft,   botRow, '╩', frameColor);

    for (let x = 0; x < state.panelWidth; x++) {
      const col = state.panelLeft + x;
      let ch = '═';
      if (x === 0) ch = '╠';
      else if (x === state.panelWidth - 1) ch = '╣';
      cells.put(col, midRow, ch, frameColor);
    }
    cells.put(currentLeft, midRow, '╩', frameColor);
    cells.put(scoreLeft,   midRow, '╬', frameColor);

    for (let x = 0; x < state.panelWidth; x++) {
      const col = state.panelLeft + x;
      cells.put(col, innerRow, ' ', frameColor);
      cells.put(col, lowerRow, ' ', frameColor);
    }
    cells.put(queueLeft,   innerRow, '║', frameColor);
    cells.put(totalRight,  innerRow, '║', frameColor);
    cells.put(currentLeft, innerRow, '║', sepColor);
    cells.put(scoreLeft,   innerRow, '║', sepColor);

    cells.put(state.panelLeft, lowerRow, '║', frameColor);
    cells.put(totalRight,      lowerRow, '║', frameColor);
    cells.put(scoreLeft,       lowerRow, '║', sepColor);

    if (state.shooter.next) {
      writeCentered(cells, queueLeft + Math.floor(queueW / 2), innerRow,
        state.shooter.next.char, theme.vivid[state.shooter.next.colorIdx]!);
    }
    if (state.shooter.current) {
      writeCentered(cells, currentLeft + Math.floor(currentW / 2), innerRow,
        state.shooter.current.char, theme.vivid[state.shooter.current.colorIdx]!);
    }
    const scoreStr = String(state.score);
    const scoreCenter = scoreLeft + Math.floor(scoreW / 2);
    const scoreContentLeft = scoreCenter - Math.floor(scoreStr.length / 2);
    for (let i = 0; i < scoreStr.length; i++) {
      const col = scoreContentLeft + i;
      if (col <= scoreLeft || col >= scoreLeft + scoreW - 1) continue;
      cells.put(col, innerRow, scoreStr[i]!, link);
    }

    const levelStr = 'lv' + state.level;
    const lvCenter = state.levelSectLeft + Math.floor(state.levelSectW / 2);
    const lvStart  = lvCenter - Math.floor(levelStr.length / 2);
    for (let i = 0; i < levelStr.length; i++) {
      const col = lvStart + i;
      if (col <= state.levelSectLeft || col >= totalRight) continue;
      cells.put(col, lowerRow, levelStr[i]!, link);
    }
  },
};
