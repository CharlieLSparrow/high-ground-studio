import React from "react";
import { getPrismaClient } from "@/lib/prisma";
import { CampaignSandboxClient } from "./CampaignSandboxClient";
import { getOrCreateUserOrgAction } from "@/app/(app)/settings/actions";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const session = await auth();
  const isDev = process.env.NODE_ENV === "development";
  const isOwner = Array.isArray(session?.user?.roles) && session.user.roles.includes("OWNER");

  if (!session?.user?.id) {
    redirect("/");
  }

  if (!isDev && !isOwner) {
    redirect("/content-studio");
  }

  // Get or bootstrap organization context
  let orgData;
  try {
    orgData = await getOrCreateUserOrgAction();
  } catch (error) {
    console.error("Failed to bootstrap organization for marketing context:", error);
    return (
      <>
        <div className="p-8 text-center bg-[#032321] border border-studio-line rounded-2xl max-w-lg mx-auto mt-20 text-studio-ink">
          <h2 className="text-xl font-bold text-studio-danger mb-2">Workspace Uninitialized</h2>
          <p className="text-studio-muted text-sm">
            Please verify your Google authentication credentials and organization role.
          </p>
        </div>
      </>
    );
  }

  const { organization } = orgData;
  const prisma = getPrismaClient();

  // Fetch marketing records scoped to the active organization
  const campaigns = await prisma.marketingCampaign.findMany({
    where: { organizationId: organization.id },
    include: {
      landingPages: true,
      emailSequences: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const avatars = await prisma.marketingPersona.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  const landingPages = await prisma.landingPage.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "desc" },
  });

  const emailSequences = await prisma.emailSequence.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "desc" },
  });

  const leads = await prisma.marketingLead.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <CampaignSandboxClient
        initialCampaigns={campaigns}
        avatars={avatars}
        landingPages={landingPages}
        emailSequences={emailSequences}
        leads={leads}
        organization={organization}
      />
    </>
  );
}
