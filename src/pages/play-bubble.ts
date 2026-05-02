import { createSceneHost } from '../framework/scene/host';
import { createThemeProvider } from '../framework/theme/provider';
import { createMatrixBackgroundScene } from '../apps/matrix-background/scene';
import { createSiteChromeScene } from '../apps/site-chrome/scene';
import { createBubbleGameScene } from '../apps/bubble-game/scene';

const screen = document.getElementById('screen') as HTMLCanvasElement | null;
if (screen) {
  const theme = createThemeProvider();
  // Calm the background so the game reads as the foreground action.
  const cfg = theme.config();
  cfg.noiseSpeed = 0.2;
  cfg.colorNoiseSpeed = 0.06;
  cfg.flipVariation = 0.2;

  const host = createSceneHost({ screen, theme });
  if (host) {
    const matrix = createMatrixBackgroundScene({ calmField: true });
    host.mount(matrix);
    host.mount(createSiteChromeScene({
      isPlayMode: true,
      onConfigReset: () => matrix.rebuildAfterConfigChange(),
    }));
    host.mount(createBubbleGameScene());
  }
}
