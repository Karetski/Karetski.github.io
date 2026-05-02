import { describe, expect, test } from 'bun:test';

describe('bun test runner', () => {
  test('arithmetic still works', () => {
    expect(1 + 1).toBe(2);
  });
});
