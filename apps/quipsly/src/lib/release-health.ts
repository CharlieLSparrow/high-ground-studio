import { generatedQuipslyArt } from "@high-ground/quipsly-domain/generated-art";
import { QUIPSLY_OUTPUT_CATALOG } from "@high-ground/quipsly-domain/output-catalog";
import type { ProductionCoreReadiness } from "@/lib/server/production-core-readiness";
import {
  isReleaseSmokeSecretValid,
  RELEASE_SMOKE_REQUIRED_ROUTE_IDS,
  RELEASE_SMOKE_VERIFIED_CHECK_IDS,
  validateReleaseSmokeReceiptToken,
} from "@/lib/server/release-smoke-receipt";

export const BETA_READINESS_STATUSES = [
  "implemented-unverified",
  "catalog-only",
  "runtime-verified",
  "configured",
  "degraded",
  "blocked",
] as const;

export type BetaReadinessStatus = (typeof BETA_READINESS_STATUSES)[number];

type BetaRuntimeVerificationEvidence = {
  source: "release-smoke";
  checkedAt: string;
  revisionName: string | null;
  publicReachability: {
    status: "verified" | "degraded" | "blocked";
    detail: string;
    hosts: string[];
  };
  verifiedCheckIds: string[];
};

type BetaReadinessEvidenceKind =
  | "runtime"
  | "configuration"
  | "schema"
  | "source"
  | "catalog";

type BetaReadinessCheck = {
  id: string;
  label: string;
  status: BetaReadinessStatus;
  detail: string;
  gate: "required" | "advisory";
  gateSatisfied: boolean;
  evidence: {
    kind: BetaReadinessEvidenceKind;
    verifiedInThisResponse: boolean;
    scope: string;
    observedAt: string | null;
  };
};

const RUNTIME_EVIDENCE_MAX_AGE_MS = 30 * 60 * 1000;

const RELEASE_SMOKE_ROUTES = [
  "/api/health",
  "/api/healthz",
  "/api/beta-readiness",
  "/api/production-core/readiness",
  "/api/mac/session-check (expects 401 without a session)",
  "/api/output-catalog",
  "/api/output-catalog/hgo-episode-page",
  "/api/output-catalog/nest-kind/writing",
  "/api/quipsly-art/briefs",
  "/api/quipsly-art/library",
  "/projects",
  "/nests",
  "/create?project=quipsly-dev-lab",
  "/editor?project=quipsly-dev-lab&episode=smoke",
  "/recorder?project=quipsly-dev-lab&episode=smoke",
  "/research",
  "/publishing",
  "/outputs",
  "/outputs/hgo-episode-page",
  "/art-foundry",
  "/beta-readiness",
  "direct /api/healthz on every configured public host",
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
  hasReleaseSmokeSecret: boolean;
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
    !options.hasReleaseSmokeSecret
      ? "QUIPSLY_RELEASE_SMOKE_SECRET is missing or invalid; a preview cannot produce the signed promotion receipt."
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
        command: "gcloud auth login --update-adc --brief",
        detail: "Required when either gcloud user credentials or Application Default Credentials have expired. This is local operator auth, not app-user auth.",
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
        detail: "Checks the preview and every configured public host, then presents a short-lived signed receipt as the final gate. QUIPSLY_RELEASE_SMOKE_SECRET must already be in the environment; never put its value in command history.",
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
      releaseSmokeSecret: envStatus("QUIPSLY_RELEASE_SMOKE_SECRET"),
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

function evaluateRuntimeEvidence(options: {
  evidence?: BetaRuntimeVerificationEvidence | null;
  failureReason?: string | null;
  generatedAt: string;
  currentRevisionName: string | null;
  expectedPublicHosts: string[];
}) {
  const evidence = options.evidence ?? null;
  if (!evidence) {
    return {
      accepted: false,
      reason: options.failureReason ?? "No release-smoke evidence was supplied to this response.",
      evidence: null,
    } as const;
  }

  const checkedAtMs = Date.parse(evidence.checkedAt);
  const generatedAtMs = Date.parse(options.generatedAt);
  if (!Number.isFinite(checkedAtMs)) {
    return {
      accepted: false,
      reason: "Release-smoke evidence has an invalid checkedAt timestamp.",
      evidence,
    } as const;
  }

  const ageMs = generatedAtMs - checkedAtMs;
  if (ageMs < -60_000 || ageMs > RUNTIME_EVIDENCE_MAX_AGE_MS) {
    return {
      accepted: false,
      reason: "Release-smoke evidence is stale or dated in the future.",
      evidence,
    } as const;
  }

  if (
    options.currentRevisionName
    && evidence.revisionName !== options.currentRevisionName
  ) {
    return {
      accepted: false,
      reason: "Release-smoke evidence does not match the revision serving this response.",
      evidence,
    } as const;
  }

  if (!evidence.revisionName) {
    return {
      accepted: false,
      reason: "Release-smoke evidence does not identify the revision it verified.",
      evidence,
    } as const;
  }

  if (
    evidence.publicReachability.status === "verified"
    && options.expectedPublicHosts.some(
      (host) => !evidence.publicReachability.hosts.includes(host),
    )
  ) {
    return {
      accepted: false,
      reason: "Release-smoke evidence does not include every configured public Quipsly host.",
      evidence,
    } as const;
  }

  return {
    accepted: true,
    reason: "Fresh release-smoke evidence matches the revision serving this response.",
    evidence,
  } as const;
}

function checkStatusCounts(checks: BetaReadinessCheck[]) {
  return Object.fromEntries(
    BETA_READINESS_STATUSES.map((status) => [
      status,
      checks.filter((check) => check.status === status).length,
    ]),
  ) as Record<BetaReadinessStatus, number>;
}

function aggregateReadinessStatus(checks: BetaReadinessCheck[], ready: boolean): BetaReadinessStatus {
  if (ready) return "runtime-verified";

  const required = checks.filter((check) => check.gate === "required" && !check.gateSatisfied);
  if (required.some((check) => check.status === "blocked")) return "blocked";
  if (required.some((check) => check.status === "degraded")) return "degraded";
  if (required.some((check) => check.status === "implemented-unverified")) {
    return "implemented-unverified";
  }
  if (required.some((check) => check.status === "configured")) return "configured";
  return "implemented-unverified";
}

export function createBetaReadinessResponseBody(options: {
  productionCore?: ProductionCoreReadiness | null;
  releaseSmokeReceipt?: {
    token?: string | null;
  } | null;
} = {}) {
  const releaseHealth = createReleaseHealthResponseBody();
  const hasGemini = releaseHealth.config.gemini.configured;
  const hasDatabase = releaseHealth.config.database.configured;
  const hasAuthSecret = releaseHealth.config.authSecret.configured || releaseHealth.config.nextAuthSecret.configured;
  const hasPatreonWebhook = releaseHealth.config.patreonWebhookSecret.configured;
  const hasReleaseSmokeSecret = isReleaseSmokeSecretValid(
    envValue("QUIPSLY_RELEASE_SMOKE_SECRET"),
  );
  const productionCore = options.productionCore ?? null;
  const operatorPlan = createReleaseOperatorPlan({
    hasDatabase,
    hasAuthSecret,
    hasGemini,
    hasPatreonWebhook,
    hasReleaseSmokeSecret,
    productionCore,
  });
  const receiptValidation = validateReleaseSmokeReceiptToken({
    token: options.releaseSmokeReceipt?.token,
    secret: envValue("QUIPSLY_RELEASE_SMOKE_SECRET"),
    expectedRevision: releaseHealth.runtime.revisionName,
    expectedHosts: [releaseHealth.hosts.app, releaseHealth.hosts.marketing],
    requiredRouteIds: RELEASE_SMOKE_REQUIRED_ROUTE_IDS,
  });
  const signedRuntimeEvidence: BetaRuntimeVerificationEvidence | null = receiptValidation.ok
    ? {
        source: "release-smoke",
        checkedAt: receiptValidation.payload.checkedAt,
        revisionName: receiptValidation.payload.revision,
        publicReachability: {
          status: "verified",
          detail: `A signed smoke receipt proves the target route set and direct health checks for all ${receiptValidation.payload.hosts.length} configured public hosts.`,
          hosts: receiptValidation.payload.hosts,
        },
        verifiedCheckIds: [...RELEASE_SMOKE_VERIFIED_CHECK_IDS],
      }
    : null;
  const runtimeEvidence = evaluateRuntimeEvidence({
    evidence: signedRuntimeEvidence,
    failureReason: receiptValidation.reason,
    generatedAt: releaseHealth.generatedAt,
    currentRevisionName: releaseHealth.runtime.revisionName,
    expectedPublicHosts: [releaseHealth.hosts.app, releaseHealth.hosts.marketing],
  });
  const runtimeVerifiedIds = new Set(
    runtimeEvidence.accepted
      ? runtimeEvidence.evidence.verifiedCheckIds
      : [],
  );
  const runtimeFeatureCheck = (options: {
    id: string;
    label: string;
    detail: string;
    blockedReason?: string | null;
  }): BetaReadinessCheck => {
    if (options.blockedReason) {
      return {
        id: options.id,
        label: options.label,
        status: "blocked",
        detail: options.blockedReason,
        gate: "required",
        gateSatisfied: false,
        evidence: {
          kind: "configuration",
          verifiedInThisResponse: true,
          scope: "required configuration missing",
          observedAt: releaseHealth.generatedAt,
        },
      };
    }

    const verified = runtimeVerifiedIds.has(options.id);
    return {
      id: options.id,
      label: options.label,
      status: verified ? "runtime-verified" : "implemented-unverified",
      detail: verified
        ? `${options.detail} A fresh, revision-matched release smoke verified the required route surface. This is runtime route evidence, not a substitute for a signed-in end-to-end user journey.`
        : `${options.detail} Source presence is not runtime proof; a fresh, revision-matched release smoke is still required.`,
      gate: "required",
      gateSatisfied: verified,
      evidence: {
        kind: verified ? "runtime" : "source",
        verifiedInThisResponse: verified,
        scope: verified ? "revision-matched release smoke" : "implementation only",
        observedAt: verified ? runtimeEvidence.evidence?.checkedAt ?? null : null,
      },
    };
  };

  const publicStatus = runtimeEvidence.accepted
    ? runtimeEvidence.evidence.publicReachability.status
    : null;
  const publicReachabilityCheck: BetaReadinessCheck = {
    id: "public-reachability",
    label: "Configured Quipsly host reachability",
    status: publicStatus === "verified"
      ? "runtime-verified"
      : publicStatus === "degraded"
        ? "degraded"
        : publicStatus === "blocked"
          ? "blocked"
          : "implemented-unverified",
    detail: runtimeEvidence.accepted
      ? runtimeEvidence.evidence.publicReachability.detail
      : "This response does not claim that the configured Quipsly app and marketing hosts are reachable. Run the external release smoke; its final request attaches a revision-matched receipt automatically.",
    gate: "required",
    gateSatisfied: publicStatus === "verified",
    evidence: {
      kind: publicStatus ? "runtime" : "source",
      verifiedInThisResponse: publicStatus !== null,
      scope: publicStatus
        ? `external public-host smoke (${runtimeEvidence.evidence?.publicReachability.hosts.length ?? 0} host result(s))`
        : "not checked by this response",
      observedAt: runtimeEvidence.accepted ? runtimeEvidence.evidence.checkedAt : null,
    },
  };

  const productionCoreObservedAtMs = productionCore
    ? Date.parse(productionCore.generatedAt)
    : Number.NaN;
  const productionCoreEvidenceFresh = Number.isFinite(productionCoreObservedAtMs)
    && Date.parse(releaseHealth.generatedAt) - productionCoreObservedAtMs >= -60_000
    && Date.parse(releaseHealth.generatedAt) - productionCoreObservedAtMs <= RUNTIME_EVIDENCE_MAX_AGE_MS;
  const productionCoreStatus: BetaReadinessStatus = !hasDatabase
    ? "blocked"
    : !productionCore || productionCore.status === "unchecked"
      ? "implemented-unverified"
      : productionCore.ok && productionCore.status === "ready" && productionCoreEvidenceFresh
        ? "runtime-verified"
        : "blocked";
  const productionCoreVerified = productionCoreStatus === "runtime-verified";
  const hasDeploymentRuntimeIdentity = Boolean(
    releaseHealth.runtime.cloudRun && releaseHealth.runtime.revisionName,
  );

  const checks: BetaReadinessCheck[] = [
    {
      id: "deployment-runtime",
      label: "Deployment runtime identity",
      status: hasDeploymentRuntimeIdentity
        ? "runtime-verified"
        : "implemented-unverified",
      detail: hasDeploymentRuntimeIdentity
        ? `This response is executing in Cloud Run revision ${releaseHealth.runtime.revisionName}. That proves runtime identity, not public reachability.`
        : "This response does not expose a Cloud Run service and revision identity, so it cannot attest a deployed beta runtime.",
      gate: "required",
      gateSatisfied: hasDeploymentRuntimeIdentity,
      evidence: {
        kind: hasDeploymentRuntimeIdentity ? "runtime" : "source",
        verifiedInThisResponse: hasDeploymentRuntimeIdentity,
        scope: hasDeploymentRuntimeIdentity ? "serving runtime identity" : "local or unidentified runtime",
        observedAt: hasDeploymentRuntimeIdentity ? releaseHealth.generatedAt : null,
      },
    },
    publicReachabilityCheck,
    runtimeFeatureCheck({
      id: "nest-project-system",
      label: "Nest project system",
      detail: "The /projects and /nests implementations exist and use StudioProject-backed access paths.",
      blockedReason: hasDatabase
        ? null
        : "DATABASE_URL is missing, so persisted Nest/project behavior is blocked before runtime verification.",
    }),
    runtimeFeatureCheck({
      id: "living-document-editor",
      label: "Living document editor",
      detail: hasDatabase
        ? "Database configuration is present for the manuscript editor."
        : "DATABASE_URL is missing, so editor persistence is blocked even before runtime verification.",
      blockedReason: hasDatabase
        ? null
        : "DATABASE_URL is missing, so editor persistence is blocked before runtime verification.",
    }),
    {
      id: "production-core-schema",
      label: "Production core database",
      status: productionCoreStatus,
      detail: !hasDatabase
        ? "DATABASE_URL is missing, so production-core table readiness cannot be checked."
        : productionCore
          ? productionCore.ok
            ? productionCoreEvidenceFresh
              ? `The runtime schema query found all production-core tables (${productionCore.presentTableCount}/${productionCore.requiredTableCount}). This does not prove feature routes or public hosts.`
              : "The production-core result says its tables were present, but its timestamp is stale or invalid, so this response does not accept it as runtime evidence."
            : productionCore.status === "unchecked"
              ? "Production-core schema readiness was explicitly unchecked in this response."
              : `${productionCore.missingTables.length} production-core tables are missing or the runtime schema query failed.`
          : "Production-core schema readiness was not checked in this response.",
      gate: "required",
      gateSatisfied: productionCoreVerified,
      evidence: {
        kind: "schema",
        verifiedInThisResponse: productionCoreVerified,
        scope: productionCoreVerified ? "runtime information_schema query" : "schema not proven",
        observedAt: productionCore?.generatedAt ?? null,
      },
    },
    runtimeFeatureCheck({
      id: "recording-editor-spine",
      label: "Recording/editor spine",
      detail: "Recorder/editor handoff and interrupted-take review code exists.",
    }),
    {
      id: "source-aware-research",
      label: "Source-aware research",
      status: !hasGemini
        ? "degraded"
        : runtimeVerifiedIds.has("source-aware-research")
          ? "runtime-verified"
          : "configured",
      detail: hasGemini
        ? runtimeVerifiedIds.has("source-aware-research")
          ? "The research library passed its revision-matched route smoke and GEMINI_API_KEY is configured. No live Gemini completion is claimed by this check."
          : "GEMINI_API_KEY is configured, but provider calls and source-aware behavior were not exercised by this response."
        : "GEMINI_API_KEY is missing; assistant/research is intentionally degraded rather than ready.",
      gate: "required",
      gateSatisfied: hasGemini && runtimeVerifiedIds.has("source-aware-research"),
      evidence: {
        kind: hasGemini && runtimeVerifiedIds.has("source-aware-research") ? "runtime" : "configuration",
        verifiedInThisResponse: hasGemini,
        scope: hasGemini && runtimeVerifiedIds.has("source-aware-research")
          ? "revision-matched provider smoke"
          : hasGemini
            ? "secret presence only"
            : "missing configuration",
        observedAt: hasGemini && runtimeVerifiedIds.has("source-aware-research")
          ? runtimeEvidence.evidence?.checkedAt ?? null
          : releaseHealth.generatedAt,
      },
    },
    {
      id: "auth-configuration",
      label: "Beta authentication configuration",
      status: hasAuthSecret ? "configured" : "blocked",
      detail: hasAuthSecret
        ? "An auth secret is configured. This proves secret presence only; the release smoke verifies the unauthenticated boundary, while a signed-in user journey remains separate evidence."
        : "AUTH_SECRET or NEXTAUTH_SECRET is missing; signed-in beta access is blocked.",
      gate: "required",
      gateSatisfied: hasAuthSecret,
      evidence: {
        kind: "configuration",
        verifiedInThisResponse: true,
        scope: "environment variable presence only",
        observedAt: releaseHealth.generatedAt,
      },
    },
    {
      id: "release-smoke-secret",
      label: "Release-smoke receipt secret",
      status: hasReleaseSmokeSecret ? "configured" : "blocked",
      detail: hasReleaseSmokeSecret
        ? "QUIPSLY_RELEASE_SMOKE_SECRET meets the receipt verifier's size bound. Its value is never returned by this response."
        : "QUIPSLY_RELEASE_SMOKE_SECRET is missing or outside the allowed size bound, so signed promotion receipts fail closed.",
      gate: "required",
      gateSatisfied: hasReleaseSmokeSecret,
      evidence: {
        kind: "configuration",
        verifiedInThisResponse: true,
        scope: "secret presence and byte-length validation only",
        observedAt: releaseHealth.generatedAt,
      },
    },
    runtimeFeatureCheck({
      id: "auth-session-boundary",
      label: "Session security boundary",
      detail: "The Firebase/Quipsly session boundary exists and the smoke requires a clean unauthenticated 401. This check does not claim that a signed-in user journey was exercised.",
      blockedReason: hasAuthSecret
        ? null
        : "An auth secret is missing, so a signed-in session smoke cannot run safely.",
    }),
    {
      id: "patreon-beta",
      label: "Patreon beta access",
      status: hasAuthSecret && hasPatreonWebhook ? "configured" : "degraded",
      detail: hasAuthSecret && hasPatreonWebhook
        ? "Auth and Patreon webhook secrets are configured. No webhook delivery or reconciliation is claimed by this check."
        : "Auth or Patreon webhook configuration is missing; Patreon reconciliation is degraded.",
      gate: "advisory",
      gateSatisfied: hasAuthSecret && hasPatreonWebhook,
      evidence: {
        kind: "configuration",
        verifiedInThisResponse: true,
        scope: "environment variable presence only",
        observedAt: releaseHealth.generatedAt,
      },
    },
    runtimeFeatureCheck({
      id: "publishing-packets",
      label: "Publishing packets",
      detail: "Publishing packet and receipt-backed status implementations exist.",
      blockedReason: hasDatabase
        ? null
        : "DATABASE_URL is missing, so persisted publishing packets and receipts are blocked before runtime verification.",
    }),
    {
      id: "output-catalog",
      label: "Output catalog",
      status: "catalog-only",
      detail: "The output catalog describes capability definitions. Its counts are not artifact, provider, publication, or availability evidence.",
      gate: "advisory",
      gateSatisfied: true,
      evidence: {
        kind: "catalog",
        verifiedInThisResponse: true,
        scope: `${QUIPSLY_OUTPUT_CATALOG.length} source definitions`,
        observedAt: releaseHealth.generatedAt,
      },
    },
    {
      id: "art-foundry",
      label: "Art Foundry",
      status: "catalog-only",
      detail: "Generated-art definitions are present. This does not prove generation-provider access, approved assets, or public delivery.",
      gate: "advisory",
      gateSatisfied: true,
      evidence: {
        kind: "catalog",
        verifiedInThisResponse: true,
        scope: `${generatedQuipslyArt.length} generated-art definitions`,
        observedAt: releaseHealth.generatedAt,
      },
    },
    {
      id: "beta-readiness-dashboard",
      label: "Beta readiness dashboard",
      status: "runtime-verified",
      detail: "This evidence evaluator produced the current response. That proves this contract executed, not that its public URL is reachable.",
      gate: "advisory",
      gateSatisfied: true,
      evidence: {
        kind: "runtime",
        verifiedInThisResponse: true,
        scope: "readiness evaluator execution",
        observedAt: releaseHealth.generatedAt,
      },
    },
  ];
  const requiredChecks = checks.filter((check) => check.gate === "required");
  const ready = requiredChecks.every((check) => check.gateSatisfied);
  const readinessStatus = aggregateReadinessStatus(checks, ready);
  const statusCounts = checkStatusCounts(checks);

  return {
    contractVersion: 2,
    verificationScope: "quipsly-preview-promotion-v1" as const,
    ok: ready,
    evaluationCompleted: true,
    ready,
    readinessStatus,
    generatedAt: releaseHealth.generatedAt,
    app: releaseHealth.app,
    runtime: releaseHealth.runtime,
    release: releaseHealth.release,
    hosts: releaseHealth.hosts,
    operatorPlan,
    catalogs: {
      outputTypes: QUIPSLY_OUTPUT_CATALOG.length,
      generatedArtAssets: generatedQuipslyArt.length,
      evidenceClass: "catalog-only" as const,
    },
    productionCore,
    evidence: {
      runtimeVerification: {
        accepted: runtimeEvidence.accepted,
        reason: runtimeEvidence.reason,
        receiptCode: receiptValidation.code,
        source: runtimeEvidence.evidence?.source ?? null,
        checkedAt: runtimeEvidence.evidence?.checkedAt ?? null,
        revisionName: runtimeEvidence.evidence?.revisionName ?? null,
        expiresAt: receiptValidation.ok ? receiptValidation.payload.expiresAt : null,
        passedRouteCount: receiptValidation.ok ? receiptValidation.payload.passedRouteIds.length : 0,
      },
      publicReachability: {
        claimed: publicReachabilityCheck.status === "runtime-verified",
        status: publicReachabilityCheck.status,
        detail: publicReachabilityCheck.detail,
      },
      claims: {
        configuredQuipslyHostsReachable: publicReachabilityCheck.status === "runtime-verified",
        requiredRouteSurfacesRendered: runtimeEvidence.accepted,
        productionCoreSchemaQueried: productionCoreVerified,
        signedInEndToEndJourneyExercised: receiptValidation.ok
          && receiptValidation.payload.passedRouteIds.includes("auth.signed-in-journey"),
        liveProviderCompletionExercised: false,
        customerDataMutated: false,
      },
    },
    summary: {
      requiredChecks: requiredChecks.length,
      satisfiedRequiredChecks: requiredChecks.filter((check) => check.gateSatisfied).length,
      statusCounts,
    },
    checks,
  };
}
