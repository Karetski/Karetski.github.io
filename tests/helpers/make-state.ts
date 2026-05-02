import type { MatrixGame } from '../../src/shared/types';
import type { GameState } from '../../src/games/bubble/state';

const NOOP = (): void => {};

export const makeFakeMatrix = (overrides: Partial<MatrixGame> = {}): MatrixGame => ({
  isPlayMode: true,
  cols: 80,
  rows: 40,
  cellW: 10,
  cellH: 18,
  isLight: false,
  numColors: 3,
  panelLeft: 5,
  panelWidth: 20,
  panelTop: 30,
  vividColor: () => [255, 0, 0],
  linkColor: () => [0, 255, 0],
  titleColor: () => [255, 255, 255],
  sepColor: () => [128, 128, 128],
  charFor: (i: number) => ['A', 'B', 'C'][i % 3]!,
  setCell: NOOP,
  clearCell: NOOP,
  isLocked: () => false,
  setPlayfieldBounds: NOOP,
  on: NOOP,
  flashBackground: NOOP,
  ...overrides,
});

export const makeState = (overrides: Partial<GameState> = {}): GameState => {
  const M = overrides.M ?? makeFakeMatrix();
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
    lastWritten: new Set(),
    popping: [],
    activeBurst: null,
    ...overrides,
  };
};
