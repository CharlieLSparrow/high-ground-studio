"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDotDashed, Plus, XCircle } from "lucide-react";

type EpisodeChoice = {
  id: string;
  title: string;
  projectName: string;
};

const MILESTONE_KINDS = [
  ["RESEARCH_LOCK", "Research locked"],
  ["RUN_OF_SHOW_READY", "Run of show ready"],
  ["TECH_CHECK", "Tech check"],
  ["RECORDING", "Recording"],
  ["SOURCE_UPLOAD_VERIFIED", "Source upload verified"],
  ["TRANSCRIPT_REVIEW", "Transcript review"],
  ["ROUGH_CUT", "Rough cut"],
  ["EDITORIAL_REVIEW", "Editorial review"],
  ["FINAL_APPROVAL", "Final approval"],
  ["SCHEDULED_PUBLICATION", "Scheduled publication"],
  ["RELEASE", "Release"],
  ["CLIPS_WINDOW", "Clips window"],
  ["FOLLOW_UP", "Follow-up"],
  ["CUSTOM", "Custom"],
] as const;

function localInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultStart() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return localInput(date);
}

function newRequestId() {
  return globalThis.crypto.randomUUID();
}

export function ProductionMilestonePlanner({ episodes }: { episodes: EpisodeChoice[] }) {
  const router = useRouter();
  const [episodeId, setEpisodeId] = useState(episodes[0]?.id ?? "");
  const [kind, setKind] = useState("RECORDING");
  const [title, setTitle] = useState("Recording session");
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [reservesTime, setReservesTime] = useState(false);
  const [endsAt, setEndsAt] = useState(() => {
    const end = new Date(`${defaultStart()}:00`);
    end.setHours(end.getHours() + 1);
    return localInput(end);
  });
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!episodeId || !title.trim() || !startsAt) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/calendar/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeProductionId: episodeId,
          requestId,
          kind,
          title: title.trim(),
          startsAt: new Date(startsAt).toISOString(),
          endsAt: reservesTime ? new Date(endsAt).toISOString() : null,
          timezone,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The production milestone could not be saved.");
      setMessage(body.result.idempotentReplay
        ? "That exact milestone was already saved. Nothing was duplicated."
        : "Milestone saved to the episode runway. No external calendar was changed.");
      setRequestId(newRequestId());
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The production milestone could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (episodes.length === 0) {
    return (
      <div className="mb-5 rounded-2xl border border-dashed border-violet-300 bg-violet-50/50 p-4 text-sm font-semibold text-violet-900">
        Create an episode from a writable Nest before adding production dates. Calendar will never invent an episode or milestone for you.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mb-5 rounded-2xl border border-violet-200 bg-violet-50/55 p-4" aria-label="Add production milestone">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">Add agreed production truth</p>
          <h3 className="mt-1 text-lg font-black text-[#3d3122]">Put the next episode handoff on the runway</h3>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wide text-violet-700">Quipsly only until you preview a projection</span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <label className="text-[10px] font-black uppercase tracking-wide text-[#6f5a3e]">Episode
          <select value={episodeId} onChange={(event) => setEpisodeId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#3d3122]">
            {episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.projectName} · {episode.title}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-black uppercase tracking-wide text-[#6f5a3e]">Milestone type
          <select value={kind} onChange={(event) => setKind(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#3d3122]">
            {MILESTONE_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-black uppercase tracking-wide text-[#6f5a3e]">Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#3d3122]" />
        </label>
        <label className="text-[10px] font-black uppercase tracking-wide text-[#6f5a3e]">Starts
          <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#3d3122]" />
        </label>
      </div>
      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
        <label className="inline-flex min-h-11 items-center gap-2 text-xs font-black text-[#5f4b32]">
          <input type="checkbox" checked={reservesTime} onChange={(event) => setReservesTime(event.target.checked)} className="h-4 w-4 accent-violet-700" />
          Reserve an explicit time window
        </label>
        {reservesTime ? (
          <label className="text-[10px] font-black uppercase tracking-wide text-[#6f5a3e]">Ends
            <input type="datetime-local" value={endsAt} min={startsAt} onChange={(event) => setEndsAt(event.target.value)} required className="mt-1 min-h-11 rounded-xl border border-violet-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-[#3d3122]" />
          </label>
        ) : <p className="min-h-11 py-3 text-xs font-semibold text-[#80694a]">Point milestone · visible on calendars, but transparent to availability.</p>}
        <button type="submit" disabled={busy || !episodeId || !title.trim() || !startsAt || (reservesTime && !endsAt)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-violet-800 px-5 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
          <Plus size={15} aria-hidden="true" />{busy ? "Saving milestone…" : "Add milestone"}
        </button>
      </div>
      <p className="mt-3 text-xs font-semibold text-[#80694a]">Timezone: {timezone}. Adding this record does not contact Google, Apple, Outlook, or invite anyone.</p>
      {message ? <p role="status" className="mt-3 rounded-xl bg-white p-3 text-xs font-bold text-[#5f4b32]">{message}</p> : null}
    </form>
  );
}

export function ProductionMilestoneLifecycle({
  id,
  revision,
  status,
}: {
  id: string;
  revision: number;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function change(nextStatus: "IN_PROGRESS" | "COMPLETED" | "CANCELED") {
    if (nextStatus === "CANCELED" && !window.confirm("Cancel this canonical Quipsly milestone? A projected Google event, if any, will remain until someone previews and explicitly confirms its removal.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/calendar/milestones/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: revision, status: nextStatus }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The milestone could not be revised.");
      setMessage(nextStatus === "CANCELED"
        ? "Milestone canceled in Quipsly. External removal still requires its own preview and confirmation."
        : "Milestone status saved with a revision receipt.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The milestone could not be revised.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "CANCELED" || status === "COMPLETED") return null;
  return (
    <div className="mt-3 border-t border-violet-100 pt-3">
      <div className="flex flex-wrap gap-2">
        {status === "PLANNED" ? <button type="button" disabled={busy} onClick={() => change("IN_PROGRESS")} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-violet-200 px-3 py-2 text-[11px] font-black text-violet-800 disabled:opacity-50"><CircleDotDashed size={14} aria-hidden="true" />Start</button> : null}
        <button type="button" disabled={busy} onClick={() => change("COMPLETED")} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-emerald-200 px-3 py-2 text-[11px] font-black text-emerald-800 disabled:opacity-50"><CheckCircle2 size={14} aria-hidden="true" />Complete</button>
        <button type="button" disabled={busy} onClick={() => change("CANCELED")} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-rose-200 px-3 py-2 text-[11px] font-black text-rose-800 disabled:opacity-50"><XCircle size={14} aria-hidden="true" />Cancel</button>
      </div>
      {message ? <p role="status" className="mt-2 text-xs font-bold text-[#6f5a3e]">{message}</p> : null}
    </div>
  );
}
