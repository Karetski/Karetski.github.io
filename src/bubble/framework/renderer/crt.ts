import type { MatrixConfig } from '../theme/types';
import { FS_SRC, VS_SRC } from './shaders';

export interface CRTPanelRect { x: number; y: number; z: number; w: number }

export interface CRTRenderParams {
  isLight: boolean;
  config: MatrixConfig;
  panelRect: CRTPanelRect;
  startTime: number;
}

export interface CRTPipeline {
  render(now: number, params: CRTRenderParams): void;
  resize(): void;
  readonly screenCanvas: HTMLCanvasElement;
}

interface Uniforms {
  tex: WebGLUniformLocation | null;
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  light: WebGLUniformLocation | null;
  ab: WebGLUniformLocation | null;
  sat: WebGLUniformLocation | null;
  scanMin: WebGLUniformLocation | null;
  scanMax: WebGLUniformLocation | null;
  maskAmount: WebGLUniformLocation | null;
  vig: WebGLUniformLocation | null;
  flicker: WebGLUniformLocation | null;
  bloom: WebGLUniformLocation | null;
  bloomRadius: WebGLUniformLocation | null;
  breathe: WebGLUniformLocation | null;
  panel: WebGLUniformLocation | null;
}

const compile = (gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null => {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
};

export const createCRT = (
  screenCanvas: HTMLCanvasElement,
  source: HTMLCanvasElement,
): CRTPipeline | null => {
  const gl = screenCanvas.getContext('webgl', {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!gl) {
    document.body.style.cssText = 'margin:0;background:#000;color:#ffd400;font:18px monospace;display:flex;align-items:center;justify-content:center;height:100vh';
    document.body.textContent = 'WebGL is required to view this page.';
    return null;
  }

  const program = gl.createProgram()!;
  const vs = compile(gl, gl.VERTEX_SHADER, VS_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FS_SRC);
  if (!vs || !fs) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1, -1,  1,
    -1,  1,  1, -1,  1,  1,
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u: Uniforms = {
    tex:         gl.getUniformLocation(program, 'uTex'),
    res:         gl.getUniformLocation(program, 'uRes'),
    time:        gl.getUniformLocation(program, 'uTime'),
    light:       gl.getUniformLocation(program, 'uLight'),
    ab:          gl.getUniformLocation(program, 'uAb'),
    sat:         gl.getUniformLocation(program, 'uSat'),
    scanMin:     gl.getUniformLocation(program, 'uScanMin'),
    scanMax:     gl.getUniformLocation(program, 'uScanMax'),
    maskAmount:  gl.getUniformLocation(program, 'uMaskAmount'),
    vig:         gl.getUniformLocation(program, 'uVig'),
    flicker:     gl.getUniformLocation(program, 'uFlicker'),
    bloom:       gl.getUniformLocation(program, 'uBloom'),
    bloomRadius: gl.getUniformLocation(program, 'uBloomRadius'),
    breathe:     gl.getUniformLocation(program, 'uBreathe'),
    panel:       gl.getUniformLocation(program, 'uPanel'),
  };

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(u.tex, 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  const render = (now: number, params: CRTRenderParams): void => {
    const { config, panelRect } = params;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    gl.viewport(0, 0, screenCanvas.width, screenCanvas.height);
    gl.uniform2f(u.res, screenCanvas.width, screenCanvas.height);
    gl.uniform1f(u.time, (now - params.startTime) / 1000);
    gl.uniform1f(u.light, params.isLight ? 1.0 : 0.0);
    gl.uniform1f(u.ab, config.chromaticAberration);
    gl.uniform1f(u.sat, config.saturation);
    gl.uniform1f(u.scanMin, config.scanlineMin);
    gl.uniform1f(u.scanMax, config.scanlineMax);
    gl.uniform1f(u.maskAmount, config.phosphorMaskAmount);
    gl.uniform1f(u.vig, config.vignette);
    gl.uniform1f(u.flicker, config.flicker);
    gl.uniform1f(u.bloom, config.bloom);
    gl.uniform1f(u.bloomRadius, config.bloomRadius);
    gl.uniform1f(u.breathe, config.breathe);
    gl.uniform4f(u.panel, panelRect.x, panelRect.y, panelRect.z, panelRect.w);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const resize = (): void => {
    gl.viewport(0, 0, screenCanvas.width, screenCanvas.height);
  };

  return { render, resize, screenCanvas };
};
