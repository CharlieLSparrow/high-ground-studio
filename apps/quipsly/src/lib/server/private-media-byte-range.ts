import "server-only";

export type PrivateMediaByteRange = { start: number; end: number };

/**
 * Parses the single byte range supported by HTML audio/video elements.
 * Multiple ranges are deliberately rejected so one authenticated request can
 * never fan out into an unbounded multipart response.
 */
export function privateMediaByteRange(
  header: string | null,
  size: number,
): PrivateMediaByteRange | "invalid" | null {
  if (!Number.isSafeInteger(size) || size <= 0) return "invalid";
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return "invalid";
  if (!match[1]) {
    const suffix = Number(match[2]);
    return Number.isSafeInteger(suffix) && suffix > 0
      ? { start: Math.max(0, size - suffix), end: size - 1 }
      : "invalid";
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    end >= start &&
    start < size
    ? { start, end: Math.min(end, size - 1) }
    : "invalid";
}
