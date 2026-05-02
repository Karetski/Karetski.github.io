import type { CellBuffer } from '../../framework/renderer/cell-buffer';
import type { ThemeSnapshot } from '../../framework/theme/types';
import { drawFrame, drawSeparator } from '../../framework/ui/frame';
import { writeText } from '../../framework/ui/text';
import { LINKS, TITLE } from './constants';
import type { PanelLayout } from './panel-layout';

export const paintPanel = (
  cells: CellBuffer,
  theme: ThemeSnapshot,
  panel: PanelLayout,
  isPlayMode: boolean,
): void => {
  if (!isPlayMode) {
    if (panel.titleFrameTop !== null && panel.titleRow !== null && panel.titleStartCol !== null) {
      drawFrame(cells, panel.titleFrameTop, panel.stackLeft, panel.stackW, 3, theme.frame);
      writeText(cells, panel.titleStartCol, panel.titleRow, TITLE, theme.title);
    }
    if (panel.linkFrameTop !== null) {
      drawFrame(cells, panel.linkFrameTop, panel.stackLeft, panel.stackW, panel.linkFrameH, theme.frame);
      for (let li = 0; li < LINKS.length; li++) {
        const link = LINKS[li]!;
        writeText(cells, panel.linkStartCols[li]!, panel.linkRows[li]!, link.label, theme.link);
        if (li < LINKS.length - 1) {
          const sepRow = panel.linkRows[li]! + 1;
          drawSeparator(cells, sepRow, panel.stackLeft, panel.stackW, theme.frame, theme.sep);
        }
      }
    }
  }

  drawFrame(cells, panel.buttonFrameTop, panel.stackLeft, panel.stackW, panel.buttonFrameH, theme.frame);
  writeText(cells, panel.navStartCol, panel.navRow, panel.navLabel, theme.link);
  drawSeparator(cells, panel.buttonSepRow, panel.stackLeft, panel.stackW, theme.frame, theme.sep);
  writeText(cells, panel.toggleStartCol, panel.toggleRow, panel.toggleLabel, theme.link);
};
