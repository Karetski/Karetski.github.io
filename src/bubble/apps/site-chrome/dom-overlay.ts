import type { Layout } from '../../framework/layout/types';
import { FONT_FAMILY, FONT_PX } from '../../framework/layout/compute';
import type { ThemeProvider } from '../../framework/theme/provider';
import { LINKS, TITLE } from './constants';
import type { PanelLayout } from './panel-layout';

export interface DOMOverlayHandles {
  rebuild(layout: Layout, panel: PanelLayout): void;
}

export const createDOMOverlay = (
  theme: ThemeProvider,
  isPlayMode: boolean,
  rebuildHook: () => void,
): DOMOverlayHandles => {
  const titleEl  = document.getElementById('title')!;
  const linksEl  = document.getElementById('links')!;
  const navEl    = document.getElementById('nav')!;
  const toggleEl = document.getElementById('theme-toggle')!;

  const rebuild = (layout: Layout, panel: PanelLayout): void => {
    titleEl.textContent = '';
    linksEl.innerHTML = '';
    navEl.innerHTML = '';
    toggleEl.innerHTML = '';

    const { cellW, cellH, naturalCellW } = layout;

    if (!isPlayMode) {
      titleEl.textContent = TITLE;
      titleEl.style.font = `${FONT_PX}px ${FONT_FAMILY}`;
      titleEl.style.letterSpacing = (cellW - naturalCellW) + 'px';
      titleEl.style.lineHeight = cellH + 'px';
      if (panel.titleStartCol !== null && panel.titleRow !== null) {
        titleEl.style.left = (panel.titleStartCol * cellW) + 'px';
        titleEl.style.top  = (panel.titleRow * cellH) + 'px';
      }

      for (let li = 0; li < LINKS.length; li++) {
        const link = LINKS[li]!;
        const a = document.createElement('a');
        a.href = link.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', link.label);
        a.style.left = (panel.linkStartCols[li]! * cellW) + 'px';
        a.style.top  = (panel.linkRows[li]! * cellH) + 'px';
        a.style.width  = (link.label.length * cellW) + 'px';
        a.style.height = cellH + 'px';
        linksEl.appendChild(a);
      }
    }

    const navA = document.createElement('a');
    navA.href = panel.navHref;
    navA.setAttribute('aria-label', panel.navLabel);
    navA.style.left = (panel.navStartCol * cellW) + 'px';
    navA.style.top  = (panel.navRow * cellH) + 'px';
    navA.style.width  = (panel.navLabel.length * cellW) + 'px';
    navA.style.height = cellH + 'px';
    navEl.appendChild(navA);

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = panel.toggleLabel;
    toggleBtn.setAttribute('aria-label', panel.toggleLabel);
    toggleBtn.style.left = (panel.toggleStartCol * cellW) + 'px';
    toggleBtn.style.top  = (panel.toggleRow * cellH) + 'px';
    toggleBtn.style.width  = (panel.toggleLabel.length * cellW) + 'px';
    toggleBtn.style.height = cellH + 'px';
    toggleBtn.onclick = () => {
      theme.toggle();
      rebuildHook();
    };
    toggleEl.appendChild(toggleBtn);
  };

  return { rebuild };
};
