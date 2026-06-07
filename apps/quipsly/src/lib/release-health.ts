import { generatedQuipslyArt } from "@high-ground/quipsly-domain/generated-art";
import { QUIPSLY_OUTPUT_CATALOG } from "@high-ground/quipsly-domain/output-catalog";
import type { ProductionCoreReadiness } from "@/lib/server/production-core-readiness";

const RELEASE_SMOKE_ROUTES = [
  "/api/health",
  "/api/healthz",
  "/api/beta-readiness",
  "/api/production-core/readiness",
  "/projects",
  "/nests",
  "/nests/high-ground-odyssey-manuscript",
  "/create?project=high-ground-odyssey-manuscript",
  "/editor?project=high-ground-odyssey-manuscript&episode=episode-4",
  "/admin/users",
  "/media-pipeline",
  "/outputs",
  "/art-foundry",
] as const;

type ReleaseConfigStatus = {
  configured: boolean;
  source: "env" | "missing";
};

function envStatus(name: string): ReleaseConfigStatus {
  return process.env[name]
    ? { configured: true, source: "env" }
    : { configured: false, source: "missing" };
}

function envValue(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : null;
}

export const RELEASE_HEALTH_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
});

export function createReleaseOperatorPlan(options: {
  hasDatabase: boolean;
  hasAuthSecret: boolean;
  hasGemini: boolean;
  hasPatreonWebhook: boolean;
  productionCore?: ProductionCoreReadiness | null;
}) {
  const schemaStatus = options.productionCore?.status ?? "unchecked";
  const schemaReady = options.productionCore?.ok === true;
  const schemaNeedsSync = options.hasDatabase && !schemaReady;

  const blockers = [
    !options.hasDatabase
      ? "DATABASE_URL is missing; Nest persistence and readiness checks cannot run."
      : null,
    !options.hasAuthSecret
      ? "AUTH_SECRET or NEXTAUTH_SECRET is missing; signed-in beta access is not production-safe."
      : null,
    schemaNeedsSync
      ? `Production-core schema is ${schemaStatus}; run the schema sync job before promoting a new revision.`
      : null,
  ].filter((entry): entry is string => Boolean(entry));

  const warnings = [
    !options.hasGemini
      ? "GEMINI_API_KEY is missing; assistant features should show local guidance/fallback behavior."
      : null,
    !options.hasPatreonWebhook
      ? "PATREON_WEBHOOK_SECRET is missing; Patreon support CTA can show, but webhook reconciliation is not complete."
      : null,
  ].filter((entry): entry is string => Boolean(entry));

  return {
    deployable: blockers.length === 0,
    schemaReady,
    blockers,
    warnings,
    nextActions: [
      {
        id: "run-release-preflight",
        label: "Run release preflight",
        command: "REGION=us-central1 PROJECT_ID=high-ground-odyssey scripts/release/quipsly-release-preflight.sh",
        detail: "Checks local gcloud auth, Cloud Run visibility, git state, and release script syntax before spending time on Cloud Build.",
        required: true,
      },
      {
        id: "refresh-cloud-auth",
        label: "Refresh Cloud auth if needed",
        command: "gcloud auth login",
        detail: "Required only when gcloud says token refresh failed. This is local operator auth, not app-user auth.",
        required: true,
      },
      {
        id: "sync-schema",
        label: "Apply targeted schema sync",
        command: "REGION=us-central1 PROJECT_ID=high-ground-odyssey bash scripts/release/quipsly-schema-sync.sh",
        detail: "Runs Prisma migrations plus Quipsly additive Nest Chat and production-core schema syncs.",
        required: true,
      },
      {
        id: "deploy-preview",
        label: "Deploy no-traffic preview revision",
        command: "REGION=us-central1 PROJECT_ID=high-ground-odyssey bash scripts/release/quipsly-deploy-preview.sh",
        detail: "Builds the Quipsly image and deploys a tagged preview without moving live traffic.",
        required: true,
      },
      {
        id: "smoke-preview",
        label: "Smoke the preview URL",
        command: "PREVIEW_URL=<preview-url> HOST_HEADER=nest.quipsly.com bash scripts/release/quipsly-smoke-preview.sh",
        detail: "Checks health JSON and core app routes without mutating customer data.",
        required: true,
      },
      {
        id: "promote-preview",
        label: "Promote after green smoke",
        command: "REGION=us-central1 PROJECT_ID=high-ground-odyssey bash scripts/release/quipsly-promote-preview.sh",
        detail: "Moves traffic to the smoke-tested preview revision.",
        required: true,
      },
    ],
    smokeRoutes: [...RELEASE_SMOKE_ROUTES],
  };
}

export function createReleaseHealthResponseBody() {
  const serviceName = envValue("K_SERVICE");
  const revisionName = envValue("K_REVISION");

  return {
    ok: true,
    service: "studio",
    app: "quipsly",
    version: 1,
    generatedAt: new Date().toISOString(),
    runtime: {
      nodeEnv: envValue("NODE_ENV") ?? "unknown",
      cloudRun: Boolean(serviceName),
      serviceName,
      revisionName,
      region: envValue("GOOGLE_CLOUD_REGION") ?? envValue("CLOUD_RUN_REGION"),
    },
    release: {
      imageTag: envValue("QUIPSLY_IMAGE_TAG"),
      sourceSha: envValue("QUIPSLY_SOURCE_SHA"),
      releaseChannel: envValue("QUIPSLY_RELEASE_CHANNEL") ?? "unknown",
      deployedBy: envValue("QUIPSLY_DEPLOYED_BY"),
    },
    hosts: {
      app: envValue("QUIPSLY_APP_HOST") ?? "nest.quipsly.com",
      marketing: envValue("QUIPSLY_MARKETING_HOST") ?? "quipsly.com",
      legacyStudio:
        envValue("QUIPSLY_LEGACY_STUDIO_HOST") ??
        "studio-hm2odnvjga-uc.a.run.app",
    },
    config: {
      database: envStatus("DATABASE_URL"),
      authSecret: envStatus("AUTH_SECRET"),
      nextAuthSecret: envStatus("NEXTAUTH_SECRET"),
      gemini: envStatus("GEMINI_API_KEY"),
      patreonWebhookSecret: envStatus("PATREON_WEBHOOK_SECRET"),
      patreonCronSecret: envStatus("PATREON_RECONCILE_SECRET"),
      studioCollab: envStatus("STUDIO_COLLAB_URL"),
      publicStudioCollab: envStatus("NEXT_PUBLIC_STUDIO_COLLAB_URL"),
    },
  };
}

export function createCompatibilityHealthResponseBody() {
  const releaseHealth = createReleaseHealthResponseBody();

  return {
    ok: releaseHealth.ok,
    service: "high-ground-studio",
    app: "studio",
    quipsly: {
      app: releaseHealth.app,
      runtime: releaseHealth.runtime,
      release: releaseHealth.release,
    },
  };
}

export function createBetaReadinessResponseBody(options: {
  productionCore?: ProductionCoreReadiness | null;
} = {}) {
  const releaseHealth = createReleaseHealthResponseBody();
  const hasGemini = releaseHealth.config.gemini.configured;
  const hasDatabase = releaseHealth.config.database.configured;
  const hasAuthSecret = releaseHealth.config.authSecret.configured || releaseHealth.config.nextAuthSecret.configured;
  const hasPatreonWebhook = releaseHealth.config.patreonWebhookSecret.configured;
  const productionCore = options.productionCore ?? null;
  const operatorPlan = createReleaseOperatorPlan({
    hasDatabase,
    hasAuthSecret,
    hasGemini,
    hasPatreonWebhook,
    productionCore,
  });

  const checks = [
    {
      id: "nest-project-system",
      label: "Nest project system",
      status: "ready",
      detail: "Customer-facing /projects and /nests routes are available; StudioProject remains the backing implementation.",
    },
    {
      id: "living-document-editor",
      label: "Living document editor",
      status: hasDatabase ? "ready" : "needs-config",
      detail: hasDatabase
        ? "The manuscript editor can load DB-backed Nest documents."
        : "DATABASE_URL is missing, so DB-backed editor persistence will not work.",
    },
    {
      id: "production-core-schema",
      label: "Production core database",
      status: !hasDatabase
        ? "needs-config"
        : productionCore
          ? productionCore.ok
            ? "ready"
            : productionCore.status === "error"
              ? "needs-config"
              : "needs-schema-sync"
          : "unchecked",
      detail: !hasDatabase
        ? "DATABASE_URL is missing, so production-core table readiness cannot be checked."
        : productionCore
          ? productionCore.ok
            ? `Production-core tables are present (${productionCore.presentTableCount}/${productionCore.requiredTableCount}).`
            : `${productionCore.missingTables.length} production-core tables need schema sync before invites, asset attachments, source units, production rooms, and output packets are fully live.`
          : "Production-core schema readiness was not checked in this response.",
    },
    {
      id: "recording-editor-spine",
      label: "Recording/editor spine",
      status: "ready",
      detail: "Recorder and editor expose recording-spine handoff summaries for interrupted takes and sync review.",
    },
    {
      id: "source-aware-research",
      label: "Source-aware research",
      status: hasGemini ? "ready" : "degraded",
      detail: hasGemini
        ? "Gemini-backed assistant/research features can run when called by server routes."
        : "GEMINI_API_KEY is missing; assistant/research features should fall back to local guidance.",
    },
    {
      id: "patreon-beta",
      label: "Patreon beta access",
      status: hasAuthSecret && hasPatreonWebhook ? "ready" : "needs-config",
      detail: hasAuthSecret && hasPatreonWebhook
        ? "Auth and Patreon webhook secrets are configured for provider-event ingestion and app-owned access reconciliation."
        : "Auth or Patreon webhook configuration is missing; support CTA can show, but beta access reconciliation is not fully configured.",
    },
    {
      id: "publishing-packets",
      label: "Publishing packets",
      status: "ready",
      detail: "Publishing surfaces use public-safe packet and per-destination status language.",
    },
    {
      id: "output-catalog",
      label: "Output catalog",
      status: "ready",
      detail: "Nest exposes a shared catalog of content outputs, source inputs, packet shapes, and publish targets.",
    },
    {
      id: "art-foundry",
      label: "Art Foundry",
      status: "ready",
      detail: "Nest exposes reusable Quipsly art briefs and role recipes for mascot, product, quote, and public-site visuals.",
    },
    {
      id: "beta-readiness-dashboard",
      label: "Beta readiness dashboard",
      status: "ready",
      detail: "The app shell includes a human-readable beta readiness page for owner and Deploy Captain review.",
    },
  ];

  const ready = checks.every((check) => check.status === "ready" || check.status === "degraded");

  return {
    ok: true,
    ready,
    readinessStatus: ready ? "ready" : "needs-config",
    generatedAt: releaseHealth.generatedAt,
    app: releaseHealth.app,
    runtime: releaseHealth.runtime,
    release: releaseHealth.release,
    hosts: releaseHealth.hosts,
    operatorPlan,
    catalogs: {
      outputTypes: QUIPSLY_OUTPUT_CATALOG.length,
      generatedArtAssets: generatedQuipslyArt.length,
    },
    productionCore,
    checks,
  };
}
