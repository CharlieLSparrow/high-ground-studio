"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export default function WritingPageHeader({ title, nestName, nestSlug, personal, saveState, scope, onClearScope,
  exportLabel, onExport, onRecentChanges, children }: {
  title: string; nestName: string; nestSlug: string; personal: boolean;
  saveState: "saved" | "saving" | "unsaved"; scope?: string | null; onClearScope: () => void;
  exportLabel: string; onExport: () => void; onRecentChanges: () => void; children: ReactNode;
}) {
  return <header className="space-y-3" aria-label="Writing page">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#76614a]">
      <nav aria-label="Writing location" className="flex min-w-0 flex-wrap items-center gap-2">
        <Link href="/library" className="inline-flex min-h-11 items-center hover:underline">Notes</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/notebooks/${encodeURIComponent(nestSlug)}`} className="inline-flex min-h-11 items-center break-words hover:underline">{nestName}</Link>
      </nav>
      <span title={personal ? "Only you can open this document" : "Visible to members with access to this Nest"}>
        {personal ? "Only you" : "Nest members"}
      </span>
    </div>
    <h1 className="break-words font-serif text-3xl font-semibold leading-tight text-[#342618] md:text-4xl">{title}</h1>
    <div className="flex flex-wrap items-center gap-2 border-b border-[#e8dcc4] pb-3">
      <span role="status" aria-live="polite" data-testid="document-save-status"
        className={`mr-auto text-sm ${saveState === "unsaved" ? "font-semibold text-[#934120]" : "text-[#53684b]"}`}>
        {saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved edits" : "Saved"}
      </span>
      <button type="button" onClick={onExport} className="min-h-11 rounded-xl border border-[#d8c7ad] px-3 text-sm font-medium text-[#483727] hover:bg-[#f3e9d8]">{exportLabel}</button>
      <button type="button" onClick={onRecentChanges} className="min-h-11 rounded-xl px-3 text-sm text-[#483727] hover:bg-[#f3e9d8]">Recent changes</button>
    </div>
    {scope && <div className="flex flex-wrap items-center gap-3 text-sm text-[#53684b]">
      <span>Showing {scope}</span><button type="button" onClick={onClearScope} className="min-h-11 underline underline-offset-4">Show full document</button>
    </div>}
    <details className="group text-sm text-[#5f4b36]">
      <summary className="min-h-11 cursor-pointer py-3 font-medium">Tags, history & page tools</summary>
      <div className="space-y-3 border-t border-[#e8dcc4] pt-3">{children}</div>
    </details>
  </header>;
}
