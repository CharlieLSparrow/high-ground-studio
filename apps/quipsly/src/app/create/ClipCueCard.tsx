"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ClipSegment = {
  start: string;
  end: string;
};

type ClipCue = {
  url: string;
  videoId: string | null;
  segments: ClipSegment[];
  note: string;
};

type PlaybackItem = {
  cueIndex: number;
  segmentIndex: number;
  cue: ClipCue;
  segment: ClipSegment;
};

const YOUTUBE_URL_RE =
  /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?[^ \n]*v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)[^\s)]+)/i;

const CUE_FIELD_RE = /^\s*(clip|youtube|segment|start|end|note)\s*:/i;

export function hasYouTubeClipCue(text: string) {
  return YOUTUBE_URL_RE.test(text) || text.split(/\n/).some((line) => CUE_FIELD_RE.test(line));
}

function parseVideoId(url: string) {
  if (!url.trim()) return null;

  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    if (parsed.pathname.startsWith("/embed/") || parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.split("/").filter(Boolean)[1] ?? null;
    }
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

function fieldName(line: string) {
  const match = line.match(/^\s*([^:]+)\s*:/);
  return match?.[1]?.trim().toLowerCase() ?? "";
}

function fieldValue(line: string) {
  const index = line.indexOf(":");
  return index >= 0 ? line.slice(index + 1).trim() : "";
}

function createCue(url = ""): ClipCue {
  return {
    url,
    videoId: parseVideoId(url),
    segments: [{ start: "", end: "" }],
    note: "",
  };
}

function parseSegmentValue(value: string): ClipSegment {
  const [start = "", end = ""] = value.split(/\s*-\s*/);
  return { start: start.trim(), end: end.trim() };
}

function normalizeCue(cue: ClipCue): ClipCue {
  const segments = cue.segments.length > 0 ? cue.segments : [{ start: "", end: "" }];
  return {
    ...cue,
    videoId: parseVideoId(cue.url),
    segments,
  };
}

function parseCues(text: string): ClipCue[] {
  const cues: ClipCue[] = [];
  let current: ClipCue | null = null;
  let legacyStart = "";
  let legacyEnd = "";

  const ensureCurrent = () => {
    if (!current) {
      current = createCue();
      cues.push(current);
    }
    return current;
  };

  const finishLegacyRange = () => {
    if (!current) return;
    if (!legacyStart && !legacyEnd) return;
    const hasRealSegment = current.segments.some((segment) => segment.start || segment.end);
    if (!hasRealSegment) current.segments = [{ start: legacyStart, end: legacyEnd }];
    legacyStart = "";
    legacyEnd = "";
  };

  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    const lowerField = fieldName(trimmed);

    if (lowerField === "clip" || lowerField === "youtube") {
      finishLegacyRange();
      current = createCue(fieldValue(trimmed));
      cues.push(current);
      continue;
    }

    const rawUrl = !CUE_FIELD_RE.test(trimmed) ? trimmed.match(YOUTUBE_URL_RE)?.[1] : null;
    if (rawUrl) {
      finishLegacyRange();
      current = createCue(rawUrl);
      cues.push(current);
      continue;
    }

    if (lowerField === "segment") {
      const cue = ensureCurrent();
      if (cue.segments.length === 1 && !cue.segments[0]?.start && !cue.segments[0]?.end) {
        cue.segments = [];
      }
      cue.segments.push(parseSegmentValue(fieldValue(trimmed)));
      continue;
    }

    if (lowerField === "start") {
      ensureCurrent();
      legacyStart = fieldValue(trimmed);
      continue;
    }

    if (lowerField === "end") {
      ensureCurrent();
      legacyEnd = fieldValue(trimmed);
      continue;
    }

    if (lowerField === "note") {
      ensureCurrent().note = fieldValue(trimmed);
    }
  }

  finishLegacyRange();
  return cues.map(normalizeCue);
}

function preservedLines(text: string) {
  return text
    .split(/\n/)
    .filter((line) => !CUE_FIELD_RE.test(line.trim()) && !YOUTUBE_URL_RE.test(line))
    .map((line) => line.trimEnd());
}

function serializeCues(text: string, cues: ClipCue[]) {
  const prose = preservedLines(text);
  const cueLines = cues.flatMap((cue, cueIndex) => {
    const normalized = normalizeCue(cue);
    const lines = [
      `Clip: ${normalized.url}`.trimEnd(),
      ...normalized.segments.map((segment) => `Segment: ${segment.start.trim()}-${segment.end.trim()}`),
    ];

    if (normalized.note.trim()) lines.push(`Note: ${normalized.note.trim()}`);
    if (cueIndex < cues.length - 1) lines.push("");
    return lines;
  });

  return [...prose, prose.length > 0 && cueLines.length > 0 ? "" : "", ...cueLines]
    .filter((line, index, lines) => !(line === "" && lines[index - 1] === ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimStart();
}

function secondsFromTime(value: string) {
  const clean = value.trim();
  if (!clean) return 0;
  if (/^\d+$/.test(clean)) return Number(clean);

  const parts = clean.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function embedUrl(videoId: string | null, segment: ClipSegment | undefined, autoplay = false) {
  if (!videoId) return null;
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    start: String(secondsFromTime(segment?.start ?? "")),
  });
  const end = secondsFromTime(segment?.end ?? "");
  if (end > 0) params.set("end", String(end));
  if (autoplay) params.set("autoplay", "1");
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

function segmentDurationMs(segment: ClipSegment | undefined) {
  const start = secondsFromTime(segment?.start ?? "");
  const end = secondsFromTime(segment?.end ?? "");
  if (end <= start) return 0;
  return (end - start) * 1000;
}

function playbackItems(cues: ClipCue[]) {
  return cues.flatMap((cue, cueIndex) =>
    cue.segments.map((segment, segmentIndex) => ({ cueIndex, segmentIndex, cue, segment })),
  );
}

function itemLabel(item: PlaybackItem) {
  return `Video ${item.cueIndex + 1}, segment ${item.segmentIndex + 1}`;
}

export default function ClipCueCard({
  text,
  onChange,
  onCommit,
}: {
  text: string;
  onChange: (nextText: string) => void;
  onCommit: (nextText: string) => void;
}) {
  const cues = useMemo(() => {
    const parsed = parseCues(text);
    return parsed.length > 0 ? parsed : [createCue()];
  }, [text]);
  const items = useMemo(() => playbackItems(cues), [cues]);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [sequencePlaying, setSequencePlaying] = useState(false);
  const timerRef = useRef<number | null>(null);
  const activeItem = items[activeItemIndex] ?? items[0] ?? null;
  const previewUrl = activeItem ? embedUrl(activeItem.cue.videoId, activeItem.segment, sequencePlaying) : null;
  const canPlay = items.some((item) => item.cue.videoId);

  useEffect(() => {
    if (activeItemIndex <= items.length - 1) return;
    setActiveItemIndex(0);
  }, [activeItemIndex, items.length]);

  useEffect(() => {
    if (!sequencePlaying || !activeItem) return;
    const duration = segmentDurationMs(activeItem.segment);
    if (timerRef.current) window.clearTimeout(timerRef.current);

    if (duration <= 0) {
      setSequencePlaying(false);
      return;
    }

    timerRef.current = window.setTimeout(() => {
      const nextIndex = activeItemIndex + 1;
      if (nextIndex >= items.length) {
        setSequencePlaying(false);
        setActiveItemIndex(0);
      } else {
        setActiveItemIndex(nextIndex);
      }
    }, duration + 350);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [activeItem, activeItemIndex, items.length, sequencePlaying]);

  const writeCues = (nextCues: ClipCue[]) => {
    const nextText = serializeCues(text, nextCues.map(normalizeCue));
    onChange(nextText);
    return nextText;
  };

  const updateCue = (cueIndex: number, nextCue: ClipCue) => {
    return writeCues(cues.map((cue, index) => (index === cueIndex ? normalizeCue(nextCue) : cue)));
  };

  const updateCueUrl = (cueIndex: number, url: string) => {
    const cue = cues[cueIndex];
    if (!cue) return text;
    return updateCue(cueIndex, { ...cue, url, videoId: parseVideoId(url) });
  };

  const updateCueNote = (cueIndex: number, note: string) => {
    const cue = cues[cueIndex];
    if (!cue) return text;
    return updateCue(cueIndex, { ...cue, note });
  };

  const updateSegment = (cueIndex: number, segmentIndex: number, key: keyof ClipSegment, value: string) => {
    const cue = cues[cueIndex];
    if (!cue) return text;
    const nextSegments = cue.segments.map((segment, index) =>
      index === segmentIndex ? { ...segment, [key]: value } : segment,
    );
    return updateCue(cueIndex, { ...cue, segments: nextSegments });
  };

  const addCue = () => {
    const nextText = writeCues([...cues, createCue()]);
    onCommit(nextText);
  };

  const removeCue = (cueIndex: number) => {
    const nextCues = cues.filter((_, index) => index !== cueIndex);
    const nextText = writeCues(nextCues.length > 0 ? nextCues : [createCue()]);
    setActiveItemIndex(0);
    onCommit(nextText);
  };

  const addSegment = (cueIndex: number) => {
    const cue = cues[cueIndex];
    if (!cue) return;
    const nextText = updateCue(cueIndex, { ...cue, segments: [...cue.segments, { start: "", end: "" }] });
    onCommit(nextText);
  };

  const removeSegment = (cueIndex: number, segmentIndex: number) => {
    const cue = cues[cueIndex];
    if (!cue) return;
    const nextSegments = cue.segments.filter((_, index) => index !== segmentIndex);
    const nextText = updateCue(cueIndex, {
      ...cue,
      segments: nextSegments.length > 0 ? nextSegments : [{ start: "", end: "" }],
    });
    setActiveItemIndex(0);
    onCommit(nextText);
  };

  const playSequence = () => {
    const firstPlayableIndex = items.findIndex((item) => item.cue.videoId);
    if (firstPlayableIndex < 0) return;
    setActiveItemIndex(firstPlayableIndex);
    setSequencePlaying(true);
  };

  const stopSequence = () => {
    setSequencePlaying(false);
    if (timerRef.current) window.clearTimeout(timerRef.current);
  };

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-orange-200 bg-[#fff7ed] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-200 px-4 py-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-700">
            Embedded Clip Stack
          </div>
          <div className="text-sm font-bold text-[#4a2d10]">
            Stitch multiple YouTube videos and ranges right where you are writing.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addCue}
            className="rounded-full bg-orange-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-800"
          >
            Add YouTube Video
          </button>
          <button
            type="button"
            onClick={playSequence}
            disabled={!canPlay}
            className="rounded-full bg-[#3d3122] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Play Stack
          </button>
          <button
            type="button"
            onClick={stopSequence}
            className="rounded-full bg-orange-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-800"
          >
            Stop
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {cues.map((cue, cueIndex) => (
            <div key={cueIndex} className="rounded-2xl border border-orange-200 bg-white/75 p-3 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8c6b4a]">
                  YouTube Video {cueIndex + 1}
                </div>
                <button
                  type="button"
                  onClick={() => removeCue(cueIndex)}
                  className="rounded-full bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-800"
                >
                  Remove Video
                </button>
              </div>

              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[#8c6b4a]">
                  YouTube URL
                </span>
                <input
                  value={cue.url}
                  onChange={(event) => updateCueUrl(cueIndex, event.target.value)}
                  onBlur={(event) => onCommit(updateCueUrl(cueIndex, event.target.value))}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-[#3d3122] outline-none focus:border-orange-400"
                />
              </label>

              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#8c6b4a]">
                    Segments for video {cueIndex + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => addSegment(cueIndex)}
                    className="rounded-full bg-orange-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-800"
                  >
                    Add Segment
                  </button>
                </div>

                {cue.segments.map((segment, segmentIndex) => {
                  const queueIndex = items.findIndex(
                    (item) => item.cueIndex === cueIndex && item.segmentIndex === segmentIndex,
                  );
                  const isActive = queueIndex === activeItemIndex;

                  return (
                    <div
                      key={`${cueIndex}-${segmentIndex}`}
                      className={`grid gap-2 rounded-xl border p-2 sm:grid-cols-[1fr_1fr_auto_auto] ${
                        isActive ? "border-orange-400 bg-orange-50" : "border-orange-100 bg-orange-50/40"
                      }`}
                    >
                      <input
                        value={segment.start}
                        onChange={(event) => updateSegment(cueIndex, segmentIndex, "start", event.target.value)}
                        onBlur={(event) => onCommit(updateSegment(cueIndex, segmentIndex, "start", event.target.value))}
                        placeholder="Start 0:05"
                        className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                      />
                      <input
                        value={segment.end}
                        onChange={(event) => updateSegment(cueIndex, segmentIndex, "end", event.target.value)}
                        onBlur={(event) => onCommit(updateSegment(cueIndex, segmentIndex, "end", event.target.value))}
                        placeholder="End 0:12"
                        className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (queueIndex >= 0) setActiveItemIndex(queueIndex);
                          setSequencePlaying(false);
                        }}
                        className="rounded-lg bg-[#3d3122] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSegment(cueIndex, segmentIndex)}
                        className="rounded-lg bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-orange-800 ring-1 ring-orange-200"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>

              <label className="mt-3 block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[#8c6b4a]">
                  Note
                </span>
                <input
                  value={cue.note}
                  onChange={(event) => updateCueNote(cueIndex, event.target.value)}
                  onBlur={(event) => onCommit(updateCueNote(cueIndex, event.target.value))}
                  placeholder="Why this clip matters in the show..."
                  className="w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-[#3d3122] outline-none focus:border-orange-400"
                />
              </label>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-orange-200 bg-black">
            {previewUrl ? (
              <iframe
                key={`${activeItem?.cue.videoId}-${activeItem?.segment.start}-${activeItem?.segment.end}-${activeItemIndex}-${sequencePlaying}`}
                src={previewUrl}
                title="Embedded YouTube clip stack preview"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="aspect-video w-full"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center px-6 text-center text-sm font-semibold text-orange-100">
                Add a YouTube URL to preview this show cue.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-orange-200 bg-white/70 p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-700">
              Playback Stack
            </div>
            <div className="mt-2 space-y-2">
              {items.map((item, index) => (
                <button
                  key={`${item.cueIndex}-${item.segmentIndex}`}
                  type="button"
                  onClick={() => {
                    setActiveItemIndex(index);
                    setSequencePlaying(false);
                  }}
                  className={`block w-full rounded-xl px-3 py-2 text-left text-xs font-bold ${
                    index === activeItemIndex
                      ? "bg-[#3d3122] text-white"
                      : "bg-orange-50 text-[#4a2d10] ring-1 ring-orange-100"
                  }`}
                >
                  <span className="block uppercase tracking-wider">{itemLabel(item)}</span>
                  <span className="block font-mono text-[11px] opacity-80">
                    {item.segment.start || "0:00"} - {item.segment.end || "open"}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#7a5a38]">
              The manuscript block stores this as repeated <strong>Clip:</strong> and <strong>Segment:</strong> lines,
              so play mode can stitch across one video or several without inventing a separate editor object.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
