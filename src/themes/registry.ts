import { base } from './base';
import type { Theme } from './types';

/**
 * Every theme the site can show, by id. Only the default theme is bundled
 * eagerly; any other theme must be a dynamic import so its shaders are a
 * separate chunk that visitors outside its window never download:
 *
 *   winter: () => import('./winter').then((m) => m.winter),
 */
export const THEMES: Readonly<Record<string, () => Promise<Theme>>> = {
  base: async () => base,
};

export const isKnownTheme = (id: string): boolean => Object.hasOwn(THEMES, id);
