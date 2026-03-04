export function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}
export function lerp(a, b, t) {
    return a + (b - a) * t;
}
export function easeInOutSine(t) {
    const n = clamp01(t);
    return -(Math.cos(Math.PI * n) - 1) / 2;
}
