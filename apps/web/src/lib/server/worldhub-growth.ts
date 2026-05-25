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
  scoreSeoChecklist,
  splitKeywordList,
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

export type WorldHubGrowthDashboard = {
  growthProviders: WorldHubProviderDefinition[];
  providerReadiness: WorldHubProviderReadiness[];
  seoBriefs: SeoBriefDto[];
  analyticsSnapshots: AnalyticsSnapshotDto[];
  monetizationPlacements: MonetizationPlacementDto[];
  counts: {
    seoBriefs: number;
    activeSeoBriefs: number;
    analyticsSnapshots: number;
    monetizationPlacements: number;
    readyPlacements: number;
    affiliatePlacements: number;
    adPlacements: number;
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

export async function getWorldHubGrowthDashboard(): Promise<WorldHubGrowthDashboard> {
  const growthProviders = getGrowthProviderDefinitions();
  const [
    seoBriefs,
    analyticsSnapshots,
    monetizationPlacements,
    seoBriefCount,
    activeSeoBriefs,
    analyticsSnapshotCount,
    monetizationPlacementCount,
    readyPlacements,
    affiliatePlacements,
    adPlacements,
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
  ]);

  return {
    growthProviders,
    providerReadiness: growthProviders.map((definition) =>
      getWorldHubProviderReadiness(definition),
    ),
    seoBriefs: seoBriefs.map(seoBriefToDto),
    analyticsSnapshots: analyticsSnapshots.map(analyticsSnapshotToDto),
    monetizationPlacements: monetizationPlacements.map(monetizationPlacementToDto),
    counts: {
      seoBriefs: seoBriefCount,
      activeSeoBriefs,
      analyticsSnapshots: analyticsSnapshotCount,
      monetizationPlacements: monetizationPlacementCount,
      readyPlacements,
      affiliatePlacements,
      adPlacements,
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
