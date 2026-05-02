// Box-drawing chars are rendered as 1px fillRect strokes so borders stay
// pixel-perfect across font fallbacks (Sometype Mono and any fallback shifts
// these glyphs around just enough to look crooked at the join between cells).
// Double-line chars use a 1+1+1 pattern (stroke / gap / stroke) centred on
// the cell midpoint.

export const FRAME_BORDER_CHARS = '╔╗╚╝║═╠╣╦╩╬';

export const isBoxChar = (ch: string): boolean =>
  FRAME_BORDER_CHARS.indexOf(ch) >= 0;

export const drawBoxChar = (
  ctx: CanvasRenderingContext2D,
  ch: string,
  cx: number,
  cy: number,
  cellW: number,
  cellH: number,
): void => {
  const xC = Math.round(cx + cellW / 2);
  const yC = Math.round(cy + cellH / 2);
  const xL = Math.round(cx);
  const xR = Math.round(cx + cellW);
  const yT = Math.round(cy);
  const yB = Math.round(cy + cellH);
  const hRow = (y: number, x0: number, x1: number) => ctx.fillRect(x0, y, x1 - x0, 1);
  const vCol = (x: number, y0: number, y1: number) => ctx.fillRect(x, y0, 1, y1 - y0);
  switch (ch) {
    case '═':
      hRow(yC - 1, xL, xR);
      hRow(yC + 1, xL, xR);
      break;
    case '║':
      vCol(xC - 1, yT, yB);
      vCol(xC + 1, yT, yB);
      break;
    case '╔':
      hRow(yC - 1, xC - 1, xR);
      hRow(yC + 1, xC + 1, xR);
      vCol(xC - 1, yC - 1, yB);
      vCol(xC + 1, yC + 1, yB);
      break;
    case '╗':
      hRow(yC - 1, xL, xC + 2);
      hRow(yC + 1, xL, xC);
      vCol(xC + 1, yC - 1, yB);
      vCol(xC - 1, yC + 1, yB);
      break;
    case '╚':
      hRow(yC + 1, xC - 1, xR);
      hRow(yC - 1, xC + 1, xR);
      vCol(xC - 1, yT, yC + 2);
      vCol(xC + 1, yT, yC);
      break;
    case '╝':
      hRow(yC + 1, xL, xC + 2);
      hRow(yC - 1, xL, xC);
      vCol(xC + 1, yT, yC + 2);
      vCol(xC - 1, yT, yC);
      break;
    case '╠':
      vCol(xC - 1, yT, yB);
      vCol(xC + 1, yT, yC - 1);
      vCol(xC + 1, yC + 2, yB);
      hRow(yC - 1, xC + 1, xR);
      hRow(yC + 1, xC + 1, xR);
      break;
    case '╣':
      vCol(xC + 1, yT, yB);
      vCol(xC - 1, yT, yC - 1);
      vCol(xC - 1, yC + 2, yB);
      hRow(yC - 1, xL, xC);
      hRow(yC + 1, xL, xC);
      break;
    case '╦':
      hRow(yC - 1, xL, xR);
      hRow(yC + 1, xL, xC - 1);
      hRow(yC + 1, xC + 2, xR);
      vCol(xC - 1, yC + 1, yB);
      vCol(xC + 1, yC + 1, yB);
      break;
    case '╩':
      hRow(yC + 1, xL, xR);
      hRow(yC - 1, xL, xC - 1);
      hRow(yC - 1, xC + 2, xR);
      vCol(xC - 1, yT, yC);
      vCol(xC + 1, yT, yC);
      break;
    case '╬':
      // Each arm's strokes break at the central 3×3 region so opposing arms
      // don't pile ink at the centre — that pile-up is what made the font
      // glyph read heavier than its peers.
      hRow(yC - 1, xL, xC - 1);
      hRow(yC - 1, xC + 2, xR);
      hRow(yC + 1, xL, xC - 1);
      hRow(yC + 1, xC + 2, xR);
      vCol(xC - 1, yT, yC - 1);
      vCol(xC - 1, yC + 2, yB);
      vCol(xC + 1, yT, yC - 1);
      vCol(xC + 1, yC + 2, yB);
      break;
  }
};
