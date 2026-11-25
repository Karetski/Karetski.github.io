import type { ThemeSnapshot } from '../theme/types';
import { colorToStr } from '../theme/palette';
import { drawBoxChar, isBoxChar } from './box-chars';
import { FONT_FAMILY, FONT_PX } from '../layout/compute';

interface CellPaint {
  char: string;
  colorStr: string;
}

export interface CellBuffer {
  put(col: number, row: number, char: string, color: readonly number[]): void;
  clear(col: number, row: number): void;
  beginFrame(theme: ThemeSnapshot): void;
  flush(): void;
  resize(w: number, h: number, dpr: number, theme: ThemeSnapshot): void;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
}

export const createCellBuffer = (
  cellW: () => number,
  cellH: () => number,
): CellBuffer => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false })!;

  let frameTheme: ThemeSnapshot | null = null;
  // Map keyed by `row * 1e6 + col` (cols never exceed ~1e4 in practice).
  let writes = new Map<number, CellPaint>();
  let rendered = new Map<number, CellPaint>();

  const restoreContextDefaults = (): void => {
    ctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'middle';
  };

  const buf: CellBuffer = {
    canvas,
    ctx,

    put(col, row, char, color) {
      if (col < 0 || row < 0) return;
      writes.set(row * 1_000_000 + col, { char, colorStr: colorToStr(color) });
    },

    clear(col, row) {
      writes.delete(row * 1_000_000 + col);
    },

    beginFrame(theme) {
      if (frameTheme && frameTheme !== theme && frameTheme.bg !== theme.bg) {
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        rendered = new Map();
      }
      frameTheme = theme;
      writes = new Map();
    },

    flush() {
      if (!frameTheme) return;
      const w = cellW();
      const h = cellH();
      ctx.fillStyle = frameTheme.bg;

      // 1. Clear cells that were rendered last frame but aren't this frame.
      for (const key of rendered.keys()) {
        if (writes.has(key)) continue;
        const row = (key / 1_000_000) | 0;
        const col = key - row * 1_000_000;
        ctx.fillRect(col * w, row * h, w, h);
      }

      // 2. Paint cells that are new or changed.
      for (const [key, paint] of writes) {
        const prev = rendered.get(key);
        if (prev && prev.char === paint.char && prev.colorStr === paint.colorStr) continue;
        const row = (key / 1_000_000) | 0;
        const col = key - row * 1_000_000;
        const cx = col * w;
        const cy = row * h;
        ctx.fillStyle = frameTheme.bg;
        ctx.fillRect(cx, cy, w, h);
        ctx.fillStyle = paint.colorStr;
        if (isBoxChar(paint.char)) {
          drawBoxChar(ctx, paint.char, cx, cy, w, h);
        } else {
          ctx.fillText(paint.char, cx, cy + h / 2);
        }
      }

      rendered = writes;
    },

    resize(w, h, _dpr, theme) {
      canvas.width = w;
      canvas.height = h;
      restoreContextDefaults();
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, w, h);
      // Discard previously-rendered cell map; everything must repaint.
      rendered = new Map();
    },
  };

  restoreContextDefaults();
  return buf;
};
