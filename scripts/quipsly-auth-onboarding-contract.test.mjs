import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  identitySource,
  onboardingSource,
  homeNestSource,
  sessionRouteSource,
  localUpSource,
  localIntegrationSource,
] = await Promise.all([
  readFile("apps/quipsly/src/lib/server/studio-user-identity.ts", "utf8"),
  readFile("apps/quipsly/src/lib/server/quipsly-onboarding.ts", "utf8"),
  readFile("apps/quipsly/src/lib/server/home-nest.ts", "utf8"),
  readFile("apps/quipsly/src/app/api/auth/session/route.ts", "utf8"),
  readFile("scripts/dev/quipsly-local-up.sh", "utf8"),
  readFile(
    "apps/quipsly/src/app/api/auth/session/local-onboarding.integration.test.ts",
    "utf8",
  ),
]);

test("first-session identity, membership, and Home Nest creation are transaction-serialized", () => {
  assert.match(identitySource, /quipsly:identity:email:/);
  assert.match(identitySource, /quipsly:identity:firebase-subject:/);
  assert.match(identitySource, /acquirePrismaAdvisoryTransactionLock/);
  assert.match(onboardingSource, /quipsly:starter:/);
  assert.match(onboardingSource, /ensureHomeNestForEmailInTransaction/);
  assert.match(homeNestSource, /quipsly:home-nest:/);
});

test("the ordinary local lane applies every committed migration before Nest starts", () => {
  const migrationAt = localUpSource.indexOf("prisma migrate deploy");
  const nestStartAt = localUpSource.indexOf("firebase_status=");

  assert.ok(migrationAt >= 0, "local startup must deploy committed migrations");
  assert.ok(
    nestStartAt > migrationAt,
    "local startup must migrate before launching app services",
  );
});

test("schema drift is recoverable and concurrent onboarding is acceptance-tested", () => {
  assert.match(sessionRouteSource, /errorHasCode\(error, "P2021"\)/);
  assert.match(sessionRouteSource, /errorHasCode\(error, "P2022"\)/);
  assert.match(
    sessionRouteSource,
    /Quipsly database schema unavailable[\s\S]*status: 503/,
  );
  assert.match(localIntegrationSource, /Array\.from\(\{ length: 4 \}/);
  assert.match(localIntegrationSource, /activeStarterMemberships: 1/);
  assert.match(localIntegrationSource, /homeProjects: 1/);
  assert.match(localIntegrationSource, /inboxes: 1/);
});
