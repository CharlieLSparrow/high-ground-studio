function fract(n) {
    return n - Math.floor(n);
}
export function noise1d(x) {
    return fract(Math.sin(x * 127.1) * 43758.5453123);
}
export function noise2d(x, y) {
    const n = x * 127.1 + y * 311.7;
    return fract(Math.sin(n) * 43758.5453123);
}
