import Link from "next/link";

import { CircleAlert, Database, RotateCcw } from "lucide-react";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";

import { StudioAccessShell } from "../studio-access-shell";
import {
  AnalyticsClientView,
  type AnalyticsEvent,
  type AnalyticsSnapshot,
} from "./analytics-client-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Workspace analytics - Quipsly",
  description: "Inspect persisted workspace, funnel, campaign, and event receipts without sample-data substitution.",
};

function safePayload(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function safeDatabaseMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "ECONNREFUSED" || message.includes("ECONNREFUSED")) {
    return "The workspace database connection is unavailable.";
  }
  return "Quipsly could not verify persisted analytics for this workspace.";
}

export function AnalyticsUnavailableState({ message }: { message: string }) {
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4 py-10 text-studio-ink">
      <section role="status" aria-label="Analytics unavailable" className="w-full rounded-3xl border border-amber-300/40 bg-[#032321] p-7 shadow-studio-panel">
        <CircleAlert className="h-8 w-8 text-amber-300" />
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Persistence unavailable</p>
        <h1 className="mt-2 text-3xl font-black">Analytics could not be verified</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-studio-muted">{message}</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-studio-muted">
          No zeroes, sample charts, or generated retention points are standing in for missing data.
        </p>
        <Link href="/analytics" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-studio-line px-4 py-2 text-sm font-bold text-studio-ink transition hover:border-studio-tag">
          <RotateCcw size={15} /> Try again
        </Link>
      </section>
    </main>
  );
}

export function AnalyticsWorkspaceRequiredState() {
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4 py-10 text-studio-ink">
      <section role="status" aria-label="Analytics workspace required" className="w-full rounded-3xl border border-studio-line bg-[#032321] p-7 shadow-studio-panel">
        <Database className="h-8 w-8 text-studio-tag" />
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-studio-tag">No analytics workspace</p>
        <h1 className="mt-2 text-3xl font-black">Choose a real workspace first</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-studio-muted">
          Viewing analytics does not silently create an organization, subscription, pricing plan, or event history. Connect an existing workspace deliberately before Quipsly reports its metrics.
        </p>
        <Link href="/settings" className="mt-6 inline-flex rounded-xl bg-studio-tag px-4 py-2 text-sm font-black text-[#032321] transition hover:brightness-110">
          Open workspace settings
        </Link>
      </section>
    </main>
  );
}

async function loadAnalytics(userId: string, canInspectRetention: boolean): Promise<AnalyticsSnapshot | null> {
  const prisma = getPrismaClient();
  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      organization: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!membership) return null;

  const organizationId = membership.organization.id;
  const [funnel, leadCount, dispatched, opened, clicked, bounced, eventTotal, events, eventBreakdown] = await Promise.all([
    prisma.landingPage.aggregate({
      where: { organizationId },
      _sum: { views: true, conversions: true },
    }),
    prisma.marketingLead.count({ where: { organizationId } }),
    prisma.userEvent.count({ where: { organizationId, eventName: "Email Campaign Dispatched" } }),
    prisma.userEvent.count({ where: { organizationId, eventName: "Campaign Email Opened" } }),
    prisma.userEvent.count({ where: { organizationId, eventName: "Campaign Link Clicked" } }),
    prisma.userEvent.count({ where: { organizationId, eventName: "Campaign Dispatch Bounced" } }),
    prisma.userEvent.count({ where: { organizationId } }),
    prisma.userEvent.findMany({
      where: { organizationId },
      select: {
        id: true,
        eventName: true,
        payloadJson: true,
        createdAt: true,
        user: { select: { name: true, primaryEmail: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.userEvent.groupBy({
      by: ["eventName"],
      where: { organizationId },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 30,
    }),
  ]);

  return {
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
    },
    funnel: {
      views: funnel._sum.views ?? 0,
      conversions: funnel._sum.conversions ?? 0,
      leads: leadCount,
    },
    campaigns: { dispatched, opened, clicked, bounced },
    events: {
      total: eventTotal,
      recent: events.map((event): AnalyticsEvent => ({
        id: event.id,
        eventName: event.eventName,
        createdAt: event.createdAt.toISOString(),
        actor: event.user.name || event.user.primaryEmail,
        payload: safePayload(event.payloadJson),
      })),
      breakdown: eventBreakdown.map((entry) => ({
        eventName: entry.eventName,
        count: entry._count.id,
      })),
    },
    canInspectRetention,
    dataBoundaries: {
      persistedOnly: true,
      readOnly: true,
      recentEventLimit: 20,
      retentionTenantScoped: false,
    },
  };
}

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return <StudioAccessShell mode="signed-out" redirectTo="/analytics" />;
  }

  try {
    const snapshot = await loadAnalytics(session.user.id, session.user.isStaff === true);
    if (!snapshot) return <AnalyticsWorkspaceRequiredState />;
    return <AnalyticsClientView snapshot={snapshot} />;
  } catch (error) {
    console.error("[analytics] Failed to load persisted workspace metrics", error);
    return <AnalyticsUnavailableState message={safeDatabaseMessage(error)} />;
  }
}
