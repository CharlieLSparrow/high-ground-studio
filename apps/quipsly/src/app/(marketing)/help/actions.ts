"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { OrganizationRole } from "@prisma/client";

// Helper to check for Admin permission in settings
async function assertAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized. Please sign in.");
  }
  const prisma = getPrismaClient();
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: session.user.id },
  });

  if (!membership || (membership.role !== OrganizationRole.OWNER && membership.role !== OrganizationRole.ADMIN)) {
    throw new Error("Forbidden. Admin access required.");
  }
  return session.user;
}

// 1. Bootstrap/Seed baseline Help Center documents
export async function bootstrapHelpDocsAction() {
  const prisma = getPrismaClient();

  const count = await prisma.knowledgeCategory.count();
  if (count > 0) return { ok: true };

  // Create default categories
  const catGettingStarted = await prisma.knowledgeCategory.create({
    data: {
      name: "Getting Started",
      slug: "getting-started",
      description: "Learn the foundational concepts and setting up your workspace.",
      order: 1,
    },
  });

  const catBilling = await prisma.knowledgeCategory.create({
    data: {
      name: "Billing & Subscriptions",
      slug: "billing-subscriptions",
      description: "Details on subscription tiers, invoicing, and Stripe setups.",
      order: 2,
    },
  });

  const catSupport = await prisma.knowledgeCategory.create({
    data: {
      name: "Support & Ticketing",
      slug: "support-ticketing",
      description: "How to report issues or submit feedback features to our team.",
      order: 3,
    },
  });

  // Create baseline articles
  await prisma.knowledgeArticle.create({
    data: {
      categoryId: catGettingStarted.id,
      title: "Welcome to Quipsly",
      slug: "welcome-to-quipsly",
      content: `# Welcome to Quipsly!

Quipsly is the all-in-one operating platform built specifically for small-team content creators, authors, and coaches. Our mission is to help you build tools that adapt to the way you think, not the other way around.

## Core Features
1. **Pre-Production Storyboarding**: Visually map out your shots and link script dialogue seamlessly.
2. **Growth CRM & Campaign Builder**: Group leads, create target email lists, and dispatch landing sequences.
3. **Analytics Pipeline**: Audit performance metrics and view data rollups in real-time.

Get started by navigating to **The Nest** and starting your first project!`,
      isPublished: true,
      order: 1,
    },
  });

  await prisma.knowledgeArticle.create({
    data: {
      categoryId: catGettingStarted.id,
      title: "Managing Your Workspace",
      slug: "managing-your-workspace",
      content: `# Managing Your Workspace

With Quipsly, you can collaborate with your team in a shared workspace. Members carry specific authorization grants.

## Workspace Roles
- **Owner**: Full access to settings, invitation, role modification, and Stripe configurations.
- **Admin**: Invites members and configures settings, but cannot delete the organization.
- **Editor**: Can create and edit storyboards, landing pages, and email sequences.
- **Viewer**: Read-only access to browse assets.

Invite team members under **Settings -> Profile & Team** to start collaborating!`,
      isPublished: true,
      order: 2,
    },
  });

  await prisma.knowledgeArticle.create({
    data: {
      categoryId: catBilling.id,
      title: "How Subscriptions & Billing Work",
      slug: "how-subscriptions-work",
      content: `# How Subscriptions Work

Quipsly scales with your production demands. We offer transparent subscription tiers built directly into our platform.

## Pricing Plans
1. **Free Tier**: Access for 1 creator, basic pre-production mapping, and simple support channels.
2. **Pro Creator ($29/mo)**: Multi-user support, unlimited assets upload, and extended CRM campaigns.
3. **Agency Studio ($99/mo)**: Full team seats, custom BI event logs tracking, and advanced templates.

Modify your active plan under **Settings -> Billing & Plans** instantly!`,
      isPublished: true,
      order: 1,
    },
  });

  await prisma.knowledgeArticle.create({
    data: {
      categoryId: catSupport.id,
      title: "Submitting Feedback & Bugs",
      slug: "submitting-feedback-bugs",
      content: `# Submitting Feedback & Bugs

Spotted a bug or have a feature recommendation? Submit it directly to our core engineering queue without leaving the app.

## Steps to Submit
1. Navigate to **Settings**.
2. Select the **Feedback & Support** tab.
3. Choose the type of ticket (Bug Report, Feature Request, or General).
4. Fill out the subject and description details, then click **Submit Ticket**.

Our engineering team will review it and update the status tag (OPEN -> IN_PROGRESS -> RESOLVED) in real-time.`,
      isPublished: true,
      order: 1,
    },
  });

  revalidatePath("/help");
  return { ok: true };
}

// 2. Create Category
export async function createCategoryAction(name: string, description: string, order: number = 0) {
  await assertAdmin();
  const prisma = getPrismaClient();

  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
  
  const category = await prisma.knowledgeCategory.create({
    data: { name, slug, description, order },
  });

  revalidatePath("/help");
  revalidatePath("/settings");
  return { ok: true, category };
}

// 3. Delete Category
export async function deleteCategoryAction(catId: string) {
  await assertAdmin();
  const prisma = getPrismaClient();

  await prisma.knowledgeCategory.delete({
    where: { id: catId },
  });

  revalidatePath("/help");
  revalidatePath("/settings");
  return { ok: true };
}

// 4. Upsert (Create/Update) Article
export async function upsertArticleAction(
  id: string | null,
  categoryId: string,
  title: string,
  slug: string,
  content: string,
  isPublished: boolean,
  order: number = 0
) {
  await assertAdmin();
  const prisma = getPrismaClient();

  let article;
  const formattedSlug = slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");

  if (id) {
    article = await prisma.knowledgeArticle.update({
      where: { id },
      data: { categoryId, title, slug: formattedSlug, content, isPublished, order },
    });
  } else {
    article = await prisma.knowledgeArticle.create({
      data: { categoryId, title, slug: formattedSlug, content, isPublished, order },
    });
  }

  revalidatePath("/help");
  revalidatePath("/settings");
  return { ok: true, article };
}

// 5. Delete Article
export async function deleteArticleAction(articleId: string) {
  await assertAdmin();
  const prisma = getPrismaClient();

  await prisma.knowledgeArticle.delete({
    where: { id: articleId },
  });

  revalidatePath("/help");
  revalidatePath("/settings");
  return { ok: true };
}

// 6. Fetch Categories for Admin list
export async function getAdminKbDataAction() {
  await assertAdmin();
  const prisma = getPrismaClient();

  const categories = await prisma.knowledgeCategory.findMany({
    include: {
      articles: {
        orderBy: { order: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });

  return categories;
}
