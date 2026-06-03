"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";

// Helper to assert authentication
async function getSessionUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized. Please sign in.");
  }
  return session.user;
}

// 1. Seed/Bootstrap Marketing CRM Data for Organization
export async function bootstrapMarketingDataAction(orgId: string) {
  const user = await getSessionUser();
  const prisma = getPrismaClient();

  // Create a default Landing Page if none exist
  let landingPage = await prisma.landingPage.findFirst({
    where: { organizationId: orgId },
  });

  if (!landingPage) {
    landingPage = await prisma.landingPage.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        name: "Creator OS Blueprint",
        slug: "creator-blueprint",
        headline: "Free 7-Day Guide to Scale Your Content Engine",
        subheadline: "Discover the proprietary workflows used by premium creator studios.",
        views: 280,
        conversions: 145,
        status: "active",
      },
    });
  }

  // Create some realistic mock leads
  const existingLeadsCount = await prisma.marketingLead.count({
    where: { organizationId: orgId },
  });

  if (existingLeadsCount === 0) {
    const mockLeadsData = [
      { name: "Sarah Jenkins", email: "sarah@youtube-creator.co", status: "subscribed" },
      { name: "Marcus Aurelius", email: "marcus@meditations.com", status: "subscribed" },
      { name: "Jessica Chen", email: "jess@storyboard-media.io", status: "subscribed" },
      { name: "David Miller", email: "david@miller-podcasts.net", status: "subscribed" },
      { name: "Elena Rostova", email: "elena@vlog-network.ru", status: "subscribed" },
      { name: "Tom Reddle", email: "tom@magic-writing.co.uk", status: "unsubscribed" },
      { name: "Srinivas Raman", email: "srinivas@math-education.in", status: "subscribed" },
      { name: "Amara Okeke", email: "amara@creative-studios.ng", status: "subscribed" },
      { name: "Oliver Hansen", email: "oliver@hansen-films.dk", status: "subscribed" },
      { name: "Lucas Silva", email: "lucas@editing-forge.com.br", status: "subscribed" },
    ];

    await prisma.marketingLead.createMany({
      data: mockLeadsData.map((lead) => ({
        userId: user.id,
        organizationId: orgId,
        landingPageId: landingPage?.id,
        email: lead.email,
        name: lead.name,
        status: lead.status,
      })),
    });
  }

  // Create a default Email Sequence if none exist
  let sequence = await prisma.emailSequence.findFirst({
    where: { organizationId: orgId },
  });

  if (!sequence) {
    const defaultEmails = [
      {
        subject: "🚀 Welcome to Quipsly! Here is your Content OS Blueprint",
        body: "Hi {name},\n\nWelcome to the family. In this first step, we want to help you align your storyboards with your actual recording timelines.\n\nBest,\nThe Quipsly Crew",
        dayOffset: 0,
      },
      {
        subject: "🎨 Step 2: Custom Asset Library & B-Roll Tagging",
        body: "Hi {name},\n\nYesterday we spoke about storyboards. Today, let's explore your private Asset Vault where all your footage can be indexed instantly.\n\nKeep editing!",
        dayOffset: 2,
      },
      {
        subject: "💰 Step 3: Launching Your Paid Coaching Program",
        body: "Hi {name},\n\nIt's time to monetize. This is the final guide on configuring custom coaching feature gates inside your creator nest.\n\nCheers!",
        dayOffset: 5,
      },
    ];

    sequence = await prisma.emailSequence.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        name: "7-Day Creator Welcome Journey",
        status: "active",
        emailsJson: JSON.stringify(defaultEmails),
      },
    });
  }

  // Create a mock campaign to tie them together
  let campaign = await prisma.marketingCampaign.findFirst({
    where: { organizationId: orgId },
  });

  if (!campaign) {
    campaign = await prisma.marketingCampaign.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        name: "Summer Product Launch Campaign",
        description: "Orchestrating our 2026 digital product catalog rollout.",
        status: "active",
        startDate: new Date(),
        endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      },
    });

    // Link sequence and landing page to campaign
    await prisma.emailSequence.update({
      where: { id: sequence.id },
      data: { campaignId: campaign.id },
    });

    await prisma.landingPage.update({
      where: { id: landingPage.id },
      data: { campaignId: campaign.id },
    });
  }

  revalidatePath("/marketing/campaigns");
  return { ok: true };
}

// 2. Add New Marketing Lead
export async function createNewLeadAction(
  orgId: string,
  name: string,
  email: string,
  status: string,
  landingPageId?: string
) {
  const user = await getSessionUser();
  const prisma = getPrismaClient();

  const newLead = await prisma.marketingLead.create({
    data: {
      userId: user.id,
      organizationId: orgId,
      landingPageId: landingPageId || null,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      status: status || "subscribed",
    },
  });

  // Track event
  await prisma.userEvent.create({
    data: {
      userId: user.id,
      organizationId: orgId,
      eventName: "CRM Lead Added",
      payloadJson: JSON.stringify({ leadId: newLead.id, email: newLead.email }),
    },
  });

  revalidatePath("/marketing/campaigns");
  return { ok: true, lead: newLead };
}

// 3. Save Custom Email Steps into EmailSequence
export async function updateEmailSequenceAction(seqId: string, name: string, emails: any[]) {
  const user = await getSessionUser();
  const prisma = getPrismaClient();

  const updatedSequence = await prisma.emailSequence.update({
    where: { id: seqId },
    data: {
      name,
      emailsJson: JSON.stringify(emails),
    },
  });

  revalidatePath("/marketing/campaigns");
  return { ok: true, sequence: updatedSequence };
}

// 4. Dispatch Simulated Email Sequence to target segment (Logs telemetry events)
export async function dispatchSimulatedCampaignAction(
  orgId: string,
  campaignId: string,
  sequenceId: string,
  leadIds: string[]
) {
  const user = await getSessionUser();
  const prisma = getPrismaClient();

  const sequence = await prisma.emailSequence.findUnique({ where: { id: sequenceId } });
  if (!sequence) throw new Error("Email sequence not found.");

  const campaign = await prisma.marketingCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Marketing campaign not found.");

  const leads = await prisma.marketingLead.findMany({
    where: { id: { in: leadIds }, organizationId: orgId, status: "subscribed" },
  });

  if (leads.length === 0) {
    return { ok: false, error: "No subscribed leads in the selected target segment." };
  }

  const emailsList = JSON.parse(sequence.emailsJson as string);

  // Generate simulated dispatch events for each email step and recipient
  const userEventsData = [];

  for (const lead of leads) {
    for (let index = 0; index < emailsList.length; index++) {
      const emailStep = emailsList[index];

      // Event 1: Email Dispatched
      userEventsData.push({
        userId: user.id,
        organizationId: orgId,
        eventName: "Email Campaign Dispatched",
        payloadJson: JSON.stringify({
          campaignId,
          campaignName: campaign.name,
          sequenceId,
          sequenceName: sequence.name,
          leadId: lead.id,
          leadEmail: lead.email,
          emailStep: index + 1,
          subject: emailStep.subject,
        }),
      });

      // Random simulation logic:
      const randomValue = Math.random();

      if (randomValue < 0.05) {
        // Bounced
        userEventsData.push({
          userId: user.id,
          organizationId: orgId,
          eventName: "Campaign Dispatch Bounced",
          payloadJson: JSON.stringify({
            campaignId,
            leadEmail: lead.email,
            subject: emailStep.subject,
            error: "550 User mailbox unavailable",
          }),
        });
        // Stop subsequent steps for this lead since they bounced
        break;
      }

      if (randomValue < 0.75) {
        // Opened
        userEventsData.push({
          userId: user.id,
          organizationId: orgId,
          eventName: "Campaign Email Opened",
          payloadJson: JSON.stringify({
            campaignId,
            sequenceName: sequence.name,
            leadEmail: lead.email,
            emailStep: index + 1,
            openLatencyMs: Math.floor(Math.random() * 3600000), // opened within an hour
          }),
        });

        if (randomValue < 0.40) {
          // Clicked
          userEventsData.push({
            userId: user.id,
            organizationId: orgId,
            eventName: "Campaign Link Clicked",
            payloadJson: JSON.stringify({
              campaignId,
              sequenceName: sequence.name,
              leadEmail: lead.email,
              emailStep: index + 1,
              targetUrl: "https://quipsly.com/nest/welcome-blueprint",
            }),
          });
        }
      }
    }
  }

  // Batch insert all simulated telemetry event logs
  await prisma.userEvent.createMany({
    data: userEventsData,
  });

  revalidatePath("/marketing/campaigns");
  return { ok: true, processedLeadsCount: leads.length, eventsGeneratedCount: userEventsData.length };
}
