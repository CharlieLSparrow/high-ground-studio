"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

/** A tool surface, not another call owner. Children stay mounted when closed. */
export function CallWorkspacePanel({ title, open, onClose, inline = false, container = null, children }: {
  title: string;
  open: boolean;
  onClose: () => void;
  inline?: boolean;
  container?: HTMLElement | null;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || inline || container) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [inline, open, container]);

  useEffect(() => {
    if (!container || inline) return;
    if (open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      closeRef.current?.focus();
    } else if (panelRef.current?.contains(document.activeElement)) {
      returnFocus.current?.focus();
    }
  }, [container, inline, open]);

  if (inline) return <>{children}</>;
  if (container) return createPortal(
    <section ref={panelRef} hidden={!open} aria-labelledby={headingId}
      className="h-full min-h-0 flex-col bg-background text-foreground [&:not([hidden])]:flex"
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3">
        <h2 id={headingId} className="text-lg font-semibold">{title}</h2>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}
          className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><X size={20} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
    </section>, container);
  return (
    <dialog ref={ref} aria-labelledby={headingId}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onClose={() => { if (open) onClose(); }}
      onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-lg border-l border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/35"
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-3">
          <h2 id={headingId} className="text-lg font-semibold">{title}</h2>
          <button type="button" autoFocus onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}
            className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><X size={20} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      </div>
    </dialog>
  );
}
