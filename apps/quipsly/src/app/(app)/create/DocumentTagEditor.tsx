"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, LoaderCircle, Plus, Search, Tags, X } from "lucide-react";

import {
  createAndAssignDocumentTagAction,
  replaceDocumentTagsAction,
} from "./actions";
import type { WorkbenchTagPayload } from "./types";

function requestId() {
  return globalThis.crypto.randomUUID();
}

function sameIds(left: string[], right: string[]) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

export default function DocumentTagEditor({
  documentId,
  projectId,
  projectSlug,
  projectTags,
  initialDocumentTags,
  initialUpdatedAt,
  initialTagRevision,
}: {
  documentId: string;
  projectId: string;
  projectSlug: string;
  projectTags: WorkbenchTagPayload[];
  initialDocumentTags: WorkbenchTagPayload[];
  initialUpdatedAt: string;
  initialTagRevision: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [availableTags, setAvailableTags] = useState(projectTags);
  const [selectedTagIds, setSelectedTagIds] = useState(initialDocumentTags.map((tag) => tag.id));
  const [savedTagIds, setSavedTagIds] = useState(initialDocumentTags.map((tag) => tag.id));
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [tagRevision, setTagRevision] = useState(initialTagRevision);
  const [query, setQuery] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [clientRequestId, setClientRequestId] = useState(requestId);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);
  const selectedTags = useMemo(
    () => availableTags.filter((tag) => selectedSet.has(tag.id)).sort((left, right) => left.label.localeCompare(right.label)),
    [availableTags, selectedSet],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  const filteredTags = useMemo(() => {
    if (!normalizedQuery) return availableTags;
    return availableTags.filter((tag) =>
      [tag.label, tag.slug, tag.category, tag.description]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("en-US").includes(normalizedQuery)),
    );
  }, [availableTags, normalizedQuery]);
  const dirty = !sameIds(selectedTagIds, savedTagIds);

  function toggleTag(tagId: string) {
    setMessage(null);
    setSelectedTagIds((current) => {
      if (current.includes(tagId)) return current.filter((id) => id !== tagId);
      if (current.length >= 24) {
        setMessage({ kind: "error", text: "A document can use up to 24 focused tags." });
        return current;
      }
      return [...current, tagId];
    });
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await replaceDocumentTagsAction({
        documentId,
        tagIds: [...selectedTagIds].sort(),
        expectedUpdatedAt: updatedAt,
        expectedTagRevision: tagRevision,
        clientRequestId,
      });
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setSavedTagIds(result.tagIds);
      setSelectedTagIds(result.tagIds);
      setUpdatedAt(result.updatedAt);
      setTagRevision(result.tagRevision);
      setClientRequestId(requestId());
      setMessage({ kind: "success", text: "Document tags saved everywhere this page appears." });
    });
  }

  function createAndApply() {
    const label = newLabel.trim();
    if (!label) {
      setMessage({ kind: "error", text: "Name the reusable tag first." });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await createAndAssignDocumentTagAction({
        documentId,
        label,
        expectedUpdatedAt: updatedAt,
        expectedTagRevision: tagRevision,
      });
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setAvailableTags((current) => current.some((tag) => tag.id === result.tag.id)
        ? current
        : [...current, result.tag].sort((left, right) => left.label.localeCompare(right.label)));
      setSelectedTagIds((current) => [...new Set([...current, result.tag.id])]);
      setSavedTagIds((current) => [...new Set([...current, result.tag.id])]);
      setUpdatedAt(result.updatedAt);
      setTagRevision(result.tagRevision);
      setNewLabel("");
      setQuery("");
      setMessage({
        kind: "success",
        text: result.created
          ? `Created and applied #${result.tag.label}.`
          : !result.assignmentChanged
            ? `#${result.tag.label} was already applied.`
            : `Applied the existing #${result.tag.label} tag.`,
      });
    });
  }

  return (
    <section
      className="mt-3 rounded-2xl border border-[#dfcfb2] bg-[#fffaf3] p-3"
      aria-labelledby="document-tags-title"
      data-testid="document-tag-editor"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span id="document-tags-title" className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#6f573a]">
              <Tags size={13} aria-hidden="true" />
              Document tags
            </span>
            {selectedTags.length > 0 ? selectedTags.map((tag) => (
              <span
                key={tag.id}
                className="max-w-56 truncate rounded-full border border-[#d8c29a] bg-white px-2.5 py-1 text-[11px] font-bold text-[#5c472e]"
              >
                #{tag.label}
              </span>
            )) : (
              <span className="text-xs text-[#8b765a]">Add context that follows this whole page.</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setExpanded((current) => !current);
            setMessage(null);
          }}
          aria-expanded={expanded}
          className="rounded-full border border-[#c9ad7d] bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#5c472e] transition hover:bg-[#f8edda] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a5a20]"
        >
          {expanded ? "Done" : selectedTags.length ? "Edit tags" : "Add tags"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-3 border-t border-[#eadfca] pt-3">
          <p className="max-w-2xl text-xs leading-5 text-[#6b5b45]">
            These classify the complete document across Library, Search, export, and Capture. Select text inside the editor when you mean a specific passage instead.
          </p>

          {availableTags.length > 8 ? (
            <label className="mt-3 block">
              <span className="sr-only">Search this Nest’s tags</span>
              <span className="flex items-center gap-2 rounded-xl border border-[#d9c7a5] bg-white px-3 py-2 focus-within:border-[#9d7138]">
                <Search size={15} aria-hidden="true" className="text-[#8b765a]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find a tag"
                  className="min-w-0 flex-1 bg-transparent text-sm text-[#3d3122] outline-none placeholder:text-[#a99a84]"
                />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear tag search" className="rounded-full p-1 text-[#806a4d] hover:bg-[#f3e8d4]">
                    <X size={14} aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            </label>
          ) : null}

          <fieldset className="mt-3">
            <legend className="sr-only">Reusable document tags</legend>
            <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto pr-1">
              {filteredTags.map((tag) => {
                const checked = selectedSet.has(tag.id);
                const limitReached = !checked && selectedTagIds.length >= 24;
                return (
                  <label
                    key={tag.id}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition ${
                      checked
                        ? "border-[#72501f] bg-[#3d3122] text-white"
                        : "border-[#d9c7a5] bg-white text-[#5e4b33] hover:bg-[#f8f1e3]"
                    } ${limitReached ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={pending || limitReached}
                      onChange={() => toggleTag(tag.id)}
                      className="sr-only"
                    />
                    {checked ? <Check size={13} aria-hidden="true" /> : null}
                    {tag.label}
                  </label>
                );
              })}
              {filteredTags.length === 0 ? (
                <span className="text-xs text-[#8b765a]">No active tag matches that search.</span>
              ) : null}
            </div>
          </fieldset>

          <div className="mt-4 grid gap-3 border-t border-[#eadfca] pt-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#6f573a]">New reusable tag</span>
              <input
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                maxLength={80}
                placeholder="For example: TestFlight"
                className="mt-1 block w-full rounded-xl border border-[#d9c7a5] bg-white px-3 py-2 text-sm text-[#3d3122] outline-none focus:border-[#9d7138] focus:ring-2 focus:ring-[#ead5ae]"
              />
            </label>
            <button
              type="button"
              onClick={createAndApply}
              disabled={pending || !newLabel.trim()}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#8a622c] bg-white px-4 py-2 text-xs font-black text-[#5c472e] transition hover:bg-[#f8edda] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
              Create and apply
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] leading-5 text-[#806a4d]">
              {selectedTagIds.length}/24 selected · revision {tagRevision}
              {" · "}
              <Link
                href={`/work?manage=tags&project=${encodeURIComponent(projectId)}`}
                className="font-bold underline decoration-dotted underline-offset-2"
              >
                Manage {projectSlug ? "Nest " : ""}vocabulary
              </Link>
            </div>
            <div className="flex items-center gap-2">
              {selectedTagIds.length ? (
                <button
                  type="button"
                  onClick={() => setSelectedTagIds([])}
                  disabled={pending}
                  className="rounded-full px-3 py-2 text-xs font-bold text-[#765d40] hover:bg-[#f3e8d4] disabled:opacity-50"
                >
                  Clear
                </button>
              ) : null}
              <button
                type="button"
                onClick={save}
                disabled={pending || !dirty}
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#3d3122] px-5 py-2 text-xs font-black text-white transition hover:bg-[#59442d] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                Save tags
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${
            message.kind === "error"
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
