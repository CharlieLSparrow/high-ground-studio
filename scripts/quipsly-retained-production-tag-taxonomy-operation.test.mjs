import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseArguments, taxonomyLabels } from "./quipsly-retained-production-tag-taxonomy-operation.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");

test("taxonomy operation accepts only explicit evidence outside Git", () => {
  assert.deepEqual(parseArguments([
    "--",
    "--native-receipt", "/private/tmp/native.json",
    "--output-dir", "/private/tmp/taxonomy-evidence",
    "--operation-key", "tag-taxonomy-a",
  ]), {
    help: false,
    nativeReceipt: "/private/tmp/native.json",
    outputDir: "/private/tmp/taxonomy-evidence",
    operationKey: "tag-taxonomy-a",
  });
  assert.throws(() => parseArguments([
    "--native-receipt", `${repoRoot}/native.json`,
    "--output-dir", "/private/tmp/taxonomy-evidence",
    "--operation-key", "tag-taxonomy-a",
  ]));
  assert.throws(() => parseArguments([
    "--native-receipt", "/private/tmp/native.json",
    "--output-dir", "/private/tmp/taxonomy-evidence",
    "--operation-key", "Taxonomy A",
  ]));
});

test("taxonomy labels remain unique, deliberate, and under the product limit", () => {
  assert.deepEqual(taxonomyLabels("tag-taxonomy-a"), {
    typo: "QA Retained · tag-taxonomy-a systm",
    canonicalAlias: "QA Retained · tag-taxonomy-a system",
  });
  assert.throws(() => taxonomyLabels("a".repeat(70)));
});

test("taxonomy operation uses rendered production UX and leaves the canonical final state", async () => {
  const source = await readFile(new URL("./quipsly-retained-production-tag-taxonomy-operation.mjs", import.meta.url), "utf8");
  assert.match(source, /signInThroughRenderedLogin/);
  assert.match(source, /Create & apply/);
  assert.match(source, /Preview merge/);
  assert.match(source, /Preview exact rollback/);
  assert.match(source, /formerNameSearchable: true/);
  assert.match(source, /remerged: true/);
  assert.match(source, /realCollaboratorRecordsChanged: false/);
  assert.match(source, /externalSideEffects: false/);
  assert.match(source, /credentialsPrinted: false/);
  assert.match(source, /clearRenderedSession/);
  assert.doesNotMatch(source, /deleteMany|cleanupArtifact|removeArtifact/);
});
