export type EdlClip = {
  id: string;
  type: "video" | "audio" | "graphic";
  src: string;
  startIn: number;
  duration: number;
  track: string;
  label?: string;
  color?: string;
};

export type VisualTimelineProps = {
  clips: EdlClip[];
  currentTime: number;
  selectedClipId?: string | null;
  onTimeScrub?: (time: number) => void;
  onClipSelect?: (clipId: string) => void;
};

const PIXELS_PER_SECOND = 10;
const TRACK_HEIGHT = 48;
const MIN_CLIP_SECONDS = 0.05;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asSafeTrackId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "track";
}

function detectVisualMode(trackId: string, clipType?: string) {
  const normalizedTrackId = trackId.toUpperCase();
  const normalizedType = typeof clipType === "string" ? clipType.toLowerCase() : "";

  const isAudioTrack = normalizedTrackId.startsWith("A") || normalizedType === "audio";
  return {
    isAudio: isAudioTrack,
  };
}

export function VisualTimeline({ clips, currentTime, selectedClipId, onTimeScrub, onClipSelect }: VisualTimelineProps) {
  const safeCurrentTime = Math.max(0, toNumber(currentTime, 0));
  const tracks: Record<string, EdlClip[]> = {};
  let maxTime = 60;

  clips.forEach((clip) => {
    const trackId = asSafeTrackId(clip.track);
    const start = Math.max(0, toNumber(clip.startIn, 0));
    const duration = Math.max(MIN_CLIP_SECONDS, toNumber(clip.duration, MIN_CLIP_SECONDS));
    const end = start + duration;

    const normalizedClip: EdlClip = {
      ...clip,
      track: trackId,
      startIn: start,
      duration,
    };

    (tracks[trackId] ||= []).push(normalizedClip);
    if (end > maxTime) maxTime = end;
  });

  const sortedClips = Object.entries(tracks).reduce<Record<string, EdlClip[]>>((memo, [trackId, entries]) => {
    memo[trackId] = [...entries].sort((a, b) => a.startIn - b.startIn);
    return memo;
  }, {});

  const trackIds = Object.keys(sortedClips).sort((a, b) => {
    const aIsVideo = a.toUpperCase().startsWith("V");
    const bIsVideo = b.toUpperCase().startsWith("V");
    if (aIsVideo !== bIsVideo) return aIsVideo ? -1 : 1;
    const aIndex = Number.parseInt(a.replace(/^[A-Za-z]+/, ""), 10) || 0;
    const bIndex = Number.parseInt(b.replace(/^[A-Za-z]+/, ""), 10) || 0;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.localeCompare(b);
  });

  return (
    <div className="w-full h-full bg-zinc-950 flex flex-col select-none relative overflow-x-auto overflow-y-hidden border-t border-zinc-800">
      <div
        className="h-8 bg-zinc-900 border-b border-zinc-800 sticky top-0 z-20 flex"
        style={{ width: `${maxTime * PIXELS_PER_SECOND}px` }}
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const scrubTime = Math.max(0, Math.min(maxTime, x / PIXELS_PER_SECOND));
          onTimeScrub?.(scrubTime);
        }}
      >
        {Array.from({ length: Math.ceil(maxTime / 10) }).map((_, i) => (
          <div key={i} className="flex-none h-full border-l border-zinc-700 text-[10px] text-zinc-500 pl-1" style={{ width: `${10 * PIXELS_PER_SECOND}px` }}>
            {i * 10}s
          </div>
        ))}
      </div>

      <div className="flex-1 relative" style={{ width: `${maxTime * PIXELS_PER_SECOND}px` }}>
        <div className="absolute top-0 bottom-0 w-[1px] bg-red-500 z-30 pointer-events-none" style={{ left: `${safeCurrentTime * PIXELS_PER_SECOND}px` }}>
          <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500 -ml-[5px] -mt-[8px]" />
        </div>

        {trackIds.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-sm italic font-mono">
            Timeline is empty. Drop clips here.
          </div>
        ) : null}

        {trackIds.map((trackId) => (
          <div key={trackId} className="flex relative border-b border-zinc-900 bg-zinc-900/20" style={{ height: `${TRACK_HEIGHT}px` }}>
            <div className="w-16 h-full bg-zinc-900 border-r border-zinc-800 sticky left-0 z-10 flex items-center justify-center font-bold text-xs text-zinc-500 shrink-0">
              {trackId}
            </div>

            <div className="flex-1 relative">
              {sortedClips[trackId].map((clip) => {
                const { isAudio } = detectVisualMode(clip.track, clip.type);
                const hasSrc = !!clip.src?.trim();
                return (
                  <div
                    key={clip.id}
                    onClick={() => onClipSelect?.(clip.id)}
                    className={`absolute top-1 bottom-1 rounded-sm border shadow-sm flex items-center px-2 overflow-hidden text-[10px] font-bold text-white/90 truncate cursor-pointer hover:brightness-110 transition-all ${selectedClipId === clip.id ? "border-white ring-2 ring-amber-300" : "border-black/50"} ${clip.color ? "" : ""}`}
                    style={{
                      left: `${clip.startIn * PIXELS_PER_SECOND}px`,
                      width: `${clip.duration * PIXELS_PER_SECOND}px`,
                      backgroundColor: clip.color || (isAudio ? "#047857" : "#2563eb"),
                      opacity: hasSrc ? 1 : 0.6,
                    }}
                  >
                    <span className="mr-1 opacity-80">{isAudio ? "🔉" : "🎬"}</span>
                    {clip.label || clip.id}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {Array.from({ length: Math.max(0, 4 - trackIds.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="flex relative border-b border-zinc-900 bg-zinc-950" style={{ height: `${TRACK_HEIGHT}px` }}>
            <div className="w-16 h-full bg-zinc-900 border-r border-zinc-800 sticky left-0 z-10 flex items-center justify-center font-bold text-xs text-zinc-700 shrink-0">
              -
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
