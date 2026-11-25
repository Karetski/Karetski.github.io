import type { ThemeSnapshot } from '../../framework/theme/types';

// Minimal contract the bubble game's *logic* (physics, bursts, etc.) needs
// from the host. Components don't use this — they pull from RenderContext.
export interface GameDeps {
  readonly numColors: number;
  charFor(colorIdx: number): string;
  theme(): ThemeSnapshot;
  flashBackground(durationMs: number): void;
}
