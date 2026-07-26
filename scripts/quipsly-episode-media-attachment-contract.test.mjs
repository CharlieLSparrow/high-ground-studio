import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const routePath = fileURLToPath(new URL(
  "../apps/quipsly/src/app/api/episode-production/import-media/route.ts",
  import.meta.url,
));
const route = readFileSync(routePath, "utf8");

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
