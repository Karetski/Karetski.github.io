import { describe, expect, test } from 'bun:test';
import { collectMatch, collectFloaters, popCell, popGroup, isLose, checkLose } from './matching';
import type { Bubble, GameGrid } from './state';
import { makeState } from '../../../tests/helpers/make-state';

const b = (colorIdx: number, char: string = String.fromCharCode(65 + colorIdx)): Bubble => ({
  colorIdx,
  char,
});

const sortPairs = (cells: Array<[number, number]>): Array<[number, number]> =>
  [...cells].sort((p, q) => p[0] - q[0] || p[1] - q[1]);

describe('collectMatch', () => {
  test('empty cell returns []', () => {
    const grid: GameGrid = [[null, null]];
    expect(collectMatch(grid, 2, 0, 0)).toEqual([]);
  });

  test('lone bubble returns []', () => {
    const grid: GameGrid = [[b(0), null, null]];
    expect(collectMatch(grid, 3, 0, 0)).toEqual([]);
  });

  test('horizontal run of two same-char pops both', () => {
    const grid: GameGrid = [[b(0, 'A'), b(0, 'A'), null]];
    const out = sortPairs(collectMatch(grid, 3, 0, 0));
    expect(out).toEqual([[0, 0], [1, 0]]);
  });

  test('vertical run of two same-char pops both', () => {
    const grid: GameGrid = [
      [b(0, 'A'), null],
      [b(0, 'A'), null],
    ];
    const out = sortPairs(collectMatch(grid, 2, 0, 0));
    expect(out).toEqual([[0, 0], [0, 1]]);
  });

  test('cluster of three same-color pops all three (different chars)', () => {
    const grid: GameGrid = [
      [b(0, 'A'), b(0, 'B'), null],
      [b(0, 'C'), null,       null],
    ];
    const out = sortPairs(collectMatch(grid, 3, 0, 0));
    expect(out).toEqual([[0, 0], [0, 1], [1, 0]]);
  });

  test('cluster of two same-color does not pop (cluster rule needs 3+)', () => {
    const grid: GameGrid = [
      [b(0, 'A'), b(0, 'B'), null],
    ];
    expect(collectMatch(grid, 3, 0, 0)).toEqual([]);
  });

  test('mixed run + cluster does not double-count cells', () => {
    const grid: GameGrid = [[b(0, 'A'), b(0, 'A'), b(0, 'A')]];
    const out = sortPairs(collectMatch(grid, 3, 1, 0));
    expect(out).toEqual([[0, 0], [1, 0], [2, 0]]);
  });

  test('grid edge: bottom-right cell still resolves correctly', () => {
    const grid: GameGrid = [
      [null, null, null],
      [null, b(0, 'A'), b(0, 'A')],
    ];
    const out = sortPairs(collectMatch(grid, 3, 2, 1));
    expect(out).toEqual([[1, 1], [2, 1]]);
  });
});

describe('collectFloaters', () => {
  test('empty grid returns []', () => {
    expect(collectFloaters([], 3)).toEqual([]);
  });

  test('chain anchored to top stays', () => {
    const grid: GameGrid = [
      [b(0), null],
      [b(0), null],
    ];
    expect(collectFloaters(grid, 2)).toEqual([]);
  });

  test('chain not connected to top floats', () => {
    const grid: GameGrid = [
      [null, null],
      [b(0), null],
    ];
    expect(collectFloaters(grid, 2)).toEqual([[0, 1]]);
  });

  test('all-floating grid returns all bubbles', () => {
    const grid: GameGrid = [
      [null, null],
      [b(0), b(1)],
    ];
    const out = sortPairs(collectFloaters(grid, 2));
    expect(out).toEqual([[0, 1], [1, 1]]);
  });
});

describe('popCell / popGroup', () => {
  test('popCell clears the slot and pushes a pop animation', () => {
    const state = makeState({
      grid: [[b(0, 'A'), null]],
      slotCols: 2,
      startSlotCol: 5,
      startSlotRow: 0,
    });
    const out = popCell(state, 0, 0, 'match', 1000);
    expect(out).toEqual({ col: 5, row: 0 });
    expect(state.grid[0]![0]).toBeNull();
    expect(state.popping).toHaveLength(1);
    expect(state.popping[0]!.tStart).toBe(1000);
  });

  test('popCell on empty slot returns null and does not push', () => {
    const state = makeState({ grid: [[null]], slotCols: 1 });
    const out = popCell(state, 0, 0, 'match', 0);
    expect(out).toBeNull();
    expect(state.popping).toHaveLength(0);
  });

  test('popGroup returns averaged centroid of popped cells', () => {
    const state = makeState({
      grid: [[b(0, 'A'), b(0, 'A'), b(0, 'A')]],
      slotCols: 3,
      startSlotCol: 0,
      startSlotRow: 0,
    });
    const out = popGroup(state, [[0, 0], [1, 0], [2, 0]], 'match', 0);
    expect(out).toEqual({ col: 1, row: 0 });
    expect(state.grid[0]).toEqual([null, null, null]);
  });
});

describe('isLose / checkLose', () => {
  test('isLose false when no bubble crosses dangerY', () => {
    const grid: GameGrid = [[b(0)]];
    expect(isLose(grid, 1, 0, 100, 18)).toBe(false);
  });

  test('isLose true when a bubble crosses dangerY', () => {
    const grid: GameGrid = [[null], [b(0)]];
    expect(isLose(grid, 1, 0, 20, 18)).toBe(true);
  });

  test('checkLose mirrors isLose into state.gameOver', () => {
    const state = makeState({
      grid: [[null], [b(0)]],
      slotCols: 1,
      startSlotRow: 0,
      cellH: 18,
      dangerY: 20,
      gameOver: false,
    });
    checkLose(state);
    expect(state.gameOver).toBe(true);
  });

  test('checkLose is idempotent once gameOver is set', () => {
    const state = makeState({ gameOver: true });
    checkLose(state);
    expect(state.gameOver).toBe(true);
  });
});
