import React from "react";
import Link from "next/link";
import { CircleAlert, Database, RotateCcw } from "lucide-react";
import { getOrgMembersAction, getOrgEventsAction, getOrgFeedbackTicketsAction } from "./actions";
import { getPrismaClient } from "@/lib/prisma";
import { SettingsClientView } from "./settings-client-view";
import { auth } from "@/auth";
import { StudioAccessShell } from "../studio-access-shell";

export const metadata = {
  title: "Workspace settings - Quipsly",
  description: "Inspect and manage persisted workspace settings without simulated billing or access grants.",
};

export const dynamic = "force-dynamic";

export function SettingsWorkspaceRequiredState() {
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4 py-10 text-studio-ink">
      <section role="status" aria-label="Settings workspace required" className="w-full rounded-3xl border border-studio-line bg-[#032321] p-7 shadow-studio-panel">
        <Database className="h-8 w-8 text-studio-tag" />
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-studio-tag">No workspace membership</p>
        <h1 className="mt-2 text-3xl font-black">Connect a real workspace deliberately</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-studio-muted">
          Opening Settings does not silently create an organization, pricing plans, a trial subscription, or activity events. A deliberate workspace-provisioning flow is still required.
        </p>
        <Link href="/" className="mt-6 inline-flex rounded-xl border border-studio-line px-4 py-2 text-sm font-bold text-studio-ink transition hover:border-studio-tag">
          Return to The Nest
        </Link>
      </section>
    </main>
  );
}

export function SettingsUnavailableState() {
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4 py-10 text-studio-ink">
      <section role="status" aria-label="Settings unavailable" className="w-full rounded-3xl border border-amber-300/40 bg-[#032321] p-7 shadow-studio-panel">
        <CircleAlert className="h-8 w-8 text-amber-300" />
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Persistence unavailable</p>
        <h1 className="mt-2 text-3xl font-black">Workspace settings could not be verified</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-studio-muted">
          Quipsly could not read the persisted workspace record. No sample organization, member, plan, or activity record is standing in for it.
        </p>
        <Link href="/settings" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-studio-line px-4 py-2 text-sm font-bold text-studio-ink transition hover:border-studio-tag">
          <RotateCcw size={15} /> Try again
        </Link>
      </section>
    </main>
  );
}

async function loadWorkspaceSettings(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string,
) {
  const [members, events, feedbackTickets, plans, kbData] = await Promise.all([
    getOrgMembersAction(organizationId),
    getOrgEventsAction(organizationId),
    getOrgFeedbackTicketsAction(organizationId),
    prisma.subscriptionPlan.findMany({ orderBy: { price: "asc" } }),
    prisma.knowledgeCategory.findMany({
      include: { articles: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    }),
  ]);

  return { members, events, feedbackTickets, plans, kbData };
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return <StudioAccessShell mode="signed-out" redirectTo="/settings" />;
  }

  const prisma = getPrismaClient();
  let membership;
  try {
    membership = await prisma.organizationMember.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        organization: {
          include: {
            subscription: { include: { plan: true } },
          },
        },
      },
    });
  } catch (error) {
    console.error("Failed to read workspace settings:", error);
    return <SettingsUnavailableState />;
  }

  if (!membership) return <SettingsWorkspaceRequiredState />;

  const { organization, role } = membership;
  let records: Awaited<ReturnType<typeof loadWorkspaceSettings>>;
  try {
    records = await loadWorkspaceSettings(prisma, organization.id);
  } catch (error) {
    console.error("Failed to load workspace settings records:", error);
    return <SettingsUnavailableState />;
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 md:px-6 flex flex-col gap-6 bg-transparent min-h-screen text-studio-ink">
      <header className="flex flex-col gap-1 border-b border-studio-line pb-6">
        <p className="text-xs font-bold text-studio-tag uppercase tracking-widest">Workspace controls</p>
        <h1 id="settings-heading" className="text-3xl font-black text-studio-ink tracking-tight">Studio Settings</h1>
        <p className="text-sm text-studio-muted">
          Manage persisted workspace details, existing access, support, and audit records for <span className="font-bold text-[#f0b765]">{organization.name}</span>.
        </p>
      </header>

      <SettingsClientView
        initialOrg={organization}
        initialMembers={records.members}
        initialEvents={records.events}
        initialFeedback={records.feedbackTickets}
        plans={records.plans}
        currentUserRole={role}
        currentUserId={session.user.id}
        initialKbData={records.kbData}
      />
    </div>
  );
}
