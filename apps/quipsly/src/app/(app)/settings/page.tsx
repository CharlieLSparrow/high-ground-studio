import React from "react";
import Link from "next/link";
import { CircleAlert, RotateCcw } from "lucide-react";
import { getOrgMembersAction, getOrgEventsAction, getOrgFeedbackTicketsAction } from "./actions";
import { getPrismaClient } from "@/lib/prisma";
import { SettingsClientView } from "./settings-client-view";
import { auth } from "@/auth";
import { StudioAccessShell } from "../studio-access-shell";
import { ensureQuipslyBillingContext } from "@/lib/server/subscription-entitlements";

export const metadata = {
  title: "Settings - Quipsly",
  description: "Manage your Quipsly workspace, access, subscription, and support.",
};

export const dynamic = "force-dynamic";

function SettingsUnavailableState() {
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
  includeStaffTools: boolean,
) {
  const [members, events, feedbackTickets, kbData] = await Promise.all([
    getOrgMembersAction(organizationId),
    getOrgEventsAction(organizationId),
    getOrgFeedbackTicketsAction(organizationId),
    includeStaffTools
      ? prisma.knowledgeCategory.findMany({
          include: { articles: { orderBy: { order: "asc" } } },
          orderBy: { order: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return { members, events, feedbackTickets, kbData };
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return <StudioAccessShell mode="signed-out" redirectTo="/settings" />;
  }

  const prisma = getPrismaClient();
  let entitlement;
  try {
    // A signed-in person should never have to understand or provision an
    // Organization record before Settings works. This idempotently supplies
    // the private account workspace and its account-wide access record.
    entitlement = await ensureQuipslyBillingContext({
      prisma,
      user: { id: session.user.id, name: session.user.name },
    });
  } catch (error) {
    console.error("Failed to prepare Quipsly account settings:", error);
    return <SettingsUnavailableState />;
  }

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

  if (!membership) return <SettingsUnavailableState />;

  const { organization, role } = membership;
  let records: Awaited<ReturnType<typeof loadWorkspaceSettings>>;
  try {
    records = await loadWorkspaceSettings(
      prisma,
      organization.id,
      session.user.isStaff === true,
    );
  } catch (error) {
    console.error("Failed to load workspace settings records:", error);
    return <SettingsUnavailableState />;
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 md:px-6 flex flex-col gap-6 bg-transparent min-h-screen text-studio-ink">
      <header className="flex flex-col gap-1 border-b border-studio-line pb-6">
        <p className="text-xs font-bold text-studio-tag uppercase tracking-widest">Workspace controls</p>
        <h1 id="settings-heading" className="text-3xl font-black text-studio-ink tracking-tight">Quipsly Settings</h1>
        <p className="text-sm text-studio-muted">
          Manage persisted workspace details, existing access, support, and audit records for <span className="font-bold text-[#f0b765]">{organization.name}</span>.
        </p>
      </header>

      <SettingsClientView
        initialOrg={organization}
        initialMembers={records.members}
        initialEvents={records.events}
        initialFeedback={records.feedbackTickets}
        currentUserRole={role}
        currentUserId={session.user.id}
        currentUserIsStaff={session.user.isStaff === true}
        initialEntitlement={entitlement}
        initialKbData={records.kbData}
      />
    </div>
  );
}
