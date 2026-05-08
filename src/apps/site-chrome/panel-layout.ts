import type { Layout } from '../../framework/layout/types';
import {
  FRAME_GAP, FRAME_PAD,
  LINKS, NAV_BACK_LABEL, NAV_HOME_HREF, NAV_PLAY_HREF, NAV_PLAY_LABEL,
  TITLE, TOGGLE_DARK_LABEL, TOGGLE_LIGHT_LABEL,
} from './constants';

export interface PanelLayout {
  stackLeft: number;
  stackW: number;
  groupTop: number;
  totalH: number;

  titleFrameTop: number | null;
  titleRow: number | null;
  titleStartCol: number | null;

  linkFrameTop: number | null;
  linkFrameH: number;
  linkRows: number[];
  linkStartCols: number[];

  mergedButtons: boolean;
  navFrameTop: number;
  navFrameH: number;
  navRow: number;
  navStartCol: number;
  navLabel: string;
  navHref: string;
  buttonSepRow: number;
  toggleFrameTop: number;
  toggleFrameH: number;
  toggleRow: number;
  toggleStartCol: number;
  toggleLabel: string;
}

export interface PanelInputs {
  isLight: boolean;
  isPlayMode: boolean;
}

export const computePanelLayout = (layout: Layout, inputs: PanelInputs): PanelLayout => {
  const { cols, rows } = layout;

  const toggleLabel = inputs.isLight ? TOGGLE_DARK_LABEL : TOGGLE_LIGHT_LABEL;
  const navLabel    = inputs.isPlayMode ? NAV_BACK_LABEL : NAV_PLAY_LABEL;
  const navHref     = inputs.isPlayMode ? NAV_HOME_HREF : NAV_PLAY_HREF;

  const longestLink = Math.max(...LINKS.map((l) => l.label.length));
  const longestButtonLabel = Math.max(
    TOGGLE_DARK_LABEL.length, TOGGLE_LIGHT_LABEL.length,
    NAV_PLAY_LABEL.length, NAV_BACK_LABEL.length,
  );
  const titleNaturalW  = TITLE.length + 2 * FRAME_PAD + 2;
  const linksNaturalW  = longestLink + 2 * FRAME_PAD + 2;
  const buttonNaturalW = longestButtonLabel + 2 * FRAME_PAD + 2;
  const stackW = Math.max(titleNaturalW, linksNaturalW, buttonNaturalW);
  const stackInteriorW = stackW - 2;

  const mergedButtons = inputs.isPlayMode;
  const titleFrameH  = 3;
  const linkFrameH   = LINKS.length * 2 + 1;
  const navFrameH    = 3;
  const toggleFrameH = 3;
  const mergedButtonsH = 5;

  const stackLeft = Math.floor((cols - stackW) / 2);

  let totalH: number, groupTop: number;
  if (inputs.isPlayMode) {
    totalH = mergedButtonsH;
    groupTop = rows - totalH;
  } else {
    totalH = titleFrameH + FRAME_GAP + linkFrameH + FRAME_GAP + navFrameH + FRAME_GAP + toggleFrameH;
    groupTop = Math.floor((rows - totalH) / 2);
  }

  let titleFrameTop: number | null = null;
  let titleRow: number | null = null;
  let titleStartCol: number | null = null;
  let linkFrameTop: number | null = null;
  const linkRows: number[] = [];
  const linkStartCols: number[] = [];
  let navFrameTop: number;

  if (inputs.isPlayMode) {
    navFrameTop = groupTop;
  } else {
    titleFrameTop = groupTop;
    titleRow = titleFrameTop + 1;
    titleStartCol = stackLeft + 1 + Math.floor((stackInteriorW - TITLE.length) / 2);

    linkFrameTop = titleFrameTop + titleFrameH + FRAME_GAP;
    for (let li = 0; li < LINKS.length; li++) {
      const link = LINKS[li]!;
      const linkRow = linkFrameTop + 1 + li * 2;
      const startCol = stackLeft + 1 + Math.floor((stackInteriorW - link.label.length) / 2);
      linkRows.push(linkRow);
      linkStartCols.push(startCol);
    }
    navFrameTop = linkFrameTop + linkFrameH + FRAME_GAP;
  }

  const navRow = navFrameTop + 1;
  const navStartCol = stackLeft + 1 + Math.floor((stackInteriorW - navLabel.length) / 2);
  const buttonSepRow = navRow + 1;
  const toggleFrameTop = mergedButtons
    ? navFrameTop
    : navFrameTop + navFrameH + FRAME_GAP;
  const toggleRow = mergedButtons ? buttonSepRow + 1 : toggleFrameTop + 1;
  const toggleStartCol = stackLeft + 1 + Math.floor((stackInteriorW - toggleLabel.length) / 2);

  return {
    stackLeft, stackW, groupTop, totalH,
    titleFrameTop, titleRow, titleStartCol,
    linkFrameTop, linkFrameH, linkRows, linkStartCols,
    mergedButtons,
    navFrameTop, navFrameH,
    navRow, navStartCol, navLabel, navHref,
    buttonSepRow,
    toggleFrameTop, toggleFrameH,
    toggleRow, toggleStartCol, toggleLabel,
  };
};
