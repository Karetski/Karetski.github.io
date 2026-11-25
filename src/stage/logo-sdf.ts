import {
  Camera, GLSL3, LinearFilter, Mesh, PlaneGeometry, RawShaderMaterial, RedFormat, Scene,
  Vector4, WebGLRenderTarget, type Texture, type WebGLRenderer,
} from 'three';
import { svgOutline } from './svg-path';
import fullscreenVert from './glsl/fullscreen.vert.glsl?raw';
import bakeFrag from './glsl/bake-sdf.frag.glsl?raw';

const LONG_SIDE = 1024; // texels across the logo's longer viewBox side
const PAD = 64;         // texels of distance range around the outline (and padding)
const MAX_SEGMENTS = 128;

export interface LogoSdf {
  readonly texture: Texture;
  /** Texels covering the viewBox, excluding padding. */
  readonly innerWidth: number;
  readonly innerHeight: number;
  /** Texels of padding on every side; the encoded range spans ±pad texels. */
  readonly pad: number;
  dispose(): void;
}

/**
 * Bake the signed distance field of an inline <svg>'s polygonal paths into a
 * single-channel texture, on the GPU, once. Logo effects sample it instead of
 * re-deriving geometry every frame.
 */
export const bakeLogoSdf = (renderer: WebGLRenderer, svg: SVGSVGElement): LogoSdf => {
  const vb = svg.viewBox.baseVal;
  if (!vb || vb.width <= 0 || vb.height <= 0) throw new Error('stage logo: <svg> needs a viewBox');

  const segments = svgOutline(svg);
  if (segments.length === 0) throw new Error('stage logo: <svg> has no path outline');
  if (segments.length > MAX_SEGMENTS) {
    throw new Error(`stage logo: ${segments.length} edges exceeds MAX_SEGMENTS (${MAX_SEGMENTS})`);
  }

  const texelsPerUnit = LONG_SIDE / Math.max(vb.width, vb.height);
  const innerWidth = Math.round(vb.width * texelsPerUnit);
  const innerHeight = Math.round(vb.height * texelsPerUnit);

  const target = new WebGLRenderTarget(innerWidth + 2 * PAD, innerHeight + 2 * PAD, {
    format: RedFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
  });
  const material = new RawShaderMaterial({
    name: 'bake-logo-sdf',
    glslVersion: GLSL3,
    vertexShader: fullscreenVert,
    fragmentShader: bakeFrag,
    defines: { MAX_SEGMENTS },
    uniforms: {
      // three uploads uniform arrays at their declared GLSL length, so pad to it.
      uSegments: {
        value: Array.from({ length: MAX_SEGMENTS }, (_, i) => {
          const s = segments[i];
          return s ? new Vector4(s[0], s[1], s[2], s[3]) : new Vector4();
        }),
      },
      uSegmentCount: { value: segments.length },
      uViewBox: { value: new Vector4(vb.x, vb.y, vb.width, vb.height) },
      uTexelsPerUnit: { value: texelsPerUnit },
      uPad: { value: PAD },
    },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  const scene = new Scene().add(mesh);

  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(scene, new Camera());
  renderer.setRenderTarget(previous);
  material.dispose();
  mesh.geometry.dispose();

  return {
    texture: target.texture,
    innerWidth,
    innerHeight,
    pad: PAD,
    dispose: () => target.dispose(),
  };
};
