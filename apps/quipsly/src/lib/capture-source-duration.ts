/** Wall-clock start/stop includes pauses and may have second-only precision.
 * Use decoded audio frame counts for the media timeline when Capture provides
 * them. This is reported evidence until the server decodes the retained bytes.
 */
export function captureAudioFrameDuration(profile: unknown): number | null {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  const signal = (profile as Record<string, unknown>).audioSignal;
  if (!signal || typeof signal !== "object" || Array.isArray(signal)) return null;
  const value = signal as Record<string, unknown>;
  const frames = value.analyzedFrameCount;
  const rate = value.sampleRate;
  if (value.schemaVersion !== 1 || value.algorithm !== "quipsly-audio-signal-window-v1"
    || typeof frames !== "number" || !Number.isSafeInteger(frames) || frames <= 0
    || typeof rate !== "number" || !Number.isFinite(rate) || rate < 8000 || rate > 384000) return null;
  const duration = frames / rate;
  return duration <= 86400 ? duration : null;
}
