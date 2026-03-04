export const skyVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
export const skyFragment = `
varying vec2 vUv;

uniform float uTime;
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec2 uSun;
uniform vec3 uSunColor;
uniform float uHaze;
uniform float uNoise;

// cheap hash noise
float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a, b, u.x) + (c - a)*u.y*(1.0-u.x) + (d - b)*u.x*u.y;
}

void main() {
  float y = clamp(vUv.y, 0.0, 1.0);
  vec3 col = mix(uBottom, uTop, smoothstep(0.0, 1.0, y));

  // sun glow (radial)
  float d = distance(vUv, uSun);
  float sunCore = exp(-d * 10.0);
  float sunGlow = exp(-d * 3.0);
  col += uSunColor * (sunCore * 0.35 + sunGlow * 0.18);

  // horizon haze band
  float hazeBand = exp(-pow((vUv.y - 0.32) / 0.12, 2.0)) * uHaze;
  col = mix(col, uSunColor, hazeBand * 0.35);

  // painterly noise (subtle)
  vec2 nUv = vUv * vec2(6.0, 3.0);
  nUv += vec2(uTime * 0.01, -uTime * 0.006);
  float n = noise(nUv) - 0.5;
  col += n * uNoise;

  gl_FragColor = vec4(col, 1.0);
}
`;
