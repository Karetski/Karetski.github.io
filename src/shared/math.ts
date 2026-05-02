import type { RGB } from './types';

export const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

export const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export const smoothstep01 = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

export const hash3 = (x: number, y: number, z: number): number => {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};

export const noise3 = (x: number, y: number, z: number): number => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const c000 = hash3(xi,     yi,     zi);
  const c100 = hash3(xi + 1, yi,     zi);
  const c010 = hash3(xi,     yi + 1, zi);
  const c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi,     yi,     zi + 1);
  const c101 = hash3(xi + 1, yi,     zi + 1);
  const c011 = hash3(xi,     yi + 1, zi + 1);
  const c111 = hash3(xi + 1, yi + 1, zi + 1);
  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
};

export const desaturate = ([r, g, b]: RGB | readonly number[], factor: number): [number, number, number] => {
  const gray = 0.299 * r! + 0.587 * g! + 0.114 * b!;
  return [
    gray + (r! - gray) * factor,
    gray + (g! - gray) * factor,
    gray + (b! - gray) * factor,
  ];
};

export const dimToBg = (rgb: RGB | readonly number[], opacity: number, bg: number): [number, number, number] => [
  Math.round(bg + (rgb[0]! - bg) * opacity),
  Math.round(bg + (rgb[1]! - bg) * opacity),
  Math.round(bg + (rgb[2]! - bg) * opacity),
];

export const blendToBg = (rgb: RGB | readonly number[], fade: number, bg: number): [number, number, number] => [
  Math.round(rgb[0]! * fade + bg * (1 - fade)),
  Math.round(rgb[1]! * fade + bg * (1 - fade)),
  Math.round(rgb[2]! * fade + bg * (1 - fade)),
];
