import type { RGB } from '../shared/types';

export const FONT_PX = 18;
export const LINE_HEIGHT = 1.0;
export const FONT_FAMILY = "'Sometype Mono', monospace";

export const SAT_LEVELS = 12;
export const RIPPLE_RADIUS = 180;
export const TRAIL_TAU = 700;

export const CHARSETS: readonly string[] = [
  '1234567890@#$%&?=+*/',
  'ｹｻｽｾﾀﾁﾃﾄﾅﾆﾇﾈﾊﾋﾌﾍﾎﾏﾐﾑ',
  'abcEFghkLmoQrStUWXyZ',
];

export const TITLE = 'Alexey Karetski';

export const COL_TITLE: RGB = [255, 255, 255];
export const COL_FRAME: RGB = [255, 255, 255];

export interface LinkSpec {
  label: string;
  href: string;
}

export const LINKS: readonly LinkSpec[] = [
  { label: 'linkedin', href: 'https://www.linkedin.com/in/karetski' },
  { label: 'github',   href: 'https://github.com/karetski' },
  { label: 'x',        href: 'https://x.com/karetski23' },
];

export const TOGGLE_DARK_LABEL = 'switch to dark';
export const TOGGLE_LIGHT_LABEL = 'switch to light';
export const NAV_PLAY_LABEL = 'play';
export const NAV_BACK_LABEL = 'back';

// Root-absolute so the link works from any depth (the bubble page lives in
// /play/, so a relative 'index.html' would resolve to /play/index.html).
export const NAV_HOME_HREF = '/index.html';
export const NAV_PLAY_HREF = '/play/bubble.html';

export const FRAME_PAD = 4;
export const FRAME_GAP = 1;
export const FRAME_CHARS = {
  tl: '╔', tr: '╗', bl: '╚', br: '╝',
  h:  '═', v:  '║',
} as const;
export const FRAME_BORDER_CHARS = '╔╗╚╝║═╠╣╦╩╬';

export const NOISE_TIME_BASE = 0.0002;
export const COLOR_NOISE_Z_STRIDE = 7919;

export const PLAY_BG_SAT = 0.05;
export const PLAY_BG_OPACITY_VISIBLE = 0.55;
export const PLAY_BG_OPACITY_FADED = 0.32;

export const THEME_KEY = 'ak.theme';

export const NUM_COLORS = 3;
