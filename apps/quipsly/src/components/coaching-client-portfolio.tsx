"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Search,
  Target,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

export type CoachingClientPortfolioItem = {
  id: string;
  title: string;
  status: string;
  people: Array<{ label: string; role: string }>;
  primaryClientLabel: string;
  nextSession: {
    id: string;
    title: string;
    scheduledStart: string | null;
    status: string;
  } | null;
  lastSession: {
    id: string;
    title: string;
    scheduledStart: string | null;
  } | null;
  openTaskCount: number;
  overdueTaskCount: number;
  activeGoalCount: number;
  visibleNoteCount: number;
  followUpCount: number;
  nextAction: {
    label: string;
    detail: string;
    href: string;
    tone: "live" | "attention" | "upcoming" | "steady";
  };
  updatedAt: string;
};

type PortfolioFilter = "attention" | "upcoming" | "all";

function dateTime(value: string | null) {
  if (!value) return "Time not set";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time not set";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function initials(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "C";
}

function actionStyle(tone: CoachingClientPortfolioItem["nextAction"]["tone"]) {
  if (tone === "live") return "bg-rose-700 text-white hover:bg-rose-800";
  if (tone === "attention")
    return "bg-amber-700 text-white hover:bg-amber-800";
  if (tone === "upcoming")
    return "bg-violet-800 text-white hover:bg-violet-900";
  return "border border-[#d8c7a7] bg-white text-[#5b472f] hover:bg-[#fff8eb]";
}

export function CoachingClientPortfolio({
  clients,
  asOf,
}: {
  clients: CoachingClientPortfolioItem[];
  asOf: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PortfolioFilter>(
    clients.some(
      (client) => client.followUpCount > 0 || client.overdueTaskCount > 0,
    )
      ? "attention"
      : "all",
  );
  const now = Date.parse(asOf);
  const weekFromNow = now + 7 * 24 * 60 * 60 * 1_000;
  const summary = useMemo(
    () => ({
      activeClients: clients.filter((client) => client.status === "ACTIVE")
        .length,
      upcomingThisWeek: clients.filter((client) => {
        const start = Date.parse(client.nextSession?.scheduledStart ?? "");
        return Number.isFinite(start) && start >= now && start <= weekFromNow;
      }).length,
      followUps: clients.reduce(
        (total, client) => total + client.followUpCount,
        0,
      ),
      openCommitments: clients.reduce(
        (total, client) => total + client.openTaskCount,
        0,
      ),
    }),
    [clients, now, weekFromNow],
  );
  const visibleClients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return clients.filter((client) => {
      const matchesQuery =
        !normalized ||
        [client.title, client.primaryClientLabel, ...client.people.map((p) => p.label)]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      if (!matchesQuery) return false;
      if (filter === "attention")
        return client.followUpCount > 0 || client.overdueTaskCount > 0;
      if (filter === "upcoming") return Boolean(client.nextSession);
      return true;
    });
  }, [clients, filter, query]);

  return (
    <div>
      <section
        aria-label="Coaching portfolio summary"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {([
          ["Active clients", summary.activeClients, UsersRound],
          ["Next 7 days", summary.upcomingThisWeek, CalendarDays],
          ["Follow-ups", summary.followUps, AlertCircle],
          ["Open commitments", summary.openCommitments, CheckCircle2],
        ] satisfies Array<[string, number, LucideIcon]>).map(
          ([label, value, Icon]) => (
          <div
            key={label}
            className="rounded-2xl border border-[#dfcfb4] bg-[#fffdf8] p-4 shadow-sm"
          >
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-[#806747]">
              <Icon size={15} aria-hidden="true" /> {label}
            </p>
            <p className="mt-2 font-serif text-3xl font-black text-[#34291d]">
              {value}
            </p>
          </div>
          ),
        )}
      </section>

      <section className="mt-6 rounded-[1.75rem] border border-[#dfcfb4] bg-[#fffdf8] p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block flex-1">
            <span className="sr-only">Search clients</span>
            <Search
              size={17}
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8a7354]"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search clients"
              className="min-h-12 w-full rounded-full border border-[#dccbad] bg-white pl-11 pr-4 text-sm font-semibold text-[#3d3122] outline-none placeholder:text-[#a08d72] focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            />
          </label>
          <div
            className="flex gap-1 overflow-x-auto rounded-full bg-[#f3ebdc] p-1"
            aria-label="Filter clients"
          >
            {([
              ["attention", "Needs attention"],
              ["upcoming", "Upcoming"],
              ["all", "All clients"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-10 shrink-0 rounded-full px-4 text-xs font-black transition ${
                  filter === value
                    ? "bg-white text-violet-950 shadow-sm"
                    : "text-[#765f40] hover:text-[#3d3122]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {visibleClients.length ? (
        <section className="mt-5 grid gap-4 lg:grid-cols-2" aria-live="polite">
          {visibleClients.map((client) => (
            <article
              key={client.id}
              className="rounded-[1.75rem] border border-[#dfcfb4] bg-[#fffdf8] p-5 shadow-sm"
            >
              <div className="flex items-start gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-violet-100 font-serif text-lg font-black text-violet-900">
                  {initials(client.primaryClientLabel)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">
                        {client.status.toLowerCase()}
                      </p>
                      <h2 className="mt-1 truncate font-serif text-2xl font-black text-[#34291d]">
                        {client.primaryClientLabel}
                      </h2>
                    </div>
                    {(client.followUpCount > 0 || client.overdueTaskCount > 0) && (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-amber-900">
                        Needs attention
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs font-semibold text-[#806d52]">
                    {client.title}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-[#ece0ca] bg-white p-4">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#806747]">
                  {client.nextSession ? (
                    <Clock3 size={14} aria-hidden="true" />
                  ) : (
                    <Target size={14} aria-hidden="true" />
                  )}
                  {client.nextSession ? "Next session" : "Next move"}
                </p>
                <p className="mt-2 font-black text-[#3d3122]">
                  {client.nextSession
                    ? dateTime(client.nextSession.scheduledStart)
                    : client.nextAction.label}
                </p>
                <p className="mt-1 text-sm font-semibold leading-5 text-[#765f40]">
                  {client.nextAction.detail}
                </p>
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-[#f5efe4] px-2 py-3">
                  <dt className="text-[9px] font-black uppercase tracking-wide text-[#8a7354]">
                    Tasks
                  </dt>
                  <dd className="mt-1 font-black text-[#3d3122]">
                    {client.openTaskCount}
                    {client.overdueTaskCount > 0 ? (
                      <span className="text-rose-700"> · {client.overdueTaskCount} late</span>
                    ) : null}
                  </dd>
                </div>
                <div className="rounded-xl bg-[#f5efe4] px-2 py-3">
                  <dt className="text-[9px] font-black uppercase tracking-wide text-[#8a7354]">
                    Goals
                  </dt>
                  <dd className="mt-1 font-black text-[#3d3122]">
                    {client.activeGoalCount}
                  </dd>
                </div>
                <div className="rounded-xl bg-[#f5efe4] px-2 py-3">
                  <dt className="text-[9px] font-black uppercase tracking-wide text-[#8a7354]">
                    Follow-up
                  </dt>
                  <dd className="mt-1 font-black text-[#3d3122]">
                    {client.followUpCount}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={client.nextAction.href}
                  className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-xs font-black uppercase tracking-wide transition ${actionStyle(client.nextAction.tone)}`}
                >
                  {client.nextAction.label} <ArrowRight size={14} aria-hidden="true" />
                </Link>
                <Link
                  href={`/coaching/engagements/${encodeURIComponent(client.id)}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d8c7a7] bg-white px-4 text-xs font-black uppercase tracking-wide text-[#5b472f] hover:bg-[#fff8eb]"
                >
                  Client space
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="mt-5 rounded-[1.75rem] border border-dashed border-[#cdbb9e] bg-[#fffaf0] p-8 text-center">
          <UsersRound className="mx-auto text-violet-800" />
          <h2 className="mt-4 font-serif text-2xl font-black text-[#3d3122]">
            {clients.length ? "No clients match this view." : "Add your first client."}
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-[#765f40]">
            {clients.length
              ? "Try another filter or search. Nothing was removed."
              : "Schedule a Session with their email. Quipsly creates the private client relationship, invitation, call room, and shared follow-through space together."}
          </p>
          {!clients.length ? (
            <Link
              href="/coaching#create-appointment"
              className="mt-5 inline-flex min-h-11 items-center rounded-full bg-violet-800 px-5 text-sm font-black text-white"
            >
              Schedule the first session
            </Link>
          ) : null}
        </section>
      )}
    </div>
  );
}
