import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  LineChart,
  Megaphone,
  Search,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { getWorldHubGrowthDashboard } from "@/lib/server/worldhub-growth";

import {
  createMonetizationPlacementAction,
  createSeoBriefAction,
  recordAnalyticsSnapshotAction,
  seedGrowthFoundationAction,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  success?: string;
  error?: string;
}>;

type StatusTone = "safe" | "warning" | "danger" | "neutral";

const providerIcons: Record<string, LucideIcon> = {
  "affiliate-links": BadgeDollarSign,
  "direct-sponsors": Megaphone,
  "google-adsense": BadgeDollarSign,
  "google-analytics": LineChart,
  "google-search-console": Search,
};

function formatLabel(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    dateStyle: "medium",
  });
}

function statusTone(status: string): StatusTone {
  if (["active", "configured", "ready"].includes(status)) {
    return "safe";
  }

  if (["draft", "planned", "review", "missing_env"].includes(status)) {
    return "warning";
  }

  if (["blocked", "failed", "disabled", "error"].includes(status)) {
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

  return (
    <div
      className={[
        "rounded-2xl border px-4 py-3 text-sm font-semibold",
        isError
          ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
          : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
      ].join(" ")}
    >
      {error ?? success}
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
        htmlFor={id}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none placeholder:text-[rgba(245,239,230,0.4)]";
const selectClass =
  "w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none";
const buttonClass =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-200/30 bg-amber-300/12 px-4 py-3 text-sm font-semibold text-amber-50 transition hover:bg-amber-300/18";

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

function MetricsList({ metrics }: { metrics: unknown }) {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {Object.entries(metrics).map(([key, value]) => (
        <span
          className="rounded-full border border-white/10 bg-black/15 px-3 py-1 text-xs font-semibold text-[rgba(245,239,230,0.72)]"
          key={key}
        >
          {formatLabel(key)}: {String(value)}
        </span>
      ))}
    </div>
  );
}

export default async function TeamGrowthPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { success, error } = await searchParams;
  const dashboard = await getWorldHubGrowthDashboard();
  const configuredProviders = dashboard.providerReadiness.filter(
    (item) => item.status === "configured",
  ).length;

  return (
    <section className="space-y-8">
      <StatusMessage success={success} error={error} />

      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <PageEyebrow>WorldHub</PageEyebrow>
          <PageEyebrow>Growth</PageEyebrow>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] lg:items-start">
          <div>
            <h2 className="m-0 text-[clamp(2rem,4vw,3.35rem)] leading-none text-[var(--text-light)]">
              Growth, search, and monetization desk
            </h2>
            <p className="mb-0 mt-4 max-w-[780px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
              SEO briefs, manual analytics snapshots, ad slots, affiliate links,
              and sponsor placements stay app-owned first. Google and affiliate
              providers can plug in after the work is reviewable here.
            </p>
          </div>

          <form action={seedGrowthFoundationAction}>
            <button className={buttonClass} type="submit">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              Seed Growth Foundation
            </button>
            <p className="mb-0 mt-3 text-xs leading-5 text-[rgba(245,239,230,0.68)]">
              Seeds starter SEO briefs and monetization placements, then refreshes
              the provider readiness records.
            </p>
          </form>
        </div>
      </GlassPanel>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Activity}
          label="Growth providers"
          value={`${configuredProviders}/${dashboard.providerReadiness.length}`}
        />
        <StatCard
          icon={Target}
          label="SEO briefs"
          value={dashboard.counts.seoBriefs}
        />
        <StatCard
          icon={BarChart3}
          label="Snapshots"
          value={dashboard.counts.analyticsSnapshots}
        />
        <StatCard
          icon={BadgeDollarSign}
          label="Placements"
          value={dashboard.counts.monetizationPlacements}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        {dashboard.growthProviders.map((definition) => {
          const readiness = dashboard.providerReadiness.find(
            (item) => item.providerKey === definition.providerKey,
          );
          const Icon = providerIcons[definition.providerKey] ?? Activity;

          return (
            <article
              className="rounded-2xl border border-white/10 bg-white/8 p-4 text-[var(--text-light)]"
              key={definition.providerKey}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/8 p-3">
                  <Icon
                    aria-hidden="true"
                    className="h-5 w-5 text-[var(--accent)]"
                  />
                </div>
                <StatusPill status={readiness?.status ?? "planned"} />
              </div>
              <h3 className="m-0 text-lg leading-tight">
                {definition.displayName}
              </h3>
              <p className="mb-0 mt-2 text-sm leading-6 text-[rgba(245,239,230,0.72)]">
                {definition.accountLabel}
              </p>
              {definition.setupUrl ? (
                <a
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] no-underline"
                  href={definition.setupUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Setup
                  <ExternalLink aria-hidden="true" className="h-4 w-4" />
                </a>
              ) : null}
            </article>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <GlassPanel className="p-5 text-[var(--text-light)]">
          <div className="mb-4 flex items-center gap-2">
            <Search aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
            <PageEyebrow>SEO Brief</PageEyebrow>
          </div>
          <form action={createSeoBriefAction} className="space-y-4">
            <Field id="title" label="Title">
              <input
                className={inputClass}
                id="title"
                name="title"
                placeholder="Episode page, coaching page, book page..."
                required
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="slug" label="Slug">
                <input className={inputClass} id="slug" name="slug" />
              </Field>
              <Field id="contentKind" label="Kind">
                <select
                  className={selectClass}
                  defaultValue="episode_page"
                  id="contentKind"
                  name="contentKind"
                >
                  <option className="text-black" value="episode_page">
                    Episode page
                  </option>
                  <option className="text-black" value="book_page">
                    Book page
                  </option>
                  <option className="text-black" value="offer_page">
                    Offer page
                  </option>
                  <option className="text-black" value="site_page">
                    Site page
                  </option>
                </select>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="targetPath" label="Target path">
                <input
                  className={inputClass}
                  id="targetPath"
                  name="targetPath"
                  placeholder="/episodes/..."
                />
              </Field>
              <Field id="status" label="Status">
                <select
                  className={selectClass}
                  defaultValue="draft"
                  id="status"
                  name="status"
                >
                  <option className="text-black" value="draft">
                    Draft
                  </option>
                  <option className="text-black" value="review">
                    Review
                  </option>
                  <option className="text-black" value="active">
                    Active
                  </option>
                  <option className="text-black" value="archived">
                    Archived
                  </option>
                </select>
              </Field>
            </div>
            <Field id="primaryKeyword" label="Primary keyword">
              <input
                className={inputClass}
                id="primaryKeyword"
                name="primaryKeyword"
                placeholder="leadership story"
              />
            </Field>
            <Field id="secondaryKeywords" label="Secondary keywords">
              <input
                className={inputClass}
                id="secondaryKeywords"
                name="secondaryKeywords"
                placeholder="comma separated"
              />
            </Field>
            <Field id="metaTitle" label="Meta title">
              <input className={inputClass} id="metaTitle" name="metaTitle" />
            </Field>
            <Field id="metaDescription" label="Meta description">
              <textarea
                className={inputClass}
                id="metaDescription"
                name="metaDescription"
                rows={3}
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="canonicalUrl" label="Canonical URL">
                <input
                  className={inputClass}
                  id="canonicalUrl"
                  name="canonicalUrl"
                />
              </Field>
              <Field id="structuredDataType" label="Schema">
                <input
                  className={inputClass}
                  id="structuredDataType"
                  name="structuredDataType"
                  placeholder="Article, PodcastEpisode, Book..."
                />
              </Field>
            </div>
            <Field id="searchIntent" label="Search intent">
              <textarea
                className={inputClass}
                id="searchIntent"
                name="searchIntent"
                rows={2}
              />
            </Field>
            <Field id="audience" label="Audience">
              <textarea
                className={inputClass}
                id="audience"
                name="audience"
                rows={2}
              />
            </Field>
            <Field id="notes" label="Notes">
              <textarea className={inputClass} id="notes" name="notes" rows={3} />
            </Field>
            <button className={buttonClass} type="submit">
              Save SEO Brief
            </button>
          </form>
        </GlassPanel>

        <GlassPanel className="p-5 text-[var(--text-light)]">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3
              aria-hidden="true"
              className="h-4 w-4 text-[var(--accent)]"
            />
            <PageEyebrow>Analytics Snapshot</PageEyebrow>
          </div>
          <form action={recordAnalyticsSnapshotAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="source" label="Source">
                <select
                  className={selectClass}
                  defaultValue="manual"
                  id="source"
                  name="source"
                >
                  <option className="text-black" value="manual">
                    Manual
                  </option>
                  <option className="text-black" value="google_analytics">
                    Google Analytics
                  </option>
                  <option className="text-black" value="search_console">
                    Search Console
                  </option>
                  <option className="text-black" value="adsense">
                    AdSense
                  </option>
                </select>
              </Field>
              <Field id="channel" label="Channel">
                <select
                  className={selectClass}
                  defaultValue="site"
                  id="channel"
                  name="channel"
                >
                  <option className="text-black" value="site">
                    Site
                  </option>
                  <option className="text-black" value="search">
                    Search
                  </option>
                  <option className="text-black" value="ads">
                    Ads
                  </option>
                  <option className="text-black" value="affiliate">
                    Affiliate
                  </option>
                  <option className="text-black" value="podcast">
                    Podcast
                  </option>
                </select>
              </Field>
            </div>
            <Field id="contentPath" label="Content path">
              <input
                className={inputClass}
                id="contentPath"
                name="contentPath"
                placeholder="/episodes/..."
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="periodStart" label="Period start">
                <input
                  className={inputClass}
                  id="periodStart"
                  name="periodStart"
                  required
                  type="date"
                />
              </Field>
              <Field id="periodEnd" label="Period end">
                <input
                  className={inputClass}
                  id="periodEnd"
                  name="periodEnd"
                  required
                  type="date"
                />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="pageViews" label="Page views">
                <input className={inputClass} id="pageViews" name="pageViews" />
              </Field>
              <Field id="sessions" label="Sessions">
                <input className={inputClass} id="sessions" name="sessions" />
              </Field>
              <Field id="users" label="Users">
                <input className={inputClass} id="users" name="users" />
              </Field>
              <Field id="clicks" label="Clicks">
                <input className={inputClass} id="clicks" name="clicks" />
              </Field>
              <Field id="impressions" label="Impressions">
                <input
                  className={inputClass}
                  id="impressions"
                  name="impressions"
                />
              </Field>
              <Field id="conversions" label="Conversions">
                <input
                  className={inputClass}
                  id="conversions"
                  name="conversions"
                />
              </Field>
            </div>
            <Field id="revenueCents" label="Revenue cents">
              <input
                className={inputClass}
                id="revenueCents"
                name="revenueCents"
              />
            </Field>
            <Field id="analyticsNotes" label="Notes">
              <textarea
                className={inputClass}
                id="analyticsNotes"
                name="notes"
                rows={3}
              />
            </Field>
            <button className={buttonClass} type="submit">
              Record Snapshot
            </button>
          </form>
        </GlassPanel>

        <GlassPanel className="p-5 text-[var(--text-light)]">
          <div className="mb-4 flex items-center gap-2">
            <BadgeDollarSign
              aria-hidden="true"
              className="h-4 w-4 text-[var(--accent)]"
            />
            <PageEyebrow>Monetization Placement</PageEyebrow>
          </div>
          <form action={createMonetizationPlacementAction} className="space-y-4">
            <Field id="displayName" label="Display name">
              <input
                className={inputClass}
                id="displayName"
                name="displayName"
                required
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="placementSlug" label="Slug">
                <input className={inputClass} id="placementSlug" name="slug" />
              </Field>
              <Field id="placementType" label="Type">
                <select
                  className={selectClass}
                  defaultValue="affiliate_link"
                  id="placementType"
                  name="placementType"
                >
                  <option className="text-black" value="affiliate_link">
                    Affiliate link
                  </option>
                  <option className="text-black" value="book_recommendation">
                    Book recommendation
                  </option>
                  <option className="text-black" value="adsense_auto_ads">
                    AdSense Auto ads
                  </option>
                  <option className="text-black" value="ad_slot">
                    Ad slot
                  </option>
                  <option className="text-black" value="sponsor_slot">
                    Sponsor slot
                  </option>
                  <option className="text-black" value="merch_cta">
                    Merch CTA
                  </option>
                </select>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="placementStatus" label="Status">
                <select
                  className={selectClass}
                  defaultValue="draft"
                  id="placementStatus"
                  name="status"
                >
                  <option className="text-black" value="draft">
                    Draft
                  </option>
                  <option className="text-black" value="review">
                    Review
                  </option>
                  <option className="text-black" value="ready">
                    Ready
                  </option>
                  <option className="text-black" value="active">
                    Active
                  </option>
                </select>
              </Field>
              <Field id="providerKey" label="Provider">
                <select
                  className={selectClass}
                  defaultValue="affiliate-links"
                  id="providerKey"
                  name="providerKey"
                >
                  <option className="text-black" value="affiliate-links">
                    Affiliate links
                  </option>
                  <option className="text-black" value="google-adsense">
                    Google AdSense
                  </option>
                  <option className="text-black" value="direct-sponsors">
                    Direct sponsors
                  </option>
                  <option className="text-black" value="merch-storefront">
                    Merch storefront
                  </option>
                </select>
              </Field>
            </div>
            <Field id="placementTargetPath" label="Target path">
              <input
                className={inputClass}
                id="placementTargetPath"
                name="targetPath"
                placeholder="/episodes/..."
              />
            </Field>
            <Field id="destinationUrl" label="Destination URL">
              <input
                className={inputClass}
                id="destinationUrl"
                name="destinationUrl"
              />
            </Field>
            <Field id="disclosureText" label="Disclosure">
              <textarea
                className={inputClass}
                id="disclosureText"
                name="disclosureText"
                rows={3}
              />
            </Field>
            <Field id="callToAction" label="Call to action">
              <input className={inputClass} id="callToAction" name="callToAction" />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="affiliateProgram" label="Affiliate program">
                <input
                  className={inputClass}
                  id="affiliateProgram"
                  name="affiliateProgram"
                />
              </Field>
              <Field id="productAuthor" label="Author">
                <input
                  className={inputClass}
                  id="productAuthor"
                  name="productAuthor"
                />
              </Field>
              <Field id="productIsbn" label="ISBN">
                <input className={inputClass} id="productIsbn" name="productIsbn" />
              </Field>
              <Field id="adSlot" label="Ad slot">
                <input className={inputClass} id="adSlot" name="adSlot" />
              </Field>
            </div>
            <Field id="sponsorCategory" label="Sponsor category">
              <input
                className={inputClass}
                id="sponsorCategory"
                name="sponsorCategory"
              />
            </Field>
            <button className={buttonClass} type="submit">
              Save Placement
            </button>
          </form>
        </GlassPanel>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <GlassPanel className="p-5 text-[var(--text-light)]">
          <div className="mb-4 flex items-center gap-2">
            <Target aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
            <PageEyebrow>Recent SEO Briefs</PageEyebrow>
          </div>
          {dashboard.seoBriefs.length === 0 ? (
            <p className="m-0 text-sm leading-6 text-[rgba(245,239,230,0.72)]">
              No SEO briefs yet.
            </p>
          ) : (
            <div className="space-y-3">
              {dashboard.seoBriefs.map((brief) => (
                <article
                  className="rounded-xl border border-white/10 bg-black/15 p-3"
                  key={brief.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="m-0 text-base leading-tight">
                      {brief.title}
                    </h3>
                    <StatusPill status={brief.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-[rgba(245,239,230,0.72)]">
                    {brief.checklistScore >= 75 ? (
                      <CheckCircle2
                        aria-hidden="true"
                        className="h-4 w-4 text-emerald-100"
                      />
                    ) : (
                      <TriangleAlert
                        aria-hidden="true"
                        className="h-4 w-4 text-amber-100"
                      />
                    )}
                    {brief.checklistScore}% ready
                    {brief.targetPath ? ` / ${brief.targetPath}` : ""}
                  </div>
                  {brief.primaryKeyword ? (
                    <div className="mt-2 text-xs font-semibold uppercase text-[rgba(245,239,230,0.58)]">
                      {brief.primaryKeyword}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="p-5 text-[var(--text-light)]">
          <div className="mb-4 flex items-center gap-2">
            <LineChart
              aria-hidden="true"
              className="h-4 w-4 text-[var(--accent)]"
            />
            <PageEyebrow>Recent Snapshots</PageEyebrow>
          </div>
          {dashboard.analyticsSnapshots.length === 0 ? (
            <p className="m-0 text-sm leading-6 text-[rgba(245,239,230,0.72)]">
              No analytics snapshots yet.
            </p>
          ) : (
            <div className="space-y-3">
              {dashboard.analyticsSnapshots.map((snapshot) => (
                <article
                  className="rounded-xl border border-white/10 bg-black/15 p-3"
                  key={snapshot.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="m-0 text-base leading-tight">
                      {formatLabel(snapshot.source)} / {formatLabel(snapshot.channel)}
                    </h3>
                    <span className="text-xs text-[rgba(245,239,230,0.62)]">
                      {formatDate(snapshot.capturedAt)}
                    </span>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-[rgba(245,239,230,0.66)]">
                    {formatDate(snapshot.periodStart)} to{" "}
                    {formatDate(snapshot.periodEnd)}
                    {snapshot.contentPath ? ` / ${snapshot.contentPath}` : ""}
                  </div>
                  <MetricsList metrics={snapshot.metrics} />
                </article>
              ))}
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="p-5 text-[var(--text-light)]">
          <div className="mb-4 flex items-center gap-2">
            <Megaphone
              aria-hidden="true"
              className="h-4 w-4 text-[var(--accent)]"
            />
            <PageEyebrow>Recent Placements</PageEyebrow>
          </div>
          {dashboard.monetizationPlacements.length === 0 ? (
            <p className="m-0 text-sm leading-6 text-[rgba(245,239,230,0.72)]">
              No monetization placements yet.
            </p>
          ) : (
            <div className="space-y-3">
              {dashboard.monetizationPlacements.map((placement) => (
                <article
                  className="rounded-xl border border-white/10 bg-black/15 p-3"
                  key={placement.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="m-0 text-base leading-tight">
                      {placement.displayName}
                    </h3>
                    <StatusPill status={placement.status} />
                  </div>
                  <div className="mt-2 text-xs leading-5 text-[rgba(245,239,230,0.66)]">
                    {formatLabel(placement.placementType)}
                    {placement.providerKey
                      ? ` / ${formatLabel(placement.providerKey)}`
                      : ""}
                    {placement.targetPath ? ` / ${placement.targetPath}` : ""}
                  </div>
                  {placement.disclosureText ? (
                    <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.68)]">
                      {placement.disclosureText}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </GlassPanel>
      </section>
    </section>
  );
}
