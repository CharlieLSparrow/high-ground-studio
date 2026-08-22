"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileAudio, FileText, LockKeyhole, RefreshCw, RotateCcw, Scissors, Send, ShieldCheck, Undo2 } from "lucide-react";

type Source = {
  id: string;
  participantLabel: string;
  kind: string;
  fileName: string | null;
  sizeBytes: number;
  startedAt: string;
  stoppedAt: string;
  programOffsetSeconds: number;
};

type TranscriptSegment = {
  transcriptJobId: string;
  segmentId: string;
  sourceRecordingAssetId: string;
  providerTextSha256: string;
  speakerLabel: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
};

type Output = {
  id: string;
  status: "DRAFT" | "RELEASED" | "REVOKED";
  title: string;
  revision: number;
  contentSha256: string;
  recipient: { id: string; label: string };
  render: {
    status: "QUEUED" | "PROCESSING" | "VERIFIED" | "FAILED" | "NOT_REQUESTED";
    durationSeconds: number | null;
    sizeBytes: number | null;
    sha256: string | null;
  };
  mediaUrl: string | null;
  body: { edit?: { startSeconds?: number; endSeconds?: number; transcriptExclusions?: TranscriptSegment[] } };
};

type Snapshot = {
  ok: boolean;
  code?: string;
  error?: string;
  role?: "COACH" | "CLIENT" | "COLLABORATOR";
  room?: { id: string; title: string; client: { id: string; label: string }; coach: { id: string; label: string } | null };
  available?: { programDurationSeconds: number; sources: Source[]; transcriptSegments: TranscriptSegment[] };
  output?: Output | null;
  readiness?: { canPrepare: boolean; hasVerifiedParticipantSources: boolean; localRendererAvailable: boolean; cloudRendererAvailable: boolean };
};

function time(value: number) {
  const seconds = Math.max(0, Math.round(value || 0));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function megabytes(value: number | null | undefined) {
  return value ? `${(value / 1024 / 1024).toFixed(value > 10 * 1024 * 1024 ? 0 : 1)} MB` : null;
}

function defaultParticipantSources(sources: Source[]) {
  const selected = new Map<string, Source>();
  for (const source of sources) {
    const existing = selected.get(source.participantLabel);
    if (!existing || (source.kind === "LOCAL_AUDIO" && existing.kind !== "LOCAL_AUDIO")) {
      selected.set(source.participantLabel, source);
    }
  }
  return [...selected.values()].map((source) => source.id);
}

export function SessionRecordingShareCard({ roomId }: { roomId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [startSeconds, setStartSeconds] = useState(0);
  const [endSeconds, setEndSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [excludedTranscriptKeys, setExcludedTranscriptKeys] = useState<Set<string>>(new Set());
  const [releaseConfirmed, setReleaseConfirmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const requestIds = useRef<Partial<Record<"PREPARE" | "RELEASE" | "REVOKE", string>>>({});

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setBusy("LOAD");
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/recording-share`, { cache: "no-store" });
      const payload = await response.json() as Snapshot;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Quipsly could not load the recording workspace.");
      setSnapshot(payload);
      if (payload.role === "COACH" && !payload.output) {
        setSelected(new Set(defaultParticipantSources(payload.available?.sources || [])));
        setEndSeconds(payload.available?.programDurationSeconds || 0);
        setTitle(`${payload.room?.title || "Coaching Session"} recording`);
      }
      if (payload.output) {
        setTitle(payload.output.title);
        setStartSeconds(Number(payload.output.body.edit?.startSeconds) || 0);
        setEndSeconds(Number(payload.output.body.edit?.endSeconds) || 0);
        setExcludedTranscriptKeys(new Set((payload.output.body.edit?.transcriptExclusions || []).map((segment) => `${segment.transcriptJobId}:${segment.segmentId}`)));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Quipsly could not load the recording workspace.");
    } finally {
      if (!quiet) setBusy(null);
    }
  }, [roomId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!snapshot?.output || !["QUEUED", "PROCESSING"].includes(snapshot.output.render.status)) return;
    const timer = window.setInterval(() => void load(true), 1_500);
    return () => window.clearInterval(timer);
  }, [load, snapshot?.output]);

  const duration = snapshot?.available?.programDurationSeconds || 0;
  const rangeValid = startSeconds >= 0 && endSeconds > startSeconds && endSeconds <= duration + 0.05;
  const chosen = useMemo(() => snapshot?.available?.sources.filter((source) => selected.has(source.id)) || [], [selected, snapshot?.available?.sources]);
  const editableTranscript = useMemo(() => (snapshot?.available?.transcriptSegments || []).filter((segment) => (
    selected.has(segment.sourceRecordingAssetId)
    && segment.endSeconds > startSeconds
    && segment.startSeconds < endSeconds
  )), [endSeconds, selected, snapshot?.available?.transcriptSegments, startSeconds]);
  const excludedTranscriptSegments = useMemo(() => editableTranscript.filter((segment) => (
    excludedTranscriptKeys.has(`${segment.transcriptJobId}:${segment.segmentId}`)
  )), [editableTranscript, excludedTranscriptKeys]);

  async function mutate(action: "PREPARE" | "RELEASE" | "REVOKE") {
    setBusy(action);
    setNotice(null);
    try {
      const output = snapshot?.output;
      const clientRequestId = requestIds.current[action] || crypto.randomUUID();
      requestIds.current[action] = clientRequestId;
      const body: Record<string, unknown> = { action, clientRequestId };
      if (action === "PREPARE") Object.assign(body, {
        title,
        sourceIds: [...selected],
        startSeconds,
        endSeconds,
        excludedTranscriptSegments: excludedTranscriptSegments.map((segment) => ({
          transcriptJobId: segment.transcriptJobId,
          segmentId: segment.segmentId,
          providerTextSha256: segment.providerTextSha256,
        })),
      });
      else {
        if (!output) throw new Error("Refresh before changing recording visibility.");
        Object.assign(body, { outputId: output.id, expectedRevision: output.revision });
      }
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/recording-share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as Snapshot;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The recording decision was not confirmed.");
      setNotice(action === "PREPARE"
        ? "Private preview queued from immutable participant masters. The client cannot see it yet."
        : action === "RELEASE"
          ? `Released inside ${output?.recipient.label}'s private Session. No email or public link was sent.`
          : "Client access revoked. Original masters and decision history remain intact.");
      delete requestIds.current[action];
      setReleaseConfirmed(false);
      if (action === "PREPARE") setEditing(false);
      await load(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The recording decision was not confirmed.");
    } finally {
      setBusy(null);
    }
  }

  if (!snapshot?.role || !snapshot.room) {
    return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5" role="status"><LockKeyhole className="text-amber-800" /><h2 className="mt-3 font-serif text-2xl font-black text-amber-950">Private recording unavailable</h2><p className="mt-2 text-sm font-semibold text-amber-900">{notice || "Loading the recipient boundary…"}</p></section>;
  }

  const output = snapshot.output;
  const coach = snapshot.role === "COACH";
  return (
    <section id="recording-share" className="rounded-3xl border border-sky-200 bg-sky-50/40 p-5 shadow-sm sm:p-6" aria-labelledby="recording-share-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-white p-3 text-sky-800 shadow-sm"><FileAudio aria-hidden="true" size={22} /></span>
          <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-700">Reviewed recording</p><h2 id="recording-share-heading" className="font-serif text-2xl font-black text-sky-950">Trim, listen, then share</h2><p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-sky-900">Recipient: <strong>{snapshot.room.client.label}</strong>. A draft stays coach-only until the explicit release step.</p></div>
        </div>
        <button type="button" onClick={() => void load()} disabled={Boolean(busy)} className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-black text-sky-900 disabled:opacity-50"><RefreshCw className={`mr-1.5 inline ${busy === "LOAD" ? "animate-spin" : ""}`} size={14} />Refresh</button>
      </div>

      {notice ? <p className="mt-4 rounded-xl border border-sky-200 bg-white p-3 text-sm font-bold text-sky-950" role="status">{notice}</p> : null}

      {coach && (!output || editing) ? (
        <div className="mt-5 space-y-5">
          {!snapshot.readiness?.hasVerifiedParticipantSources ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">No complete, verified participant masters are ready yet. Finish the Session recording upload first.</p> : null}
          {snapshot.available?.sources.length ? <fieldset><legend className="text-sm font-black text-sky-950">Participant masters</legend><p className="mt-1 text-xs font-semibold text-sky-800">Each checked source is aligned on the Session clock. Originals are never rewritten.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{snapshot.available.sources.map((source) => <label key={source.id} className="flex cursor-pointer gap-3 rounded-xl border border-sky-200 bg-white p-3"><input type="checkbox" className="mt-1 size-4 accent-sky-700" checked={selected.has(source.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(source.id)) next.delete(source.id); else next.add(source.id); return next; })} /><span><span className="block text-sm font-black text-sky-950">{source.participantLabel}</span><span className="block text-xs font-semibold text-sky-700">{source.kind === "LOCAL_VIDEO" ? "Camera master audio" : "Local audio master"} · starts +{source.programOffsetSeconds.toFixed(2)}s · {megabytes(source.sizeBytes)}</span></span></label>)}</div></fieldset> : null}
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem_10rem]"><label className="text-xs font-black uppercase tracking-wide text-sky-900">File name<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-sky-950" /></label><label className="text-xs font-black uppercase tracking-wide text-sky-900">Start (seconds)<input type="number" min={0} max={duration} step="0.1" value={startSeconds} onChange={(event) => setStartSeconds(Number(event.target.value))} className="mt-1 block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm text-sky-950" /></label><label className="text-xs font-black uppercase tracking-wide text-sky-900">End (seconds)<input type="number" min={0} max={duration} step="0.1" value={endSeconds} onChange={(event) => setEndSeconds(Number(event.target.value))} className="mt-1 block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm text-sky-950" /></label></div>
          {editableTranscript.length ? <fieldset className="rounded-2xl border border-sky-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><legend className="flex items-center gap-2 text-sm font-black text-sky-950"><FileText size={16} />Edit by transcript</legend><p className="mt-1 text-xs font-semibold text-sky-800">Uncheck a passage to remove that exact time from the private copy. Transcript corrections stay separate and originals never change.</p></div>{excludedTranscriptSegments.length ? <button type="button" onClick={() => setExcludedTranscriptKeys(new Set())} className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-black text-sky-900"><RotateCcw className="mr-1 inline" size={12} />Include all</button> : null}</div><div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">{editableTranscript.map((segment) => { const key = `${segment.transcriptJobId}:${segment.segmentId}`; const included = !excludedTranscriptKeys.has(key); return <label key={key} className={`grid cursor-pointer grid-cols-[auto_4.5rem_1fr] gap-3 rounded-xl border p-3 ${included ? "border-sky-100 bg-sky-50/50" : "border-rose-200 bg-rose-50 text-rose-950"}`}><input type="checkbox" className="mt-1 size-4 accent-sky-700" checked={included} onChange={() => setExcludedTranscriptKeys((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} /><span className="pt-0.5 text-[11px] font-black tabular-nums text-sky-700">{time(segment.startSeconds)}</span><span><span className="block text-xs font-black text-sky-950">{segment.speakerLabel}</span><span className={`mt-0.5 block text-sm leading-5 ${included ? "text-sky-950" : "line-through decoration-rose-500"}`}>{segment.text}</span></span></label>; })}</div><p className="mt-3 text-xs font-bold text-sky-800">{excludedTranscriptSegments.length ? `${excludedTranscriptSegments.length} passage${excludedTranscriptSegments.length === 1 ? "" : "s"} removed with short click-safe joins.` : "Everything in the selected range is included."}</p></fieldset> : <div className="rounded-xl border border-sky-200 bg-white p-4"><p className="text-sm font-black text-sky-950">Transcript editing appears when source-bound text is ready</p><p className="mt-1 text-xs font-semibold text-sky-800">You can still make a simple start/end trim now. Quipsly will not invent transcript timing.</p></div>}
          <p className="text-xs font-bold text-sky-800"><Scissors className="mr-1 inline" size={14} />Prepared range {time(startSeconds)}–{time(endSeconds)} ({time(endSeconds - startSeconds)}) from {chosen.length} participant source{chosen.length === 1 ? "" : "s"}.</p>
          <button type="button" disabled={Boolean(busy) || !chosen.length || !rangeValid || !snapshot.readiness?.localRendererAvailable} onClick={() => void mutate("PREPARE")} className="w-full rounded-xl bg-sky-800 px-4 py-3 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">{busy === "PREPARE" ? "Preparing private preview…" : "Prepare private preview"}</button>
          {!snapshot.readiness?.localRendererAvailable ? <p className="text-xs font-bold text-amber-800">The verified renderer is not available in this environment. Quipsly will not create a misleading draft.</p> : null}
        </div>
      ) : null}

      {output ? <div className="mt-5 space-y-4 rounded-2xl border border-sky-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black text-sky-950">{output.title}</p><p className="text-xs font-bold text-sky-700">Revision {output.revision} · {output.status === "DRAFT" ? "Private coach draft" : output.status === "RELEASED" ? `Visible to ${output.recipient.label}` : "Access revoked"}</p></div><span className="rounded-full bg-sky-100 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-sky-900">{output.render.status}</span></div>
        {output.render.status === "VERIFIED" && output.mediaUrl ? <><audio className="w-full" controls preload="metadata" src={output.mediaUrl}>Your browser cannot play this private recording.</audio><div className="flex flex-wrap gap-2 text-xs font-bold text-sky-800"><span>{time(output.render.durationSeconds || 0)}</span><span>·</span><span>{megabytes(output.render.sizeBytes)}</span><span>·</span><span className="font-mono">SHA-256 {output.render.sha256?.slice(0, 12)}…</span></div><a href={`${output.mediaUrl}?download=1`} className="inline-flex items-center rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-900"><Download className="mr-1.5" size={14} />Download exact reviewed copy</a></> : output.render.status === "FAILED" ? <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-900">The derived copy did not pass verification. Nothing was released.</p> : <p className="text-sm font-bold text-sky-800"><RefreshCw className="mr-2 inline animate-spin" size={15} />Aligning, leveling, decoding, and verifying the private preview…</p>}
        {coach && output.status === "DRAFT" && output.render.status === "VERIFIED" ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><label className="flex gap-3 text-sm font-bold text-emerald-950"><input type="checkbox" className="mt-1 size-4 accent-emerald-700" checked={releaseConfirmed} onChange={(event) => setReleaseConfirmed(event.target.checked)} /><span>I listened to this reviewed copy and intend to make it visible only to <strong>{output.recipient.label}</strong>.</span></label><button type="button" disabled={!releaseConfirmed || Boolean(busy)} onClick={() => void mutate("RELEASE")} className="mt-3 w-full rounded-xl bg-emerald-800 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Send className="mr-2 inline" size={16} />Release inside client Session</button></div> : null}
        {coach && output.status === "RELEASED" ? <button type="button" disabled={Boolean(busy)} onClick={() => void mutate("REVOKE")} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-900"><Undo2 className="mr-1.5 inline" size={14} />Revoke client access</button> : null}
        {!coach && output.status === "RELEASED" ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-950"><ShieldCheck className="mr-2 inline" size={16} />Your coach released this reviewed copy to your private Session.</p> : null}
        {coach && !editing ? <button type="button" disabled={Boolean(busy)} onClick={() => { setSelected(new Set(defaultParticipantSources(snapshot.available?.sources || []))); setStartSeconds(Number(output.body.edit?.startSeconds) || 0); setEndSeconds(Number(output.body.edit?.endSeconds) || duration); setExcludedTranscriptKeys(new Set()); setEditing(true); }} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-900"><Scissors className="mr-1.5 inline" size={14} />Make another private edit</button> : null}
      </div> : null}

      <p className="mt-4 text-[11px] font-semibold leading-5 text-sky-800"><LockKeyhole className="mr-1 inline" size={13} />Your private preview is visible only to you. Releasing it gives the named client access inside this Session; it does not create a public link or rewrite the original recordings.</p>
    </section>
  );
}
