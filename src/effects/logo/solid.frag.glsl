// Flat logo fill with a 1-device-px anti-aliased edge and a soft halo.
uniform float uLevel;      // fill brightness
uniform float uHalo;       // halo strength at the outline
uniform float uHaloCssPx;  // halo falloff distance

void main() {
  float d = logoDistance(gl_FragCoord.xy);
  float fill = clamp(0.5 - d, 0.0, 1.0);
  float outside = max(d, 0.0);
  float halo = uHalo * exp(-outside / (uHaloCssPx * uPixelRatio))
             * (1.0 - smoothstep(0.5, 1.0, outside / logoReach()));
  float alpha = fill + halo * (1.0 - fill);
  fragColor = vec4(vec3(uLevel), alpha);
}
