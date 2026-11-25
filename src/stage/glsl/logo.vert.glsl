// Shrinks the 2×2 plane to the logo's region (box plus the effect's bleed), so
// the logo effect only pays for the pixels it can actually affect.
uniform vec2 uResolution;
uniform vec4 uLogoQuad;  // x, y (bottom-left), w, h in drawing-buffer px

in vec3 position;

void main() {
  vec2 px = uLogoQuad.xy + (position.xy * 0.5 + 0.5) * uLogoQuad.zw;
  gl_Position = vec4(px / uResolution * 2.0 - 1.0, 0.0, 1.0);
}
