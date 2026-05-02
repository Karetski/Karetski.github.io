import {
  FRAME_CHARS,
  FRAME_GAP,
  FRAME_PAD,
  LINKS,
  NAV_BACK_LABEL,
  NAV_HOME_HREF,
  NAV_PLAY_HREF,
  NAV_PLAY_LABEL,
  TITLE,
  TOGGLE_DARK_LABEL,
  TOGGLE_LIGHT_LABEL,
} from './constants';
import { state } from './state';
import { setLocked } from './cells';
import { getThemeColors } from './theme';

export interface PanelLayout {
  titleRow: number | null;
  titleStartCol: number | null;
  linkRows: number[];
  linkStartCols: number[];
  navRow: number;
  navStartCol: number;
  navLabel: string;
  navHref: string;
  toggleRow: number;
  toggleStartCol: number;
  toggleLabel: string;
}

const drawFrame = (
  top: number, left: number, w: number, h: number,
  color: number[] | readonly number[],
): void => {
  for (let c = 0; c < w; c++) {
    let topCh: string, botCh: string;
    if (c === 0) { topCh = FRAME_CHARS.tl; botCh = FRAME_CHARS.bl; }
    else if (c === w - 1) { topCh = FRAME_CHARS.tr; botCh = FRAME_CHARS.br; }
    else { topCh = FRAME_CHARS.h; botCh = FRAME_CHARS.h; }
    setLocked(top, left + c, topCh, color);
    setLocked(top + h - 1, left + c, botCh, color);
  }
  for (let r = 1; r < h - 1; r++) {
    setLocked(top + r, left, FRAME_CHARS.v, color);
    setLocked(top + r, left + w - 1, FRAME_CHARS.v, color);
  }
  for (let r = 1; r < h - 1; r++) {
    for (let c = 1; c < w - 1; c++) {
      setLocked(top + r, left + c, ' ', color);
    }
  }
};

export const applyPanelFrames = (W: number, H: number): PanelLayout => {
  const theme = getThemeColors();
  const toggleLabel = state.isLightMode ? TOGGLE_DARK_LABEL : TOGGLE_LIGHT_LABEL;
  const navLabel = state.isPlayMode ? NAV_BACK_LABEL : NAV_PLAY_LABEL;
  const navHref = state.isPlayMode ? NAV_HOME_HREF : NAV_PLAY_HREF;

  const longestLink = Math.max(...LINKS.map((l) => l.label.length));
  const longestButtonLabel = Math.max(
    TOGGLE_DARK_LABEL.length, TOGGLE_LIGHT_LABEL.length,
    NAV_PLAY_LABEL.length, NAV_BACK_LABEL.length,
  );
  const titleNaturalW = TITLE.length + 2 * FRAME_PAD + 2;
  const linksNaturalW = longestLink + 2 * FRAME_PAD + 2;
  const buttonNaturalW = longestButtonLabel + 2 * FRAME_PAD + 2;
  const stackW = Math.max(titleNaturalW, linksNaturalW, buttonNaturalW);
  const stackInteriorW = stackW - 2;

  const titleFrameH = 3;
  const linkFrameH = LINKS.length * 2 + 1;
  const buttonFrameH = 5;

  const stackLeft = Math.floor((state.cols - stackW) / 2);

  let totalH: number, groupTop: number;
  if (state.isPlayMode) {
    totalH = buttonFrameH;
    groupTop = state.rows - buttonFrameH;
  } else {
    totalH = titleFrameH + FRAME_GAP + linkFrameH + FRAME_GAP + buttonFrameH;
    groupTop = Math.floor((state.rows - totalH) / 2);
  }

  state.panelRect.x = (stackLeft * state.cellW) / W;
  state.panelRect.z = ((stackLeft + stackW) * state.cellW) / W;
  state.panelRect.y = 1 - ((groupTop + totalH) * state.cellH) / H;
  state.panelRect.w = 1 - (groupTop * state.cellH) / H;

  let titleFrameTop: number | null = null;
  let titleRow: number | null = null;
  let titleStartCol: number | null = null;
  let linkFrameTop: number | null = null;
  const linkRows: number[] = [];
  const linkStartCols: number[] = [];
  let buttonFrameTop: number;

  if (state.isPlayMode) {
    buttonFrameTop = groupTop;
  } else {
    titleFrameTop = groupTop;
    titleRow = titleFrameTop + 1;
    titleStartCol = stackLeft + 1 + Math.floor((stackInteriorW - TITLE.length) / 2);

    drawFrame(titleFrameTop, stackLeft, stackW, titleFrameH, theme.frame);
    for (let i = 0; i < TITLE.length; i++) {
      setLocked(titleRow, titleStartCol + i, TITLE[i]!, theme.title);
    }

    linkFrameTop = titleFrameTop + titleFrameH + FRAME_GAP;
    drawFrame(linkFrameTop, stackLeft, stackW, linkFrameH, theme.frame);

    for (let li = 0; li < LINKS.length; li++) {
      const link = LINKS[li]!;
      const linkRow = linkFrameTop + 1 + li * 2;
      const startCol = stackLeft + 1 + Math.floor((stackInteriorW - link.label.length) / 2);
      linkRows.push(linkRow);
      linkStartCols.push(startCol);

      for (let i = 0; i < link.label.length; i++) {
        setLocked(linkRow, startCol + i, link.label[i]!, theme.link);
      }

      if (li < LINKS.length - 1) {
        const sepRow = linkRow + 1;
        setLocked(sepRow, stackLeft, '╠', theme.frame);
        for (let c = 0; c < stackInteriorW; c++) {
          setLocked(sepRow, stackLeft + 1 + c, '═', theme.sep);
        }
        setLocked(sepRow, stackLeft + stackW - 1, '╣', theme.frame);
      }
    }

    buttonFrameTop = linkFrameTop + linkFrameH + FRAME_GAP;
  }

  drawFrame(buttonFrameTop, stackLeft, stackW, buttonFrameH, theme.frame);
  state.bottomPanelLeft = stackLeft;
  state.bottomPanelWidth = stackW;
  state.bottomPanelTop = buttonFrameTop;

  const navRow = buttonFrameTop + 1;
  const navStartCol = stackLeft + 1 + Math.floor((stackInteriorW - navLabel.length) / 2);
  for (let i = 0; i < navLabel.length; i++) {
    setLocked(navRow, navStartCol + i, navLabel[i]!, theme.link);
  }

  const buttonSepRow = navRow + 1;
  setLocked(buttonSepRow, stackLeft, '╠', theme.frame);
  for (let c = 0; c < stackInteriorW; c++) {
    setLocked(buttonSepRow, stackLeft + 1 + c, '═', theme.sep);
  }
  setLocked(buttonSepRow, stackLeft + stackW - 1, '╣', theme.frame);

  const toggleRow = buttonSepRow + 1;
  const toggleStartCol = stackLeft + 1 + Math.floor((stackInteriorW - toggleLabel.length) / 2);
  for (let i = 0; i < toggleLabel.length; i++) {
    setLocked(toggleRow, toggleStartCol + i, toggleLabel[i]!, theme.link);
  }

  return {
    titleRow, titleStartCol,
    linkRows, linkStartCols,
    navRow, navStartCol, navLabel, navHref,
    toggleRow, toggleStartCol, toggleLabel,
  };
};
