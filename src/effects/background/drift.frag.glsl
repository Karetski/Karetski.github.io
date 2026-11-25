// Slow light-gray smoke: a pale field with domain-warped fbm darkening it,
// slightly deeper toward the edges, brightened faintly near the pointer.
// Requires effects/glsl/noise.glsl.
uniform float uSpeed;
uniform float uBase;    // brightness of the clear field
uniform float uSmoke;   // how much the smoke darkens it
uniform float uEdge;    // extra darkening toward the corners

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uResolution) / uResolution.y;
  float t = uTime * uSpeed;

  vec2 warp = vec2(fbm(uv * 1.5 + vec2(t, 0.0)), fbm(uv * 1.5 + vec2(5.2, -t)));
  float n = fbm(uv * 2.0 + warp * 1.6 + vec2(0.0, t));

  vec2 pointer = (uPointer - 0.5 * uResolution) / uResolution.y;
  float glow = 0.03 * exp(-5.0 * length(uv - pointer));
  float edge = 1.0 - smoothstep(1.3, 0.15, length(uv));

  float v = uBase - uSmoke * n * n - uEdge * edge + glow;
  fragColor = vec4(vec3(v + dither(frag)), 1.0);
}
