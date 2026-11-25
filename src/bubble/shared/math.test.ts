import { describe, expect, test } from 'bun:test';
import { fade, smoothstep, smoothstep01, desaturate, dimToBg, blendToBg, noise3 } from './math';

describe('fade', () => {
  test('fade(0) is 0 and fade(1) is 1', () => {
    expect(fade(0)).toBe(0);
    expect(fade(1)).toBe(1);
  });
  test('fade(0.5) is 0.5', () => {
    expect(fade(0.5)).toBeCloseTo(0.5, 6);
  });
});

describe('smoothstep / smoothstep01', () => {
  test('smoothstep(0)=0, smoothstep(1)=1, smoothstep(0.5)=0.5', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 6);
  });
  test('smoothstep01 clamps below 0 and above 1', () => {
    expect(smoothstep01(-1)).toBe(0);
    expect(smoothstep01(2)).toBe(1);
  });
});

describe('desaturate', () => {
  test('factor=1 returns the input colour unchanged', () => {
    const out = desaturate([200, 100, 50], 1);
    expect(out[0]).toBeCloseTo(200, 6);
    expect(out[1]).toBeCloseTo(100, 6);
    expect(out[2]).toBeCloseTo(50, 6);
  });
  test('factor=0 returns a flat grey at the luminance', () => {
    const out = desaturate([200, 100, 50], 0);
    expect(out[0]).toBeCloseTo(out[1]!, 6);
    expect(out[1]).toBeCloseTo(out[2]!, 6);
  });
});

describe('dimToBg / blendToBg', () => {
  test('dimToBg with opacity=1 returns the input rounded', () => {
    expect(dimToBg([200, 100, 50], 1, 0)).toEqual([200, 100, 50]);
  });
  test('dimToBg with opacity=0 returns the bg colour', () => {
    expect(dimToBg([200, 100, 50], 0, 30)).toEqual([30, 30, 30]);
  });
  test('blendToBg with fade=1 returns the input', () => {
    expect(blendToBg([200, 100, 50], 1, 0)).toEqual([200, 100, 50]);
  });
});

describe('noise3', () => {
  test('is deterministic for the same input', () => {
    expect(noise3(1.5, 2.25, -0.75)).toBe(noise3(1.5, 2.25, -0.75));
  });
  test('returns a value in [0, 1]', () => {
    for (let i = 0; i < 16; i++) {
      const v = noise3(i * 0.31, i * 0.71, i * 0.13);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
