import { AIM_LIMIT, COLLISION_R } from './constants';
import { type GameGrid, type GameState, requireM } from './state';
import { addPointBurst, tickBurst } from './bursts';
import { collectFloaters, collectMatch, popGroup, tickPops } from './matching';
import { ensureRow, makeBubble, descend, refillIfEmpty } from './bubbles';

// Pure: clamps the aim angle to AIM_LIMIT around straight up.
export const aimAngle = (
  pointerX: number,
  pointerY: number,
  shooterPx: number,
  shooterPy: number,
  aimLimit: number = AIM_LIMIT,
): number => {
  const dx = pointerX - shooterPx;
  const dy = Math.min(pointerY - shooterPy, -1);
  let a = Math.atan2(dy, dx);
  const lo = -Math.PI / 2 - aimLimit;
  const hi = -Math.PI / 2 + aimLimit;
  if (a < lo) a = lo;
  if (a > hi) a = hi;
  return a;
};

// Pure: bounce off vertical walls. Returns the corrected (x, vx); if neither
// wall is touched, returns the inputs unchanged.
export const reflectX = (
  x: number,
  vx: number,
  leftBound: number,
  rightBound: number,
  halfW: number,
): { x: number; vx: number } => {
  if (x < leftBound + halfW) return { x: leftBound + halfW, vx: -vx };
  if (x > rightBound - halfW) return { x: rightBound - halfW, vx: -vx };
  return { x, vx };
};

// Pure: returns the [i, j] of the closest empty slot to the projectile in
// the row band [tj-1, tj+1], using slot-normalised distance. Returns null
// if no empty slot was found in that band.
export const findSnapSlot = (
  grid: GameGrid,
  slotCols: number,
  projX: number,
  projY: number,
  startSlotCol: number,
  startSlotRow: number,
  cellW: number,
  cellH: number,
): [number, number] | null => {
  let best: [number, number] | null = null;
  let bestD2 = Infinity;
  const tj = Math.max(0, Math.round((projY / cellH) - startSlotRow));
  for (let j = Math.max(0, tj - 1); j <= tj + 1; j++) {
    const row = grid[j];
    for (let i = 0; i < slotCols; i++) {
      if (row && row[i]) continue;
      const cellX = (startSlotCol + i) * cellW + cellW / 2;
      const cellY = (startSlotRow + j) * cellH + cellH / 2;
      const dx = (projX - cellX) / cellW;
      const dy = (projY - cellY) / cellH;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = [i, j]; }
    }
  }
  return best;
};

const slotToPixel = (state: GameState, i: number, j: number) => ({
  x: (state.startSlotCol + i) * state.cellW + state.cellW / 2,
  y: (state.startSlotRow + j) * state.cellH + state.cellH / 2,
});

export const updateAim = (state: GameState): void => {
  state.shooter.angle = aimAngle(state.pointerX, state.pointerY, state.shooterPx, state.shooterPy);
};

export const fire = (state: GameState, rng: () => number = Math.random): void => {
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
  state.shooter.next = makeBubble(state, rng);
};

const wallMinX = (state: GameState): number => state.startSlotCol * state.cellW;
const wallMaxX = (state: GameState): number => (state.startSlotCol + state.slotCols) * state.cellW;

const collisionAt = (state: GameState): boolean => {
  const p = state.projectile!;
  // Ceiling — projectile centre has crossed the top of the playfield.
  if (p.y < state.startSlotRow * state.cellH) return true;

  // Distance check against nearby occupied slots. The grid is non-square
  // (cellW ≠ cellH), so normalise by cell size to keep the threshold
  // isotropic in slot-space — same metric findSnapSlot uses to pick a
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
      const sp = slotToPixel(state, i, j);
      const dx = (p.x - sp.x) / state.cellW;
      const dy = (p.y - sp.y) / state.cellH;
      if (dx * dx + dy * dy < r2) return true;
    }
  }
  return false;
};

const snapAndResolve = (state: GameState, rng: () => number): void => {
  const M = requireM(state);
  const p = state.projectile!;
  const slot = findSnapSlot(
    state.grid, state.slotCols,
    p.x, p.y,
    state.startSlotCol, state.startSlotRow,
    state.cellW, state.cellH,
  );
  if (slot) {
    ensureRow(state, slot[1]);
    state.grid[slot[1]]![slot[0]] = { colorIdx: p.colorIdx, char: p.char };

    // Wave 1 — direct match (linear run or cluster). A combo shot collapses
    // the per-wave popups into a single banner showing the total earned, so
    // the points value is never displayed twice.
    const matchCells = collectMatch(state.grid, state.slotCols, slot[0], slot[1]);
    let waves = 0;
    let totalPopped = 0;
    let lastBurstColor: number[] | readonly number[] | null = null;
    let totalEarned = 0;
    if (matchCells.length) {
      // Cells already disconnected from the ceiling before this shot are
      // grandfathered in (typically descent-orphans we left behind on
      // purpose). Wave 2 should only sweep cells the match itself knocks
      // loose, so snapshot the pre-existing floater set first.
      const preFloat = new Set<string>();
      const preCells = collectFloaters(state.grid, state.slotCols);
      for (let k = 0; k < preCells.length; k++) {
        preFloat.add(preCells[k]![0] + ',' + preCells[k]![1]);
      }

      const matchPts = matchCells.length + Math.max(0, matchCells.length - 3) * 2;
      popGroup(state, matchCells, 'match');
      totalEarned += matchPts;
      totalPopped += matchCells.length;
      lastBurstColor = M.theme().title;
      waves++;

      // Wave 2 — floaters knocked loose by the match (excluding pre-existing
      // disconnected groups carried over from descents).
      const floatCells = collectFloaters(state.grid, state.slotCols)
        .filter(([i, j]) => !preFloat.has(i + ',' + j));
      if (floatCells.length) {
        const floatPts = floatCells.length * 3;
        popGroup(state, floatCells, 'float');
        totalEarned += floatPts;
        totalPopped += floatCells.length;
        lastBurstColor = M.theme().link;
        waves++;
      }
    }

    if (waves >= 2) {
      // Combo: flat bonus on top of the wave totals, but only ONE popup
      // and ONE score addition for the whole shot.
      totalEarned += totalPopped * 2;
      state.score += totalEarned;
      addPointBurst(state, '✦ +' + totalEarned + ' combo', M.theme().title, 'combo');
      // Flash the bg around the playfield with the un-dampened (index-page)
      // palette for a beat — duration scales with chain size so big combos
      // hold the celebration longer.
      M.flashBackground(Math.min(700, 280 + totalPopped * 25));
    } else if (waves === 1 && lastBurstColor) {
      state.score += totalEarned;
      addPointBurst(state, '+' + totalEarned, lastBurstColor);
    }
  }
  state.projectile = null;
  state.shotsSinceDescent++;
  const refilled = refillIfEmpty(state, rng);
  if (!refilled && state.shotsSinceDescent >= state.shotsPerDescent) {
    state.shotsSinceDescent = 0;
    descend(state, rng);
  }
};

export const tick = (
  state: GameState,
  dt: number,
  now: number = performance.now(),
  rng: () => number = Math.random,
): void => {
  tickPops(state, now);
  tickBurst(state, now);
  if (state.gameOver || !state.projectile) return;
  state.projectile.x += state.projectile.vx * dt;
  state.projectile.y += state.projectile.vy * dt;
  const halfW = state.cellW / 2;
  const r = reflectX(state.projectile.x, state.projectile.vx, wallMinX(state), wallMaxX(state), halfW);
  state.projectile.x = r.x;
  state.projectile.vx = r.vx;
  if (collisionAt(state)) {
    snapAndResolve(state, rng);
  } else if (state.projectile.y > state.rows * state.cellH + state.cellH) {
    state.projectile = null;
  }
};
