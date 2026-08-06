"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import type { SessionGuardianProjection } from "@/lib/session-guardian";

export function SessionGuardianCard({ projection }: { projection: SessionGuardianProjection }) {
  const styles = projection.level === "intervene"
    ? "border-rose-300 bg-rose-50 text-rose-950"
    : projection.level === "watch"
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : "border-emerald-300 bg-emerald-50 text-emerald-950";
  const Icon = projection.level === "intervene" ? ShieldAlert : projection.level === "watch" ? AlertTriangle : CheckCircle2;

  return (
    <section className={`rounded-2xl border p-4 ${styles}`} aria-label="Session Guardian">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.18em]">{projection.eyebrow}</p>
          <h3 className="mt-1 font-serif text-xl font-black">{projection.title}</h3>
          <p className="mt-1 text-xs font-semibold leading-5">{projection.detail}</p>
          <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs font-black leading-5">Next: {projection.action}</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide">Why Quipsly says this</summary>
            <dl className="mt-2 grid gap-2 text-[10px] font-bold sm:grid-cols-2 lg:grid-cols-5">
              {projection.evidence.map((row) => <div key={row.lane} className="rounded-lg bg-white/70 px-2.5 py-2"><dt className="uppercase tracking-wide opacity-70">{row.lane}</dt><dd className="mt-1 leading-4">{row.value}</dd></div>)}
            </dl>
            <p className="mt-2 text-[10px] font-bold leading-4 opacity-75">Call meters describe the conversation/reference path. Retained-master claims require the independent local recorder, protected chunks, and exact-byte handoff.</p>
          </details>
        </div>
      </div>
    </section>
  );
}
