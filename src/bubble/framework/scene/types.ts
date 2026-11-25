import type { CellBuffer } from '../renderer/cell-buffer';
import type { CRTPanelRect } from '../renderer/crt';
import type { Layout, Region } from '../layout/types';
import type { ThemeProvider } from '../theme/provider';
import type { ThemeSnapshot } from '../theme/types';
import type { InputBus } from './input';

export interface RenderContext {
  cells: CellBuffer;
  theme: ThemeSnapshot;
  layout: Layout;
  dt: number;
  now: number;
  input: InputBus;
}

export interface Component {
  paint(ctx: RenderContext): void;
}

export interface Scene {
  name: string;
  zIndex: number;
  components: Component[] | ((ctx: RenderContext) => Component[]);
  update?(dt: number, now: number): void;
  onMount?(host: SceneHost): void;
  onUnmount?(): void;
  onLayout?(layout: Layout, prev: Layout | null): void;
  onTheme?(theme: ThemeSnapshot): void;
}

export interface FlashService {
  trigger(durationMs: number): void;
  intensity(): number;
}

export interface SceneHostServices {
  flash: FlashService;
  setRegion(name: string, region: Region | null): void;
  setPanelMask(rect: CRTPanelRect | null): void;
  requestLayoutRefresh(): void;
}

export interface SceneHost {
  mount(scene: Scene): () => void;
  readonly theme: ThemeProvider;
  readonly input: InputBus;
  readonly services: SceneHostServices;
  layout(): Layout;
}
