import { emit } from './state';
import { initGrid } from './grid-init';
import { applyPanelFrames } from './panel-frame';
import { setupPanelDOM } from './panel-dom';
import type { CRTPipeline } from './crt';

export const setupGrid = (crt: CRTPipeline): void => {
  const { W, H, naturalCellW } = initGrid(crt);
  const panel = applyPanelFrames(W, H);
  setupPanelDOM(panel, naturalCellW, () => setupGrid(crt));
  crt.resize();
  emit('regrid');
};
