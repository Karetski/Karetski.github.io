import type { Layout, Region } from '../layout/types';
import { computeGridLayout, FONT_FAMILY, FONT_PX, measureCell, withRegions } from '../layout/compute';
import type { ThemeProvider } from '../theme/provider';
import { createCellBuffer } from '../renderer/cell-buffer';
import type { CellBuffer } from '../renderer/cell-buffer';
import { createCRT, type CRTPanelRect, type CRTPipeline } from '../renderer/crt';
import { createInputBus, type InputBus } from './input';
import { createFlashController } from './flash';
import type { RenderContext, Scene, SceneHost, SceneHostServices } from './types';

interface MountedScene { scene: Scene; }

export interface SceneHostInit {
  screen: HTMLCanvasElement;
  theme: ThemeProvider;
}

export const createSceneHost = ({ screen, theme }: SceneHostInit): SceneHost | null => {
  const input = createInputBus();
  const flash = createFlashController();
  const startTime = performance.now();
  const regions = new Map<string, Region>();
  let panelMask: CRTPanelRect = { x: 0, y: 0, z: 1, w: 1 };

  const cells: CellBuffer = createCellBuffer(
    () => layout.cellW,
    () => layout.cellH,
  );

  const crt: CRTPipeline | null = createCRT(screen, cells.canvas);
  if (!crt) return null;

  const scenes: MountedScene[] = [];
  let layout: Layout = computeInitialLayout();

  function computeInitialLayout(): Layout {
    cells.ctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
    cells.ctx.textBaseline = 'middle';
    const cellMetrics = measureCell(cells.ctx);
    const dpr = window.devicePixelRatio || 1;
    const vp = { width: window.innerWidth, height: window.innerHeight, dpr };
    return computeGridLayout(vp, cellMetrics);
  }

  const applyResize = (): void => {
    const cellMetrics = measureCell(cells.ctx);
    const dpr = window.devicePixelRatio || 1;
    const vp = { width: window.innerWidth, height: window.innerHeight, dpr };
    const base = computeGridLayout(vp, cellMetrics);
    layout = withRegions(base, new Map(regions));
    cells.resize(vp.width, vp.height, dpr, theme.snapshot());
    screen.width = Math.floor(vp.width * dpr);
    screen.height = Math.floor(vp.height * dpr);
    screen.style.width = vp.width + 'px';
    screen.style.height = vp.height + 'px';
    crt.resize();
    notifyLayout(null);
  };

  let prevLayoutForSceneNotify: Layout | null = null;
  const notifyLayout = (forced: Layout | null): void => {
    const next = forced ?? layout;
    layout = next;
    for (const m of scenes) {
      try { m.scene.onLayout?.(next, prevLayoutForSceneNotify); }
      catch (e) { console.error(e); }
    }
    prevLayoutForSceneNotify = next;
  };

  const refreshLayoutFromRegions = (): void => {
    layout = withRegions(layout, new Map(regions));
    notifyLayout(layout);
  };

  const sameRegion = (
    a: Region | undefined,
    b: Region | null,
  ): boolean => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.col === b.col && a.row === b.row
        && a.width === b.width && a.height === b.height;
  };

  const services: SceneHostServices = {
    flash,
    setRegion(name, region) {
      if (sameRegion(regions.get(name), region)) return;
      if (region) regions.set(name, region);
      else regions.delete(name);
      refreshLayoutFromRegions();
    },
    setPanelMask(rect) {
      panelMask = rect ?? { x: 0, y: 0, z: 1, w: 1 };
    },
    requestLayoutRefresh: refreshLayoutFromRegions,
  };

  const host: SceneHost = {
    mount(scene) {
      scenes.push({ scene });
      scenes.sort((a, b) => a.scene.zIndex - b.scene.zIndex);
      try { scene.onMount?.(host); } catch (e) { console.error(e); }
      try { scene.onLayout?.(layout, null); } catch (e) { console.error(e); }
      try { scene.onTheme?.(theme.snapshot()); } catch (e) { console.error(e); }
      return () => {
        const ix = scenes.findIndex((m) => m.scene === scene);
        if (ix >= 0) {
          scenes.splice(ix, 1);
          try { scene.onUnmount?.(); } catch (e) { console.error(e); }
        }
      };
    },
    theme,
    input,
    services,
    layout: () => layout,
  };

  theme.subscribe((snap) => {
    for (const m of scenes) {
      try { m.scene.onTheme?.(snap); } catch (e) { console.error(e); }
    }
  });

  let resizeT: number | undefined;
  window.addEventListener('resize', () => {
    if (resizeT !== undefined) clearTimeout(resizeT);
    resizeT = window.setTimeout(applyResize, 100);
  });

  let lastT = 0;
  const loop = (now: number): void => {
    if (document.hidden) {
      lastT = 0;
      requestAnimationFrame(loop);
      return;
    }
    const dt = lastT ? Math.min(now - lastT, 100) : 16.67;
    lastT = now;

    flash.tick(now);

    const snap = theme.snapshot();
    cells.beginFrame(snap);

    for (const m of scenes) {
      try { m.scene.update?.(dt, now); } catch (e) { console.error(e); }
    }

    const ctx: RenderContext = { cells, theme: snap, layout, dt, now, input };
    for (const m of scenes) {
      const comps = typeof m.scene.components === 'function'
        ? m.scene.components(ctx)
        : m.scene.components;
      for (const comp of comps) {
        try { comp.paint(ctx); } catch (e) { console.error(e); }
      }
    }

    cells.flush();
    crt.render(now, {
      isLight: snap.isLight,
      config: snap.config,
      panelRect: panelMask,
      startTime,
    });

    requestAnimationFrame(loop);
  };

  const start = (): void => {
    applyResize();
    requestAnimationFrame(loop);
  };

  if (document.fonts && document.fonts.load) {
    document.fonts.load(`${FONT_PX}px 'Sometype Mono'`).then(start, start);
  } else {
    start();
  }

  return host;
};
