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
  const INITIAL_ROWS              = 5;
  const REFILL_ROWS               = 4;
  const INITIAL_SHOTS_PER_DESCENT = 8;
  const MIN_SHOTS_PER_DESCENT     = 2;
  const AIM_LIMIT                 = (75 * Math.PI) / 180;
  const AIM_DOTS                  = 16;
  const NUM_COLORS                = 3;
  const POP_DURATION_MS           = 520;
  const POINT_BURST_DURATION_MS   = 1200;
  const COMBO_BURST_DURATION_MS   = 1500;
  const LEVEL_BURST_DURATION_MS   = 1500;
  // Descent rows start sparse at level 1 and approach full density as the
  // level climbs, so increasing pressure shows up both as more frequent
  // descents and denser new rows.
  const NEW_ROW_FILL_BASE         = 0.78;
  const NEW_ROW_FILL_PER_LEVEL    = 0.025;
  // Collision threshold in normalised slot-spacings. <1 lets the projectile
  // fully enter a gap between two filled slots before committing; closer to
  // 1 means it snaps as soon as it touches a neighbour. Tune for feel.
  const COLLISION_R               = 0.85;

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
  let shotsPerDescent = INITIAL_SHOTS_PER_DESCENT;
  let level = 1;
  let score = 0;
  let gameOver = false;
  let pointerX = 0, pointerY = 0;
  let lastWritten = new Set();
  let popping = [];
  let pointBursts = [];

  // ---- slot ↔ matrix cell layout ---------------------------------------
  const slotToCell = (i, j) => ({
    col: startSlotCol + i,
    row: startSlotRow + j,
  });
  const slotToPixel = (i, j) => {
    const c = slotToCell(i, j);
    return { x: c.col * cellW + cellW / 2, y: c.row * cellH + cellH / 2 };
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
    shotsPerDescent = INITIAL_SHOTS_PER_DESCENT;
    level = 1;
    score = 0;
    gameOver = false;
    popping = [];
    pointBursts = [];
  };

  const descentRowFill = () =>
    Math.min(1, NEW_ROW_FILL_BASE + (level - 1) * NEW_ROW_FILL_PER_LEVEL);

  // Shared level bump used by both descents and refills, so clearing the
  // playfield is progression instead of resetting the difficulty knob like
  // it used to. Banner runs through the existing point-burst pipeline.
  const advanceLevel = () => {
    level++;
    if (shotsPerDescent > MIN_SHOTS_PER_DESCENT) shotsPerDescent--;
    if (M && slotCols > 0) {
      const bannerCol = startSlotCol + Math.floor(slotCols / 2);
      addPointBurst(bannerCol, 1, '◇ LEVEL ' + level + ' ◇', M.titleColor(), 'level');
    }
  };

  const descend = () => {
    advanceLevel();
    grid.unshift(randomRow(descentRowFill()));
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
    advanceLevel();
    return true;
  };

  // ---- pops ------------------------------------------------------------
  // popCell only animates + clears the slot. Scoring is awarded per wave by
  // the caller so we can show "+N" bursts and combo bonuses cohesively.
  const popCell = (i, j, kind) => {
    const cell = grid[j][i];
    if (!cell) return null;
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
    return c;
  };

  const popGroup = (cells, kind) => {
    let sumCol = 0, sumRow = 0, n = 0;
    for (let k = 0; k < cells.length; k++) {
      const p = popCell(cells[k][0], cells[k][1], kind);
      if (p) { sumCol += p.col; sumRow += p.row; n++; }
    }
    if (!n) return null;
    return { col: Math.round(sumCol / n), row: Math.round(sumRow / n) };
  };

  const addPointBurst = (col, row, text, color, kind) => {
    pointBursts.push({
      col, row, text, color,
      kind: kind || 'score',
      tStart: performance.now(),
    });
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
    // Reserve 2 rows above the bubble area: row 1 for popups, row 2 for the
    // separator line that fences the popup strip off from the playfield.
    startSlotRow = 3;

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

  const collisionAt = () => {
    // Ceiling — projectile centre has crossed the top of the playfield.
    if (projectile.y < startSlotRow * cellH) return true;

    // Distance check against nearby occupied slots. The grid is non-square
    // (cellW ≠ cellH), so normalise by cell size to keep the threshold
    // isotropic in slot-space — same metric snapAndResolve uses to pick a
    // landing slot.
    const tj = Math.max(0, Math.round((projectile.y / cellH) - startSlotRow));
    const ti = Math.max(0, Math.min(slotCols - 1,
      Math.round((projectile.x / cellW) - startSlotCol)));
    const r2 = COLLISION_R * COLLISION_R;
    for (let j = Math.max(0, tj - 1); j <= tj + 1; j++) {
      const row = grid[j];
      if (!row) continue;
      const iLo = Math.max(0, ti - 1);
      const iHi = Math.min(slotCols - 1, ti + 1);
      for (let i = iLo; i <= iHi; i++) {
        if (!row[i]) continue;
        const p = slotToPixel(i, j);
        const dx = (projectile.x - p.x) / cellW;
        const dy = (projectile.y - p.y) / cellH;
        if (dx * dx + dy * dy < r2) return true;
      }
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
    if (pointBursts.length) {
      const now = performance.now();
      let w = 0;
      for (let r = 0; r < pointBursts.length; r++) {
        const k = pointBursts[r].kind;
        const dur = k === 'combo' ? COMBO_BURST_DURATION_MS
          : k === 'level' ? LEVEL_BURST_DURATION_MS
          : POINT_BURST_DURATION_MS;
        if (now - pointBursts[r].tStart < dur) pointBursts[w++] = pointBursts[r];
      }
      pointBursts.length = w;
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
    if (collisionAt()) {
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

      // Wave 1 — direct match (linear run or cluster).
      const matchCells = collectMatch(best.i, best.j);
      let waves = 0;
      let totalPopped = 0;
      // All bursts render in the dedicated popup strip above the bubble
      // area so they never cover bubbles. A combo shot collapses the per-
      // wave popups into a single banner showing the total earned, so the
      // points value is never displayed twice.
      const popupRow = 1;
      let lastBurstCol = null, lastBurstColor = null;
      let totalEarned = 0;
      if (matchCells.length) {
        const matchPts = matchCells.length + Math.max(0, matchCells.length - 3) * 2;
        const c = popGroup(matchCells, 'match');
        totalEarned += matchPts;
        totalPopped += matchCells.length;
        if (c) { lastBurstCol = c.col; lastBurstColor = M.titleColor(); }
        waves++;

        // Wave 2 — floaters knocked loose by the match.
        const floatCells = collectFloaters();
        if (floatCells.length) {
          const floatPts = floatCells.length * 3;
          const fc = popGroup(floatCells, 'float');
          totalEarned += floatPts;
          totalPopped += floatCells.length;
          if (fc) { lastBurstCol = fc.col; lastBurstColor = M.linkColor(); }
          waves++;
        }
      }

      if (waves >= 2) {
        // Combo: flat bonus on top of the wave totals, but only ONE popup
        // and ONE score addition for the whole shot.
        totalEarned += totalPopped * 2;
        score += totalEarned;
        const bannerCol = startSlotCol + Math.floor(slotCols / 2);
        addPointBurst(bannerCol, popupRow, '✦ COMBO +' + totalEarned + ' ✦', M.titleColor(), 'combo');
      } else if (waves === 1) {
        score += totalEarned;
        if (lastBurstCol !== null) {
          addPointBurst(lastBurstCol, popupRow, '+' + totalEarned, lastBurstColor);
        }
      }
    }
    projectile = null;
    shotsSinceDescent++;
    const refilled = refillIfEmpty();
    if (!refilled && shotsSinceDescent >= shotsPerDescent) {
      shotsSinceDescent = 0;
      descend();
    }
  };

  // Returns [[i, j], ...] of cells that should pop (linear-run + cluster
  // rules), without mutating the grid.
  const collectMatch = (i, j) => {
    const cell = grid[j][i];
    if (!cell) return [];
    const targetColor = cell.colorIdx;
    const targetChar  = cell.char;
    const toPop = new Set();

    // Linear runs through the placed bubble: any straight line of 2+ bubbles
    // sharing the *exact same symbol* pops (horizontal in the row, vertical
    // in the column). Symbols are stricter than colors, so this fires for
    // matching glyphs even when the cluster rule wouldn't trigger.
    const addRun = (di, dj) => {
      const run = [[i, j]];
      let ci = i + di, cj = j + dj;
      while (cj >= 0 && cj < grid.length && ci >= 0 && ci < slotCols
             && grid[cj][ci] && grid[cj][ci].char === targetChar) {
        run.push([ci, cj]);
        ci += di; cj += dj;
      }
      ci = i - di; cj = j - dj;
      while (cj >= 0 && cj < grid.length && ci >= 0 && ci < slotCols
             && grid[cj][ci] && grid[cj][ci].char === targetChar) {
        run.push([ci, cj]);
        ci -= di; cj -= dj;
      }
      if (run.length >= 2) for (let k = 0; k < run.length; k++) toPop.add(run[k][0] + ',' + run[k][1]);
    };
    addRun(1, 0);
    addRun(0, 1);

    // Connected cluster of 3+ same-color bubbles in any shape (classic
    // Puzzle Bobble rule — color-based, so different glyphs of the same hue
    // count toward the cluster).
    const seen = new Set([i + ',' + j]);
    const stack = [[i, j]];
    const cluster = [];
    while (stack.length) {
      const [ci, cj] = stack.pop();
      const cur = grid[cj][ci];
      if (!cur || cur.colorIdx !== targetColor) continue;
      cluster.push([ci, cj]);
      const ns = neighborsOf(ci, cj);
      for (let k = 0; k < ns.length; k++) {
        const ni = ns[k][0], nj = ns[k][1];
        const key = ni + ',' + nj;
        const target2 = grid[nj][ni];
        if (!seen.has(key) && target2 && target2.colorIdx === targetColor) {
          seen.add(key);
          stack.push([ni, nj]);
        }
      }
    }
    if (cluster.length >= 3) for (let k = 0; k < cluster.length; k++) toPop.add(cluster[k][0] + ',' + cluster[k][1]);

    if (!toPop.size) return [];
    const out = [];
    for (const key of toPop) {
      const [a, b] = key.split(',');
      out.push([+a, +b]);
    }
    return out;
  };

  // Returns [[i, j], ...] of bubbles disconnected from the ceiling row.
  const collectFloaters = () => {
    if (!grid.length || !grid[0]) return [];
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
    const out = [];
    for (let j = 0; j < grid.length; j++) {
      for (let i = 0; i < slotCols; i++) {
        if (grid[j][i] && !reachable.has(i + ',' + j)) out.push([i, j]);
      }
    }
    return out;
  };

  // Standalone floater drop used by descend(): pops, scores and emits a
  // burst, but doesn't participate in combo accounting (descents aren't
  // shot-driven).
  const dropFloaters = () => {
    const cells = collectFloaters();
    if (!cells.length) return;
    const pts = cells.length * 3;
    const c = popGroup(cells, 'float');
    score += pts;
    if (c) addPointBurst(c.col, 1, '+' + pts, M.linkColor());
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

    // Popup strip: a fully-enclosed bordered box that mirrors the bottom HUD
    // — same width, same double-line style — so the playfield is bracketed
    // by matching frames at the top and bottom.
    {
      const popTop    = 0;
      const popInner  = 1;
      const popBot    = startSlotRow - 1;  // == 2
      const popLeft   = panelLeft;
      const popRight  = panelLeft + panelWidth - 1;
      // Top + bottom borders (corners at outer ends, ═ in between).
      for (let x = 0; x < panelWidth; x++) {
        const col = popLeft + x;
        let topCh = '═', botCh = '═';
        if (x === 0)                 { topCh = '╔'; botCh = '╚'; }
        else if (x === panelWidth-1) { topCh = '╗'; botCh = '╝'; }
        put(col, popTop, topCh, frameColor);
        put(col, popBot, botCh, frameColor);
        frameKeys.add(col + ',' + popTop);
        frameKeys.add(col + ',' + popBot);
      }
      // Inner row: blank-fill so flipping bg can't bleed through, then the
      // side verticals on the outer columns. Popup text sits in the middle
      // and skips frameKeys so the box is never broken.
      for (let x = 0; x < panelWidth; x++) {
        const col = popLeft + x;
        put(col, popInner, ' ', frameColor);
      }
      put(popLeft,  popInner, '║', frameColor);
      put(popRight, popInner, '║', frameColor);
      frameKeys.add(popLeft  + ',' + popInner);
      frameKeys.add(popRight + ',' + popInner);

      // Persistent level readout, centred in the popup strip. Hidden while
      // any "+N" / combo / level banner is animating so the strip reads as a
      // single message at a time instead of two competing labels.
      if (!pointBursts.length) {
        const levelStr = 'lv ' + level;
        const center   = popLeft + Math.floor(panelWidth / 2);
        const startCol = center - Math.floor(levelStr.length / 2);
        for (let i = 0; i < levelStr.length; i++) {
          const col = startCol + i;
          if (col <= popLeft || col >= popRight) continue;
          put(col, popInner, levelStr[i], link);
        }
      }
    }

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

    // Point bursts — score "+N" drifts up + fades out. Combo banners are
    // intentionally louder: held in place, flashing between title + link
    // colors, and rendered last so they sit on top of bubbles, the projectile
    // and even the aim line until they fade.
    if (pointBursts.length) {
      const now = performance.now();
      const isLight = M.isLight;
      const bg = isLight ? 255 : 0;
      const titleC = M.titleColor();
      const linkC  = M.linkColor();
      // Plain text on the popup row — no per-burst border now that the
      // separator line fences the strip off from the bubble area. Score
      // bursts opening-flash, combo banners color-flash, but neither moves.
      const drawBurstText = (pb, color) => {
        const text = pb.text;
        // Clamp the text so it always sits inside the popup box's side
        // verticals — otherwise a "+N" anchored at the left edge would have
        // its "+" silently swallowed by the border via the frameKeys skip.
        const minCol = panelLeft + 1;
        const maxCol = panelLeft + panelWidth - 2;
        let startCol = pb.col - Math.floor(text.length / 2);
        if (startCol < minCol) startCol = minCol;
        if (startCol + text.length - 1 > maxCol) startCol = maxCol - text.length + 1;
        for (let i = 0; i < text.length; i++) {
          const col = startCol + i;
          if (col < 0 || col >= cols) continue;
          if (frameKeys.has(col + ',' + pb.row)) continue;
          put(col, pb.row, text[i], color);
        }
      };

      // Score bursts ("+N") — first pass.
      for (let p = 0; p < pointBursts.length; p++) {
        const pb = pointBursts[p];
        if (pb.kind === 'combo') continue;
        const elapsed = now - pb.tStart;
        const t = Math.max(0, Math.min(1, elapsed / POINT_BURST_DURATION_MS));
        let fade;
        if (t < 0.7) fade = 1;
        else         fade = Math.max(0, 1 - (t - 0.7) / 0.3);
        const baseColor = elapsed < 140 ? titleC : pb.color;
        drawBurstText(pb, blendToBg(baseColor, fade, bg));
      }

      // Combo + level banners — drawn last so they sit on top of score
      // bursts. Level banners reuse the held-in-place flashing treatment but
      // swap the flash colour to the bubble palette so they read as a
      // distinct event from a combo.
      for (let p = 0; p < pointBursts.length; p++) {
        const pb = pointBursts[p];
        if (pb.kind !== 'combo' && pb.kind !== 'level') continue;
        const dur = pb.kind === 'level' ? LEVEL_BURST_DURATION_MS : COMBO_BURST_DURATION_MS;
        const elapsed = now - pb.tStart;
        const t = Math.max(0, Math.min(1, elapsed / dur));
        const flashOn  = (Math.floor(elapsed / 90) & 1) === 0;
        let baseColor;
        if (pb.kind === 'level') {
          const accent = M.vividColor(Math.floor(elapsed / 180) % NUM_COLORS);
          baseColor = flashOn ? titleC : accent;
        } else {
          baseColor = flashOn ? linkC : titleC;
        }
        let fade;
        if (t < 0.08)      fade = t / 0.08;
        else if (t < 0.7)  fade = 1;
        else               fade = Math.max(0, 1 - (t - 0.7) / 0.3);
        drawBurstText(pb, blendToBg(baseColor, fade, bg));
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
