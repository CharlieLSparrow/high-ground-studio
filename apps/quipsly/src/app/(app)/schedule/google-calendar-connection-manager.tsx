"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarCheck2, CalendarX2, Link2, RefreshCcw, ShieldOff, Unlink } from "lucide-react";

type Purpose = "COACHING" | "PODCAST_PRODUCTION" | "PERSONAL_COMMITMENTS";
type Project = { id: string; name: string };
type SessionChoice = {
  id: string;
  title: string;
  purpose: string;
  projectId: string | null;
  status: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  scheduledTimezone?: string | null;
};
type MilestoneChoice = {
  id: string;
  title: string;
  projectId: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  episodeTitle: string;
};
type ProjectionSource = {
  type: "SESSION" | "PRODUCTION_MILESTONE";
  id: string;
  title: string;
  purpose: "COACHING" | "PODCAST_PRODUCTION";
  projectId: string | null;
  status: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string | null;
  href: string;
};
type CalendarChoice = {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
  timeZone: string | null;
};
type Selection = {
  id: string;
  purpose: Purpose;
  displayName: string;
  providerCalendarId: string;
  nestId: string | null;
  timezone: string;
  cursor?: {
    lastFullSyncAt: string | null;
    lastIncrementalSyncAt: string | null;
  } | null;
};
type State = {
  connection: null | {
    id: string;
    status: string;
    accountLabel: string;
    verifiedAt: string | null;
  };
  calendars: CalendarChoice[];
  selections: Selection[];
};
type ProjectionPreview = {
  action: "CREATE" | "UPDATE" | "NOOP" | "CANCEL" | "BLOCKED";
  sourceRevision: string;
  sendUpdates: "none";
  warning: string;
  snapshot: {
    title: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    description: string;
    providerVisibility: "default" | "private";
    status: "CONFIRMED" | "CANCELLED";
    attendeesIncluded: false;
    privateSessionContentIncluded: false;
  };
};
type CalendarConflict = {
  projectionId: string;
  collection: { id: string; displayName: string; purpose: Purpose };
  source: ProjectionSource;
  session?: {
    id: string;
    title: string;
    purpose: string;
    projectId: string | null;
    status: string;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    timezone: string | null;
  } | null;
  reason: string;
  observedAt: string;
  conflictVersion: string;
  allowedIntents: Array<"PREPARE_QUIPSLY_UPDATE" | "STOP_PROJECTING">;
  providerContentImported: false;
};

const RESULT_MESSAGES: Record<string, string> = {
  connected: "Google Calendar connected. Choose exactly where each Quipsly lane may project events.",
  "permission-denied": "Nothing was connected because Google Calendar permission was not granted.",
  expired: "The connection request expired. Start it again from this page.",
  "calendar-scopes-denied": "Both requested Calendar permissions are needed: list owned calendars and manage events on calendars you own.",
  "missing-refresh-token": "Google did not return durable access. Reconnect and approve offline access.",
  "provider-account-already-connected": "That Google Calendar account is already attached to another Quipsly account.",
  "no-owned-calendar": "Google did not return an owned calendar for this account.",
  "callback-failed": "Google Calendar could not finish connecting. No calendar was selected or changed.",
  "setup-failed": "Google Calendar connection still needs server configuration.",
};

function laneLabel(purpose: Purpose) {
  if (purpose === "COACHING") return "Coaching sessions";
  if (purpose === "PODCAST_PRODUCTION") return "Podcast production";
  return "My commitments";
}

function normalizeConflictSource(conflict: CalendarConflict): CalendarConflict {
  if (conflict.source) return conflict;
  const session = conflict.session;
  if (!session?.scheduledStart) return conflict;
  return {
    ...conflict,
    source: {
      type: "SESSION",
      id: session.id,
      title: session.title,
      purpose: session.purpose === "COACHING" ? "COACHING" : "PODCAST_PRODUCTION",
      projectId: session.projectId,
      status: session.status,
      startsAt: session.scheduledStart,
      endsAt: session.scheduledEnd,
      timezone: session.timezone,
      href: `/sessions/${encodeURIComponent(session.id)}`,
    },
  };
}

export function GoogleCalendarConnectionManager({
  projects,
  sessions,
  milestones,
}: {
  projects: Project[];
  sessions: SessionChoice[];
  milestones: MilestoneChoice[];
}) {
  const [state, setState] = useState<State>({ connection: null, calendars: [], selections: [] });
  const [calendarId, setCalendarId] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("PODCAST_PRODUCTION");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const initialSourceKey = sessions[0]
    ? `SESSION:${sessions[0].id}`
    : milestones[0]
      ? `PRODUCTION_MILESTONE:${milestones[0].id}`
      : "";
  const [projectionSourceKey, setProjectionSourceKey] = useState(initialSourceKey);
  const [projectionCollectionId, setProjectionCollectionId] = useState("");
  const [projectionPreview, setProjectionPreview] = useState<ProjectionPreview | null>(null);
  const [conflicts, setConflicts] = useState<CalendarConflict[]>([]);
  const [preparedConflictSource, setPreparedConflictSource] = useState<ProjectionSource | null>(null);

  async function refresh() {
    setBusy(true);
    try {
      const response = await fetch("/api/calendar/connections/google", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Could not read Google Calendar.");
      const next = body as State & { ok: true };
      let nextConflicts: CalendarConflict[] = [];
      if (next.connection) {
        const conflictResponse = await fetch("/api/calendar/connections/google/conflicts", { cache: "no-store" });
        const conflictBody = await conflictResponse.json().catch(() => null);
        if (!conflictResponse.ok || !conflictBody?.ok) {
          throw new Error(conflictBody?.error || "Could not load Google Calendar conflicts.");
        }
        nextConflicts = (conflictBody.conflicts as CalendarConflict[]).map(normalizeConflictSource);
      }
      setState({ connection: next.connection, calendars: next.calendars, selections: next.selections });
      setConflicts(nextConflicts);
      setCalendarId((current) => current || next.calendars.find((calendar) => calendar.primary)?.id || next.calendars[0]?.id || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read Google Calendar.");
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  }

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("calendar");
    if (result) setMessage(RESULT_MESSAGES[result] || "Google Calendar returned to Quipsly.");
    void refresh();
  }, []);

  const selectedCalendar = state.calendars.find((calendar) => calendar.id === calendarId);
  const sourceChoices: ProjectionSource[] = [
    ...sessions.map((session): ProjectionSource => ({
      type: "SESSION",
      id: session.id,
      title: session.title,
      purpose: session.purpose === "COACHING" ? "COACHING" : "PODCAST_PRODUCTION",
      projectId: session.projectId,
      status: session.status,
      startsAt: session.scheduledStart,
      endsAt: session.scheduledEnd,
      timezone: session.scheduledTimezone || null,
      href: `/sessions/${encodeURIComponent(session.id)}`,
    })),
    ...milestones.map((milestone): ProjectionSource => ({
      type: "PRODUCTION_MILESTONE",
      id: milestone.id,
      title: `${milestone.episodeTitle} · ${milestone.title}`,
      purpose: "PODCAST_PRODUCTION",
      projectId: milestone.projectId,
      status: milestone.status,
      startsAt: milestone.startsAt,
      endsAt: milestone.endsAt,
      timezone: milestone.timezone,
      href: "",
    })),
  ];
  if (preparedConflictSource && !sourceChoices.some((source) => source.type === preparedConflictSource.type && source.id === preparedConflictSource.id)) {
    sourceChoices.push(preparedConflictSource);
  }
  for (const conflict of conflicts) {
    const key = `${conflict.source.type}:${conflict.source.id}`;
    if (!conflict.source.startsAt || sourceChoices.some((source) => `${source.type}:${source.id}` === key)) continue;
    sourceChoices.push(conflict.source);
  }
  const projectionSource = sourceChoices.find((source) => `${source.type}:${source.id}` === projectionSourceKey) || null;
  const eligibleProjectionCollections = state.selections.filter((selection) => {
    if (!projectionSource) return false;
    if (projectionSource.purpose === "PODCAST_PRODUCTION") {
      return selection.purpose === "PODCAST_PRODUCTION" && selection.nestId === projectionSource.projectId;
    }
    return selection.purpose === "COACHING";
  });

  useEffect(() => {
    setProjectionPreview(null);
    setProjectionCollectionId((current) =>
      eligibleProjectionCollections.some((selection) => selection.id === current)
        ? current
        : eligibleProjectionCollections[0]?.id || "",
    );
  }, [projectionSourceKey, state.selections]);
  async function saveSelection() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/calendar/connections/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId, purpose, ...(purpose === "PODCAST_PRODUCTION" ? { projectId } : {}) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Could not save the calendar selection.");
      setMessage("Calendar lane saved. This verifies the boundary only; Quipsly still writes nothing until an explicit projection action has its own receipt.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the calendar selection.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Google Calendar? Quipsly will revoke the Google grant, erase its encrypted refresh token, and disable its Google calendar selections.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/calendar/connections/google", { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Could not disconnect Google Calendar.");
      setState({ connection: null, calendars: [], selections: [] });
      setConflicts([]);
      setCalendarId("");
      setMessage("Google Calendar disconnected. The provider grant was revoked and the saved credential was erased.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disconnect Google Calendar.");
    } finally {
      setBusy(false);
    }
  }

  async function reconcileSelection(collectionId: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/calendar/connections/google/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Could not check Google Calendar changes.");
      const result = body.result;
      setMessage(
        result.conflictCount > 0
          ? `Google check complete. ${result.conflictCount} projection conflict${result.conflictCount === 1 ? "" : "s"} need review; no Google event was changed.`
          : result.resetFromExpiredToken
            ? "Google's old sync cursor expired. Quipsly completed a privacy-minimized full check and saved the new encrypted cursor."
            : "Google check complete. Quipsly saved the encrypted cursor and found no unresolved provider conflict.",
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check Google Calendar changes.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewConflict(
    conflict: CalendarConflict,
    intent: "PREPARE_QUIPSLY_UPDATE" | "STOP_PROJECTING",
  ) {
    if (
      intent === "STOP_PROJECTING"
      && !window.confirm("Stop linking this Quipsly source to the selected Google calendar? Quipsly will leave the Google event unchanged and retain an audit receipt.")
    ) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/calendar/connections/google/conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectionId: conflict.projectionId,
          expectedConflictVersion: conflict.conflictVersion,
          intent,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Could not record the conflict decision.");
      if (intent === "PREPARE_QUIPSLY_UPDATE") {
        if (!conflict.source.startsAt) {
          throw new Error("This Quipsly source no longer has a scheduled start, so Quipsly cannot prepare a calendar preview.");
        }
        setPreparedConflictSource(conflict.source);
        setProjectionSourceKey(`${conflict.source.type}:${conflict.source.id}`);
        setProjectionCollectionId(conflict.collection.id);
        setProjectionPreview(null);
        setMessage("Conflict reviewed. Google is unchanged. Preview the current Quipsly source below before deciding whether to update Google.");
      } else {
        setMessage("Projection stopped. Google was not changed; Quipsly retained the provider version and a local review receipt for audit.");
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record the conflict decision.");
    } finally {
      setBusy(false);
    }
  }

  function conflictExplanation(reason: string) {
    if (["provider-version-changed", "etag-conflict"].includes(reason)) {
      return "Google has a newer event version. Quipsly did not import its title, description, or attendees.";
    }
    if (["provider-event-cancelled", "provider-event-missing"].includes(reason)) {
      return "The projected Google event is absent or canceled. The canonical Quipsly source remains intact.";
    }
    if (reason === "provider-event-restored") {
      return "Google has an active event after Quipsly recorded cancellation. Neither side was overwritten.";
    }
    if (reason === "provider-identity-mismatch") {
      return "The provider event no longer carries the exact Quipsly linkage. Quipsly will not overwrite an uncertain identity.";
    }
    return "Google or Quipsly changed after the last verified projection. Review is required before another provider write.";
  }

  function projectionEndpoint(source: ProjectionSource) {
    return source.type === "SESSION"
      ? `/api/calendar/sessions/${encodeURIComponent(source.id)}/projection`
      : `/api/calendar/milestones/${encodeURIComponent(source.id)}/projection`;
  }

  async function previewProjection() {
    if (!projectionSource || !projectionCollectionId) return;
    setBusy(true);
    setMessage("");
    setProjectionPreview(null);
    try {
      const response = await fetch(
        `${projectionEndpoint(projectionSource)}?collectionId=${encodeURIComponent(projectionCollectionId)}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Could not preview the Google event.");
      setProjectionPreview(body.preview);
      setMessage("Preview loaded from the current canonical Quipsly revision. Google has not been changed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not preview the Google event.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmProjection() {
    if (!projectionPreview || !projectionSource || !projectionCollectionId) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(projectionEndpoint(projectionSource), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: projectionCollectionId,
          expectedSourceRevision: projectionPreview.sourceRevision,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        const suffix = body?.externalSideEffects === "unknown"
          ? " Provider outcome is uncertain; retry this exact preview to reconcile without duplication."
          : "";
        throw new Error((body?.error || "Could not synchronize the Google event.") + suffix);
      }
      setMessage(
        body.result.externalMutated
          ? "Google Calendar updated. Quipsly saved the exact projection and effect receipt."
          : "Google already had this exact Quipsly revision. Quipsly saved a no-change receipt.",
      );
      setProjectionPreview(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not synchronize the Google event.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancellation() {
    if (!projectionPreview || !projectionSource || !projectionCollectionId) return;
    if (!window.confirm("Remove this Quipsly event from the selected Google calendar? Its canonical source and history stay intact. No attendees or notifications will be sent.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(projectionEndpoint(projectionSource), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: projectionCollectionId,
          expectedSourceRevision: projectionPreview.sourceRevision,
          confirmCancellation: true,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        const suffix = body?.externalSideEffects === "unknown"
          ? " Provider outcome is uncertain; retry this exact cancellation preview to reconcile safely."
          : "";
        throw new Error((body?.error || "Could not remove the Google event safely.") + suffix);
      }
      setMessage(
        body.result.externalMutated
          ? "Google Calendar event removed with notifications off. Quipsly retained the canonical source and saved the cancellation receipt."
          : "Google had no remaining event to remove. Quipsly saved the verified absence without another provider effect.",
      );
      setProjectionPreview(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove the Google event safely.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="google-calendar-connection-heading" className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm lg:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-800">Optional two-way provider</p>
          <h2 id="google-calendar-connection-heading" className="mt-1 font-serif text-3xl font-black text-[#263f34]">Connect Google Calendar on purpose.</h2>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-[#4e685d]">
            This is separate from Google sign-in. Quipsly asks only to list calendars and manage events on calendars you own. It never imports event text from calendars you do not select, and connecting alone performs no event writes.
          </p>
        </div>
        {state.connection ? (
          <span className="w-fit rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-800">Connected · {state.connection.accountLabel}</span>
        ) : (
          <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-600">Not connected</span>
        )}
      </div>

      {!state.connection ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-white p-4">
          <p className="text-sm font-semibold leading-relaxed text-[#4e685d]">Use a full browser window for Google consent. You can keep using Quipsly and its private iCalendar subscriptions without connecting.</p>
          <a href="/api/calendar/connections/google/start" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#263f34] px-5 py-2.5 text-xs font-black text-white">
            <Link2 size={15} aria-hidden="true" />Connect Google Calendar
          </a>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-2xl border border-emerald-200 bg-white p-4">
            <h3 className="font-black text-[#263f34]">Choose a Quipsly lane and owned calendar</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-[10px] font-black uppercase tracking-wide text-[#4e685d]">Quipsly lane
                <select value={purpose} onChange={(event) => setPurpose(event.target.value as Purpose)} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#263f34]">
                  <option value="PODCAST_PRODUCTION">Podcast production</option>
                  <option value="COACHING">Coaching sessions</option>
                  <option value="PERSONAL_COMMITMENTS">My commitments</option>
                </select>
              </label>
              <label className="text-[10px] font-black uppercase tracking-wide text-[#4e685d]">Owned Google calendar
                <select value={calendarId} onChange={(event) => setCalendarId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#263f34]">
                  {state.calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? " (primary)" : ""}</option>)}
                </select>
              </label>
            </div>
            {purpose === "PODCAST_PRODUCTION" && (
              <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-[#4e685d]">Episode Nest
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#263f34]">
                  {projects.length === 0 && <option value="">No accessible Nests</option>}
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
            )}
            <button type="button" onClick={saveSelection} disabled={busy || !calendarId || (purpose === "PODCAST_PRODUCTION" && !projectId)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#263f34] px-5 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
              <CalendarCheck2 size={15} aria-hidden="true" />{busy ? "Checking…" : "Use this calendar for this lane"}
            </button>
            {selectedCalendar && <p className="mt-3 text-xs font-semibold text-[#5d746a]">Provider role: owner · Time zone: {selectedCalendar.timeZone || "not supplied"}</p>}
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-white p-4">
            <h3 className="font-black text-[#263f34]">Verified selections</h3>
            {state.selections.length === 0 ? <p className="mt-2 text-xs font-semibold leading-relaxed text-[#5d746a]">Connected, but no Quipsly lane may project to Google yet.</p> : (
              <ul className="mt-3 space-y-2 text-xs font-semibold text-[#4e685d]">
                {state.selections.map((selection) => {
                  const lastChecked = selection.cursor?.lastIncrementalSyncAt || selection.cursor?.lastFullSyncAt;
                  return (
                    <li key={selection.id} className="rounded-xl bg-emerald-50 p-3">
                      <span className="font-black">{laneLabel(selection.purpose)}</span><br />{selection.displayName}
                      <p className="mt-1 text-[11px] text-[#5d746a]">{lastChecked ? `Provider checked ${new Date(lastChecked).toLocaleString()}` : "Provider changes have not been checked yet."}</p>
                      <button type="button" onClick={() => void reconcileSelection(selection.id)} disabled={busy} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-[11px] font-black text-[#315346] disabled:opacity-50">
                        <RefreshCcw size={13} aria-hidden="true" />Check Google changes
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void refresh()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-black text-[#315346] disabled:opacity-50"><RefreshCcw size={14} aria-hidden="true" />Refresh</button>
              <button type="button" onClick={disconnect} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-black text-rose-800 disabled:opacity-50"><ShieldOff size={14} aria-hidden="true" />Disconnect</button>
            </div>
          </div>
        </div>
      )}

      {state.connection && conflicts.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4" role="region" aria-labelledby="google-calendar-conflicts-heading">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-800" size={20} aria-hidden="true" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-900">Human review required</p>
              <h3 id="google-calendar-conflicts-heading" className="mt-1 font-serif text-2xl font-black text-[#493914]">Google Calendar changes need a decision</h3>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-[#6f5a24]">Quipsly read only provider identity and version evidence. It did not import event content or change either calendar.</p>
            </div>
          </div>
          <ul className="mt-4 space-y-3">
            {conflicts.map((conflict) => (
              <li key={conflict.projectionId} className="rounded-2xl border border-amber-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-amber-800">{conflict.collection.displayName}</p>
                    <h4 className="mt-1 font-black text-[#493914]">{conflict.source.title}</h4>
                    {conflict.source.startsAt && (
                      <p className="mt-1 text-xs font-semibold text-[#6f5a24]">{new Date(conflict.source.startsAt).toLocaleString()} · {conflict.source.timezone || "Quipsly timezone"}</p>
                    )}
                  </div>
                  <a href={conflict.source.href} className="inline-flex min-h-11 items-center rounded-full border border-amber-200 px-3 py-2 text-[11px] font-black text-[#6f5a24]">Open Quipsly source</a>
                </div>
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold leading-relaxed text-[#6f5a24]">{conflictExplanation(conflict.reason)}</p>
                {conflict.allowedIntents.length === 0 ? (
                  <p className="mt-3 text-xs font-bold text-amber-900">You can inspect this conflict, but current source edit access is required to resolve it.</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {conflict.allowedIntents.includes("PREPARE_QUIPSLY_UPDATE") && (
                      <button type="button" onClick={() => void reviewConflict(conflict, "PREPARE_QUIPSLY_UPDATE")} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#493914] px-4 py-2 text-xs font-black text-white disabled:opacity-50">
                        <CalendarCheck2 size={14} aria-hidden="true" />Prepare Quipsly preview
                      </button>
                    )}
                    {conflict.allowedIntents.includes("STOP_PROJECTING") && (
                      <button type="button" onClick={() => void reviewConflict(conflict, "STOP_PROJECTING")} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-black text-[#6f5a24] disabled:opacity-50">
                        <Unlink size={14} aria-hidden="true" />Stop linking · leave Google unchanged
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.connection && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-800">Preview before provider write</p>
          <h3 className="mt-1 font-serif text-2xl font-black text-[#263f34]">Send one canonical Session or production milestone</h3>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-[#5d746a]">
            Quipsly shows the exact public event first. Confirm never adds attendees and forces Google notifications off. A Google-side edit becomes a conflict instead of being overwritten.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-[10px] font-black uppercase tracking-wide text-[#4e685d]">Quipsly source
              <select value={projectionSourceKey} onChange={(event) => setProjectionSourceKey(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#263f34]">
                {sourceChoices.length === 0 && <option value="">No scheduled Sessions or milestones</option>}
                {sourceChoices.map((source) => (
                  <option key={`${source.type}:${source.id}`} value={`${source.type}:${source.id}`}>{source.status === "CANCELED" ? "Canceled · " : ""}{source.type === "PRODUCTION_MILESTONE" ? "Milestone · " : "Session · "}{source.title} · {new Date(source.startsAt).toLocaleString()}</option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-black uppercase tracking-wide text-[#4e685d]">Verified calendar selection
              <select value={projectionCollectionId} onChange={(event) => { setProjectionCollectionId(event.target.value); setProjectionPreview(null); }} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#263f34]">
                {eligibleProjectionCollections.length === 0 && <option value="">No matching calendar lane</option>}
                {eligibleProjectionCollections.map((selection) => (
                  <option key={selection.id} value={selection.id}>{selection.displayName} · {laneLabel(selection.purpose)}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" onClick={previewProjection} disabled={busy || !projectionSource || !projectionCollectionId} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-300 bg-white px-5 py-2.5 text-xs font-black text-[#263f34] disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCcw size={14} aria-hidden="true" />Preview Google event
          </button>
          {projectionPreview && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4" role="region" aria-label="Google event preview">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-emerald-800">{projectionPreview.action}</p>
                  <h4 className="mt-1 font-black text-[#263f34]">{projectionPreview.snapshot.title}</h4>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-800">Notifications off · No attendees · {projectionPreview.snapshot.providerVisibility === "default" ? "Shared calendar visibility" : "Private event"}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-[#4e685d]">
                {new Date(projectionPreview.snapshot.startsAt).toLocaleString()}–{new Date(projectionPreview.snapshot.endsAt).toLocaleTimeString()} · {projectionPreview.snapshot.timezone}
              </p>
              <p className="mt-3 text-xs font-semibold leading-relaxed text-[#5d746a]">{projectionPreview.snapshot.description}</p>
              <p className="mt-3 rounded-xl bg-white p-3 text-xs font-bold leading-relaxed text-[#4e685d]">{projectionPreview.warning}</p>
              {projectionPreview.snapshot.status === "CANCELLED" ? (
                <button type="button" onClick={confirmCancellation} disabled={busy || projectionPreview.action === "BLOCKED"} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-rose-700 px-5 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                  <CalendarX2 size={15} aria-hidden="true" />
                  {projectionPreview.action === "NOOP" ? "Record verified absence" : "Confirm removal from Google"}
                </button>
              ) : (
                <button type="button" onClick={confirmProjection} disabled={busy || projectionPreview.action === "BLOCKED"} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#263f34] px-5 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                  <CalendarCheck2 size={15} aria-hidden="true" />
                  {projectionPreview.action === "NOOP" ? "Record verified no-change" : `Confirm ${projectionPreview.action.toLowerCase()} in Google`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {message && <p className="mt-4 rounded-xl border border-emerald-200 bg-white p-3 text-sm font-semibold leading-relaxed text-[#385548]" role="status">{message}</p>}
      {!loaded && <p className="mt-4 text-xs font-bold text-[#5d746a]" role="status">Checking Calendar connection…</p>}
      <p className="mt-4 text-xs font-bold leading-relaxed text-[#5d746a]">Credentials are encrypted at rest. Access tokens are never saved. Disconnect revokes Google access and erases the encrypted refresh token.</p>
    </section>
  );
}
