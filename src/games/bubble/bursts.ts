import {
  BURST_PRIORITY,
  COMBO_BURST_DURATION_MS,
  LEVEL_BURST_DURATION_MS,
  POINT_BURST_DURATION_MS,
  type BurstKind,
} from './constants';
import { state } from './state';

export const burstDuration = (kind: BurstKind): number =>
  kind === 'combo' ? COMBO_BURST_DURATION_MS
  : kind === 'level' ? LEVEL_BURST_DURATION_MS
  : POINT_BURST_DURATION_MS;

export const addPointBurst = (
  text: string,
  color: number[] | readonly number[],
  kind: BurstKind = 'score',
): void => {
  if (state.activeBurst) {
    const elapsed = performance.now() - state.activeBurst.tStart;
    const stillVisible = elapsed < burstDuration(state.activeBurst.kind);
    if (stillVisible && BURST_PRIORITY[kind] < BURST_PRIORITY[state.activeBurst.kind]) return;
  }
  state.activeBurst = { text, color, kind, tStart: performance.now() };
};
