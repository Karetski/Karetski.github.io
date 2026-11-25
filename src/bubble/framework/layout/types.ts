export interface Region {
  col: number;
  row: number;
  width: number;
  height: number;
}

export interface Layout {
  readonly viewportW: number;
  readonly viewportH: number;
  readonly cols: number;
  readonly rows: number;
  readonly cellW: number;
  readonly cellH: number;
  readonly naturalCellW: number;
  readonly dpr: number;
  readonly regions: ReadonlyMap<string, Region>;
}

export const sameLayout = (a: Layout | null, b: Layout | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.cols === b.cols && a.rows === b.rows
      && a.cellW === b.cellW && a.cellH === b.cellH
      && a.viewportW === b.viewportW && a.viewportH === b.viewportH;
};

export const regionContains = (region: Region | undefined, col: number, row: number): boolean => {
  if (!region) return false;
  return col >= region.col && col < region.col + region.width
      && row >= region.row && row < region.row + region.height;
};
