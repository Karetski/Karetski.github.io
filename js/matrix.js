(() => {
  // ----- Static config (not exposed to debug panel) ---------------------
  const FONT_PX = 18;
  const LINE_HEIGHT    = 1.0; // tight look
  // One char set per palette slot — order must match paletteDark/paletteLight.
  const CHARSETS = [
    '1234567890@#$%&?=+*/',  // yellow
    'ｹｻｽｾﾀﾁﾃﾄﾅﾆﾇﾈﾊﾋﾌﾍﾎﾏﾐﾑ',     // purple
    'abcДEFghkLmЙoЬQrStUвWXyZ',           // pink
  ];
  const TITLE = 'Alexey Karetski';
  const RIPPLE_RADIUS = 180;
  const TRAIL_TAU = 700;
  const COL_TITLE = [255, 255, 255];
  const COL_FRAME = [255, 255, 255];
  const FONT_FAMILY = "'JetBrains Mono', 'Noto Sans JP', monospace";

  const LINKS = [
    { label: 'linkedin', href: 'https://www.linkedin.com/in/karetski' },
    { label: 'github', href: 'https://github.com/karetski' },
    { label: 'x', href: 'https://x.com/karetski23' },
  ];
  const TOGGLE_DARK_LABEL = 'switch to dark';
  const TOGGLE_LIGHT_LABEL = 'switch to light';
  const NAV_PLAY_LABEL = 'play the game';
  const NAV_BACK_LABEL = 'back';
  const FRAME_PAD = 1;
  const FRAME_GAP = 1;
  const FRAME_CHARS = {
    tl: '\u2554', tr: '\u2557', bl: '\u255A', br: '\u255D',
    h: '\u2550', v: '\u2551',
  };
  const FRAME_BORDER_CHARS = '\u2554\u2557\u255A\u255D\u2551\u2550\u255F\u2562\u2500';

  // ----- Tweakable config (live-editable via debug panel) ---------------
  const defaultConfig = {
    // Background flip field — each cell rolls per-frame at a base rate gently
    // modulated by a Perlin field, so activity is uniform at a glance but
    // breathes spatially without producing wave fronts.
    flipRate: 0.2,           // average flips/sec/cell (across the field)
    flipVariation: 0.35,     // 0 = uniform, 1 = strong spatial swing of activity
    noiseScale: 0.18,        // spatial scale of the flip-rate noise
    noiseSpeed: 0.6,         // how fast that field flows over time
    // Color field — every palette color has its own noise field; cells
    // weighted-randomly pick among them on each flip, so dominant regions
    // are stippled and boundaries dissolve.
    colorNoiseScale: 0.06,
    colorNoiseSpeed: 0.18,
    colorBias: 0.25,         // raise to make peaks more distinct (less blended)
    brightnessVar: 0,        // 0 = uniform, 1 = cells can go fully dark

    // CRT shader
    chromaticAberration: 0.0035,
    saturation: 1.12,
    scanlineMin: 0.88,
    scanlineMax: 1.02,
    phosphorMaskAmount: 0.08,
    vignette: 1.0,
    flicker: 0.015,
    bloom: 0,                // 0..1, masked to skip the centre panel area
    bloomRadius: 4.0,        // texel multiplier for the bloom sample kernel
    breathe: 0,              // 0..0.2 amplitude of slow brightness wave

    // Palette (3 anchors per theme; cells pick one randomly)
    paletteDark: [
      [255, 255, 0],         // yellow
      [180, 50, 220],        // purple
      [255, 0, 128],         // pink
    ],
    paletteLight: [
      [200, 175, 0],
      [130, 25, 180],
      [210, 0, 110],
    ],

    // Link color per theme
    linkDark: [100, 130, 255],
    linkLight: [0, 0, 255],
  };
  const config = JSON.parse(JSON.stringify(defaultConfig));
  if (document.body.dataset.page === 'play') {
    // Calm the field down so the game reads as the foreground action.
    config.flipRate = 0.05;
    config.noiseSpeed = 0.2;
    config.colorNoiseSpeed = 0.06;
    config.flipVariation = 0.2;
  }

  // ----- State ----------------------------------------------------------
  let isLightMode = true;
  const isPlayMode = document.body.dataset.page === 'play';
  let dpr = 1;
  let cellW = 0, cellH = 0, cols = 0, rows = 0;
  let cells = [];
  let colorStrCache = new Map();
  // Position of the bottom buttons frame in cell coordinates — published to
  // window.matrixGame so the play-mode HUD can align itself with the panel
  // sitting just below it.
  let bottomPanelLeft = 0, bottomPanelWidth = 0, bottomPanelTop = 0;
  // Optional rectangle (in cell coords) the play-mode game registers so the
  // matrix paints a slightly different cell bg inside the playable area —
  // gives the bubble field a visible "lit" region without breaking the CRT
  // pipeline.
  let playfieldBounds = null;
  const startTime = performance.now();
  let lastFrameTime = 0;
  const pointer = { active: false, x: 0, y: 0, lastX: 0, lastY: 0 };
  const panelRect = { x: 0, y: 0, z: 1, w: 1 }; // panel bounds in vUv space

  // In play mode the flipping background is desaturated AND dimmed toward
  // the theme background so the game's locked cells stay vivid through the
  // same CRT pass — a single colour pipeline for the whole field instead of
  // a CSS filter on top, with a deeper push-back so interactive elements pop.
  const PLAY_BG_SAT = 0.05;
  // Two opacities for the desaturated flipping field. Inside the playable
  // rectangle should always read as the LIGHTER region — which means
  // opposite glyph-opacity assignments in the two themes:
  //   dark mode: inner = visible (brighter glyphs on black).
  //   light mode: inner = faded (glyphs closer to white).
  // Outside is the inverse so the contrast is always toward "playfield is
  // brighter than the rest of the screen".
  const PLAY_BG_OPACITY_VISIBLE = 0.55;
  const PLAY_BG_OPACITY_FADED   = 0.1;
  const desaturate = ([r, g, b], factor) => {
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    return [
      gray + (r - gray) * factor,
      gray + (g - gray) * factor,
      gray + (b - gray) * factor,
    ];
  };
  const dimToBg = (rgb, opacity) => {
    const bg = isLightMode ? 255 : 0;
    return [
      Math.round(bg + (rgb[0] - bg) * opacity),
      Math.round(bg + (rgb[1] - bg) * opacity),
      Math.round(bg + (rgb[2] - bg) * opacity),
    ];
  };
  const getPalette = (inPlay = false) => {
    const base = isLightMode ? config.paletteLight : config.paletteDark;
    if (!isPlayMode) return base;
    // In dark mode, brighter = more saturated (further from black).
    // In light mode, brighter = more bg-tinted (closer to white).
    // So which opacity makes the playfield "lighter" flips by theme.
    const innerOp = isLightMode ? PLAY_BG_OPACITY_FADED   : PLAY_BG_OPACITY_VISIBLE;
    const outerOp = isLightMode ? PLAY_BG_OPACITY_VISIBLE : PLAY_BG_OPACITY_FADED;
    const op = inPlay ? innerOp : outerOp;
    return base.map((c) => dimToBg(desaturate(c, PLAY_BG_SAT), op));
  };
  const getVividPalette = () => (isLightMode ? config.paletteLight : config.paletteDark);
  const applyBrightness = (color) => {
    if (config.brightnessVar <= 0) return color.slice();
    const b = 1 - Math.random() * config.brightnessVar;
    return [
      Math.round(color[0] * b),
      Math.round(color[1] * b),
      Math.round(color[2] * b),
    ];
  };

  const getThemeColors = () => {
    if (isLightMode) {
      return {
        bg: '#fff',
        bgRGB: [255, 255, 255],
        title: [0, 0, 0],
        link: config.linkLight,
        frame: [0, 0, 0],
        sep: [180, 180, 180],
      };
    }
    return {
      bg: '#000',
      bgRGB: [0, 0, 0],
      title: COL_TITLE,
      link: config.linkDark,
      frame: COL_FRAME,
      sep: [80, 80, 80],
    };
  };

  const getColorStr = (color) => {
    const key = (color[0] << 16) | (color[1] << 8) | color[2];
    let s = colorStrCache.get(key);
    if (s) return s;
    s = `rgb(${color[0] | 0},${color[1] | 0},${color[2] | 0})`;
    colorStrCache.set(key, s);
    return s;
  };

  const randChar = (colorIndex) => {
    const set = CHARSETS[colorIndex] || CHARSETS[0];
    return set[(Math.random() * set.length) | 0];
  };

  // 3D value noise with quintic smoothstep — Perlin-ish, cheap and good enough
  // for a flowing flip field. Output is in [0, 1].
  const NOISE_TIME_BASE = 0.0002;
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const hash3 = (x, y, z) => {
    let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const noise3 = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    const c000 = hash3(xi,     yi,     zi);
    const c100 = hash3(xi + 1, yi,     zi);
    const c010 = hash3(xi,     yi + 1, zi);
    const c110 = hash3(xi + 1, yi + 1, zi);
    const c001 = hash3(xi,     yi,     zi + 1);
    const c101 = hash3(xi + 1, yi,     zi + 1);
    const c011 = hash3(xi,     yi + 1, zi + 1);
    const c111 = hash3(xi + 1, yi + 1, zi + 1);
    const x00 = c000 + (c100 - c000) * u;
    const x10 = c010 + (c110 - c010) * u;
    const x01 = c001 + (c101 - c001) * u;
    const x11 = c011 + (c111 - c011) * u;
    const y0 = x00 + (x10 - x00) * v;
    const y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  };
  // Per-frame flip probability for one cell. Baseline rate everywhere, with
  // mild spatial variation so the activity drifts without forming wave fronts.
  const sampleFlipProb = (c, r, now, dt) => {
    const n = noise3(
      c * config.noiseScale,
      r * config.noiseScale,
      now * NOISE_TIME_BASE * config.noiseSpeed,
    );
    const mod = 1 + (n - 0.5) * 2 * config.flipVariation;
    return config.flipRate * Math.max(0, mod) * dt * 0.001;
  };
  // Each palette color has its own noise field (offset on z). On flip, pick
  // weighted-randomly across them — dominant fields produce that color most
  // often but never exclusively, so boundaries dissolve into a stipple.
  const COLOR_NOISE_Z_STRIDE = 7919;
  const colorWeights = [];
  const sampleColorIndex = (c, r, now) => {
    const palette = getPalette();
    const x = c * config.colorNoiseScale;
    const y = r * config.colorNoiseScale;
    const tBase = now * NOISE_TIME_BASE * config.colorNoiseSpeed;
    let total = 0;
    for (let i = 0; i < palette.length; i++) {
      const w = Math.max(0, noise3(x, y, tBase + COLOR_NOISE_Z_STRIDE * (i + 1)) - config.colorBias);
      colorWeights[i] = w;
      total += w;
    }
    if (total <= 0) return (Math.random() * palette.length) | 0;
    let pick = Math.random() * total;
    for (let i = 0; i < palette.length; i++) {
      pick -= colorWeights[i];
      if (pick <= 0) return i;
    }
    return palette.length - 1;
  };

  // ----- Cell mutation (used by frame/link layout and by the game) ------
  const setLocked = (r, c, ch, color) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    const cell = cells[r * cols + c];
    const newColStr = getColorStr(color);
    // Idempotent: stable game cells (a placed bubble re-asserted each frame)
    // skip the redraw path entirely.
    if (cell.locked && cell.char === ch && cell.colorStr === newColStr) return;
    cell.locked = true;
    cell.color = color;
    cell.colorStr = newColStr;
    cell.char = ch;
    // Only scale characters that have vertical components and need to connect vertically.
    // Purely horizontal lines (═, ─) and separators with horizontal focus (╟, ╢)
    // are often better rendered without scaling to preserve their double-line look.
    cell.isFrameBorder = '\u2554\u2557\u255A\u255D\u2551\u2550\u255F\u2562'.indexOf(ch) >= 0;
    cell.dirty = true;
  };
  // Returns a previously-locked cell to the flipping background, picking a
  // fresh char/colour from the current noise field so the gap blends in.
  // Picks the palette based on whether the cell sits inside the play rect —
  // otherwise an unlocked aim-line cell would briefly flash at the wrong
  // opacity, leaving a visible trail behind the cursor.
  const setUnlocked = (r, c) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    const cell = cells[r * cols + c];
    if (!cell.locked) return;
    const pb = playfieldBounds;
    const inPlay = pb && r >= pb.row && r < pb.row + pb.height && c >= pb.col && c < pb.col + pb.width;
    const palette = getPalette(inPlay);
    const colorIndex = sampleColorIndex(c, r, performance.now());
    const color = applyBrightness(palette[colorIndex]);
    cell.locked = false;
    cell.isFrameBorder = false;
    cell.colorIndex = colorIndex;
    cell.color = color;
    cell.colorStr = getColorStr(color);
    cell.char = randChar(colorIndex);
    cell.heat = 0;
    cell.dirty = true;
  };

  // ----- Game integration -----------------------------------------------
  // matrix.js doesn't know what the game is — it just exposes hooks the
  // game can use to write characters into its cell grid and to be told
  // when the grid is rebuilt (resize, theme toggle).
  const gameListeners = { regrid: [] };
  const emit = (evt) => {
    const list = gameListeners[evt];
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try { list[i](); } catch (e) { console.error(e); }
    }
  };
  window.matrixGame = {
    isPlayMode,
    get cols() { return cols; },
    get rows() { return rows; },
    get cellW() { return cellW; },
    get cellH() { return cellH; },
    get isLight() { return isLightMode; },
    numColors: 3,
    vividColor: (i) => getVividPalette()[i].slice(),
    linkColor: () => (isLightMode ? config.linkLight : config.linkDark).slice(),
    titleColor: () => (isLightMode ? [0, 0, 0] : COL_TITLE.slice()),
    charFor: (i) => randChar(i),
    setCell: (col, row, char, color) => setLocked(row, col, char, color),
    clearCell: (col, row) => setUnlocked(row, col),
    isLocked: (col, row) => {
      if (row < 0 || row >= rows || col < 0 || col >= cols) return false;
      return !!cells[row * cols + col].locked;
    },
    get panelLeft() { return bottomPanelLeft; },
    get panelWidth() { return bottomPanelWidth; },
    get panelTop() { return bottomPanelTop; },
    setPlayfieldBounds: (b) => {
      playfieldBounds = b;
      if (!cells.length) return;
      // Re-color every unlocked cell with the palette that matches its new
      // inside/outside-the-playfield status — without this, cells that
      // haven't flipped yet would keep stale opacity.
      const innerP = getPalette(true);
      const outerP = getPalette(false);
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.locked) { cell.dirty = true; continue; }
        const r = (i / cols) | 0;
        const c = i - r * cols;
        const inPlay = b && r >= b.row && r < b.row + b.height && c >= b.col && c < b.col + b.width;
        const palette = inPlay ? innerP : outerP;
        cell.color = applyBrightness(palette[cell.colorIndex]);
        cell.colorStr = getColorStr(cell.color);
        cell.dirty = true;
      }
    },
    on: (evt, fn) => {
      if (!gameListeners[evt]) gameListeners[evt] = [];
      gameListeners[evt].push(fn);
    },
  };

  // ----- Canvases -------------------------------------------------------
  const screenCanvas = document.getElementById('screen');
  const gl = screenCanvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false });

  if (!gl) {
    document.body.style.cssText = 'margin:0;background:#000;color:#ffd400;font:18px monospace;display:flex;align-items:center;justify-content:center;height:100vh';
    document.body.textContent = 'WebGL is required to view this page.';
    return;
  }

  const gridCanvas = document.createElement('canvas');
  const gctx = gridCanvas.getContext('2d', { alpha: false });

  // ----- Grid setup -----------------------------------------------------
  const setupGrid = () => {
    document.documentElement.classList.toggle('light', isLightMode);
    dpr = window.devicePixelRatio || 1;

    gctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
    const m = gctx.measureText('M');
    const naturalCellW = m.width;
    cellW = Math.max(8, Math.round(naturalCellW));
    cellH = Math.max(10, Math.round(FONT_PX * LINE_HEIGHT));

    const W = window.innerWidth;
    const H = window.innerHeight;

    gridCanvas.width = W;
    gridCanvas.height = H;
    screenCanvas.width = Math.floor(W * dpr);
    screenCanvas.height = Math.floor(H * dpr);
    screenCanvas.style.width = W + 'px';
    screenCanvas.style.height = H + 'px';

    gctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
    gctx.textBaseline = 'middle';
    const theme = getThemeColors();
    gctx.fillStyle = theme.bg;
    gctx.fillRect(0, 0, W, H);

    cols = Math.floor(W / cellW);
    rows = Math.floor(H / cellH);

    const now = performance.now();
    const palette = getPalette();
    cells = new Array(cols * rows);
    for (let i = 0; i < cells.length; i++) {
      const r = (i / cols) | 0;
      const c = i - r * cols;
      const colorIndex = sampleColorIndex(c, r, now);
      const color = applyBrightness(palette[colorIndex]);
      cells[i] = {
        char: randChar(colorIndex),
        locked: false,
        color: color,
        colorStr: getColorStr(color),
        heat: 0,
        dirty: true,
        colorIndex: colorIndex,
      };
    }

    const drawFrame = (top, left, w, h, color) => {
      for (let c = 0; c < w; c++) {
        let topCh, botCh;
        if (c === 0) { topCh = FRAME_CHARS.tl; botCh = FRAME_CHARS.bl; }
        else if (c === w - 1) { topCh = FRAME_CHARS.tr; botCh = FRAME_CHARS.br; }
        else { topCh = FRAME_CHARS.h; botCh = FRAME_CHARS.h; }
        setLocked(top, left + c, topCh, color);
        setLocked(top + h - 1, left + c, botCh, color);
      }
      for (let r = 1; r < h - 1; r++) {
        setLocked(top + r, left, FRAME_CHARS.v, color);
        setLocked(top + r, left + w - 1, FRAME_CHARS.v, color);
      }
      for (let r = 1; r < h - 1; r++) {
        for (let c = 1; c < w - 1; c++) {
          setLocked(top + r, left + c, ' ', color);
        }
      }
    };

    const toggleLabel = isLightMode ? TOGGLE_DARK_LABEL : TOGGLE_LIGHT_LABEL;
    const navLabel = isPlayMode ? NAV_BACK_LABEL : NAV_PLAY_LABEL;
    const navHref = isPlayMode ? 'index.html' : 'play.html';

    const longestLink = Math.max(...LINKS.map(l => l.label.length));
    // Stable button width covers every label so the layout doesn't reflow
    // when the toggle flips between "dark" and "light".
    const longestButtonLabel = Math.max(
      TOGGLE_DARK_LABEL.length, TOGGLE_LIGHT_LABEL.length,
      NAV_PLAY_LABEL.length, NAV_BACK_LABEL.length,
    );
    const titleNaturalW = TITLE.length + 2 * FRAME_PAD + 2;
    const linksNaturalW = longestLink + 2 * FRAME_PAD + 2;
    const buttonNaturalW = longestButtonLabel + 2 * FRAME_PAD + 2;
    const stackW = Math.max(titleNaturalW, linksNaturalW, buttonNaturalW);
    const stackInteriorW = stackW - 2;

    const titleFrameH = 3;
    const linkFrameH = LINKS.length * 2 + 1;
    // Bottom frame stacks two rows (nav + toggle) like the links frame:
    // top border + nav row + separator + toggle row + bottom border.
    const buttonFrameH = 5;

    const stackLeft = Math.floor((cols - stackW) / 2);

    let totalH, groupTop;
    if (isPlayMode) {
      totalH = buttonFrameH;
      groupTop = rows - buttonFrameH - 1;
    } else {
      totalH = titleFrameH + FRAME_GAP + linkFrameH + FRAME_GAP + buttonFrameH;
      groupTop = Math.floor((rows - totalH) / 2);
    }

    // Panel bounds in vUv space (vUv.y is flipped: y=1 is top of canvas)
    panelRect.x = (stackLeft * cellW) / W;
    panelRect.z = ((stackLeft + stackW) * cellW) / W;
    panelRect.y = 1 - ((groupTop + totalH) * cellH) / H;
    panelRect.w = 1 - (groupTop * cellH) / H;

    const titleEl = document.getElementById('title');
    const linksEl = document.getElementById('links');
    const navEl = document.getElementById('nav');
    const toggleEl = document.getElementById('theme-toggle');

    titleEl.textContent = '';
    linksEl.innerHTML = '';
    navEl.innerHTML = '';
    toggleEl.innerHTML = '';

    let buttonFrameTop;
    if (isPlayMode) {
      buttonFrameTop = groupTop;
    } else {
      const titleFrameTop = groupTop;
      const titleRow = titleFrameTop + 1;
      const titleStartCol = stackLeft + 1 + Math.floor((stackInteriorW - TITLE.length) / 2);

      drawFrame(titleFrameTop, stackLeft, stackW, titleFrameH, theme.frame);
      for (let i = 0; i < TITLE.length; i++) {
        setLocked(titleRow, titleStartCol + i, TITLE[i], theme.title);
      }

      titleEl.textContent = TITLE;
      titleEl.style.font = `${FONT_PX}px ${FONT_FAMILY}`;
      titleEl.style.letterSpacing = (cellW - naturalCellW) + 'px';
      titleEl.style.lineHeight = cellH + 'px';
      titleEl.style.left = (titleStartCol * cellW) + 'px';
      titleEl.style.top = (titleRow * cellH) + 'px';

      const linkFrameTop = titleFrameTop + titleFrameH + FRAME_GAP;
      drawFrame(linkFrameTop, stackLeft, stackW, linkFrameH, theme.frame);

      for (let li = 0; li < LINKS.length; li++) {
        const link = LINKS[li];
        const linkRow = linkFrameTop + 1 + li * 2;
        const startCol = stackLeft + 1 + Math.floor((stackInteriorW - link.label.length) / 2);

        for (let i = 0; i < link.label.length; i++) {
          setLocked(linkRow, startCol + i, link.label[i], theme.link);
        }

        if (li < LINKS.length - 1) {
          const sepRow = linkRow + 1;
          setLocked(sepRow, stackLeft, '╟', theme.frame);
          for (let c = 0; c < stackInteriorW; c++) {
            setLocked(sepRow, stackLeft + 1 + c, '─', theme.sep);
          }
          setLocked(sepRow, stackLeft + stackW - 1, '╢', theme.frame);
        }

        const a = document.createElement('a');
        a.href = link.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', link.label);
        a.style.left = (startCol * cellW) + 'px';
        a.style.top = (linkRow * cellH) + 'px';
        a.style.width = (link.label.length * cellW) + 'px';
        a.style.height = cellH + 'px';
        linksEl.appendChild(a);
      }

      buttonFrameTop = linkFrameTop + linkFrameH + FRAME_GAP;
    }

    drawFrame(buttonFrameTop, stackLeft, stackW, buttonFrameH, theme.frame);
    bottomPanelLeft = stackLeft;
    bottomPanelWidth = stackW;
    bottomPanelTop = buttonFrameTop;

    const navRow = buttonFrameTop + 1;
    const navStartCol = stackLeft + 1 + Math.floor((stackInteriorW - navLabel.length) / 2);
    for (let i = 0; i < navLabel.length; i++) {
      setLocked(navRow, navStartCol + i, navLabel[i], theme.link);
    }

    const buttonSepRow = navRow + 1;
    setLocked(buttonSepRow, stackLeft, '╟', theme.frame);
    for (let c = 0; c < stackInteriorW; c++) {
      setLocked(buttonSepRow, stackLeft + 1 + c, '─', theme.sep);
    }
    setLocked(buttonSepRow, stackLeft + stackW - 1, '╢', theme.frame);

    const toggleRow = buttonSepRow + 1;
    const toggleStartCol = stackLeft + 1 + Math.floor((stackInteriorW - toggleLabel.length) / 2);
    for (let i = 0; i < toggleLabel.length; i++) {
      setLocked(toggleRow, toggleStartCol + i, toggleLabel[i], theme.link);
    }

    const navA = document.createElement('a');
    navA.href = navHref;
    navA.setAttribute('aria-label', navLabel);
    navA.style.left = (navStartCol * cellW) + 'px';
    navA.style.top = (navRow * cellH) + 'px';
    navA.style.width = (navLabel.length * cellW) + 'px';
    navA.style.height = cellH + 'px';
    navEl.appendChild(navA);

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = toggleLabel;
    toggleBtn.setAttribute('aria-label', toggleLabel);
    toggleBtn.style.left = (toggleStartCol * cellW) + 'px';
    toggleBtn.style.top = (toggleRow * cellH) + 'px';
    toggleBtn.style.width = (toggleLabel.length * cellW) + 'px';
    toggleBtn.style.height = cellH + 'px';
    toggleBtn.onclick = () => {
      isLightMode = !isLightMode;
      colorStrCache = new Map();
      setupGrid();
      refreshPickers();
    };
    toggleEl.appendChild(toggleBtn);

    gl.viewport(0, 0, screenCanvas.width, screenCanvas.height);
    emit('regrid');
  };

  // ----- Disturbance trail ---------------------------------------------
  // Pointer drag heats nearby cells; heat decays into a fading trail and
  // boosts the per-cell flip rate so chars/colors churn in the wake.
  const applyRippleAt = (px, py) => {
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
        if (d2 < r2) {
          const cell = cells[r * cols + c];
          if (cell.locked) continue;
          // Quadratic falloff: cells near the pointer stay near full
          // intensity while outer cells drop off sharply.
          const linear = 1 - Math.sqrt(d2) / RIPPLE_RADIUS;
          const t = linear * linear;
          if (t > cell.heat) cell.heat = t;
        }
      }
    }
  };

  // ----- Update + draw the grid -----------------------------------------
  const updateAndDrawGrid = (now) => {
    const dt = lastFrameTime ? Math.min(now - lastFrameTime, 100) : 16.67;
    lastFrameTime = now;
    const decay = Math.exp(-dt / TRAIL_TAU);

    if (pointer.active) {
      const ddx = pointer.x - pointer.lastX;
      const ddy = pointer.y - pointer.lastY;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      const step = RIPPLE_RADIUS * 0.5;
      const steps = Math.max(1, Math.ceil(dist / step));
      for (let s = 1; s <= steps; s++) {
        const f = s / steps;
        applyRippleAt(pointer.lastX + ddx * f, pointer.lastY + ddy * f);
      }
      pointer.lastX = pointer.x;
      pointer.lastY = pointer.y;
    }

    const outerPalette = getPalette(false);
    const innerPalette = isPlayMode ? getPalette(true) : outerPalette;
    const theme = getThemeColors();
    const pb = playfieldBounds;
    for (let r = 0; r < rows; r++) {
      const cy = r * cellH;
      const inPlayRow = pb && r >= pb.row && r < pb.row + pb.height;
      for (let c = 0; c < cols; c++) {
        const cell = cells[r * cols + c];
        const prevChar = cell.char;
        const inPlay = inPlayRow && c >= pb.col && c < pb.col + pb.width;
        const palette = inPlay ? innerPalette : outerPalette;

        if (!cell.locked) {
          const baseFlipProb = sampleFlipProb(c, r, now, dt);
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
              cell.color = applyBrightness(palette[colorIndex]);
              cell.colorStr = getColorStr(cell.color);
            }
            cell.char = randChar(colorIndex);
          }
        }
        if (cell.heat > 0) {
          cell.heat *= decay;
          if (cell.heat < 0.02) cell.heat = 0;
        }

        if (cell.char === prevChar && !cell.dirty) continue;
        cell.dirty = false;

        const cx = c * cellW;
        gctx.save();
        gctx.beginPath();
        gctx.rect(cx, cy, cellW, cellH);
        gctx.clip();
        gctx.fillStyle = theme.bg;
        gctx.fillRect(cx, cy, cellW, cellH);
        gctx.fillStyle = cell.colorStr;
        if (cell.isFrameBorder) {
          gctx.save();
          gctx.translate(cx, cy);
          gctx.scale(1, cellH / FONT_PX);
          gctx.fillText(cell.char, 0, FONT_PX / 2);
          gctx.restore();
        } else {
          gctx.fillText(cell.char, cx, cy + cellH / 2);
        }
        gctx.restore();
      }
    }
  };

  // ----- WebGL ----------------------------------------------------------
  const VS_SRC = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const FS_SRC = `
    precision highp float;
    uniform sampler2D uTex;
    uniform vec2  uRes;
    uniform float uTime;
    uniform float uLight;
    uniform float uAb;
    uniform float uSat;
    uniform float uScanMin;
    uniform float uScanMax;
    uniform float uMaskAmount;
    uniform float uVig;
    uniform float uFlicker;
    uniform float uBloom;
    uniform float uBloomRadius;
    uniform float uBreathe;
    uniform vec4  uPanel; // (left, bottom, right, top) in vUv space
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // Chromatic aberration — radial RGB separation
      vec2 dir = uv - 0.5;
      vec3 col;
      col.r = texture2D(uTex, uv + dir * uAb        ).r;
      col.g = texture2D(uTex, uv + dir * uAb * 0.30 ).g;
      col.b = texture2D(uTex, uv - dir * uAb        ).b;

      // Bloom — masked away from the centre panel area so panel text stays crisp
      if (uBloom > 0.001) {
        bool insidePanel =
          uv.x > uPanel.x && uv.x < uPanel.z &&
          uv.y > uPanel.y && uv.y < uPanel.w;
        if (!insidePanel) {
          vec2 texel = 1.0 / uRes;
          vec3 bloom = vec3(0.0);
          float bloomW = 0.0;
          for (int i = -2; i <= 2; i++) {
            for (int j = -2; j <= 2; j++) {
              vec2 off = vec2(float(i), float(j)) * texel * uBloomRadius;
              vec3 s = texture2D(uTex, uv + off).rgb;
              float b = max(s.r, max(s.g, s.b));
              float w = smoothstep(0.35, 0.85, b);
              bloom += s * w;
              bloomW += w;
            }
          }
          if (bloomW > 0.0) bloom /= bloomW;
          col += bloom * uBloom;
        }
      }

      // Saturation
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, uSat);

      // Scanlines
      float scan = sin(uv.y * uRes.y * 1.75) * 0.5 + 0.5;
      col *= mix(uScanMin, uScanMax, scan);

      // Phosphor mask — RGB triad per device pixel (dark) or constant blue tint (light)
      float px = mod(gl_FragCoord.x, 3.0);
      vec3 mask;
      if (uLight > 0.5) {
        mask = vec3(1.0 - uMaskAmount * 0.25, 1.0 - uMaskAmount * 0.125, 1.0 + uMaskAmount * 0.25);
      } else {
        if      (px < 1.0) mask = vec3(1.0 + uMaskAmount, 1.0 - uMaskAmount, 1.0 - uMaskAmount);
        else if (px < 2.0) mask = vec3(1.0 - uMaskAmount, 1.0 + uMaskAmount, 1.0 - uMaskAmount);
        else               mask = vec3(1.0 - uMaskAmount, 1.0 - uMaskAmount, 1.0 + uMaskAmount);
      }
      col *= mask;

      // Vignette
      float vd  = length(vUv - 0.5);
      float vig = smoothstep(1.0, 0.42, vd);
      col *= mix(1.0, vig, uVig * (1.0 - uLight * 0.5));

      // Flicker
      float n = hash(floor(gl_FragCoord.xy) + floor(uTime * 60.0));
      col += (n - 0.5) * uFlicker;

      // Breathing wave — slow brightness modulation across the screen
      if (uBreathe > 0.0001) {
        float w = sin(uTime * 0.7 + vUv.x * 5.0 + vUv.y * 3.0);
        col *= 1.0 + w * uBreathe;
      }

      // Mild gamma curve
      col = pow(max(col, 0.0), vec3(uLight > 0.5 ? 1.05 : 0.95));

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  };

  const program = gl.createProgram();
  const vs = compile(gl.VERTEX_SHADER, VS_SRC);
  const fs = compile(gl.FRAGMENT_SHADER, FS_SRC);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return;
  }
  gl.useProgram(program);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = {
    tex: gl.getUniformLocation(program, 'uTex'),
    res: gl.getUniformLocation(program, 'uRes'),
    time: gl.getUniformLocation(program, 'uTime'),
    light: gl.getUniformLocation(program, 'uLight'),
    ab: gl.getUniformLocation(program, 'uAb'),
    sat: gl.getUniformLocation(program, 'uSat'),
    scanMin: gl.getUniformLocation(program, 'uScanMin'),
    scanMax: gl.getUniformLocation(program, 'uScanMax'),
    maskAmount: gl.getUniformLocation(program, 'uMaskAmount'),
    vig: gl.getUniformLocation(program, 'uVig'),
    flicker: gl.getUniformLocation(program, 'uFlicker'),
    bloom: gl.getUniformLocation(program, 'uBloom'),
    bloomRadius: gl.getUniformLocation(program, 'uBloomRadius'),
    breathe: gl.getUniformLocation(program, 'uBreathe'),
    panel: gl.getUniformLocation(program, 'uPanel'),
  };

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(u.tex, 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  const renderCRT = (now) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gridCanvas);

    gl.viewport(0, 0, screenCanvas.width, screenCanvas.height);
    gl.uniform2f(u.res, screenCanvas.width, screenCanvas.height);
    gl.uniform1f(u.time, (now - startTime) / 1000);
    gl.uniform1f(u.light, isLightMode ? 1.0 : 0.0);
    gl.uniform1f(u.ab, config.chromaticAberration);
    gl.uniform1f(u.sat, config.saturation);
    gl.uniform1f(u.scanMin, config.scanlineMin);
    gl.uniform1f(u.scanMax, config.scanlineMax);
    gl.uniform1f(u.maskAmount, config.phosphorMaskAmount);
    gl.uniform1f(u.vig, config.vignette);
    gl.uniform1f(u.flicker, config.flicker);
    gl.uniform1f(u.bloom, config.bloom);
    gl.uniform1f(u.bloomRadius, config.bloomRadius);
    gl.uniform1f(u.breathe, config.breathe);
    gl.uniform4f(u.panel, panelRect.x, panelRect.y, panelRect.z, panelRect.w);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  // ----- Loop -----------------------------------------------------------
  const loop = (now) => {
    updateAndDrawGrid(now);
    renderCRT(now);
    requestAnimationFrame(loop);
  };

  // ----- Pointer trail --------------------------------------------------
  const isInDebugPanel = (e) => e.target && e.target.closest && e.target.closest('#debug-panel');
  const onPointerDown = (e) => {
    if (isInDebugPanel(e)) return;
    pointer.active = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.lastX = e.clientX;
    pointer.lastY = e.clientY;
  };
  const onPointerMove = (e) => {
    if (!pointer.active) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  };
  const onPointerEnd = () => { pointer.active = false; };
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);

  // ----- Resize ---------------------------------------------------------
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(setupGrid, 100);
  });

  // ----- Debug panel ----------------------------------------------------
  const rgbToHex = ([r, g, b]) =>
    '#' + [r, g, b].map(n => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0')).join('');
  const hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  let refreshPickers = () => {};

  const setupDebugPanel = () => {
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
    const setVisible = (v) => {
      visible = v;
      panel.style.display = v ? '' : 'none';
    };
    closeBtn.onclick = () => setVisible(false);

    const api = (v) => { setVisible(v === undefined ? !visible : !!v); return visible ? 'shown' : 'hidden'; };
    api.show = () => setVisible(true);
    api.hide = () => setVisible(false);
    api.toggle = () => setVisible(!visible);
    window.debug = api;

    const sliders = [];

    const section = (label) => {
      const h = document.createElement('div');
      h.textContent = label;
      h.style.cssText = 'opacity: 0.5; margin: 12px 0 4px; text-transform: uppercase; font-size: 9px; letter-spacing: 0.1em;';
      body.appendChild(h);
    };

    const fmt = (v, step) => step >= 1 ? String(v | 0) : v.toFixed(step >= 0.01 ? 3 : 4);

    const slider = (label, key, min, max, step, onChange) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin-bottom: 6px;';
      const labelRow = document.createElement('div');
      labelRow.style.cssText = 'display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 1px;';
      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      const valEl = document.createElement('span');
      valEl.style.opacity = '0.7';
      valEl.textContent = fmt(config[key], step);
      labelRow.append(labelEl, valEl);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(config[key]);
      input.style.cssText = 'width: 100%; accent-color: #ff0080;';
      input.oninput = () => {
        const v = parseFloat(input.value);
        config[key] = v;
        valEl.textContent = fmt(v, step);
        if (onChange) onChange();
      };
      wrap.append(labelRow, input);
      body.appendChild(wrap);
      sliders.push({ key, input, valEl, step });
    };

    const colorRow = (label, getter, setter, onChange) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-size: 10px;';
      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      const input = document.createElement('input');
      input.type = 'color';
      input.value = rgbToHex(getter());
      input.style.cssText = 'width: 36px; height: 20px; border: 1px solid #444; padding: 0; cursor: pointer; background: none;';
      input.oninput = () => {
        setter(hexToRgb(input.value));
        onChange();
      };
      wrap.append(labelEl, input);
      body.appendChild(wrap);
      return input;
    };

    const onPaletteChange = () => {
      colorStrCache = new Map();
      setupGrid();
    };
    const onCellChange = () => setupGrid();
    // Color-side sliders only bite at flip time, so make them instantly visible
    // by resampling every unlocked cell against the current config.
    const onColorChange = () => {
      if (!cells.length) return;
      const t = performance.now();
      const innerP = getPalette(true);
      const outerP = getPalette(false);
      const pb = playfieldBounds;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.locked) continue;
        const r = (i / cols) | 0;
        const c = i - r * cols;
        const inPlay = pb && r >= pb.row && r < pb.row + pb.height && c >= pb.col && c < pb.col + pb.width;
        const palette = inPlay ? innerP : outerP;
        const idx = sampleColorIndex(c, r, t);
        cell.colorIndex = idx;
        cell.color = applyBrightness(palette[idx]);
        cell.colorStr = getColorStr(cell.color);
        cell.char = randChar(idx);
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

    section('Colors (current theme)');
    const yPick = colorRow('yellow',
      () => isLightMode ? config.paletteLight[0] : config.paletteDark[0],
      (v) => { (isLightMode ? config.paletteLight : config.paletteDark)[0] = v; },
      onPaletteChange);
    const puPick = colorRow('purple',
      () => isLightMode ? config.paletteLight[1] : config.paletteDark[1],
      (v) => { (isLightMode ? config.paletteLight : config.paletteDark)[1] = v; },
      onPaletteChange);
    const piPick = colorRow('pink',
      () => isLightMode ? config.paletteLight[2] : config.paletteDark[2],
      (v) => { (isLightMode ? config.paletteLight : config.paletteDark)[2] = v; },
      onPaletteChange);
    const lkPick = colorRow('link',
      () => isLightMode ? config.linkLight : config.linkDark,
      (v) => { if (isLightMode) config.linkLight = v; else config.linkDark = v; },
      onPaletteChange);

    refreshPickers = () => {
      yPick.value = rgbToHex(isLightMode ? config.paletteLight[0] : config.paletteDark[0]);
      puPick.value = rgbToHex(isLightMode ? config.paletteLight[1] : config.paletteDark[1]);
      piPick.value = rgbToHex(isLightMode ? config.paletteLight[2] : config.paletteDark[2]);
      lkPick.value = rgbToHex(isLightMode ? config.linkLight : config.linkDark);
    };

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display: flex; gap: 6px; margin-top: 12px;';

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'reset';
    resetBtn.style.cssText = 'flex: 1; padding: 6px; background: #222; color: #fff; border: 1px solid #444; cursor: pointer; font: inherit;';
    resetBtn.onclick = () => {
      const fresh = JSON.parse(JSON.stringify(defaultConfig));
      Object.keys(fresh).forEach(k => { config[k] = fresh[k]; });
      sliders.forEach(({ key, input, valEl, step }) => {
        input.value = String(config[key]);
        valEl.textContent = fmt(config[key], step);
      });
      refreshPickers();
      colorStrCache = new Map();
      setupGrid();
    };

    const dumpBtn = document.createElement('button');
    dumpBtn.textContent = 'log';
    dumpBtn.title = 'log current config to console';
    dumpBtn.style.cssText = 'flex: 1; padding: 6px; background: #222; color: #fff; border: 1px solid #444; cursor: pointer; font: inherit;';
    dumpBtn.onclick = () => {
      console.log('config:', JSON.parse(JSON.stringify(config)));
    };

    buttonRow.append(resetBtn, dumpBtn);
    body.appendChild(buttonRow);

    document.body.appendChild(panel);
    console.info('%cdebug panel available — call debug() to toggle, debug.show() / debug.hide()', 'color: #ff0080');
  };

  // ----- Boot -----------------------------------------------------------
  const boot = () => {
    setupGrid();
    setupDebugPanel();
    requestAnimationFrame(loop);
  };

  if (document.fonts && document.fonts.load) {
    document.fonts.load(`${FONT_PX}px 'JetBrains Mono'`).then(boot, boot);
  } else {
    boot();
  }
})();
