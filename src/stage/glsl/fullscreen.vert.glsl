// Covers the whole drawing buffer with the 2×2 plane.
in vec3 position;

void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
