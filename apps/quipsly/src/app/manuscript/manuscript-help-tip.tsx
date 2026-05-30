"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn, labelClassName } from "../studio-ui";
import type { ManuscriptHelpNote } from "./manuscript-help-notes";

type ManuscriptHelpTipProps = {
  note: ManuscriptHelpNote;
  className?: string;
};

export function ManuscriptHelpTip({ note, className }: ManuscriptHelpTipProps) {
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);

  function calculatePanelPosition() {
    const button = buttonRef.current;

    if (!button || typeof window === "undefined") {
      return null;
    }

    const rect = button.getBoundingClientRect();
    const viewportPadding = 12;
    const width = Math.min(360, window.innerWidth - viewportPadding * 2);
    const estimatedHeight = Math.min(340, window.innerHeight - viewportPadding * 2);
    const left = Math.min(
      window.innerWidth - width - viewportPadding,
      Math.max(viewportPadding, rect.right - width),
    );
    const belowTop = rect.bottom + 8;
    const aboveTop = rect.top - estimatedHeight - 8;
    const top =
      belowTop + estimatedHeight <= window.innerHeight - viewportPadding
        ? belowTop
        : Math.max(
            viewportPadding,
            aboveTop > viewportPadding
              ? aboveTop
              : window.innerHeight - estimatedHeight - viewportPadding,
          );

    return { left, top, width };
  }

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const updatePosition = () => {
      setPanelPosition(calculatePanelPosition());
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

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
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isOpen) {
            setPanelPosition(calculatePanelPosition());
          }
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
            "fixed z-[80] grid max-h-[calc(100vh-24px)] gap-2 overflow-y-auto rounded-lg border border-studio-source/45 bg-[#101713]/98 p-3 text-left shadow-studio-panel backdrop-blur",
          )}
          id={panelId}
          role="note"
          style={{
            left: panelPosition?.left ?? 12,
            top: panelPosition?.top ?? 12,
            width: panelPosition?.width ?? "min(78vw, 360px)",
          }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
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
