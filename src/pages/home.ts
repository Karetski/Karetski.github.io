import { createSceneHost } from '../bubble/framework/scene/host';
import { createThemeProvider } from '../bubble/framework/theme/provider';
import { createMatrixBackgroundScene } from '../bubble/apps/matrix-background/scene';
import { createSiteChromeScene } from '../bubble/apps/site-chrome/scene';

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
