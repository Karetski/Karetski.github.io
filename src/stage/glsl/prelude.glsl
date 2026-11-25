// Stage prelude: prepended to every effect's fragment source. Effects must not
// redeclare these. `#version 300 es` is added by three.js above this line.
precision highp float;
precision highp int;

uniform float uTime;        // seconds since the stage started; constant when motion is off
uniform vec2  uResolution;  // drawing-buffer size, device px
uniform vec2  uPointer;     // last pointer position, drawing-buffer px, origin bottom-left
uniform float uPixelRatio;  // drawing-buffer px per CSS px (already includes adaptive scale)

out vec4 fragColor;         // background: opaque; logo: straight (non-premultiplied) alpha
