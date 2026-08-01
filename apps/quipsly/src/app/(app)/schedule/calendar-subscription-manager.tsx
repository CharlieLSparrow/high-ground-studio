"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, Clipboard, RotateCcw, ShieldOff } from "lucide-react";

type Purpose = "COACHING" | "PODCAST_PRODUCTION" | "PERSONAL_COMMITMENTS";
type Project = { id: string; name: string };
type FeedStatus = {
  id: string;
  purpose: Purpose;
  displayName: string;
  projectId: string | null;
  status: "ACTIVE" | "REVOKED";
  createdAt: string;
  lastGeneratedAt: string | null;
};
type NewFeed = {
  purpose: Purpose;
  displayName: string;
  subscriptionUrl: string;
  webcalUrl: string;
  shownOnce: true;
};

const LANES: Array<{ purpose: Purpose; title: string; description: string }> = [
  {
    purpose: "PERSONAL_COMMITMENTS",
    title: "My commitments",
    description:
      "Focus blocks plus transparent task due dates and goal targets.",
  },
  {
    purpose: "COACHING",
    title: "My coaching sessions",
    description:
      "Appointments you coach or attend, without private notes or transcript text.",
  },
  {
    purpose: "PODCAST_PRODUCTION",
    title: "Episode Nest feed",
    description:
      "Scheduled podcast rooms for one Nest. Milestones will join after their canonical model ships.",
  },
];

export function CalendarSubscriptionManager({
  projects,
  initialFeeds,
}: {
  projects: Project[];
  initialFeeds: FeedStatus[];
}) {
  const [feeds, setFeeds] = useState<FeedStatus[]>(initialFeeds);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [newFeed, setNewFeed] = useState<NewFeed | null>(null);
  const [busy, setBusy] = useState<Purpose | null>(null);
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/calendar/feeds", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok)
      throw new Error(body?.error || "Could not read calendar subscriptions.");
    setFeeds(body.feeds);
    setMessage("");
  }

  const active = useMemo(
    () =>
      new Set(
        feeds
          .filter((feed) => feed.status === "ACTIVE")
          .map((feed) => `${feed.purpose}:${feed.projectId || "personal"}`),
      ),
    [feeds],
  );

  async function rotate(purpose: Purpose) {
    setBusy(purpose);
    setNewFeed(null);
    setMessage("");
    try {
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const response = await fetch("/api/calendar/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose,
          timezone,
          ...(purpose === "PODCAST_PRODUCTION" ? { projectId } : {}),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok)
        throw new Error(body?.error || "Could not create the subscription.");
      setNewFeed(body.feed);
      setMessage(
        "Private link created. Add or copy it now; Quipsly stores only its digest and cannot show this exact link again.",
      );
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not create the subscription.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function revoke(purpose: Purpose) {
    setBusy(purpose);
    setNewFeed(null);
    setMessage("");
    try {
      const response = await fetch("/api/calendar/feeds", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose,
          ...(purpose === "PODCAST_PRODUCTION" ? { projectId } : {}),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok)
        throw new Error(body?.error || "Could not revoke the subscription.");
      setMessage(
        body.revoked > 0
          ? "Subscription revoked. The old private link now returns not found."
          : "No active subscription needed revocation.",
      );
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not revoke the subscription.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    if (!newFeed) return;
    try {
      await navigator.clipboard.writeText(newFeed.subscriptionUrl);
      setMessage(
        "Private subscription link copied. Treat it like a password; anyone with it can read that calendar projection.",
      );
    } catch {
      setMessage(
        "Copy was blocked. Select the private link below and copy it manually.",
      );
    }
  }

  return (
    <section
      aria-labelledby="calendar-subscriptions-heading"
      className="rounded-3xl border border-sky-200 bg-sky-50/70 p-5 shadow-sm lg:p-7"
    >
      <div className="max-w-4xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-800">
          Apple Calendar · Google Calendar · Outlook
        </p>
        <h2
          id="calendar-subscriptions-heading"
          className="mt-1 font-serif text-3xl font-black text-[#26394a]"
        >
          Read-only calendar subscriptions
        </h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-[#4d6577]">
          Create a revocable private link for the calendar you choose.
          Subscriptions never contain recordings, transcript text, coaching
          notes, participant email addresses, or provider credentials.
        </p>
      </div>
      <div className="mt-5 grid gap-3 xl:grid-cols-3">
        {LANES.map((lane) => {
          const key = `${lane.purpose}:${lane.purpose === "PODCAST_PRODUCTION" ? projectId : "personal"}`;
          const isActive = active.has(key);
          const disabled =
            busy !== null ||
            (lane.purpose === "PODCAST_PRODUCTION" && !projectId);
          return (
            <article
              key={lane.purpose}
              className="rounded-2xl border border-sky-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-black text-[#26394a]">{lane.title}</h3>
                <span
                  className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                >
                  {isActive ? "Active" : "Not shared"}
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-[#5d7180]">
                {lane.description}
              </p>
              {lane.purpose === "PODCAST_PRODUCTION" && (
                <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-[#4d6577]">
                  Episode Nest
                  <select
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#26394a]"
                  >
                    {projects.length === 0 && (
                      <option value="">No accessible Nests</option>
                    )}
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => rotate(lane.purpose)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#26394a] px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isActive ? (
                    <RotateCcw size={14} aria-hidden="true" />
                  ) : (
                    <CalendarPlus size={14} aria-hidden="true" />
                  )}
                  {busy === lane.purpose
                    ? "Working…"
                    : isActive
                      ? "Replace private link"
                      : "Create private link"}
                </button>
                {isActive && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => revoke(lane.purpose)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-black text-rose-800 disabled:opacity-50"
                  >
                    <ShieldOff size={14} aria-hidden="true" />
                    Revoke
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {newFeed && (
        <div
          className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
          role="status"
        >
          <p className="text-xs font-black uppercase tracking-wide text-emerald-900">
            Shown once · {newFeed.displayName}
          </p>
          <p className="mt-2 break-all rounded-xl bg-white p-3 font-mono text-xs text-emerald-950">
            {newFeed.subscriptionUrl}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={newFeed.webcalUrl}
              className="inline-flex min-h-11 items-center rounded-full bg-emerald-800 px-4 py-2 text-xs font-black text-white"
            >
              Subscribe in Calendar
            </a>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-2 text-xs font-black text-emerald-900"
            >
              <Clipboard size={14} aria-hidden="true" />
              Copy HTTPS link
            </button>
          </div>
        </div>
      )}
      {message && (
        <p
          className="mt-4 text-xs font-bold leading-relaxed text-[#4d6577]"
          role="status"
        >
          {message}
        </p>
      )}
      <p className="mt-4 text-[11px] font-semibold leading-relaxed text-[#647887]">
        Replacing a link revokes the previous one immediately. Calendar apps
        choose their own refresh timing; Quipsly publishes a one-hour refresh
        hint and records each successful feed render without storing the private
        link.
      </p>
    </section>
  );
}
