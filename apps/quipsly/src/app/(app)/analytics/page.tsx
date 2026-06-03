import React from "react";
import { getOrCreateUserOrgAction } from "@/app/(app)/settings/actions";
import { getPrismaClient } from "@/lib/prisma";
import { AnalyticsClientView } from "./analytics-client-view";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Studio Analytics & Business Intelligence - Quipsly",
  description: "View funnel conversions, email campaign dispatch metrics, product-led growth telemetry, and 3D audience retention waveforms.",
};

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  // Get or bootstrap organization context
  let orgData;
  try {
    orgData = await getOrCreateUserOrgAction();
  } catch (error) {
    console.error("Failed to bootstrap organization for analytics context:", error);
    return (
      <div className="p-8 text-center bg-[#032321] border border-studio-line rounded-2xl max-w-lg mx-auto mt-20 text-studio-ink">
        <h2 className="text-xl font-bold text-studio-danger mb-2">Workspace Uninitialized</h2>
        <p className="text-studio-muted text-sm">
          Please verify your Google authentication credentials and organization role.
        </p>
      </div>
    );
  }

  const { organization } = orgData;
  const prisma = getPrismaClient();

  // 1. Funnel metrics (Landing page Views and conversions)
  const funnelAgg = await prisma.landingPage.aggregate({
    where: { organizationId: organization.id },
    _sum: {
      views: true,
      conversions: true,
    },
  });

  const funnelViews = funnelAgg._sum.views || 0;
  const funnelConversions = funnelAgg._sum.conversions || 0;

  // 2. CRM Leads count
  const funnelLeads = await prisma.marketingLead.count({
    where: { organizationId: organization.id },
  });

  // 3. Campaign Dispatch metrics from UserEvent logs
  const dispatched = await prisma.userEvent.count({
    where: { organizationId: organization.id, eventName: "Email Campaign Dispatched" },
  });
  const opened = await prisma.userEvent.count({
    where: { organizationId: organization.id, eventName: "Campaign Email Opened" },
  });
  const clicked = await prisma.userEvent.count({
    where: { organizationId: organization.id, eventName: "Campaign Link Clicked" },
  });
  const bounced = await prisma.userEvent.count({
    where: { organizationId: organization.id, eventName: "Campaign Dispatch Bounced" },
  });

  // 4. Live Activity Stream (Recent events)
  const eventsLog = await prisma.userEvent.findMany({
    where: { organizationId: organization.id },
    include: {
      user: {
        select: {
          name: true,
          primaryEmail: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // 5. Event frequencies breakdown
  const eventBreakdown = await prisma.userEvent.groupBy({
    by: ["eventName"],
    where: { organizationId: organization.id },
    _count: {
      id: true,
    },
  });

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 md:px-6 flex flex-col bg-transparent text-studio-ink">
      <AnalyticsClientView
        funnelViews={funnelViews}
        funnelConversions={funnelConversions}
        funnelLeads={funnelLeads}
        campaignStats={{
          dispatched,
          opened,
          clicked,
          bounced,
        }}
        eventsLog={eventsLog}
        eventBreakdown={eventBreakdown}
        organization={organization}
      />
    </div>
  );
}
