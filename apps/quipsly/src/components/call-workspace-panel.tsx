"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** A tool surface, not another call owner. Children stay mounted when closed. */
export function CallWorkspacePanel({ title, open, onClose, inline = false, children }: {
  title: string;
  open: boolean;
  onClose: () => void;
  inline?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || inline) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [inline, open]);

  if (inline) return <>{children}</>;
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
