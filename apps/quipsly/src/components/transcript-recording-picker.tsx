"use client";

import {useRouter} from "next/navigation";
import {useSyncExternalStore} from "react";
import {sessionWorkspaceHref} from "@/app/(app)/sessions/[roomId]/session-workspace-model";

const subscribe = () => () => {};
type RecordingChoice = {recordingAssetId: string; fileName: string;
  startBoundary?: {occurredAt: string} | null; cloud?: {verifiedAt: string | null}; kind?: string};

function recordingLabel(source: RecordingChoice, local: boolean) {
  const generated = /^(quipsly-\d{8}-\d{6}-|coaching-session-(audio|video)-[0-9a-f]+)/i.test(source.fileName);
  if (!generated) return source.fileName || "Untitled recording";
  const title = source.kind?.includes("VIDEO") ? "Video recording" : "Audio recording";
  const timestamp = source.startBoundary?.occurredAt ?? source.cloud?.verifiedAt;
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return title;
  const date = new Intl.DateTimeFormat(local ? undefined : "en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit",
    ...(local ? {} : {timeZone: "UTC"}),
  }).format(new Date(timestamp));
  return `${title} · ${source.startBoundary ? "Recorded" : "Saved"} ${date}`;
}

export function TranscriptRecordingPicker({roomId, sources, selectedSourceId}: {
  roomId: string;
  sources: ReadonlyArray<RecordingChoice>;
  selectedSourceId: string | null;
}) {
  const router = useRouter();
  const local = useSyncExternalStore(subscribe, () => true, () => false);
  if (sources.length < 2 && !selectedSourceId) return null;
  const unavailable = selectedSourceId && !sources.some(source => source.recordingAssetId === selectedSourceId);
  return <label className="block min-w-0 rounded-2xl border border-quipsly-divider bg-quipsly-surface p-4">
    <span className="text-sm font-semibold text-quipsly-ink">Transcript recording</span>
    <select className="mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-quipsly-divider bg-quipsly-canvas px-3 text-sm text-quipsly-ink"
      value={selectedSourceId ?? ""}
      onChange={event => {
        const sourceId = event.target.value;
        if (sourceId && !sources.some(source => source.recordingAssetId === sourceId)) return;
        router.push(sessionWorkspaceHref(roomId, "transcript", {sourceId: sourceId || null, seconds: null}));
      }}>
      <option value="">Latest session transcript</option>
      {unavailable ? <option value={selectedSourceId} disabled>Selected recording unavailable</option> : null}
      {[...sources].sort((a, b) => (Date.parse(b.startBoundary?.occurredAt ?? b.cloud?.verifiedAt ?? "") || 0)
        - (Date.parse(a.startBoundary?.occurredAt ?? a.cloud?.verifiedAt ?? "") || 0))
        .map(source => <option key={source.recordingAssetId} value={source.recordingAssetId}>{recordingLabel(source, local)}</option>)}
    </select>
  </label>;
}
