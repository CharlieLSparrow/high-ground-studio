import { AbsoluteFill, Audio, Sequence, Video } from "remotion";
import { TimelineState, isAudioTrackId, isVideoTrackId } from "./useTimelineState";
import { Video360Player } from "./Video360Player";
import type { TimelineClip } from "./useTimelineState";

const FPS = 30;

function normalizeClipAsset(assetId: unknown) {
  return typeof assetId === "string" ? assetId.trim() : "";
}

function looksLikeAssetUrl(assetId: string) {
  return !!assetId && (assetId.startsWith("http://") || assetId.startsWith("https://") || assetId.startsWith("/api/ingest/media/"));
}

function hasVideoExtension(assetId: string) {
  return /\.(mp4|webm|mov|m4v|m3u8|mpd|insv)(\?|$)/i.test(assetId);
}

function is360Asset(assetId: string) {
  return /\.(insv)(\?|$)/i.test(assetId);
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

function sortComposureClips(clips: any[]) {
  return [...clips].sort((a, b) => {
    if (a.renderStartIn !== b.renderStartIn) {
      return a.renderStartIn - b.renderStartIn;
    }
    const aIsAudio = isAudioTrackId(a.trackId) ? 1 : 0;
    const bIsAudio = isAudioTrackId(b.trackId) ? 1 : 0;
    if (aIsAudio !== bIsAudio) return aIsAudio - bIsAudio;
    return String(a.trackId).localeCompare(String(b.trackId));
  });
}

function computeRenderSegments(timeline: TimelineState) {
  if (timeline.editorMode === "play-all" || !timeline.editorMode) {
    return timeline.clips.map(clip => ({
      ...clip,
      renderStartIn: clip.startIn,
      renderDuration: clip.duration,
      renderSourceStart: clip.sourceStart,
      renderSourceEnd: clip.sourceEnd ?? (clip.sourceStart + clip.duration)
    }));
  }

  const deactivatedBlocks = timeline.transcript.filter(b => b.deactivated || b.deleted);

  function getRippledTime(t: number) {
    let shift = 0;
    for (const b of deactivatedBlocks) {
      if (t >= b.time + b.duration) {
         shift += b.duration;
      } else if (t > b.time) {
         shift += (t - b.time);
      }
    }
    return t - shift;
  }

  let renderSegments = [];

  for (const clip of timeline.clips) {
     let segments = [{
       startIn: clip.startIn,
       sourceStart: clip.sourceStart,
       duration: clip.duration
     }];

     for (const block of deactivatedBlocks) {
        const blockStart = block.time;
        const blockEnd = blockStart + block.duration;
        const newSegments = [];
        for (const seg of segments) {
           const segEnd = seg.startIn + seg.duration;
           if (segEnd <= blockStart || seg.startIn >= blockEnd) {
             newSegments.push(seg);
             continue;
           }
           if (seg.startIn < blockStart) {
             newSegments.push({
               startIn: seg.startIn,
               sourceStart: seg.sourceStart,
               duration: blockStart - seg.startIn
             });
           }
           if (segEnd > blockEnd) {
             newSegments.push({
               startIn: blockEnd,
               sourceStart: seg.sourceStart + (blockEnd - seg.startIn),
               duration: segEnd - blockEnd
             });
           }
        }
        segments = newSegments;
     }

     for (const s of segments) {
       if (s.duration < 0.05) continue;
       renderSegments.push({
         ...clip,
         // We generate a unique ID for React keys since one clip can become multiple segments
         id: `${clip.id}-seg-${Math.round(s.startIn * 1000)}`,
         renderStartIn: getRippledTime(s.startIn),
         renderDuration: s.duration,
         renderSourceStart: s.sourceStart,
         renderSourceEnd: s.sourceStart + s.duration
       });
     }
  }

  return renderSegments;
}

export const RemotionComposition = ({ timeline }: RemotionCompositionProps) => {
  const segments = computeRenderSegments(timeline);
  const orderedSegments = sortComposureClips(segments);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {orderedSegments.map((clip) => {
        const startFrame = secondsToFrame(clip.renderStartIn);
        const normalizedTrackId = String(clip.trackId ?? "").trim().toUpperCase();
        const sourceId = normalizeMediaSource(normalizeClipAsset(clip.assetId)) ?? "";
        const hasVideoSource = isVideoLikeAsset(sourceId);
        const hasAudioSource = isAudioLikeAsset(sourceId);
        const hasSource = Boolean(sourceId);
        const resolvedKind = resolveClipKind(clip, normalizedTrackId, hasVideoSource, hasAudioSource);
        const fallbackColor = clip.color || "#1b1b1b";
        const missingSource = !hasSource;
        const sourceStart = clip.renderSourceStart;
        const sourceEnd = clip.renderSourceEnd;
        const isYoutube = sourceId ? isYouTubeSource(sourceId) : false;
        const safeDuration = Math.max(secondsToFrame(clip.renderDuration), 1);
        const mediaSource = sourceId ?? "";
        const sourceStartFrame = secondsToFrame(sourceStart);
        const sourceEndFrame = Math.max(sourceStartFrame + 1, secondsToFrame(sourceEnd));

        if (resolvedKind === "video") {
          const is360 = is360Asset(mediaSource);
          return (
            <Sequence
              key={clip.id}
              from={startFrame}
              durationInFrames={safeDuration}
              name={`${clip.trackId}: ${clip.name}`}
            >
              {hasVideoSource && hasSource && !isYoutube ? (
                is360 ? (
                  <Video360Player
                    src={mediaSource}
                    startFrom={sourceStartFrame}
                    endAt={sourceEndFrame}
                    volume={clip.volume ?? 1}
                    transforms={clip.transforms}
                  />  ) : (
                  <Video src={mediaSource} startFrom={sourceStartFrame} endAt={sourceEndFrame} volume={clip.volume ?? 1} />
                )
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
            return null;
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
                  <Audio src={mediaSource} startFrom={safeSourceStart} endAt={safeSourceEnd} volume={clip.volume ?? 1} />
                </Sequence>
              );
        }

        return null;
      })}
    </AbsoluteFill>
  );
};
