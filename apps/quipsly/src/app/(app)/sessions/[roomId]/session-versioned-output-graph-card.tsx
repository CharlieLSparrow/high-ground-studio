"use client";

import { ArrowRight, CheckCircle2, CircleDashed, GitBranch, PackageCheck, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { SessionVersionedOutputGraph } from "./session-versioned-output-graph";

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

export function SessionVersionedOutputGraphCard({ graph }: { graph: SessionVersionedOutputGraph }) {
  const router = useRouter();
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [withdrawReason, setWithdrawReason] = useState("");

  async function operate(body: Record<string, unknown>, busyKey: string) {
    setBusyAssetId(busyKey);
    setMessage(null);
    try {
      const response = await fetch("/api/media-vault/podcast-output-packet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const packet = await response.json().catch(() => null) as { ok?: boolean; error?: string; selection?: { operation?: string } } | null;
      if (!response.ok || packet?.ok !== true) throw new Error(packet?.error || "The Episode package decision could not be saved.");
      setMessage(packet.selection?.operation === "withdrawn"
        ? "The Episode package selection was withdrawn. Every packet and artifact remains preserved."
        : "The proof-listened audio version is now the selected Episode package candidate. Metadata, hosting, upload, and publication remain open.");
      setWithdrawReason("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Episode package operation failed.");
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
      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><input value={withdrawReason} onChange={(event) => setWithdrawReason(event.target.value)} placeholder="Reason to hold or replace this packet" aria-label="Episode packet withdrawal reason" className="min-h-11 rounded-xl border border-emerald-300 bg-white px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500" /><button type="button" disabled={busyAssetId !== null || withdrawReason.trim().length < 3} onClick={() => void operate({ action: "withdraw", projectSlug: graph.episode!.projectSlug, episodeProductionId: graph.episode!.id, clientRequestId: crypto.randomUUID(), reason: withdrawReason }, "withdraw-current")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-white px-4 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50"><RotateCcw size={14} aria-hidden="true" />Withdraw selection</button></div>
    </section> : null}

    {message ? <p role="status" className="mt-4 rounded-xl border border-violet-200 bg-white p-3 text-sm font-black text-violet-950">{message}</p> : null}

    <ol className="mt-5 space-y-4" aria-label="Versioned audio output branches">{graph.assets.map((asset) => <li key={asset.mediaAssetId} className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-[#3d3122]">{asset.label}</h3><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-[#8a7354]">{asset.attachmentRole || "Attached media"} · asset {asset.mediaAssetId.slice(0, 10)}…</p></div><Link href={asset.editorHref} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-violet-300 px-4 text-[10px] font-black uppercase text-violet-900">Open exact editor asset<ArrowRight size={13} aria-hidden="true" /></Link></div>
      <ol className="mt-4 grid gap-2 lg:grid-cols-5" aria-label={`Output chain for ${asset.label}`}>{[
        ["Immutable source", "RETAINED"],
        ["Master candidate", asset.masterState],
        ["Encoded AAC", asset.deliveryState === "APPROVED" || asset.deliveryState === "PROOF_LISTEN_REQUIRED" ? "VERIFIED" : asset.deliveryState],
        ["Proof-listen", asset.deliveryState === "APPROVED" ? "APPROVED" : asset.deliveryState === "REJECTED" ? "REJECTED" : "NOT_OBSERVED"],
        ["Episode packet", asset.packetState],
      ].map(([label, state], index) => <li key={label} className={`relative rounded-xl border p-3 ${stateTone(state)}`}><p className="text-[9px] font-black uppercase tracking-wide">{index + 1}. {label}</p><p className="mt-2 text-xs font-black">{human(state)}</p>{index < 4 ? <ArrowRight size={13} className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-slate-400 lg:block" aria-hidden="true" /> : null}</li>)}</ol>
      {asset.deliveryPlaybackUrl ? <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50/50 p-3"><audio controls preload="metadata" src={asset.deliveryPlaybackUrl} className="w-full" aria-label={`Encoded Episode artifact for ${asset.label}`} /><p className="mt-2 text-[10px] font-bold leading-4 text-cyan-950">This player is for inspection. Playback here does not create or replace the explicit encoded-byte proof-listen receipt.</p></div> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="max-w-3xl"><p className="text-xs font-black text-[#3d3122]">Next: {asset.nextAction}</p><p className="mt-1 font-mono text-[9px] font-bold text-[#8a7354]">delivery {asset.deliveryJobId || "not created"} · {shortHash(asset.deliveryArtifactSha256)}</p></div>{asset.packetEligible && asset.packetState !== "SELECTED" ? <button type="button" disabled={busyAssetId !== null} onClick={() => void operate({ action: "select", projectSlug: graph.episode!.projectSlug, episodeProductionId: graph.episode!.id, assetId: asset.mediaAssetId, deliveryJobId: asset.deliveryJobId, clientRequestId: crypto.randomUUID(), exactEncodedBytesProofListened: true, selectAsEpisodeEnclosureCandidate: true, metadataStillRequiresReview: true }, asset.mediaAssetId)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 text-xs font-black text-white disabled:cursor-wait disabled:bg-slate-400"><ShieldCheck size={15} aria-hidden="true" />{asset.packetState === "OTHER_ASSET_SELECTED" ? "Select this version instead" : "Select proof-listened version"}</button> : <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">{asset.packetState === "SELECTED" ? <CheckCircle2 size={15} aria-hidden="true" /> : <CircleDashed size={15} aria-hidden="true" />}{asset.packetState === "SELECTED" ? "Current packet" : "Not packet-ready"}</span>}</div>
    </li>)}</ol>

    {!graph.assets.length ? <p className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 text-sm font-bold text-slate-700">No canonically attached Episode source is available for the versioned output chain yet.</p> : null}
    <p className="mt-4 text-[10px] font-bold leading-5 text-[#765f40]">Apple-compatible packaging still requires a stable GUID, title, public enclosure URL, byte length, MIME type, HTTP HEAD and byte-range support, reviewed metadata, and an explicit destination action. Quipsly stores those as open facts rather than treating packet selection as publication.</p>
  </section>;
}
