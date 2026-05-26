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

test("Content Studio checkpoints are wired through authenticated API", () => {
  const route = readFileSync(
    "apps/studio/src/app/api/content-studio/snapshots/route.ts",
    "utf8",
  );
  const serverModel = readFileSync(
    "apps/studio/src/lib/server/studio-content-workspace-snapshots.ts",
    "utf8",
  );
  const client = readFileSync(
    "apps/studio/src/app/content-studio/content-studio-client.tsx",
    "utf8",
  );

  assert.match(route, /getStudioAccessState/);
  assert.match(route, /getStudioDatabaseUrl/);
  assert.match(route, /createStudioContentWorkspaceSnapshot/);
  assert.match(route, /getLatestStudioContentWorkspaceSnapshot/);
  assert.match(serverModel, /studioContentWorkspaceSnapshot/);
  assert.match(serverModel, /safeContentStudioWorkspaceInput/);
  assert.match(client, /Save Checkpoint/);
  assert.match(client, /Load Latest/);
  assert.match(client, /Refresh History/);
  assert.match(client, /Load This Checkpoint/);
  assert.match(client, /No autosave, provider\s+call,\s+or public publish action/);
});

test("Content Studio durable projects are wired through authenticated API", () => {
  const route = readFileSync(
    "apps/studio/src/app/api/content-studio/projects/route.ts",
    "utf8",
  );
  const serverModel = readFileSync(
    "apps/studio/src/lib/server/studio-content-projects.ts",
    "utf8",
  );
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const client = readFileSync(
    "apps/studio/src/app/content-studio/content-studio-client.tsx",
    "utf8",
  );

  assert.match(route, /getStudioAccessState/);
  assert.match(route, /getStudioDatabaseUrl/);
  assert.match(route, /upsertStudioContentProject/);
  assert.match(route, /listStudioContentProjects/);
  assert.match(route, /getStudioContentProject/);
  assert.match(serverModel, /studioContentProject/);
  assert.match(serverModel, /createContentStudioProjectHandoff/);
  assert.match(serverModel, /createContentStudioProductionPacket/);
  assert.match(schema, /model StudioContentProject/);
  assert.match(schema, /@@unique\(\[ownerEmail, localProjectId\]\)/);
  assert.match(client, /Save Project/);
  assert.match(client, /Refresh List/);
  assert.match(client, /Open Project/);
});

test("Manuscript latest live link is authenticated and snapshot-backed", () => {
  const route = readFileSync(
    "apps/studio/src/app/api/manuscript/live/[slug]/route.ts",
    "utf8",
  );
  const page = readFileSync(
    "apps/studio/src/app/manuscript/live/[slug]/page.tsx",
    "utf8",
  );
  const serverModel = readFileSync(
    "apps/studio/src/lib/server/studio-manuscript-snapshots.ts",
    "utf8",
  );
  const client = readFileSync(
    "apps/studio/src/app/manuscript/studio-manuscript-client.tsx",
    "utf8",
  );

  assert.match(route, /getStudioAccessState/);
  assert.match(route, /getStudioDatabaseUrl/);
  assert.match(route, /isStudioManuscriptLiveSlug/);
  assert.match(route, /getLatestStudioManuscriptSnapshotForLiveSlug/);
  assert.match(page, /StudioAccessShell/);
  assert.match(page, /initialLiveSnapshotSlug/);
  assert.match(serverModel, /normalizeStudioManuscriptLiveSlug/);
  assert.match(serverModel, /studioManuscriptSnapshot\.findFirst/);
  assert.match(serverModel, /orderBy: \{ updatedAt: "desc" \}/);
  assert.match(client, /MANUSCRIPT_LIVE_LATEST_PATH/);
  assert.match(client, /\/manuscript\/live\/latest/);
  assert.match(client, /Copy phone link/);
  assert.match(client, /loadLiveSnapshotBySlug/);
});

test("Manuscript everyday UI keeps save controls in the footer dialog", () => {
  const client = readFileSync(
    "apps/studio/src/app/manuscript/studio-manuscript-client.tsx",
    "utf8",
  );

  assert.match(client, /isSaveShareDialogOpen/);
  assert.match(client, /data-testid="manuscript-save-share-footer"/);
  assert.match(client, /data-testid="manuscript-save-share-dialog"/);
  assert.match(client, /data-testid="manuscript-mobile-save-share"/);
  assert.match(client, /data-testid="manuscript-mobile-footer-status"/);
  assert.match(client, /data-testid="manuscript-mobile-tools-menu"/);
  assert.match(client, /data-testid="manuscript-primary-save-panel"/);
  assert.match(client, /data-testid="manuscript-primary-save"/);
  assert.match(client, /data-testid="manuscript-primary-copy-phone-link"/);
  assert.match(client, /data-testid="manuscript-mode-select"/);
  assert.match(
    client,
    /manuscript-prosemirror min-h-\[560px\] bg-transparent px-0 py-0/,
  );
  assert.match(client, /"order-1 grid min-w-0 gap-3 md:order-none"/);
  assert.doesNotMatch(client, /data-testid="manuscript-command-save"/);
  assert.doesNotMatch(client, /data-testid="manuscript-command-copy-phone-link"/);
  assert.doesNotMatch(client, /<h2 className=\{panelTitleClassName\}>Manuscript surface<\/h2>/);
  assert.doesNotMatch(
    client,
    /panelClassName,\n\s+"order-1 grid gap-3 md:order-none"/,
  );
  assert.match(client, /everydayManuscriptSidePanelModes/);
  assert.match(client, /devManuscriptSidePanelModes/);
  assert.match(client, /isDevMode && sidePanelMode === "backup"/);
  assert.match(client, /isDevMode && sidePanelMode === "publish"/);
});

test("Manuscript tagging controls live in sidebar Mark mode", () => {
  const client = readFileSync(
    "apps/studio/src/app/manuscript/studio-manuscript-client.tsx",
    "utf8",
  );

  assert.doesNotMatch(client, /taggingDock/);
  assert.doesNotMatch(client, /Sticky tagging menu/);
  assert.match(client, /sidePanelMode === "mark"/);
  assert.match(client, /Mark selected text/);
  assert.match(client, /Selection ready/);
});

test("Manuscript author marks render as block washes under semantic marks", () => {
  const client = readFileSync(
    "apps/studio/src/app/manuscript/studio-manuscript-client.tsx",
    "utf8",
  );
  const globalsCss = readFileSync("apps/studio/src/app/globals.css", "utf8");

  assert.match(client, /manuscript-author-block-charlie/);
  assert.match(client, /manuscript-author-block-homer/);
  assert.match(client, /node\.descendants\(\(childNode\)/);
  assert.match(globalsCss, /--manuscript-author-wash/);
  assert.doesNotMatch(globalsCss, /--manuscript-author-outline/);
  assert.doesNotMatch(
    globalsCss,
    /inset 0 0 0 1px var\(--manuscript-author-outline\)/,
  );
  assert.match(globalsCss, /margin-inline: -0\.42rem/);
  assert.match(globalsCss, /padding: 0\.16rem 0\.42rem 0\.22rem/);
  assert.match(globalsCss, /\.manuscript-prosemirror \.manuscript-author-block-charlie/);
  assert.match(globalsCss, /\.manuscript-prosemirror \.manuscript-author-block-homer/);
  assert.match(globalsCss, /@supports selector\(:has\(\*\)\)/);
  assert.match(globalsCss, /:has\(\.manuscript-author-charlie\)/);
  assert.match(globalsCss, /:has\(\.manuscript-author-homer\)/);
  assert.match(
    globalsCss,
    /\.manuscript-prosemirror \.manuscript-author-charlie,\n\.manuscript-prosemirror \.manuscript-author-homer,\n\.manuscript-prosemirror \.manuscript-author-unassigned \{\n\s*background: transparent;/,
  );
  assert.match(
    globalsCss,
    /\.manuscript-prosemirror \.manuscript-author-block-charlie \{\n\s*--manuscript-author-wash: rgba\(82, 164, 220, 0\.18\);/,
  );
  assert.match(
    globalsCss,
    /\.manuscript-prosemirror \.manuscript-author-block-homer \{\n\s*--manuscript-author-wash: rgba\(126, 200, 134, 0\.18\);/,
  );
  assert.match(globalsCss, /\.manuscript-prosemirror \.manuscript-semantic-cited-quotation/);
});

test("Prisma db-push job image is available for Cloud SQL schema sync", () => {
  const dockerfile = readFileSync("ops/prisma-db-push.Dockerfile", "utf8");
  const cloudbuild = readFileSync("cloudbuild.prisma-db-push.yaml", "utf8");
  const gcloudignore = readFileSync(".gcloudignore", "utf8");

  assert.match(dockerfile, /pnpm@/);
  assert.match(dockerfile, /prisma\.config\.ts/);
  assert.match(dockerfile, /prisma\/schema\.prisma/);
  assert.match(dockerfile, /ca-certificates openssl/);
  assert.match(dockerfile, /CMD \["pnpm", "db:push"\]/);
  assert.match(cloudbuild, /ops\/prisma-db-push\.Dockerfile/);
  assert.match(cloudbuild, /prisma-db-push/);
  assert.match(cloudbuild, /_REGION: us-central1/);
  assert.match(cloudbuild, /\$\{_REGION\}-docker\.pkg\.dev/);
  assert.match(gcloudignore, /^\.env$/m);
  assert.match(gcloudignore, /^\.env\.\*$/m);
  assert.match(gcloudignore, /^apps\/web\/content\/_inbox$/m);
  assert.match(gcloudignore, /^apps\/web\/content\/_staging$/m);
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
