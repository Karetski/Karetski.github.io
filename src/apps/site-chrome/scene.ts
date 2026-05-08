import type { Layout } from '../../framework/layout/types';
import type { ThemeSnapshot } from '../../framework/theme/types';
import type { Component, Scene, SceneHost } from '../../framework/scene/types';
import { computePanelLayout, type PanelLayout } from './panel-layout';
import { paintPanel } from './panel-paint';
import { createDOMOverlay, type DOMOverlayHandles } from './dom-overlay';
import { setupDebugPanel } from './debug-panel';

export interface SiteChromeOptions {
  isPlayMode: boolean;
  // External hook the page wires up so debug 'reset' can also reset the
  // matrix-background's per-cell field.
  onConfigReset?: () => void;
}

export interface SiteChromeScene extends Scene {
  panelRegion(): { col: number; row: number; width: number; height: number } | null;
}

export const createSiteChromeScene = (
  options: SiteChromeOptions,
): SiteChromeScene => {
  let host: SceneHost | null = null;
  let panel: PanelLayout | null = null;
  let overlay: DOMOverlayHandles | null = null;

  const refreshPanelMask = (layout: Layout): void => {
    if (!host || !panel) return;
    const { stackLeft, stackW, groupTop, totalH } = panel;
    host.services.setPanelMask({
      x: (stackLeft * layout.cellW) / layout.viewportW,
      z: ((stackLeft + stackW) * layout.cellW) / layout.viewportW,
      y: 1 - ((groupTop + totalH) * layout.cellH) / layout.viewportH,
      w: 1 - (groupTop * layout.cellH) / layout.viewportH,
    });
  };

  const publishPanelRegion = (): void => {
    if (!host || !panel) return;
    host.services.setRegion('panel', {
      col: panel.stackLeft,
      row: panel.groupTop,
      width: panel.stackW,
      height: panel.totalH,
    });
  };

  const recompute = (layout: Layout, theme: ThemeSnapshot): void => {
    panel = computePanelLayout(layout, {
      isLight: theme.isLight,
      isPlayMode: options.isPlayMode,
    });
    refreshPanelMask(layout);
    publishPanelRegion();
    overlay?.rebuild(layout, panel);
  };

  const paint: Component = {
    paint: (ctx) => {
      if (!panel) return;
      paintPanel(ctx.cells, ctx.theme, panel, options.isPlayMode);
    },
  };

  const scene: SiteChromeScene = {
    name: 'site-chrome',
    // Panel paints over the matrix; bubble-game (zIndex 50) sits between.
    zIndex: 100,
    components: [paint],

    onMount(h) {
      host = h;
      overlay = createDOMOverlay(h.theme, options.isPlayMode, () => {
        if (host) recompute(host.layout(), host.theme.snapshot());
      });
      setupDebugPanel(h.theme, {
        rebuildField: () => options.onConfigReset?.(),
        refreshSiteChrome: () => {
          if (host) recompute(host.layout(), host.theme.snapshot());
        },
      });
    },

    onLayout(layout) {
      if (!host) return;
      recompute(layout, host.theme.snapshot());
    },

    onTheme(theme) {
      if (!host) return;
      recompute(host.layout(), theme);
    },

    onUnmount() {
      host?.services.setRegion('panel', null);
      host?.services.setPanelMask(null);
      host = null;
    },

    panelRegion() {
      if (!panel) return null;
      return {
        col: panel.stackLeft,
        row: panel.groupTop,
        width: panel.stackW,
        height: panel.totalH,
      };
    },
  };

  return scene;
};
