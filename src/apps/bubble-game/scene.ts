import type { Layout } from '../../framework/layout/types';
import type { Component, Scene, SceneHost } from '../../framework/scene/types';
import { state } from './state';
import { computeBubbleLayout } from './layout';
import { reset } from './bubbles';
import { tick, updateAim } from './physics';
import { checkLose } from './matching';
import { installGameInput } from './input';
import { aimLineComponent } from './components/aim-line';
import { burstComponent } from './components/burst';
import { hudComponent } from './components/hud';
import { popComponent } from './components/pop';
import {
  bubblesComponent,
  gameOverComponent,
  projectileComponent,
} from './components/bubbles';
import { CHARSETS } from '../matrix-background/constants';

const charFor = (i: number): string => {
  const set = CHARSETS[i] ?? CHARSETS[0]!;
  return set[(Math.random() * set.length) | 0]!;
};

export const createBubbleGameScene = (): Scene => {
  let host: SceneHost | null = null;
  let uninstallInput: (() => void) | null = null;
  let started = false;

  const components: Component[] = [
    bubblesComponent,
    hudComponent,
    popComponent,
    burstComponent,
    aimLineComponent,
    projectileComponent,
    gameOverComponent,
  ];

  const tryStart = (): void => {
    if (started) return;
    if (state.cols === 0 || state.slotCols === 0) return;
    started = true;
    reset(state);
    state.pointerX = state.shooterPx;
    state.pointerY = state.shooterPy - 200;
    updateAim(state);
  };

  return {
    name: 'bubble-game',
    zIndex: 50,
    components,

    onMount(h) {
      host = h;
      state.M = {
        numColors: 3,
        charFor,
        theme: () => h.theme.snapshot(),
        flashBackground: (ms) => h.services.flash.trigger(ms),
      };
      uninstallInput = installGameInput(h.input);
    },

    onLayout(layout: Layout) {
      if (!host) return;
      const panel = layout.regions.get('panel');
      if (!panel) return;
      const oldSlotCols = state.slotCols;
      const playfield = computeBubbleLayout(layout, panel);
      host.services.setRegion('playfield', playfield);
      // Slot count change (only happens when matrix's panel labels change)
      // means existing rows have the wrong length; reset to keep the grid
      // consistent.
      if (started && state.slotCols !== oldSlotCols) reset(state);
      tryStart();
    },

    update(dt) {
      if (!started) return;
      const dtSec = Math.min(0.05, dt / 1000);
      updateAim(state);
      tick(state, dtSec);
      checkLose(state);
    },

    onUnmount() {
      uninstallInput?.();
      host?.services.setRegion('playfield', null);
      state.M = null;
      host = null;
    },
  };
};
