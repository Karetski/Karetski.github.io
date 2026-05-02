import { RIPPLE_RADIUS } from './constants';
import { state } from './state';

const isInDebugPanel = (e: PointerEvent): boolean => {
  const t = e.target as Element | null;
  return !!t?.closest?.('#debug-panel');
};

const applyRippleAt = (px: number, py: number): void => {
  const { cells, cellW, cellH, cols, rows } = state;
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
        const cell = cells[r * cols + c]!;
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

export const stepPointer = (): void => {
  const p = state.pointer;
  if (!p.active) return;
  const ddx = p.x - p.lastX;
  const ddy = p.y - p.lastY;
  const dist = Math.sqrt(ddx * ddx + ddy * ddy);
  const step = RIPPLE_RADIUS * 0.5;
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let s = 1; s <= steps; s++) {
    const f = s / steps;
    applyRippleAt(p.lastX + ddx * f, p.lastY + ddy * f);
  }
  p.lastX = p.x;
  p.lastY = p.y;
};

export const installPointerHandlers = (): void => {
  const onPointerDown = (e: PointerEvent) => {
    if (isInDebugPanel(e)) return;
    const p = state.pointer;
    p.active = true;
    p.x = e.clientX;
    p.y = e.clientY;
    p.lastX = e.clientX;
    p.lastY = e.clientY;
  };
  const onPointerMove = (e: PointerEvent) => {
    const p = state.pointer;
    if (!p.active) return;
    p.x = e.clientX;
    p.y = e.clientY;
  };
  const onPointerEnd = () => { state.pointer.active = false; };
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);
};
