"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  Headphones,
  Laptop,
  Mic2,
  Radio,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Users,
  Video,
} from "lucide-react";

import type { SessionReadinessSource, SessionReadinessTopology } from "./session-readiness-topology";

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

function preflightIssueLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
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

export function SessionReadinessTopologyCard({ roomId, topology }: {
  roomId: string;
  topology: SessionReadinessTopology;
}) {
  const [presence, setPresence] = useState<ProviderPresence | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [presenceError, setPresenceError] = useState<string | null>(null);
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

    <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">People</dt><dd className="mt-1 text-2xl font-black text-[#3d3122]">{topology.summary.peopleCount}</dd><dd className="text-xs font-bold text-[#765f40]">{topology.summary.consentReadyCount} capture-consent ready</dd></div>
      <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Live now</dt><dd className="mt-1 text-2xl font-black text-[#3d3122]">{presence?.connectedDeviceCount ?? "—"}</dd><dd className="text-xs font-bold text-[#765f40]">provider-observed endpoint{presence?.connectedDeviceCount === 1 ? "" : "s"}</dd></div>
      <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Prepared endpoints</dt><dd className="mt-1 text-2xl font-black text-[#3d3122]">{topology.summary.knownEndpointCount}</dd><dd className="text-xs font-bold text-[#765f40]">join receipts, not presence</dd></div>
      <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Setup checks</dt><dd className="mt-1 text-2xl font-black text-[#3d3122]">{topology.summary.currentPreflightCount}</dd><dd className="text-xs font-bold text-[#765f40]">current private-playback receipts</dd></div>
      <div className="rounded-xl border border-white bg-white/90 p-3"><dt className="text-[10px] font-black uppercase tracking-wide text-[#8a7354]">Retained sources</dt><dd className="mt-1 text-2xl font-black text-[#3d3122]">{topology.summary.retainedSourceCount}</dd><dd className="text-xs font-bold text-[#765f40]">{topology.summary.verifiedSourceCount} byte-verified</dd></div>
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
              {person.preflights.length ? <details className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3" open={person.preflights.some((preflight) => preflight.current || preflight.status === "NEEDS_ATTENTION")}><summary className="cursor-pointer text-xs font-black text-violet-950">Private playback setup checks</summary><ul className="mt-3 space-y-2">{person.preflights.map((preflight) => <li key={preflight.id} className="rounded-lg border border-violet-100 bg-white p-3 text-xs font-semibold leading-5 text-[#765f40]"><div className="flex flex-wrap items-start justify-between gap-2"><span className="flex items-center gap-2 font-black text-[#3d3122]"><Headphones size={14} aria-hidden="true" />{preflight.deviceLabel}</span><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusTone(preflight.current ? "ready" : preflight.status)}`}>{preflight.current ? "Ready now" : preflight.status === "NEEDS_ATTENTION" ? "Needs adjustment" : "Expired"}</span></div><p className="mt-2"><strong>Mic:</strong> {preflight.microphoneLabel}<br /><strong>Output:</strong> {preflight.outputLabel || "system output not reported"}{preflight.cameraWanted ? <><br /><strong>Camera:</strong> {preflight.cameraLabel || "not verified"}</> : null}</p><p className="mt-2 text-[10px] font-bold">Full private sample {preflight.privateSamplePlaybackComplete ? "heard" : "not completed"} · signal {preflight.audioSignalState.replaceAll("-", " ")} · tested {timeLabel(preflight.testedAt)} · {preflight.current ? `valid until ${timeLabel(preflight.expiresAt)}` : "not a current readiness claim"}.</p>{preflight.issueCodes.length ? <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-950">{preflight.issueCodes.map(preflightIssueLabel).join(" · ")}</p> : null}<p className="mt-2 text-[9px] font-bold uppercase tracking-wide text-violet-800">Receipt only · sample bytes stayed on {preflight.clientKind.toLowerCase() === "ios" ? "that iPhone" : preflight.clientKind.toLowerCase() === "macos" ? "that Mac" : "that browser tab"}</p></li>)}</ul></details> : null}
              {person.endpoints.length ? <details className="mt-3 rounded-lg border border-sky-100 bg-white/75 p-3"><summary className="cursor-pointer text-xs font-black text-sky-950">Prepared endpoint receipts</summary><ul className="mt-3 space-y-2">{person.endpoints.map((endpoint) => { const Icon = clientIcon(endpoint.clientKind); return <li key={endpoint.id} className="flex items-start gap-2 text-xs font-semibold text-[#765f40]"><Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><span><strong className="text-[#3d3122]">{endpoint.deviceLabel}</strong><br />Join grant {endpoint.leaseActive ? "still valid" : "expired"} · prepared {timeLabel(endpoint.preparedAt)}. This does not mean online.</span></li>; })}</ul></details> : null}
            </section>

            <section aria-label={`${person.label} retained sources`} className="rounded-xl border border-violet-100 bg-violet-50/35 p-4">
              <div className="flex items-center justify-between gap-3"><h4 className="text-xs font-black uppercase tracking-wide text-violet-950">Retained sources</h4><span className="text-[10px] font-black text-violet-800">{person.sources.filter((source) => source.verified).length}/{person.sources.length} verified</span></div>
              {person.sources.length ? <ul className="mt-3 space-y-2">{person.sources.map((source) => {
                const Icon = source.sourceKind === "video" ? Video : Mic2;
                return <li key={source.id} className="rounded-lg border border-violet-100 bg-white p-3"><div className="flex items-start gap-2"><Icon size={16} className="mt-0.5 text-violet-700" aria-hidden="true" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><p className="break-all text-xs font-black text-[#3d3122]">{source.label}</p><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusTone(source.verified ? "verified" : source.status)}`}>{source.verified ? "Byte verified" : source.evidenceKind === "capture-receipt" ? "Awaiting media" : source.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-[10px] font-bold leading-4 text-[#765f40]">{sourceDetail(source)}</p></div></div></li>;
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
