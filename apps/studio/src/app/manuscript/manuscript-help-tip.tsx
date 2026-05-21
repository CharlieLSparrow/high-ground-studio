"use client";

import { useId, useState } from "react";

import { cn, labelClassName } from "../studio-ui";
import type { ManuscriptHelpNote } from "./manuscript-help-notes";

type ManuscriptHelpTipProps = {
  note: ManuscriptHelpNote;
  className?: string;
};

export function ManuscriptHelpTip({ note, className }: ManuscriptHelpTipProps) {
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label={`Help: ${note.label}`}
        className={cn(
          "inline-grid size-6 place-items-center rounded-full border border-studio-line bg-black/30",
          "text-[0.72rem] font-black leading-none text-studio-source transition",
          "hover:border-studio-source/70 hover:bg-studio-source/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-source",
          isOpen && "border-studio-source/70 bg-studio-source/10",
        )}
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
          }
        }}
      >
        ?
      </button>
      {isOpen ? (
        <span
          className={cn(
            "absolute right-0 top-8 z-50 grid w-[min(78vw,360px)] gap-2 rounded-lg border border-studio-source/45 bg-[#101713] p-3 text-left shadow-studio-panel",
          )}
          id={panelId}
          role="note"
          onClick={(event) => event.stopPropagation()}
        >
          <span className={labelClassName}>Footnote: {note.label}</span>
          <strong className="text-[0.92rem] leading-snug text-studio-ink">
            {note.title}
          </strong>
          <span className="text-[0.8rem] leading-relaxed text-studio-muted">
            {note.body}
          </span>
          {note.whatItDoes ? (
            <span className="text-[0.76rem] leading-relaxed text-studio-muted">
              <strong className="text-studio-source">Does:</strong>{" "}
              {note.whatItDoes}
            </span>
          ) : null}
          {note.whatItDoesNot ? (
            <span className="text-[0.76rem] leading-relaxed text-studio-muted">
              <strong className="text-studio-review">Does not:</strong>{" "}
              {note.whatItDoesNot}
            </span>
          ) : null}
          {note.whenToUse ? (
            <span className="text-[0.76rem] leading-relaxed text-studio-muted">
              <strong className="text-studio-tag">Use when:</strong>{" "}
              {note.whenToUse}
            </span>
          ) : null}
          <button
            className="justify-self-start rounded-lg border border-studio-line bg-studio-ink/5 px-2 py-1 text-[0.72rem] font-extrabold text-studio-muted"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsOpen(false);
            }}
          >
            Close footnote
          </button>
        </span>
      ) : null}
    </span>
  );
}
