// Logo-slot prelude: prepended after the stage prelude for logo effects only.
uniform vec4      uLogoBox;      // the logo's SVG viewBox on screen: x, y (bottom-left), w, h in drawing-buffer px
uniform sampler2D uLogoSdf;      // baked signed distance; 0.5 = outline, < 0.5 inside
uniform vec4      uLogoSdfRect;  // screen rect covered by uLogoSdf (uLogoBox plus padding)
uniform float     uLogoSdfRange; // drawing-buffer px spanned by the encoded 0..1 range

// Position within the logo's box: (0,0) bottom-left, (1,1) top-right.
vec2 logoUv(vec2 px) {
  return (px - uLogoBox.xy) / uLogoBox.zw;
}

// Signed distance from `px` to the logo outline in drawing-buffer px, negative
// inside. Valid only up to logoReach() from the outline, after which it stays
// flat.
float logoDistance(vec2 px) {
  vec2 uv = (px - uLogoSdfRect.xy) / uLogoSdfRect.zw;
  return (texture(uLogoSdf, uv).r - 0.5) * uLogoSdfRange;
}

// How far logoDistance() is meaningful, in drawing-buffer px. It scales with
// the logo's on-screen size (about 6% of the box's long side), so a 40 px logo has
// only a few px of reach. Anything driven by outside distance (glows, rims)
// must reach zero by then, or the plateau shows as a box around the logo.
float logoReach() {
  return 0.5 * uLogoSdfRange;
}
