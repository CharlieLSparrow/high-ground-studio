"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Activity,
  AlertOctagon,
  BarChart2,
  ChevronRight,
  Clock3,
  Database,
  Filter,
  MailOpen,
  MousePointerClick,
  Search,
  Send,
  ShieldCheck,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";

export type AnalyticsEvent = {
  id: string;
  eventName: string;
  createdAt: string;
  actor: string;
  payload: unknown;
};

export type AnalyticsSnapshot = {
  organization: { id: string; name: string; slug: string; role: string };
  funnel: { views: number; conversions: number; leads: number };
  campaigns: { dispatched: number; opened: number; clicked: number; bounced: number };
  events: {
    total: number;
    recent: AnalyticsEvent[];
    breakdown: Array<{ eventName: string; count: number }>;
  };
  canInspectRetention: boolean;
  dataBoundaries: {
    persistedOnly: true;
    readOnly: true;
    recentEventLimit: number;
    retentionTenantScoped: boolean;
  };
};

type RetentionPoint = { segmentIndex: number; timestamp: number; retentionRate: number };
type RetentionResult = {
  state: "idle" | "loading" | "ready" | "empty" | "error";
  videoId?: string;
  points?: RetentionPoint[];
  alert?: { message: string; segmentIndex: number; dropPercentagePoints: number } | null;
  message?: string;
};

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : "—";
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function payloadText(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Payload could not be rendered.";
  }
}

export function AnalyticsClientView({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const [activeTab, setActiveTab] = useState<"workspace" | "retention">("workspace");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [videoId, setVideoId] = useState("");
  const [retention, setRetention] = useState<RetentionResult>({ state: "idle" });

  const highestRetention = useMemo(
    () => Math.max(1, ...(retention.points ?? []).map((point) => point.retentionRate)),
    [retention.points],
  );

  async function inspectRetention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const exactVideoId = videoId.trim();
    if (!exactVideoId) {
      setRetention({ state: "error", message: "Enter the exact persisted video ID." });
      return;
    }
    setRetention({ state: "loading", videoId: exactVideoId });
    try {
      const response = await fetch(`/api/telemetry?videoId=${encodeURIComponent(exactVideoId)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        setRetention({ state: "error", videoId: exactVideoId, message: payload.error || "Retention telemetry could not be read." });
        return;
      }
      const points = Array.isArray(payload.data) ? payload.data : [];
      setRetention({
        state: points.length ? "ready" : "empty",
        videoId: exactVideoId,
        points,
        alert: payload.alert ?? null,
        message: payload.nextAction,
      });
    } catch {
      setRetention({
        state: "error",
        videoId: exactVideoId,
        message: "Quipsly could not reach the persisted telemetry reader. No sample chart was substituted.",
      });
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-8 text-studio-ink md:px-6">
      <header className="flex flex-col justify-between gap-4 border-b border-studio-line pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-studio-tag">
            <Database size={13} /> Persisted workspace receipts
          </div>
          <h1 className="mt-2 text-3xl font-black">{snapshot.organization.name} analytics</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-studio-muted">
            Real records only. Missing persistence stays missing; Quipsly does not create a workspace or substitute demo metrics when this page opens.
          </p>
        </div>
        <div className="rounded-xl border border-studio-line bg-[#032321] px-4 py-3 text-xs text-studio-muted">
          <span className="font-black text-studio-ink">{snapshot.organization.role}</span> · {snapshot.organization.slug}
        </div>
      </header>

      <div className="flex w-fit items-center gap-1 rounded-xl border border-studio-line bg-[#032321] p-1 text-xs font-bold">
        <button onClick={() => setActiveTab("workspace")} className={`rounded-lg px-4 py-2 ${activeTab === "workspace" ? "bg-studio-tag text-[#032321]" : "text-studio-muted"}`}>
          <BarChart2 className="mr-1 inline" size={14} /> Workspace receipts
        </button>
        <button onClick={() => setActiveTab("retention")} className={`rounded-lg px-4 py-2 ${activeTab === "retention" ? "bg-studio-tag text-[#032321]" : "text-studio-muted"}`}>
          <Video className="mr-1 inline" size={14} /> Retention inspector
        </button>
      </div>

      {activeTab === "workspace" ? (
        <div className="flex flex-col gap-6">
          <section className="grid gap-4 md:grid-cols-4" aria-label="Workspace metrics">
            {[
              { label: "Marketing leads", value: snapshot.funnel.leads, detail: "Persisted lead records", icon: Users },
              { label: "Funnel conversion", value: rate(snapshot.funnel.conversions, snapshot.funnel.views), detail: `${snapshot.funnel.conversions} conversions from ${snapshot.funnel.views} views`, icon: TrendingUp },
              { label: "Campaign dispatches", value: snapshot.campaigns.dispatched, detail: "Dispatch event receipts", icon: Send },
              { label: "Workspace events", value: snapshot.events.total, detail: `Showing ${snapshot.events.recent.length} most recent`, icon: Activity },
            ].map((metric) => {
              const Icon = metric.icon;
              return (
                <article key={metric.label} className="rounded-2xl border border-studio-line bg-[#032321]/80 p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-studio-dim"><Icon size={13} className="text-studio-tag" />{metric.label}</div>
                  <div className="mt-3 text-3xl font-black">{metric.value}</div>
                  <p className="mt-1 text-xs text-studio-muted">{metric.detail}</p>
                </article>
              );
            })}
          </section>

          <section className="rounded-2xl border border-studio-line bg-[#032321]/90 p-6 shadow-studio-panel">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-studio-dim"><Send size={16} className="text-studio-tag" /> Campaign event receipts</h2>
            <div className="mt-5 grid gap-4 text-center sm:grid-cols-4">
              {[
                { label: "Dispatched", value: snapshot.campaigns.dispatched, detail: "events", icon: Send },
                { label: "Opened", value: rate(snapshot.campaigns.opened, snapshot.campaigns.dispatched), detail: `${snapshot.campaigns.opened} receipts`, icon: MailOpen },
                { label: "Clicked", value: rate(snapshot.campaigns.clicked, snapshot.campaigns.dispatched), detail: `${snapshot.campaigns.clicked} receipts`, icon: MousePointerClick },
                { label: "Bounced", value: rate(snapshot.campaigns.bounced, snapshot.campaigns.dispatched), detail: `${snapshot.campaigns.bounced} receipts`, icon: AlertOctagon },
              ].map((metric) => {
                const Icon = metric.icon;
                return <div key={metric.label} className="rounded-xl border border-studio-line bg-[#062d2a]/30 p-4"><div className="flex items-center justify-center gap-1 text-[10px] font-black uppercase text-studio-muted"><Icon size={11} />{metric.label}</div><div className="mt-2 text-2xl font-black">{metric.value}</div><div className="mt-1 text-[10px] text-studio-dim">{metric.detail}</div></div>;
              })}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
            <div className="rounded-2xl border border-studio-line bg-[#032321]/90 p-6 shadow-studio-panel">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-studio-dim"><Clock3 size={16} className="text-studio-tag" /> Recent event ledger</h2>
              <p className="mt-2 text-xs text-studio-muted">Latest {snapshot.dataBoundaries.recentEventLimit} at most; this is a bounded read, not a real-time stream.</p>
              <div className="mt-5 flex max-h-[520px] flex-col gap-3 overflow-y-auto">
                {snapshot.events.recent.map((event) => {
                  const expanded = expandedEventId === event.id;
                  return (
                    <article key={event.id} className="overflow-hidden rounded-xl border border-studio-line bg-[#062d2a]/30">
                      <button onClick={() => setExpandedEventId(expanded ? null : event.id)} className="flex w-full items-center justify-between gap-3 p-3 text-left">
                        <div className="min-w-0"><div className="truncate text-xs font-black">{event.eventName}</div><div className="mt-1 truncate text-[10px] text-studio-dim">{event.actor} · {formatTimestamp(event.createdAt)}</div></div>
                        <ChevronRight size={15} className={`shrink-0 text-studio-dim transition ${expanded ? "rotate-90" : ""}`} />
                      </button>
                      {expanded ? <pre className="overflow-x-auto border-t border-studio-line bg-black/30 p-3 text-[10px] leading-5 text-studio-muted">{payloadText(event.payload)}</pre> : null}
                    </article>
                  );
                })}
                {!snapshot.events.recent.length ? <div className="rounded-xl border border-dashed border-studio-line p-8 text-center text-sm text-studio-muted">No workspace event receipts have been recorded.</div> : null}
              </div>
            </div>

            <div className="rounded-2xl border border-studio-line bg-[#032321]/90 p-6 shadow-studio-panel">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-studio-dim"><Filter size={16} className="text-studio-tag" /> Event counts</h2>
              <div className="mt-5 grid gap-3">
                {snapshot.events.breakdown.map((item) => <div key={item.eventName} className="flex items-center justify-between gap-3 rounded-xl border border-studio-line bg-[#062d2a]/20 p-3"><span className="text-xs font-bold">{item.eventName}</span><span className="rounded bg-black/20 px-2 py-1 font-mono text-xs text-[#f0b765]">{item.count}</span></div>)}
                {!snapshot.events.breakdown.length ? <p className="rounded-xl border border-dashed border-studio-line p-6 text-center text-sm text-studio-muted">No event types to count yet.</p> : null}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <section className="rounded-2xl border border-studio-line bg-[#032321]/90 p-6 shadow-studio-panel">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-studio-tag" />
            <div><h2 className="text-xl font-black">Persisted retention inspector</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-studio-muted">Retention rows predate tenant ownership. Until that lineage is migrated, this reader is staff-only and requires an exact video ID. It never seeds, guesses, or substitutes points.</p></div>
          </div>

          {snapshot.canInspectRetention ? (
            <>
              <form onSubmit={inspectRetention} className="mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row">
                <label className="sr-only" htmlFor="retention-video-id">Exact persisted video ID</label>
                <input id="retention-video-id" value={videoId} onChange={(event) => setVideoId(event.target.value)} maxLength={200} placeholder="Exact persisted video ID" className="min-w-0 flex-1 rounded-xl border border-studio-line bg-[#001615] px-4 py-3 text-sm outline-none focus:border-studio-tag" />
                <button disabled={retention.state === "loading"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-studio-tag px-5 py-3 text-sm font-black text-[#032321] disabled:opacity-60"><Search size={15} />{retention.state === "loading" ? "Reading…" : "Inspect"}</button>
              </form>

              {retention.state === "idle" ? <p className="mt-8 rounded-xl border border-dashed border-studio-line p-8 text-center text-sm text-studio-muted">No retention dataset selected.</p> : null}
              {retention.state === "error" || retention.state === "empty" ? <div role="status" className={`mt-8 rounded-xl border p-6 text-sm ${retention.state === "error" ? "border-amber-300/30 bg-amber-400/5 text-amber-100" : "border-studio-line text-studio-muted"}`}><strong className="block text-studio-ink">{retention.state === "error" ? "Telemetry unavailable" : "No persisted points"}</strong><span className="mt-2 block">{retention.message}</span></div> : null}
              {retention.state === "ready" && retention.points ? (
                <div className="mt-8">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider text-studio-tag">{retention.videoId}</div><div className="mt-1 text-sm text-studio-muted">{retention.points.length} persisted point{retention.points.length === 1 ? "" : "s"}</div></div>{retention.alert ? <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200">{retention.alert.message}</div> : <div className="rounded-lg border border-studio-line px-3 py-2 text-xs text-studio-muted">No threshold alert derived</div>}</div>
                  <div className="mt-6 flex h-72 items-end gap-1 overflow-x-auto rounded-xl border border-studio-line bg-[#001615] p-4" aria-label="Retention points">
                    {retention.points.map((point) => <div key={`${point.segmentIndex}-${point.timestamp}`} title={`Segment ${point.segmentIndex}: ${point.retentionRate.toFixed(1)}%`} className={`min-w-2 flex-1 rounded-t ${retention.alert?.segmentIndex === point.segmentIndex ? "bg-rose-400" : "bg-studio-tag"}`} style={{ height: `${Math.max(2, (point.retentionRate / highestRetention) * 100)}%` }} />)}
                  </div>
                  <p className="mt-3 text-xs text-studio-muted">{retention.message}</p>
                </div>
              ) : null}
            </>
          ) : <div role="status" className="mt-6 rounded-xl border border-amber-300/30 bg-amber-400/5 p-6 text-sm leading-6 text-amber-100">Your workspace analytics remain available above. Retention inspection is hidden because these legacy rows do not yet carry tenant ownership.</div>}
        </section>
      )}
    </main>
  );
}
