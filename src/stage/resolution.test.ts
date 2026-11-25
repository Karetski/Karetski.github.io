import { describe, expect, test } from 'vitest';
import { SCALE_STEPS, createScaleController } from './resolution';

const feed = (c: ReturnType<typeof createScaleController>, ms: number, n: number): number => {
  let changes = 0;
  for (let i = 0; i < n; i++) if (c.sample(ms)) changes++;
  return changes;
};

describe('adaptive render scale', () => {
  test('given steady 60 fps, then it stays at full resolution', () => {
    const c = createScaleController();
    expect(feed(c, 16.7, 2000)).toBe(0);
    expect(c.scale).toBe(1);
  });

  test('given sustained 30 fps, then it steps down to the floor and stops', () => {
    const c = createScaleController();
    feed(c, 33, 2000);
    expect(c.scale).toBe(SCALE_STEPS[SCALE_STEPS.length - 1]!);
  });

  test('given a single long pause, then it does not react', () => {
    const c = createScaleController();
    feed(c, 16.7, 100);
    c.sample(5000);
    feed(c, 16.7, 100);
    expect(c.scale).toBe(1);
  });

  test('given a brief slow burst, then it does not step down', () => {
    const c = createScaleController();
    feed(c, 40, 10);
    feed(c, 16.7, 200);
    expect(c.scale).toBe(1);
  });

  test('given it stepped down and frames become fast, then it recovers one step at a time', () => {
    const c = createScaleController();
    feed(c, 33, 2000);
    feed(c, 8.3, 400);
    expect(c.scale).toBe(SCALE_STEPS[SCALE_STEPS.length - 2]!);
    feed(c, 8.3, 400);
    expect(c.scale).toBe(1);
  });
});
