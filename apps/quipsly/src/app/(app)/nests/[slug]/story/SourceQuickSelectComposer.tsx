"use client";

import { Clapperboard, Loader2, Save } from "lucide-react";
import type { ReactNode } from "react";

type QuickSelectBoard = {
  id: string;
  title: string;
  revision: number;
};

function formatClock(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "--:--.--";
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const remainder = clamped % 60;
  const body = `${String(minutes).padStart(2, "0")}:${remainder.toFixed(2).padStart(5, "0")}`;
  return hours ? `${hours}:${body}` : body;
}

export function SourceQuickSelectComposer({
  canWrite,
  sourceLabel,
  inPoint,
  outPoint,
  title,
  notes,
  selectedBoardId,
  boards,
  pending,
  canSave,
  onTitleChange,
  onNotesChange,
  onBoardChange,
  onSave,
  children,
}: {
  canWrite: boolean;
  sourceLabel: string | null;
  inPoint: number | null;
  outPoint: number | null;
  title: string;
  notes: string;
  selectedBoardId: string | null;
  boards: QuickSelectBoard[];
  pending: boolean;
  canSave: boolean;
  onTitleChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onBoardChange: (boardId: string | null) => void;
  onSave: () => void;
  children?: ReactNode;
}) {
  const validRange =
    inPoint !== null && outPoint !== null && outPoint > inPoint;
  const selectedBoard =
    boards.find((board) => board.id === selectedBoardId) ?? null;

  return (
    <section
      className="rounded-3xl border border-[#c8a978] bg-white p-4 shadow-md md:p-5"
      aria-labelledby="quick-select-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">
            <Clapperboard size={16} aria-hidden="true" />
            Quick select
          </p>
          <h2
            id="quick-select-heading"
            className="mt-1 font-serif text-2xl font-black"
          >
            Keep this moment
          </h2>
          <p className="mt-1 max-w-xl text-xs font-semibold leading-5 text-[#765f40]">
            Name the range and save it now. Story structure, tags, and camera
            direction can be added here or refined later without changing the
            original source.
          </p>
        </div>
        <div
          className={`rounded-2xl border px-3 py-2 text-right ${
            validRange
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
          aria-label="Current source selection"
        >
          <p className="text-[9px] font-black uppercase tracking-wide">
            {validRange ? "Exact retained range" : "Range needed"}
          </p>
          <p className="mt-1 font-mono text-xs font-black">
            {validRange
              ? `${formatClock(inPoint)} – ${formatClock(outPoint)}`
              : "Mark In and Out above"}
          </p>
          {validRange ? (
            <p className="mt-0.5 text-[9px] font-bold">
              {(outPoint - inPoint).toFixed(2)} seconds
            </p>
          ) : null}
        </div>
      </div>

      {!canWrite ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
          Viewer access preserves playback and board reading. An Owner or Editor
          can create or revise selects.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          <label>
            <span className="text-xs font-black uppercase tracking-wide text-[#76522c]">
              What happens here?
            </span>
            <input
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              maxLength={200}
              placeholder="A useful, recognizable moment"
              autoComplete="off"
              className="mt-1 min-h-12 w-full rounded-xl border border-[#cdb993] px-3 text-base font-bold outline-none focus-visible:ring-4 focus-visible:ring-sky-100"
            />
          </label>

          <label>
            <span className="text-xs font-black uppercase tracking-wide text-[#76522c]">
              Quick note{" "}
              <span className="font-semibold normal-case">(optional)</span>
            </span>
            <textarea
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              maxLength={50000}
              rows={2}
              placeholder="Why it matters, an edit idea, a quote, or what to check later…"
              className="mt-1 w-full rounded-xl border border-[#d9c7a5] p-3 text-sm font-semibold leading-6 outline-none focus-visible:ring-4 focus-visible:ring-sky-100"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label>
              <span className="text-xs font-black uppercase tracking-wide text-[#76522c]">
                Save to
              </span>
              <select
                value={selectedBoardId ?? ""}
                onChange={(event) => onBoardChange(event.target.value || null)}
                className="mt-1 min-h-12 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm font-bold"
              >
                <option value="">Unfiled selects</option>
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.title} · r{board.revision}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!canSave || pending}
              onClick={onSave}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#3e2f21] px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {pending ? (
                <Loader2
                  className="animate-spin"
                  size={18}
                  aria-hidden="true"
                />
              ) : (
                <Save size={18} aria-hidden="true" />
              )}
              {selectedBoard ? `Save to ${selectedBoard.title}` : "Save select"}
            </button>
          </div>

          {!sourceLabel ? (
            <p className="text-xs font-bold text-amber-900">
              Choose a playable source before saving.
            </p>
          ) : !validRange ? (
            <p className="text-xs font-bold text-amber-900">
              Mark an exact In and Out point before saving this select.
            </p>
          ) : !title.trim() ? (
            <p className="text-xs font-bold text-amber-900">
              Give this moment a short title so collaborators can find it again.
            </p>
          ) : null}

          {children ? (
            <details className="rounded-2xl border border-[#dfd0b7] bg-[#fffaf0] px-4 py-2">
              <summary className="cursor-pointer min-h-11 py-3 text-xs font-black uppercase tracking-wide text-[#76522c]">
                Add story details, tags, and camera direction
              </summary>
              <div className="grid gap-4 pb-3 pt-2">{children}</div>
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}
