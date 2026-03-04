function fract(n: number): number {
  return n - Math.floor(n);
}

export function noise1d(x: number): number {
  return fract(Math.sin(x * 127.1) * 43758.5453123);
}

export function noise2d(x: number, y: number): number {
  const n = x * 127.1 + y * 311.7;
  return fract(Math.sin(n) * 43758.5453123);
}
