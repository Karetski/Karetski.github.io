export const INITIAL_ROWS              = 5;
export const REFILL_ROWS                = 4;
export const INITIAL_SHOTS_PER_DESCENT  = 8;
export const MIN_SHOTS_PER_DESCENT      = 3;
export const AIM_LIMIT                  = (75 * Math.PI) / 180;
export const AIM_REACH_CELLS            = 11;
export const NUM_COLORS                 = 3;
export const POP_DURATION_MS            = 520;
export const POINT_BURST_DURATION_MS    = 1200;
export const COMBO_BURST_DURATION_MS    = 1500;
export const LEVEL_BURST_DURATION_MS    = 1500;

// Descent rows start sparse at level 1 and approach full density as the
// level climbs, so increasing pressure shows up both as more frequent
// descents and denser new rows.
export const NEW_ROW_FILL_BASE          = 0.72;
export const NEW_ROW_FILL_PER_LEVEL     = 0.015;

// Collision threshold in normalised slot-spacings. <1 lets the projectile
// fully enter a gap between two filled slots before committing; closer to 1
// means it snaps as soon as it touches a neighbour. Tune for feel.
export const COLLISION_R                = 0.85;

export const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

export type BurstKind = 'score' | 'level' | 'combo';
export const BURST_PRIORITY: Record<BurstKind, number> = {
  score: 1,
  level: 2,
  combo: 3,
};

export type PopKind = 'match' | 'float';
