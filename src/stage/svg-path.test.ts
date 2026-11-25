import { describe, expect, test } from 'vitest';
import { parsePolygonPath, parseSvgSource } from './svg-path';

describe('parsePolygonPath', () => {
  test('given an absolute triangle, then it yields three closed edges', () => {
    expect(parsePolygonPath('M0 0 L10 0 L0 10 Z')).toEqual([
      [0, 0, 10, 0],
      [10, 0, 0, 10],
      [0, 10, 0, 0],
    ]);
  });

  test('given relative and axis commands with packed numbers, then coordinates accumulate', () => {
    expect(parsePolygonPath('M42 0h29l7 14-29 58H0z')).toEqual([
      [42, 0, 71, 0],
      [71, 0, 78, 14],
      [78, 14, 49, 72],
      [49, 72, 0, 72],
      [0, 72, 42, 0],
    ]);
  });

  test('given an open subpath followed by another, then both are closed', () => {
    const segs = parsePolygonPath('M0 0 H4 V4 M10 10 h1 v1');
    expect(segs).toContainEqual([4, 4, 0, 0]);
    expect(segs).toContainEqual([11, 11, 10, 10]);
    expect(segs).toHaveLength(6);
  });

  test('given implicit lineto pairs after moveto, then they draw edges', () => {
    expect(parsePolygonPath('m1 1 2 0 0 2z')).toEqual([
      [1, 1, 3, 1],
      [3, 1, 3, 3],
      [3, 3, 1, 1],
    ]);
  });

  test('given a curve command, then it refuses to approximate', () => {
    expect(() => parsePolygonPath('M0 0 C1 1 2 2 3 3')).toThrow(/unsupported command 'C'/);
  });
});

describe('parseSvgSource', () => {
  test('given an SVG file with several paths, then it returns the viewBox and every path', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 0 288 256"><path d="M0 0H1Z"/><path fill="red" d="M2 2H3Z"/></svg>';
    expect(parseSvgSource(svg)).toEqual({
      viewBox: '-8 0 288 256',
      box: { x: -8, y: 0, width: 288, height: 256 },
      paths: ['M0 0H1Z', 'M2 2H3Z'],
    });
  });

  test('given no viewBox, then it refuses rather than guessing the box', () => {
    expect(() => parseSvgSource('<svg><path d="M0 0H1Z"/></svg>')).toThrow(/viewBox/);
  });
});
