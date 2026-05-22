import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("firebase.json wires Studio Cut rules without changing Hosting output", async () => {
  const firebaseConfig = JSON.parse(await readFile("firebase.json", "utf8"));

  assert.equal(firebaseConfig.firestore?.rules, "firestore.rules");
  assert.equal(firebaseConfig.storage?.rules, "storage.rules");
  assert.equal(firebaseConfig.hosting?.public, "apps/studio-cut-web/dist");
  assert.deepEqual(firebaseConfig.hosting?.rewrites, [
    {
      source: "**",
      destination: "/index.html",
    },
  ]);
});

test("Firestore rules cover shared room metadata, decisions, presence, and deny deletes", async () => {
  const rules = await readFile("firestore.rules", "utf8");

  assert.ok(rules.includes("highgroundodyssey\\\\.com"));
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /room\/meta/);
  assert.match(rules, /decisionEvents\/\{eventId\}/);
  assert.match(rules, /presence\/\{sessionId\}/);
  assert.match(rules, /request\.resource\.data\.projectId == projectId/);
  assert.match(rules, /request\.resource\.data\.branchId == branchId/);
  assert.match(rules, /request\.resource\.data\.id == eventId/);
  assert.match(rules, /request\.resource\.data\.userEmail == request\.auth\.token\.email/);
  assert.doesNotMatch(rules, /allow delete:\s*if true/);
  assert.match(rules, /allow delete:\s*if false/);
});

test("Storage rules limit writes to source-monitor proxy video path and deny deletes", async () => {
  const rules = await readFile("storage.rules", "utf8");

  assert.ok(rules.includes("highgroundodyssey\\\\.com"));
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /source-monitor-proxy\/\{fileName\}/);
  assert.match(rules, /request\.resource\.contentType\.matches\('video\/\.\*'\)/);
  assert.match(rules, /request\.resource\.size < 1024 \* 1024 \* 1024/);
  assert.doesNotMatch(rules, /allow delete:\s*if true/);
  assert.match(rules, /allow delete:\s*if false/);
});

test("rules docs include explicit deploy and emulator test commands", async () => {
  const docs = await readFile("docs/studio-cut-firestore-rules.md", "utf8");

  assert.match(
    docs,
    /firebase deploy --project high-ground-odyssey --only firestore:rules,storage/,
  );
  assert.match(docs, /pnpm studio-cut:rules-test/);
});
