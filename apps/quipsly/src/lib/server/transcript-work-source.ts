/** A source pointer is durable; the ability to play it is a separate capability. */
export function transcriptWorkSource(desk: {
  gate: { allowed: boolean };
  recording?: { id: string } | null;
  playback?: { recordingAssetId: string; sourceId: string } | null;
}) {
  if (!desk.gate.allowed) return null;
  const recordingAssetId = desk.recording?.id ?? desk.playback?.recordingAssetId;
  if (!recordingAssetId || (desk.playback && desk.playback.recordingAssetId !== recordingAssetId)) return null;
  return { recordingAssetId, playbackSourceId: desk.playback?.sourceId ?? null };
}
