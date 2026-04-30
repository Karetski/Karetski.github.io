(() => {
  // ----- Config ---------------------------------------------------------
  const FONT_PX        = 18;
  const LINE_HEIGHT    = 1.0;
  const CHARSET        = '!#$%&*+,./:;<=>?@[]^_{|}~0123456789';
  const TITLE          = 'Alexey Karetski';
  const FLIP_MIN_MS    = 800;
  const FLIP_MAX_MS    = 4800;
  const COL_TITLE      = [255, 255, 255]; // white
  const FONT_FAMILY    = "'IBM Plex Mono', monospace";

  // Yellow → orange spread, sampled per cell at init for textured background
  const PALETTE = [
    [255, 215,   0],   // gold       #FFD700
    [255, 193,   7],   // amber      #FFC107
    [255, 165,   0],   // orange     #FFA500
    [255, 140,   0],   // dark orange#FF8C00
    [255, 179,  71],   // sandy      #FFB347
    [255, 234, 100],   // pale yellow
    [255, 200,  40],   // saturated yellow
  ];
  const randPaletteColor = () => PALETTE[(Math.random() * PALETTE.length) | 0];

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

  const randChar  = () => CHARSET[(Math.random() * CHARSET.length) | 0];
  const randDelay = () => FLIP_MIN_MS + Math.random() * (FLIP_MAX_MS - FLIP_MIN_MS);

  // ----- Grid setup -----------------------------------------------------
  const setupGrid = () => {
    dpr = window.devicePixelRatio || 1;

    gctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
    const m = gctx.measureText('M');
    cellW = Math.max(8, Math.round(m.width));
    cellH = Math.max(10, Math.round(FONT_PX * LINE_HEIGHT));

    const W = window.innerWidth;
    const H = window.innerHeight;

    gridCanvas.width    = Math.floor(W * dpr);
    gridCanvas.height   = Math.floor(H * dpr);
    screenCanvas.width  = Math.floor(W * dpr);
    screenCanvas.height = Math.floor(H * dpr);
    screenCanvas.style.width  = W + 'px';
    screenCanvas.style.height = H + 'px';

    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
    gctx.textBaseline = 'top';

    cols = Math.floor(W / cellW);
    rows = Math.floor(H / cellH);

    const now = performance.now();
    cells = new Array(cols * rows);
    for (let i = 0; i < cells.length; i++) {
      cells[i] = {
        char: randChar(),
        nextFlipAt: now + randDelay(),
        isTitle: false,
        color: randPaletteColor(),
      };
    }

    // Center the title on the middle row
    const titleRow = Math.floor(rows / 2);
    const titleCol = Math.floor((cols - TITLE.length) / 2);
    for (let i = 0; i < TITLE.length; i++) {
      const idx = titleRow * cols + (titleCol + i);
      if (idx >= 0 && idx < cells.length) {
        cells[idx].isTitle = true;
        cells[idx].char = TITLE[i];
      }
    }

    gl.viewport(0, 0, screenCanvas.width, screenCanvas.height);
  };

  // ----- Update + draw the grid into the 2D canvas ----------------------
  const updateAndDrawGrid = (now) => {
    gctx.fillStyle = '#000';
    gctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    for (let r = 0; r < rows; r++) {
      const cy = r * cellH;
      for (let c = 0; c < cols; c++) {
        const cx = c * cellW;
        const idx = r * cols + c;
        const cell = cells[idx];

        // Flip schedule (background cells only — title is locked)
        if (!cell.isTitle && now >= cell.nextFlipAt) {
          cell.char = randChar();
          cell.nextFlipAt = now + randDelay();
        }

        const base = cell.isTitle ? COL_TITLE : cell.color;
        gctx.fillStyle = `rgb(${base[0]}, ${base[1]}, ${base[2]})`;
        gctx.fillText(cell.char, cx, cy);
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
    -1, -1,  1, -1, -1,  1,
    -1,  1,  1, -1,  1,  1,
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTex  = gl.getUniformLocation(program, 'uTex');
  const uRes  = gl.getUniformLocation(program, 'uRes');
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
    document.fonts.load(`${FONT_PX}px 'IBM Plex Mono'`).then(boot, boot);
  } else {
    boot();
  }
})();
