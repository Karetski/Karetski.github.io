import type { MatrixGame } from '../shared/types';
import { state } from './state';
import { computeLayout } from './layout';
import { reset } from './bubbles';
import { fire as _fire, tick, updateAim } from './physics';
import { checkLose } from './matching';
import { render } from './render';
import { installGameInput } from './input';

export const startGame = (matrix: MatrixGame): void => {
  state.M = matrix;

  const tryStart = () => {
    if (matrix.cols === 0) {
      requestAnimationFrame(tryStart);
      return;
    }
    computeLayout();
    reset();
    state.pointerX = state.shooterPx;
    state.pointerY = state.shooterPy - 200;
    updateAim();
    matrix.on('regrid', () => {
      const oldSlotCols = state.slotCols;
      computeLayout();
      // If the playfield width changed (only happens when the matrix's
      // panel labels change), the existing grid rows have the wrong length.
      // Reset the game to keep the data structure consistent.
      if (state.slotCols !== oldSlotCols) reset();
      state.lastWritten = new Set();
    });
    installGameInput();

    let lastT = 0;
    const loop = (now: number) => {
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
    requestAnimationFrame(loop);
  };
  tryStart();

  // Suppress unused-import lint by referencing the symbol — fire is used
  // indirectly via the input module and re-exporting it makes the public
  // surface explicit.
  void _fire;
};
