import React from "react";
import { getOrCreateUserOrgAction, getOrgMembersAction, getOrgEventsAction, getOrgFeedbackTicketsAction } from "./actions";
import { getPrismaClient } from "@/lib/prisma";
import { SettingsClientView } from "./settings-client-view";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "SaaS Settings & Subscription - Quipsly",
  description: "Manage your organization details, invite team members, adjust subscriptions, view logs, and submit feedback.",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  // Get or bootstrap the user's organization
  let orgData;
  try {
    orgData = await getOrCreateUserOrgAction();
  } catch (error) {
    console.error("Failed to bootstrap SaaS organization:", error);
    return (
      <div className="p-8 text-center bg-[#032321] border border-studio-line rounded-2xl max-w-lg mx-auto mt-20">
        <h2 className="text-xl font-bold text-studio-danger mb-2">Workspace Uninitialized</h2>
        <p className="text-studio-muted text-sm mb-4">
          We encountered an issue provisioning your SaaS organization context. Please ensure you are logged in with correct roles.
        </p>
      </div>
    );
  }

  const { organization, role } = orgData;

  // Retrieve organization data
  const prisma = getPrismaClient();
  const members = await getOrgMembersAction(organization.id);
  const events = await getOrgEventsAction(organization.id);
  const feedbackTickets = await getOrgFeedbackTicketsAction(organization.id);
  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: { price: "asc" }
  });

  const kbData = await prisma.knowledgeCategory.findMany({
    include: {
      articles: {
        orderBy: { order: "asc" }
      }
    },
    orderBy: { order: "asc" }
  });

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 md:px-6 flex flex-col gap-6 bg-transparent min-h-screen text-studio-ink">
      <header className="flex flex-col gap-1 border-b border-studio-line pb-6">
        <p className="text-xs font-bold text-studio-tag uppercase tracking-widest">SaaS Workbench</p>
        <h1 id="settings-heading" className="text-3xl font-black text-studio-ink tracking-tight">Studio Settings</h1>
        <p className="text-sm text-studio-muted">
          Manage identity, roles, custom billing configurations, and customer support metrics for <span className="font-bold text-[#f0b765]">{organization.name}</span>.
        </p>
      </header>

      <SettingsClientView
        initialOrg={organization}
        initialMembers={members}
        initialEvents={events}
        initialFeedback={feedbackTickets}
        plans={plans}
        currentUserRole={role}
        currentUserId={session.user.id}
        initialKbData={kbData}
      />
    </div>
  );
}
