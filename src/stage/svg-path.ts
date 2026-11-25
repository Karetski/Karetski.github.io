/** A straight edge of an outline, in SVG user units: [ax, ay, bx, by]. */
export type Segment = readonly [number, number, number, number];

const TOKEN = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/**
 * Parse SVG path data made of straight lines (M L H V Z, absolute or relative)
 * into edge segments. Every subpath is closed, matching how SVG fills it.
 *
 * Curves are rejected rather than approximated: the logo bake measures exact
 * distances to these edges, so outlines must be authored (or flattened) as
 * polygons.
 */
export const parsePolygonPath = (d: string): Segment[] => {
  const tokens = d.match(TOKEN) ?? [];
  const segments: Segment[] = [];
  let i = 0;
  let cmd = '';
  let x = 0, y = 0;
  let startX = 0, startY = 0;

  const num = (): number => {
    const t = tokens[i++];
    const n = Number(t);
    if (t === undefined || Number.isNaN(n)) throw new Error(`svg path: expected number after '${cmd}'`);
    return n;
  };
  const lineTo = (nx: number, ny: number): void => {
    if (nx !== x || ny !== y) segments.push([x, y, nx, ny]);
    x = nx; y = ny;
  };
  const closeSubpath = (): void => lineTo(startX, startY);

  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/[a-zA-Z]/.test(t)) {
      if (!/[MLHVZ]/i.test(t)) throw new Error(`svg path: unsupported command '${t}' (only M L H V Z)`);
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') { closeSubpath(); continue; }
    } else if (cmd === '' || cmd === 'Z' || cmd === 'z') {
      throw new Error('svg path: number without a command');
    }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': {
        closeSubpath();
        const nx = num() + (rel ? x : 0);
        const ny = num() + (rel ? y : 0);
        x = startX = nx; y = startY = ny;
        // Extra coordinate pairs after a moveto are implicit linetos.
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': { const nx = num() + (rel ? x : 0); lineTo(nx, num() + (rel ? y : 0)); break; }
      case 'H': lineTo(num() + (rel ? x : 0), y); break;
      case 'V': lineTo(x, num() + (rel ? y : 0)); break;
    }
  }
  closeSubpath();
  return segments;
};

/**
 * The viewBox and path data of an SVG file's source, for build-time use where
 * there is no DOM. Expects a plain file: one <svg viewBox>, then <path d> elements.
 */
export const parseSvgSource = (source: string): {
  viewBox: string;
  box: { x: number; y: number; width: number; height: number };
  paths: string[];
} => {
  const viewBox = /<svg[^>]*\sviewBox="([^"]+)"/.exec(source)?.[1];
  const [x, y, width, height] = (viewBox ?? '').trim().split(/[\s,]+/).map(Number);
  if (viewBox === undefined || [x, y, width, height].some((n) => n === undefined || Number.isNaN(n))) {
    throw new Error('svg source: missing or malformed viewBox');
  }
  const paths = [...source.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]!);
  if (paths.length === 0) throw new Error('svg source: no <path d>');
  return { viewBox, box: { x: x!, y: y!, width: width!, height: height! }, paths };
};

/** Every edge of every <path> in an inline <svg>, in its viewBox units. */
export const svgOutline = (svg: SVGSVGElement): Segment[] =>
  [...svg.querySelectorAll('path')].flatMap((p) => parsePolygonPath(p.getAttribute('d') ?? ''));
