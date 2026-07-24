/** @jest-environment node */

import type { ProductionCoreReadiness } from "@/lib/server/production-core-readiness";
import {
  BETA_READINESS_STATUSES,
  createBetaReadinessResponseBody,
} from "./release-health";
import {
  createReleaseSmokeReceiptToken,
  RELEASE_SMOKE_REQUIRED_ROUTE_IDS,
} from "@/lib/server/release-smoke-receipt-core";

const RECEIPT_SECRET = "release-smoke-test-secret-with-at-least-32-bytes";

const MANAGED_ENV_KEYS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "GEMINI_API_KEY",
  "PATREON_WEBHOOK_SECRET",
  "QUIPSLY_RELEASE_SMOKE_SECRET",
  "K_SERVICE",
  "K_REVISION",
] as const;

const originalEnv = Object.fromEntries(
  MANAGED_ENV_KEYS.map((key) => [key, process.env[key]]),
);

const readyProductionCore: ProductionCoreReadiness = {
  ok: true,
  status: "ready",
  generatedAt: new Date().toISOString(),
  requiredTableCount: 14,
  presentTableCount: 14,
  missingTables: [],
  groups: [],
  nextStep: "Proceed with route smoke tests.",
};

function setCleanEnv() {
  for (const key of MANAGED_ENV_KEYS) delete process.env[key];
}

function fullSignedReceipt(options: {
  checkedAt?: Date;
  revision?: string;
  hosts?: string[];
  passedRouteIds?: string[];
  secret?: string;
} = {}) {
  const hosts = options.hosts ?? ["nest.quipsly.com", "quipsly.com"];
  const secret = options.secret ?? RECEIPT_SECRET;
  return {
    token: createReleaseSmokeReceiptToken({
      secret,
      revision: options.revision ?? "quipsly-00042-truth",
      checkedAt: options.checkedAt,
      hosts,
      passedRouteIds: options.passedRouteIds ?? [
        ...RELEASE_SMOKE_REQUIRED_ROUTE_IDS,
        ...hosts.map((host) => `public-host:${host}`),
      ],
    }),
  };
}

describe("beta readiness evidence contract", () => {
  beforeEach(setCleanEnv);

  afterAll(() => {
    for (const key of MANAGED_ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("never turns source definitions or catalogs into ready claims", () => {
    process.env.DATABASE_URL = "postgresql://configured-but-unverified";
    const readiness = createBetaReadinessResponseBody();

    expect(readiness.contractVersion).toBe(2);
    expect(readiness.verificationScope).toBe("quipsly-preview-promotion-v1");
    expect(readiness.ok).toBe(false);
    expect(readiness.ready).toBe(false);
    expect(readiness.readinessStatus).toBe("blocked");
    expect(readiness.evidence.publicReachability).toMatchObject({
      claimed: false,
      status: "implemented-unverified",
    });
    expect(readiness.checks.find((check) => check.id === "nest-project-system")).toMatchObject({
      status: "implemented-unverified",
      gateSatisfied: false,
      evidence: { verifiedInThisResponse: false },
    });
    expect(readiness.checks.find((check) => check.id === "output-catalog")).toMatchObject({
      status: "catalog-only",
      gate: "advisory",
    });
    expect(readiness.checks.find((check) => check.id === "art-foundry")).toMatchObject({
      status: "catalog-only",
      gate: "advisory",
    });
    expect(readiness.checks.some((check) => (check.status as string) === "ready")).toBe(false);
    expect(readiness.checks.every((check) => BETA_READINESS_STATUSES.includes(check.status))).toBe(true);
  });

  it("stays unready when config, runtime identity, and schema exist but feature/public smoke does not", () => {
    process.env.DATABASE_URL = "postgresql://configured-only";
    process.env.AUTH_SECRET = "configured-only";
    process.env.GEMINI_API_KEY = "configured-only";
    process.env.K_SERVICE = "quipsly";
    process.env.K_REVISION = "quipsly-00042-truth";
    process.env.QUIPSLY_RELEASE_SMOKE_SECRET = RECEIPT_SECRET;

    const readiness = createBetaReadinessResponseBody({
      productionCore: readyProductionCore,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.ok).toBe(false);
    expect(readiness.readinessStatus).toBe("implemented-unverified");
    expect(readiness.checks.find((check) => check.id === "deployment-runtime")?.status).toBe("runtime-verified");
    expect(readiness.checks.find((check) => check.id === "production-core-schema")?.status).toBe("runtime-verified");
    expect(readiness.checks.find((check) => check.id === "auth-configuration")?.status).toBe("configured");
    expect(readiness.evidence.runtimeVerification.accepted).toBe(false);
    expect(readiness.evidence.publicReachability.claimed).toBe(false);
  });

  it("rejects stale release-smoke evidence instead of creating false runtime verification", () => {
    process.env.DATABASE_URL = "postgresql://configured-only";
    process.env.AUTH_SECRET = "configured-only";
    process.env.GEMINI_API_KEY = "configured-only";
    process.env.K_SERVICE = "quipsly";
    process.env.K_REVISION = "quipsly-00042-truth";
    process.env.QUIPSLY_RELEASE_SMOKE_SECRET = RECEIPT_SECRET;

    const readiness = createBetaReadinessResponseBody({
      productionCore: readyProductionCore,
      releaseSmokeReceipt: fullSignedReceipt({
        checkedAt: new Date(Date.now() - 6 * 60 * 1000),
      }),
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.evidence.runtimeVerification.accepted).toBe(false);
    expect(readiness.evidence.runtimeVerification).toMatchObject({
      receiptCode: "RELEASE_SMOKE_RECEIPT_EXPIRED",
    });
    expect(readiness.evidence.runtimeVerification.reason).toMatch(/expired|time bound/i);
    expect(readiness.evidence.publicReachability.claimed).toBe(false);
  });

  it("fails closed when a token arrives but the explicit runtime secret is missing", () => {
    process.env.DATABASE_URL = "postgresql://configured-only";
    process.env.AUTH_SECRET = "configured-only";
    process.env.GEMINI_API_KEY = "configured-only";
    process.env.K_SERVICE = "quipsly";
    process.env.K_REVISION = "quipsly-00042-truth";

    const signedReceipt = fullSignedReceipt();
    const readiness = createBetaReadinessResponseBody({
      productionCore: readyProductionCore,
      releaseSmokeReceipt: signedReceipt,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.evidence.runtimeVerification).toMatchObject({
      accepted: false,
      receiptCode: "RELEASE_SMOKE_SECRET_MISSING",
      passedRouteCount: 0,
    });
    expect(readiness.checks.find((check) => check.id === "release-smoke-secret")).toMatchObject({
      status: "blocked",
      gateSatisfied: false,
    });
  });

  it("requires fresh, revision-matched runtime evidence for every required feature before ready is true", () => {
    process.env.DATABASE_URL = "postgresql://runtime-checked";
    process.env.AUTH_SECRET = "configured";
    process.env.GEMINI_API_KEY = "configured";
    process.env.K_SERVICE = "quipsly";
    process.env.K_REVISION = "quipsly-00042-truth";
    process.env.QUIPSLY_RELEASE_SMOKE_SECRET = RECEIPT_SECRET;

    const signedReceipt = fullSignedReceipt();
    const readiness = createBetaReadinessResponseBody({
      productionCore: readyProductionCore,
      releaseSmokeReceipt: signedReceipt,
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.ok).toBe(true);
    expect(readiness.readinessStatus).toBe("runtime-verified");
    expect(readiness.summary.satisfiedRequiredChecks).toBe(readiness.summary.requiredChecks);
    expect(readiness.evidence.runtimeVerification.accepted).toBe(true);
    expect(readiness.evidence.publicReachability).toMatchObject({
      claimed: true,
      status: "runtime-verified",
    });
    expect(readiness.evidence.claims).toMatchObject({
      configuredQuipslyHostsReachable: true,
      requiredRouteSurfacesRendered: true,
      signedInEndToEndJourneyExercised: true,
      liveProviderCompletionExercised: false,
      customerDataMutated: false,
    });
    expect(JSON.stringify(readiness)).not.toContain(RECEIPT_SECRET);
    expect(JSON.stringify(readiness)).not.toContain(signedReceipt.token);
  });
});
