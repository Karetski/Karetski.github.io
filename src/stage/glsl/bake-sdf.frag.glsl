// One-shot bake: exact signed distance from each texel to a polygon outline.
// MAX_SEGMENTS is injected as a define. Inside/outside uses the even-odd rule.
precision highp float;
precision highp int;

uniform vec4  uSegments[MAX_SEGMENTS]; // (ax, ay, bx, by) in SVG user units
uniform int   uSegmentCount;
uniform vec4  uViewBox;                // x, y, w, h in SVG user units (y down)
uniform float uTexelsPerUnit;
uniform float uPad;                    // texels of padding; also the encoded half-range

out vec4 fragColor;

void main() {
  vec2 t = gl_FragCoord.xy - uPad;
  vec2 p = vec2(uViewBox.x + t.x / uTexelsPerUnit,
                uViewBox.y + uViewBox.w - t.y / uTexelsPerUnit);

  float d2 = 1e20;
  bool inside = false;
  for (int i = 0; i < MAX_SEGMENTS; i++) {
    if (i >= uSegmentCount) break;
    vec2 a = uSegments[i].xy;
    vec2 b = uSegments[i].zw;
    vec2 pa = p - a;
    vec2 ba = b - a;
    vec2 q = pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    d2 = min(d2, dot(q, q));
    if ((a.y > p.y) != (b.y > p.y) && p.x < a.x + (p.y - a.y) * ba.x / ba.y) inside = !inside;
  }

  float d = sqrt(d2) * uTexelsPerUnit * (inside ? -1.0 : 1.0);
  fragColor = vec4(0.5 + d / (2.0 * uPad), 0.0, 0.0, 1.0);
}
