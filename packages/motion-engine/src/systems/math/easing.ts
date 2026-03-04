export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeInOutSine(t: number): number {
  const n = clamp01(t);
  return -(Math.cos(Math.PI * n) - 1) / 2;
}
