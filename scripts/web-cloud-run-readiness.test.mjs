import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  createWebHealthResponseBody,
  WEB_HEALTH_HEADERS,
  WEB_HEALTH_RESPONSE,
} from "../apps/web/src/lib/web-health.mjs";

test("defines a non-sensitive web health response", async () => {
  assert.deepEqual(createWebHealthResponseBody(), {
    ok: true,
    service: "high-ground-studio",
    app: "web",
  });
  assert.deepEqual(WEB_HEALTH_RESPONSE, {
    ok: true,
    service: "high-ground-studio",
    app: "web",
  });

  const response = Response.json(createWebHealthResponseBody(), {
    headers: WEB_HEALTH_HEADERS,
  });

  assert.deepEqual(await response.json(), WEB_HEALTH_RESPONSE);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("web Dockerfile uses standalone webpack build path", () => {
  const dockerfile = readFileSync("apps/web/Dockerfile", "utf8");
  assert.match(dockerfile, /pnpm --filter web exec next build --webpack/);
  assert.match(dockerfile, /ca-certificates openssl/);
  assert.match(
    dockerfile,
    /DATABASE_URL=postgresql:\/\/build:build@localhost:5432\/high_ground_build/,
  );
  assert.match(dockerfile, /CMD \["node", "apps\/web\/server\.js"\]/);
});

test("web Next config is ready for Cloud Run standalone output", () => {
  const nextConfig = readFileSync("apps/web/next.config.mjs", "utf8");
  assert.match(nextConfig, /output: "standalone"/);
  assert.match(nextConfig, /outputFileTracingRoot/);
  assert.match(nextConfig, /@high-ground\/worldhub-domain/);
});

test("web Cloud Build config targets the web Dockerfile", () => {
  const cloudbuild = readFileSync("cloudbuild.web.yaml", "utf8");
  assert.match(cloudbuild, /apps\/web\/Dockerfile/);
  assert.match(cloudbuild, /_IMAGE_NAME: web/);
});

test("postgres copy job image is guarded for staged Cloud SQL migration", () => {
  const cloudbuild = readFileSync("cloudbuild.postgres-copy.yaml", "utf8");
  const dockerfile = readFileSync("ops/postgres-copy.Dockerfile", "utf8");
  const entrypoint = readFileSync("ops/postgres-copy-entrypoint.sh", "utf8");

  assert.match(cloudbuild, /ops\/postgres-copy\.Dockerfile/);
  assert.match(cloudbuild, /_IMAGE_NAME: postgres-copy/);
  assert.match(dockerfile, /FROM postgres:17-bookworm/);
  assert.match(entrypoint, /SOURCE_DATABASE_URL is required/);
  assert.match(entrypoint, /TARGET_DATABASE_URL is required/);
  assert.match(entrypoint, /POSTGRES_COPY_ALLOW_NONEMPTY_TARGET/);
  assert.match(entrypoint, /tr -d '\\r\\n'/);
  assert.match(entrypoint, /--schema=public/);
  assert.match(entrypoint, /--data-only/);
  assert.match(entrypoint, /--no-owner/);
  assert.match(entrypoint, /SET transaction_timeout/);
  assert.match(entrypoint, /ON_ERROR_STOP=1/);
  assert.match(entrypoint, /Database URLs and row data are never printed/);
});

test("web deploy helpers are wired for explicit first-service creation", () => {
  const packageJson = readFileSync("package.json", "utf8");
  const deployScript = readFileSync("scripts/web-cloud-run-deploy.mjs", "utf8");
  const domainScript = readFileSync(
    "scripts/web-domain-readiness.mjs",
    "utf8",
  );
  const seedScript = readFileSync(
    "scripts/web-cloud-run-seed-secrets-from-env.mjs",
    "utf8",
  );
  const databaseReportScript = readFileSync(
    "scripts/web-database-target-report.mjs",
    "utf8",
  );
  const cloudSqlPrepareScript = readFileSync(
    "scripts/web-cloudsql-target-prepare.mjs",
    "utf8",
  );

  assert.match(packageJson, /web:cloudrun:deploy/);
  assert.match(packageJson, /web:cloudrun:seed-secrets/);
  assert.match(packageJson, /web:cloudsql:prepare/);
  assert.match(packageJson, /web:db:target:report/);
  assert.match(packageJson, /web:domain:check/);
  assert.match(deployScript, /WEB_CLOUD_RUN_CREATE_SERVICE/);
  assert.match(deployScript, /web-cloud-run@/);
  assert.match(deployScript, /--set-secrets/);
  assert.match(deployScript, /web-cloudsql-database-url/);
  assert.match(deployScript, /getTrafficPercentForRevision/);
  assert.match(deployScript, /update-traffic/);
  assert.match(deployScript, /projection-stage\/import/);
  assert.match(deployScript, /team\/progress/);
  assert.match(deployScript, /gha-creds-/);
  assert.match(deployScript, /WEB_IMAGE_BUILD_STRATEGY/);
  assert.match(deployScript, /apps\/web\/Dockerfile/);
  assert.match(domainScript, /app\.highgroundodyssey\.com/);
  assert.match(domainScript, /ghs\.googlehosted\.com\./);
  assert.match(domainScript, /does not change DNS, OAuth, Cloud Run/);
  assert.match(domainScript, /api\/auth\/callback\/google/);
  assert.match(seedScript, /Secret values are not printed/);
  assert.match(seedScript, /web-database-url/);
  assert.match(databaseReportScript, /Web database target report/);
  assert.match(databaseReportScript, /never prints the full URL/);
  assert.match(databaseReportScript, /WEB_DB_TARGET_REPORT_REQUIRE_MOUNT/);
  assert.match(databaseReportScript, /web-cloudsql-database-url/);
  assert.match(databaseReportScript, /Cloud SQL attachment alone does not cut over Prisma/);
  assert.match(cloudSqlPrepareScript, /Generated passwords and connection URLs are never printed/);
  assert.match(cloudSqlPrepareScript, /web-cloudsql-database-url/);
  assert.match(cloudSqlPrepareScript, /web-database-url/);
  assert.match(cloudSqlPrepareScript, /--password=REDACTED/);
});

test("web runbook mounts OAuth client id from Secret Manager", () => {
  const runbook = readFileSync("docs/runbooks/web-cloud-run.md", "utf8");
  assert.match(runbook, /web-google-client-id/);
  assert.match(
    runbook,
    /GOOGLE_CLIENT_ID=web-google-client-id:latest/,
  );
  assert.doesNotMatch(
    runbook,
    /--set-env-vars=GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID/,
  );
});

test("web preflight script is read-only and completes repository checks", () => {
  const result = spawnSync("node", ["scripts/web-cloud-run-preflight.mjs"], {
    encoding: "utf8",
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /Read-only check\. This script is not a deployment\./);
  assert.match(output, /does not run Cloud Build, deploy Cloud Run/);
  assert.match(output, /Result: repository readiness checks passed\./);
});
