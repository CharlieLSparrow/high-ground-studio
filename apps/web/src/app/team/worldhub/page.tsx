import {
  Activity,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  History,
  KeyRound,
  Package,
  Plug,
  RefreshCw,
  Send,
  ShoppingCart,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { getWorldHubIntegrationDashboard } from "@/lib/server/worldhub-integrations";
import {
  initializeWorldHubIntegrationsAction,
  syncGoogleCalendarAppointmentsAction,
} from "./actions";

export const dynamic = "force-dynamic";

type StatusTone = "safe" | "warning" | "danger" | "neutral";

const providerIcons: Record<string, LucideIcon> = {
  "app-cart": ShoppingCart,
  "google-calendar": CalendarDays,
  "merch-fulfillment": Package,
  "merch-storefront": Package,
  patreon: Users,
  resend: Activity,
  stripe: CreditCard,
};

function formatLabel(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusTone(status: string): StatusTone {
  if (["active", "configured", "ready"].includes(status)) {
    return "safe";
  }

  if (["planned", "missing_env", "queued", "draft"].includes(status)) {
    return "warning";
  }

  if (["error", "failed", "disabled"].includes(status)) {
    return "danger";
  }

  return "neutral";
}

function toneClass(tone: StatusTone) {
  const tones = {
    safe: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
    warning: "border-amber-200/30 bg-amber-200/10 text-amber-50",
    danger: "border-rose-300/30 bg-rose-300/10 text-rose-100",
    neutral: "border-white/10 bg-white/6 text-[rgba(245,239,230,0.78)]",
  };

  return tones[tone];
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneClass(
        statusTone(status),
      )}`}
    >
      {formatLabel(status)}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[rgba(245,239,230,0.66)]">
        <Icon aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
        {label}
      </div>
      <div className="text-2xl font-semibold text-[var(--text-light)]">
        {value}
      </div>
    </div>
  );
}

function SecretList({
  configured,
  missing,
}: {
  configured: string[];
  missing: string[];
}) {
  if (configured.length === 0 && missing.length === 0) {
    return (
      <p className="m-0 text-sm leading-6 text-[rgba(245,239,230,0.76)]">
        No external secrets required.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-[rgba(245,239,230,0.58)]">
          Configured
        </div>
        <div className="flex flex-wrap gap-2">
          {configured.length ? (
            configured.map((key) => (
              <code
                className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-xs text-emerald-100"
                key={key}
              >
                {key}
              </code>
            ))
          ) : (
            <span className="text-sm text-[rgba(245,239,230,0.62)]">None</span>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-[rgba(245,239,230,0.58)]">
          Missing
        </div>
        <div className="flex flex-wrap gap-2">
          {missing.length ? (
            missing.map((key) => (
              <code
                className="rounded-full border border-amber-200/25 bg-amber-200/10 px-2 py-1 text-xs text-amber-50"
                key={key}
              >
                {key}
              </code>
            ))
          ) : (
            <span className="text-sm text-emerald-100">Ready</span>
          )}
        </div>
      </div>
    </div>
  );
}

function RecentSyncJobs({
  jobs,
}: {
  jobs: Awaited<
    ReturnType<typeof getWorldHubIntegrationDashboard>
  >["recentSyncJobs"];
}) {
  return (
    <GlassPanel className="p-5 text-[var(--text-light)]">
      <div className="mb-4 flex items-center gap-2">
        <History aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
        <PageEyebrow>Sync Jobs</PageEyebrow>
      </div>
      {jobs.length === 0 ? (
        <p className="m-0 text-sm leading-6 text-[rgba(245,239,230,0.74)]">
          No provider sync jobs yet.
        </p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              className="rounded-xl border border-white/10 bg-black/15 p-3"
              key={job.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  {formatLabel(job.providerKey)} / {formatLabel(job.jobType)}
                </div>
                <StatusPill status={job.status} />
              </div>
              <div className="mt-2 text-xs leading-5 text-[rgba(245,239,230,0.66)]">
                {job.subjectType}
                {job.subjectId ? ` ${job.subjectId}` : ""} -{" "}
                {formatDateTime(job.requestedAt)}
              </div>
              {job.errorMessage ? (
                <div className="mt-2 text-xs leading-5 text-amber-50">
                  {job.errorMessage}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

function RecentProviderEvents({
  events,
}: {
  events: Awaited<
    ReturnType<typeof getWorldHubIntegrationDashboard>
  >["recentProviderEvents"];
}) {
  return (
    <GlassPanel className="p-5 text-[var(--text-light)]">
      <div className="mb-4 flex items-center gap-2">
        <Activity aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
        <PageEyebrow>Provider Events</PageEyebrow>
      </div>
      {events.length === 0 ? (
        <p className="m-0 text-sm leading-6 text-[rgba(245,239,230,0.74)]">
          Stripe and Patreon webhook events will appear here after verified
          delivery.
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <div
              className="rounded-xl border border-white/10 bg-black/15 p-3"
              key={event.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  {formatLabel(event.providerKey)} / {event.eventType}
                </div>
                <StatusPill status={event.processingStatus} />
              </div>
              <div className="mt-2 text-xs leading-5 text-[rgba(245,239,230,0.66)]">
                {event.externalEventId || "No provider id"} -{" "}
                {formatLabel(event.verificationStatus)} -{" "}
                {formatDateTime(event.receivedAt)}
              </div>
              {event.errorMessage ? (
                <div className="mt-2 text-xs leading-5 text-amber-50">
                  {event.errorMessage}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

export default async function TeamWorldHubPage() {
  const dashboard = await getWorldHubIntegrationDashboard();
  const providerRecordsByKey = new Map(
    dashboard.providerConnections.map((connection) => [
      connection.providerKey,
      connection,
    ]),
  );
  const configuredProviders = dashboard.readiness.filter(
    (item) => item.status === "configured",
  ).length;
  const initializedProviders = dashboard.providerConnections.length;

  return (
    <section className="space-y-8">
      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <PageEyebrow>WorldHub</PageEyebrow>
          <PageEyebrow>Integrations</PageEyebrow>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] lg:items-start">
          <div>
            <h2 className="m-0 text-[clamp(2rem,4vw,3.4rem)] leading-none text-[var(--text-light)]">
              Revenue and scheduling command center
            </h2>
            <p className="mb-0 mt-4 max-w-[760px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
              App-owned records for provider connections, cart/order state,
              supporter sync, calendar sync, and merch fulfillment. Provider
              secrets stay in the deployment environment; this surface stores
              only readiness metadata and operational records.
            </p>
          </div>

          <form action={initializeWorldHubIntegrationsAction}>
            <button
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-200/30 bg-amber-300/12 px-4 py-3 text-sm font-semibold text-amber-50 transition hover:bg-amber-300/18"
              type="submit"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Initialize / Refresh Integrations
            </button>
            <p className="mb-0 mt-3 text-xs leading-5 text-[rgba(245,239,230,0.68)]">
              This upserts provider connection records and records which env
              names are present. It does not store secret values or call
              provider APIs.
            </p>
          </form>
        </div>
      </GlassPanel>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Plug}
          label="Providers"
          value={`${configuredProviders}/${dashboard.readiness.length}`}
        />
        <StatCard
          icon={CalendarDays}
          label="Unsynced appointments"
          value={dashboard.counts.unsyncedFutureAppointments}
        />
        <StatCard
          icon={ShoppingCart}
          label="Open carts / orders"
          value={`${dashboard.counts.openCarts}/${dashboard.counts.openOrders}`}
        />
        <StatCard
          icon={Package}
          label="Fulfillment queue"
          value={dashboard.counts.queuedFulfillmentJobs}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {dashboard.providerDefinitions.map((definition) => {
          const record = providerRecordsByKey.get(definition.providerKey);
          const readiness = dashboard.readiness.find(
            (item) => item.providerKey === definition.providerKey,
          );
          const Icon = providerIcons[definition.providerKey] ?? Plug;
          const status = record?.status ?? "not_initialized";
          const configuredEnv =
            record?.configuredEnv ?? readiness?.configuredEnv ?? [];
          const missingEnv = record?.missingEnv ?? readiness?.missingEnv ?? [];

          return (
            <article
              className="rounded-2xl border border-white/10 bg-white/8 p-5 text-[var(--text-light)] shadow-[0_18px_45px_rgba(0,0,0,0.16)]"
              key={definition.providerKey}
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/8 p-3">
                    <Icon
                      aria-hidden="true"
                      className="h-5 w-5 text-[var(--accent)]"
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="m-0 text-xl leading-tight text-[var(--text-light)]">
                      {definition.displayName}
                    </h3>
                    <p className="mb-0 mt-1 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                      {definition.accountLabel}
                    </p>
                  </div>
                </div>
                <StatusPill status={status} />
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {definition.capabilities.map((capability) => (
                  <span
                    className="rounded-full border border-white/10 bg-black/15 px-3 py-1 text-xs font-semibold text-[rgba(245,239,230,0.72)]"
                    key={capability}
                  >
                    {formatLabel(capability)}
                  </span>
                ))}
              </div>

              <SecretList configured={configuredEnv} missing={missingEnv} />

              <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                {definition.setupNotes}
              </div>

              {definition.setupUrl ? (
                <a
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] no-underline"
                  href={definition.setupUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Provider setup
                  <ExternalLink aria-hidden="true" className="h-4 w-4" />
                </a>
              ) : null}
            </article>
          );
        })}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassPanel className="p-5 text-[var(--text-light)]">
          <div className="mb-3 flex items-center gap-2">
            <KeyRound aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
            <PageEyebrow>Access</PageEyebrow>
          </div>
          <p className="m-0 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
            Active memberships remain the current access source. WorldHub now
            has provider-event and entitlement-ready storage for Patreon and
            billing reconciliation when those adapters start writing events.
          </p>
          <div className="mt-4 text-2xl font-semibold">
            {dashboard.counts.activeMemberships}
          </div>
        </GlassPanel>

        <GlassPanel className="p-5 text-[var(--text-light)]">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays
              aria-hidden="true"
              className="h-4 w-4 text-[var(--accent)]"
            />
            <PageEyebrow>Calendar</PageEyebrow>
          </div>
          <p className="m-0 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
            Existing Google Calendar links stay as a fallback. The sync action
            queues eligible appointment jobs when credentials are missing and
            creates Google Calendar events when calendar auth is configured.
          </p>
          <div className="mt-4 flex items-center gap-2">
            {dashboard.counts.unsyncedFutureAppointments > 0 ? (
              <TriangleAlert
                aria-hidden="true"
                className="h-5 w-5 text-amber-100"
              />
            ) : (
              <CheckCircle2
                aria-hidden="true"
                className="h-5 w-5 text-emerald-100"
              />
            )}
            <span className="text-2xl font-semibold">
              {dashboard.counts.futureAppointments}
            </span>
          </div>
          <form action={syncGoogleCalendarAppointmentsAction} className="mt-4">
            <button
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:bg-white/12"
              type="submit"
            >
              <Send aria-hidden="true" className="h-4 w-4" />
              Sync Next Google Calendar Jobs
            </button>
          </form>
        </GlassPanel>

        <GlassPanel className="p-5 text-[var(--text-light)]">
          <div className="mb-3 flex items-center gap-2">
            <Activity aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
            <PageEyebrow>Event Inbox</PageEyebrow>
          </div>
          <p className="m-0 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
            Provider webhook payloads now have a safe landing model for
            idempotency, verification state, processing state, and replay notes.
          </p>
          <div className="mt-4 text-2xl font-semibold">
            {dashboard.counts.receivedProviderEvents}
          </div>
        </GlassPanel>
      </div>

      {initializedProviders === 0 ? (
        <GlassPanel className="border-amber-200/20 bg-amber-200/10 p-5 text-amber-50">
          <p className="m-0 text-sm leading-6">
            The schema is ready. Use Initialize / Refresh Integrations once to
            create the provider connection rows and make this command center
            database-backed.
          </p>
        </GlassPanel>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <RecentSyncJobs jobs={dashboard.recentSyncJobs} />
        <RecentProviderEvents events={dashboard.recentProviderEvents} />
      </section>
    </section>
  );
}
