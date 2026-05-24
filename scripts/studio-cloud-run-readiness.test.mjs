import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  createStudioAllowlistIdentityFromList,
  isStudioAllowlistAuthModeValue,
  isStudioEmailAllowedInList,
  normalizeStudioAuthEmail,
  parseStudioEmailList,
  STUDIO_ACCESS_ROLE_SET,
  STUDIO_ALLOWLIST_ROLE,
} from "../apps/studio/src/lib/studio-auth-mode-core.mjs";
import {
  createStudioHealthResponseBody,
  STUDIO_HEALTH_HEADERS,
  STUDIO_HEALTH_RESPONSE,
} from "../apps/studio/src/lib/studio-health.mjs";

test("normalizes Studio auth emails", () => {
  assert.equal(
    normalizeStudioAuthEmail("  Owner@Example.COM  "),
    "owner@example.com",
  );
});

test("parses comma-separated Studio allowlist emails", () => {
  assert.deepEqual(parseStudioEmailList(" One@Example.com, two@example.com ,, "), [
    "one@example.com",
    "two@example.com",
  ]);
});

test("activates allowlist mode only for the exact allowlist value", () => {
  assert.equal(isStudioAllowlistAuthModeValue("allowlist"), true);
  assert.equal(isStudioAllowlistAuthModeValue("database"), false);
  assert.equal(isStudioAllowlistAuthModeValue("ALLOWLIST"), false);
  assert.equal(isStudioAllowlistAuthModeValue(undefined), false);
});

test("matches allowed Studio emails after normalization", () => {
  const allowlist = "owner@example.com, collaborator@example.com";

  assert.equal(isStudioEmailAllowedInList(" OWNER@example.com ", allowlist), true);
  assert.equal(isStudioEmailAllowedInList("blocked@example.com", allowlist), false);
});

test("creates a temporary Studio allowlist identity for allowed email", () => {
  const identity = createStudioAllowlistIdentityFromList(
    {
      email: " Owner@Example.com ",
      name: "  Studio Owner  ",
      image: "https://example.com/avatar.png",
    },
    "owner@example.com",
  );

  assert.deepEqual(identity, {
    id: "studio-allowlist:owner@example.com",
    primaryEmail: "owner@example.com",
    name: "Studio Owner",
    image: "https://example.com/avatar.png",
    roles: [STUDIO_ALLOWLIST_ROLE],
    isStaff: true,
  });
  assert.equal(STUDIO_ACCESS_ROLE_SET.has(STUDIO_ALLOWLIST_ROLE), true);
});

test("returns null for a non-allowed Studio email", () => {
  assert.equal(
    createStudioAllowlistIdentityFromList(
      { email: "blocked@example.com" },
      "owner@example.com",
    ),
    null,
  );
});

test("defines a non-sensitive Studio health response", async () => {
  assert.deepEqual(createStudioHealthResponseBody(), {
    ok: true,
    service: "high-ground-studio",
    app: "studio",
  });
  assert.deepEqual(STUDIO_HEALTH_RESPONSE, {
    ok: true,
    service: "high-ground-studio",
    app: "studio",
  });

  const response = Response.json(createStudioHealthResponseBody(), {
    headers: STUDIO_HEALTH_HEADERS,
  });

  assert.deepEqual(await response.json(), STUDIO_HEALTH_RESPONSE);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("Studio deploy helper ignores GitHub auth credential files only", () => {
  const deployScript = readFileSync("scripts/studio-cloud-run-deploy.mjs", "utf8");
  const dockerfile = readFileSync("apps/studio/Dockerfile", "utf8");

  assert.match(deployScript, /getDeployBlockingDirtyStatus/);
  assert.match(deployScript, /gha-creds-/);
  assert.match(deployScript, /ALLOW_DIRTY_DEPLOY/);
  assert.match(deployScript, /STUDIO_IMAGE_BUILD_STRATEGY/);
  assert.match(deployScript, /apps\/studio\/Dockerfile/);
  assert.match(dockerfile, /ca-certificates openssl/);
});

test("preflight script is read-only and completes repository checks", () => {
  const result = spawnSync("node", ["scripts/studio-cloud-run-preflight.mjs"], {
    encoding: "utf8",
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /Read-only check\. This script is not a deployment\./);
  assert.match(output, /does not run Cloud Build, deploy Cloud Run/);
  assert.match(output, /Result: repository readiness checks passed\./);
});
