"use client";

import { useEffect, useState } from "react";
import { CalendarCheck2, Link2, RefreshCcw, ShieldOff } from "lucide-react";

type Purpose = "COACHING" | "PODCAST_PRODUCTION" | "PERSONAL_COMMITMENTS";
type Project = { id: string; name: string };
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

export function GoogleCalendarConnectionManager({ projects }: { projects: Project[] }) {
  const [state, setState] = useState<State>({ connection: null, calendars: [], selections: [] });
  const [calendarId, setCalendarId] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("PODCAST_PRODUCTION");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    setBusy(true);
    try {
      const response = await fetch("/api/calendar/connections/google", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Could not read Google Calendar.");
      const next = body as State & { ok: true };
      setState({ connection: next.connection, calendars: next.calendars, selections: next.selections });
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
      setCalendarId("");
      setMessage("Google Calendar disconnected. The provider grant was revoked and the saved credential was erased.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disconnect Google Calendar.");
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
                {state.selections.map((selection) => <li key={selection.id} className="rounded-xl bg-emerald-50 p-3"><span className="font-black">{laneLabel(selection.purpose)}</span><br />{selection.displayName}</li>)}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void refresh()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-black text-[#315346] disabled:opacity-50"><RefreshCcw size={14} aria-hidden="true" />Refresh</button>
              <button type="button" onClick={disconnect} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-black text-rose-800 disabled:opacity-50"><ShieldOff size={14} aria-hidden="true" />Disconnect</button>
            </div>
          </div>
        </div>
      )}

      {message && <p className="mt-4 rounded-xl border border-emerald-200 bg-white p-3 text-sm font-semibold leading-relaxed text-[#385548]" role="status">{message}</p>}
      {!loaded && <p className="mt-4 text-xs font-bold text-[#5d746a]" role="status">Checking Calendar connection…</p>}
      <p className="mt-4 text-xs font-bold leading-relaxed text-[#5d746a]">Credentials are encrypted at rest. Access tokens are never saved. Disconnect revokes Google access and erases the encrypted refresh token.</p>
    </section>
  );
}
