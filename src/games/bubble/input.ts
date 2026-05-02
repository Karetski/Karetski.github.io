import { state } from './state';
import { fire } from './physics';
import { reset } from './bubbles';

let dragging = false;
const isTouchLike = (e: PointerEvent): boolean => e.pointerType !== 'mouse';

const onPointerMove = (e: PointerEvent) => {
  if (isTouchLike(e) && !dragging) return;
  state.pointerX = e.clientX;
  state.pointerY = e.clientY;
};

const onPointerDown = (e: PointerEvent) => {
  const t = e.target as Element | null;
  if (t?.closest?.('a, button')) return;
  state.pointerX = e.clientX;
  state.pointerY = e.clientY;
  if (isTouchLike(e)) {
    dragging = true;
    return;
  }
  if (state.gameOver) reset();
  else fire();
};

const onPointerUp = (e: PointerEvent) => {
  if (!isTouchLike(e) || !dragging) return;
  dragging = false;
  state.pointerX = e.clientX;
  state.pointerY = e.clientY;
  if (state.gameOver) reset();
  else fire();
};

const onPointerCancel = () => { dragging = false; };

export const installGameInput = (): void => {
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
};
