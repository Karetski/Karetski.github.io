import { describe, expect, test } from 'bun:test';
import { aimAngle, reflectX, findSnapSlot } from './physics';
import type { Bubble, GameGrid } from './state';

const b = (colorIdx: number = 0): Bubble => ({ colorIdx, char: 'A' });

describe('aimAngle', () => {
  test('straight up returns -π/2', () => {
    expect(aimAngle(0, -10, 0, 0)).toBeCloseTo(-Math.PI / 2, 6);
  });

  test('clamps a hard-left target to -π/2 - aimLimit', () => {
    const limit = Math.PI / 4;
    const out = aimAngle(-100, 0, 0, 0, limit);
    expect(out).toBeCloseTo(-Math.PI / 2 - limit, 6);
  });

  test('clamps a hard-right target to -π/2 + aimLimit', () => {
    const limit = Math.PI / 4;
    const out = aimAngle(100, 0, 0, 0, limit);
    expect(out).toBeCloseTo(-Math.PI / 2 + limit, 6);
  });

  test('forces dy to be at least -1 so a horizontal pointer still aims slightly up', () => {
    // Pointer at the same y as the shooter — dy is forced to -1, so the
    // angle still has a tiny upward component instead of pointing flat.
    const out = aimAngle(10, 0, 0, 0, Math.PI);
    expect(out).toBeLessThan(0);
  });
});

describe('reflectX', () => {
  test('left wall flips vx and clamps x to leftBound + halfW', () => {
    const out = reflectX(0, -5, 10, 100, 4);
    expect(out.x).toBe(14);
    expect(out.vx).toBe(5);
  });

  test('right wall flips vx and clamps x to rightBound - halfW', () => {
    const out = reflectX(110, 5, 10, 100, 4);
    expect(out.x).toBe(96);
    expect(out.vx).toBe(-5);
  });

  test('mid-field returns inputs unchanged', () => {
    const out = reflectX(50, 5, 10, 100, 4);
    expect(out).toEqual({ x: 50, vx: 5 });
  });
});

describe('findSnapSlot', () => {
  // Geometry shared across these cases — keep it small and round so the
  // pixel ↔ slot mapping is easy to reason about.
  const cellW = 10;
  const cellH = 10;
  const startSlotCol = 0;
  const startSlotRow = 0;

  test('direct hit on an empty cell returns that slot', () => {
    const grid: GameGrid = [[null, null, null]];
    // Slot (1, 0) centre = (15, 5).
    const out = findSnapSlot(grid, 3, 15, 5, startSlotCol, startSlotRow, cellW, cellH);
    expect(out).toEqual([1, 0]);
  });

  test('near-miss snaps to the nearest empty neighbour', () => {
    // Slot (1, 0) is occupied; projectile a bit left of its centre should
    // snap to (0, 0).
    const grid: GameGrid = [[null, b(), null]];
    const out = findSnapSlot(grid, 3, 11, 5, startSlotCol, startSlotRow, cellW, cellH);
    expect(out).toEqual([0, 0]);
  });

  test("returns a slot in row tj±1 when rows don't yet exist (treats them as empty)", () => {
    // Empty grid; projectile at row j=2's centre (y=25). Expect a slot in
    // band [tj-1, tj+1] = [1, 3].
    const grid: GameGrid = [];
    const out = findSnapSlot(grid, 3, 5, 25, startSlotCol, startSlotRow, cellW, cellH);
    expect(out).not.toBeNull();
    const [, j] = out!;
    expect(Math.abs(j - 2)).toBeLessThanOrEqual(1);
  });
});
