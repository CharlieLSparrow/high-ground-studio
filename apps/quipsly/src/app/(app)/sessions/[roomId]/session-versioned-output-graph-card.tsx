"use client";

import { ArrowRight, CheckCircle2, CircleAlert, CircleDashed, GitBranch, PackageCheck, RotateCcw, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { SessionVersionedOutputGraph } from "./session-versioned-output-graph";
import { SessionOutputRequestJournal } from "./session-output-request-journal";

function human(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortHash(value: string | null) {
  return value ? `${value.slice(0, 12)}…` : "—";
}

function stateTone(value: string) {
  if (["ACTIVE", "APPROVED", "SELECTED"].includes(value)) return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (["FAILED", "STALE", "REJECTED", "WITHDRAWN"].includes(value)) return "border-rose-200 bg-rose-50 text-rose-950";
  if (["PROCESSING", "PROOF_LISTEN_REQUIRED", "OTHER_ASSET_SELECTED"].includes(value)) return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function EpisodePacketMetadataReview({
  packet,
  disabled,
  onSave,
}: {
  packet: NonNullable<SessionVersionedOutputGraph["currentPacket"]>;
  disabled: boolean;
  onSave: (metadata: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState(packet.title);
  const [description, setDescription] = useState(packet.description ?? "");
  const [episodeType, setEpisodeType] = useState(packet.episodeType ?? "full");
  const [episodeNumber, setEpisodeNumber] = useState(packet.episodeNumber?.toString() ?? "");
  const [seasonNumber, setSeasonNumber] = useState(packet.seasonNumber?.toString() ?? "");
  const [publishAt, setPublishAt] = useState(localDateTime(packet.publishAt));
  const changed = title.trim() !== packet.title
    || description.trim() !== (packet.description ?? "")
    || episodeType !== (packet.episodeType ?? "full")
    || episodeNumber !== (packet.episodeNumber?.toString() ?? "")
    || seasonNumber !== (packet.seasonNumber?.toString() ?? "")
    || publishAt !== localDateTime(packet.publishAt);
  const canSave = changed && title.trim().length > 0 && description.trim().length > 0;
  return <div className="mt-4 rounded-xl border border-emerald-300 bg-white/85 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black">Episode details</p><p className="mt-1 text-[10px] font-bold leading-4 text-emerald-900">Saving creates a new, traceable packet version. It does not upload, host, or publish anything.</p></div><span className="rounded-full border border-emerald-200 px-2 py-1 text-[9px] font-black uppercase">{packet.metadataComplete ? "Reviewed" : "Review needed"}</span></div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-[10px] font-black uppercase">Episode title<input value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-11 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-semibold normal-case outline-none focus:ring-2 focus:ring-emerald-500" /></label>
      <label className="grid gap-1 text-[10px] font-black uppercase">Episode type<select value={episodeType} onChange={(event) => setEpisodeType(event.target.value as "full" | "bonus" | "trailer")} className="min-h-11 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-semibold normal-case outline-none focus:ring-2 focus:ring-emerald-500"><option value="full">Full episode</option><option value="bonus">Bonus</option><option value="trailer">Trailer</option></select></label>
      <label className="grid gap-1 text-[10px] font-black uppercase sm:col-span-2">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold normal-case outline-none focus:ring-2 focus:ring-emerald-500" /></label>
      <label className="grid gap-1 text-[10px] font-black uppercase">Season number <span className="sr-only">optional</span><input type="number" min="0" step="1" value={seasonNumber} onChange={(event) => setSeasonNumber(event.target.value)} placeholder="Optional" className="min-h-11 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-semibold normal-case outline-none focus:ring-2 focus:ring-emerald-500" /></label>
      <label className="grid gap-1 text-[10px] font-black uppercase">Episode number <span className="sr-only">optional</span><input type="number" min="0" step="1" value={episodeNumber} onChange={(event) => setEpisodeNumber(event.target.value)} placeholder="Optional" className="min-h-11 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-semibold normal-case outline-none focus:ring-2 focus:ring-emerald-500" /></label>
      <label className="grid gap-1 text-[10px] font-black uppercase sm:col-span-2">Intended release time <span className="sr-only">optional</span><input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} className="min-h-11 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-semibold normal-case outline-none focus:ring-2 focus:ring-emerald-500" /></label>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-bold text-emerald-900">Title and description are required. Numbering and release timing are optional.</p><button type="button" disabled={disabled || !canSave} onClick={() => onSave({ title: title.trim(), description: description.trim(), episodeType, episodeNumber: episodeNumber === "" ? null : Number(episodeNumber), seasonNumber: seasonNumber === "" ? null : Number(seasonNumber), publishAt: publishAt ? new Date(publishAt).toISOString() : null })} className="min-h-11 rounded-xl bg-emerald-800 px-5 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-400">Save reviewed details</button></div>
  </div>;
}

export function SessionVersionedOutputGraphCard({ graph }: { graph: SessionVersionedOutputGraph }) {
  const router = useRouter();
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [programListenedBins, setProgramListenedBins] = useState<number[]>([]);
  const [programReviewNote, setProgramReviewNote] = useState("");
  const [journal] = useState(() => new SessionOutputRequestJournal());

  async function operate(body: Record<string, unknown>, busyKey: string, successMessage?: string) {
    const requestKey = `podcast-output:${JSON.stringify(body)}`;
    const savedRequest = journal.preserve(requestKey, () => body);
    setBusyAssetId(busyKey);
    setMessage(null);
    try {
      const response = await fetch("/api/media-vault/podcast-output-packet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...savedRequest.body, clientRequestId: savedRequest.clientRequestId }),
      });
      const packet = await response.json().catch(() => null) as { ok?: boolean; unchanged?: boolean; error?: string; selection?: { operation?: string } } | null;
      if (!response.ok || packet?.ok !== true) throw new Error(packet?.error || "The Episode package decision could not be saved.");
      setMessage(packet.unchanged === true ? "No Episode details changed, so Quipsly kept the current packet without adding empty history." : successMessage ?? (packet.selection?.operation === "withdrawn"
        ? "The Episode package selection was withdrawn. Every packet and artifact remains preserved."
        : "The proof-listened audio version is now the selected Episode package candidate. Metadata, hosting, upload, and publication remain open."));
      setWithdrawReason("");
      journal.acknowledge(requestKey);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Episode package operation failed.");
    } finally {
      setBusyAssetId(null);
    }
  }

  async function operateProgramDelivery(operation: "queue" | "reconcile") {
    if (!graph.programMix) return;
    setBusyAssetId("program-delivery");
    setMessage(null);
    try {
      const response = await fetch("/api/media-vault/episode-audio-program/delivery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation, projectSlug: graph.episode!.projectSlug, episodeProductionId: graph.episode!.id, mixJobId: graph.programMix.jobId }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; status?: string } | null;
      if (!response.ok || result?.ok !== true) throw new Error(result?.error || "The Episode program could not advance to its encoded delivery stage.");
      setMessage(result.status === "completed" ? "The exact AAC Episode program is registered and ready for encoded-byte proof-listening." : "The Episode program delivery job is queued or still processing. Its promoted lossless source remains unchanged.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Episode program delivery operation failed.");
    } finally {
      setBusyAssetId(null);
    }
  }

  async function reviewProgramDelivery(decision: "approved" | "rejected") {
    if (!graph.programMix?.deliveryJobId) return;
    const deliveryJobId = graph.programMix.deliveryJobId;
    const reviewNote = programReviewNote.trim();
    setBusyAssetId("program-review");
    setMessage(null);
    const intentKey = `program-delivery-review:${JSON.stringify({ deliveryJobId, decision, listenedSecondBins: programListenedBins, note: reviewNote })}`;
    const savedRequest = journal.preserve(intentKey, () => ({
      projectSlug: graph.episode!.projectSlug,
      episodeProductionId: graph.episode!.id,
      deliveryJobId,
      decision,
      playbackEvidence: { schema: "quipsly-audio-delivery-playback-review-v1", listenedSecondBins: programListenedBins, completedAt: new Date().toISOString() },
      note: reviewNote,
    }));
    const requestKey = intentKey;
    try {
      const response = await fetch("/api/media-vault/episode-audio-program/delivery/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...savedRequest.body, clientRequestId: savedRequest.clientRequestId }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || result?.ok !== true) throw new Error(result?.error || "The encoded-program listening decision could not be saved.");
      setMessage(decision === "approved" ? "The exact encoded Episode bytes are proof-listened and packet-eligible. Nothing was uploaded or published." : "The encoded bytes were rejected and preserved as version history.");
      setProgramReviewNote("");
      journal.acknowledge(requestKey);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The encoded-program listening decision failed.");
    } finally {
      setBusyAssetId(null);
    }
  }

  if (!graph.episode) return null;
  return <section className="rounded-3xl border border-violet-200 bg-gradient-to-br from-white via-violet-50/50 to-cyan-50/60 p-5 shadow-sm sm:p-6" aria-labelledby="session-output-graph-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-800"><GitBranch size={16} aria-hidden="true" />Versioned Episode output graph</p>
        <h2 id="session-output-graph-heading" className="mt-1 font-serif text-3xl font-black text-[#3d3122]">Know exactly which bytes become the episode</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">Immutable Session source → reviewed master candidate → separately encoded artifact → encoded-byte proof-listen → reversible output-packet selection. Each arrow is a receipt, and selection still does not upload or publish.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide">
        <span className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-violet-900">{graph.counts.activeMasters}/{graph.counts.sources} active masters</span>
        <span className={`rounded-full border px-3 py-1.5 ${graph.counts.activeProgramMixes ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-600"}`}>{graph.counts.activeProgramMixes ? "Program mix active" : "No active program mix"}</span>
        <span className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-cyan-900">{graph.counts.approvedArtifacts} proof-listened</span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-900">{graph.counts.selectedPackets} selected packet</span>
      </div>
    </div>

    {graph.currentPacket ? <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950" aria-label="Current Episode output packet">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide"><PackageCheck size={15} aria-hidden="true" />Selected package candidate</p><h3 className="mt-1 text-lg font-black">{graph.currentPacket.title}</h3><p className="mt-1 font-mono text-[10px] font-bold">packet {shortHash(graph.currentPacket.packetDigestSha256)} · audio {shortHash(graph.currentPacket.artifactSha256)}</p></div>
        <span className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-[9px] font-black uppercase">{human(graph.currentPacket.status)}</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs font-bold"><p>Metadata: {graph.currentPacket.metadataComplete ? "complete" : "review needed"}</p><p>Public enclosure: {graph.currentPacket.enclosurePublic ? "ready" : "not hosted"}</p><p>Publication: {graph.currentPacket.publicationEligible ? "eligible" : "not authorized"}</p></div>
      <EpisodePacketMetadataReview key={graph.currentPacket.id} packet={graph.currentPacket} disabled={busyAssetId !== null} onSave={(metadata) => void operate({ action: "metadata", projectSlug: graph.episode!.projectSlug, episodeProductionId: graph.episode!.id, baseSelectionId: graph.currentPacket!.selectionId, metadata }, "metadata-current", "Reviewed Episode details were saved as a new packet version. Audio bytes are unchanged; hosting and publication remain open.")} />
      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><input value={withdrawReason} onChange={(event) => setWithdrawReason(event.target.value)} placeholder="Reason to hold or replace this packet" aria-label="Episode packet withdrawal reason" className="min-h-11 rounded-xl border border-emerald-300 bg-white px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500" /><button type="button" disabled={busyAssetId !== null || withdrawReason.trim().length < 3} onClick={() => void operate({ action: "withdraw", projectSlug: graph.episode!.projectSlug, episodeProductionId: graph.episode!.id, reason: withdrawReason.trim() }, "withdraw-current")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-white px-4 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50"><RotateCcw size={14} aria-hidden="true" />Withdraw selection</button></div>
    </section> : null}

    {message ? <p role="status" className="mt-4 rounded-xl border border-violet-200 bg-white p-3 text-sm font-black text-violet-950">{message}</p> : null}

    {graph.programMix ? <section className={`mt-5 rounded-2xl border p-4 ${stateTone(graph.programMix.state)}`} aria-labelledby="session-program-mix-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide"><UsersRound size={15} aria-hidden="true" />Episode program authority</p>
          <h3 id="session-program-mix-heading" className="mt-1 text-xl font-black">Reviewed multitrack program · {human(graph.programMix.state)}</h3>
          <p className="mt-2 text-xs font-bold leading-5">{graph.programMix.sourceTrackCount} exact source track{graph.programMix.sourceTrackCount === 1 ? "" : "s"} feed one immutable program revision. A promoted program is different from mastering one microphone and remains different from an encoded delivery file.</p>
        </div>
        <Link href={graph.programMix.editorHref} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-current bg-white px-4 text-[10px] font-black uppercase">Open exact mix review<ArrowRight size={13} aria-hidden="true" /></Link>
      </div>
      <ol className="mt-4 grid gap-2 lg:grid-cols-5" aria-label="Program output chain">{[
        ["Exact source tracks", `${graph.programMix.sourceTrackCount} BOUND`],
        ["Program mix", graph.programMix.state],
        ["Encoded AAC", ["APPROVED", "PROOF_LISTEN_REQUIRED", "REJECTED", "STALE"].includes(graph.programMix.deliveryState) ? "VERIFIED" : graph.programMix.deliveryState],
        ["Proof-listen", graph.programMix.deliveryState === "APPROVED" ? "APPROVED" : graph.programMix.deliveryState === "REJECTED" ? "REJECTED" : "NOT_OBSERVED"],
        ["Episode packet", graph.programMix.packetState],
      ].map(([label, state], index) => <li key={label} className={`relative rounded-xl border p-3 ${stateTone(state)}`}><p className="text-[9px] font-black uppercase tracking-wide">{index + 1}. {label}</p><p className="mt-2 text-xs font-black">{human(state)}</p>{index < 4 ? <ArrowRight size={13} className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-slate-400 lg:block" aria-hidden="true" /> : null}</li>)}</ol>
      {graph.programMix.playbackUrl ? <div className="mt-4 rounded-xl border border-emerald-200 bg-white/80 p-3"><audio controls preload="metadata" src={graph.programMix.playbackUrl} className="w-full" aria-label="Promoted Episode program mix" /><p className="mt-2 text-[10px] font-bold">This is the reviewed lossless program candidate. It is not the final AAC enclosure and playback here does not create delivery approval.</p></div> : null}
      {graph.programMix.deliveryPlaybackUrl ? <div className="mt-4 rounded-xl border border-cyan-200 bg-white/90 p-3">
        <p className="text-[10px] font-black uppercase tracking-wide">Encoded-byte proof player</p>
        <audio controls preload="metadata" src={graph.programMix.deliveryPlaybackUrl} className="mt-2 w-full" aria-label="Encoded AAC Episode program" onTimeUpdate={(event) => { const bin = Math.max(0, Math.floor(event.currentTarget.currentTime)); setProgramListenedBins((current) => current.includes(bin) ? current : [...current, bin].sort((a, b) => a - b)); }} />
        <p className="mt-2 text-[10px] font-bold leading-4">Listen through the beginning, midpoint, and ending neighborhoods. Quipsly records second-bin coverage against these exact AAC bytes; tracked playback is evidence of player activity, not a claim about what you heard.</p>
        {graph.programMix.deliveryState !== "APPROVED" ? <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><input value={programReviewNote} onChange={(event) => setProgramReviewNote(event.target.value)} placeholder="Optional approval note; required to reject" aria-label="Encoded Episode program review note" className="min-h-11 rounded-xl border border-cyan-300 bg-white px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-cyan-500" /><button type="button" disabled={busyAssetId !== null || !programCoverageReady(programListenedBins, graph.programMix.deliveryDurationSeconds)} onClick={() => void reviewProgramDelivery("approved")} className="min-h-11 rounded-xl bg-cyan-800 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-400">Approve exact bytes</button><button type="button" disabled={busyAssetId !== null || programListenedBins.length === 0 || programReviewNote.trim().length < 3} onClick={() => void reviewProgramDelivery("rejected")} className="min-h-11 rounded-xl border border-rose-300 bg-white px-4 text-xs font-black text-rose-900 disabled:cursor-not-allowed disabled:opacity-50">Reject bytes</button></div> : <p className="mt-3 flex items-center gap-2 text-xs font-black text-emerald-800"><CheckCircle2 size={15} aria-hidden="true" />Current encoded bytes have an approved proof-listen receipt.</p>}
      </div> : null}
      {graph.programMix.state === "HELD" ? <div className="mt-4 flex gap-2 rounded-xl border border-rose-300 bg-white p-3 text-xs font-bold"><CircleAlert className="mt-0.5 shrink-0" size={16} aria-hidden="true" /><p>Quipsly found a promotion receipt but could not prove the completed job, registered asset, program fingerprint, and preview hash as one exact lineage. The candidate remains preserved and cannot advance.</p></div> : null}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black">Next: {graph.programMix.nextAction}</p><p className="mt-1 break-all font-mono text-[9px] font-bold">program {shortHash(graph.programMix.programFingerprintSha256)} · preview {shortHash(graph.programMix.previewSha256)} · AAC {shortHash(graph.programMix.deliveryArtifactSha256)}</p></div><div className="flex flex-wrap gap-2">{graph.programMix.state === "ACTIVE" && ["NOT_OBSERVED", "FAILED", "STALE"].includes(graph.programMix.deliveryState) ? <button type="button" disabled={busyAssetId !== null} onClick={() => void operateProgramDelivery("queue")} className="min-h-11 rounded-full bg-cyan-800 px-4 text-xs font-black text-white disabled:bg-slate-400">Encode promoted program</button> : null}{graph.programMix.state === "ACTIVE" && graph.programMix.deliveryState === "PROCESSING" ? <button type="button" disabled={busyAssetId !== null} onClick={() => void operateProgramDelivery("reconcile")} className="min-h-11 rounded-full bg-cyan-800 px-4 text-xs font-black text-white disabled:bg-slate-400">Check encoded output</button> : null}{graph.programMix.packetEligible && graph.programMix.assetId && graph.programMix.packetState !== "SELECTED" ? <button type="button" disabled={busyAssetId !== null} onClick={() => void operate({ action: "select", projectSlug: graph.episode!.projectSlug, episodeProductionId: graph.episode!.id, assetId: graph.programMix!.assetId!, deliveryJobId: graph.programMix!.deliveryJobId, exactEncodedBytesProofListened: true, selectAsEpisodeEnclosureCandidate: true, metadataStillRequiresReview: true }, "program-packet")} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 text-xs font-black text-white disabled:bg-slate-400"><ShieldCheck size={15} aria-hidden="true" />Select program package</button> : null}<span className="rounded-full border border-current bg-white px-3 py-1.5 text-[9px] font-black uppercase">{graph.programMix.historicalEventCount} promotion receipt{graph.programMix.historicalEventCount === 1 ? "" : "s"}</span></div></div>
    </section> : null}

    <ol className="mt-5 space-y-4" aria-label="Versioned audio output branches">{graph.assets.map((asset) => <li key={asset.mediaAssetId} className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-[#3d3122]">{asset.label}</h3>{asset.alternateToActiveProgramMix ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[8px] font-black uppercase text-amber-900">Single-source alternate</span> : null}</div><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-[#8a7354]">{asset.attachmentRole || "Attached media"} · asset {asset.mediaAssetId.slice(0, 10)}…</p>{asset.alternateToActiveProgramMix ? <p className="mt-2 max-w-2xl text-[10px] font-bold leading-4 text-amber-900">A reviewed multitrack program is active. Keep this branch for source-level repair and comparison; do not mistake one microphone master for the combined Episode.</p> : null}</div><Link href={asset.editorHref} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-violet-300 px-4 text-[10px] font-black uppercase text-violet-900">Open exact editor asset<ArrowRight size={13} aria-hidden="true" /></Link></div>
      <ol className="mt-4 grid gap-2 lg:grid-cols-5" aria-label={`Output chain for ${asset.label}`}>{[
        ["Immutable source", "RETAINED"],
        ["Master candidate", asset.masterState],
        ["Encoded AAC", asset.deliveryState === "APPROVED" || asset.deliveryState === "PROOF_LISTEN_REQUIRED" ? "VERIFIED" : asset.deliveryState],
        ["Proof-listen", asset.deliveryState === "APPROVED" ? "APPROVED" : asset.deliveryState === "REJECTED" ? "REJECTED" : "NOT_OBSERVED"],
        ["Episode packet", asset.packetState],
      ].map(([label, state], index) => <li key={label} className={`relative rounded-xl border p-3 ${stateTone(state)}`}><p className="text-[9px] font-black uppercase tracking-wide">{index + 1}. {label}</p><p className="mt-2 text-xs font-black">{human(state)}</p>{index < 4 ? <ArrowRight size={13} className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-slate-400 lg:block" aria-hidden="true" /> : null}</li>)}</ol>
      {asset.deliveryPlaybackUrl ? <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50/50 p-3"><audio controls preload="metadata" src={asset.deliveryPlaybackUrl} className="w-full" aria-label={`Encoded Episode artifact for ${asset.label}`} /><p className="mt-2 text-[10px] font-bold leading-4 text-cyan-950">This player is for inspection. Playback here does not create or replace the explicit encoded-byte proof-listen receipt.</p></div> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="max-w-3xl"><p className="text-xs font-black text-[#3d3122]">Next: {asset.nextAction}</p><p className="mt-1 font-mono text-[9px] font-bold text-[#8a7354]">delivery {asset.deliveryJobId || "not created"} · {shortHash(asset.deliveryArtifactSha256)}</p></div>{asset.packetEligible && !asset.alternateToActiveProgramMix && asset.packetState !== "SELECTED" ? <button type="button" disabled={busyAssetId !== null} onClick={() => void operate({ action: "select", projectSlug: graph.episode!.projectSlug, episodeProductionId: graph.episode!.id, assetId: asset.mediaAssetId, deliveryJobId: asset.deliveryJobId, exactEncodedBytesProofListened: true, selectAsEpisodeEnclosureCandidate: true, metadataStillRequiresReview: true }, asset.mediaAssetId)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 text-xs font-black text-white disabled:cursor-wait disabled:bg-slate-400"><ShieldCheck size={15} aria-hidden="true" />{asset.packetState === "OTHER_ASSET_SELECTED" ? "Select this version instead" : "Select proof-listened version"}</button> : <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">{asset.packetState === "SELECTED" ? <CheckCircle2 size={15} aria-hidden="true" /> : <CircleDashed size={15} aria-hidden="true" />}{asset.packetState === "SELECTED" ? "Current packet" : asset.alternateToActiveProgramMix ? "Program mix preferred" : "Not packet-ready"}</span>}</div>
    </li>)}</ol>

    {!graph.assets.length ? <p className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 text-sm font-bold text-slate-700">No canonically attached Episode source is available for the versioned output chain yet.</p> : null}
    <p className="mt-4 text-[10px] font-bold leading-5 text-[#765f40]">Apple-compatible packaging still requires a stable GUID, title, public enclosure URL, byte length, MIME type, HTTP HEAD and byte-range support, reviewed metadata, and an explicit destination action. Quipsly stores those as open facts rather than treating packet selection as publication.</p>
  </section>;
}

function programCoverageReady(listenedSecondBins: number[], durationSeconds: number | null) {
  if (!durationSeconds || durationSeconds <= 0) return false;
  const finalBin = Math.max(0, Math.floor(durationSeconds - 0.001));
  const anchors = [...new Set([0, Math.floor(durationSeconds / 2), finalBin])];
  const required = [...new Set(anchors.flatMap((anchor) => [anchor - 1, anchor, anchor + 1].filter((bin) => bin >= 0 && bin <= finalBin)))];
  return required.every((bin) => listenedSecondBins.includes(bin));
}
