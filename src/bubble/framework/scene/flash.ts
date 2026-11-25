import { smoothstep } from '../../shared/math';
import type { FlashService } from './types';

export interface FlashRenderState {
  active: boolean;
  cleanup: boolean;
  intensity: number;
  flipMul: number;
}

const ATTACK_MS = 120;
const DECAY_MS  = 520;
const HOLD_MIN  = 60;
const HOLD_MAX  = 700;

interface InternalFlash {
  start: number;
  hold: number;
  intensity: number;
  wasActive: boolean;
}

export interface FlashController extends FlashService {
  tick(now: number): void;
  consume(): FlashRenderState;
}

export const createFlashController = (): FlashController => {
  const f: InternalFlash = { start: 0, hold: 180, intensity: 0, wasActive: false };

  const tick = (now: number): void => {
    if (!f.start) { f.intensity = 0; return; }
    const e = now - f.start;
    if (e < 0) { f.intensity = 0; return; }
    if (e < ATTACK_MS) {
      f.intensity = smoothstep(e / ATTACK_MS);
    } else if (e < ATTACK_MS + f.hold) {
      f.intensity = 1;
    } else if (e < ATTACK_MS + f.hold + DECAY_MS) {
      f.intensity = 1 - smoothstep((e - ATTACK_MS - f.hold) / DECAY_MS);
    } else {
      f.intensity = 0;
      f.start = 0;
    }
  };

  const consume = (): FlashRenderState => {
    const active = f.intensity > 0.001;
    const cleanup = !active && f.wasActive;
    f.wasActive = active;
    return {
      active,
      cleanup,
      intensity: f.intensity,
      flipMul: active ? 1 + f.intensity * 6 : 1,
    };
  };

  return {
    trigger: (durationMs: number): void => {
      f.hold = Math.max(HOLD_MIN, Math.min(HOLD_MAX, (durationMs || 250) - ATTACK_MS));
      f.start = performance.now();
    },
    intensity: () => f.intensity,
    tick,
    consume,
  };
};
