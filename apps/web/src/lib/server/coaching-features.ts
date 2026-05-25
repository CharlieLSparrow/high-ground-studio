import { prisma } from "@/lib/prisma";
import { COACHING_FEATURE_CATALOG } from "@/lib/coaching/features";

export async function syncCoachingFeatureCatalog() {
  await Promise.all(
    COACHING_FEATURE_CATALOG.map((feature) =>
      prisma.coachingFeature.upsert({
        where: {
          featureKey: feature.featureKey,
        },
        create: {
          featureKey: feature.featureKey,
          title: feature.title,
          category: feature.category,
          clientSummary: feature.clientSummary,
          coachSummary: feature.coachSummary,
          sortOrder: feature.sortOrder,
          status: "active",
        },
        update: {
          title: feature.title,
          category: feature.category,
          clientSummary: feature.clientSummary,
          coachSummary: feature.coachSummary,
          sortOrder: feature.sortOrder,
          status: "active",
        },
      }),
    ),
  );
}

export async function listActiveCoachingFeatures() {
  return prisma.coachingFeature.findMany({
    where: {
      status: "active",
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
}

