/**
 * A calendar window during which a theme is active. Dates are 'MM-DD' in the
 * visitor's local time, inclusive on both ends. A window whose `from` is later
 * than its `to` wraps the new year (e.g. '12-20' → '01-06').
 */
export interface ThemeWindow {
  readonly theme: string;
  readonly from: string;
  readonly to: string;
}

export const DEFAULT_THEME = 'base';

/** First matching window wins, so list narrow occasions before broad seasons. */
export const SCHEDULE: readonly ThemeWindow[] = [];

const monthDay = (date: Date): string =>
  `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const contains = (w: ThemeWindow, md: string): boolean =>
  w.from <= w.to ? md >= w.from && md <= w.to : md >= w.from || md <= w.to;

/**
 * Choose the theme id for a visit: a known `override` (the `?theme=` query
 * parameter) wins, then the first schedule window containing `date`, then the
 * default theme.
 */
export const pickThemeId = (
  date: Date,
  schedule: readonly ThemeWindow[],
  override: string | null,
  isKnown: (id: string) => boolean,
): string => {
  if (override !== null && isKnown(override)) return override;
  const md = monthDay(date);
  return schedule.find((w) => contains(w, md) && isKnown(w.theme))?.theme ?? DEFAULT_THEME;
};
