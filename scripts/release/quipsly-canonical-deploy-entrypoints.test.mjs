import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = readFileSync("package.json", "utf8");
const compatibility = readFileSync("scripts/quipsly-web-deploy.sh", "utf8");
const conductor = readFileSync("scripts/hgo-quipsly-release-conductor.mjs", "utf8");
const readiness = readFileSync("scripts/hgo-quipsly-release-readiness.mjs", "utf8");
const runway = readFileSync("scripts/hgo-quipsly-coaching-release-runway.mjs", "utf8");
const workflow = readFileSync(".github/workflows/deploy-cloud-run.yml", "utf8");

test("every supported Nest deploy entry point uses the committed-source preview pipeline", () => {
  assert.match(packageJson, /"quipsly:web:deploy": "bash scripts\/release\/quipsly-deploy-preview\.sh"/);
  assert.match(compatibility, /scripts\/release\/quipsly-deploy-preview\.sh/);
  assert.match(compatibility, /Positional image tags are retired/);
  assert.doesNotMatch(compatibility, /gcloud builds submit|gcloud run deploy/);
  for (const source of [conductor, readiness, runway]) {
    assert.match(source, /scripts\/release\/quipsly-deploy-preview\.sh/);
    assert.doesNotMatch(source, /scripts\/quipsly-web-deploy\.sh/);
  }
  assert.doesNotMatch(conductor, /quipsly-web-\$\{stamp\(\)\}|web-\$\{stamp\(\)\}/);
});

test("the GitHub Studio release reuses an exact-source image before building", () => {
  assert.match(workflow, /name: Resolve Existing Studio Image/);
  assert.match(workflow, /gcloud artifacts docker images describe/);
  assert.match(workflow, /studio:source-\$\{RELEASE_SOURCE_SHA\}/);
  assert.match(workflow, /IMAGE_TAG="source-\$RELEASE_SOURCE_SHA"/);
  assert.match(workflow, /STUDIO_IMAGE_EXISTS=1/);
  assert.match(workflow, /if: env\.STUDIO_IMAGE_EXISTS != '1'/);
  assert.match(workflow, /Artifact Registry readback failed before the build decision/);
});
