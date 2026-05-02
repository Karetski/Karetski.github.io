import { SAT_LEVELS, TRAIL_TAU } from './constants';
import { state, type Cell } from './state';
import { applyBrightness, getColorStr, getPalette, randChar } from './palette';
import { getBounds } from './playfield';
import { sampleColorIndex, sampleFlipProb } from './noise';
import { getThemeColors } from './theme';
import { drawBoxChar } from './box-chars';
import { stepPointer } from './pointer';
import { desaturate, dimToBg } from '../shared/math';
import { consumeFlashRenderParams, type FlashRenderParams } from './flash';

interface ComposeArgs {
  cell: Cell;
  now: number;
  agingActive: boolean;
  agingDecay: number;
  fadeActive: boolean;
  inPlay: boolean;
  flash: FlashRenderParams;
  bg: number;
}

const composeCellColor = ({
  cell, now, agingActive, agingDecay, fadeActive, inPlay, flash, bg,
}: ComposeArgs): string => {
  if (cell.locked) return cell.colorStr;

  let qf = 1;
  if (agingActive) {
    const factor = Math.pow(0.5, (now - cell.flipTime) * agingDecay);
    const level = Math.round(factor * SAT_LEVELS);
    if (level !== cell.satLevel) {
      cell.satLevel = level;
      cell.dirty = true;
    }
    qf = level / SAT_LEVELS;
  }
  const vis = fadeActive ? cell.visibility : 1;
  const opacity = qf * vis;

  const flashThisCell = flash.active && !inPlay;
  let baseColor: number[] | readonly number[] = cell.color;
  if (flashThisCell && flash.baseP) {
    const v = flash.baseP[cell.colorIndex]!;
    const t = flash.intensity;
    baseColor = [
      cell.color[0]! + (v[0] - cell.color[0]!) * t,
      cell.color[1]! + (v[1] - cell.color[1]!) * t,
      cell.color[2]! + (v[2] - cell.color[2]!) * t,
    ];
    cell.dirty = true;
  } else if (flash.cleanup && !inPlay) {
    cell.dirty = true;
  }

  if (qf < 1 || vis < 1 || flashThisCell) {
    const colorIn = state.isPlayMode ? desaturate(baseColor, qf) : baseColor;
    const aged = dimToBg(colorIn, opacity, bg);
    return getColorStr(aged);
  }
  return cell.colorStr;
};

export const updateAndDrawGrid = (gctx: CanvasRenderingContext2D, now: number): void => {
  const { config, cells, cellW, cellH, cols, rows } = state;
  const dt = state.lastFrameTime ? Math.min(now - state.lastFrameTime, 100) : 16.67;
  state.lastFrameTime = now;
  const decay = Math.exp(-dt / TRAIL_TAU);

  stepPointer();

  const outerPalette = getPalette(false);
  const innerPalette = state.isPlayMode ? getPalette(true) : outerPalette;
  const theme = getThemeColors();
  const pb = getBounds();
  const bg = state.isLightMode ? 255 : 0;

  // Flash live-blend: each frame, lerp every outer cell's stored colour
  // toward the un-dampened palette by `flashIntensity`. The cell.color
  // itself isn't mutated — only the displayed colour — so the flash leaves
  // no residue once the envelope returns to 0. composeCellColor consumes
  // flash.active/cleanup/baseP/intensity. The outer flip rate stays here
  // because it modulates the per-row probability, not per-cell colour.
  const flash = consumeFlashRenderParams();
  // Aging + radial fade run in both modes. In play mode they compose with
  // the per-palette desat/dim — cells start from the play palette (already
  // pre-dimmed) and age further toward the theme bg, so the field reads
  // as sparse twinkles around the playfield rather than a constant haze.
  const agingActive = config.agingHalfLife > 0;
  const agingDecay = agingActive ? 1 / (config.agingHalfLife * 1000) : 0;
  const fadeActive = config.centerFade > 0;

  for (let r = 0; r < rows; r++) {
    const cy = r * cellH;
    const inPlayRow = !!(pb && r >= pb.row && r < pb.row + pb.height);
    for (let c = 0; c < cols; c++) {
      const cell = cells[r * cols + c]!;
      const prevChar = cell.char;
      const inPlay = inPlayRow && pb && c >= pb.col && c < pb.col + pb.width;
      const palette = inPlay ? innerPalette : outerPalette;

      if (!cell.locked) {
        let baseFlipProb = sampleFlipProb(c, r, now, dt);
        if (!inPlay && flash.flipMul > 1) baseFlipProb *= flash.flipMul;
        // Heat boosts the flip rate so disturbed cells churn faster.
        const flipProb = Math.min(1, baseFlipProb + cell.heat);
        if (Math.random() < flipProb) {
          // Strong heat occasionally yanks the color slot off the noise
          // field so the trail visibly shuffles palette, not just chars.
          const colorIndex = cell.heat > 0 && Math.random() < cell.heat * 0.6
            ? (Math.random() * palette.length) | 0
            : sampleColorIndex(c, r, now);
          if (colorIndex !== cell.colorIndex) {
            cell.colorIndex = colorIndex;
            cell.color = applyBrightness(palette[colorIndex]!);
            cell.colorStr = getColorStr(cell.color);
          }
          cell.char = randChar(colorIndex);
          cell.flipTime = now;
          cell.satLevel = SAT_LEVELS;
        }
      }
      if (cell.heat > 0) {
        cell.heat *= decay;
        if (cell.heat < 0.02) cell.heat = 0;
      }

      // Compose two opacity terms into a single dimToBg pass: per-cell
      // saturation aging (vivid on flip, fading toward grayscale/bg with
      // age) and a static radial visibility (centre cells fade to bg,
      // edges stay bright). Locked cells (title/frame/links) skip both.
      const drawColorStr = composeCellColor({
        cell, now, agingActive, agingDecay, fadeActive,
        inPlay: !!inPlay, flash, bg,
      });

      if (cell.char === prevChar && !cell.dirty) continue;
      cell.dirty = false;

      const cx = c * cellW;
      gctx.save();
      gctx.beginPath();
      gctx.rect(cx, cy, cellW, cellH);
      gctx.clip();
      gctx.fillStyle = theme.bg;
      gctx.fillRect(cx, cy, cellW, cellH);
      gctx.fillStyle = drawColorStr;
      if (cell.isFrameBorder) {
        drawBoxChar(gctx, cell.char, cx, cy, cellW, cellH);
      } else {
        gctx.fillText(cell.char, cx, cy + cellH / 2);
      }
      gctx.restore();
    }
  }
};
