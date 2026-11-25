// Cheap, texture-free noise helpers. Prepend to an effect's source in TS:
//   fragment: `${noise}\n${source}`
// Costs (ALU, per call): hash12 ~6, valueNoise ~4 hashes, fbm = OCTAVES × valueNoise.

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Fixed 4 octaves; returns roughly 0..1.
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * valueNoise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    amp *= 0.5;
  }
  return sum / 0.9375;
}

// ±0.5/255 triangular-ish dither: hides 8-bit banding in smooth gradients.
float dither(vec2 fragPx) {
  return (hash12(fragPx) + hash12(fragPx + 71.3) - 1.0) / 255.0;
}
