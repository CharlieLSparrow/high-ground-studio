"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, FileText, ListTodo, Search, Tags, Target } from "lucide-react";

import { createNestQuickNoteAction, createNestQuickWorkAction } from "./actions";

type CaptureKind = "NOTE" | "TASK" | "GOAL";

const captureKinds: Array<{
  kind: CaptureKind;
  label: string;
  icon: typeof FileText;
  help: string;
}> = [
  { kind: "NOTE", label: "Note", icon: FileText, help: "A private writing note inside this project." },
  { kind: "TASK", label: "Task", icon: ListTodo, help: "One committed action, assigned to you." },
  { kind: "GOAL", label: "Goal", icon: Target, help: "An outcome this project should move toward." },
];

function newRequestId() {
  return globalThis.crypto.randomUUID();
}

export function NestQuickCapture({
  projectId,
  projectSlug,
  projectName,
  tags,
}: {
  projectId: string;
  projectSlug: string;
  projectName: string;
  tags: Array<{ id: string; label: string; slug: string; category: string }>;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<CaptureKind>("NOTE");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [newTagLabel, setNewTagLabel] = useState("");
  const [clientRequestId, setClientRequestId] = useState(newRequestId);
  const [message, setMessage] = useState<React.ReactNode>(null);
  const [pending, startTransition] = useTransition();

  function resetCapture() {
    setTitle("");
    setBody("");
    setSelectedTagIds([]);
    setTagQuery("");
    setNewTagLabel("");
    setClientRequestId(newRequestId());
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      if (kind === "NOTE") {
        const result = await createNestQuickNoteAction({
          projectSlug,
          title,
          body,
          clientRequestId,
          tagIds: selectedTagIds,
          newTagLabels: newTagLabel.trim() ? [newTagLabel] : [],
        });
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        resetCapture();
        router.push(result.href);
        return;
      }

      const result = await createNestQuickWorkAction({
        entityKind: kind,
        projectSlug,
        title,
        body,
        clientRequestId,
        tagIds: selectedTagIds,
        newTagLabels: newTagLabel.trim() ? [newTagLabel] : [],
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      resetCapture();
      setMessage(
        <span>
          {kind === "TASK" ? "Task" : "Goal"} saved in {projectName}
          {result.tags.length > 0 ? ` with ${result.tags.map((tag) => `#${tag.label}`).join(", ")}` : ""}.{" "}
          <Link className="underline" href={result.href}>
            Open it
          </Link>
        </span>,
      );
      router.refresh();
    });
  }

  const selected = captureKinds.find((option) => option.kind === kind) ?? captureKinds[0];
  const needsBody = kind === "NOTE";
  const normalizedTagQuery = tagQuery.trim().toLocaleLowerCase("en-US");
  const filteredTags = useMemo(() => {
    if (!normalizedTagQuery) return tags;
    return tags.filter((tag) => [tag.label, tag.slug, tag.category]
      .some((value) => value.toLocaleLowerCase("en-US").includes(normalizedTagQuery)));
  }, [normalizedTagQuery, tags]);
  const selectedTagSet = new Set(selectedTagIds);

  function toggleTag(tagId: string) {
    setSelectedTagIds((current) => current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : current.length < 24 ? [...current, tagId] : current);
  }

  return (
    <section
      aria-labelledby="project-capture-heading"
      className="rounded-3xl border border-[#d9c7a5] bg-white p-5 shadow-sm md:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8a653d]">
            Capture into this project
          </p>
          <h2 id="project-capture-heading" className="mt-1 font-serif text-3xl font-black text-[#3d3122]">
            What just came up?
          </h2>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-900">
          Saved to {projectName}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2" role="tablist" aria-label="Project capture type">
        {captureKinds.map((option) => {
          const Icon = option.icon;
          const active = option.kind === kind;
          return (
            <button
              key={option.kind}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setKind(option.kind);
                setMessage(null);
              }}
              className={`min-h-12 rounded-2xl border px-3 py-2 text-xs font-black transition ${
                active
                  ? "border-[#3e2f21] bg-[#3e2f21] text-white"
                  : "border-[#e4d3b3] bg-[#fffaf0] text-[#684f32] hover:border-[#b99a68]"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Icon size={16} aria-hidden="true" />
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

      <form onSubmit={submit} className="mt-4">
        <p className="text-xs font-semibold leading-5 text-[#765f40]">{selected.help}</p>
        <label className="mt-4 block text-[10px] font-black uppercase tracking-wide text-[#765f40]">
          {kind === "NOTE" ? "Note title" : kind === "TASK" ? "Action" : "Outcome"}
          <input
            autoFocus
            required
            maxLength={kind === "NOTE" ? 160 : 500}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={
              kind === "NOTE"
                ? "A thought worth keeping"
                : kind === "TASK"
                  ? "The next concrete action"
                  : "What should be meaningfully different?"
            }
            className="mt-1 min-h-12 w-full rounded-xl border-2 border-[#dfcba6] bg-white px-4 text-base font-semibold normal-case tracking-normal text-[#3d3122] outline-none focus:border-sky-600 focus:ring-4 focus:ring-sky-100"
          />
        </label>
        <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-[#765f40]">
          {kind === "NOTE" ? "Note" : kind === "TASK" ? "Useful detail · optional" : "Definition of success · optional"}
          <textarea
            required={needsBody}
            maxLength={kind === "NOTE" ? 12_000 : 5_000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={
              kind === "NOTE"
                ? "Write the thought before it disappears…"
                : kind === "TASK"
                  ? "Context, constraint, or source to return to"
                  : "Measure, evidence, or reason this matters"
            }
            className="mt-1 min-h-24 w-full resize-y rounded-xl border-2 border-[#dfcba6] bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#3d3122] outline-none focus:border-sky-600 focus:ring-4 focus:ring-sky-100"
          />
        </label>
        <fieldset className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/45 p-4">
          <legend className="px-1 text-[10px] font-black uppercase tracking-[0.16em] text-sky-900">
            <span className="inline-flex items-center gap-1.5"><Tags size={14} aria-hidden="true" />Tag it now · optional</span>
          </legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-2xl text-xs font-semibold leading-5 text-sky-950">
              Reuse {projectName}&apos;s canonical vocabulary while the context is still fresh. These same tags navigate Work, Search, Calendar, writing, and iPhone Capture.
            </p>
            <Link
              href={`/work?manage=tags&project=${encodeURIComponent(projectId)}`}
              className="inline-flex min-h-11 shrink-0 items-center text-[10px] font-black uppercase tracking-wide text-sky-900 underline"
            >
              Manage vocabulary
            </Link>
          </div>
          {tags.length > 8 ? (
            <label className="relative mt-3 block">
              <span className="sr-only">Find a project tag</span>
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-sky-700" aria-hidden="true" />
              <input
                type="search"
                value={tagQuery}
                onChange={(event) => setTagQuery(event.target.value)}
                placeholder="Find a tag"
                className="min-h-11 w-full rounded-xl border border-sky-200 bg-white pl-10 pr-3 text-sm font-semibold normal-case tracking-normal text-sky-950 outline-none focus:border-sky-600 focus:ring-4 focus:ring-sky-100"
              />
            </label>
          ) : null}
          {filteredTags.length > 0 ? (
            <div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto pr-1">
              {filteredTags.map((tag) => {
                const checked = selectedTagSet.has(tag.id);
                const selectionLimitReached = !checked && selectedTagIds.length >= 24;
                return (
                  <label
                    key={tag.id}
                    className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${
                      checked
                        ? "border-sky-800 bg-sky-800 text-white"
                        : "border-sky-200 bg-white text-sky-950"
                    } ${selectionLimitReached ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={selectionLimitReached}
                      onChange={() => toggleTag(tag.id)}
                      className="h-4 w-4"
                    />
                    #{tag.label}
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-xs font-semibold text-sky-900">
              {tags.length > 0 ? "No active tag matches that search." : "This Nest has no active tags yet. Name the first reusable tag below."}
            </p>
          )}
          <div className="mt-4 border-t border-sky-200 pt-4">
            <label className="block text-[10px] font-black uppercase tracking-wide text-sky-900">
              New reusable tag
              <input
                value={newTagLabel}
                onChange={(event) => setNewTagLabel(event.target.value)}
                maxLength={80}
                placeholder="Only when the existing vocabulary does not fit"
                className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-sky-950 outline-none focus:border-sky-600 focus:ring-4 focus:ring-sky-100"
              />
            </label>
            <p className="mt-2 text-[11px] font-semibold leading-5 text-sky-800">
              Exact and former-name matches reuse the canonical tag. Ambiguous or archived names fail closed; nothing merges silently.
              {selectedTagIds.length > 0 ? ` ${selectedTagIds.length} existing tag${selectedTagIds.length === 1 ? "" : "s"} selected.` : ""}
            </p>
          </div>
        </fieldset>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-[11px] font-semibold leading-5 text-[#806a4d]">
            This creates one canonical private record and applies the selected reusable tags atomically. Dates, reminders, recurrence, and links stay editable on the record; nothing is sent, scheduled, or published.
          </p>
          <button
            type="submit"
            disabled={pending || !title.trim() || (needsBody && !body.trim())}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#3e2f21] px-5 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"
          >
            <CheckCircle2 size={17} aria-hidden="true" />
            {pending ? "Saving…" : `Save ${kind.toLowerCase()}`}
          </button>
        </div>
        {message ? (
          <p role="status" className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-950">
            {message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
