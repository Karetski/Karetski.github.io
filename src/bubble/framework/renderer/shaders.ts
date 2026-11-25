export const VS_SRC = `
  attribute vec2 aPos;
  varying vec2 vUv;
  void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`;

export const FS_SRC = `
  precision highp float;
  uniform sampler2D uTex;
  uniform vec2  uRes;
  uniform float uTime;
  uniform float uLight;
  uniform float uAb;
  uniform float uSat;
  uniform float uScanMin;
  uniform float uScanMax;
  uniform float uMaskAmount;
  uniform float uVig;
  uniform float uFlicker;
  uniform float uBloom;
  uniform float uBloomRadius;
  uniform float uBreathe;
  uniform vec4  uPanel; // (left, bottom, right, top) in vUv space
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;

    // Chromatic aberration — radial RGB separation
    vec2 dir = uv - 0.5;
    vec3 col;
    col.r = texture2D(uTex, uv + dir * uAb        ).r;
    col.g = texture2D(uTex, uv + dir * uAb * 0.30 ).g;
    col.b = texture2D(uTex, uv - dir * uAb        ).b;

    // Bloom — masked away from the centre panel area so panel text stays crisp
    if (uBloom > 0.001) {
      bool insidePanel =
        uv.x > uPanel.x && uv.x < uPanel.z &&
        uv.y > uPanel.y && uv.y < uPanel.w;
      if (!insidePanel) {
        vec2 texel = 1.0 / uRes;
        vec3 bloom = vec3(0.0);
        float bloomW = 0.0;
        for (int i = -2; i <= 2; i++) {
          for (int j = -2; j <= 2; j++) {
            vec2 off = vec2(float(i), float(j)) * texel * uBloomRadius;
            vec3 s = texture2D(uTex, uv + off).rgb;
            float b = max(s.r, max(s.g, s.b));
            float w = smoothstep(0.35, 0.85, b);
            bloom += s * w;
            bloomW += w;
          }
        }
        if (bloomW > 0.0) bloom /= bloomW;
        col += bloom * uBloom;
      }
    }

    // Saturation
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, uSat);

    // Scanlines
    float scan = sin(uv.y * uRes.y * 1.75) * 0.5 + 0.5;
    col *= mix(uScanMin, uScanMax, scan);

    // Phosphor mask — RGB triad per device pixel (dark) or constant blue tint (light)
    float px = mod(gl_FragCoord.x, 3.0);
    vec3 mask;
    if (uLight > 0.5) {
      mask = vec3(1.0 - uMaskAmount * 0.25, 1.0 - uMaskAmount * 0.125, 1.0 + uMaskAmount * 0.25);
    } else {
      if      (px < 1.0) mask = vec3(1.0 + uMaskAmount, 1.0 - uMaskAmount, 1.0 - uMaskAmount);
      else if (px < 2.0) mask = vec3(1.0 - uMaskAmount, 1.0 + uMaskAmount, 1.0 - uMaskAmount);
      else               mask = vec3(1.0 - uMaskAmount, 1.0 - uMaskAmount, 1.0 + uMaskAmount);
    }
    col *= mask;

    // Vignette
    float vd  = length(vUv - 0.5);
    float vig = smoothstep(1.0, 0.42, vd);
    col *= mix(1.0, vig, uVig * (1.0 - uLight * 0.5));

    // Flicker
    float n = hash(floor(gl_FragCoord.xy) + floor(uTime * 60.0));
    col += (n - 0.5) * uFlicker;

    // Breathing wave
    if (uBreathe > 0.0001) {
      float w = sin(uTime * 0.7 + vUv.x * 5.0 + vUv.y * 3.0);
      col *= 1.0 + w * uBreathe;
    }

    col = pow(max(col, 0.0), vec3(uLight > 0.5 ? 1.05 : 0.95));

    gl_FragColor = vec4(col, 1.0);
  }
`;
