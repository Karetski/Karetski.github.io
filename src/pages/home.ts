import { createSceneHost } from '../framework/scene/host';
import { createThemeProvider } from '../framework/theme/provider';
import { createMatrixBackgroundScene } from '../apps/matrix-background/scene';
import { createSiteChromeScene } from '../apps/site-chrome/scene';

const screen = document.getElementById('screen') as HTMLCanvasElement | null;
if (screen) {
  const theme = createThemeProvider();
  const host = createSceneHost({ screen, theme });
  if (host) {
    const matrix = createMatrixBackgroundScene({ calmField: false });
    host.mount(matrix);
    host.mount(createSiteChromeScene({
      isPlayMode: false,
      onConfigReset: () => matrix.rebuildAfterConfigChange(),
    }));
  }
}
