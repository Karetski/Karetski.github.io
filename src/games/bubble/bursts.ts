import {
  BURST_PRIORITY,
  COMBO_BURST_DURATION_MS,
  LEVEL_BURST_DURATION_MS,
  POINT_BURST_DURATION_MS,
  type BurstKind,
} from './constants';
import type { GameState } from './state';

export const burstDuration = (kind: BurstKind): number =>
  kind === 'combo' ? COMBO_BURST_DURATION_MS
  : kind === 'level' ? LEVEL_BURST_DURATION_MS
  : POINT_BURST_DURATION_MS;

export const addPointBurst = (
  state: GameState,
  text: string,
  color: number[] | readonly number[],
  kind: BurstKind = 'score',
  now: number = performance.now(),
): void => {
  if (state.activeBurst) {
    const elapsed = now - state.activeBurst.tStart;
    const stillVisible = elapsed < burstDuration(state.activeBurst.kind);
    if (stillVisible && BURST_PRIORITY[kind] < BURST_PRIORITY[state.activeBurst.kind]) return;
  }
  state.activeBurst = { text, color, kind, tStart: now };
};

export const tickBurst = (state: GameState, now: number = performance.now()): void => {
  if (!state.activeBurst) return;
  const burstAge = now - state.activeBurst.tStart;
  if (burstAge >= burstDuration(state.activeBurst.kind)) state.activeBurst = null;
};
