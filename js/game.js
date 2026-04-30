(() => {
  if (document.body.dataset.page !== 'play') return;

  // The game is rendered into the matrix's character grid via the matrixGame
  // hook (see js/matrix.js). Bubbles, aim line, HUD and the game-over message
  // are all locked cells in that grid, so they pass through the same CRT
  // shader as everything else and the playfield visually belongs to the matrix
  // instead of sitting on top.

  // Bubbles sit on a strict 1-cell-per-slot square grid: every column and
  // every row is a bubble position with no gaps in between. Width tracks the
  // bottom buttons frame so the playfield and the HUD line up exactly.
  const INITIAL_ROWS       = 5;
  const REFILL_ROWS        = 4;
  const SHOTS_PER_DESCENT  = 8;
  const AIM_LIMIT          = (75 * Math.PI) / 180;
  const AIM_DOTS           = 16;
  const NUM_COLORS         = 3;
  const POP_DURATION_MS    = 520;
  const NEW_ROW_FILL       = 0.85;

  const NEIGHBORS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  let M = null;
  let cols = 0, rows = 0, cellW = 0, cellH = 0;
  let slotCols = 0;                          // bubble columns per row (≡ panelWidth)
  let startSlotCol = 0;
  let startSlotRow = 1;
  let shooterPx = 0, shooterPy = 0;
  let dangerY = 0;
  let projectileSpeed = 0;
  let panelLeft = 0, panelWidth = 0, panelTop = 0;

  let grid = [];                             // grid[j][i] = null | { colorIdx, char }
  const shooter = { angle: -Math.PI / 2, current: null, next: null };
  let projectile = null;
  let shotsSinceDescent = 0;
  let score = 0;
  let gameOver = false;
  let pointerX = 0, pointerY = 0;
  let lastWritten = new Set();
  let popping = [];

  // ---- slot ↔ matrix cell layout ---------------------------------------
  const slotToCell = (i, j) => ({
    col: startSlotCol + i,
    row: startSlotRow + j,
  });
  const slotToPixel = (i, j) => {
    const c = slotToCell(i, j);
    return { x: c.col * cellW + cellW / 2, y: c.row * cellH + cellH / 2 };
  };
  const cellToSlot = (col, row) => {
    const j = row - startSlotRow;
    const i = col - startSlotCol;
    if (j < 0 || i < 0 || i >= slotCols) return null;
    return { i, j };
  };

  const neighborsOf = (i, j) => {
    const out = [];
    for (let k = 0; k < NEIGHBORS.length; k++) {
      const ni = i + NEIGHBORS[k][0], nj = j + NEIGHBORS[k][1];
      if (nj >= 0 && nj < grid.length && ni >= 0 && ni < slotCols) out.push([ni, nj]);
    }
    return out;
  };

  const ensureRow = (j) => {
    while (grid.length <= j) grid.push(new Array(slotCols).fill(null));
  };

  // ---- bubble factories ------------------------------------------------
  const makeBubble = () => {
    const present = new Set();
    for (let j = 0; j < grid.length; j++) {
      const row = grid[j];
      for (let i = 0; i < row.length; i++) if (row[i]) present.add(row[i].colorIdx);
    }
    const choices = present.size > 0 ? [...present] : [0, 1, 2];
    const ci = choices[(Math.random() * choices.length) | 0];
    return { colorIdx: ci, char: M.charFor(ci) };
  };

  const randomRow = (fill) => {
    const row = new Array(slotCols);
    for (let i = 0; i < row.length; i++) {
      if (Math.random() < fill) {
        const ci = (Math.random() * NUM_COLORS) | 0;
        row[i] = { colorIdx: ci, char: M.charFor(ci) };
      } else {
        row[i] = null;
      }
    }
    return row;
  };

  const reset = () => {
    grid = [];
    for (let j = 0; j < INITIAL_ROWS; j++) grid.push(randomRow(1));
    shooter.angle = -Math.PI / 2;
    shooter.current = makeBubble();
    shooter.next = makeBubble();
    projectile = null;
    shotsSinceDescent = 0;
    score = 0;
    gameOver = false;
    popping = [];
  };

  const descend = () => {
    grid.unshift(randomRow(NEW_ROW_FILL));
    dropFloaters();
  };

  const refillIfEmpty = () => {
    let any = false;
    for (let j = 0; j < grid.length && !any; j++)
      for (let i = 0; i < grid[j].length && !any; i++) if (grid[j][i]) any = true;
    if (any) return false;
    grid = [];
    for (let j = 0; j < REFILL_ROWS; j++) grid.push(randomRow(1));
    shotsSinceDescent = 0;
    return true;
  };

  // ---- pops ------------------------------------------------------------
  const popCell = (i, j, kind) => {
    const cell = grid[j][i];
    if (!cell) return;
    const c = slotToCell(i, j);
    popping.push({
      col: c.col,
      row: c.row,
      char: cell.char,
      colorIdx: cell.colorIdx,
      kind,
      tStart: performance.now(),
    });
    grid[j][i] = null;
    score++;
  };

  // ---- layout ----------------------------------------------------------
  const computeLayout = () => {
    cols = M.cols; rows = M.rows; cellW = M.cellW; cellH = M.cellH;
    panelLeft  = M.panelLeft;
    panelWidth = M.panelWidth;
    panelTop   = M.panelTop;

    // Playfield exactly matches the bottom buttons panel width — same left
    // edge, same right edge, no in-between gaps because slots are 1 cell.
    slotCols     = panelWidth;
    startSlotCol = panelLeft;
    startSlotRow = 1;

    const centreCol  = panelLeft + Math.floor(panelWidth / 2);
    const hudTop     = panelTop - 4;
    const shooterRow = hudTop + 1;
    shooterPx = centreCol * cellW + cellW / 2;
    shooterPy = shooterRow * cellH + cellH / 2;
    dangerY = hudTop * cellH;

    projectileSpeed = (rows * cellH) / 1.0;

    // Tell the matrix to render the playable rectangle's symbol-animation at
    // a higher opacity so the field reads "lit" against the faded outside.
    M.setPlayfieldBounds({
      col: startSlotCol,
      row: 0,
      width: slotCols,
      height: hudTop,
    });
  };

  // ---- physics ---------------------------------------------------------
  const updateAim = () => {
    const dx = pointerX - shooterPx;
    const dy = Math.min(pointerY - shooterPy, -1);
    let a = Math.atan2(dy, dx);
    const lo = -Math.PI / 2 - AIM_LIMIT;
    const hi = -Math.PI / 2 + AIM_LIMIT;
    if (a < lo) a = lo;
    if (a > hi) a = hi;
    shooter.angle = a;
  };

  const fire = () => {
    if (projectile || gameOver || !shooter.current) return;
    projectile = {
      x: shooterPx,
      y: shooterPy,
      vx: Math.cos(shooter.angle) * projectileSpeed,
      vy: Math.sin(shooter.angle) * projectileSpeed,
      colorIdx: shooter.current.colorIdx,
      char: shooter.current.char,
    };
    shooter.current = shooter.next;
    shooter.next = makeBubble();
  };

  const wallMinX = () => startSlotCol * cellW;
  const wallMaxX = () => (startSlotCol + slotCols) * cellW;

  const collisionAt = (projCol, projRow) => {
    if (projRow < startSlotRow) return true;
    const slot = cellToSlot(projCol, projRow);
    if (!slot) return false;
    if (grid[slot.j] && grid[slot.j][slot.i]) return true;
    const ns = neighborsOf(slot.i, slot.j);
    for (let k = 0; k < ns.length; k++) {
      const nj = ns[k][1], ni = ns[k][0];
      if (grid[nj] && grid[nj][ni]) return true;
    }
    return false;
  };

  const tick = (dt) => {
    if (popping.length) {
      const now = performance.now();
      let w = 0;
      for (let r = 0; r < popping.length; r++) {
        if (now - popping[r].tStart < POP_DURATION_MS) popping[w++] = popping[r];
      }
      popping.length = w;
    }
    if (gameOver || !projectile) return;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    const halfW = cellW / 2;
    if (projectile.x < wallMinX() + halfW) {
      projectile.x = wallMinX() + halfW;
      projectile.vx = -projectile.vx;
    } else if (projectile.x > wallMaxX() - halfW) {
      projectile.x = wallMaxX() - halfW;
      projectile.vx = -projectile.vx;
    }
    const projCol = Math.floor(projectile.x / cellW);
    const projRow = Math.floor(projectile.y / cellH);
    if (collisionAt(projCol, projRow)) {
      snapAndResolve();
    } else if (projectile.y > rows * cellH + cellH) {
      projectile = null;
    }
  };

  const snapAndResolve = () => {
    let best = null, bestD2 = Infinity;
    const tj = Math.max(0, Math.round((projectile.y / cellH) - startSlotRow));
    for (let j = Math.max(0, tj - 1); j <= tj + 1; j++) {
      ensureRow(j);
      for (let i = 0; i < slotCols; i++) {
        if (grid[j][i]) continue;
        const p = slotToPixel(i, j);
        const dx = (projectile.x - p.x) / cellW;
        const dy = (projectile.y - p.y) / cellH;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = { i, j }; }
      }
    }
    if (best) {
      ensureRow(best.j);
      grid[best.j][best.i] = { colorIdx: projectile.colorIdx, char: projectile.char };
      resolveMatch(best.i, best.j);
    }
    projectile = null;
    shotsSinceDescent++;
    const refilled = refillIfEmpty();
    if (!refilled && shotsSinceDescent >= SHOTS_PER_DESCENT) {
      shotsSinceDescent = 0;
      descend();
    }
  };

  const resolveMatch = (i, j) => {
    const cell = grid[j][i];
    if (!cell) return;
    const target = cell.colorIdx;
    const seen = new Set([i + ',' + j]);
    const stack = [[i, j]];
    const cluster = [];
    while (stack.length) {
      const [ci, cj] = stack.pop();
      const cur = grid[cj][ci];
      if (!cur || cur.colorIdx !== target) continue;
      cluster.push([ci, cj]);
      const ns = neighborsOf(ci, cj);
      for (let k = 0; k < ns.length; k++) {
        const ni = ns[k][0], nj = ns[k][1];
        const key = ni + ',' + nj;
        const target2 = grid[nj][ni];
        if (!seen.has(key) && target2 && target2.colorIdx === target) {
          seen.add(key);
          stack.push([ni, nj]);
        }
      }
    }
    if (cluster.length < 3) return;
    for (let k = 0; k < cluster.length; k++) popCell(cluster[k][0], cluster[k][1], 'match');
    dropFloaters();
  };

  const dropFloaters = () => {
    if (!grid.length || !grid[0]) return;
    const reachable = new Set();
    const stack = [];
    for (let i = 0; i < slotCols; i++) {
      if (grid[0][i]) { reachable.add(i + ',0'); stack.push([i, 0]); }
    }
    while (stack.length) {
      const [ci, cj] = stack.pop();
      const ns = neighborsOf(ci, cj);
      for (let k = 0; k < ns.length; k++) {
        const ni = ns[k][0], nj = ns[k][1];
        const key = ni + ',' + nj;
        if (!reachable.has(key) && grid[nj] && grid[nj][ni]) {
          reachable.add(key);
          stack.push([ni, nj]);
        }
      }
    }
    for (let j = 0; j < grid.length; j++) {
      for (let i = 0; i < slotCols; i++) {
        if (grid[j][i] && !reachable.has(i + ',' + j)) popCell(i, j, 'float');
      }
    }
  };

  const checkLose = () => {
    if (gameOver) return;
    for (let j = 0; j < grid.length; j++) {
      for (let i = 0; i < slotCols; i++) {
        if (grid[j][i] && slotToPixel(i, j).y > dangerY) {
          gameOver = true;
          return;
        }
      }
    }
  };

  // ---- render ----------------------------------------------------------
  const sectionWidths = (totalW, count) => {
    const base = Math.floor((totalW + count - 1) / count);
    const rem  = totalW + (count - 1) - base * count;
    const out  = new Array(count).fill(base);
    for (let i = 0; i < rem; i++) out[i] += 1;
    return out;
  };

  const blendToBg = (rgb, fade, bg) => [
    Math.round(rgb[0] * fade + bg * (1 - fade)),
    Math.round(rgb[1] * fade + bg * (1 - fade)),
    Math.round(rgb[2] * fade + bg * (1 - fade)),
  ];

  const render = () => {
    const writes = new Map();
    const bubbleKeys = new Set();
    const frameKeys = new Set();
    const put = (col, row, char, color) => {
      if (col < 0 || col >= cols || row < 0 || row >= rows) return;
      writes.set(col + ',' + row, { char, color });
    };

    // Bubbles.
    for (let j = 0; j < grid.length; j++) {
      for (let i = 0; i < slotCols; i++) {
        const cell = grid[j][i];
        if (!cell) continue;
        const c = slotToCell(i, j);
        bubbleKeys.add(c.col + ',' + c.row);
        put(c.col, c.row, cell.char, M.vividColor(cell.colorIdx));
      }
    }

    const frameColor = M.titleColor();
    const link       = M.linkColor();

    // HUD: a single bordered strip the same width as the bottom buttons
    // panel, split into queue / current / score by shared T-junction
    // separators. Every interior cell is locked (with a space if no glyph
    // sits on it) so the flipping bg never bleeds through the panel.
    if (!gameOver) {
      const hudTop   = panelTop - 4;
      const innerRow = hudTop + 1;
      const widths   = sectionWidths(panelWidth, 3);
      const queueW = widths[0], currentW = widths[1], scoreW = widths[2];
      const queueLeft   = panelLeft;
      const currentLeft = queueLeft + queueW - 1;
      const scoreLeft   = currentLeft + currentW - 1;
      const totalRight  = panelLeft + panelWidth - 1;

      // Top + bottom borders (corners at outer ends, ═ in between).
      for (let x = 0; x < panelWidth; x++) {
        const col = panelLeft + x;
        let topCh = '═', botCh = '═';
        if (x === 0) { topCh = '╔'; botCh = '╚'; }
        else if (x === panelWidth - 1) { topCh = '╗'; botCh = '╝'; }
        put(col, hudTop,     topCh, frameColor);
        put(col, hudTop + 2, botCh, frameColor);
        frameKeys.add(col + ',' + hudTop);
        frameKeys.add(col + ',' + (hudTop + 2));
      }
      // Inner row: blank-fill every interior cell so flipping bg can't
      // bleed through. Sides + dividers overwrite the appropriate cells.
      for (let x = 0; x < panelWidth; x++) {
        const col = panelLeft + x;
        put(col, innerRow, ' ', frameColor);
      }
      // Verticals (outer + section dividers).
      const verticals = [queueLeft, currentLeft, scoreLeft, totalRight];
      for (let v = 0; v < verticals.length; v++) {
        const col = verticals[v];
        put(col, innerRow, '║', frameColor);
        frameKeys.add(col + ',' + innerRow);
      }
      // T-junctions on the top/bottom rows where dividers meet.
      put(currentLeft, hudTop,     '╦', frameColor);
      put(currentLeft, hudTop + 2, '╩', frameColor);
      put(scoreLeft,   hudTop,     '╦', frameColor);
      put(scoreLeft,   hudTop + 2, '╩', frameColor);

      // Section content.
      const placeCentred = (sectLeft, sectW, char, color) => {
        if (!char) return;
        const cx = sectLeft + Math.floor(sectW / 2);
        put(cx, innerRow, char, color);
      };
      if (shooter.next) {
        placeCentred(queueLeft, queueW, shooter.next.char, M.vividColor(shooter.next.colorIdx));
      }
      if (shooter.current) {
        placeCentred(currentLeft, currentW, shooter.current.char, M.vividColor(shooter.current.colorIdx));
      }
      const scoreStr        = String(score);
      const scoreCenter     = scoreLeft + Math.floor(scoreW / 2);
      const scoreContentLeft = scoreCenter - Math.floor(scoreStr.length / 2);
      for (let i = 0; i < scoreStr.length; i++) {
        const col = scoreContentLeft + i;
        if (col <= scoreLeft || col >= scoreLeft + scoreW - 1) continue;
        put(col, innerRow, scoreStr[i], link);
      }
    }

    // Pop animation — strictly confined to the popped cell. Match pops
    // start as a bright '✶' burst, then a sparkle that cycles ✦ → ◇ → ·
    // while flashing between title color and the bubble's hue, and fade in
    // the last third. Float pops drift down + fade.
    if (popping.length) {
      const now = performance.now();
      const isLight = M.isLight;
      const bg = isLight ? 255 : 0;
      const titleC = M.titleColor();

      for (let p = 0; p < popping.length; p++) {
        const pc = popping[p];
        const elapsed = now - pc.tStart;
        const t = Math.max(0, Math.min(1, elapsed / POP_DURATION_MS));

        if (pc.kind === 'match') {
          let glyph, baseColor, fadeMul;
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

    // Aim line — bullet glyphs in full bubble colour, slides past frame
    // cells and stops only on bubbles. Skipped while still inside the HUD
    // vertical band so steep angles don't overwrite HUD interior cells.
    if (!gameOver && shooter.current) {
      const aimColor = M.vividColor(shooter.current.colorIdx);
      const stepPx = cellH * 0.7;
      const ceilingPx = startSlotRow * cellH;
      for (let s = 1; s <= AIM_DOTS; s++) {
        const px = shooterPx + Math.cos(shooter.angle) * stepPx * s;
        const py = shooterPy + Math.sin(shooter.angle) * stepPx * s;
        if (py < ceilingPx) break;
        if (py >= dangerY) continue;
        const col = Math.floor(px / cellW);
        const row = Math.floor(py / cellH);
        const k = col + ',' + row;
        if (frameKeys.has(k)) continue;
        if (bubbleKeys.has(k)) break;
        put(col, row, '•', aimColor);
      }
    }

    if (projectile) {
      const col = Math.floor(projectile.x / cellW);
      const row = Math.floor(projectile.y / cellH);
      put(col, row, projectile.char, M.vividColor(projectile.colorIdx));
    }

    if (gameOver) {
      const msg = `score ${score} — click to restart`;
      const startCol = Math.max(0, Math.floor((cols - msg.length) / 2));
      const midRow = Math.floor(rows / 2);
      for (let i = 0; i < msg.length; i++) {
        put(startCol + i, midRow, msg[i], link);
      }
    }

    for (const key of lastWritten) {
      if (!writes.has(key)) {
        const [col, row] = key.split(',');
        M.clearCell(+col, +row);
      }
    }
    for (const [key, val] of writes) {
      const [col, row] = key.split(',');
      M.setCell(+col, +row, val.char, val.color);
    }
    lastWritten = new Set(writes.keys());
  };

  // ---- pointer ---------------------------------------------------------
  const onPointerMove = (e) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
  };
  const onPointerDown = (e) => {
    if (e.target && e.target.closest && e.target.closest('a, button')) return;
    pointerX = e.clientX;
    pointerY = e.clientY;
    if (gameOver) reset();
    else fire();
  };

  // ---- bootstrap -------------------------------------------------------
  let lastT = 0;
  const loop = (now) => {
    if (document.hidden) {
      lastT = 0;
      requestAnimationFrame(loop);
      return;
    }
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0;
    lastT = now;
    updateAim();
    tick(dt);
    checkLose();
    render();
    requestAnimationFrame(loop);
  };

  const start = () => {
    if (!window.matrixGame || !window.matrixGame.isPlayMode || window.matrixGame.cols === 0) {
      requestAnimationFrame(start);
      return;
    }
    M = window.matrixGame;
    computeLayout();
    reset();
    pointerX = shooterPx;
    pointerY = shooterPy - 200;
    updateAim();
    M.on('regrid', () => {
      const oldSlotCols = slotCols;
      computeLayout();
      // If the playfield width changed (only happens when the matrix's
      // panel labels change), the existing grid rows have the wrong length.
      // Reset the game to keep the data structure consistent.
      if (slotCols !== oldSlotCols) reset();
      lastWritten = new Set();
    });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
    requestAnimationFrame(loop);
  };
  start();
})();
