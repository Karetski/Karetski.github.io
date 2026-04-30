(() => {
  // ----- Config ---------------------------------------------------------
  const FONT_PX = 18;
  const LINE_HEIGHT    = 1.0; // tight look
  const CHARSET = '!#$%&*+,./:;<=>?@[]^_{|}~0123456789';
  const TITLE = 'Alexey Karetski';
  const FLIP_MIN_MS = 800;
  const FLIP_MAX_MS = 4800;
  const RIPPLE_RADIUS = 180; // px around pointer where flipping accelerates
  const TRAIL_TAU = 700; // ms — heat half-life ≈ 0.69 × TAU (controls trail length)
  const HEAT_GLOW = 0.8; // mix toward white at peak heat (0..1)
  const COL_TITLE = [255, 255, 255]; // white
  const COL_LINK = [60, 150, 255]; // Brighter electric blue
  const COL_FRAME = [255, 255, 255]; // white frame borders
  const FONT_FAMILY = "'Sometype Mono', monospace";

  const LINKS = [
    { label: 'linkedin', href: 'https://www.linkedin.com/in/karetski' },
    { label: 'github', href: 'https://github.com/karetski' },
    { label: 'x', href: 'https://x.com/karetski23' },
  ];
  const FRAME_PAD = 1; // min chars of horizontal padding inside each frame
  const FRAME_GAP = 1; // blank rows between the title frame and the links frame
  const FRAME_CHARS = {
    tl: '┏', tr: '┓', bl: '┗', br: '┛',
    h: '━', v: '┃',
  };
  const FRAME_BORDER_CHARS = '┏┓┗┛┃━┣┫';

  // Yellow → orange spread, sampled per cell at init for textured background
  const PALETTE = [
    [255, 225, 50],   // bright gold
    [255, 185, 40],   // bright amber
    [255, 145, 30],   // bright pumpkin
    [255, 110, 20],   // bright deep orange
    [255, 205, 70],   // bright honey
    [255, 165, 50],   // bright vivid amber
    [255, 245, 60],   // brilliant saturated yellow
  ];
  const randPaletteColor = () => PALETTE[(Math.random() * PALETTE.length) | 0];

  // Pre-cached `rgb(...)` strings for each color quantized to 10 heat levels,
  // so the hot draw loop never allocates a new string per cell per frame.
  const colorStrCache = new Map();
  const getColorStrs = (color) => {
    const key = (color[0] << 16) | (color[1] << 8) | color[2];
    let arr = colorStrCache.get(key);
    if (arr) return arr;
    arr = new Array(10);
    for (let h = 0; h < 10; h++) {
      const heat = h * 0.1;
      const blend = heat * HEAT_GLOW;
      const inv = 1 - blend;
      const cr = (color[0] * inv + 255 * blend) | 0;
      const cg = (color[1] * inv + 255 * blend) | 0;
      const cb = (color[2] * inv + 255 * blend) | 0;
      arr[h] = `rgb(${cr},${cg},${cb})`;
    }
    colorStrCache.set(key, arr);
    return arr;
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

  // ----- State ----------------------------------------------------------
  let dpr = 1;
  let cellW = 0, cellH = 0, cols = 0, rows = 0;
  let cells = [];
  const startTime = performance.now();
  let lastFrameTime = 0;
  const pointer = { active: false, x: 0, y: 0, lastX: 0, lastY: 0 };

  const randChar = () => CHARSET[(Math.random() * CHARSET.length) | 0];
  const randDelay = () => FLIP_MIN_MS + Math.random() * (FLIP_MAX_MS - FLIP_MIN_MS);

  // ----- Grid setup -----------------------------------------------------
  const setupGrid = () => {
    dpr = window.devicePixelRatio || 1;

    gctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
    const m = gctx.measureText('M');
    const naturalCellW = m.width;
    cellW = Math.max(8, Math.round(naturalCellW));
    cellH = Math.max(10, Math.round(FONT_PX * LINE_HEIGHT));

    const W = window.innerWidth;
    const H = window.innerHeight;

    // Grid canvas renders at logical resolution; WebGL upscales to full DPR
    // (the slight softening reads as CRT phosphor, not as a fidelity loss)
    gridCanvas.width = W;
    gridCanvas.height = H;
    screenCanvas.width = Math.floor(W * dpr);
    screenCanvas.height = Math.floor(H * dpr);
    screenCanvas.style.width = W + 'px';
    screenCanvas.style.height = H + 'px';

    gctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
    gctx.textBaseline = 'middle';
    // Pre-clear once — the per-frame loop only repaints cells that changed
    gctx.fillStyle = '#000';
    gctx.fillRect(0, 0, W, H);

    cols = Math.floor(W / cellW);
    rows = Math.floor(H / cellH);

    const now = performance.now();
    cells = new Array(cols * rows);
    for (let i = 0; i < cells.length; i++) {
      const color = randPaletteColor();
      cells[i] = {
        char: randChar(),
        nextFlipAt: now + randDelay(),
        locked: false,
        color: color,
        colorStrs: getColorStrs(color),
        heat: 0,
        lastHeatLevel: -1, // forces an initial draw
      };
    }

    const setLocked = (r, c, ch, color) => {
      if (r < 0 || r >= rows || c < 0 || c >= cols) return;
      const cell = cells[r * cols + c];
      cell.locked = true;
      cell.color = color;
      cell.colorStrs = getColorStrs(color);
      cell.char = ch;
      cell.isFrameBorder = FRAME_BORDER_CHARS.indexOf(ch) >= 0;
    };
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
      // Clear interior so the random background doesn't bleed inside
      for (let r = 1; r < h - 1; r++) {
        for (let c = 1; c < w - 1; c++) {
          setLocked(top + r, left + c, ' ', color);
        }
      }
    };

    // Sync both frames to the wider group's natural width
    const longestLink = Math.max(...LINKS.map(l => l.label.length));
    const titleNaturalW = TITLE.length + 2 * FRAME_PAD + 2;
    const linksNaturalW = longestLink + 2 * FRAME_PAD + 2;
    const frameW = Math.max(titleNaturalW, linksNaturalW);
    const interiorW = frameW - 2;

    // Total height of the combined frames (Title + Gap + Links)
    const titleFrameH = 3;
    const linkFrameH = LINKS.length * 2 + 1;
    const totalH = titleFrameH + FRAME_GAP + linkFrameH;

    // Center the whole group vertically
    const groupTop = Math.floor((rows - totalH) / 2);
    const frameLeft = Math.floor((cols - frameW) / 2);

    // Title block
    const titleFrameTop = groupTop;
    const titleRow = titleFrameTop + 1;
    const titleStartCol = frameLeft + 1 + Math.floor((interiorW - TITLE.length) / 2);

    drawFrame(titleFrameTop, frameLeft, frameW, titleFrameH, COL_FRAME);
    for (let i = 0; i < TITLE.length; i++) {
      setLocked(titleRow, titleStartCol + i, TITLE[i], COL_TITLE);
    }

    // Selectable title overlay — transparent DOM text aligned with the canvas glyphs
    const titleEl = document.getElementById('title');
    titleEl.textContent = TITLE;
    titleEl.style.font = `${FONT_PX}px ${FONT_FAMILY}`;
    titleEl.style.letterSpacing = (cellW - naturalCellW) + 'px';
    titleEl.style.lineHeight = cellH + 'px';
    titleEl.style.left = (titleStartCol * cellW) + 'px';
    titleEl.style.top = (titleRow * cellH) + 'px';

    // Links block — framed below the title, each link centered on its own row
    const linkFrameTop = titleFrameTop + titleFrameH + FRAME_GAP;

    drawFrame(linkFrameTop, frameLeft, frameW, linkFrameH, COL_FRAME);

    const linksEl = document.getElementById('links');
    linksEl.innerHTML = '';
    for (let li = 0; li < LINKS.length; li++) {
      const link = LINKS[li];
      const row = linkFrameTop + 1 + li * 2;
      const startCol = frameLeft + 1 + Math.floor((interiorW - link.label.length) / 2);

      for (let i = 0; i < link.label.length; i++) {
        setLocked(row, startCol + i, link.label[i], COL_LINK);
      }

      // Add a light separator between links
      if (li < LINKS.length - 1) {
        const sepRow = row + 1;
        const sepColor = [80, 80, 80];
        setLocked(sepRow, frameLeft, '┣', COL_FRAME);
        for (let c = 0; c < interiorW; c++) {
          setLocked(sepRow, frameLeft + 1 + c, '━', sepColor);
        }
        setLocked(sepRow, frameLeft + frameW - 1, '┫', COL_FRAME);
      }

      const a = document.createElement('a');
      a.href = link.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', link.label);
      a.style.left = (startCol * cellW) + 'px';
      a.style.top = (row * cellH) + 'px';
      a.style.width = (link.label.length * cellW) + 'px';
      a.style.height = cellH + 'px';
      linksEl.appendChild(a);
    }

    gl.viewport(0, 0, screenCanvas.width, screenCanvas.height);
  };

  // ----- Ripple application (bbox-limited) ------------------------------
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
          // Locked cells (frame, title, links, frame interior) stay calm —
          // the ripple is a background-only effect.
          if (cell.locked) continue;
          const t = 1 - Math.sqrt(d2) / RIPPLE_RADIUS;
          if (t > cell.heat) cell.heat = t;
        }
      }
    }
  };

  // ----- Update + draw the grid into the 2D canvas ----------------------
  // Canvas pixels persist between frames — only repaint cells whose visible
  // state (char or quantized heat level) changed since the last draw.
  const updateAndDrawGrid = (now) => {
    const dt = lastFrameTime ? Math.min(now - lastFrameTime, 100) : 16.67;
    lastFrameTime = now;
    const decay = Math.exp(-dt / TRAIL_TAU);

    // Apply ripple along the pointer's path since last frame, so a fast
    // swipe leaves a continuous trail rather than discrete dots
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

    for (let r = 0; r < rows; r++) {
      const cy = r * cellH;
      for (let c = 0; c < cols; c++) {
        const cell = cells[r * cols + c];
        const prevChar = cell.char;

        // Update phase
        if (!cell.locked && now >= cell.nextFlipAt) {
          cell.char = randChar();
          cell.nextFlipAt = now + randDelay();
        }
        if (cell.heat > 0) {
          cell.heat *= decay;
          if (cell.heat < 0.02) cell.heat = 0;
        }
        if (!cell.locked && cell.heat > 0.05 && Math.random() < cell.heat * cell.heat) {
          cell.char = randChar();
        }

        // Skip the redraw if neither char nor heat-level changed
        const heatLevel = cell.heat > 0 ? Math.min(9, (cell.heat * 10) | 0) : 0;
        if (cell.char === prevChar && heatLevel === cell.lastHeatLevel) continue;

        const cx = c * cellW;
        // Clip every paint to the cell rect. Without this, fillText's
        // antialiased edge pixels can spill 1 px into neighbouring cells
        // and accumulate there over many flips — most visible on locked
        // borders that never clear, but it happens to every neighbour.
        gctx.save();
        gctx.beginPath();
        gctx.rect(cx, cy, cellW, cellH);
        gctx.clip();
        gctx.fillStyle = '#000';
        gctx.fillRect(cx, cy, cellW, cellH);
        gctx.fillStyle = cell.colorStrs[heatLevel];
        if (cell.isFrameBorder) {
          // Stretch box-drawing chars vertically to fill the (taller) cell so
          // the frame still tiles seamlessly.
          gctx.save();
          gctx.translate(cx, cy);
          gctx.scale(1, cellH / FONT_PX);
          gctx.fillText(cell.char, 0, FONT_PX / 2 - 1);
          gctx.restore();
        } else {
          gctx.fillText(cell.char, cx, cy + cellH / 2 - 1);
        }
        gctx.restore();
        cell.lastHeatLevel = heatLevel;
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
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // Vibrant chromatic aberration — radial RGB separation, all 3 channels offset
      vec2 dir = uv - 0.5;
      float ab = 0.0065;
      vec3 col;
      col.r = texture2D(uTex, uv + dir * ab        ).r;
      col.g = texture2D(uTex, uv + dir * ab * 0.30 ).g;
      col.b = texture2D(uTex, uv - dir * ab        ).b;

      // Saturation boost — pushes the yellow/orange palette and amplifies the CA fringes
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, 1.25);

      // Scanlines (soft, bright/dark stripes following the screen Y)
      float scan = sin(uv.y * uRes.y * 1.6) * 0.5 + 0.5;
      col *= mix(0.72, 1.0, scan);

      // Phosphor mask — RGB triad on every 3 device pixels of the X axis
      float px = mod(gl_FragCoord.x, 3.0);
      vec3 mask;
      if      (px < 1.0) mask = vec3(1.15, 0.80, 0.80);
      else if (px < 2.0) mask = vec3(0.80, 1.15, 0.80);
      else               mask = vec3(0.80, 0.80, 1.15);
      col *= mask;

      // Vignette
      float vd  = length(vUv - 0.5);
      float vig = smoothstep(0.92, 0.30, vd);
      col *= vig;

      // Phosphor flicker (per-pixel, frame-rate driven)
      float n = hash(floor(gl_FragCoord.xy) + floor(uTime * 60.0));
      col += (n - 0.5) * 0.025;

      // Mild gamma curve — keeps the bright phosphor punchy
      col = pow(max(col, 0.0), vec3(0.95));

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

  // Fullscreen triangle pair
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTex = gl.getUniformLocation(program, 'uTex');
  const uRes = gl.getUniformLocation(program, 'uRes');
  const uTime = gl.getUniformLocation(program, 'uTime');

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(uTex, 0);
  // Flip Y on upload so the canvas's top-left lands at uv (0, 1)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  const renderCRT = (now) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gridCanvas);

    gl.viewport(0, 0, screenCanvas.width, screenCanvas.height);
    gl.uniform2f(uRes, screenCanvas.width, screenCanvas.height);
    gl.uniform1f(uTime, (now - startTime) / 1000);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  // ----- Loop -----------------------------------------------------------
  const loop = (now) => {
    updateAndDrawGrid(now);
    renderCRT(now);
    requestAnimationFrame(loop);
  };

  // ----- Pointer ripple -------------------------------------------------
  const onPointerDown = (e) => {
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
  const onPointerEnd = () => {
    pointer.active = false;
  };
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

  // ----- Boot (after font loads so cell metrics are right) --------------
  const boot = () => {
    setupGrid();
    requestAnimationFrame(loop);
  };

  if (document.fonts && document.fonts.load) {
    document.fonts.load(`${FONT_PX}px 'Sometype Mono'`).then(boot, boot);
  } else {
    boot();
  }
})();
