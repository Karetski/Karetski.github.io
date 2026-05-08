import { describe, expect, test } from 'bun:test';
import { descend, ensureRow, makeBubble, randomRow, reset, refillIfEmpty } from './bubbles';
import { makeState } from '../../../tests/helpers/make-state';
import { mulberry32 } from '../../../tests/helpers/seeded-rng';

describe('makeBubble', () => {
  test('with a seeded rng produces a stable colorIdx and char', () => {
    const a = makeBubble(makeState(), mulberry32(42));
    const b = makeBubble(makeState(), mulberry32(42));
    expect(a).toEqual(b);
  });

  test("colorIdx is within the matrix's palette range", () => {
    const state = makeState();
    const rng = mulberry32(7);
    for (let i = 0; i < 32; i++) {
      const out = makeBubble(state, rng);
      expect(out.colorIdx).toBeGreaterThanOrEqual(0);
      expect(out.colorIdx).toBeLessThan(state.M!.numColors);
    }
  });
});

describe('randomRow', () => {
  test('length always equals slotCols', () => {
    const state = makeState({ slotCols: 7 });
    const row = randomRow(state, 0.5, mulberry32(1));
    expect(row).toHaveLength(7);
  });

  test('fill=1 returns a row with no nulls', () => {
    const state = makeState({ slotCols: 5 });
    const row = randomRow(state, 1, mulberry32(2));
    expect(row.every((c) => c !== null)).toBe(true);
  });

  test('fill=0 returns a row of all nulls', () => {
    const state = makeState({ slotCols: 5 });
    const row = randomRow(state, 0, mulberry32(3));
    expect(row.every((c) => c === null)).toBe(true);
  });
});

describe('ensureRow', () => {
  test('extends grid to length j+1', () => {
    const state = makeState({ slotCols: 3, grid: [] });
    ensureRow(state, 2);
    expect(state.grid).toHaveLength(3);
    expect(state.grid[2]).toEqual([null, null, null]);
  });

  test("does not shrink the grid if it's already long enough", () => {
    const state = makeState({ slotCols: 3, grid: [[null, null, null]] });
    ensureRow(state, 0);
    expect(state.grid).toHaveLength(1);
  });
});

describe('reset', () => {
  test('clears score, sets level to 1, and zeroes gameOver', () => {
    const state = makeState({ score: 99, level: 5, gameOver: true, slotCols: 3 });
    reset(state, mulberry32(0));
    expect(state.score).toBe(0);
    expect(state.level).toBe(1);
    expect(state.gameOver).toBe(false);
  });

  test('produces INITIAL_ROWS rows of slotCols length', () => {
    const state = makeState({ slotCols: 4 });
    reset(state, mulberry32(0));
    expect(state.grid.length).toBeGreaterThanOrEqual(5);
    for (const row of state.grid) expect(row).toHaveLength(4);
  });
});

describe('descend pattern transition', () => {
  // When the active pattern exhausts and the next pattern's first row lands
  // on columns disjoint from the previous top, the previous stack would lose
  // its only ceiling anchor and dropFloaters would wipe it out. The
  // transition bridge prevents that. Anchor column is interior (not 0 / not
  // W-1) so wall-anchoring in collectFloaters can't mask the bug, and we
  // sweep many seeds so we exercise picks that genuinely sit disjoint from
  // the previous top.
  test('preserves the previous top across pattern transitions for any rng seed', () => {
    for (let seed = 0; seed < 64; seed++) {
      const cell = { colorIdx: 0, char: 'A' };
      const empty: Array<{ colorIdx: number; char: string } | null> = [
        null, null, null, null, null, null, null, null, null, null,
      ];
      const withCellAt5 = () => {
        const r = empty.slice();
        r[5] = cell;
        return r;
      };
      const state = makeState({
        slotCols: 10,
        grid: [withCellAt5(), withCellAt5(), withCellAt5()],
        // dna is the one pattern whose first row reliably covers col 5 at
        // W=10; excluding it via same-kind avoidance forces a pick that
        // tends to leave col 5 empty unless the bridge intervenes.
        pattern: { kind: 'dna', step: 10, length: 10, params: { thickness: 4 } },
      });
      descend(state, mulberry32(seed));
      const newTop = state.grid[0]!;
      const prevTop = state.grid[1]!;
      // Invariant: at the seam between two patterns, the new top must share
      // at least one filled column with the previous top so the older stack
      // keeps its ceiling anchor.
      const overlap = newTop.some((c, i) => c !== null && prevTop[i] !== null);
      expect(overlap).toBe(true);
      // The previous-top bubble at col 5 must still be there (i.e., wasn't
      // dropped as a floater).
      expect(prevTop[5]).not.toBeNull();
    }
  });
});

describe('refillIfEmpty', () => {
  test('returns false when the grid still has any bubble', () => {
    const state = makeState({
      slotCols: 2,
      grid: [[{ colorIdx: 0, char: 'A' }, null]],
    });
    expect(refillIfEmpty(state, mulberry32(0))).toBe(false);
  });

  test('returns true and refills when the grid is empty', () => {
    const state = makeState({
      slotCols: 2,
      grid: [[null, null]],
      level: 1,
    });
    const refilled = refillIfEmpty(state, mulberry32(0));
    expect(refilled).toBe(true);
    expect(state.grid.length).toBeGreaterThan(0);
    expect(state.level).toBe(2);
  });
});
