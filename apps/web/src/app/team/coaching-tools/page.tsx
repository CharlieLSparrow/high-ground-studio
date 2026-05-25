import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { formatDateInputValue } from "@/lib/coaching/weekly-commitments";
import { prisma } from "@/lib/prisma";

import { reviewWeeklyCommitmentAction } from "./actions";

type SearchParams = Promise<{
  success?: string;
  error?: string;
}>;

const TEAM_TIME_ZONE = "America/Denver";

function StatusMessage({
  success,
  error,
}: {
  success?: string;
  error?: string;
}) {
  if (!success && !error) {
    return null;
  }

  const isError = Boolean(error);
  const message = error ?? success ?? "";

  return (
    <div
      className={[
        "mb-6 rounded-2xl border px-4 py-3 text-sm font-medium",
        isError
          ? "border-red-400/25 bg-red-400/10 text-red-100"
          : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

function formatTeamDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: TEAM_TIME_ZONE,
  }).format(value);
}

function formatTeamDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TEAM_TIME_ZONE,
    timeZoneName: "short",
  }).format(value);
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

export default async function TeamCoachingToolsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { success, error } = await searchParams;

  const weeklyCommitments = await prisma.weeklyCommitment.findMany({
    orderBy: [{ updatedAt: "desc" }],
    take: 50,
    include: {
      clientUser: {
        include: {
          clientProfile: true,
          coachingFeatureGrants: {
            include: {
              feature: true,
            },
            where: {
              feature: {
                featureKey: "weekly_commitments",
              },
            },
            orderBy: [{ updatedAt: "desc" }],
          },
        },
      },
      reviewedByUser: true,
    },
  });

  const activeCount = weeklyCommitments.filter(
    (entry) => entry.status === "ACTIVE",
  ).length;
  const reviewedCount = weeklyCommitments.filter(
    (entry) => entry.status === "REVIEWED",
  ).length;
  const archivedCount = weeklyCommitments.filter(
    (entry) => entry.status === "ARCHIVED",
  ).length;

  return (
    <section className="space-y-8">
      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <PageEyebrow>Coaching Tools</PageEyebrow>
          <PageEyebrow>Weekly Commitments</PageEyebrow>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h2 className="m-0 text-[clamp(2rem,4vw,3.4rem)] leading-tight tracking-[-0.04em] text-[var(--text-light)]">
              Client commitment review
            </h2>

            <p className="mb-0 mt-4 max-w-[760px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
              Review the commitments clients set between coaching sessions,
              mark what has been reviewed, and keep short coach-facing notes
              attached to the entry.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
              <div className="text-xl font-bold">{activeCount}</div>
              <div className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                Active
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
              <div className="text-xl font-bold">{reviewedCount}</div>
              <div className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                Reviewed
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
              <div className="text-xl font-bold">{archivedCount}</div>
              <div className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.68)]">
                Archived
              </div>
            </div>
          </div>
        </div>
      </GlassPanel>

      <StatusMessage success={success} error={error} />

      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <PageEyebrow>Review Queue</PageEyebrow>
            <h3 className="m-0 mt-2 text-[1.4rem] leading-tight tracking-[-0.03em] text-[var(--text-light)]">
              Latest weekly entries
            </h3>
          </div>

          <span className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-semibold text-[rgba(245,239,230,0.9)]">
            {weeklyCommitments.length} shown
          </span>
        </div>

        {weeklyCommitments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 px-5 py-8 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.82)]">
            No weekly commitments have been submitted yet. Once a client with
            the Weekly Commitments grant saves an entry, it will appear here.
          </div>
        ) : (
          <div className="space-y-4">
            {weeklyCommitments.map((entry) => {
              const clientName =
                entry.clientUser.clientProfile?.displayName ||
                entry.clientUser.name ||
                entry.clientUser.primaryEmail;
              const grant = entry.clientUser.coachingFeatureGrants[0] ?? null;
              const grantLabel = grant
                ? `${formatLabel(grant.status)} / ${formatLabel(grant.visibility)}`
                : "No current grant found";

              return (
                <article
                  className="rounded-[24px] border border-white/10 bg-white/6 p-5"
                  key={entry.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="m-0 text-[1.12rem] leading-tight text-[var(--text-light)]">
                          {clientName}
                        </h4>
                        <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.78)]">
                          {formatLabel(entry.status)}
                        </span>
                      </div>

                      <p className="mb-0 mt-2 text-sm leading-6 text-[rgba(245,239,230,0.72)]">
                        {entry.clientUser.primaryEmail} · Week of{" "}
                        {formatTeamDate(entry.weekStartsAt)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-[rgba(245,239,230,0.84)]">
                      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.6)]">
                        Grant
                      </div>
                      <div>{grantLabel}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    {[entry.commitmentOne, entry.commitmentTwo, entry.commitmentThree]
                      .filter(Boolean)
                      .map((commitment, index) => (
                        <div
                          className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm leading-6 text-[rgba(245,239,230,0.9)]"
                          key={`${entry.id}-${index}`}
                        >
                          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.58)]">
                            Commitment {index + 1}
                          </div>
                          {commitment}
                        </div>
                      ))}
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.58)]">
                        Support requested
                      </div>
                      <div className="whitespace-pre-wrap text-sm leading-6 text-[rgba(245,239,230,0.84)]">
                        {entry.supportNeeded || "None added."}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.58)]">
                        Progress notes
                      </div>
                      <div className="whitespace-pre-wrap text-sm leading-6 text-[rgba(245,239,230,0.84)]">
                        {entry.progressNotes || "None added."}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.58)]">
                      Review
                    </div>

                    <form action={reviewWeeklyCommitmentAction} className="space-y-3">
                      <input type="hidden" name="entryId" value={entry.id} />

                      <div className="grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)_auto]">
                        <select
                          name="status"
                          defaultValue={entry.status}
                          className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none"
                        >
                          <option className="text-black" value="ACTIVE">
                            Active
                          </option>
                          <option className="text-black" value="REVIEWED">
                            Reviewed
                          </option>
                          <option className="text-black" value="ARCHIVED">
                            Archived
                          </option>
                        </select>

                        <textarea
                          name="coachNotes"
                          rows={3}
                          defaultValue={entry.coachNotes ?? ""}
                          placeholder="Coach-facing notes"
                          className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]"
                        />

                        <button
                          type="submit"
                          className="rounded-full border border-flare/25 bg-flare/15 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/40 hover:bg-flare/20"
                        >
                          Save review
                        </button>
                      </div>
                    </form>

                    <div className="mt-3 text-xs leading-5 text-[rgba(245,239,230,0.62)]">
                      Updated {formatTeamDateTime(entry.updatedAt)}
                      {entry.reviewedAt
                        ? ` · Reviewed ${formatTeamDateTime(entry.reviewedAt)} by ${
                            entry.reviewedByUser?.name ||
                            entry.reviewedByUser?.primaryEmail ||
                            "team"
                          }`
                        : null}
                      {" · Date key "}
                      {formatDateInputValue(entry.weekStartsAt)}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </GlassPanel>
    </section>
  );
}
