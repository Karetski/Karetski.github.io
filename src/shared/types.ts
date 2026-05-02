export type RGB = readonly [number, number, number];

export interface PlayfieldBounds {
  col: number;
  row: number;
  width: number;
  height: number;
}

export type MatrixEvent = 'regrid';

export interface MatrixGame {
  readonly isPlayMode: boolean;
  readonly cols: number;
  readonly rows: number;
  readonly cellW: number;
  readonly cellH: number;
  readonly isLight: boolean;
  readonly numColors: number;
  readonly panelLeft: number;
  readonly panelWidth: number;
  readonly panelTop: number;
  vividColor(i: number): number[];
  linkColor(): number[];
  titleColor(): number[];
  sepColor(): number[];
  charFor(i: number): string;
  setCell(col: number, row: number, char: string, color: RGB | number[]): void;
  clearCell(col: number, row: number): void;
  isLocked(col: number, row: number): boolean;
  setPlayfieldBounds(b: PlayfieldBounds | null): void;
  on(evt: MatrixEvent, fn: () => void): void;
  flashBackground(durationMs: number): void;
}

declare global {
  interface Window {
    matrixGame?: MatrixGame;
    debug?: ((v?: boolean) => string) & {
      show(): void;
      hide(): void;
      toggle(): void;
    };
  }
}
