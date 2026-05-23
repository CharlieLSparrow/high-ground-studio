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
