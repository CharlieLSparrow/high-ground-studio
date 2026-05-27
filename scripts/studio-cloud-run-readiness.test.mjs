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

test("Studio Collab deploy helper pins the MVP room to one warm instance", () => {
  const deployScript = readFileSync(
    "scripts/studio-collab-cloud-run-deploy.mjs",
    "utf8",
  );
  const packageJson = readFileSync("package.json", "utf8");

  assert.match(packageJson, /studio:collab:cloudrun:deploy/);
  assert.match(deployScript, /DEFAULT_MIN_INSTANCES = "1"/);
  assert.match(deployScript, /DEFAULT_MAX_INSTANCES = "1"/);
  assert.match(deployScript, /DEFAULT_TIMEOUT_SECONDS = "3600"/);
  assert.match(deployScript, /cloudbuild\.studio-collab\.yaml/);
  assert.match(deployScript, /--min-instances/);
  assert.match(deployScript, /--max-instances/);
  assert.match(deployScript, /--timeout/);
  assert.match(deployScript, /--no-invoker-iam-check/);
  assert.match(deployScript, /\/health/);
  assert.match(deployScript, /high-ground-studio-collab/);
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

test("Manuscript latest live link is public read-only and snapshot-backed", () => {
  const route = readFileSync(
    "apps/studio/src/app/api/manuscript/live/[slug]/route.ts",
    "utf8",
  );
  const page = readFileSync(
    "apps/studio/src/app/manuscript/live/[slug]/page.tsx",
    "utf8",
  );
  const reader = readFileSync(
    "apps/studio/src/app/manuscript/live/[slug]/studio-manuscript-live-reader.tsx",
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
  assert.match(page, /StudioManuscriptLiveReader/);
  assert.match(page, /getLatestStudioManuscriptSnapshotForLiveSlug/);
  assert.doesNotMatch(page, /StudioAccessShell/);
  assert.doesNotMatch(page, /getStudioAccessState/);
  assert.doesNotMatch(page, /initialLiveSnapshotSlug/);
  assert.match(reader, /Read-only shared copy/);
  assert.match(reader, /manuscript-live-reader manuscript-prosemirror/);
  assert.match(serverModel, /normalizeStudioManuscriptLiveSlug/);
  assert.match(serverModel, /studioManuscriptSnapshot\.findFirst/);
  assert.match(serverModel, /orderBy: \{ updatedAt: "desc" \}/);
  assert.match(client, /MANUSCRIPT_LIVE_LATEST_PATH/);
  assert.match(client, /\/manuscript\/live\/latest/);
  assert.match(client, /Copy phone link/);
  assert.match(client, /loadLiveSnapshotBySlug/);
});

test("Manuscript live edit room is private token-gated collaboration", () => {
  const route = readFileSync(
    "apps/studio/src/app/api/manuscript/collab/latest/route.ts",
    "utf8",
  );
  const checkpointRoute = readFileSync(
    "apps/studio/src/app/api/manuscript/collab/latest/checkpoint/route.ts",
    "utf8",
  );
  const statusRoute = readFileSync(
    "apps/studio/src/app/api/manuscript/collab/latest/status/route.ts",
    "utf8",
  );
  const resetRoute = readFileSync(
    "apps/studio/src/app/api/manuscript/collab/latest/reset/route.ts",
    "utf8",
  );
  const page = readFileSync(
    "apps/studio/src/app/manuscript/collab/latest/page.tsx",
    "utf8",
  );
  const client = readFileSync(
    "apps/studio/src/app/manuscript/collab/latest/studio-manuscript-collab-client.tsx",
    "utf8",
  );
  const collabServer = readFileSync("apps/studio-collab/server.mjs", "utf8");
  const collabDockerfile = readFileSync(
    "apps/studio-collab/Dockerfile",
    "utf8",
  );
  const collabCloudBuild = readFileSync(
    "cloudbuild.studio-collab.yaml",
    "utf8",
  );
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const collabStore = readFileSync(
    "apps/studio/src/lib/server/studio-manuscript-collab.ts",
    "utf8",
  );

  assert.match(route, /getStudioAccessState/);
  assert.match(route, /signStudioCollabToken/);
  assert.match(route, /getLatestStudioManuscriptSnapshotForLiveSlug/);
  assert.match(route, /claimStudioManuscriptLiveRoomSeed/);
  assert.match(checkpointRoute, /createStudioManuscriptSnapshot/);
  assert.match(checkpointRoute, /markStudioManuscriptLiveRoomCheckpoint/);
  assert.match(statusRoute, /getStudioManuscriptLiveRoom/);
  assert.match(statusRoute, /outside-changes/);
  assert.match(resetRoute, /markStudioManuscriptLiveRoomResetBaseline/);
  assert.match(resetRoute, /getLatestStudioManuscriptSnapshotForLiveSlug/);
  assert.match(page, /StudioAccessShell/);
  assert.match(page, /StudioManuscriptCollabClient/);
  assert.match(client, /HocuspocusProvider/);
  assert.match(client, /Collaboration\.configure/);
  assert.match(client, /CollaborationCaret\.configure/);
  assert.match(client, /Save now/);
  assert.match(client, /Copy edit link/);
  assert.match(client, /\/manuscript\/collab\/latest\?start=latest/);
  assert.match(client, /isMobileRoomMenuOpen/);
  assert.match(client, /data-testid="manuscript-live-mobile-footer"/);
  assert.match(client, /data-testid="manuscript-live-mobile-menu"/);
  assert.match(client, /data-testid="manuscript-live-mobile-save"/);
  assert.match(client, /data-testid="manuscript-live-mobile-share"/);
  assert.match(client, /data-testid="manuscript-live-mobile-menu-toggle"/);
  assert.match(client, /data-testid="manuscript-live-author-controls"/);
  assert.match(client, /data-testid=\{`manuscript-live-author-\$\{authorId\}`\}/);
  assert.match(client, /data-testid="manuscript-live-author-mark-selection"/);
  assert.match(client, /data-testid="manuscript-live-mobile-author-controls"/);
  assert.match(
    client,
    /data-testid=\{`manuscript-live-mobile-author-\$\{authorId\}`\}/,
  );
  assert.match(client, /data-testid="manuscript-live-mobile-author-mark-selection"/);
  assert.match(client, /data-testid=\{`\$\{testIdPrefix\}-semantic-controls`\}/);
  assert.match(client, /data-testid=\{`\$\{testIdPrefix\}-semantic-select`\}/);
  assert.match(client, /data-testid=\{`\$\{testIdPrefix\}-semantic-apply`\}/);
  assert.match(client, /data-testid=\{`\$\{testIdPrefix\}-semantic-clear`\}/);
  assert.match(client, /liveQuickSemanticHighlightTypes/);
  assert.match(client, /getLiveSemanticButtonClassName/);
  assert.match(client, /getLiveSemanticSwatchClassName/);
  assert.match(client, /applyLiveSemanticHighlight/);
  assert.match(client, /clearLiveSemanticHighlight/);
  assert.match(
    client,
    /data-testid=\{`\$\{testIdPrefix\}-structure-marker-controls`\}/,
  );
  assert.match(client, /data-testid=\{`\$\{testIdPrefix\}-mark-current-chapter`\}/);
  assert.match(client, /data-testid=\{`\$\{testIdPrefix\}-mark-current-episode`\}/);
  assert.match(client, /toggleLiveStructureBoundaryMarker/);
  assert.match(client, /Marked during live edit/);
  assert.match(client, /getEpisodePublicationDateForIndex/);
  assert.match(client, /formatEpisodePublicationDate/);
  assert.match(client, /publicationDate/);
  assert.match(client, /Publishes/);
  assert.match(client, /data-testid="manuscript-live-structure-navigation"/);
  assert.match(client, /data-testid="manuscript-live-mobile-structure-navigation"/);
  assert.match(client, /data-testid="manuscript-live-mobile-structure-strip"/);
  assert.match(
    client,
    /data-testid=\{`manuscript-live-mobile-current-\$\{kind\}`\}/,
  );
  assert.match(client, /createManuscriptStructureBoundaryIndex/);
  assert.match(client, /getCurrentManuscriptStructureBoundary/);
  assert.match(client, /getNextManuscriptStructureBoundary/);
  assert.match(client, /onSelectionUpdate/);
  assert.match(client, /getAuthorMarkAttrs/);
  assert.match(client, /hidden flex-wrap items-center justify-end gap-2 lg:flex/);
  assert.match(client, /lg:sticky lg:top-\[92px\] lg:grid/);
  assert.match(client, /hasCheckpointChanges/);
  assert.match(client, /People in room/);
  assert.match(client, /collectPresenceParticipants/);
  assert.match(client, /provider\.setAwarenessField\("studio"/);
  assert.match(client, /Live edits are saved to this shared room automatically/);
  assert.match(client, /latest manuscript backup auto-saves/);
  assert.match(client, /Latest backup/);
  assert.match(client, /Save room as latest/);
  assert.match(client, /Auto-save/);
  assert.match(client, /Live edit auto-save/);
  assert.match(client, /Turn off auto-save/);
  assert.match(client, /AUTO_BACKUP_IDLE_MS = 4_000/);
  assert.match(client, /AUTO_BACKUP_MIN_INTERVAL_MS = 30_000/);
  assert.match(client, /Draft handoff/);
  assert.match(client, /DraftHandoffState/);
  assert.match(client, /AUTO_HANDOFF_DELAY_MS/);
  assert.match(client, /autoDraftHandoffAttemptedRef/);
  assert.match(client, /compareDateTime/);
  assert.match(client, /Use saved draft now/);
  assert.match(client, /Keep current room/);
  assert.match(client, /URLSearchParams\(window\.location\.search\)/);
  assert.match(client, /Load latest into room/);
  assert.match(client, /\/api\/manuscript\/collab\/latest\/reset/);
  assert.match(client, /\/api\/manuscript\/collab\/latest\/status/);
  assert.match(client, /\/api\/manuscript\/collab\/latest\/checkpoint/);
  assert.match(collabStore, /canReplaceSeed/);
  assert.match(collabStore, /getStudioManuscriptLiveRoom/);
  assert.match(collabStore, /markStudioManuscriptLiveRoomResetBaseline/);
  assert.match(collabServer, /onAuthenticate/);
  assert.match(collabServer, /onLoadDocument/);
  assert.match(collabServer, /onStoreDocument/);
  assert.match(collabServer, /Y\.encodeStateAsUpdate/);
  assert.match(collabServer, /\/health/);
  assert.match(collabDockerfile, /studio-collab/);
  assert.match(collabCloudBuild, /apps\/studio-collab\/Dockerfile/);
  assert.match(collabCloudBuild, /studio-collab/);
  assert.match(schema, /model StudioManuscriptCollaborationRoom/);
  assert.match(schema, /ydocState\s+Bytes\?/);
});

test("Manuscript everyday UI keeps save controls in the footer dialog", () => {
  const client = readFileSync(
    "apps/studio/src/app/manuscript/studio-manuscript-client.tsx",
    "utf8",
  );

  assert.match(client, /isSaveShareDialogOpen/);
  assert.match(client, /isFilterMenuOpen/);
  assert.match(client, /openFilterMenu/);
  assert.match(client, /data-testid="manuscript-desktop-filter-menu"/);
  assert.match(client, /data-testid="manuscript-filter-menu-dialog"/);
  assert.match(client, /data-testid="manuscript-filter-menu-panel"/);
  assert.match(client, /data-testid="manuscript-save-share-footer"/);
  assert.match(client, /data-testid="manuscript-save-share-dialog"/);
  assert.match(client, /data-testid="manuscript-mobile-save-share"/);
  assert.match(client, /data-testid="manuscript-mobile-filter-menu"/);
  assert.match(client, /data-testid="manuscript-mobile-footer-status"/);
  assert.match(client, /data-testid="manuscript-mobile-tools-menu"/);
  assert.match(client, /data-testid="manuscript-mobile-structure-strip"/);
  assert.match(client, /data-testid="manuscript-primary-save-panel"/);
  assert.match(client, /data-testid="manuscript-primary-save"/);
  assert.match(client, /data-testid="manuscript-primary-save-live-edit"/);
  assert.match(client, /data-testid="manuscript-live-edit-footer"/);
  assert.match(client, /Save \+ live edit/);
  assert.match(client, /start=latest/);
  assert.match(client, /Shared live room/);
  assert.match(client, /Check room/);
  assert.match(client, /\/api\/manuscript\/collab\/latest\/status/);
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

test("Manuscript semantic controls expose clip and production-note colors", () => {
  const client = readFileSync(
    "apps/studio/src/app/manuscript/studio-manuscript-client.tsx",
    "utf8",
  );
  const collabClient = readFileSync(
    "apps/studio/src/app/manuscript/collab/latest/studio-manuscript-collab-client.tsx",
    "utf8",
  );
  const model = readFileSync(
    "apps/studio/src/app/manuscript/manuscript-editor-model.ts",
    "utf8",
  );
  const globalsCss = readFileSync("apps/studio/src/app/globals.css", "utf8");

  assert.match(model, /id: "show-notes", label: "Production notes"/);
  assert.match(client, /quickSemanticHighlightTypes/);
  assert.match(client, /SemanticTagLabel/);
  assert.ok(client.includes('clip: "border-[#8b3126]/70'));
  assert.ok(client.includes('"show-notes": "border-[#c19a55]/65'));
  assert.ok(collabClient.includes("border-[#8b3126]/70"));
  assert.ok(collabClient.includes("border-[#c19a55]/65"));
  assert.doesNotMatch(client, /69e2c8|f5ba78/);
  assert.doesNotMatch(collabClient, /69e2c8|f5ba78/);
  assert.match(client, /manuscript-semantic-block-clip/);
  assert.match(client, /manuscript-semantic-block-show-notes/);
  assert.match(globalsCss, /--manuscript-semantic-wash/);
  assert.match(globalsCss, /\.manuscript-prosemirror \.manuscript-semantic-clip/);
  assert.match(
    globalsCss,
    /\.manuscript-prosemirror \.manuscript-semantic-show-notes/,
  );
  assert.match(globalsCss, /\.manuscript-semantic-block-clip/);
  assert.match(globalsCss, /\.manuscript-semantic-block-show-notes/);
  assert.match(
    globalsCss,
    /background-image:\n\s*var\(--manuscript-structure-wash\),\n\s*var\(--manuscript-semantic-wash\),\n\s*var\(--manuscript-author-wash\);/,
  );
});

test("Manuscript structure rail follows chapter and episode position", () => {
  const client = readFileSync(
    "apps/studio/src/app/manuscript/studio-manuscript-client.tsx",
    "utf8",
  );
  const model = readFileSync(
    "apps/studio/src/app/manuscript/manuscript-editor-model.ts",
    "utf8",
  );
  const liveReader = readFileSync(
    "apps/studio/src/app/manuscript/live/[slug]/studio-manuscript-live-reader.tsx",
    "utf8",
  );
  const collabClient = readFileSync(
    "apps/studio/src/app/manuscript/collab/latest/studio-manuscript-collab-client.tsx",
    "utf8",
  );
  const globalsCss = readFileSync("apps/studio/src/app/globals.css", "utf8");

  assert.match(client, /type ManuscriptStructureBoundary/);
  assert.match(model, /type ManuscriptStructureBoundaryMarker/);
  assert.match(model, /createManuscriptStructureBoundaryIndex/);
  assert.match(model, /EPISODE_PUBLICATION_ANCHOR_DATE = "2026-06-03"/);
  assert.match(model, /getEpisodePublicationDateForIndex/);
  assert.match(model, /publicationDate/);
  assert.match(client, /structureBoundaryMarkers/);
  assert.match(client, /toggleSelectedBlockAsEpisodeBoundary/);
  assert.match(client, /Boundary map/);
  assert.match(client, /editingBoundaryMarkerId/);
  assert.match(client, /renderBoundaryOutlineCard/);
  assert.match(client, /const kindLabel = boundary\.label;/);
  assert.match(client, /saveStructureBoundaryMarker/);
  assert.match(client, /moveStructureBoundaryMarkerToCurrentBlock/);
  assert.match(client, /Use cursor line/);
  assert.match(client, /structureRailRegions/);
  assert.match(client, /structureBoundaryIndex\.warnings/);
  assert.match(client, /getCurrentManuscriptStructureBoundary/);
  assert.match(client, /getNextManuscriptStructureBoundary/);
  assert.match(client, /readBlockElements/);
  assert.match(client, /window\.addEventListener\("scroll", scheduleStructureRailUpdate/);
  assert.match(client, /document\.addEventListener\(\n\s*"scroll",\n\s*scheduleStructureRailUpdate,\n\s*scrollListenerOptions/);
  assert.match(client, /new ResizeObserver\(scheduleStructureRailUpdate\)/);
  assert.match(client, /data-testid="manuscript-structure-rail"/);
  assert.match(client, /collectRenderedManuscriptBlockNodeList/);
  assert.match(client, /ManuscriptBlockAttributes/);
  assert.match(client, /applyManuscriptBoundaryAttrsToEditorJson/);
  assert.match(client, /rebindManuscriptStructureBlockIds/);
  assert.match(client, /sourceBlockIndex/);
  assert.match(client, /\[data-blockid\]/);
  assert.match(client, /data-manuscript-boundary-heading/);
  assert.match(client, /manuscript-boundary-marker-block/);
  assert.match(liveReader, /manuscript-boundary-marker-block/);
  assert.match(liveReader, /getLiveBoundaryAttributes/);
  assert.match(collabClient, /collectRenderedManuscriptBlockNodeList/);
  assert.match(collabClient, /ManuscriptBlockAttributes/);
  assert.match(collabClient, /applyManuscriptBoundaryAttrsToEditorJson/);
  assert.match(collabClient, /rebindManuscriptStructureBlockIds/);
  assert.match(collabClient, /sourceBlockIndex/);
  assert.match(collabClient, /\[data-blockid\]/);
  assert.match(collabClient, /manuscript-boundary-marker-block/);
  assert.match(collabClient, /data-manuscript-boundary-heading/);
  assert.match(client, /"manuscript-mobile-current-chapter"/);
  assert.match(client, /"manuscript-mobile-current-episode"/);
  assert.match(client, /data-testid="manuscript-mobile-structure-navigation"/);
  assert.match(client, /focusMobileStructureBoundary/);
  assert.match(client, /Publishes \{publicationDate\}/);
  assert.match(globalsCss, /\.manuscript-structure-rail-date/);
  assert.match(client, /Jump \{definition\.label\.toLowerCase\(\)\}/);
  assert.match(client, /Next \{definition\.label\.toLowerCase\(\)\}/);
  assert.match(globalsCss, /\.manuscript-editor-shell-with-rail/);
  assert.match(globalsCss, /\.manuscript-structure-rail \{/);
  assert.match(globalsCss, /position: sticky;\n\s*top: 5\.25rem;/);
  assert.match(globalsCss, /\.manuscript-structure-rail-card-chapter/);
  assert.match(globalsCss, /\.manuscript-structure-rail-card-episode/);
  assert.match(
    globalsCss,
    /\.manuscript-prosemirror \.manuscript-boundary-marker-chapter,[\s\S]*font-size: 2rem;[\s\S]*text-align: center;/,
  );
  assert.match(
    globalsCss,
    /\.manuscript-prosemirror \.manuscript-boundary-marker-episode \{[\s\S]*font-size: 1\.32rem;[\s\S]*text-align: center;/,
  );
});

test("Manuscript author marks render as block washes under semantic marks", () => {
  const client = readFileSync(
    "apps/studio/src/app/manuscript/studio-manuscript-client.tsx",
    "utf8",
  );
  const globalsCss = readFileSync("apps/studio/src/app/globals.css", "utf8");

  assert.match(client, /manuscript-author-block-charlie/);
  assert.match(client, /manuscript-author-block-homer/);
  assert.match(client, /blockDetailsById/);
  assert.match(client, /semanticTagTypes\.includes\("clip"\)/);
  assert.match(globalsCss, /--manuscript-author-wash/);
  assert.doesNotMatch(globalsCss, /--manuscript-author-outline/);
  assert.doesNotMatch(
    globalsCss,
    /inset 0 0 0 1px var\(--manuscript-author-outline\)/,
  );
  assert.match(
    globalsCss,
    /background-image:\n\s*var\(--manuscript-structure-wash\),\n\s*var\(--manuscript-semantic-wash\),\n\s*var\(--manuscript-author-wash\);/,
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
    /\.manuscript-prosemirror \.manuscript-author-block-charlie \{\n\s*--manuscript-author-wash: linear-gradient\(\n\s*rgba\(82, 164, 220, 0\.18\),\n\s*rgba\(82, 164, 220, 0\.18\)\n\s*\);/,
  );
  assert.match(
    globalsCss,
    /\.manuscript-prosemirror \.manuscript-author-block-homer \{\n\s*--manuscript-author-wash: linear-gradient\(\n\s*rgba\(126, 200, 134, 0\.18\),\n\s*rgba\(126, 200, 134, 0\.18\)\n\s*\);/,
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
