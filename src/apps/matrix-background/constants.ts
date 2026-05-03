export const SAT_LEVELS = 12;
export const RIPPLE_RADIUS = 120;
export const TRAIL_TAU = 700;

export const NOISE_TIME_BASE = 0.0002;
export const COLOR_NOISE_Z_STRIDE = 7919;

export const CHARSETS: readonly string[] = [
  '1234567890@#$%&?=+*/',
  'ｹｻｽｾﾀﾁﾃﾄﾅﾆﾇﾈﾊﾋﾌﾍﾎﾏﾐﾑ',
  'abcEFghkLmoQrStUWXyZ',
];

export const randChar = (colorIndex: number): string => {
  const set = CHARSETS[colorIndex] ?? CHARSETS[0]!;
  return set[(Math.random() * set.length) | 0]!;
};
