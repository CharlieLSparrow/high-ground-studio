import "server-only";

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/prisma";

export const REQUIRED_PRODUCTION_CORE_TABLES = [
  "StudioNestInvite",
  "StudioAssetAttachment",
  "StudioAssetVariant",
  "StudioAssetProcessingJob",
  "StudioSourceUnit",
  "StudioDocumentOperation",
  "StudioProductionRoom",
  "StudioTimelineVersion",
  "StudioOutputPacket",
  "StudioPublishAttempt",
  "StudioPublishedArtifact",
  "StudioWorkflowJob",
  "StudioNativeAuthCode",
  "StudioNativeDeviceSession",
] as const;

export const PRODUCTION_CORE_FEATURE_GROUPS = [
  {
    id: "collaboration",
    label: "Nest collaboration",
    tables: ["StudioNestInvite"],
  },
  {
    id: "media-assets",
    label: "Media vault attachments",
    tables: ["StudioAssetAttachment", "StudioAssetVariant", "StudioAssetProcessingJob", "StudioWorkflowJob"],
  },
  {
    id: "source-aware-documents",
    label: "Source-aware documents",
    tables: ["StudioSourceUnit", "StudioDocumentOperation"],
  },
  {
    id: "production-publishing",
    label: "Production and publishing pipeline",
    tables: [
      "StudioProductionRoom",
      "StudioTimelineVersion",
      "StudioOutputPacket",
      "StudioPublishAttempt",
      "StudioPublishedArtifact",
    ],
  },
  {
    id: "native-mac-auth",
    label: "Native Mac app sessions",
    tables: ["StudioNativeAuthCode", "StudioNativeDeviceSession"],
  },
] as const;

export type ProductionCoreReadinessGroup = {
  id: string;
  label: string;
  status: "ready" | "needs-schema-sync";
  missingTables: string[];
};

export type ProductionCoreReadiness = {
  ok: boolean;
  status: "ready" | "needs-schema-sync" | "unchecked" | "error";
  generatedAt: string;
  requiredTableCount: number;
  presentTableCount: number;
  missingTables: string[];
  groups: ProductionCoreReadinessGroup[];
  nextStep: string;
  error?: string;
};

function isNextBuildPhase() {
  return process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";
}

function readinessFromTables(existingTables: Set<string>, generatedAt: string): ProductionCoreReadiness {
  const missingTables = REQUIRED_PRODUCTION_CORE_TABLES.filter((tableName) => !existingTables.has(tableName));
  const groups = PRODUCTION_CORE_FEATURE_GROUPS.map((group) => {
    const missingGroupTables = group.tables.filter((tableName) => !existingTables.has(tableName));
    return {
      id: group.id,
      label: group.label,
      status: missingGroupTables.length ? "needs-schema-sync" : "ready",
      missingTables: missingGroupTables,
    } satisfies ProductionCoreReadinessGroup;
  });

  return {
    ok: missingTables.length === 0,
    status: missingTables.length === 0 ? "ready" : "needs-schema-sync",
    generatedAt,
    requiredTableCount: REQUIRED_PRODUCTION_CORE_TABLES.length,
    presentTableCount: REQUIRED_PRODUCTION_CORE_TABLES.length - missingTables.length,
    missingTables,
    groups,
    nextStep: missingTables.length
      ? "Run scripts/quipsly-production-core-schema-sync.mjs through the schema sync job before deploying production-core dependent routes."
      : "Production core tables are present. Proceed with route smoke tests.",
  };
}

export async function getProductionCoreReadiness(): Promise<ProductionCoreReadiness> {
  const generatedAt = new Date().toISOString();
  const prisma = getPrismaClient();
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (${Prisma.join([...REQUIRED_PRODUCTION_CORE_TABLES])})
  `;

  return readinessFromTables(new Set(rows.map((row) => row.table_name)), generatedAt);
}

export async function getProductionCoreReadinessSafe(): Promise<ProductionCoreReadiness> {
  const generatedAt = new Date().toISOString();
  if (isNextBuildPhase()) {
    return {
      ok: false,
      status: "unchecked",
      generatedAt,
      requiredTableCount: REQUIRED_PRODUCTION_CORE_TABLES.length,
      presentTableCount: 0,
      missingTables: [],
      groups: PRODUCTION_CORE_FEATURE_GROUPS.map((group) => ({
        id: group.id,
        label: group.label,
        status: "needs-schema-sync",
        missingTables: [],
      })),
      nextStep: "Production-core table readiness is checked at runtime, not during next build.",
    };
  }

  try {
    return await getProductionCoreReadiness();
  } catch (error) {
    return {
      ok: false,
      status: "error",
      generatedAt,
      requiredTableCount: REQUIRED_PRODUCTION_CORE_TABLES.length,
      presentTableCount: 0,
      missingTables: [...REQUIRED_PRODUCTION_CORE_TABLES],
      groups: PRODUCTION_CORE_FEATURE_GROUPS.map((group) => ({
        id: group.id,
        label: group.label,
        status: "needs-schema-sync",
        missingTables: [...group.tables],
      })),
      nextStep: "Check DATABASE_URL and run the production-core readiness endpoint again.",
      error: error instanceof Error ? error.message : "Production core readiness check failed.",
    };
  }
}
