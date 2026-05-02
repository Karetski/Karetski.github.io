import type { Layout } from '../../framework/layout/types';
import type { ThemeSnapshot } from '../../framework/theme/types';
import type { Component, Scene, SceneHost } from '../../framework/scene/types';
import type { FlashController } from '../../framework/scene/flash';
import { BackgroundField } from './background-field';
import { RIPPLE_RADIUS } from './constants';

export interface MatrixBackgroundOptions {
  // Calmer flip + dampened palette around the playfield (used by the play page).
  calmField?: boolean;
}

export interface MatrixBackgroundScene extends Scene {
  readonly field: BackgroundField;
  rebuildAfterConfigChange(): void;
}

export const createMatrixBackgroundScene = (
  options: MatrixBackgroundOptions = {},
): MatrixBackgroundScene => {
  const field = new BackgroundField({ calmField: !!options.calmField });
  let host: SceneHost | null = null;

  const paint: Component = {
    paint: (ctx) => {
      const flash = (host?.services.flash as FlashController | undefined)?.consume() ?? {
        active: false, cleanup: false, intensity: 0, flipMul: 1,
      };
      field.step(ctx.cells, ctx.layout, ctx.theme, flash, ctx.dt, ctx.now);
    },
  };

  const stepPointer = (): void => {
    if (!host) return;
    const p = host.input.pointer;
    if (!p.active) return;
    const ddx = p.x - p.lastX;
    const ddy = p.y - p.lastY;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy);
    const step = RIPPLE_RADIUS * 0.5;
    const steps = Math.max(1, Math.ceil(dist / step));
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      field.applyHeatAt(p.lastX + ddx * f, p.lastY + ddy * f);
    }
    p.lastX = p.x;
    p.lastY = p.y;
  };

  const scene: MatrixBackgroundScene = {
    name: 'matrix-background',
    zIndex: 0,
    field,
    components: [paint],

    onMount(h) {
      host = h;
      // Pointer trail: each frame, walk the segment since last frame and apply
      // ripple heat. Subscribing on move alone would skip steps under heavy
      // motion; instead the scene's update() consumes the latest pointer.
    },

    update() {
      stepPointer();
    },

    onLayout(layout: Layout) {
      if (!host) return;
      field.layoutChanged(layout, host.theme.snapshot());
    },

    onTheme(theme: ThemeSnapshot) {
      if (!host) return;
      field.themeChanged(host.layout(), theme);
    },

    onUnmount() {
      host = null;
    },

    rebuildAfterConfigChange() {
      if (!host) return;
      field.themeChanged(host.layout(), host.theme.snapshot());
    },
  };

  return scene;
};
