"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { resolveTeamAccess } from "@/lib/content-access";
import {
  createWorldHubMonetizationResearchNote,
  createWorldHubMonetizationPlacement,
  createWorldHubSeoBrief,
  recordWorldHubAnalyticsSnapshot,
  seedWorldHubGrowthFoundation,
  seedWorldHubMonetizationResearch,
} from "@/lib/server/worldhub-growth";
import { upsertWorldHubProviderConnections } from "@/lib/server/worldhub-integrations";

function buildRedirect(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `/team/growth?${search.toString()}`;
}

function getFormText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parseDate(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getOwnerEmail(access: Awaited<ReturnType<typeof resolveTeamAccess>>) {
  return (
    access.session?.user?.primaryEmail?.trim().toLowerCase() ||
    access.email?.trim().toLowerCase() ||
    ""
  );
}

async function requireTeamOperator() {
  const access = await resolveTeamAccess();

  if (!access.isSignedIn || !access.isTeam) {
    redirect("/api/auth/signin?callbackUrl=%2Fteam%2Fgrowth");
  }

  const ownerEmail = getOwnerEmail(access);

  if (!ownerEmail) {
    redirect(buildRedirect({ error: "Session is missing a usable email." }));
  }

  return ownerEmail;
}

export async function seedGrowthFoundationAction() {
  const createdByEmail = await requireTeamOperator();

  try {
    await upsertWorldHubProviderConnections();
    await seedWorldHubGrowthFoundation(createdByEmail);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to seed Growth foundation.";
    redirect(buildRedirect({ error: message }));
  }

  revalidatePath("/team/growth");
  revalidatePath("/team/worldhub");
  redirect(buildRedirect({ success: "Growth foundation seeded." }));
}

export async function seedMonetizationResearchAction() {
  const createdByEmail = await requireTeamOperator();

  try {
    await seedWorldHubMonetizationResearch(createdByEmail);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to seed monetization research.";
    redirect(buildRedirect({ error: message }));
  }

  revalidatePath("/team/growth");
  redirect(buildRedirect({ success: "Monetization research seeded." }));
}

export async function createSeoBriefAction(formData: FormData) {
  const createdByEmail = await requireTeamOperator();

  try {
    await createWorldHubSeoBrief({
      slug: getFormText(formData, "slug"),
      title: getFormText(formData, "title"),
      contentKind: getFormText(formData, "contentKind"),
      status: getFormText(formData, "status"),
      targetPath: getFormText(formData, "targetPath"),
      targetUrl: getFormText(formData, "targetUrl"),
      primaryKeyword: getFormText(formData, "primaryKeyword"),
      secondaryKeywords: getFormText(formData, "secondaryKeywords"),
      searchIntent: getFormText(formData, "searchIntent"),
      audience: getFormText(formData, "audience"),
      metaTitle: getFormText(formData, "metaTitle"),
      metaDescription: getFormText(formData, "metaDescription"),
      canonicalUrl: getFormText(formData, "canonicalUrl"),
      ogTitle: getFormText(formData, "ogTitle"),
      ogDescription: getFormText(formData, "ogDescription"),
      structuredDataType: getFormText(formData, "structuredDataType"),
      notes: getFormText(formData, "notes"),
      createdByEmail,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save SEO brief.";
    redirect(buildRedirect({ error: message }));
  }

  revalidatePath("/team/growth");
  redirect(buildRedirect({ success: "SEO brief saved." }));
}

export async function createResearchNoteAction(formData: FormData) {
  const createdByEmail = await requireTeamOperator();

  try {
    await createWorldHubMonetizationResearchNote({
      slug: getFormText(formData, "researchSlug"),
      title: getFormText(formData, "researchTitle"),
      projectProfile: getFormText(formData, "projectProfile"),
      monetizationType: getFormText(formData, "monetizationType"),
      status: getFormText(formData, "researchStatus"),
      confidence: getFormText(formData, "confidence"),
      sourceTitle: getFormText(formData, "sourceTitle"),
      sourceUrl: getFormText(formData, "sourceUrl"),
      sourcePublisher: getFormText(formData, "sourcePublisher"),
      sourceDate: getFormText(formData, "sourceDate"),
      summary: getFormText(formData, "summary"),
      takeaways: getFormText(formData, "takeaways"),
      recommendedUse: getFormText(formData, "recommendedUse"),
      risks: getFormText(formData, "risks"),
      nextActions: getFormText(formData, "nextActions"),
      tags: getFormText(formData, "tags"),
      createdByEmail,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save research note.";
    redirect(buildRedirect({ error: message }));
  }

  revalidatePath("/team/growth");
  redirect(buildRedirect({ success: "Research note saved." }));
}

export async function recordAnalyticsSnapshotAction(formData: FormData) {
  const capturedByEmail = await requireTeamOperator();
  const periodStart = parseDate(getFormText(formData, "periodStart"));
  const periodEnd = parseDate(getFormText(formData, "periodEnd"));

  if (!periodStart || !periodEnd) {
    redirect(buildRedirect({ error: "Analytics period dates are required." }));
  }

  try {
    await recordWorldHubAnalyticsSnapshot({
      source: getFormText(formData, "source"),
      channel: getFormText(formData, "channel"),
      contentPath: getFormText(formData, "contentPath"),
      periodStart,
      periodEnd,
      pageViews: getFormText(formData, "pageViews"),
      sessions: getFormText(formData, "sessions"),
      users: getFormText(formData, "users"),
      clicks: getFormText(formData, "clicks"),
      impressions: getFormText(formData, "impressions"),
      conversions: getFormText(formData, "conversions"),
      revenueCents: getFormText(formData, "revenueCents"),
      notes: getFormText(formData, "notes"),
      capturedByEmail,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to record analytics snapshot.";
    redirect(buildRedirect({ error: message }));
  }

  revalidatePath("/team/growth");
  redirect(buildRedirect({ success: "Analytics snapshot recorded." }));
}

export async function createMonetizationPlacementAction(formData: FormData) {
  const createdByEmail = await requireTeamOperator();

  try {
    await createWorldHubMonetizationPlacement({
      slug: getFormText(formData, "slug"),
      placementType: getFormText(formData, "placementType"),
      status: getFormText(formData, "status"),
      targetPath: getFormText(formData, "targetPath"),
      providerKey: getFormText(formData, "providerKey"),
      displayName: getFormText(formData, "displayName"),
      destinationUrl: getFormText(formData, "destinationUrl"),
      disclosureText: getFormText(formData, "disclosureText"),
      callToAction: getFormText(formData, "callToAction"),
      affiliateProgram: getFormText(formData, "affiliateProgram"),
      productAuthor: getFormText(formData, "productAuthor"),
      productIsbn: getFormText(formData, "productIsbn"),
      adSlot: getFormText(formData, "adSlot"),
      sponsorCategory: getFormText(formData, "sponsorCategory"),
      createdByEmail,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save monetization placement.";
    redirect(buildRedirect({ error: message }));
  }

  revalidatePath("/team/growth");
  redirect(buildRedirect({ success: "Monetization placement saved." }));
}
