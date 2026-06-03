"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { OrganizationRole, SubscriptionStatus, FeedbackTicketType, FeedbackTicketStatus } from "@prisma/client";

// Helper to assert authentication
async function getSessionUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized. Please sign in.");
  }
  return session.user;
}

// 1. Get or Bootstrap User's Organization
export async function getOrCreateUserOrgAction() {
  const user = await getSessionUser();
  const prisma = getPrismaClient();

  // Find existing organization membership
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
    include: {
      organization: {
        include: {
          subscription: {
            include: {
              plan: true,
            },
          },
        },
      },
    },
  });

  if (membership) {
    return {
      organization: membership.organization,
      role: membership.role,
    };
  }

  // No organization found, bootstrap a default one
  const slug = `studio-${user.id.slice(-6)}-${Math.random().toString(36).substring(2, 6)}`;
  const orgName = user.name ? `${user.name}'s Studio` : "My Creative Studio";

  // Bootstrap subscription plans if they do not exist
  let freePlan = await prisma.subscriptionPlan.findFirst({
    where: { name: "Free Tier" },
  });

  if (!freePlan) {
    freePlan = await prisma.subscriptionPlan.create({
      data: {
        name: "Free Tier",
        price: 0,
        currency: "usd",
        interval: "month",
      },
    });

    // Also bootstrap Pro and Studio tiers
    await prisma.subscriptionPlan.create({
      data: {
        name: "Pro Creator",
        price: 2900, // $29
        currency: "usd",
        stripeProductId: "prod_pro_creator",
        interval: "month",
      },
    });

    await prisma.subscriptionPlan.create({
      data: {
        name: "Agency Studio",
        price: 9900, // $99
        currency: "usd",
        stripeProductId: "prod_agency_studio",
        interval: "month",
      },
    });
  }

  // Create organization, membership, and trial subscription in a transaction
  const newOrg = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: orgName,
        slug,
        description: "Bespoke SaaS Workspace for Creative Collaboration",
      },
    });

    await tx.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: OrganizationRole.OWNER,
      },
    });

    await tx.subscription.create({
      data: {
        organizationId: org.id,
        planId: freePlan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    // Track creation event
    await tx.userEvent.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        eventName: "Organization Bootstrapped",
        payloadJson: JSON.stringify({ name: orgName, slug }),
      },
    });

    return org;
  });

  const refreshedOrg = await prisma.organization.findUnique({
    where: { id: newOrg.id },
    include: {
      subscription: {
        include: {
          plan: true,
        },
      },
    },
  });

  revalidatePath("/settings");

  return {
    organization: refreshedOrg!,
    role: OrganizationRole.OWNER,
  };
}

// 2. Update Organization details
export async function updateOrgDetailsAction(orgId: string, name: string, description: string) {
  const user = await getSessionUser();
  const prisma = getPrismaClient();

  // Validate permission (OWNER or ADMIN)
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
  });

  if (!member || (member.role !== OrganizationRole.OWNER && member.role !== OrganizationRole.ADMIN)) {
    return { ok: false, error: "Unauthorized: Only Owners and Admins can edit details." };
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: { name, description },
  });

  await prisma.userEvent.create({
    data: {
      userId: user.id,
      organizationId: orgId,
      eventName: "Organization Details Updated",
      payloadJson: JSON.stringify({ name, description }),
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

// 3. Invite Team Member
export async function inviteTeamMemberAction(orgId: string, email: string, role: OrganizationRole) {
  const user = await getSessionUser();
  const prisma = getPrismaClient();

  const callerMember = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
  });

  if (!callerMember || (callerMember.role !== OrganizationRole.OWNER && callerMember.role !== OrganizationRole.ADMIN)) {
    return { ok: false, error: "Unauthorized to invite team members." };
  }

  // Find or create target user
  let targetUser = await prisma.user.findFirst({
    where: { primaryEmail: email.trim().toLowerCase() },
  });

  if (!targetUser) {
    targetUser = await prisma.user.create({
      data: {
        primaryEmail: email.trim().toLowerCase(),
        name: email.split("@")[0],
      },
    });
  }

  // Check if already member
  const existingMember = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: targetUser.id } },
  });

  if (existingMember) {
    return { ok: false, error: "User is already a member of this organization." };
  }

  await prisma.organizationMember.create({
    data: {
      organizationId: orgId,
      userId: targetUser.id,
      role,
    },
  });

  await prisma.userEvent.create({
    data: {
      userId: user.id,
      organizationId: orgId,
      eventName: "Team Member Added",
      payloadJson: JSON.stringify({ invitedEmail: email, role }),
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

// 4. Remove Team Member
export async function removeTeamMemberAction(orgId: string, memberId: string) {
  const user = await getSessionUser();
  const prisma = getPrismaClient();

  const callerMember = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
  });

  if (!callerMember || (callerMember.role !== OrganizationRole.OWNER && callerMember.role !== OrganizationRole.ADMIN)) {
    return { ok: false, error: "Unauthorized to remove team members." };
  }

  const targetMember = await prisma.organizationMember.findUnique({
    where: { id: memberId },
    include: { user: true },
  });

  if (!targetMember) {
    return { ok: false, error: "Member not found." };
  }

  if (targetMember.role === OrganizationRole.OWNER && callerMember.role !== OrganizationRole.OWNER) {
    return { ok: false, error: "Only the Owner can remove other Owners." };
  }

  if (targetMember.userId === user.id) {
    return { ok: false, error: "You cannot remove yourself. Transfer ownership first." };
  }

  await prisma.organizationMember.delete({
    where: { id: memberId },
  });

  await prisma.userEvent.create({
    data: {
      userId: user.id,
      organizationId: orgId,
      eventName: "Team Member Removed",
      payloadJson: JSON.stringify({ removedEmail: targetMember.user.primaryEmail }),
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

// 5. Update Member Role
export async function updateMemberRoleAction(orgId: string, memberId: string, role: OrganizationRole) {
  const user = await getSessionUser();
  const prisma = getPrismaClient();

  const callerMember = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
  });

  if (!callerMember || (callerMember.role !== OrganizationRole.OWNER && callerMember.role !== OrganizationRole.ADMIN)) {
    return { ok: false, error: "Unauthorized to modify roles." };
  }

  const targetMember = await prisma.organizationMember.findUnique({
    where: { id: memberId },
    include: { user: true },
  });

  if (!targetMember) {
    return { ok: false, error: "Member not found." };
  }

  if (targetMember.role === OrganizationRole.OWNER && callerMember.role !== OrganizationRole.OWNER) {
    return { ok: false, error: "Only the Owner can modify Owner roles." };
  }

  await prisma.organizationMember.update({
    where: { id: memberId },
    data: { role },
  });

  await prisma.userEvent.create({
    data: {
      userId: user.id,
      organizationId: orgId,
      eventName: "Team Member Role Updated",
      payloadJson: JSON.stringify({ memberEmail: targetMember.user.primaryEmail, newRole: role }),
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

// 6. Update Subscription (Billing Engine simulation)
export async function updateSubscriptionAction(orgId: string, planId: string, status: SubscriptionStatus) {
  const user = await getSessionUser();
  const prisma = getPrismaClient();

  const callerMember = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
  });

  if (!callerMember || callerMember.role !== OrganizationRole.OWNER) {
    return { ok: false, error: "Unauthorized: Only the Owner can modify subscriptions." };
  }

  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) return { ok: false, error: "Plan not found." };

  await prisma.subscription.update({
    where: { organizationId: orgId },
    data: {
      planId,
      status,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Extends 30 days
    },
  });

  await prisma.userEvent.create({
    data: {
      userId: user.id,
      organizationId: orgId,
      eventName: "Subscription Modified",
      payloadJson: JSON.stringify({ newPlan: plan.name, status }),
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

// 7. Submit Feedback Ticket
export async function createFeedbackAction(title: string, description: string, type: FeedbackTicketType) {
  const user = await getSessionUser();
  const prisma = getPrismaClient();

  // Find organization
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
  });

  const ticket = await prisma.feedbackTicket.create({
    data: {
      userId: user.id,
      organizationId: membership?.organizationId || null,
      title,
      description,
      type,
      status: FeedbackTicketStatus.OPEN,
    },
  });

  await prisma.userEvent.create({
    data: {
      userId: user.id,
      organizationId: membership?.organizationId || null,
      eventName: "Feedback Ticket Submitted",
      payloadJson: JSON.stringify({ ticketId: ticket.id, type, title }),
    },
  });

  revalidatePath("/settings");
  return { ok: true, ticket };
}

// 8. Retrieve Organization Members
export async function getOrgMembersAction(orgId: string) {
  const user = await getSessionUser();
  const prisma = getPrismaClient();

  // Validate caller belongs to org
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
  });

  if (!member) {
    throw new Error("Unauthorized to access organization member roster.");
  }

  return prisma.organizationMember.findMany({
    where: { organizationId: orgId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          primaryEmail: true,
          image: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

// 9. Retrieve Organization Events (Activity logs)
export async function getOrgEventsAction(orgId: string) {
  const user = await getSessionUser();
  const prisma = getPrismaClient();

  // Validate caller belongs to org
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
  });

  if (!member) {
    throw new Error("Unauthorized to access organization event logs.");
  }

  return prisma.userEvent.findMany({
    where: { organizationId: orgId },
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
}

// 10. Retrieve Feedback Tickets History
export async function getOrgFeedbackTicketsAction(orgId: string) {
  const user = await getSessionUser();
  const prisma = getPrismaClient();

  return prisma.feedbackTicket.findMany({
    where: {
      OR: [
        { organizationId: orgId },
        { userId: user.id }
      ]
    },
    include: {
      user: {
        select: {
          name: true,
          primaryEmail: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
