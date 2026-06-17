"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Database, Download, RefreshCw, ShieldCheck } from "lucide-react";

type LocalNestPacketImportProps = {
  projectSlug: string;
  summaryUrl: string;
  canWrite: boolean;
  latestImportedAt?: string | null;
  latestStats?: Array<{ label: string; value: string | number }>;
};

type ImportState = {
  status: "idle" | "loading" | "imported" | "error";
  message: string;
  stats?: Array<{ label: string; value: string | number }>;
};

function numberLabel(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString() : "0";
}

function statsFromPacket(packet: any) {
  const summary = packet?.summary ?? {};
  return [
    { label: "images", value: numberLabel(summary.imageCount) },
    { label: "tied", value: numberLabel(summary.imagesExplicitlyTied) },
    { label: "rows", value: numberLabel(summary.workbookRowsExplicitlyTied) },
    { label: "reviews", value: numberLabel(summary.rowReviewNeededCount) },
  ];
}

export function LocalNestPacketImport({
  projectSlug,
  summaryUrl,
  canWrite,
  latestImportedAt,
  latestStats,
}: LocalNestPacketImportProps) {
  const [state, setState] = useState<ImportState>({
    status: "idle",
    message: latestImportedAt ? `Last imported ${latestImportedAt}` : "No packet imported yet.",
    stats: latestStats?.length ? latestStats : undefined,
  });
  const [isPending, startTransition] = useTransition();
  const importUrl = useMemo(
    () => `/api/nests/${encodeURIComponent(projectSlug)}/visual-research/packet`,
    [projectSlug],
  );
  const busy = isPending || state.status === "loading";

  function previewPacket() {
    startTransition(async () => {
      setState({ status: "loading", message: "Reading local packet..." });
      try {
        const response = await fetch(summaryUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`Local packet read failed (${response.status}).`);
        const packet = await response.json();
        setState({
          status: "idle",
          message: `Local packet ${packet.generatedAt || "ready"}`,
          stats: statsFromPacket(packet),
        });
      } catch (error) {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not read local packet.",
        });
      }
    });
  }

  function importPacket() {
    startTransition(async () => {
      setState({ status: "loading", message: "Importing packet..." });
      try {
        const packetResponse = await fetch(summaryUrl, { cache: "no-store" });
        if (!packetResponse.ok) throw new Error(`Local packet read failed (${packetResponse.status}).`);
        const packet = await packetResponse.json();
        const response = await fetch(importUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(packet),
        });
        const result = await response.json();
        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || `Nest import failed (${response.status}).`);
        }
        setState({
          status: "imported",
          message: `Imported ${result.sourceUnits?.latest?.slug || "latest packet"}`,
          stats: statsFromPacket(packet),
        });
      } catch (error) {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not import packet.",
        });
      }
    });
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-2 text-emerald-900">
          {state.status === "imported" ? <CheckCircle2 size={18} /> : <Database size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-xl font-black text-emerald-950">Nest packet import</h3>
          <p className={`mt-1 text-xs leading-5 ${state.status === "error" ? "text-rose-700" : "text-emerald-950/75"}`}>
            {state.message}
          </p>
          {state.stats?.length ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {state.stats.map((item) => (
                <div key={item.label} className="rounded-xl border border-emerald-100 bg-emerald-50 p-2">
                  <div className="font-serif text-lg font-black text-emerald-950">{item.value}</div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-900/70">{item.label}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={previewPacket}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-950 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50"
        >
          <RefreshCw size={14} />
          Read local
        </button>
        <button
          type="button"
          onClick={importPacket}
          disabled={!canWrite || busy}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-950 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          <ShieldCheck size={14} />
          Import to Nest
        </button>
        <a
          href={summaryUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-950 shadow-sm transition hover:bg-emerald-50"
        >
          <Download size={14} />
          JSON
        </a>
      </div>
    </div>
  );
}
