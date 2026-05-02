import { FONT_PX } from './constants';
import { state, type GameEvent, type GameListener, writeStoredTheme } from './state';
import { resetColorCache } from './palette';
import { createCRT } from './crt';
import { setupGrid } from './layout';
import { setupDebugPanel } from './debug';
import { installPointerHandlers } from './pointer';
import { updateAndDrawGrid } from './render';
import { updateFlashIntensity } from './flash';
import { createMatrixGame } from './hook';
import { THEME_KEY } from './constants';
import type { MatrixGame } from '../shared/types';

let started = false;
let game: MatrixGame | null = null;
const earlyListeners: { evt: GameEvent; fn: GameListener }[] = [];

export const startMatrix = (): MatrixGame => {
  if (game) return game;
  game = createMatrixGame();
  // Expose for debug consoles + back-compat with anything probing the global.
  window.matrixGame = game;
  for (const { evt, fn } of earlyListeners) game.on(evt, fn);
  earlyListeners.length = 0;

  if (started) return game;
  started = true;

  const crt = createCRT();
  if (!crt) return game;

  const loop = (now: number) => {
    updateFlashIntensity(now);
    updateAndDrawGrid(crt.gctx, now);
    crt.render(now);
    requestAnimationFrame(loop);
  };

  const boot = () => {
    setupGrid(crt);
    setupDebugPanel(crt);
    requestAnimationFrame(loop);
  };

  installPointerHandlers();

  let resizeT: number | undefined;
  window.addEventListener('resize', () => {
    if (resizeT !== undefined) clearTimeout(resizeT);
    resizeT = window.setTimeout(() => setupGrid(crt), 100);
  });

  // Mirror theme changes made in other tabs/pages of the site.
  window.addEventListener('storage', (e) => {
    if (e.key !== THEME_KEY) return;
    const wantLight = e.newValue !== 'dark';
    if (wantLight === state.isLightMode) return;
    state.isLightMode = wantLight;
    resetColorCache();
    setupGrid(crt);
    state.refreshPickers();
  });
  // Reference writeStoredTheme so tree-shaking keeps it (it's used by
  // the debug-panel and theme-toggle button via the layout module).
  void writeStoredTheme;

  if (document.fonts && document.fonts.load) {
    document.fonts.load(`${FONT_PX}px 'Sometype Mono'`).then(boot, boot);
  } else {
    boot();
  }

  return game;
};
