"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  Headphones,
  Laptop,
  Mic2,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Users,
  Video,
} from "lucide-react";

import type { SessionReadinessExpectedSource, SessionReadinessSource, SessionReadinessTopology } from "./session-readiness-topology";

type LiveDevice = {
  id: string;
  participantId: string | null;
  participantLabel: string;
  clientKind: string;
  deviceLabel: string;
  joinedAt: string | null;
  audio: { published: boolean; muted: boolean | null };
  video: { published: boolean; muted: boolean | null };
  matchedToCanonicalParticipant: boolean;
};

type ProviderPresence = {
  status: "LIVE" | "EMPTY" | "NOT_REQUIRED" | "UNAVAILABLE" | "FAILED";
  errorCode: string | null;
  observedAt: string;
  connectedDeviceCount: number | null;
  connectedParticipantCount: number | null;
  unknownDeviceCount: number | null;
  attentionCount: number | null;
  devices: LiveDevice[];
  nextAction: string;
};

function clientIcon(clientKind: string) {
  return clientKind.toLowerCase() === "ios" ? Smartphone : Laptop;
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("verified") || normalized.includes("ready") || normalized === "live") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (normalized === "not-required") return "border-sky-200 bg-sky-50 text-sky-900";
  if (normalized.includes("failed") || normalized.includes("held") || normalized.includes("missing")) {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  return "border-amber-200 bg-amber-50 text-amber-950";
}

function timeLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : "time not reported";
}

function sourceDetail(source: SessionReadinessSource) {
  const parts = [source.deviceLabel];
  if (source.durationSeconds != null) {
    const minutes = Math.floor(source.durationSeconds / 60);
    const seconds = Math.round(source.durationSeconds % 60);
    parts.push(minutes ? `${minutes}m ${seconds}s` : `${seconds}s`);
  }
  if (source.byteSize) {
    try {
      parts.push(`${BigInt(source.byteSize).toLocaleString()} bytes`);
    } catch {
      parts.push(`${source.byteSize} bytes`);
    }
  }
  return parts.join(" · ");
}

function retentionLabel(source: SessionReadinessSource) {
  if (source.serverRetention.state === "SERVER_COPY_VERIFIED_RELEASED") return "Server copy safe";
  if (source.serverRetention.state === "CAPTURE_PLAN_RESOLVED") return "Resolved · evidence kept";
  if (source.serverRetention.state === "SERVER_COPY_VERIFIED_HELD") return "Verified · policy held";
  if (source.serverRetention.state === "FINALIZATION_RECEIPT_MISSING") return "Finalization receipt missing";
  if (source.serverRetention.state === "CAPTURE_AWAITING_MEDIA") return "Awaiting retained media";
  return "Upload or verification pending";
}

function preflightIssueLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function expectationLabel(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function expectationTone(expectation: SessionReadinessExpectedSource) {
  if (expectation.fulfillment === "fulfilled" || expectation.fulfillment === "waived") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (expectation.fulfillment === "canceled") return "border-slate-200 bg-slate-50 text-slate-700";
  if (expectation.fulfillment === "candidate-review") return "border-sky-200 bg-sky-50 text-sky-900";
  return "border-amber-200 bg-amber-50 text-amber-950";
}

function LiveTrackBadge({ label, track }: {
  label: string;
  track: LiveDevice["audio"] | LiveDevice["video"];
}) {
  const healthy = track.published && track.muted === false;
  return <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${healthy ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
    {label} {track.published ? track.muted ? "muted" : "live" : "off"}
  </span>;
}

export function SessionReadinessTopologyCard({ roomId, topology, canManageSourcePlan = false }: {
  roomId: string;
  topology: SessionReadinessTopology;
  canManageSourcePlan?: boolean;
}) {
  const router = useRouter();
  const [presence, setPresence] = useState<ProviderPresence | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [selectedBindings, setSelectedBindings] = useState<Record<string, string>>({});
  const [planDraft, setPlanDraft] = useState({
    participantId: "",
    label: "",
    sourceKind: "AUDIO",
    retentionRole: "REQUIRED_MASTER",
    expectedClientKind: "",
    expectedDeviceLabel: "",
  });
  const liveReadbackEnabled = topology.generatedAt !== "1970-01-01T00:00:00.000Z";

  const refreshPresence = useCallback(async (foreground = true) => {
    if (foreground) setRefreshing(true);
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/presence`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const packet = await response.json().catch(() => null) as { ok?: boolean; presence?: ProviderPresence; error?: string } | null;
      if (!response.ok || !packet?.ok || !packet.presence) {
        throw new Error(packet?.error || "Live provider readback is unavailable.");
      }
      setPresence(packet.presence);
      setPresenceError(null);
    } catch (error) {
      setPresenceError(error instanceof Error ? error.message : "Live provider readback is unavailable.");
    } finally {
      if (foreground) setRefreshing(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (!liveReadbackEnabled) return;
    void refreshPresence(false);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshPresence(false);
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [liveReadbackEnabled, refreshPresence]);

  const liveByParticipant = useMemo(() => {
    const result = new Map<string, LiveDevice[]>();
    for (const device of presence?.devices ?? []) {
      if (!device.participantId) continue;
      result.set(device.participantId, [...(result.get(device.participantId) ?? []), device]);
    }
    return result;
  }, [presence]);
  const unmatchedLive = (presence?.devices ?? []).filter((device) => !device.matchedToCanonicalParticipant);
  const exitReady = topology.exitReadiness.safeToLeaveAllEndpoints;

  const createExpectation = useCallback(async () => {
    if (!planDraft.label.trim() || planBusy) return;
    setPlanBusy("create");
    setPlanMessage(null);
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/source-expectations`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          participantId: planDraft.participantId || null,
          label: planDraft.label,
          sourceKind: planDraft.sourceKind,
          retentionRole: planDraft.retentionRole,
          expectedClientKind: planDraft.expectedClientKind || null,
          expectedDeviceLabel: planDraft.expectedDeviceLabel || null,
          reason: "Declared in the Session recording plan.",
        }),
      });
      const packet = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !packet?.ok) throw new Error(packet?.error || "The planned source could not be saved.");
      setPlanDraft((current) => ({ ...current, label: "", expectedDeviceLabel: "" }));
      setShowPlanForm(false);
      setPlanMessage("Recording plan saved. Source recovery now includes the declared master in its denominator.");
      router.refresh();
    } catch (error) {
      setPlanMessage(error instanceof Error ? error.message : "The planned source could not be saved.");
    } finally {
      setPlanBusy(null);
    }
  }, [planBusy, planDraft, roomId, router]);

  const mutateExpectation = useCallback(async (
    expectation: SessionReadinessExpectedSource,
    action: "BIND" | "UNBIND" | "WAIVE" | "RESTORE" | "CANCEL",
  ) => {
    if (planBusy) return;
    const reason = reasonDrafts[expectation.id]?.trim() || null;
    if ((action === "WAIVE" || action === "CANCEL") && !reason) {
      setPlanMessage("Explain why the plan changed before waiving or canceling an expected source.");
      return;
    }
    const recordingAssetId = action === "BIND"
      ? selectedBindings[expectation.id] || expectation.candidateSources[0]?.id || null
      : null;
    if (action === "BIND" && !recordingAssetId) {
      setPlanMessage("Choose the exact retained source that fulfills this plan item.");
      return;
    }
    setPlanBusy(expectation.id);
    setPlanMessage(null);
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(roomId)}/source-expectations`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          expectationId: expectation.id,
          expectedRevision: expectation.revision,
          action,
          recordingAssetId,
          reason,
        }),
      });
      const packet = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !packet?.ok) throw new Error(packet?.error || "The recording-plan decision could not be saved.");
      setPlanMessage(action === "BIND"
        ? "The plan item is now bound to one exact retained source."
        : action === "WAIVE"
          ? "The changed plan is waived with an append-only reason."
          : "The recording-plan decision was saved with an append-only revision.");
      router.refresh();
    } catch (error) {
      setPlanMessage(error instanceof Error ? error.message : "The recording-plan decision could not be saved.");
    } finally {
      setPlanBusy(null);
    }
  }, [planBusy, reasonDrafts, roomId, router, selectedBindings]);

  return <section className="rounded-3xl border border-sky-200 bg-sky-50/45 p-5 shadow-sm sm:p-7" aria-labelledby="session-readiness-topology-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-800">Person · endpoint · retained source</p>
        <h2 id="session-readiness-topology-heading" className="mt-2 font-serif text-3xl font-black text-[#3d3122]">Who is here, what they joined with, and what is actually safe</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">Each person can use several call endpoints and preserve several local masters. Quipsly keeps those identities separate so a green call icon can never masquerade as an uploaded recording.</p>
      </div>
      <button type="button" onClick={() => void refreshPresence()} disabled={refreshing || !liveReadbackEnabled} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-sky-950 disabled:opacity-50">
        <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
        {refreshing ? "Reading room…" : "Refresh live room"}
      </button>
    </div>

    <section className={`mt-5 rounded-2xl border p-5 ${exitReady ? "border-sky-300 bg-sky-50" : "border-amber-300 bg-amber-50"}`} aria-labelledby="session-exit-readiness-heading" data-testid="session-exit-readiness">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${exitReady ? "text-sky-800" : "text-amber-800"}`}>Post-session source recovery</p>
          <h3 id="session-exit-readiness-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">{topology.exitReadiness.label}</h3>
          <p className={`mt-2 text-xs font-bold leading-5 ${exitReady ? "text-sky-950" : "text-amber-950"}`}>{topology.exitReadiness.detail}</p>
        </div>
        <span className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${exitReady ? "border-sky-300 bg-white text-sky-950" : "border-amber-300 bg-white text-amber-950"}`}>
          {topology.exitReadiness.serverSafeRequiredSourceCount}/{topology.exitReadiness.requiredSourceCount} server-safe masters
        </span>
      </div>
      <p className={`mt-3 text-[10px] font-black uppercase tracking-wide ${exitReady ? "text-emerald-800" : "text-[#765f40]"}`}>Safe to leave every endpoint: {exitReady ? "yes" : "no"} · {topology.exitReadiness.drainedEndpointCount}/{topology.exitReadiness.endpointQueueCount} latest installation queue receipts drained</p>
    </section>

    <section className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/55 p-5" aria-labelledby="session-recording-plan-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-800">Recording confidence denominator</p>
          <h3 id="session-recording-plan-heading" className="mt-1 font-serif text-2xl font-black text-[#3d3122]">Planned retained sources</h3>
          <p className="mt-2 text-xs font-bold leading-5 text-violet-950">Quipsly distinguishes “every file we saw is safe” from “every master we intended to capture exists.” A missing phone or camera cannot disappear merely because it never uploaded.</p>
        </div>
        {canManageSourcePlan ? <button type="button" onClick={() => setShowPlanForm((current) => !current)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-4 text-xs font-black uppercase tracking-wide text-white"><Plus size={15} aria-hidden="true" />{showPlanForm ? "Close" : "Add planned source"}</button> : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white bg-white p-3"><p className="text-[9px] font-black uppercase tracking-wide text-violet-700">Required masters</p><p className="mt-1 text-2xl font-black text-[#3d3122]">{topology.summary.fulfilledRequiredPlannedSourceCount}/{topology.summary.requiredPlannedSourceCount}</p><p className="text-[10px] font-bold text-[#765f40]">bound to released bytes</p></div>
        <div className="rounded-xl border border-white bg-white p-3"><p className="text-[9px] font-black uppercase tracking-wide text-violet-700">Other plan items</p><p className="mt-1 text-2xl font-black text-[#3d3122]">{Math.max(0, topology.summary.plannedSourceCount - topology.summary.requiredPlannedSourceCount)}</p><p className="text-[10px] font-bold text-[#765f40]">optional, witness, or backup</p></div>
        <div className={`rounded-xl border p-3 ${topology.exitReadiness.safeForPlannedSources ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><p className="text-[9px] font-black uppercase tracking-wide text-violet-700">Plan confidence</p><p className="mt-1 text-sm font-black text-[#3d3122]">{topology.exitReadiness.safeForPlannedSources ? "Complete" : topology.summary.requiredPlannedSourceCount ? "Needs attention" : "Not declared"}</p><p className="text-[10px] font-bold text-[#765f40]">waivers require a reason</p></div>
      </div>

      {showPlanForm && canManageSourcePlan ? <form className="mt-4 grid gap-3 rounded-xl border border-violet-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={(event) => { event.preventDefault(); void createExpectation(); }}>
        <label className="text-xs font-black text-[#3d3122]">Plan item
          <input required maxLength={160} value={planDraft.label} onChange={(event) => setPlanDraft((current) => ({ ...current, label: event.target.value }))} placeholder="Homer iPhone 4K camera master" className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 px-3 font-semibold outline-none focus:ring-2 focus:ring-violet-400" />
        </label>
        <label className="text-xs font-black text-[#3d3122]">Person
          <select value={planDraft.participantId} onChange={(event) => setPlanDraft((current) => ({ ...current, participantId: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 font-semibold"><option value="">Shared or external source</option>{topology.people.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}</select>
        </label>
        <label className="text-xs font-black text-[#3d3122]">Source
          <select value={planDraft.sourceKind} onChange={(event) => setPlanDraft((current) => ({
            ...current,
            sourceKind: event.target.value,
            retentionRole: event.target.value === "PROVIDER" && current.retentionRole === "REQUIRED_MASTER"
              ? "SYNC_WITNESS"
              : current.retentionRole,
          }))} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 font-semibold"><option value="AUDIO">Audio</option><option value="VIDEO">Video</option><option value="SCREEN">Shared Watch / screen source</option><option value="PROVIDER">Provider witness</option><option value="OTHER">Other retained source</option></select>
        </label>
        <label className="text-xs font-black text-[#3d3122]">Importance
          <select value={planDraft.retentionRole} onChange={(event) => setPlanDraft((current) => ({ ...current, retentionRole: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 font-semibold"><option value="REQUIRED_MASTER" disabled={planDraft.sourceKind === "PROVIDER"}>Required master</option><option value="OPTIONAL_MASTER">Optional master</option><option value="SYNC_WITNESS">Synchronization witness</option><option value="BACKUP">Backup</option></select>
        </label>
        <label className="text-xs font-black text-[#3d3122]">Expected endpoint
          <select value={planDraft.expectedClientKind} onChange={(event) => setPlanDraft((current) => ({ ...current, expectedClientKind: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 font-semibold"><option value="">Any endpoint</option><option value="ios">iPhone Capture</option><option value="web">Browser</option><option value="macos">Quipsly Mac</option><option value="external">External recorder/camera</option></select>
        </label>
        <label className="text-xs font-black text-[#3d3122]">Device note
          <input maxLength={160} value={planDraft.expectedDeviceLabel} onChange={(event) => setPlanDraft((current) => ({ ...current, expectedDeviceLabel: event.target.value }))} placeholder="iPhone 16 front camera · 4K/24" className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 px-3 font-semibold outline-none focus:ring-2 focus:ring-violet-400" />
        </label>
        <div className="flex items-end md:col-span-2 xl:col-span-3"><button type="submit" disabled={planBusy === "create" || !planDraft.label.trim()} className="min-h-11 rounded-full bg-violet-800 px-5 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45">{planBusy === "create" ? "Saving plan…" : "Add to recording plan"}</button></div>
      </form> : null}

      {topology.expectedSources.length ? <ul className="mt-4 space-y-3" aria-label="Planned retained source status">{topology.expectedSources.map((expectation) => <li key={expectation.id} className="rounded-xl border border-violet-100 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-black text-[#3d3122]">{expectation.label}</p><p className="mt-1 text-[10px] font-bold text-[#765f40]">{expectation.participantLabel || "Shared or external"} · {expectationLabel(expectation.sourceKind)} · {expectationLabel(expectation.retentionRole)}{expectation.expectedClientKind ? ` · ${expectationLabel(expectation.expectedClientKind)}` : ""}{expectation.expectedDeviceLabel ? ` · ${expectation.expectedDeviceLabel}` : ""}</p></div><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${expectationTone(expectation)}`}>{expectationLabel(expectation.fulfillment)}</span></div>
        {expectation.recordingAssetId ? <p className="mt-2 font-mono text-[10px] font-bold text-violet-800">Bound retained source · {expectation.recordingAssetId}</p> : expectation.fulfillment === "candidate-review" ? <p className="mt-2 text-xs font-bold text-sky-900">Quipsly found {expectation.candidateSources.length} compatible retained source{expectation.candidateSources.length === 1 ? "" : "s"}. A person must confirm the exact binding.</p> : expectation.status === "active" ? <p className="mt-2 text-xs font-bold text-amber-900">No exact retained source is bound. This remains visible and blocks global exit safety when it is required.</p> : null}
        {expectation.latestReason ? <p className="mt-2 text-[10px] font-semibold italic text-[#765f40]">Latest reason: {expectation.latestReason}</p> : null}
        {canManageSourcePlan ? <div className="mt-3 space-y-2 border-t border-violet-100 pt-3">
          {expectation.status === "active" && !expectation.recordingAssetId && expectation.candidateSources.length ? <div className="flex flex-wrap gap-2"><label className="min-w-64 flex-1 text-[10px] font-black uppercase tracking-wide text-violet-800">Exact retained source<select value={selectedBindings[expectation.id] || expectation.candidateSources[0]?.id || ""} onChange={(event) => setSelectedBindings((current) => ({ ...current, [expectation.id]: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-violet-200 bg-white px-2 text-xs font-semibold normal-case tracking-normal">{expectation.candidateSources.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label} · {candidate.deviceLabel} · {candidate.serverSafe ? "server safe" : "pending"}</option>)}</select></label><button type="button" onClick={() => void mutateExpectation(expectation, "BIND")} disabled={planBusy === expectation.id} className="mt-5 min-h-10 rounded-full bg-violet-800 px-4 text-[10px] font-black uppercase text-white disabled:opacity-45">Bind exact source</button></div> : null}
          {expectation.status === "active" ? <div className="flex flex-wrap gap-2"><input value={reasonDrafts[expectation.id] || ""} onChange={(event) => setReasonDrafts((current) => ({ ...current, [expectation.id]: event.target.value }))} placeholder="Reason the plan changed" className="min-h-10 min-w-64 flex-1 rounded-lg border border-violet-200 px-3 text-xs font-semibold" />{expectation.recordingAssetId ? <button type="button" onClick={() => void mutateExpectation(expectation, "UNBIND")} disabled={planBusy === expectation.id} className="min-h-10 rounded-full border border-violet-300 px-4 text-[10px] font-black uppercase text-violet-950 disabled:opacity-45">Unbind</button> : null}<button type="button" onClick={() => void mutateExpectation(expectation, expectation.retentionRole === "required-master" ? "WAIVE" : "CANCEL")} disabled={planBusy === expectation.id || !(reasonDrafts[expectation.id] || "").trim()} className="min-h-10 rounded-full border border-amber-300 bg-amber-50 px-4 text-[10px] font-black uppercase text-amber-950 disabled:opacity-45">{expectation.retentionRole === "required-master" ? "Waive with reason" : "Cancel with reason"}</button></div> : expectation.status === "waived" ? <button type="button" onClick={() => void mutateExpectation(expectation, "RESTORE")} disabled={planBusy === expectation.id} className="min-h-10 rounded-full border border-emerald-300 bg-emerald-50 px-4 text-[10px] font-black uppercase text-emerald-950 disabled:opacity-45">Restore requirement</button> : null}
          <p className="text-[9px] font-bold uppercase tracking-wide text-violet-700">Revision {expectation.revision} · every decision is append-only and stale writes fail closed</p>
        </div> : null}
      </li>)}</ul> : <p className="mt-4 rounded-xl border border-dashed border-violet-300 bg-white p-4 text-xs font-bold leading-5 text-violet-950">No required master is declared yet. Observed source bytes remain visible, but Quipsly will not claim the whole recording plan completed.</p>}
      {planMessage ? <p className="mt-3 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-950" role="status" aria-live="polite">{planMessage}</p> : null}
    </section>

    <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">People</dt><dd className="mt-1 text-2xl font-black text-[#3d3122]">{topology.summary.peopleCount}</dd><dd className="text-xs font-bold text-[#765f40]">{topology.summary.consentReadyCount} capture-consent ready</dd></div>
      <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Live now</dt><dd className="mt-1 text-2xl font-black text-[#3d3122]">{presence?.connectedDeviceCount ?? "—"}</dd><dd className="text-xs font-bold text-[#765f40]">provider-observed endpoint{presence?.connectedDeviceCount === 1 ? "" : "s"}</dd></div>
      <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Prepared endpoints</dt><dd className="mt-1 text-2xl font-black text-[#3d3122]">{topology.summary.knownEndpointCount}</dd><dd className="text-xs font-bold text-[#765f40]">join receipts, not presence</dd></div>
      <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Setup checks</dt><dd className="mt-1 text-2xl font-black text-[#3d3122]">{topology.summary.currentPreflightCount}</dd><dd className="text-xs font-bold text-[#765f40]">current private-playback receipts</dd></div>
      <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Retained sources</dt><dd className="mt-1 text-2xl font-black text-[#3d3122]">{topology.summary.retainedSourceCount}</dd><dd className="text-xs font-bold text-[#765f40]">{topology.summary.verifiedSourceCount} byte-verified</dd></div>
      <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Local queues</dt><dd className="mt-1 text-2xl font-black text-[#3d3122]">{topology.summary.drainedEndpointCount}/{topology.summary.endpointQueueCount}</dd><dd className="text-xs font-bold text-[#765f40]">latest installation receipts drained</dd></div>
      <div className={`rounded-xl border p-3 ${topology.summary.attentionCount + (presence?.attentionCount ?? 0) ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Attention</dt><dd className="mt-1 text-2xl font-black text-[#3d3122]">{topology.summary.attentionCount + (presence?.attentionCount ?? 0)}</dd><dd className="text-xs font-bold text-[#765f40]">explicit unresolved facts</dd></div>
    </dl>

    <div className={`mt-4 rounded-xl border px-4 py-3 text-xs font-bold leading-5 ${presence?.status === "LIVE" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-white bg-white/80 text-[#765f40]"}`} aria-live="polite">
      <div className="flex flex-wrap items-center gap-2"><Radio size={14} aria-hidden="true" /><span className="font-black">Provider observation: {presence?.status ?? "checking"}</span>{presence?.observedAt ? <span>· {timeLabel(presence.observedAt)}</span> : null}</div>
      <p className="mt-1">{presenceError || presence?.nextAction || "Reading the current room without changing access, recording, or invitations."}</p>
    </div>

    <div className="mt-5 space-y-4">
      {topology.people.map((person) => {
        const liveDevices = liveByParticipant.get(person.id) ?? [];
        return <article key={person.id} className="rounded-2xl border border-white bg-white/90 p-5" aria-labelledby={`session-topology-person-${person.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex items-center gap-2"><Users size={17} className="text-sky-700" aria-hidden="true" /><h3 id={`session-topology-person-${person.id}`} className="font-serif text-xl font-black text-[#3d3122]">{person.label}</h3>{person.isCurrentActor ? <span className="rounded-full bg-sky-100 px-2 py-1 text-[9px] font-black uppercase text-sky-900">You</span> : null}</div><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-[#8a7354]">{person.role.replaceAll("_", " ")}</p></div>
            <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${statusTone(person.consent)}`}>{person.consent === "ready" ? "Audio consent ready" : person.consent === "not-required" ? "Observer · consent not required" : "Consent missing or stale"}</span>{person.consent !== "not-required" ? <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${person.videoConsent ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>Video {person.videoConsent ? "allowed" : "not allowed"}</span> : null}</div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <section aria-label={`${person.label} call endpoints`} className="rounded-xl border border-sky-100 bg-sky-50/40 p-4">
              <div className="flex items-center justify-between gap-3"><h4 className="text-xs font-black uppercase tracking-wide text-sky-950">Call endpoints</h4><span className="text-[10px] font-black text-sky-800">{liveDevices.length} live · {person.endpoints.length} prepared</span></div>
              {liveDevices.length ? <ul className="mt-3 space-y-2">{liveDevices.map((device) => {
                const Icon = clientIcon(device.clientKind);
                return <li key={device.id} className="rounded-lg border border-emerald-200 bg-white p-3"><div className="flex items-start gap-2"><Icon size={16} className="mt-0.5 text-emerald-700" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-[#3d3122]">{device.deviceLabel}</p><p className="mt-1 text-[10px] font-bold text-[#765f40]">Provider-observed now{device.joinedAt ? ` · joined ${timeLabel(device.joinedAt)}` : ""}</p><div className="mt-2 flex flex-wrap gap-1.5"><LiveTrackBadge label="Audio" track={device.audio} /><LiveTrackBadge label="Video" track={device.video} /></div></div></div></li>;
              })}</ul> : <p className="mt-3 rounded-lg border border-dashed border-sky-200 bg-white/75 p-3 text-xs font-bold text-sky-900">No provider-observed endpoint is currently matched to this person.</p>}
              {person.preflights.length ? <details className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3" open={person.preflights.some((preflight) => preflight.current || preflight.status === "NEEDS_ATTENTION")}><summary className="cursor-pointer text-xs font-black text-violet-950">Private playback setup checks</summary><ul className="mt-3 space-y-2">{person.preflights.map((preflight) => <li key={preflight.id} className="rounded-lg border border-violet-100 bg-white p-3 text-xs font-semibold leading-5 text-[#765f40]"><div className="flex flex-wrap items-start justify-between gap-2"><span className="flex items-center gap-2 font-black text-[#3d3122]"><Headphones size={14} aria-hidden="true" />{preflight.deviceLabel}</span><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusTone(preflight.current ? "ready" : preflight.status)}`}>{preflight.current ? "Ready now" : preflight.status === "NEEDS_ATTENTION" ? "Needs adjustment" : "Expired"}</span></div><p className="mt-2"><strong>Mic:</strong> {preflight.microphoneLabel}<br /><strong>Output:</strong> {preflight.outputLabel || "system output not reported"}{preflight.cameraWanted ? <><br /><strong>Camera:</strong> {preflight.cameraLabel || "not verified"}</> : null}</p><p className="mt-2 text-[10px] font-bold">Full private sample {preflight.privateSamplePlaybackComplete ? "heard" : "not completed"} · signal {preflight.audioSignalState.replaceAll("-", " ")} · tested {timeLabel(preflight.testedAt)} · {preflight.current ? `valid until ${timeLabel(preflight.expiresAt)}` : "not a current readiness claim"}.</p>{preflight.issueCodes.length ? <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-950">{preflight.issueCodes.map(preflightIssueLabel).join(" · ")}</p> : null}<p className="mt-2 text-[9px] font-bold uppercase tracking-wide text-violet-800">Receipt only · sample bytes stayed on {preflight.clientKind.toLowerCase() === "ios" ? "that iPhone" : preflight.clientKind.toLowerCase() === "macos" ? "that Mac" : "that browser tab"}</p>{preflight.governedActionId ? <p className="mt-1 text-[9px] font-bold text-sky-800">Governed action receipt · {preflight.governedActionId.slice(-8)}</p> : null}</li>)}</ul></details> : null}
              {person.endpoints.length ? <details className="mt-3 rounded-lg border border-sky-100 bg-white/75 p-3"><summary className="cursor-pointer text-xs font-black text-sky-950">Prepared endpoint receipts</summary><ul className="mt-3 space-y-2">{person.endpoints.map((endpoint) => { const Icon = clientIcon(endpoint.clientKind); return <li key={endpoint.id} className="flex items-start gap-2 text-xs font-semibold text-[#765f40]"><Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><span><strong className="text-[#3d3122]">{endpoint.deviceLabel}</strong><br />Join grant {endpoint.leaseActive ? "still valid" : "expired"} · prepared {timeLabel(endpoint.preparedAt)}. This does not mean online.</span></li>; })}</ul></details> : null}
              {person.endpointQueues.length ? <section className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3" aria-label={`${person.label} local recovery queues`}><h5 className="text-xs font-black text-emerald-950">Latest local recovery queue receipts</h5><ul className="mt-3 space-y-2">{person.endpointQueues.map((queue) => <li key={queue.id} className="rounded-lg border border-emerald-100 bg-white p-3 text-xs font-semibold leading-5 text-[#765f40]"><div className="flex flex-wrap items-start justify-between gap-2"><strong className="text-[#3d3122]">{queue.deviceLabel}</strong><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${queue.queueState === "DRAINED" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{queue.queueState === "DRAINED" ? "Queue drained" : "Keep device available"}</span></div><p className="mt-1">{queue.recordingAssetIds.length}/{queue.localSourceCount} local source{queue.localSourceCount === 1 ? "" : "s"} matched to server assets · {queue.pendingSourceCount} pending · {queue.failedSourceCount} held.</p><p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-emerald-800">Installation {queue.clientInstanceId.slice(-8)} · revision {queue.queueRevision} · acknowledged {timeLabel(queue.reconciledAt)}</p></li>)}</ul></section> : null}
            </section>

            <section aria-label={`${person.label} retained sources`} className="rounded-xl border border-violet-100 bg-violet-50/35 p-4">
              <div className="flex items-center justify-between gap-3"><h4 className="text-xs font-black uppercase tracking-wide text-violet-950">Retained sources</h4><span className="text-[10px] font-black text-violet-800">{person.sources.filter((source) => source.verified).length}/{person.sources.length} verified</span></div>
              {person.sources.length ? <ul className="mt-3 space-y-2">{person.sources.map((source) => {
                const Icon = source.sourceKind === "video" ? Video : Mic2;
                const serverSafe = source.serverRetention.state === "SERVER_COPY_VERIFIED_RELEASED";
                return <li key={source.id} className="rounded-lg border border-violet-100 bg-white p-3"><div className="flex items-start gap-2"><Icon size={16} className="mt-0.5 text-violet-700" aria-hidden="true" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><p className="break-all text-xs font-black text-[#3d3122]">{source.label}</p><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusTone(serverSafe ? "verified" : source.serverRetention.state)}`}>{retentionLabel(source)}</span></div><p className="mt-1 text-[10px] font-bold leading-4 text-[#765f40]">{sourceDetail(source)}</p>{source.serverRetention.uploadSessionId ? <p className="mt-1 break-all font-mono text-[9px] font-bold text-violet-800">Upload {source.serverRetention.uploadSessionId}</p> : null}</div></div></li>;
              })}</ul> : <p className="mt-3 rounded-lg border border-dashed border-violet-200 bg-white/75 p-3 text-xs font-bold text-violet-900">No retained-source asset or pending local capture receipt is attributed to this person yet.</p>}
            </section>
          </div>
        </article>;
      })}
    </div>

    {topology.unassignedSources.length || unmatchedLive.length ? <section className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5" aria-labelledby="session-topology-unassigned-heading"><div className="flex items-center gap-2"><CircleAlert size={17} className="text-amber-800" aria-hidden="true" /><h3 id="session-topology-unassigned-heading" className="font-serif text-xl font-black text-amber-950">Unassigned evidence needs review</h3></div><p className="mt-2 text-xs font-bold leading-5 text-amber-900">Quipsly preserves unmatched devices and sources instead of guessing who owns them.</p><ul className="mt-3 space-y-2 text-xs font-semibold text-amber-950">{unmatchedLive.map((device) => <li key={device.id} className="rounded-lg border border-amber-200 bg-white p-3"><strong>{device.deviceLabel}</strong> · currently in the provider room, not matched to a canonical participant.</li>)}{topology.unassignedSources.map((source) => <li key={source.id} className="rounded-lg border border-amber-200 bg-white p-3"><strong>{source.label}</strong> · {source.status.replaceAll("_", " ")} · no canonical participant attribution.</li>)}</ul></section> : null}

    <div className="mt-5 grid gap-3 text-xs font-bold leading-5 text-[#765f40] md:grid-cols-2">
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><ShieldCheck size={15} className="mr-1 inline" aria-hidden="true" />RecordingAsset is the durable retained-source authority. START/STOP receipts remain visible while bytes are still local or uploading.</p>
      <p className="rounded-xl border border-sky-200 bg-white p-4 text-sky-950"><Radio size={15} className="mr-1 inline" aria-hidden="true" />Provider presence is a current observation only. Join grants are history; call tracks are conversation media; neither proves a master recording.</p>
    </div>
  </section>;
}
