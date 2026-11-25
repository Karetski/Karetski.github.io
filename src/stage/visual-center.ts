import type { Segment } from './svg-path';

// Port of the visual-centre algorithm from javier.xyz/visual-center
// (github.com/javierbyte/visual-center, BSD-3-Clause, Javier Bórquez), applied
// to a polygon outline instead of a bitmap: the shape is rasterised dark on
// light, each pixel weighs coverage^EXPONENT, and the centre is the point that
// maximises Σ weight·√(1 − distance/diagonal), found by stepping along X then Y.

const SIZE = 140;           // raster long side, px (the reference uses 420; ~0.6 ms here, same result for the AK)
const STEP = 1 / 250;       // search step, as a fraction of the box
const EXPONENT = 0.333;     // weight of partially covered (anti-aliased) pixels
const SUBROWS = 4;          // vertical samples per pixel row; horizontal coverage is exact

export interface Box { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/** Where the shape's visual weight sits, as fractions of `box` from its top-left (0.5, 0.5 = centred). */
export const visualCenter = (segments: readonly Segment[], box: Box): { x: number; y: number } => {
  const scale = SIZE / Math.max(box.width, box.height);
  const w = Math.round(box.width * scale);
  const h = Math.round(box.height * scale);
  const coverage = rasterize(segments, box, scale, w, h);

  const ink: number[] = []; // flat [col, row, weight, ...]
  for (let i = 0; i < coverage.length; i++) {
    const c = coverage[i]!;
    // Pixel centres (the reference measures from corners, a half-pixel bias
    // that a smaller raster would turn into a whole search step).
    if (c > 0) ink.push((i % w) + 0.5, Math.floor(i / w) + 0.5, Math.pow(Math.min(c, 1), EXPONENT));
  }
  const diagonal = Math.hypot(w, h);
  const intensity = (fx: number, fy: number): number => {
    const cx = fx * w;
    const cy = fy * h;
    let sum = 0;
    for (let i = 0; i < ink.length; i += 3) {
      const dx = cx - ink[i]!;
      const dy = cy - ink[i + 1]!;
      sum += ink[i + 2]! * Math.sqrt(1 - Math.sqrt(dx * dx + dy * dy) / diagonal);
    }
    return sum;
  };
  // Walk one axis in one direction while the score improves.
  const climb = (fx: number, fy: number, dx: number, dy: number): [number, number] => {
    let best = intensity(fx, fy);
    for (;;) {
      const next = intensity(fx + dx, fy + dy);
      if (next <= best) return [fx, fy];
      best = next;
      fx += dx;
      fy += dy;
    }
  };

  let x = 0.5;
  let y = 0.5;
  [x] = climb(x, y, STEP, 0);
  [x] = climb(x, y, -STEP, 0);
  [, y] = climb(x, y, 0, STEP);
  [, y] = climb(x, y, 0, -STEP);
  return { x, y };
};

/** Even-odd scanline coverage (0..1 per pixel) of `segments` mapped from `box` onto a w×h grid. */
const rasterize = (segments: readonly Segment[], box: Box, scale: number, w: number, h: number): Float32Array => {
  const coverage = new Float32Array(w * h);
  const crossings: number[] = [];
  for (let row = 0; row < h; row++) {
    for (let sub = 0; sub < SUBROWS; sub++) {
      const y = box.y + (row + (sub + 0.5) / SUBROWS) / scale;
      crossings.length = 0;
      for (const [ax, ay, bx, by] of segments) {
        if ((ay > y) !== (by > y)) crossings.push((ax + ((y - ay) * (bx - ax)) / (by - ay) - box.x) * scale);
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const from = Math.max(crossings[i]!, 0);
        const to = Math.min(crossings[i + 1]!, w);
        for (let col = Math.floor(from); col < to; col++) {
          coverage[row * w + col]! += (Math.min(to, col + 1) - Math.max(from, col)) / SUBROWS;
        }
      }
    }
  }
  return coverage;
};
