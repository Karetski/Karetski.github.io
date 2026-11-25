import { describe, expect, test } from 'vitest';
import { DEFAULT_THEME, pickThemeId, type ThemeWindow } from './schedule';

const KNOWN = new Set(['base', 'winter', 'new-year', 'spring']);
const isKnown = (id: string): boolean => KNOWN.has(id);
const on = (month: number, day: number): Date => new Date(2026, month - 1, day, 12);

const SCHEDULE: readonly ThemeWindow[] = [
  { theme: 'new-year', from: '12-31', to: '01-01' },
  { theme: 'winter', from: '12-01', to: '02-28' },
  { theme: 'spring', from: '03-20', to: '05-31' },
];

describe('pickThemeId', () => {
  test('given no matching window, then the default theme is used', () => {
    expect(pickThemeId(on(7, 4), SCHEDULE, null, isKnown)).toBe(DEFAULT_THEME);
  });

  test('given a date inside a window, then that theme is used', () => {
    expect(pickThemeId(on(4, 10), SCHEDULE, null, isKnown)).toBe('spring');
  });

  test('given window edges, then both ends are inclusive', () => {
    expect(pickThemeId(on(3, 20), SCHEDULE, null, isKnown)).toBe('spring');
    expect(pickThemeId(on(5, 31), SCHEDULE, null, isKnown)).toBe('spring');
    expect(pickThemeId(on(6, 1), SCHEDULE, null, isKnown)).toBe(DEFAULT_THEME);
  });

  test('given a window that wraps the year, then dates on both sides match', () => {
    expect(pickThemeId(on(12, 15), SCHEDULE, null, isKnown)).toBe('winter');
    expect(pickThemeId(on(2, 10), SCHEDULE, null, isKnown)).toBe('winter');
  });

  test('given overlapping windows, then the first listed wins', () => {
    expect(pickThemeId(on(1, 1), SCHEDULE, null, isKnown)).toBe('new-year');
  });

  test('given a known override, then it beats the schedule', () => {
    expect(pickThemeId(on(4, 10), SCHEDULE, 'winter', isKnown)).toBe('winter');
  });

  test('given an unknown override or scheduled id, then it is ignored', () => {
    expect(pickThemeId(on(4, 10), SCHEDULE, 'nope', isKnown)).toBe('spring');
    const ghost: ThemeWindow[] = [{ theme: 'ghost', from: '01-01', to: '12-31' }];
    expect(pickThemeId(on(4, 10), ghost, null, isKnown)).toBe(DEFAULT_THEME);
  });
});
