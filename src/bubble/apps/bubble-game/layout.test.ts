import { describe, expect, test } from 'bun:test';
import { sectionWidths } from './layout';

// sectionWidths splits a panel of `totalW` columns into `count` sections so
// that adjacent sections SHARE their divider column. As a consequence the
// returned widths sum to `totalW + (count - 1)`, not to `totalW`. The call
// site in computeLayout subtracts 1 for each shared divider when laying
// sections out.

describe('sectionWidths', () => {
  test('count=1 returns the full total in a single section', () => {
    expect(sectionWidths(20, 1)).toEqual([20]);
  });

  test('returns exactly count entries', () => {
    expect(sectionWidths(0, 3).length).toBe(3);
    expect(sectionWidths(2, 5).length).toBe(5);
    expect(sectionWidths(100, 7).length).toBe(7);
  });

  test('widths sum to totalW + (count - 1) — the divider-share invariant', () => {
    const cases: Array<[number, number]> = [
      [0, 3],
      [9, 3],
      [10, 3],
      [7, 3],
      [100, 7],
      [2, 5],
    ];
    for (const [totalW, count] of cases) {
      const out = sectionWidths(totalW, count);
      const sum = out.reduce((a, b) => a + b, 0);
      expect(sum).toBe(totalW + count - 1);
    }
  });

  test('extra columns from rem land on the leftmost sections', () => {
    // 7 across 3 ⇒ base=3, rem=0 ⇒ [3, 3, 3]; 8 across 3 ⇒ base=3, rem=1 ⇒ [4, 3, 3].
    expect(sectionWidths(7, 3)).toEqual([3, 3, 3]);
    expect(sectionWidths(8, 3)).toEqual([4, 3, 3]);
  });

  test('count > totalW still produces a length-count result', () => {
    const out = sectionWidths(2, 5);
    expect(out.length).toBe(5);
  });
});
