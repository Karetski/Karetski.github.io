import type { RGB } from '../../shared/types';
import type { Layout } from '../../framework/layout/types';
import { regionContains } from '../../framework/layout/types';
import type { CellBuffer } from '../../framework/renderer/cell-buffer';
import type { ThemeSnapshot } from '../../framework/theme/types';
import {
  applyBrightness,
  colorToStr,
  dampenedPalette,
  lerpPalette,
} from '../../framework/theme/palette';
import type { FlashRenderState } from '../../framework/scene/flash';
import { desaturate, dimToBg, hash3, smoothstep01 } from '../../shared/math';
import { sampleColorIndex, sampleFlipProb } from './noise';
import { RIPPLE_RADIUS, SAT_LEVELS, TRAIL_TAU, randChar } from './constants';

export interface FieldOptions {
  // Calmer flip / dampened palette around a playfield (used by the play page).
  calmField: boolean;
}

interface FieldCell {
  char: string;
  colorIndex: number;
  color: number[];
  colorStr: string;
  heat: number;
  flipTime: number;
  satLevel: number;
  distNorm: number;
  fadeNoise: number;
  visibility: number;
}

const computeVisibility = (
  distNorm: number,
  fadeNoise: number,
  centerFade: number,
  centerFadeNoise: number,
): number => {
  if (centerFade <= 0) return 1;
  const jittered = distNorm + fadeNoise * centerFadeNoise;
  const t = smoothstep01(jittered);
  return 1 - (1 - t) * centerFade;
};

export class BackgroundField {
  private cells: FieldCell[] = [];
  private cols = 0;
  private rows = 0;
  private cellW = 0;
  private cellH = 0;

  constructor(private opts: FieldOptions) {}

  layoutChanged(layout: Layout, theme: ThemeSnapshot): void {
    if (layout.cols === this.cols && layout.rows === this.rows
        && layout.cellW === this.cellW && layout.cellH === this.cellH) {
      // Just region/playfield update — re-color cells against the new palette.
      this.recolor(layout, theme);
      return;
    }
    this.cols = layout.cols;
    this.rows = layout.rows;
    this.cellW = layout.cellW;
    this.cellH = layout.cellH;
    this.rebuild(layout, theme);
  }

  themeChanged(layout: Layout, theme: ThemeSnapshot): void {
    if (!this.cells.length) return;
    this.recolor(layout, theme);
  }

  private rebuild(layout: Layout, theme: ThemeSnapshot): void {
    const { cols, rows, cellW, cellH, viewportW: W, viewportH: H } = layout;
    const cx0 = W * 0.5;
    const cy0 = H * 0.5;
    const maxR = Math.max(1, Math.hypot(cx0, cy0));
    const config = theme.config;
    const playfield = layout.regions.get('playfield');
    const now = performance.now();
    const next: FieldCell[] = new Array(cols * rows);

    for (let i = 0; i < next.length; i++) {
      const r = (i / cols) | 0;
      const c = i - r * cols;
      const inPlay = regionContains(playfield, c, r);
      const palette = this.pickPalette(theme, inPlay);
      const colorIndex = sampleColorIndex(config, theme.vivid.length, c, r, now);
      const color = applyBrightness(palette[colorIndex]!, config.brightnessVar);
      const px = c * cellW + cellW * 0.5;
      const py = r * cellH + cellH * 0.5;
      const distNorm = Math.min(1, Math.hypot(px - cx0, py - cy0) / maxR);
      const fadeNoise = (hash3(c, r, 31) - 0.5) * 2;
      next[i] = {
        char: randChar(colorIndex),
        colorIndex,
        color,
        colorStr: colorToStr(color),
        heat: 0,
        flipTime: now,
        satLevel: SAT_LEVELS,
        distNorm,
        fadeNoise,
        visibility: computeVisibility(distNorm, fadeNoise, config.centerFade, config.centerFadeNoise),
      };
    }
    this.cells = next;
  }

  private recolor(layout: Layout, theme: ThemeSnapshot): void {
    const { cols } = layout;
    const config = theme.config;
    const playfield = layout.regions.get('playfield');
    const innerP = this.pickPalette(theme, true);
    const outerP = this.pickPalette(theme, false);
    const now = performance.now();
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]!;
      const r = (i / cols) | 0;
      const c = i - r * cols;
      const inPlay = regionContains(playfield, c, r);
      const palette = inPlay ? innerP : outerP;
      cell.color = applyBrightness(palette[cell.colorIndex]!, config.brightnessVar);
      cell.colorStr = colorToStr(cell.color);
      cell.flipTime = now;
      cell.satLevel = SAT_LEVELS;
      cell.visibility = computeVisibility(cell.distNorm, cell.fadeNoise, config.centerFade, config.centerFadeNoise);
    }
  }

  private pickPalette(theme: ThemeSnapshot, inPlay: boolean): readonly RGB[] | number[][] {
    if (!this.opts.calmField) return theme.vivid;
    return dampenedPalette(theme.vivid, theme.bgLevel, inPlay);
  }

  applyHeatAt(px: number, py: number): void {
    if (!this.cells.length) return;
    const { cellW, cellH, cols, rows } = this;
    const minR = Math.max(0, Math.floor((py - RIPPLE_RADIUS) / cellH));
    const maxR = Math.min(rows - 1, Math.ceil((py + RIPPLE_RADIUS) / cellH));
    const minC = Math.max(0, Math.floor((px - RIPPLE_RADIUS) / cellW));
    const maxC = Math.min(cols - 1, Math.ceil((px + RIPPLE_RADIUS) / cellW));
    const r2 = RIPPLE_RADIUS * RIPPLE_RADIUS;
    const halfW = cellW * 0.5;
    const halfH = cellH * 0.5;

    for (let r = minR; r <= maxR; r++) {
      const cy = r * cellH + halfH;
      for (let c = minC; c <= maxC; c++) {
        const cx = c * cellW + halfW;
        const dx = cx - px;
        const dy = cy - py;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const cell = this.cells[r * cols + c]!;
        // Quadratic falloff: cells near the pointer stay near full
        // intensity while outer cells drop off sharply.
        const linear = 1 - Math.sqrt(d2) / RIPPLE_RADIUS;
        const t = linear * linear;
        if (t > cell.heat) cell.heat = t;
      }
    }
  }

  // Per-frame: flip cells, age saturation, decay heat. Then paint into cells.
  step(
    cells: CellBuffer,
    layout: Layout,
    theme: ThemeSnapshot,
    flash: FlashRenderState,
    dt: number,
    now: number,
  ): void {
    if (!this.cells.length) return;
    const { cols, rows } = this;
    const config = theme.config;
    const decay = Math.exp(-dt / TRAIL_TAU);
    const playfield = layout.regions.get('playfield');

    let outerPalette = this.pickPalette(theme, false);
    const innerPalette = this.pickPalette(theme, true);
    if (this.opts.calmField && !!flash.intensity && flash.intensity > 0.001) {
      // Outside the playfield, lerp the dampened outer palette toward the
      // un-dampened (vivid) palette by the flash envelope so newly flipped
      // cells smoothly track the splash.
      outerPalette = lerpPalette(theme.vivid, outerPalette as number[][], flash.intensity);
    }
    const flashBaseP = (flash.active || flash.cleanup) ? theme.vivid : null;

    const agingActive = config.agingHalfLife > 0;
    const agingDecay = agingActive ? 1 / (config.agingHalfLife * 1000) : 0;
    const fadeActive = config.centerFade > 0;
    const bg = theme.bgLevel;

    for (let r = 0; r < rows; r++) {
      const inPlayRow = !!(playfield && r >= playfield.row && r < playfield.row + playfield.height);
      for (let c = 0; c < cols; c++) {
        const cell = this.cells[r * cols + c]!;
        const inPlay = inPlayRow && c >= playfield!.col && c < playfield!.col + playfield!.width;
        const palette = inPlay ? innerPalette : outerPalette;

        // Flip decision.
        let baseFlipProb = sampleFlipProb(config, c, r, now, dt);
        if (!inPlay && flash.flipMul > 1) baseFlipProb *= flash.flipMul;
        const flipProb = Math.min(1, baseFlipProb + cell.heat);
        if (Math.random() < flipProb) {
          // Strong heat occasionally yanks the color slot off the noise field
          // so disturbed cells visibly shuffle palette, not just chars.
          const colorIndex = cell.heat > 0 && Math.random() < cell.heat * 0.6
            ? (Math.random() * palette.length) | 0
            : sampleColorIndex(config, theme.vivid.length, c, r, now);
          if (colorIndex !== cell.colorIndex) {
            cell.colorIndex = colorIndex;
            cell.color = applyBrightness(palette[colorIndex]!, config.brightnessVar);
            cell.colorStr = colorToStr(cell.color);
          }
          cell.char = randChar(colorIndex);
          cell.flipTime = now;
          cell.satLevel = SAT_LEVELS;
        }

        if (cell.heat > 0) {
          cell.heat *= decay;
          if (cell.heat < 0.02) cell.heat = 0;
        }

        // Compose draw color: aging (qf = satLevel/SAT_LEVELS) + radial
        // fade (visibility) + flash live-blend toward vivid (when active).
        let qf = 1;
        if (agingActive) {
          const factor = Math.pow(0.5, (now - cell.flipTime) * agingDecay);
          const level = Math.round(factor * SAT_LEVELS);
          if (level !== cell.satLevel) cell.satLevel = level;
          qf = level / SAT_LEVELS;
        }
        const vis = fadeActive ? cell.visibility : 1;
        const opacity = qf * vis;

        const flashThisCell = flash.active && !inPlay;
        let baseColor: number[] | readonly number[] = cell.color;
        if (flashThisCell && flashBaseP) {
          const v = flashBaseP[cell.colorIndex]!;
          const t = flash.intensity;
          baseColor = [
            cell.color[0]! + (v[0] - cell.color[0]!) * t,
            cell.color[1]! + (v[1] - cell.color[1]!) * t,
            cell.color[2]! + (v[2] - cell.color[2]!) * t,
          ];
        }

        let drawColor: number[] | readonly number[] = baseColor;
        if (qf < 1 || vis < 1 || flashThisCell) {
          const colorIn = this.opts.calmField ? desaturate(baseColor, qf) : baseColor;
          drawColor = dimToBg(colorIn, opacity, bg);
        }

        cells.put(c, r, cell.char, drawColor);
      }
    }
  }
}
