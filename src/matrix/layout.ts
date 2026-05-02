import {
  FONT_FAMILY,
  FONT_PX,
  FRAME_CHARS,
  FRAME_GAP,
  FRAME_PAD,
  LINE_HEIGHT,
  LINKS,
  NAV_BACK_LABEL,
  NAV_PLAY_LABEL,
  SAT_LEVELS,
  TITLE,
  TOGGLE_DARK_LABEL,
  TOGGLE_LIGHT_LABEL,
} from './constants';
import { state, emit, writeStoredTheme, type Cell } from './state';
import { applyBrightness, getColorStr, getPalette, randChar, resetColorCache } from './palette';
import { sampleColorIndex } from './noise';
import { computeVisibility, setLocked } from './cells';
import { getThemeColors } from './theme';
import { hash3 } from '../shared/math';
import type { CRTPipeline } from './crt';

export const setupGrid = (crt: CRTPipeline): void => {
  const { gctx, gridCanvas, screenCanvas } = crt;
  document.documentElement.classList.toggle('light', state.isLightMode);
  state.dpr = window.devicePixelRatio || 1;

  gctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
  gctx.textBaseline = 'middle';
  const m = gctx.measureText('M');
  const naturalCellW = m.width;
  const ink = gctx.measureText('MgyjpqWf|/');
  const aboveMid = ink.actualBoundingBoxAscent || FONT_PX * 0.5;
  const belowMid = ink.actualBoundingBoxDescent || FONT_PX * 0.5;
  state.cellW = Math.max(8, Math.ceil(naturalCellW));
  state.cellH = Math.max(10, Math.ceil(Math.max(FONT_PX * LINE_HEIGHT, 2 * Math.max(aboveMid, belowMid))));

  const W = window.innerWidth;
  const H = window.innerHeight;

  gridCanvas.width = W;
  gridCanvas.height = H;
  screenCanvas.width = Math.floor(W * state.dpr);
  screenCanvas.height = Math.floor(H * state.dpr);
  screenCanvas.style.width = W + 'px';
  screenCanvas.style.height = H + 'px';

  gctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
  gctx.textBaseline = 'middle';
  const theme = getThemeColors();
  gctx.fillStyle = theme.bg;
  gctx.fillRect(0, 0, W, H);

  state.cols = Math.floor(W / state.cellW);
  state.rows = Math.floor(H / state.cellH);

  const now = performance.now();
  const palette = getPalette();
  const cx0 = W * 0.5;
  const cy0 = H * 0.5;
  const maxR = Math.max(1, Math.hypot(cx0, cy0));
  const cells: Cell[] = new Array(state.cols * state.rows);
  for (let i = 0; i < cells.length; i++) {
    const r = (i / state.cols) | 0;
    const c = i - r * state.cols;
    const colorIndex = sampleColorIndex(c, r, now);
    const color = applyBrightness(palette[colorIndex]!);
    const px = c * state.cellW + state.cellW * 0.5;
    const py = r * state.cellH + state.cellH * 0.5;
    const distNorm = Math.min(1, Math.hypot(px - cx0, py - cy0) / maxR);
    const noise = (hash3(c, r, 31) - 0.5) * 2;
    cells[i] = {
      char: randChar(colorIndex),
      locked: false,
      color,
      colorStr: getColorStr(color),
      heat: 0,
      dirty: true,
      colorIndex,
      flipTime: now,
      satLevel: SAT_LEVELS,
      distNorm,
      fadeNoise: noise,
      visibility: computeVisibility(distNorm, noise),
    };
  }
  state.cells = cells;

  const drawFrame = (top: number, left: number, w: number, h: number, color: number[] | readonly number[]) => {
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

  const toggleLabel = state.isLightMode ? TOGGLE_DARK_LABEL : TOGGLE_LIGHT_LABEL;
  const navLabel = state.isPlayMode ? NAV_BACK_LABEL : NAV_PLAY_LABEL;
  const navHref = state.isPlayMode ? 'index.html' : 'play.html';

  const longestLink = Math.max(...LINKS.map((l) => l.label.length));
  // Stable button width covers every label so the layout doesn't reflow
  // when the toggle flips between "dark" and "light".
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
  // Bottom frame stacks two rows (nav + toggle) like the links frame:
  // top border + nav row + separator + toggle row + bottom border.
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

  // Panel bounds in vUv space (vUv.y is flipped: y=1 is top of canvas)
  state.panelRect.x = (stackLeft * state.cellW) / W;
  state.panelRect.z = ((stackLeft + stackW) * state.cellW) / W;
  state.panelRect.y = 1 - ((groupTop + totalH) * state.cellH) / H;
  state.panelRect.w = 1 - (groupTop * state.cellH) / H;

  const titleEl = document.getElementById('title')!;
  const linksEl = document.getElementById('links')!;
  const navEl = document.getElementById('nav')!;
  const toggleEl = document.getElementById('theme-toggle')!;

  titleEl.textContent = '';
  linksEl.innerHTML = '';
  navEl.innerHTML = '';
  toggleEl.innerHTML = '';

  let buttonFrameTop: number;
  if (state.isPlayMode) {
    buttonFrameTop = groupTop;
  } else {
    const titleFrameTop = groupTop;
    const titleRow = titleFrameTop + 1;
    const titleStartCol = stackLeft + 1 + Math.floor((stackInteriorW - TITLE.length) / 2);

    drawFrame(titleFrameTop, stackLeft, stackW, titleFrameH, theme.frame);
    for (let i = 0; i < TITLE.length; i++) {
      setLocked(titleRow, titleStartCol + i, TITLE[i]!, theme.title);
    }

    titleEl.textContent = TITLE;
    titleEl.style.font = `${FONT_PX}px ${FONT_FAMILY}`;
    titleEl.style.letterSpacing = (state.cellW - naturalCellW) + 'px';
    titleEl.style.lineHeight = state.cellH + 'px';
    titleEl.style.left = (titleStartCol * state.cellW) + 'px';
    titleEl.style.top = (titleRow * state.cellH) + 'px';

    const linkFrameTop = titleFrameTop + titleFrameH + FRAME_GAP;
    drawFrame(linkFrameTop, stackLeft, stackW, linkFrameH, theme.frame);

    for (let li = 0; li < LINKS.length; li++) {
      const link = LINKS[li]!;
      const linkRow = linkFrameTop + 1 + li * 2;
      const startCol = stackLeft + 1 + Math.floor((stackInteriorW - link.label.length) / 2);

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

      const a = document.createElement('a');
      a.href = link.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', link.label);
      a.style.left = (startCol * state.cellW) + 'px';
      a.style.top = (linkRow * state.cellH) + 'px';
      a.style.width = (link.label.length * state.cellW) + 'px';
      a.style.height = state.cellH + 'px';
      linksEl.appendChild(a);
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

  const navA = document.createElement('a');
  navA.href = navHref;
  navA.setAttribute('aria-label', navLabel);
  navA.style.left = (navStartCol * state.cellW) + 'px';
  navA.style.top = (navRow * state.cellH) + 'px';
  navA.style.width = (navLabel.length * state.cellW) + 'px';
  navA.style.height = state.cellH + 'px';
  navEl.appendChild(navA);

  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = toggleLabel;
  toggleBtn.setAttribute('aria-label', toggleLabel);
  toggleBtn.style.left = (toggleStartCol * state.cellW) + 'px';
  toggleBtn.style.top = (toggleRow * state.cellH) + 'px';
  toggleBtn.style.width = (toggleLabel.length * state.cellW) + 'px';
  toggleBtn.style.height = state.cellH + 'px';
  toggleBtn.onclick = () => {
    state.isLightMode = !state.isLightMode;
    writeStoredTheme(state.isLightMode ? 'light' : 'dark');
    resetColorCache();
    setupGrid(crt);
    state.refreshPickers();
  };
  toggleEl.appendChild(toggleBtn);

  crt.resize();
  emit('regrid');
};
