import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const routePath = fileURLToPath(new URL(
  "../apps/quipsly/src/app/api/episode-production/import-media/route.ts",
  import.meta.url,
));
const route = readFileSync(routePath, "utf8");
const episodeProductionRoutePath = fileURLToPath(new URL(
  "../apps/quipsly/src/app/api/episode-production/route.ts",
  import.meta.url,
));
const episodeProductionRoute = readFileSync(
  episodeProductionRoutePath,
  "utf8",
);
const editorPath = fileURLToPath(new URL(
  "../apps/quipsly/src/app/(app)/editor/page.tsx",
  import.meta.url,
));
const editor = readFileSync(editorPath, "utf8");

test("episode media imports authorize before upload and bind every Nest attachment to that actor", () => {
  const accessIndex = route.indexOf("await resolveEpisodeProductionAccess({");
  const uploadIndex = route.indexOf("await uploadMediaBuffer({");
  assert.ok(accessIndex >= 0, "episode media import must resolve project access");
  assert.ok(uploadIndex > accessIndex, "episode media bytes must not upload before project authorization");

  const attachmentCalls = [
    ...route.matchAll(/await attachAssetToNest\(\{([\s\S]*?)\n\s*\}\);/g),
  ];
  assert.equal(attachmentCalls.length, 2, "URL and file imports must both attach through the Nest boundary");
  for (const call of attachmentCalls) {
    assert.match(call[1], /nestSlug:\s*projectSlug/);
    assert.match(call[1], /actorEmail:\s*access\.actor\.email/);
  }
});

test("reviewed alignment and undo are revision-bound, protected, and compare-and-swap persisted", () => {
  assert.match(
    route,
    /action === "approve-alignment"\s*\|\|\s*action === "undo-last-sync"/,
    "alignment approval and undo must both require the exact reviewed production revision",
  );
  assert.match(
    route,
    /requireCurrentEpisodeProductionRevision\(\s*body\.expectedUpdatedAt,\s*production\.updatedAt,/,
    "the route must compare the client revision with the persisted revision",
  );
  assert.match(
    route,
    /hasProtectedReviewedAlignment\(\s*targetAsset,/,
    "an existing reviewed alignment receipt must be protected from replacement",
  );
  assert.match(
    route,
    /updateManyAndReturn\(\{\s*where:\s*\{\s*id:\s*production\.id,\s*updatedAt:\s*production\.updatedAt,[\s\S]*?select:\s*\{\s*updatedAt:\s*true\s*\}/,
    "review mutations must atomically compare-and-swap and return their exact persisted revision",
  );

  const approveRequest = editor.match(
    /action:\s*"approve-alignment",([\s\S]*?)alignmentReview:/,
  );
  assert.ok(approveRequest, "the editor must issue an alignment approval request");
  assert.match(
    approveRequest[1],
    /expectedUpdatedAt:\s*productionState\?\.updatedAt/,
    "alignment approval must carry the exact production revision the editor reviewed",
  );

  const undoRequest = editor.match(
    /action:\s*"undo-last-sync",([\s\S]*?)\}\),/,
  );
  assert.ok(undoRequest, "the editor must issue an alignment undo request");
  assert.match(
    undoRequest[1],
    /expectedUpdatedAt:\s*productionState\?\.updatedAt/,
    "alignment undo must carry the exact production revision the editor reviewed",
  );
});

test("loading an existing episode production does not rewrite view metadata", () => {
  assert.match(
    episodeProductionRoute,
    /planExistingEpisodeProductionEnsure\(\s*current,/,
    "existing episode loads must use the no-op-aware identity planner",
  );
  assert.match(
    episodeProductionRoute,
    /if \(!identityPatch\) \{\s*return current;/,
    "an unchanged episode load must return the existing row without a write",
  );
  assert.match(
    episodeProductionRoute,
    /where:\s*\{\s*id:\s*current\.id\s*\},\s*data:\s*identityPatch/,
    "existing ensure writes must be limited to the planned canonical identity repair",
  );
});
