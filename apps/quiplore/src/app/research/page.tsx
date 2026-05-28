import type { Metadata } from "next";
import Link from "next/link";
import {
  ClipboardCheck,
  Database,
  FileSearch,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QuipVisual } from "@/components/QuipVisual";
import { SourceBadge } from "@/components/SourceBadge";
import { StatPanel } from "@/components/StatPanel";
import { VerificationBadge } from "@/components/VerificationBadge";
import {
  getResearchPacketByQuoteSlug,
  getResearchQueue,
  getResearchQueueStats,
} from "@high-ground/quipsly-domain/seed";

export const metadata: Metadata = {
  title: "Quipsly Research Desk",
  description:
    "Prototype source review queue for Quipsly quote verification, attribution, rights, and database write planning.",
};

function formatLabel(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ResearchDeskPage() {
  const queue = getResearchQueue();
  const stats = getResearchQueueStats();
  const focusItem =
    queue.find((item) => item.status === "blocked") ?? queue[0] ?? null;
  const focusPacket = focusItem
    ? getResearchPacketByQuoteSlug(focusItem.quote.quote.slug)
    : undefined;

  return (
    <AppShell>
      <div className="page-head research-page-head">
        <span className="section-label">
          <FileSearch size={14} aria-hidden="true" />
          Quipsly Research Desk
        </span>
        <h1>Source review before scale.</h1>
        <p>
          A researcher-facing queue for turning viral quote candidates into
          evidence-backed records. The desk treats every card as a projection
          over source, attribution, review state, variants, rights, and database
          write plans.
        </p>
      </div>

      <div className="research-hero-grid">
        <section className="panel">
          <span className="section-label">
            <ShieldAlert size={14} aria-hidden="true" />
            Risk triage
          </span>
          <h2 className="panel-title">Charm waits for citation.</h2>
          <p className="panel-copy">
            Popular lines can stay discoverable while attribution, rights, and
            merch use remain explicitly blocked or pending.
          </p>
        </section>

        <section className="panel">
          <span className="section-label">
            <Database size={14} aria-hidden="true" />
            Database discipline
          </span>
          <h2 className="panel-title">Write plans are part of review.</h2>
          <p className="panel-copy">
            The packet lists the future tables and jobs that should receive the
            decision, including evidence, variants, review events, and embeddings.
          </p>
        </section>

        <section className="panel">
          <span className="section-label">
            <ClipboardCheck size={14} aria-hidden="true" />
            Queue stats
          </span>
          <StatPanel
            items={[
              { label: "Total", value: stats.total },
              { label: "Urgent", value: stats.urgent },
              { label: "Blocked", value: stats.blocked },
              { label: "Needs source", value: stats.needsSource },
              { label: "Rights", value: stats.rightsReview },
              { label: "Variants", value: stats.variantCheck },
            ]}
          />
        </section>
      </div>

      <div className="research-grid">
        <section className="research-queue panel">
          <span className="section-label">
            <FileSearch size={14} aria-hidden="true" />
            Review queue
          </span>
          <div className="research-queue-list">
            {queue.map((item) => (
              <article className={`research-queue-item ${item.priority}`} key={item.id}>
                <div>
                  <div className="chip-row">
                    <VerificationBadge status={item.quote.quote.verificationStatus} />
                    <SourceBadge source={item.quote.sourceWork} />
                    <span className={`readiness-badge ${item.status}`}>
                      {formatLabel(item.status)}
                    </span>
                  </div>
                  <h2>{item.quote.quote.text}</h2>
                  <p>
                    {item.quote.person.displayName} | {item.assignedLane} |{" "}
                    {formatLabel(item.priority)} priority
                  </p>
                  <div className="research-flags">
                    {item.riskFlags.length ? (
                      item.riskFlags.map((flag) => <span key={flag}>{flag}</span>)
                    ) : (
                      <span>Ready for citation polish</span>
                    )}
                  </div>
                </div>
                <Link className="button" href={`/quotes/${item.quote.quote.slug}`}>
                  Passport
                </Link>
              </article>
            ))}
          </div>
        </section>

        {focusPacket ? (
          <aside className="research-packet stack">
            <section className="panel">
              <span className="section-label">
                <Sparkles size={14} aria-hidden="true" />
                Focus packet
              </span>
              <QuipVisual visual={focusPacket.passport.quote.visual} />
              <h2 className="panel-title">{focusPacket.passport.person.displayName}</h2>
              <p className="panel-copy">{focusPacket.passport.quote.reviewNote}</p>
            </section>

            <section className="panel">
              <span className="section-label">Next actions</span>
              <div className="research-action-list">
                {focusPacket.queueItem.nextActions.map((action) => (
                  <div className="meta-item" key={action.id}>
                    <span>{formatLabel(action.kind)}</span>
                    <strong>{action.title}</strong>
                    <p>{action.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <span className="section-label">Source checklist</span>
              <ul className="research-check-list">
                {focusPacket.sourceChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="panel">
              <span className="section-label">Database write plan</span>
              <ol className="research-write-plan">
                {focusPacket.databaseWritePlan.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </section>
          </aside>
        ) : null}
      </div>
    </AppShell>
  );
}
