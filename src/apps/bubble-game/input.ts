import type { InputBus } from '../../framework/scene/input';
import { state } from './state';
import { fire } from './physics';
import { reset } from './bubbles';

export const installGameInput = (input: InputBus): (() => void) => {
  let dragging = false;
  const isTouchLike = (e: PointerEvent): boolean => e.pointerType !== 'mouse';

  const isOverInteractive = (e: PointerEvent): boolean => {
    const t = e.target as Element | null;
    return !!t?.closest?.('a, button');
  };

  const offMove = input.onPointerMove((e) => {
    if (isTouchLike(e) && !dragging) return;
    state.pointerX = e.clientX;
    state.pointerY = e.clientY;
  });

  const offDown = input.onPointerDown((e) => {
    if (isOverInteractive(e)) return;
    state.pointerX = e.clientX;
    state.pointerY = e.clientY;
    if (isTouchLike(e)) {
      dragging = true;
      return;
    }
    if (state.gameOver) reset(state);
    else fire(state);
  });

  const offUp = input.onPointerUp((e) => {
    if (!isTouchLike(e) || !dragging) return;
    dragging = false;
    state.pointerX = e.clientX;
    state.pointerY = e.clientY;
    if (state.gameOver) reset(state);
    else fire(state);
  });

  const offCancel = input.onPointerCancel(() => { dragging = false; });

  return () => { offMove(); offDown(); offUp(); offCancel(); };
};
