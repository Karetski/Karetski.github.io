import { SAT_LEVELS } from './constants';
import { state, type Cell } from './state';
import { hash3 } from '../shared/math';

export type SeedMode = 'fresh' | 'random' | 'aged';

const RANDOM_MAX_HALFLIVES = 1;
const AGED_BASE = 1.5;
const AGED_SPREAD = 2;

export const seedFlip = (
  cell: Cell,
  c: number,
  r: number,
  now: number,
  mode: SeedMode = 'fresh',
): void => {
  const halfLifeMs = state.config.agingHalfLife * 1000;
  if (halfLifeMs <= 0 || mode === 'fresh') {
    cell.flipTime = now;
    cell.satLevel = SAT_LEVELS;
    return;
  }
  const ageHalfLives = mode === 'random'
    ? Math.random() * RANDOM_MAX_HALFLIVES
    : AGED_BASE + hash3(c, r, 71) * AGED_SPREAD;
  cell.flipTime = now - ageHalfLives * halfLifeMs;
  cell.satLevel = Math.round(Math.pow(0.5, ageHalfLives) * SAT_LEVELS);
};
