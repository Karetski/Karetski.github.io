export type RGB = readonly [number, number, number];

declare global {
  interface Window {
    debug?: ((v?: boolean) => string) & {
      show(): void;
      hide(): void;
      toggle(): void;
    };
  }
}
