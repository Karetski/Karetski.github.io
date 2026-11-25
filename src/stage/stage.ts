import {
  Camera, GLSL3, Mesh, PlaneGeometry, RawShaderMaterial, Scene, UniformsUtils,
  Vector2, Vector4, WebGLRenderer, type IUniform,
} from 'three';
import type { Effect } from './types';
import { bakeLogoSdf, type LogoSdf } from './logo-sdf';
import { createScaleController } from './resolution';
import prelude from './glsl/prelude.glsl?raw';
import logoPrelude from './glsl/logo.glsl?raw';
import fullscreenVert from './glsl/fullscreen.vert.glsl?raw';
import logoVert from './glsl/logo.vert.glsl?raw';

export interface StageOptions {
  /** Fixed, viewport-covering canvas. */
  readonly canvas: HTMLCanvasElement;
  readonly background: Effect;
  /** Logo slot: the effect is drawn over `anchor`, an inline <svg> whose paths define the outline. */
  readonly logo?: { readonly effect: Effect; readonly anchor: SVGSVGElement };
  /** Render at this time (seconds) and never animate: reduced motion, deterministic screenshots. */
  readonly frozenTime?: number;
}

const MAX_DEVICE_PIXEL_RATIO = 2;
const MIN_LOGO_MARGIN_CSS_PX = 2; // room for the outline's anti-aliasing ramp

/**
 * Mount the shader stage. Returns false when WebGL or a shader is unavailable;
 * the page must stay usable without it (the inline SVG logo remains visible
 * until `html.gl` is set).
 */
export const createStage = (opts: StageOptions): boolean => {
  const { canvas, frozenTime } = opts;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: false, antialias: false, depth: false, stencil: false });
  } catch (err) {
    console.warn('stage: WebGL unavailable, keeping the static page', err);
    return false;
  }
  renderer.autoClear = false; // the opaque background pass covers every pixel

  let shaderFailed = false;
  renderer.debug.onShaderError = (gl, _program, vertex, fragment) => {
    shaderFailed = true;
    console.error(`stage: shader compile failed\n${shaderLog(gl, vertex)}\n${shaderLog(gl, fragment)}`);
  };

  const shared = {
    uTime: { value: frozenTime ?? 0 },
    uResolution: { value: new Vector2() },
    uPointer: { value: new Vector2() },
    uPixelRatio: { value: 1 },
  };
  const scene = new Scene();
  const camera = new Camera();
  const plane = new PlaneGeometry(2, 2);

  const addLayer = (
    effect: Effect, vertexShader: string, fragmentPrelude: string,
    slotUniforms: Record<string, IUniform>, order: number,
  ): void => {
    const own = effect.uniforms ?? {};
    const clash = Object.keys(own).find((k) => k in shared || k in slotUniforms);
    if (clash) throw new Error(`stage: effect '${effect.id}' redeclares prelude uniform '${clash}'`);
    const material = new RawShaderMaterial({
      name: effect.id,
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: `${fragmentPrelude}\n${effect.fragment}`,
      uniforms: { ...UniformsUtils.clone(own), ...shared, ...slotUniforms },
      depthTest: false,
      depthWrite: false,
      transparent: order > 0,
    });
    const mesh = new Mesh(plane, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    scene.add(mesh);
  };

  addLayer(opts.background, fullscreenVert, prelude, {}, 0);

  const logoUniforms = {
    uLogoBox: { value: new Vector4() },
    uLogoSdf: { value: null as LogoSdf['texture'] | null },
    uLogoSdfRect: { value: new Vector4() },
    uLogoSdfRange: { value: 1 },
    uLogoQuad: { value: new Vector4() },
  };
  let sdf: LogoSdf | null = null;
  const bake = (): void => {
    if (!opts.logo) return;
    sdf?.dispose();
    sdf = bakeLogoSdf(renderer, opts.logo.anchor);
    logoUniforms.uLogoSdf.value = sdf.texture;
  };
  if (opts.logo) {
    bake();
    addLayer(opts.logo.effect, logoVert, `${prelude}\n${logoPrelude}`, logoUniforms, 1);
  }

  const scale = createScaleController();
  let cssWidth = 0;
  let cssHeight = 0;
  const pointerCss = { x: -1, y: -1 };

  const resize = (): void => {
    cssWidth = canvas.clientWidth;
    cssHeight = canvas.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO) * scale.scale;
    renderer.setPixelRatio(ratio);
    renderer.setSize(cssWidth, cssHeight, false);
    renderer.getDrawingBufferSize(shared.uResolution.value);
    shared.uPixelRatio.value = shared.uResolution.value.x / Math.max(cssWidth, 1);
    if (pointerCss.x < 0) { pointerCss.x = cssWidth / 2; pointerCss.y = cssHeight / 2; }
    document.documentElement.dataset.renderScale = String(scale.scale);
  };

  // Read every frame rather than observed: layout can move the anchor without
  // resizing it, and a clean-layout getBoundingClientRect is ~free.
  const syncLogo = (): void => {
    if (!opts.logo || !sdf) return;
    const r = opts.logo.anchor.getBoundingClientRect();
    const k = shared.uPixelRatio.value;
    const x = r.left * k;
    const y = (cssHeight - r.bottom) * k;
    const w = r.width * k;
    const h = r.height * k;
    logoUniforms.uLogoBox.value.set(x, y, w, h);
    const padX = sdf.pad * (w / sdf.innerWidth);
    const padY = sdf.pad * (h / sdf.innerHeight);
    logoUniforms.uLogoSdfRect.value.set(x - padX, y - padY, w + 2 * padX, h + 2 * padY);
    logoUniforms.uLogoSdfRange.value = 2 * padX;
    const m = Math.max(opts.logo.effect.bleed ?? 0, MIN_LOGO_MARGIN_CSS_PX) * k;
    logoUniforms.uLogoQuad.value.set(x - m, y - m, w + 2 * m, h + 2 * m);
  };

  let sizeDirty = true;
  const render = (): void => {
    if (sizeDirty) { resize(); sizeDirty = false; }
    const k = shared.uPixelRatio.value;
    shared.uPointer.value.set(pointerCss.x * k, (cssHeight - pointerCss.y) * k);
    syncLogo();
    renderer.render(scene, camera);
  };

  window.addEventListener('resize', () => {
    sizeDirty = true;
    if (frozenTime !== undefined) render();
  }, { passive: true });

  canvas.addEventListener('webglcontextrestored', () => {
    bake();
    if (frozenTime !== undefined) render();
  });

  render();
  if (shaderFailed) {
    renderer.dispose();
    canvas.remove();
    return false;
  }
  document.documentElement.classList.add('gl');

  if (frozenTime !== undefined) {
    // Layout may still settle (fonts, late styles); repaint once it has.
    void document.fonts?.ready.then(render);
    return true;
  }

  window.addEventListener('pointermove', (e) => {
    pointerCss.x = e.clientX;
    pointerCss.y = e.clientY;
  }, { passive: true });

  const start = performance.now();
  let last = 0;
  // rAF-driven, so hidden tabs stop rendering; the resume gap is ignored by the scale controller.
  renderer.setAnimationLoop((now) => {
    if (last !== 0 && scale.sample(now - last)) sizeDirty = true;
    last = now;
    shared.uTime.value = (now - start) / 1000;
    render();
  });
  return true;
};

/** Shader info log with each reported line's source appended, so errors point at real code. */
const shaderLog = (gl: WebGLRenderingContext, shader: WebGLShader): string => {
  const log = gl.getShaderInfoLog(shader) ?? '';
  if (!log.trim()) return '';
  const lines = (gl.getShaderSource(shader) ?? '').split('\n');
  return log.replace(/ERROR: \d+:(\d+):([^\n]*)/g, (_m, n: string, rest: string) =>
    `ERROR: line ${n}:${rest}\n    > ${lines[Number(n) - 1]?.trim() ?? ''}`);
};
