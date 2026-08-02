"use client";

import Link from "next/link";
import { BookCopy, CheckCircle2, Film, LockKeyhole, Plus, Users } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

export type EpisodeRoomDirectoryEpisode = {
  id: string;
  slug: string;
  title: string;
  status: string;
  documentTitle: string;
  updatedAt: string;
  milestoneCount: number;
  completedMilestoneCount: number;
  sourceDocumentTitle: string | null;
  sourceBlockCount: number | null;
};

export type EpisodeRoomSourceCandidate = {
  id: string;
  projectSlug: string;
  title: string;
  suggestedTitle: string;
  suggestedSlug: string;
  episodeNumber: number | null;
  blockCount: number;
  updatedAt: string;
  existingEpisodeSlug: string | null;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date needs review";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function EpisodeRoomDirectory({
  projectSlug,
  episodes,
  sourceCandidates,
  canManage,
  collaboratorCount,
}: {
  projectSlug: string;
  episodes: EpisodeRoomDirectoryEpisode[];
  sourceCandidates: EpisodeRoomSourceCandidate[];
  canManage: boolean;
  collaboratorCount: number;
}) {
  const availableSources = useMemo(
    () => sourceCandidates.filter((candidate) => !candidate.existingEpisodeSlug),
    [sourceCandidates],
  );
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState(availableSources[0]?.id ?? "");
  const selected = sourceCandidates.find((candidate) => candidate.id === sourceId) ?? null;
  const [title, setTitle] = useState(selected?.suggestedTitle ?? "");
  const [slug, setSlug] = useState(selected?.suggestedSlug ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function chooseSource(nextId: string) {
    const next = sourceCandidates.find((candidate) => candidate.id === nextId) ?? null;
    setSourceId(nextId);
    setTitle(next?.suggestedTitle ?? "");
    setSlug(next?.suggestedSlug ?? "");
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/nests/${encodeURIComponent(projectSlug)}/episode-rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceProjectSlug: selected.projectSlug,
          sourceDocumentId: selected.id,
          title,
          episodeSlug: slug,
          clientRequestId: crypto.randomUUID(),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok || !body?.episode?.slug) {
        throw new Error(body?.error || "The Episode Room could not be created safely.");
      }
      window.location.assign(`/nests/${encodeURIComponent(projectSlug)}/episodes/${encodeURIComponent(body.episode.slug)}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The Episode Room could not be created safely.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="episode-room-directory-heading" className="rounded-3xl border border-orange-200 bg-[linear-gradient(145deg,#fffaf0,#fff)] p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-800">Production home</p>
          <h2 id="episode-room-directory-heading" className="mt-1 font-serif text-3xl font-black">Episode Rooms</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">Every episode keeps its own working manuscript, shared clips, recording truth, timeline, chat, and production runway. Source imports are private snapshots with immutable provenance—not silent edits to the archive.</p>
        </div>
        {canManage && availableSources.length ? (
          <button type="button" onClick={() => setOpen((current) => !current)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[#3e2f21] px-5 text-xs font-black text-white">
            <Plus size={15} aria-hidden="true" /> {open ? "Close" : "Start Episode Room"}
          </button>
        ) : null}
      </div>

      {open && canManage ? (
        <form onSubmit={submit} className="mt-5 rounded-2xl border border-orange-200 bg-white p-4 md:p-5">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950">
            <LockKeyhole className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
            <p>This deliberately copies one private manuscript snapshot into this Nest. Everyone with active access to this Nest can read the working copy. The access panel currently lists {collaboratorCount} active {collaboratorCount === 1 ? "grant" : "grants"}; the archive remains unchanged.</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-xs font-black text-[#5f4b32] md:col-span-2">
              Source manuscript
              <select value={sourceId} onChange={(event) => chooseSource(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm">
                {availableSources.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.title} · {candidate.blockCount} blocks</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-black text-[#5f4b32]">
              Episode title
              <input required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm" />
            </label>
            <label className="text-xs font-black text-[#5f4b32]">
              Stable URL slug
              <input required maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm" />
            </label>
          </div>
          {selected ? <p className="mt-3 text-xs font-semibold text-[#806a4d]">Snapshot source: {selected.title} · updated {formatDate(selected.updatedAt)} · {selected.blockCount} active blocks</p> : null}
          {error ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-900">{error}</p> : null}
          <button disabled={busy || !selected} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-orange-700 px-5 text-xs font-black text-white disabled:opacity-50">
            <BookCopy size={15} aria-hidden="true" /> {busy ? "Creating…" : "Create private working room"}
          </button>
        </form>
      ) : null}

      {episodes.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {episodes.map((episode) => (
            <Link key={episode.id} href={`/nests/${encodeURIComponent(projectSlug)}/episodes/${encodeURIComponent(episode.slug)}`} className="group rounded-2xl border border-orange-200 bg-white p-5 outline-none transition hover:-translate-y-0.5 hover:border-orange-400 hover:shadow-md focus-visible:ring-4 focus-visible:ring-orange-100">
              <div className="flex items-start justify-between gap-3">
                <Film size={18} className="shrink-0 text-orange-800" aria-hidden="true" />
                <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[9px] font-black uppercase text-orange-900">{episode.status}</span>
              </div>
              <h3 className="mt-3 font-serif text-xl font-black">{episode.title}</h3>
              <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-[#806a4d]">{episode.sourceDocumentTitle || episode.documentTitle}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide text-[#8a653d]">
                <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} aria-hidden="true" />{episode.completedMilestoneCount}/{episode.milestoneCount} milestones</span>
                {episode.sourceBlockCount !== null ? <span>· {episode.sourceBlockCount} source blocks</span> : null}
              </div>
              <p className="mt-3 text-[10px] font-bold text-[#9a835f]">Updated {formatDate(episode.updatedAt)}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-orange-300 bg-white p-5">
          <h3 className="font-serif text-xl font-black">No Episode Rooms yet.</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">An owner can start the first room from an accessible manuscript. Quipsly will preserve the exact source snapshot and target audience boundary.</p>
        </div>
      )}

      {!canManage && availableSources.length ? <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#806a4d]"><Users size={14} aria-hidden="true" />A Nest owner creates new rooms because importing a manuscript changes who can read that snapshot.</p> : null}
    </section>
  );
}
