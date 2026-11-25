import { createStage } from './stage/stage';
import { THEMES, isKnownTheme } from './themes/registry';
import { SCHEDULE, pickThemeId } from './themes/schedule';

// Stage entry for every page on the shader site, loaded by the Site layout.
// A page opts into the logo slot by containing <Logo /> (svg[data-stage-logo]).
//
// Query parameters (for previews and deterministic screenshots):
//   ?theme=<id>   force a theme regardless of date
//   ?t=<seconds>  render a single frame at that time, no animation

const params = new URLSearchParams(location.search);
const override = params.get('theme');
if (override !== null && !isKnownTheme(override)) console.warn(`site: unknown theme '${override}'`);

const id = pickThemeId(new Date(), SCHEDULE, override, isKnownTheme);
const theme = await THEMES[id]!();
document.documentElement.dataset.theme = theme.id;

const t = params.get('t');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const frozenTime = t !== null && Number.isFinite(Number(t)) ? Number(t) : reducedMotion ? 0 : undefined;

const canvas = document.getElementById('stage');
const anchor = document.querySelector('svg[data-stage-logo]');
if (canvas instanceof HTMLCanvasElement) {
  createStage({
    canvas,
    background: theme.background,
    logo: anchor instanceof SVGSVGElement ? { effect: theme.logo, anchor } : undefined,
    frozenTime,
  });
}
