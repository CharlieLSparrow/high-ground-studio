#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./quipsly-prepare-hgo-testflight-rehearsal.mjs", import.meta.url),
  "utf8",
);
const stagingSource = await readFile(
  new URL("./quipsly-stage-hgo-testflight-rehearsal.mjs", import.meta.url),
  "utf8",
);
const processorAccessSource = await readFile(
  new URL("./release/quipsly-media-processor-access.sh", import.meta.url),
  "utf8",
);
const episodeRoomClientSource = await readFile(
  new URL(
    "../apps/quipsly/src/app/(app)/nests/[slug]/episodes/[episodeSlug]/EpisodeRoomClient.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("Episode workspace exists before the production Session is bound", () => {
  const ensureEpisodeIndex = source.indexOf(
    "await ensureEpisodeWorkspace(prisma, options, foundation);",
  );
  const createSessionIndex = source.indexOf(
    "roomId = await createRoomThroughProductionApi(",
  );

  assert.notEqual(ensureEpisodeIndex, -1);
  assert.notEqual(createSessionIndex, -1);
  assert.ok(
    ensureEpisodeIndex < createSessionIndex,
    "Episode creation must precede Session creation because the production API refuses dangling episode bindings.",
  );
  assert.match(source, /state: "awaiting-session-binding"/);
});

test("every Episode receives a dedicated manuscript document", () => {
  assert.match(
    source,
    /return `doc-\$\{options\.projectSlug\}-\$\{options\.episodeSlug\}`;/,
  );
  assert.match(
    source,
    /const episodeDocument = state\.project\?\.documents\.find/,
  );
  assert.match(source, /ensureDocument: !episodeDocument/);
});

test("staging recognizes only the exact seed for the current Episode title", () => {
  assert.match(
    stagingSource,
    /const episodeTitle = clean\(desk\?\.episode\?\.title\)/,
  );
  assert.match(
    stagingSource,
    /clean\(blocks\[0\]\?\.body\) === `# \$\{episodeTitle\}`/,
  );
  assert.match(stagingSource, /!clean\(existing\[0\]\.sourceLabel\)/);
  assert.match(stagingSource, /!clean\(existing\[1\]\.sourcePath\)/);
  assert.match(
    stagingSource,
    /clean\(existing\[0\]\.body\) === `# \$\{clean\(production\.title\)\}`/,
  );
  assert.doesNotMatch(
    stagingSource,
    /# High Ground Odyssey TestFlight Rehearsal/,
  );
});

test("media processor identities fit Google service-account account-id limits", () => {
  const defaults = [
    ...processorAccessSource.matchAll(
      /:-([a-z][a-z0-9-]+)@\$\{project_id\}\.iam\.gserviceaccount\.com/g,
    ),
  ].map((match) => match[1]);
  assert.ok(defaults.length >= 2);
  for (const accountId of defaults) {
    assert.ok(accountId.length >= 6 && accountId.length <= 30, accountId);
  }
});

test("Shared Watch reconciles durable proxy receipts instead of polling stale database status", () => {
  assert.match(
    stagingSource,
    /proxy = await operateCollaborationProxy\([\s\S]*?"reconcile",[\s\S]*?\);/,
  );
  assert.match(
    episodeRoomClientSource,
    /proxy = await operate\("reconcile"\);/,
  );
  assert.doesNotMatch(episodeRoomClientSource, /proxy = await readStatus\(\);/);
});
