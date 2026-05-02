import { defaultConfig, type MatrixConfig } from './config';
import { state } from './state';
import { applyBrightness, getColorStr, getPalette, randChar, resetColorCache } from './palette';
import { isInPlayfield } from './playfield';
import { sampleColorIndex } from './noise';
import { computeVisibility } from './cells';
import { SAT_LEVELS } from './constants';
import type { CRTPipeline } from './crt';
import { setupGrid } from './layout';
import {
  fmt,
  makeColorRow,
  makeSection,
  makeSlider,
  rgbToHex,
  type SliderEntry,
} from './panel-controls';

export const setupDebugPanel = (crt: CRTPipeline): void => {
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.style.cssText = `
    position: fixed; top: 12px; right: 12px; z-index: 1000;
    background: rgba(0, 0, 0, 0.82); color: #fff;
    font: 11px -apple-system, BlinkMacSystemFont, 'SF Mono', Menlo, monospace;
    padding: 12px 14px; border: 1px solid #444; border-radius: 6px;
    width: 240px; max-height: calc(100vh - 24px); overflow-y: auto;
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    user-select: none;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
  const title = document.createElement('strong');
  title.textContent = 'debug';
  title.style.cursor = 'pointer';
  title.title = 'collapse';
  const headerBtns = document.createElement('span');
  headerBtns.style.cssText = 'display: flex; gap: 4px;';
  const collapseBtn = document.createElement('span');
  collapseBtn.textContent = '−';
  collapseBtn.style.cssText = 'font-family: monospace; padding: 0 6px; cursor: pointer; opacity: 0.7;';
  collapseBtn.title = 'collapse';
  const closeBtn = document.createElement('span');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = 'font-family: monospace; padding: 0 6px; cursor: pointer; opacity: 0.7;';
  closeBtn.title = 'hide (run debug() in the console to show again)';
  headerBtns.append(collapseBtn, closeBtn);
  header.append(title, headerBtns);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.style.cssText = 'margin-top: 10px;';
  panel.appendChild(body);

  let collapsed = false;
  const toggleCollapse = () => {
    collapsed = !collapsed;
    body.style.display = collapsed ? 'none' : '';
    collapseBtn.textContent = collapsed ? '+' : '−';
  };
  title.onclick = toggleCollapse;
  collapseBtn.onclick = toggleCollapse;

  // Hidden by default. Toggle via window.debug() in the browser console.
  let visible = false;
  panel.style.display = 'none';
  const setVisible = (v: boolean) => {
    visible = v;
    panel.style.display = v ? '' : 'none';
  };
  closeBtn.onclick = () => setVisible(false);

  const api = ((v?: boolean) => {
    setVisible(v === undefined ? !visible : !!v);
    return visible ? 'shown' : 'hidden';
  }) as Window['debug'] & {};
  api!.show = () => setVisible(true);
  api!.hide = () => setVisible(false);
  api!.toggle = () => setVisible(!visible);
  window.debug = api;

  const sliders: SliderEntry[] = [];
  const section = makeSection(body);
  const slider = makeSlider(body, sliders);
  const colorRow = makeColorRow(body);

  const onPaletteChange = () => { resetColorCache(); setupGrid(crt); };
  const onCellChange = () => setupGrid(crt);
  // Color-side sliders only bite at flip time, so make them instantly visible
  // by resampling every unlocked cell against the current config.
  const onColorChange = () => {
    if (!state.cells.length) return;
    const t = performance.now();
    const innerP = getPalette(true);
    const outerP = getPalette(false);
    for (let i = 0; i < state.cells.length; i++) {
      const cell = state.cells[i]!;
      if (cell.locked) continue;
      const r = (i / state.cols) | 0;
      const c = i - r * state.cols;
      const inPlay = isInPlayfield(c, r);
      const palette = inPlay ? innerP : outerP;
      const idx = sampleColorIndex(c, r, t);
      cell.colorIndex = idx;
      cell.color = applyBrightness(palette[idx]!);
      cell.colorStr = getColorStr(cell.color);
      cell.char = randChar(idx);
      cell.flipTime = t;
      cell.satLevel = SAT_LEVELS;
      cell.dirty = true;
    }
  };

  section('CRT shader');
  slider('chrom. aberration', 'chromaticAberration', 0, 0.02, 0.0005);
  slider('saturation',        'saturation',          0.5, 2.0, 0.01);
  slider('scanline min',      'scanlineMin',         0.3, 1.0, 0.01);
  slider('scanline max',      'scanlineMax',         1.0, 1.3, 0.01);
  slider('phosphor mask',     'phosphorMaskAmount',  0,   0.3, 0.01);
  slider('vignette',          'vignette',            0,   1.5, 0.05);
  slider('flicker',           'flicker',             0,   0.05, 0.001);

  section('Effects');
  slider('bloom (bg only)',   'bloom',               0,   1.0, 0.02);
  slider('bloom radius',      'bloomRadius',         1.0, 12.0, 0.5);
  slider('breathing wave',    'breathe',             0,   0.2, 0.005);

  section('Background');
  slider('flip rate',      'flipRate',      0,    3,    0.05);
  slider('flip variation', 'flipVariation', 0,    1,    0.05);
  slider('noise scale',    'noiseScale',    0.05, 0.5,  0.01);
  slider('noise speed',    'noiseSpeed',    0,    3,    0.05);
  slider('color scale',    'colorNoiseScale', 0.02, 0.4, 0.005, onColorChange);
  slider('color speed',    'colorNoiseSpeed', 0,    2,   0.05,  onColorChange);
  slider('color bias',     'colorBias',     0,    0.5,  0.01,  onColorChange);
  slider('brightness var', 'brightnessVar', 0,    1,    0.05,  onCellChange);
  slider('aging half-life','agingHalfLife', 0,    10,   0.1);
  const onFadeChange = () => {
    for (let i = 0; i < state.cells.length; i++) {
      const cell = state.cells[i]!;
      cell.visibility = computeVisibility(cell.distNorm, cell.fadeNoise);
      cell.dirty = true;
    }
  };
  slider('center fade',    'centerFade',      0, 1,    0.02, onFadeChange);
  slider('fade diffusion', 'centerFadeNoise', 0, 0.5,  0.01, onFadeChange);

  section('Colors (current theme)');
  const yPick = colorRow('yellow',
    () => state.isLightMode ? state.config.paletteLight[0] : state.config.paletteDark[0],
    (v) => { (state.isLightMode ? state.config.paletteLight : state.config.paletteDark)[0] = v; },
    onPaletteChange);
  const puPick = colorRow('purple',
    () => state.isLightMode ? state.config.paletteLight[1] : state.config.paletteDark[1],
    (v) => { (state.isLightMode ? state.config.paletteLight : state.config.paletteDark)[1] = v; },
    onPaletteChange);
  const piPick = colorRow('pink',
    () => state.isLightMode ? state.config.paletteLight[2] : state.config.paletteDark[2],
    (v) => { (state.isLightMode ? state.config.paletteLight : state.config.paletteDark)[2] = v; },
    onPaletteChange);
  const lkPick = colorRow('link',
    () => state.isLightMode ? state.config.linkLight : state.config.linkDark,
    (v) => { if (state.isLightMode) state.config.linkLight = v; else state.config.linkDark = v; },
    onPaletteChange);

  state.refreshPickers = () => {
    yPick.value = rgbToHex(state.isLightMode ? state.config.paletteLight[0] : state.config.paletteDark[0]);
    puPick.value = rgbToHex(state.isLightMode ? state.config.paletteLight[1] : state.config.paletteDark[1]);
    piPick.value = rgbToHex(state.isLightMode ? state.config.paletteLight[2] : state.config.paletteDark[2]);
    lkPick.value = rgbToHex(state.isLightMode ? state.config.linkLight : state.config.linkDark);
  };

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display: flex; gap: 6px; margin-top: 12px;';

  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'reset';
  resetBtn.style.cssText = 'flex: 1; padding: 6px; background: #222; color: #fff; border: 1px solid #444; cursor: pointer; font: inherit;';
  resetBtn.onclick = () => {
    const fresh = JSON.parse(JSON.stringify(defaultConfig)) as MatrixConfig;
    (Object.keys(fresh) as (keyof MatrixConfig)[]).forEach((k) => {
      (state.config as unknown as Record<string, unknown>)[k as string] = fresh[k] as unknown;
    });
    sliders.forEach(({ key, input, valEl, step }) => {
      input.value = String(state.config[key]);
      valEl.textContent = fmt(state.config[key] as number, step);
    });
    state.refreshPickers();
    resetColorCache();
    setupGrid(crt);
  };

  const dumpBtn = document.createElement('button');
  dumpBtn.textContent = 'log';
  dumpBtn.title = 'log current config to console';
  dumpBtn.style.cssText = 'flex: 1; padding: 6px; background: #222; color: #fff; border: 1px solid #444; cursor: pointer; font: inherit;';
  dumpBtn.onclick = () => {
    console.log('config:', JSON.parse(JSON.stringify(state.config)));
  };

  buttonRow.append(resetBtn, dumpBtn);
  body.appendChild(buttonRow);

  document.body.appendChild(panel);
  console.info('%cdebug panel available — call debug() to toggle, debug.show() / debug.hide()', 'color: #ff195f');
};
