import { AIM_LIMIT, COLLISION_R } from './constants';
import { state, requireM } from './state';
import { addPointBurst, tickBurst } from './bursts';
import { collectFloaters, collectMatch, popGroup, tickPops } from './matching';
import { ensureRow, makeBubble, descend, refillIfEmpty } from './bubbles';

const slotToPixel = (i: number, j: number) => ({
  x: (state.startSlotCol + i) * state.cellW + state.cellW / 2,
  y: (state.startSlotRow + j) * state.cellH + state.cellH / 2,
});

export const updateAim = (): void => {
  const dx = state.pointerX - state.shooterPx;
  const dy = Math.min(state.pointerY - state.shooterPy, -1);
  let a = Math.atan2(dy, dx);
  const lo = -Math.PI / 2 - AIM_LIMIT;
  const hi = -Math.PI / 2 + AIM_LIMIT;
  if (a < lo) a = lo;
  if (a > hi) a = hi;
  state.shooter.angle = a;
};

export const fire = (): void => {
  if (state.projectile || state.gameOver || !state.shooter.current) return;
  state.projectile = {
    x: state.shooterPx,
    y: state.shooterPy,
    vx: Math.cos(state.shooter.angle) * state.projectileSpeed,
    vy: Math.sin(state.shooter.angle) * state.projectileSpeed,
    colorIdx: state.shooter.current.colorIdx,
    char: state.shooter.current.char,
  };
  state.shooter.current = state.shooter.next;
  state.shooter.next = makeBubble();
};

const wallMinX = (): number => state.startSlotCol * state.cellW;
const wallMaxX = (): number => (state.startSlotCol + state.slotCols) * state.cellW;

const collisionAt = (): boolean => {
  const p = state.projectile!;
  // Ceiling — projectile centre has crossed the top of the playfield.
  if (p.y < state.startSlotRow * state.cellH) return true;

  // Distance check against nearby occupied slots. The grid is non-square
  // (cellW ≠ cellH), so normalise by cell size to keep the threshold
  // isotropic in slot-space — same metric snapAndResolve uses to pick a
  // landing slot.
  const tj = Math.max(0, Math.round((p.y / state.cellH) - state.startSlotRow));
  const ti = Math.max(0, Math.min(state.slotCols - 1,
    Math.round((p.x / state.cellW) - state.startSlotCol)));
  const r2 = COLLISION_R * COLLISION_R;
  for (let j = Math.max(0, tj - 1); j <= tj + 1; j++) {
    const row = state.grid[j];
    if (!row) continue;
    const iLo = Math.max(0, ti - 1);
    const iHi = Math.min(state.slotCols - 1, ti + 1);
    for (let i = iLo; i <= iHi; i++) {
      if (!row[i]) continue;
      const sp = slotToPixel(i, j);
      const dx = (p.x - sp.x) / state.cellW;
      const dy = (p.y - sp.y) / state.cellH;
      if (dx * dx + dy * dy < r2) return true;
    }
  }
  return false;
};

const snapAndResolve = (): void => {
  const M = requireM();
  const p = state.projectile!;
  let best: { i: number; j: number } | null = null;
  let bestD2 = Infinity;
  const tj = Math.max(0, Math.round((p.y / state.cellH) - state.startSlotRow));
  for (let j = Math.max(0, tj - 1); j <= tj + 1; j++) {
    ensureRow(j);
    for (let i = 0; i < state.slotCols; i++) {
      if (state.grid[j]![i]) continue;
      const sp = slotToPixel(i, j);
      const dx = (p.x - sp.x) / state.cellW;
      const dy = (p.y - sp.y) / state.cellH;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = { i, j }; }
    }
  }
  if (best) {
    ensureRow(best.j);
    state.grid[best.j]![best.i] = { colorIdx: p.colorIdx, char: p.char };

    // Wave 1 — direct match (linear run or cluster). A combo shot collapses
    // the per-wave popups into a single banner showing the total earned, so
    // the points value is never displayed twice.
    const matchCells = collectMatch(best.i, best.j);
    let waves = 0;
    let totalPopped = 0;
    let lastBurstColor: number[] | readonly number[] | null = null;
    let totalEarned = 0;
    if (matchCells.length) {
      const matchPts = matchCells.length + Math.max(0, matchCells.length - 3) * 2;
      popGroup(matchCells, 'match');
      totalEarned += matchPts;
      totalPopped += matchCells.length;
      lastBurstColor = M.titleColor();
      waves++;

      // Wave 2 — floaters knocked loose by the match.
      const floatCells = collectFloaters();
      if (floatCells.length) {
        const floatPts = floatCells.length * 3;
        popGroup(floatCells, 'float');
        totalEarned += floatPts;
        totalPopped += floatCells.length;
        lastBurstColor = M.linkColor();
        waves++;
      }
    }

    if (waves >= 2) {
      // Combo: flat bonus on top of the wave totals, but only ONE popup
      // and ONE score addition for the whole shot.
      totalEarned += totalPopped * 2;
      state.score += totalEarned;
      addPointBurst('✦ +' + totalEarned + ' combo', M.titleColor(), 'combo');
      // Flash the bg around the playfield with the un-dampened (index-page)
      // palette for a beat — duration scales with chain size so big combos
      // hold the celebration longer.
      M.flashBackground(Math.min(700, 280 + totalPopped * 25));
    } else if (waves === 1 && lastBurstColor) {
      state.score += totalEarned;
      addPointBurst('+' + totalEarned, lastBurstColor);
    }
  }
  state.projectile = null;
  state.shotsSinceDescent++;
  const refilled = refillIfEmpty();
  if (!refilled && state.shotsSinceDescent >= state.shotsPerDescent) {
    state.shotsSinceDescent = 0;
    descend();
  }
};

export const tick = (dt: number): void => {
  tickPops();
  tickBurst();
  if (state.gameOver || !state.projectile) return;
  state.projectile.x += state.projectile.vx * dt;
  state.projectile.y += state.projectile.vy * dt;
  const halfW = state.cellW / 2;
  if (state.projectile.x < wallMinX() + halfW) {
    state.projectile.x = wallMinX() + halfW;
    state.projectile.vx = -state.projectile.vx;
  } else if (state.projectile.x > wallMaxX() - halfW) {
    state.projectile.x = wallMaxX() - halfW;
    state.projectile.vx = -state.projectile.vx;
  }
  if (collisionAt()) {
    snapAndResolve();
  } else if (state.projectile.y > state.rows * state.cellH + state.cellH) {
    state.projectile = null;
  }
};
