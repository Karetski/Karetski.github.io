import {
  FONT_FAMILY,
  FONT_PX,
  LINKS,
  TITLE,
} from './constants';
import { state, emit, writeStoredTheme } from './state';
import { resetColorCache } from './palette';
import type { CRTPipeline } from './crt';
import { initGrid } from './grid-init';
import { composePanelFrames } from './panel-frame';

export const setupGrid = (crt: CRTPipeline): void => {
  const { W, H, naturalCellW } = initGrid(crt);
  const panel = composePanelFrames(W, H);

  const titleEl = document.getElementById('title')!;
  const linksEl = document.getElementById('links')!;
  const navEl = document.getElementById('nav')!;
  const toggleEl = document.getElementById('theme-toggle')!;

  titleEl.textContent = '';
  linksEl.innerHTML = '';
  navEl.innerHTML = '';
  toggleEl.innerHTML = '';

  if (!state.isPlayMode) {
    titleEl.textContent = TITLE;
    titleEl.style.font = `${FONT_PX}px ${FONT_FAMILY}`;
    titleEl.style.letterSpacing = (state.cellW - naturalCellW) + 'px';
    titleEl.style.lineHeight = state.cellH + 'px';
    titleEl.style.left = (panel.titleStartCol! * state.cellW) + 'px';
    titleEl.style.top = (panel.titleRow! * state.cellH) + 'px';

    for (let li = 0; li < LINKS.length; li++) {
      const link = LINKS[li]!;
      const a = document.createElement('a');
      a.href = link.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', link.label);
      a.style.left = (panel.linkStartCols[li]! * state.cellW) + 'px';
      a.style.top = (panel.linkRows[li]! * state.cellH) + 'px';
      a.style.width = (link.label.length * state.cellW) + 'px';
      a.style.height = state.cellH + 'px';
      linksEl.appendChild(a);
    }
  }

  const navA = document.createElement('a');
  navA.href = panel.navHref;
  navA.setAttribute('aria-label', panel.navLabel);
  navA.style.left = (panel.navStartCol * state.cellW) + 'px';
  navA.style.top = (panel.navRow * state.cellH) + 'px';
  navA.style.width = (panel.navLabel.length * state.cellW) + 'px';
  navA.style.height = state.cellH + 'px';
  navEl.appendChild(navA);

  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = panel.toggleLabel;
  toggleBtn.setAttribute('aria-label', panel.toggleLabel);
  toggleBtn.style.left = (panel.toggleStartCol * state.cellW) + 'px';
  toggleBtn.style.top = (panel.toggleRow * state.cellH) + 'px';
  toggleBtn.style.width = (panel.toggleLabel.length * state.cellW) + 'px';
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
