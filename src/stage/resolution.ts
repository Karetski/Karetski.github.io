/**
 * Adaptive render scale: drops the drawing-buffer resolution when frames run
 * slow and climbs back when they are comfortably fast. Thresholds are fixed
 * (not relative to the display's refresh rate) so a 30 Hz device is treated
 * as slow rather than "on budget".
 */
export const SCALE_STEPS = [1, 0.75, 0.5] as const;

const SLOW_MS = 20;        // EMA above this (< ~50 fps) counts as slow
const FAST_MS = 17.5;      // EMA below this counts as fast
const SLOW_FRAMES = 30;    // ~0.5–1 s of sustained slowness before stepping down
const FAST_FRAMES = 300;   // ~5 s of sustained headroom before stepping up
const OUTLIER_MS = 250;    // tab switches, debugger pauses: not a GPU signal
const EMA_ALPHA = 0.1;

export interface ScaleController {
  /** Current multiplier on the device pixel ratio. */
  readonly scale: number;
  /** Feed one frame interval; returns true when `scale` changed. */
  sample(frameMs: number): boolean;
}

export const createScaleController = (): ScaleController => {
  let step = 0;
  let ema = 1000 / 60;
  let slow = 0;
  let fast = 0;

  return {
    get scale() { return SCALE_STEPS[step]!; },
    sample(frameMs) {
      if (frameMs <= 0 || frameMs > OUTLIER_MS) return false;
      ema += (frameMs - ema) * EMA_ALPHA;
      slow = ema > SLOW_MS ? slow + 1 : 0;
      fast = ema < FAST_MS ? fast + 1 : 0;

      if (slow >= SLOW_FRAMES && step < SCALE_STEPS.length - 1) {
        step++;
      } else if (fast >= FAST_FRAMES && step > 0) {
        step--;
      } else {
        return false;
      }
      slow = fast = 0;
      ema = 1000 / 60; // re-measure at the new resolution from a neutral start
      return true;
    },
  };
};
