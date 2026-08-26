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
      description: "Schedule a Session, invite a client, record, and follow through.",
      order: 1,
    },
  });

  const catBilling = await prisma.knowledgeCategory.create({
    data: {
      name: "Billing & Subscriptions",
      slug: "billing-subscriptions",
      description: "Quipsly Coach pricing, free trials, renewals, and cancellation.",
      order: 2,
    },
  });

  const catSupport = await prisma.knowledgeCategory.create({
    data: {
      name: "Support & Ticketing",
      slug: "support-ticketing",
      description: "Get help with accounts, Sessions, recordings, and recovery.",
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

Quipsly brings the conversation and the work it creates into one calm place. Coaches can schedule a Session, invite a client, meet and record, correct the transcript, and keep shared notes, tasks, and goals moving together.

## Your first coaching Session
1. Open **Coaching** and choose **Schedule Session**.
2. Add the client email, time, and timezone, then send the invitation.
3. Open the Session a few minutes early to check your microphone and camera.
4. Join the call and choose Record after everyone has consented.
5. After the call, open the transcript, recording, notes, tasks, and goals from the same Session.

Invited clients join free from a phone, tablet, or computer.`,
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

Quipsly keeps personal work, practice administration, client relationships, and shared Session work separate. People see only the spaces and Sessions available to their account.

## Workspace Roles
- **Owner**: Manages the practice, subscription, members, and settings.
- **Admin**: Helps manage members and practice settings.
- **Coach**: Schedules Sessions and works with assigned coaching relationships.
- **Client**: Joins invited Sessions and uses the work shared with them.

Invite practice members from **Settings**. Invite coaching clients while scheduling or from the client relationship.`,
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

Quipsly Coach is one complete plan. Coaches subscribe; invited clients join and collaborate free.

## Pricing
- **Monthly:** $29.99 per month.
- **Annual:** $299.99 per year.
- **Free trial:** 14 days for eligible new subscribers.

Every plan includes scheduling, client invitations, calls, participant-owned recording, transcription, basic editing, and shared notes, tasks, and goals. Subscriptions purchased on iPhone renew automatically until canceled and are managed from **Settings -> Subscription** or your Apple Account.`,
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

Spotted a bug or have a feature idea? Send it from Quipsly so the app version and useful diagnostics can travel with the report.

## Steps to Submit
1. Navigate to **Settings**.
2. Select the **Feedback & Support** tab.
3. Choose the type of ticket (Bug Report, Feature Request, or General).
4. Fill out the subject and description details, then click **Submit Ticket**.

Never include a password, authentication code, private recording, coaching transcript, or unpublished source file in a support message.`,
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
