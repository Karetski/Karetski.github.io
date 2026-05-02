import { AIM_REACH_CELLS, NUM_COLORS, POP_DURATION_MS } from './constants';
import { state, requireM } from './state';
import { sectionWidths } from './layout';
import { burstDuration } from './bursts';
import { blendToBg } from '../shared/math';

const slotToCell = (i: number, j: number) => ({
  col: state.startSlotCol + i,
  row: state.startSlotRow + j,
});

export const render = (): void => {
  const M = requireM();
  const writes = new Map<string, { char: string; color: number[] | readonly number[] }>();
  const bubbleKeys = new Set<string>();
  const frameKeys = new Set<string>();
  const put = (col: number, row: number, char: string, color: number[] | readonly number[]) => {
    if (col < 0 || col >= state.cols || row < 0 || row >= state.rows) return;
    writes.set(col + ',' + row, { char, color });
  };

  // Bubbles.
  for (let j = 0; j < state.grid.length; j++) {
    for (let i = 0; i < state.slotCols; i++) {
      const cell = state.grid[j]![i];
      if (!cell) continue;
      const c = slotToCell(i, j);
      bubbleKeys.add(c.col + ',' + c.row);
      put(c.col, c.row, cell.char, M.vividColor(cell.colorIdx));
    }
  }

  const frameColor = M.titleColor();
  const sepColor   = M.sepColor();
  const link       = M.linkColor();

  // Bottom HUD: a single bordered 5-row strip the same width as the
  // buttons panel. Top inner row holds queue|current|score, bottom inner
  // row holds bursts|level. The shared mid-row carries ╩/╬ junctions
  // depending on whether each HUD divider continues into the status row.
  if (!state.gameOver) {
    const hudTop   = state.panelTop - 5;
    const innerRow = hudTop + 1;
    const midRow   = hudTop + 2;
    const lowerRow = hudTop + 3;
    const botRow   = hudTop + 4;
    const widths   = sectionWidths(state.panelWidth, 3);
    const queueW = widths[0]!, currentW = widths[1]!, scoreW = widths[2]!;
    const queueLeft   = state.panelLeft;
    const currentLeft = queueLeft + queueW - 1;
    const scoreLeft   = currentLeft + currentW - 1;  // == levelSectLeft
    const totalRight  = state.panelLeft + state.panelWidth - 1;

    // Top + bottom borders (corners at outer ends, ═ in between).
    for (let x = 0; x < state.panelWidth; x++) {
      const col = state.panelLeft + x;
      let topCh = '═', botCh = '═';
      if (x === 0) { topCh = '╔'; botCh = '╚'; }
      else if (x === state.panelWidth - 1) { topCh = '╗'; botCh = '╝'; }
      put(col, hudTop, topCh, frameColor);
      put(col, botRow, botCh, frameColor);
      frameKeys.add(col + ',' + hudTop);
      frameKeys.add(col + ',' + botRow);
    }
    // T-junctions on the top edge: HUD dividers at currentLeft + scoreLeft.
    // On the bottom edge only the status row's divider (== scoreLeft via
    // levelSectLeft) surfaces.
    put(currentLeft, hudTop, '╦', frameColor);
    put(scoreLeft,   hudTop, '╦', frameColor);
    put(scoreLeft,   botRow, '╩', frameColor);

    // Mid border: ╠ at left, ╣ at right, ═ across, ╩ where the HUD-only
    // divider terminates (currentLeft) and ╬ where a divider continues
    // both directions (scoreLeft / levelSectLeft).
    for (let x = 0; x < state.panelWidth; x++) {
      const col = state.panelLeft + x;
      let ch = '═';
      if (x === 0) ch = '╠';
      else if (x === state.panelWidth - 1) ch = '╣';
      put(col, midRow, ch, frameColor);
      frameKeys.add(col + ',' + midRow);
    }
    put(currentLeft, midRow, '╩', frameColor);
    put(scoreLeft,   midRow, '╬', frameColor);

    // Inner rows: blank-fill so flipping bg can't bleed through, then
    // overwrite the side verticals + dividers.
    for (let x = 0; x < state.panelWidth; x++) {
      const col = state.panelLeft + x;
      put(col, innerRow, ' ', frameColor);
      put(col, lowerRow, ' ', frameColor);
    }
    put(queueLeft,  innerRow, '║', frameColor);
    put(totalRight, innerRow, '║', frameColor);
    put(currentLeft, innerRow, '║', sepColor);
    put(scoreLeft,   innerRow, '║', sepColor);
    frameKeys.add(queueLeft   + ',' + innerRow);
    frameKeys.add(totalRight  + ',' + innerRow);
    frameKeys.add(currentLeft + ',' + innerRow);
    frameKeys.add(scoreLeft   + ',' + innerRow);

    put(state.panelLeft, lowerRow, '║', frameColor);
    put(totalRight,      lowerRow, '║', frameColor);
    put(scoreLeft,       lowerRow, '║', sepColor);
    frameKeys.add(state.panelLeft + ',' + lowerRow);
    frameKeys.add(totalRight      + ',' + lowerRow);
    frameKeys.add(scoreLeft       + ',' + lowerRow);

    // HUD content.
    const placeCentred = (sectLeft: number, sectW: number, char: string | undefined, color: number[] | readonly number[]) => {
      if (!char) return;
      const cx = sectLeft + Math.floor(sectW / 2);
      put(cx, innerRow, char, color);
    };
    if (state.shooter.next) {
      placeCentred(queueLeft, queueW, state.shooter.next.char, M.vividColor(state.shooter.next.colorIdx));
    }
    if (state.shooter.current) {
      placeCentred(currentLeft, currentW, state.shooter.current.char, M.vividColor(state.shooter.current.colorIdx));
    }
    const scoreStr        = String(state.score);
    const scoreCenter     = scoreLeft + Math.floor(scoreW / 2);
    const scoreContentLeft = scoreCenter - Math.floor(scoreStr.length / 2);
    for (let i = 0; i < scoreStr.length; i++) {
      const col = scoreContentLeft + i;
      if (col <= scoreLeft || col >= scoreLeft + scoreW - 1) continue;
      put(col, innerRow, scoreStr[i]!, link);
    }

    // Persistent level readout, centred in the right (level) section of
    // the status row. Always on — bursts only render in the burst section
    // so the two never collide.
    const levelStr = 'lv' + state.level;
    const lvCenter = state.levelSectLeft + Math.floor(state.levelSectW / 2);
    const lvStart  = lvCenter - Math.floor(levelStr.length / 2);
    for (let i = 0; i < levelStr.length; i++) {
      const col = lvStart + i;
      if (col <= state.levelSectLeft || col >= totalRight) continue;
      put(col, lowerRow, levelStr[i]!, link);
    }
  }

  // Pop animation — strictly confined to the popped cell. Match pops start
  // as a bright '✶' burst, then a sparkle that cycles ✦ → ◇ → · while
  // flashing between title color and the bubble's hue, and fade in the last
  // third. Float pops drift down + fade.
  if (state.popping.length) {
    const now = performance.now();
    const isLight = M.isLight;
    const bg = isLight ? 255 : 0;
    const titleC = M.titleColor();

    for (let p = 0; p < state.popping.length; p++) {
      const pc = state.popping[p]!;
      const elapsed = now - pc.tStart;
      const t = Math.max(0, Math.min(1, elapsed / POP_DURATION_MS));

      if (pc.kind === 'match') {
        let glyph: string, baseColor: number[] | readonly number[], fadeMul: number;
        if (elapsed < 110) {
          glyph = '✶';
          baseColor = titleC;
          fadeMul = 1;
        } else {
          const phase = (Math.floor(elapsed / 70) & 1) === 0;
          baseColor = phase ? titleC : M.vividColor(pc.colorIdx);
          glyph = t < 0.55 ? '✦' : t < 0.8 ? '◇' : '·';
          fadeMul = t < 0.7 ? 1 : Math.max(0, (1 - t) / 0.3);
        }
        const color = blendToBg(baseColor, fadeMul, bg);
        const k = pc.col + ',' + pc.row;
        if (!writes.has(k) && !bubbleKeys.has(k)) put(pc.col, pc.row, glyph, color);
      } else {
        // Float: drift downward + fade.
        const drawRow = pc.row + Math.floor(t * 3);
        const fade = 1 - t;
        const color = blendToBg(M.vividColor(pc.colorIdx), fade, bg);
        const k = pc.col + ',' + drawRow;
        if (!writes.has(k) && !bubbleKeys.has(k)) put(pc.col, drawRow, pc.char, color);
      }
    }
  }

  // Single status-row burst, always centred in the burst section so the
  // text never jitters between events. Score "+N" opening-flashes then
  // fades; combo + level banners hold + colour-flash for the full window.
  if (state.activeBurst) {
    const pb = state.activeBurst;
    const dur = burstDuration(pb.kind);
    const now = performance.now();
    const elapsed = now - pb.tStart;
    const t = Math.max(0, Math.min(1, elapsed / dur));
    const isLight = M.isLight;
    const bg = isLight ? 255 : 0;
    const titleC = M.titleColor();
    const linkC  = M.linkColor();

    let baseColor: number[] | readonly number[];
    let fade: number;
    if (pb.kind === 'combo' || pb.kind === 'level') {
      const flashOn = (Math.floor(elapsed / 90) & 1) === 0;
      if (pb.kind === 'level') {
        const accent = M.vividColor(Math.floor(elapsed / 180) % NUM_COLORS);
        baseColor = flashOn ? titleC : accent;
      } else {
        baseColor = flashOn ? linkC : titleC;
      }
      if (t < 0.08)      fade = t / 0.08;
      else if (t < 0.7)  fade = 1;
      else               fade = Math.max(0, 1 - (t - 0.7) / 0.3);
    } else {
      baseColor = elapsed < 140 ? titleC : pb.color;
      fade = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
    }
    const color = blendToBg(baseColor, fade, bg);

    // Pad even-length texts with a trailing space so every burst is an
    // odd-length string. Centring on a discrete grid is exact for odd
    // lengths but always half a cell off for even ones — without padding,
    // "+6" would sit half a cell left of "+12" and friends.
    const text = pb.text.length % 2 === 0 ? pb.text + ' ' : pb.text;
    const minCol = state.burstSectLeft + 1;
    const maxCol = state.levelSectLeft - 1;
    const center = (minCol + maxCol) >> 1;
    let startCol = center - (text.length >> 1);
    if (startCol < minCol) startCol = minCol;
    if (startCol + text.length - 1 > maxCol) startCol = maxCol - text.length + 1;
    if (startCol < minCol) startCol = minCol;
    for (let i = 0; i < text.length; i++) {
      const col = startCol + i;
      if (col < minCol || col > maxCol) continue;
      if (frameKeys.has(col + ',' + state.lowerInnerRow)) continue;
      if (text[i] === ' ') continue;
      put(col, state.lowerInnerRow, text[i]!, color);
    }
  }

  // Aim line — Braille block glyphs (U+2800–U+28FF) render the ray with
  // sub-cell precision: each character cell is a 2×4 dot grid, and we OR
  // in the dot the trajectory passes through, so a slanted aim shows real
  // diagonal stepping inside cells instead of one centred bullet per cell.
  // Slides past frame cells and stops only on bubbles. Skipped while still
  // inside the HUD vertical band so steep angles don't overwrite HUD cells.
  if (!state.gameOver && state.shooter.current) {
    const aimColor = M.vividColor(state.shooter.current.colorIdx);
    const ceilingPx = state.startSlotRow * state.cellH;
    const subW = state.cellW / 2;
    const subH = state.cellH / 4;
    const sampleStep = Math.min(subW, subH) * 0.5;
    const maxLen = AIM_REACH_CELLS * state.cellH;
    const dx = Math.cos(state.shooter.angle);
    const dy = Math.sin(state.shooter.angle);
    const dotBits = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]];
    const masks = new Map<string, number>();
    for (let d = sampleStep; d <= maxLen; d += sampleStep) {
      const px = state.shooterPx + dx * d;
      const py = state.shooterPy + dy * d;
      if (py < ceilingPx) break;
      const col = Math.floor(px / state.cellW);
      const row = Math.floor(py / state.cellH);
      const k = col + ',' + row;
      if (frameKeys.has(k)) continue;
      if (bubbleKeys.has(k)) break;
      if (py >= state.dangerY) continue;
      const sx = Math.min(1, Math.max(0, Math.floor((px - col * state.cellW) / subW)));
      const sy = Math.min(3, Math.max(0, Math.floor((py - row * state.cellH) / subH)));
      masks.set(k, (masks.get(k) ?? 0) | dotBits[sx]![sy]!);
    }
    for (const [k, mask] of masks) {
      if (!mask) continue;
      const ix = k.indexOf(',');
      const col = +k.slice(0, ix);
      const row = +k.slice(ix + 1);
      put(col, row, String.fromCharCode(0x2800 + mask), aimColor);
    }
  }

  if (state.projectile) {
    const col = Math.floor(state.projectile.x / state.cellW);
    const row = Math.floor(state.projectile.y / state.cellH);
    put(col, row, state.projectile.char, M.vividColor(state.projectile.colorIdx));
  }

  if (state.gameOver) {
    const msg = `score ${state.score} — click to restart`;
    const startCol = Math.max(0, Math.floor((state.cols - msg.length) / 2));
    const midRow = Math.floor(state.rows / 2);
    for (let i = 0; i < msg.length; i++) {
      put(startCol + i, midRow, msg[i]!, link);
    }
  }

  for (const key of state.lastWritten) {
    if (!writes.has(key)) {
      const ix = key.indexOf(',');
      M.clearCell(+key.slice(0, ix), +key.slice(ix + 1));
    }
  }
  for (const [key, val] of writes) {
    const ix = key.indexOf(',');
    M.setCell(+key.slice(0, ix), +key.slice(ix + 1), val.char, val.color as number[]);
  }
  state.lastWritten = new Set(writes.keys());
};
