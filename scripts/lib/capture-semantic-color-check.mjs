/** A source-level hint, not a Swift type checker. Recognize explicit Color
 * references and implicit members, without confusing RGB fields such as
 * pixel.green or $0.green with SwiftUI's system palette. */
export function rawCaptureSemanticColor(source) {
  return source.match(/\b(?:SwiftUI\.)?Color\s*\.\s*(?:green|orange)\b|(?<![\w$.])\.(?:green|orange)\b/)?.[0] ?? null;
}
