import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getWorldHubProviderDefinition,
  getWorldHubProviderReadiness,
  type WorldHubProviderDefinition,
  type WorldHubProviderReadiness,
} from "@/lib/worldhub/provider-definitions";
import {
  buildAnalyticsMetrics,
  buildMonetizationMetadata,
  buildSeoChecklist,
  DEFAULT_AFFILIATE_DISCLOSURE,
  normalizeContentPath,
  normalizeGrowthSlug,
  normalizeSourceUrl,
  scoreSeoChecklist,
  splitKeywordList,
  splitResearchList,
} from "@/lib/worldhub/growth-tools";

export const WORLDHUB_GROWTH_PROVIDER_KEYS = [
  "google-analytics",
  "google-search-console",
  "google-adsense",
  "affiliate-links",
  "direct-sponsors",
] as const;

type GrowthProviderKey = (typeof WORLDHUB_GROWTH_PROVIDER_KEYS)[number];

export type SeoBriefInput = {
  slug?: string;
  title: string;
  contentKind: string;
  status: string;
  targetPath?: string;
  targetUrl?: string;
  primaryKeyword?: string;
  secondaryKeywords?: string;
  searchIntent?: string;
  audience?: string;
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  structuredDataType?: string;
  notes?: string;
  createdByEmail?: string;
};

export type AnalyticsSnapshotInput = {
  source: string;
  channel: string;
  contentPath?: string;
  periodStart: Date;
  periodEnd: Date;
  pageViews?: string | number | null;
  sessions?: string | number | null;
  users?: string | number | null;
  clicks?: string | number | null;
  impressions?: string | number | null;
  conversions?: string | number | null;
  revenueCents?: string | number | null;
  notes?: string;
  capturedByEmail?: string;
};

export type MonetizationPlacementInput = {
  slug?: string;
  placementType: string;
  status: string;
  targetPath?: string;
  providerKey?: string;
  displayName: string;
  destinationUrl?: string;
  disclosureText?: string;
  callToAction?: string;
  affiliateProgram?: string;
  productAuthor?: string;
  productIsbn?: string;
  adSlot?: string;
  sponsorCategory?: string;
  createdByEmail?: string;
};

export type MonetizationResearchNoteInput = {
  slug?: string;
  title: string;
  projectProfile: string;
  monetizationType: string;
  status: string;
  confidence: string;
  sourceTitle: string;
  sourceUrl: string;
  sourcePublisher?: string;
  sourceDate?: string;
  summary: string;
  takeaways?: string;
  recommendedUse?: string;
  risks?: string;
  nextActions?: string;
  tags?: string;
  createdByEmail?: string;
};

export type WorldHubGrowthDashboard = {
  growthProviders: WorldHubProviderDefinition[];
  providerReadiness: WorldHubProviderReadiness[];
  seoBriefs: SeoBriefDto[];
  analyticsSnapshots: AnalyticsSnapshotDto[];
  monetizationPlacements: MonetizationPlacementDto[];
  monetizationResearchNotes: MonetizationResearchNoteDto[];
  counts: {
    seoBriefs: number;
    activeSeoBriefs: number;
    analyticsSnapshots: number;
    monetizationPlacements: number;
    readyPlacements: number;
    affiliatePlacements: number;
    adPlacements: number;
    researchNotes: number;
    highConfidenceResearchNotes: number;
  };
};

export type SeoBriefDto = {
  id: string;
  slug: string;
  title: string;
  contentKind: string;
  status: string;
  targetPath: string | null;
  primaryKeyword: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  structuredDataType: string | null;
  checklistScore: number;
  updatedAt: string;
};

export type AnalyticsSnapshotDto = {
  id: string;
  source: string;
  channel: string;
  contentPath: string | null;
  periodStart: string;
  periodEnd: string;
  metrics: Prisma.JsonValue;
  capturedAt: string;
};

export type MonetizationPlacementDto = {
  id: string;
  slug: string;
  placementType: string;
  status: string;
  targetPath: string | null;
  providerKey: string | null;
  displayName: string;
  destinationUrl: string | null;
  disclosureText: string | null;
  updatedAt: string;
};

export type MonetizationResearchNoteDto = {
  id: string;
  slug: string;
  title: string;
  projectProfile: string;
  monetizationType: string;
  status: string;
  confidence: string;
  sourceTitle: string;
  sourceUrl: string;
  sourcePublisher: string | null;
  summary: string;
  takeaways: string[];
  recommendedUse: string | null;
  risks: string[];
  nextActions: string[];
  tags: string[];
  updatedAt: string;
};

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function optionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanStatus(value: string, fallback = "draft") {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  return normalized || fallback;
}

function getGrowthProviderDefinitions() {
  return WORLDHUB_GROWTH_PROVIDER_KEYS.map((providerKey) =>
    getWorldHubProviderDefinition(providerKey),
  ).filter((definition): definition is WorldHubProviderDefinition =>
    Boolean(definition),
  );
}

function seoBriefToDto(
  brief: Awaited<ReturnType<typeof prisma.worldHubSeoBrief.findFirst>>,
): SeoBriefDto {
  if (!brief) {
    throw new Error("Missing SEO brief.");
  }

  const secondaryKeywords = Array.isArray(brief.secondaryKeywordsJson)
    ? brief.secondaryKeywordsJson.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const checklist = buildSeoChecklist({
    title: brief.title,
    targetPath: brief.targetPath,
    primaryKeyword: brief.primaryKeyword,
    secondaryKeywords,
    metaTitle: brief.metaTitle,
    metaDescription: brief.metaDescription,
    canonicalUrl: brief.canonicalUrl,
    structuredDataType: brief.structuredDataType,
  });

  return {
    id: brief.id,
    slug: brief.slug,
    title: brief.title,
    contentKind: brief.contentKind,
    status: brief.status,
    targetPath: brief.targetPath,
    primaryKeyword: brief.primaryKeyword,
    metaTitle: brief.metaTitle,
    metaDescription: brief.metaDescription,
    structuredDataType: brief.structuredDataType,
    checklistScore: scoreSeoChecklist(checklist),
    updatedAt: brief.updatedAt.toISOString(),
  };
}

function analyticsSnapshotToDto(
  snapshot: Awaited<
    ReturnType<typeof prisma.worldHubAnalyticsSnapshot.findFirst>
  >,
): AnalyticsSnapshotDto {
  if (!snapshot) {
    throw new Error("Missing analytics snapshot.");
  }

  return {
    id: snapshot.id,
    source: snapshot.source,
    channel: snapshot.channel,
    contentPath: snapshot.contentPath,
    periodStart: snapshot.periodStart.toISOString(),
    periodEnd: snapshot.periodEnd.toISOString(),
    metrics: snapshot.metricsJson,
    capturedAt: snapshot.capturedAt.toISOString(),
  };
}

function monetizationPlacementToDto(
  placement: Awaited<
    ReturnType<typeof prisma.worldHubMonetizationPlacement.findFirst>
  >,
): MonetizationPlacementDto {
  if (!placement) {
    throw new Error("Missing monetization placement.");
  }

  return {
    id: placement.id,
    slug: placement.slug,
    placementType: placement.placementType,
    status: placement.status,
    targetPath: placement.targetPath,
    providerKey: placement.providerKey,
    displayName: placement.displayName,
    destinationUrl: placement.destinationUrl,
    disclosureText: placement.disclosureText,
    updatedAt: placement.updatedAt.toISOString(),
  };
}

function stringArrayFromJson(value: Prisma.JsonValue) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function monetizationResearchNoteToDto(
  note: Awaited<
    ReturnType<typeof prisma.worldHubMonetizationResearchNote.findFirst>
  >,
): MonetizationResearchNoteDto {
  if (!note) {
    throw new Error("Missing monetization research note.");
  }

  return {
    id: note.id,
    slug: note.slug,
    title: note.title,
    projectProfile: note.projectProfile,
    monetizationType: note.monetizationType,
    status: note.status,
    confidence: note.confidence,
    sourceTitle: note.sourceTitle,
    sourceUrl: note.sourceUrl,
    sourcePublisher: note.sourcePublisher,
    summary: note.summary,
    takeaways: stringArrayFromJson(note.takeawaysJson),
    recommendedUse: note.recommendedUse,
    risks: stringArrayFromJson(note.risksJson),
    nextActions: stringArrayFromJson(note.nextActionsJson),
    tags: stringArrayFromJson(note.tagsJson),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export async function getWorldHubGrowthDashboard(): Promise<WorldHubGrowthDashboard> {
  const growthProviders = getGrowthProviderDefinitions();
  const [
    seoBriefs,
    analyticsSnapshots,
    monetizationPlacements,
    monetizationResearchNotes,
    seoBriefCount,
    activeSeoBriefs,
    analyticsSnapshotCount,
    monetizationPlacementCount,
    readyPlacements,
    affiliatePlacements,
    adPlacements,
    researchNoteCount,
    highConfidenceResearchNoteCount,
  ] = await Promise.all([
    prisma.worldHubSeoBrief.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: 12,
    }),
    prisma.worldHubAnalyticsSnapshot.findMany({
      orderBy: [{ capturedAt: "desc" }],
      take: 10,
    }),
    prisma.worldHubMonetizationPlacement.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: 12,
    }),
    prisma.worldHubMonetizationResearchNote.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: 12,
    }),
    prisma.worldHubSeoBrief.count(),
    prisma.worldHubSeoBrief.count({
      where: {
        status: {
          in: ["draft", "active", "review"],
        },
      },
    }),
    prisma.worldHubAnalyticsSnapshot.count(),
    prisma.worldHubMonetizationPlacement.count(),
    prisma.worldHubMonetizationPlacement.count({
      where: {
        status: {
          in: ["ready", "active"],
        },
      },
    }),
    prisma.worldHubMonetizationPlacement.count({
      where: {
        placementType: {
          in: ["affiliate_link", "book_recommendation"],
        },
      },
    }),
    prisma.worldHubMonetizationPlacement.count({
      where: {
        placementType: {
          in: ["adsense_auto_ads", "ad_slot", "sponsor_slot"],
        },
      },
    }),
    prisma.worldHubMonetizationResearchNote.count(),
    prisma.worldHubMonetizationResearchNote.count({
      where: {
        confidence: {
          in: ["high", "verified"],
        },
      },
    }),
  ]);

  return {
    growthProviders,
    providerReadiness: growthProviders.map((definition) =>
      getWorldHubProviderReadiness(definition),
    ),
    seoBriefs: seoBriefs.map(seoBriefToDto),
    analyticsSnapshots: analyticsSnapshots.map(analyticsSnapshotToDto),
    monetizationPlacements: monetizationPlacements.map(monetizationPlacementToDto),
    monetizationResearchNotes: monetizationResearchNotes.map(
      monetizationResearchNoteToDto,
    ),
    counts: {
      seoBriefs: seoBriefCount,
      activeSeoBriefs,
      analyticsSnapshots: analyticsSnapshotCount,
      monetizationPlacements: monetizationPlacementCount,
      readyPlacements,
      affiliatePlacements,
      adPlacements,
      researchNotes: researchNoteCount,
      highConfidenceResearchNotes: highConfidenceResearchNoteCount,
    },
  };
}

export async function createWorldHubSeoBrief(input: SeoBriefInput) {
  const title = optionalText(input.title);

  if (!title) {
    throw new Error("SEO brief title is required.");
  }

  const secondaryKeywords = splitKeywordList(input.secondaryKeywords ?? "");
  const targetPath = normalizeContentPath(input.targetPath ?? "");
  const checklist = buildSeoChecklist({
    title,
    targetPath,
    primaryKeyword: optionalText(input.primaryKeyword),
    secondaryKeywords,
    metaTitle: optionalText(input.metaTitle),
    metaDescription: optionalText(input.metaDescription),
    canonicalUrl: optionalText(input.canonicalUrl),
    structuredDataType: optionalText(input.structuredDataType),
  });
  const slug = normalizeGrowthSlug(input.slug ?? "", title);

  return prisma.worldHubSeoBrief.upsert({
    where: { slug },
    create: {
      slug,
      title,
      contentKind: cleanStatus(input.contentKind, "episode_page"),
      status: cleanStatus(input.status),
      targetPath,
      targetUrl: optionalText(input.targetUrl),
      primaryKeyword: optionalText(input.primaryKeyword),
      secondaryKeywordsJson: toJsonInput(secondaryKeywords),
      searchIntent: optionalText(input.searchIntent),
      audience: optionalText(input.audience),
      metaTitle: optionalText(input.metaTitle),
      metaDescription: optionalText(input.metaDescription),
      canonicalUrl: optionalText(input.canonicalUrl),
      ogTitle: optionalText(input.ogTitle),
      ogDescription: optionalText(input.ogDescription),
      structuredDataType: optionalText(input.structuredDataType),
      checklistJson: toJsonInput(checklist),
      notes: optionalText(input.notes),
      createdByEmail: optionalText(input.createdByEmail),
    },
    update: {
      title,
      contentKind: cleanStatus(input.contentKind, "episode_page"),
      status: cleanStatus(input.status),
      targetPath,
      targetUrl: optionalText(input.targetUrl),
      primaryKeyword: optionalText(input.primaryKeyword),
      secondaryKeywordsJson: toJsonInput(secondaryKeywords),
      searchIntent: optionalText(input.searchIntent),
      audience: optionalText(input.audience),
      metaTitle: optionalText(input.metaTitle),
      metaDescription: optionalText(input.metaDescription),
      canonicalUrl: optionalText(input.canonicalUrl),
      ogTitle: optionalText(input.ogTitle),
      ogDescription: optionalText(input.ogDescription),
      structuredDataType: optionalText(input.structuredDataType),
      checklistJson: toJsonInput(checklist),
      notes: optionalText(input.notes),
    },
  });
}

export async function recordWorldHubAnalyticsSnapshot(
  input: AnalyticsSnapshotInput,
) {
  if (input.periodEnd < input.periodStart) {
    throw new Error("Analytics period end must be after the period start.");
  }

  const metrics = buildAnalyticsMetrics(input);

  if (Object.keys(metrics).length === 0) {
    throw new Error("Record at least one metric.");
  }

  return prisma.worldHubAnalyticsSnapshot.create({
    data: {
      source: cleanStatus(input.source, "manual"),
      channel: cleanStatus(input.channel, "site"),
      contentPath: normalizeContentPath(input.contentPath ?? ""),
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      metricsJson: toJsonInput(metrics),
      notes: optionalText(input.notes),
      capturedByEmail: optionalText(input.capturedByEmail),
    },
  });
}

export async function createWorldHubMonetizationPlacement(
  input: MonetizationPlacementInput,
) {
  const displayName = optionalText(input.displayName);

  if (!displayName) {
    throw new Error("Placement display name is required.");
  }

  const placementType = cleanStatus(input.placementType, "affiliate_link");
  const slug = normalizeGrowthSlug(input.slug ?? "", displayName);
  const disclosureText =
    optionalText(input.disclosureText) ||
    (placementType === "affiliate_link" ||
    placementType === "book_recommendation"
      ? DEFAULT_AFFILIATE_DISCLOSURE
      : null);

  return prisma.worldHubMonetizationPlacement.upsert({
    where: { slug },
    create: {
      slug,
      placementType,
      status: cleanStatus(input.status),
      targetPath: normalizeContentPath(input.targetPath ?? ""),
      providerKey: optionalText(input.providerKey),
      displayName,
      destinationUrl: optionalText(input.destinationUrl),
      disclosureText,
      callToAction: optionalText(input.callToAction),
      metadataJson: toJsonInput(buildMonetizationMetadata(input)),
      createdByEmail: optionalText(input.createdByEmail),
    },
    update: {
      placementType,
      status: cleanStatus(input.status),
      targetPath: normalizeContentPath(input.targetPath ?? ""),
      providerKey: optionalText(input.providerKey),
      displayName,
      destinationUrl: optionalText(input.destinationUrl),
      disclosureText,
      callToAction: optionalText(input.callToAction),
      metadataJson: toJsonInput(buildMonetizationMetadata(input)),
    },
  });
}

export async function createWorldHubMonetizationResearchNote(
  input: MonetizationResearchNoteInput,
) {
  const title = optionalText(input.title);
  const projectProfile = optionalText(input.projectProfile);
  const monetizationType = cleanStatus(input.monetizationType, "research");
  const sourceTitle = optionalText(input.sourceTitle);
  const sourceUrl = normalizeSourceUrl(input.sourceUrl);
  const summary = optionalText(input.summary);

  if (!title) {
    throw new Error("Research title is required.");
  }

  if (!projectProfile) {
    throw new Error("Project profile is required.");
  }

  if (!sourceTitle || !sourceUrl) {
    throw new Error("A valid source title and URL are required.");
  }

  if (!summary) {
    throw new Error("Research summary is required.");
  }

  const takeaways = splitResearchList(input.takeaways ?? "");
  const risks = splitResearchList(input.risks ?? "");
  const nextActions = splitResearchList(input.nextActions ?? "");
  const tags = splitKeywordList(input.tags ?? "");
  const slug = normalizeGrowthSlug(
    input.slug ?? "",
    `${projectProfile}-${monetizationType}-${title}`,
  );

  return prisma.worldHubMonetizationResearchNote.upsert({
    where: { slug },
    create: {
      slug,
      title,
      projectProfile: cleanStatus(projectProfile, "creator_media"),
      monetizationType,
      status: cleanStatus(input.status, "research"),
      confidence: cleanStatus(input.confidence, "medium"),
      sourceTitle,
      sourceUrl,
      sourcePublisher: optionalText(input.sourcePublisher),
      sourceDate: optionalText(input.sourceDate),
      summary,
      takeawaysJson: toJsonInput(takeaways),
      recommendedUse: optionalText(input.recommendedUse),
      risksJson: toJsonInput(risks),
      nextActionsJson: toJsonInput(nextActions),
      tagsJson: toJsonInput(tags),
      createdByEmail: optionalText(input.createdByEmail),
    },
    update: {
      title,
      projectProfile: cleanStatus(projectProfile, "creator_media"),
      monetizationType,
      status: cleanStatus(input.status, "research"),
      confidence: cleanStatus(input.confidence, "medium"),
      sourceTitle,
      sourceUrl,
      sourcePublisher: optionalText(input.sourcePublisher),
      sourceDate: optionalText(input.sourceDate),
      summary,
      takeawaysJson: toJsonInput(takeaways),
      recommendedUse: optionalText(input.recommendedUse),
      risksJson: toJsonInput(risks),
      nextActionsJson: toJsonInput(nextActions),
      tagsJson: toJsonInput(tags),
    },
  });
}

export async function seedWorldHubGrowthFoundation(createdByEmail?: string) {
  const by = optionalText(createdByEmail);

  const seoBriefs = [
    {
      slug: "hgo-home",
      title: "High Ground Odyssey Home",
      contentKind: "site_page",
      status: "draft",
      targetPath: "/",
      primaryKeyword: "leadership podcast",
      secondaryKeywords: "legacy, family stories, High Ground Odyssey",
      searchIntent: "Discover the show and understand the promise.",
      audience: "New listeners, family, supporters, and future coaching clients.",
      metaTitle: "High Ground Odyssey",
      metaDescription:
        "Leadership, legacy, family, and the stories that shape us.",
      structuredDataType: "Organization",
      notes: "First brief should protect the brand promise and point visitors to the newest work.",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "hgo-coaching",
      title: "Coaching Offer",
      contentKind: "offer_page",
      status: "draft",
      targetPath: "/coaching",
      primaryKeyword: "leadership coaching",
      secondaryKeywords: "veteran leadership coaching, life coaching, Homer coaching",
      searchIntent: "Evaluate whether coaching is a fit.",
      audience: "People who want practical leadership help from Homer.",
      metaTitle: "Leadership Coaching",
      metaDescription:
        "Request practical leadership coaching through High Ground Odyssey.",
      structuredDataType: "Service",
      notes: "Tie SEO to the real intake flow and eventual paid coaching package.",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "hgo-library",
      title: "Library and Episode Index",
      contentKind: "library_page",
      status: "draft",
      targetPath: "/library",
      primaryKeyword: "leadership stories",
      secondaryKeywords: "podcast episodes, reading list, personal growth stories",
      searchIntent: "Browse past work and find a useful story.",
      audience: "Returning listeners and readers.",
      metaTitle: "High Ground Odyssey Library",
      metaDescription:
        "Browse High Ground Odyssey episodes, reading notes, and leadership stories.",
      structuredDataType: "CollectionPage",
      notes: "Keep this aligned with the curated metadata layer before public publishing automation.",
      createdByEmail: by ?? undefined,
    },
  ];

  const placements = [
    {
      slug: "global-adsense-auto-ads",
      placementType: "adsense_auto_ads",
      status: "draft",
      targetPath: "/",
      providerKey: "google-adsense",
      displayName: "Sitewide AdSense Auto ads",
      disclosureText: "Pages may include ads when the sitewide ad program is enabled.",
      adSlot: "auto",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "episode-book-affiliate-links",
      placementType: "book_recommendation",
      status: "draft",
      targetPath: "/episodes",
      providerKey: "affiliate-links",
      displayName: "Episode book affiliate recommendations",
      disclosureText: DEFAULT_AFFILIATE_DISCLOSURE,
      affiliateProgram: "amazon-associates-or-bookshop",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "direct-sponsor-read",
      placementType: "sponsor_slot",
      status: "draft",
      targetPath: "/episodes",
      providerKey: "direct-sponsors",
      displayName: "Podcast sponsor read slot",
      sponsorCategory: "podcast",
      createdByEmail: by ?? undefined,
    },
  ];

  await Promise.all([
    ...seoBriefs.map((brief) => createWorldHubSeoBrief(brief)),
    ...placements.map((placement) =>
      createWorldHubMonetizationPlacement(placement),
    ),
  ]);
}

export async function seedWorldHubMonetizationResearch(createdByEmail?: string) {
  const by = optionalText(createdByEmail);

  const notes: MonetizationResearchNoteInput[] = [
    {
      slug: "patreon-supporter-membership",
      title: "Patreon-style supporter membership",
      projectProfile: "podcast_book_coaching_brand",
      monetizationType: "membership",
      status: "research",
      confidence: "high",
      sourceTitle: "Creator fees overview",
      sourceUrl:
        "https://support.patreon.com/hc/en-us/articles/11111747095181-Creator-fees-overview",
      sourcePublisher: "Patreon",
      sourceDate: "2026",
      summary:
        "Patreon remains a useful pattern for listener-supported memberships, bonus material, community access, and recurring patronage without building a full entitlement stack first.",
      takeaways:
        "Memberships can start as perks and behind-the-scenes access; platform fees sit on top of payment processing; app-owned supporter records should remain the source of truth for future migration",
      recommendedUse:
        "Prototype supporter tiers in WorldHub first, then map Patreon members into app-owned membership records.",
      risks:
        "Platform ownership of member relationship; tier drift if Patreon names become canonical; tax and fulfillment expectations for physical rewards",
      nextActions:
        "Define three HGO supporter tiers; map Patreon webhook events to membership grant states; decide which perks belong inside the Studio first",
      tags: "membership, supporters, patreon, recurring revenue",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "substack-paid-publication-model",
      title: "Paid publication and private essay model",
      projectProfile: "book_podcast_newsletter_brand",
      monetizationType: "paid_publication",
      status: "research",
      confidence: "medium",
      sourceTitle: "Paid subscriptions on Substack",
      sourceUrl:
        "https://support.substack.com/hc/en-us/articles/18687769631252-How-can-readers-pay-for-a-subscription-on-my-Substack-publication",
      sourcePublisher: "Substack",
      sourceDate: "2026",
      summary:
        "Paid publication platforms prove the demand pattern for essays, private updates, and serial book-adjacent material, but High Ground should keep the canonical work and customer state in its own system.",
      takeaways:
        "Paid writing works best when there is a reliable cadence; free public essays can feed paid deeper material; provider exports should be projections rather than canonical drafts",
      recommendedUse:
        "Use Content Studio to prepare newsletter-style packets and keep Substack or email providers as optional distribution channels.",
      risks:
        "Audience lock-in; duplicate archives; confusing paid/free boundaries around manuscript material",
      nextActions:
        "Add publication packet metadata to Content Studio; draft a free-to-paid ladder for essays, episodes, and book progress updates",
      tags: "newsletter, essays, paid publication, book writing",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "stripe-owned-checkout-and-subscriptions",
      title: "Owned checkout and subscription rails",
      projectProfile: "owned_commerce_brand",
      monetizationType: "checkout",
      status: "research",
      confidence: "high",
      sourceTitle: "Stripe pricing",
      sourceUrl: "https://stripe.com/pricing",
      sourcePublisher: "Stripe",
      sourceDate: "2026",
      summary:
        "Stripe is the cleanest owned-commerce path for coaching packages, direct memberships, digital products, and later merch orders when High Ground wants customer state to live in its own database.",
      takeaways:
        "Owned checkout keeps account, entitlement, and order state portable; hosted checkout can ship before a custom cart; webhook reconciliation is the critical reliability layer",
      recommendedUse:
        "Use Stripe hosted Checkout first for coaching packages and simple digital products, then reconcile every event into WorldHub orders and memberships.",
      risks:
        "Partial payments and refunds need explicit states; tax setup must be deliberate; direct checkout adds support obligations",
      nextActions:
        "Create one coaching package product; add checkout session creation; reconcile checkout.session.completed and invoice events into WorldHub order records",
      tags: "stripe, checkout, subscriptions, coaching, owned commerce",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "apple-podcast-subscriptions",
      title: "Podcast subscription channel",
      projectProfile: "podcast_media_brand",
      monetizationType: "podcast_subscription",
      status: "research",
      confidence: "medium",
      sourceTitle: "Apple Podcasters Program overview",
      sourceUrl:
        "https://podcasters.apple.com/support/892-apple-podcasters-program-overview",
      sourcePublisher: "Apple Podcasts",
      sourceDate: "2026",
      summary:
        "Podcast platform subscriptions fit bonus episodes, early access, and ad-free feeds, but they should be treated as platform projections of the same private production and entitlement model.",
      takeaways:
        "Paid podcast channels can monetize listeners who already use podcast apps; bonus feeds need a repeatable private publishing workflow; platform-specific analytics should feed back into Growth snapshots",
      recommendedUse:
        "Keep public episodes free while testing bonus or early-access audio as a later projection from Studio Cut and Content Studio.",
      risks:
        "Fragmented subscriber identity across podcast apps; production overhead for bonus feeds; platform rules can change",
      nextActions:
        "Define what a paid feed would contain; model podcast subscriber entitlement separately from provider identity; connect Studio Cut export packages to paid-feed readiness",
      tags: "podcast, subscriptions, apple podcasts, bonus episodes",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "spotify-creator-monetization",
      title: "Spotify creator monetization options",
      projectProfile: "podcast_video_media_brand",
      monetizationType: "platform_monetization",
      status: "research",
      confidence: "medium",
      sourceTitle: "Monetization on Spotify for Creators",
      sourceUrl: "https://creators.spotify.com/features/monetization",
      sourcePublisher: "Spotify for Creators",
      sourceDate: "2026",
      summary:
        "Spotify's creator tooling is a useful benchmark for podcast ads, subscriptions, and video distribution, while High Ground still needs its own canonical episode, sponsor, and analytics records.",
      takeaways:
        "Platform monetization can complement owned offers; video podcast packaging may matter; sponsor reads and platform ads should be measured separately",
      recommendedUse:
        "Treat Spotify as a distribution and analytics source, not as the center of the business model.",
      risks:
        "Revenue eligibility can depend on platform thresholds; analytics are provider-specific; video workflow can distract from book and episode publishing",
      nextActions:
        "Add Spotify analytics as a future provider snapshot source; define sponsor inventory independently of platform ads",
      tags: "spotify, podcast, video, ads, subscriptions",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "youtube-partner-and-shopping",
      title: "YouTube ads, fan funding, and shopping",
      projectProfile: "video_podcast_education_brand",
      monetizationType: "video_platform",
      status: "research",
      confidence: "medium",
      sourceTitle: "YouTube Partner Program overview",
      sourceUrl: "https://support.google.com/youtube/answer/72851",
      sourcePublisher: "YouTube Help",
      sourceDate: "2026",
      summary:
        "YouTube can become a meaningful discovery and revenue channel for clips, full video episodes, lives, and merch, but it requires consistent packaging and channel-health tracking.",
      takeaways:
        "YouTube monetization is tied to eligibility and policy compliance; clips can feed discovery before revenue; shopping and memberships are later-stage options",
      recommendedUse:
        "Use Studio Cut to produce repeatable YouTube packages, then import channel metrics into Growth before depending on YouTube revenue.",
      risks:
        "Eligibility thresholds; policy strikes; platform-first optimization can weaken the core HGO site and book workflow",
      nextActions:
        "Add a YouTube content package checklist; track watch-time and subscriber milestones manually until API integration is justified",
      tags: "youtube, video, ads, shopping, memberships",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "adsense-web-display-ads",
      title: "AdSense and site display ads",
      projectProfile: "content_site_library",
      monetizationType: "display_ads",
      status: "research",
      confidence: "high",
      sourceTitle: "AdSense Program policies",
      sourceUrl: "https://support.google.com/adsense/answer/48182",
      sourcePublisher: "Google AdSense Help",
      sourceDate: "2026",
      summary:
        "Display ads can monetize evergreen episode pages and library traffic, but should stay opt-in and gated until content quality, disclosures, page experience, and policy fit are reviewed.",
      takeaways:
        "Ad scripts need explicit environment gates; ads.txt should be generated from configured account data; ad revenue is likely secondary until traffic is meaningful",
      recommendedUse:
        "Keep AdSense disabled by default and use `/team/growth` to mark candidate page types before public ad placements go live.",
      risks:
        "Poor reader experience; policy violations; accidental monetization of sensitive pages",
      nextActions:
        "Choose no-ad zones; add page-level monetization readiness; mount AdSense secrets only after account approval",
      tags: "adsense, display ads, ads.txt, site revenue",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "search-console-seo-research-loop",
      title: "Search Console as the SEO feedback loop",
      projectProfile: "episode_book_content_site",
      monetizationType: "seo_growth",
      status: "research",
      confidence: "high",
      sourceTitle: "Build and submit a sitemap",
      sourceUrl:
        "https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap",
      sourcePublisher: "Google Search Central",
      sourceDate: "2026",
      summary:
        "Search Console should become the feedback loop for episode pages, book pages, and coaching offers: queries, impressions, clicks, and indexing problems should become Growth snapshots and SEO follow-up work.",
      takeaways:
        "Structured sitemaps help discovery; query data should update briefs; SEO work should be tied to real content paths, not vague keyword lists",
      recommendedUse:
        "Connect Search Console after sitemap/public page inventory stabilizes, then map query wins and gaps back to SEO briefs.",
      risks:
        "Optimizing before the content library is organized; chasing keywords that do not fit the mission; confusing indexing with audience value",
      nextActions:
        "Audit current public URL inventory; add sitemap checks to deploy validation; import top queries once credentials are mounted",
      tags: "seo, search console, sitemap, episode pages",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "ftc-disclosure-rules",
      title: "Affiliate and sponsor disclosure baseline",
      projectProfile: "commercial_media_brand",
      monetizationType: "compliance",
      status: "research",
      confidence: "high",
      sourceTitle: "FTC Endorsement Guides",
      sourceUrl:
        "https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides",
      sourcePublisher: "Federal Trade Commission",
      sourceDate: "2026",
      summary:
        "Affiliate links, sponsor reads, gifted products, and paid endorsements need clear disclosure close to the recommendation, so disclosure text should travel with every placement record.",
      takeaways:
        "Disclosure is part of the content object; sponsor and affiliate placements should not publish without disclosure review; recommendations should stay honest and source-backed",
      recommendedUse:
        "Make disclosure status a required review check before any public monetized placement goes live.",
      risks:
        "Hidden material connections; inconsistent disclosure between podcast, page, and social formats; sponsor influence on editorial trust",
      nextActions:
        "Add a disclosure review field to placement readiness; draft standard HGO affiliate, sponsor, and gifted-product language",
      tags: "ftc, disclosure, affiliate, sponsors, compliance",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "book-affiliates-amazon-and-bookshop",
      title: "Book affiliate recommendation stack",
      projectProfile: "book_podcast_learning_brand",
      monetizationType: "book_affiliate",
      status: "research",
      confidence: "high",
      sourceTitle: "Associates Program Operating Agreement",
      sourceUrl: "https://affiliate-program.amazon.com/help/operating/agreement/",
      sourcePublisher: "Amazon Associates",
      sourceDate: "2026",
      summary:
        "Book recommendations fit HGO naturally, especially for episode reading lists and manuscript-adjacent references, but every link should preserve the recommendation reason and disclosure.",
      takeaways:
        "Amazon has broad coverage; Bookshop-style alternatives may better fit indie-book values; book recommendations should connect to episodes and sources",
      recommendedUse:
        "Store each recommended book as a placement with provider, ISBN, episode context, disclosure, and reason for recommendation.",
      risks:
        "Affiliate terms can be strict; links can stale out; recommendations can feel transactional if not tied to real source value",
      nextActions:
        "Add a book recommendation packet shape; add Bookshop and Amazon tags as provider-specific metadata; avoid public links until account IDs are configured",
      tags: "books, amazon associates, bookshop, affiliate, reading lists",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "podcast-sponsor-market-benchmark",
      title: "Podcast sponsorship market benchmark",
      projectProfile: "podcast_media_brand",
      monetizationType: "sponsorship",
      status: "research",
      confidence: "medium",
      sourceTitle: "Internet Advertising Revenue Report: Full Year 2025",
      sourceUrl:
        "https://www.iab.com/wp-content/uploads/2026/04/IAB_PwC_Internet_Ad_Revenue_Report_Full_Year_2025_April_2026.pdf",
      sourcePublisher: "IAB / PwC",
      sourceDate: "2026",
      summary:
        "Podcast sponsorship should be tracked as a direct relationship business with its own inventory, categories, reads, episodes, approvals, and measurement, rather than just another ad slot.",
      takeaways:
        "Direct sponsors can fit the mission better than generic ads; inventory should be described before selling; sponsor categories need values review",
      recommendedUse:
        "Build a direct sponsor packet for values-aligned brands after episode cadence and audience reporting are stable.",
      risks:
        "Premature sales effort before audience data; poor sponsor fit; missed make-goods if reads and approvals are not tracked",
      nextActions:
        "Draft sponsor category whitelist; create sponsor media kit placeholders; connect sponsor slots to episode production records",
      tags: "podcast, sponsors, media kit, direct sales",
      createdByEmail: by ?? undefined,
    },
    {
      slug: "print-on-demand-merch",
      title: "Print-on-demand merch as low-inventory commerce",
      projectProfile: "podcast_book_community_brand",
      monetizationType: "merch",
      status: "research",
      confidence: "medium",
      sourceTitle: "Printful pricing",
      sourceUrl: "https://www.printful.com/pricing",
      sourcePublisher: "Printful",
      sourceDate: "2026",
      summary:
        "Print-on-demand can test shirts, hats, journals, and field-guide-style goods without inventory, but fulfillment, margins, returns, and brand fit need visible tracking.",
      takeaways:
        "POD lowers upfront risk; merch should launch from proven phrases, episodes, or book moments; fulfillment status belongs in WorldHub orders",
      recommendedUse:
        "Start with a tiny merch catalog and app-owned product records before connecting a fulfillment provider.",
      risks:
        "Thin margins; quality variance; support workload; design sprawl",
      nextActions:
        "Pick three merch concepts; model merch items in the catalog; add provider fulfillment job statuses before selling",
      tags: "merch, print on demand, fulfillment, catalog",
      createdByEmail: by ?? undefined,
    },
  ];

  await Promise.all(
    notes.map((note) => createWorldHubMonetizationResearchNote(note)),
  );
}
