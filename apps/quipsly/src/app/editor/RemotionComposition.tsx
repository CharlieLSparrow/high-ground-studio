import { AbsoluteFill, Audio, Sequence, Video } from "remotion";
import { TimelineState, isAudioTrackId, isVideoTrackId } from "./useTimelineState";
import type { TimelineClip } from "./useTimelineState";

const FPS = 30;

function normalizeClipAsset(assetId: unknown) {
  return typeof assetId === "string" ? assetId.trim() : "";
}

function looksLikeAssetUrl(assetId: string) {
  return !!assetId && (assetId.startsWith("http://") || assetId.startsWith("https://") || assetId.startsWith("/api/ingest/media/"));
}

function hasVideoExtension(assetId: string) {
  return /\.(mp4|webm|mov|m4v|m3u8|mpd)(\?|$)/i.test(assetId);
}

function hasAudioExtension(assetId: string) {
  return /\.(mp3|wav|m4a|aac|ogg|flac|webm)(\?|$)/i.test(assetId);
}

function parseSourceNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function resolveClipSourceEnd(clip: TimelineClip) {
  const start = parseSourceNumber(clip.sourceStart);
  const explicitEnd = parseSourceNumber(clip.sourceEnd, start + clip.duration);
  return explicitEnd > start ? explicitEnd : start + clip.duration;
}

function secondsToFrame(seconds: number) {
  return Math.max(0, Math.round(seconds * FPS));
}

function isVideoLikeAsset(assetId: string) {
  if (!assetId || !assetId.trim()) return false;
  if (!looksLikeAssetUrl(assetId) && !/^[a-zA-Z0-9._-]+$/.test(assetId)) return false;
  return hasVideoExtension(assetId) || /^(https?:\/\/|\/api\/ingest\/media\/)/.test(assetId) || /^V\d+/.test(assetId);
}

function isAudioLikeAsset(assetId: string) {
  if (!assetId || !assetId.trim()) return false;
  return hasAudioExtension(assetId) || /^(https?:\/\/|\/api\/ingest\/media\/)/.test(assetId) || /^A\d+/.test(assetId);
}

function isYouTubeSource(assetId: string) {
  return /youtube\.com|youtu\.be/i.test(assetId);
}

function normalizeMediaSource(assetId: string) {
  const sourceId = assetId.trim();
  return sourceId || undefined;
}

function resolveClipKind(clip: TimelineClip, trackId: string, hasVideoSource: boolean, hasAudioSource: boolean) {
  if (clip.kind === "video" || clip.kind === "audio") return clip.kind;
  if (isVideoTrackId(trackId)) return "video";
  if (isAudioTrackId(trackId)) return "audio";
  if (hasVideoSource) return "video";
  if (hasAudioSource) return "audio";
  return "video";
}

type RemotionCompositionProps = {
  timeline: TimelineState;
};

function sortComposureClips(clips: TimelineClip[]) {
  return [...clips].sort((a, b) => {
    if (a.startIn !== b.startIn) {
      return a.startIn - b.startIn;
    }
    const aIsAudio = isAudioTrackId(a.trackId) ? 1 : 0;
    const bIsAudio = isAudioTrackId(b.trackId) ? 1 : 0;
    if (aIsAudio !== bIsAudio) return aIsAudio - bIsAudio;
    return String(a.trackId).localeCompare(String(b.trackId));
  });
}

export const RemotionComposition = ({ timeline }: RemotionCompositionProps): JSX.Element => {
  const orderedClips = sortComposureClips(timeline.clips);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {orderedClips.map((clip) => {
        const startFrame = secondsToFrame(clip.startIn);
        const normalizedTrackId = String(clip.trackId ?? "").trim().toUpperCase();
        const sourceId = normalizeMediaSource(normalizeClipAsset(clip.assetId)) ?? "";
        const hasVideoSource = isVideoLikeAsset(sourceId);
        const hasAudioSource = isAudioLikeAsset(sourceId);
        const hasSource = Boolean(sourceId);
        const resolvedKind = resolveClipKind(clip, normalizedTrackId, hasVideoSource, hasAudioSource);
        const fallbackColor = clip.color || "#1b1b1b";
        const missingSource = !hasSource;
        const sourceStart = parseSourceNumber(clip.sourceStart);
        const sourceEnd = resolveClipSourceEnd(clip);
        const isYoutube = sourceId ? isYouTubeSource(sourceId) : false;
        const safeDuration = Math.max(secondsToFrame(clip.duration), 1);
        const mediaSource = sourceId ?? "";
        const sourceStartFrame = secondsToFrame(sourceStart);
        const sourceEndFrame = Math.max(sourceStartFrame + 1, secondsToFrame(sourceEnd));

        if (resolvedKind === "video") {
          return (
            <Sequence
              key={clip.id}
              from={startFrame}
              durationInFrames={safeDuration}
              name={`${clip.trackId}: ${clip.name}`}
            >
              {hasVideoSource && hasSource && !isYoutube ? (
                <Video src={mediaSource} startFrom={sourceStartFrame} endAt={sourceEndFrame} />
              ) : hasVideoSource && isYoutube ? (
                <AbsoluteFill
                  style={{
                    backgroundColor: "#0f172a",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 16,
                    textAlign: "center",
                  }}
                >
                  <span
                    style={{
                      color: "white",
                      fontSize: 20,
                      fontFamily: "sans-serif",
                      fontWeight: "bold",
                      maxWidth: "80%",
                    }}
                  >
                    YouTube cannot be rendered directly in Remotion; export with source file URLs for playback.
                  </span>
                </AbsoluteFill>
              ) : (
                <AbsoluteFill
                  style={{
                    backgroundColor: fallbackColor,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      color: "white",
                      fontSize: 40,
                      fontFamily: "sans-serif",
                      fontWeight: "bold",
                      textAlign: "center",
                      padding: 16,
                      maxWidth: "80%",
                    }}
                  >
                    {missingSource ? "No video source yet" : clip.name}
                </span>
                </AbsoluteFill>
              )}
            </Sequence>
          );
        }

        if (resolvedKind === "audio") {
          if (!hasAudioSource || !hasSource) {
            return (
              <Sequence
                key={clip.id}
                from={startFrame}
                durationInFrames={safeDuration}
                name={`${clip.trackId}: ${clip.name} (no source)`}
              >
                <AbsoluteFill
                  style={{
                    backgroundColor: "#0f172a",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      color: "white",
                      fontSize: 16,
                      fontFamily: "sans-serif",
                      fontWeight: "bold",
                      textAlign: "center",
                      padding: 16,
                      maxWidth: "80%",
                      opacity: 0.75,
                    }}
                  >
                    {missingSource ? "No audio source yet" : clip.name}
                  </span>
                </AbsoluteFill>
              </Sequence>
            );
          }

          const safeSourceStart = secondsToFrame(parseSourceNumber(sourceStart, 0));
          const safeSourceEnd = Math.max(
            safeSourceStart + 1,
            secondsToFrame(parseSourceNumber(sourceEnd, sourceStart + Math.max(clip.duration, 0.05))),
          );
          return (
                <Sequence
                  key={clip.id}
                  from={startFrame}
                  durationInFrames={safeDuration}
                  name={`${clip.trackId}: ${clip.name}`}
                >
                  <Audio src={mediaSource} startFrom={safeSourceStart} endAt={safeSourceEnd} />
                </Sequence>
              );
        }

        return null;
      })}
    </AbsoluteFill>
  );
};
