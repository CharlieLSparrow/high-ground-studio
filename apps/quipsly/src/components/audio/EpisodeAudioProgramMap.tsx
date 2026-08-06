"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Circle,
  GitMerge,
  Layers3,
  LockKeyhole,
  Mic2,
  Music2,
  PlaySquare,
} from "lucide-react";

import type {
  EpisodeAudioProgram,
  EpisodeAudioProgramDecision,
  EpisodeAudioProgramStage,
  EpisodeAudioProgramTrack,
} from "@/lib/episode-audio-program";

const ROLE_OPTIONS = [
  ["dialogue-primary", "Primary dialogue"],
  ["dialogue-backup", "Dialogue backup"],
  ["camera-scratch", "Camera scratch audio"],
  ["reference", "Reference media"],
  ["music", "Music"],
  ["sound-effect", "Sound effect"],
  ["program-master", "Program master"],
] as const;

const MIX_OPTIONS = [
  ["include", "Include in mix"],
  ["exclude", "Exclude from mix"],
  ["backup", "Backup only"],
  ["reference-only", "Reference only"],
] as const;

function stateClass(state: EpisodeAudioProgramStage["state"]) {
  if (state === "ready") return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (state === "held") return "border-rose-300 bg-rose-50 text-rose-950";
  if (state === "attention") return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function kindIcon(track: EpisodeAudioProgramTrack) {
  if (track.kind === "dialogue") return <Mic2 className="h-4 w-4" aria-hidden="true" />;
  if (track.kind === "reference") return <PlaySquare className="h-4 w-4" aria-hidden="true" />;
  if (track.kind === "music") return <Music2 className="h-4 w-4" aria-hidden="true" />;
  return <Layers3 className="h-4 w-4" aria-hidden="true" />;
}

function clock(seconds: number | null) {
  if (seconds === null) return null;
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

export function EpisodeAudioProgramMap({
  program,
  selectedAssetId,
  onSelectTrack,
  decisionBusy = false,
  decisionNotice = null,
  onSetDecision,
  onWithdrawDecision,
}: {
  program: EpisodeAudioProgram;
  selectedAssetId: string | null;
  onSelectTrack: (assetId: string) => void;
  decisionBusy?: boolean;
  decisionNotice?: string | null;
  onSetDecision?: (track: EpisodeAudioProgramTrack, kind: EpisodeAudioProgramDecision["kind"], value: string) => void;
  onWithdrawDecision?: (decision: EpisodeAudioProgramDecision, reason: string) => void;
}) {
  const [pendingWithdrawalId, setPendingWithdrawalId] = useState<string | null>(null);
  const [withdrawalReason, setWithdrawalReason] = useState("Correcting the reviewed Episode audio plan.");
  const { summary } = program;
  const selectedTrack = program.tracks.find((track) => track.assetId === selectedAssetId) ?? program.tracks[0] ?? null;
  const activeClock = program.activeDecisions.find((decision) => decision.kind === "program-clock") ?? null;
  const roleDecision = selectedTrack?.decisions.find((decision) => decision.kind === "track-role") ?? null;
  const participantDecision = selectedTrack?.decisions.find((decision) => decision.kind === "participant") ?? null;
  const mixDecision = selectedTrack?.decisions.find((decision) => decision.kind === "mix-disposition") ?? null;
  const canDecide = Boolean(program.fingerprintSha256 && selectedTrack && onSetDecision && onWithdrawDecision);
  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm" aria-labelledby="episode-audio-program-heading">
      <div className="border-b border-indigo-100 bg-[radial-gradient(circle_at_top_right,_rgba(129,140,248,0.22),_transparent_38%),linear-gradient(135deg,#eef2ff,#ffffff)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-800"><GitMerge className="h-4 w-4" aria-hidden="true" /> Episode mix map</div>
            <h2 id="episode-audio-program-heading" className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">One program, every retained track</h2>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">See the evidence chain across participant mics, phone cameras, reference clips, and masters before treating any file in isolation.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6 lg:min-w-[590px]">
            {[
              [summary.retainedTrackCount, "Tracks"],
              [summary.dialogueTrackCount, "Dialogue"],
              [summary.alignedTrackCount, "Aligned"],
              [summary.understoodTrackCount, "Understood"],
              [summary.finishedTrackCount, "Finished"],
              [summary.multiDeviceGroupCount, "Multi-device"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl border border-indigo-100 bg-white/80 px-2 py-2">
                <div className="font-mono text-base font-black text-indigo-950">{value}</div>
                <div className="text-[9px] font-black uppercase tracking-[0.08em] text-indigo-700">{label}</div>
              </div>
            ))}
          </div>
        </div>
        {program.nextAttention ? (
          <button type="button" onClick={() => onSelectTrack(program.nextAttention!.assetId)} className="mt-4 flex w-full items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-left text-amber-950 hover:bg-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-[0.12em]">Highest-value next check</span><span className="mt-0.5 block truncate text-xs font-black">{program.nextAttention.title}</span><span className="mt-0.5 block text-[10px] font-semibold leading-4">{program.nextAttention.attentionReason}</span></span>
          </button>
        ) : null}
        {selectedTrack ? (
          <div className="mt-4 rounded-xl border border-indigo-200 bg-white/90 p-3" aria-label="Canonical audio track decisions">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-black uppercase tracking-[0.12em] text-indigo-700">Canonical decisions · {summary.activeDecisionCount} active{summary.staleDecisionCount ? ` · ${summary.staleDecisionCount} stale` : ""}</div>
                <div className="mt-1 truncate text-xs font-black text-slate-950">{selectedTrack.title}</div>
                <div className="mt-0.5 text-[9px] font-semibold text-slate-500">Imported label: {selectedTrack.importedRole.replaceAll("-", " ")}. Decisions are append-only and withdrawable.</div>
              </div>
              <label className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-600">
                Production role
                <select aria-label="Canonical production role" value={roleDecision?.value ?? ""} disabled={!canDecide || decisionBusy} onChange={(event) => event.target.value && onSetDecision?.(selectedTrack, "track-role", event.target.value)} className="mt-1 block min-h-10 w-full min-w-[170px] rounded-lg border border-indigo-200 bg-white px-2 text-xs font-bold normal-case tracking-normal disabled:bg-slate-100">
                  <option value="">Choose role…</option>
                  {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-600">
                Participant
                <select aria-label="Canonical track participant" value={participantDecision?.value ?? ""} disabled={!canDecide || decisionBusy || program.participantCatalog.length === 0} onChange={(event) => event.target.value && onSetDecision?.(selectedTrack, "participant", event.target.value)} className="mt-1 block min-h-10 w-full min-w-[170px] rounded-lg border border-indigo-200 bg-white px-2 text-xs font-bold normal-case tracking-normal disabled:bg-slate-100">
                  <option value="">{program.participantCatalog.length ? "Choose participant…" : "No Episode participants"}</option>
                  {program.participantCatalog.map((participant) => <option key={participant.id} value={`call-participant:${participant.id}`}>{participant.label}{participant.deviceLabel ? ` · ${participant.deviceLabel}` : ""}</option>)}
                </select>
              </label>
              <label className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-600">
                Mix use
                <select aria-label="Canonical mix disposition" value={mixDecision?.value ?? ""} disabled={!canDecide || decisionBusy} onChange={(event) => event.target.value && onSetDecision?.(selectedTrack, "mix-disposition", event.target.value)} className="mt-1 block min-h-10 w-full min-w-[145px] rounded-lg border border-indigo-200 bg-white px-2 text-xs font-bold normal-case tracking-normal disabled:bg-slate-100">
                  <option value="">Choose use…</option>
                  {MIX_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <button type="button" disabled={!canDecide || decisionBusy || (activeClock?.assetId === selectedTrack.assetId && activeClock.sourceId === selectedTrack.sourceId)} onClick={() => onSetDecision?.(selectedTrack, "program-clock", "primary")} className="min-h-10 rounded-lg border border-indigo-300 bg-indigo-100 px-3 text-[10px] font-black text-indigo-950 hover:bg-indigo-200 disabled:cursor-default disabled:opacity-60">
                {activeClock?.assetId === selectedTrack.assetId && activeClock.sourceId === selectedTrack.sourceId ? "Program clock" : "Set as clock"}
              </button>
            </div>
            {selectedTrack.decisions.length || (activeClock && activeClock.assetId === selectedTrack.assetId && activeClock.sourceId === selectedTrack.sourceId) ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[...selectedTrack.decisions, ...(activeClock && !selectedTrack.decisions.some((decision) => decision.id === activeClock.id) && activeClock.assetId === selectedTrack.assetId && activeClock.sourceId === selectedTrack.sourceId ? [activeClock] : [])].map((decision) => (
                  <button key={decision.id} type="button" aria-pressed={pendingWithdrawalId === decision.id} disabled={!canDecide || decisionBusy} onClick={() => { setPendingWithdrawalId(decision.id); setWithdrawalReason("Correcting the reviewed Episode audio plan."); }} className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[9px] font-black text-indigo-800 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 aria-pressed:border-rose-300 aria-pressed:bg-rose-50 aria-pressed:text-rose-900 disabled:opacity-60" title="Withdraw this decision without deleting its history">
                    {decision.label || decision.value} · withdraw
                  </button>
                ))}
              </div>
            ) : null}
            {pendingWithdrawalId ? (() => {
              const pending = [...selectedTrack.decisions, ...(activeClock && activeClock.assetId === selectedTrack.assetId && activeClock.sourceId === selectedTrack.sourceId ? [activeClock] : [])].find((decision) => decision.id === pendingWithdrawalId);
              return pending ? (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3" role="group" aria-label="Withdraw audio decision">
                  <div className="text-[10px] font-black text-rose-950">Withdraw “{pending.label || pending.value}”?</div>
                  <p className="mt-1 text-[9px] font-semibold leading-4 text-rose-800">The receipt stays in history. Add a reason so collaborators can understand why the active projection changed.</p>
                  <label className="mt-2 block text-[9px] font-black uppercase tracking-[0.08em] text-rose-900">
                    Withdrawal reason
                    <input aria-label="Audio decision withdrawal reason" value={withdrawalReason} onChange={(event) => setWithdrawalReason(event.target.value)} disabled={decisionBusy} className="mt-1 block min-h-10 w-full rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-slate-950" />
                  </label>
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <button type="button" disabled={decisionBusy} onClick={() => setPendingWithdrawalId(null)} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-[10px] font-black text-slate-800 disabled:opacity-60">Keep decision</button>
                    <button type="button" disabled={decisionBusy || withdrawalReason.trim().length < 3} onClick={() => { onWithdrawDecision?.(pending, withdrawalReason.trim()); setPendingWithdrawalId(null); }} className="min-h-9 rounded-lg bg-rose-700 px-3 text-[10px] font-black text-white hover:bg-rose-800 disabled:opacity-60">Confirm withdrawal</button>
                  </div>
                </div>
              ) : null;
            })() : null}
            {decisionNotice ? <div className="mt-2 text-[10px] font-bold text-indigo-900" role="status">{decisionNotice}</div> : null}
          </div>
        ) : null}
      </div>

      <div className="max-h-[38rem] space-y-2 overflow-y-auto p-3 sm:p-4" aria-label="Episode audio track readiness">
        {program.tracks.map((track) => {
          const selected = track.assetId === selectedAssetId;
          const multiDeviceGroup = program.groups.find((group) => group.key === track.groupKey && group.multiDevice);
          return (
            <button
              key={track.assetId}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectTrack(track.assetId)}
              className={`w-full rounded-xl border p-3 text-left transition sm:p-4 ${selected ? "border-indigo-500 bg-indigo-50 shadow-sm" : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"}`}
            >
              <span className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <span className="min-w-0 xl:w-[28%]">
                  <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.1em] text-indigo-700">{kindIcon(track)} {track.kind} · {track.role.replaceAll("-", " ")}</span>
                  <span className="mt-1 block truncate text-sm font-black text-slate-950">{track.title}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5 text-[9px] font-bold text-slate-500">
                    {track.participantId ? <span>{track.participantLabel || `Participant ${track.participantId}`}</span> : <span>Identity not assigned</span>}
                    {clock(track.durationSeconds) ? <span>· {clock(track.durationSeconds)}</span> : null}
                    {track.mixDisposition !== "include" ? <span className="rounded-full bg-amber-100 px-1.5 text-amber-900">{track.mixDisposition.replaceAll("-", " ")}</span> : null}
                    {multiDeviceGroup ? <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-1.5 text-indigo-800"><Layers3 className="h-3 w-3" aria-hidden="true" /> {multiDeviceGroup.trackCount} sources</span> : null}
                  </span>
                </span>
                <span className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-5">
                  {track.stages.map((stage) => (
                    <span key={stage.id} className={`rounded-lg border px-2 py-2 ${stateClass(stage.state)}`} title={stage.detail}>
                      <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.08em]">{stage.state === "ready" ? <Check className="h-3 w-3" aria-hidden="true" /> : stage.state === "held" ? <LockKeyhole className="h-3 w-3" aria-hidden="true" /> : <Circle className="h-3 w-3" aria-hidden="true" />} {stage.label}</span>
                      <span className="mt-1 line-clamp-2 block text-[9px] font-semibold leading-3 normal-case tracking-normal">{stage.detail}</span>
                    </span>
                  ))}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-indigo-100 bg-slate-50 px-4 py-3 text-[10px] font-semibold leading-4 text-slate-600">
        <span className="font-black text-slate-800">Evidence, not an automatic mix.</span> This map does not render audio, move timeline clips, identify people from filenames, or treat a processing result as a taste decision.
      </div>
    </section>
  );
}
