import { describe, expect, test } from 'vitest';
import ak from '../assets/ak.svg?raw';
import { parsePolygonPath, parseSvgSource } from './svg-path';
import { visualCenter } from './visual-center';

const STEP = 1 / 250;
const box = (width: number, height: number) => ({ x: 0, y: 0, width, height });

describe('visualCenter', () => {
  test('given a shape symmetric in its box, then it is already centred', () => {
    const c = visualCenter(parsePolygonPath('M10 10H90V90H10Z'), box(100, 100));
    expect(c.x).toBeCloseTo(0.5, 5);
    expect(c.y).toBeCloseTo(0.5, 5);
  });

  test('given more ink on the right and bottom, then the centre moves right and down', () => {
    // An L: full-height bar on the right plus a foot along the bottom.
    const c = visualCenter(parsePolygonPath('M60 0H100V100H0V70H60Z'), box(100, 100));
    expect(c.x).toBeGreaterThan(0.5);
    expect(c.y).toBeGreaterThan(0.5);
  });

  test('given the AK logo, then it matches the reference tool run at full size (54.4%, 52.4%) within one step', () => {
    const { box: viewBox, paths } = parseSvgSource(ak);
    const c = visualCenter(paths.flatMap(parsePolygonPath), viewBox);
    expect(Math.abs(c.x - 0.544)).toBeLessThanOrEqual(STEP + 1e-9);
    expect(Math.abs(c.y - 0.524)).toBeLessThanOrEqual(STEP + 1e-9);
  });
});
