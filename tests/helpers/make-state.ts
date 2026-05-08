import type { GameDeps } from '../../src/apps/bubble-game/deps';
import type { GameState } from '../../src/apps/bubble-game/state';
import type { ThemeSnapshot } from '../../src/framework/theme/types';
import { defaultConfig } from '../../src/framework/theme/config';

const NOOP = (): void => {};

const fakeTheme = (): ThemeSnapshot => ({
  mode: 'dark',
  isLight: false,
  bg: '#000',
  bgLevel: 0,
  title: [255, 255, 255],
  link: [70, 130, 255],
  frame: [255, 255, 255],
  sep: [80, 80, 80],
  vivid: defaultConfig.paletteDark,
  config: defaultConfig,
});

export const makeFakeDeps = (overrides: Partial<GameDeps> = {}): GameDeps => ({
  numColors: 3,
  charFor: (i: number) => ['A', 'B', 'C'][i % 3]!,
  theme: fakeTheme,
  flashBackground: NOOP,
  ...overrides,
});

export const makeState = (overrides: Partial<GameState> = {}): GameState => {
  const M = overrides.M ?? makeFakeDeps();
  return {
    M,
    cols: 80,
    rows: 40,
    cellW: 10,
    cellH: 18,
    slotCols: 8,
    startSlotCol: 5,
    startSlotRow: 0,
    shooterPx: 100,
    shooterPy: 540,
    dangerY: 500,
    projectileSpeed: 600,
    panelLeft: 5,
    panelWidth: 20,
    panelTop: 30,
    lowerInnerRow: 0,
    burstSectLeft: 0,
    burstSectW: 0,
    levelSectLeft: 0,
    levelSectW: 0,
    grid: [],
    shooter: { angle: -Math.PI / 2, current: null, next: null },
    projectile: null,
    shotsSinceDescent: 0,
    shotsPerDescent: 8,
    level: 1,
    score: 0,
    gameOver: false,
    pointerX: 0,
    pointerY: 0,
    popping: [],
    activeBurst: null,
    pattern: null,
    ...overrides,
  };
};
