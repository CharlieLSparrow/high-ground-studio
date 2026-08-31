import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scheduler = readFileSync(new URL("./quipsly-transcript-follow-through-scheduler.sh", import.meta.url), "utf8");
const deploy = readFileSync(new URL("./quipsly-deploy-preview.sh", import.meta.url), "utf8");
const promote = readFileSync(new URL("./quipsly-promote-preview.sh", import.meta.url), "utf8");

test("Transcript follow-through scheduler uses short-lived OIDC identity without an embedded bearer secret", () => {
  assert.match(scheduler, /--oidc-service-account-email=/);
  assert.match(scheduler, /--oidc-token-audience=/);
  assert.match(scheduler, /roles\/run\.invoker/);
  assert.match(scheduler, /capture-transcript-follow-through/);
  assert.match(scheduler, /gcloud scheduler jobs resume/);
  assert.match(scheduler, /job\.state !== "ENABLED"/);
  assert.match(scheduler, /Number\(entry\.percent \|\| 0\) === 100/);
  assert.match(scheduler, /CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_AUDIENCE/);
  assert.match(scheduler, /CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_SERVICE_ACCOUNT/);
  assert.match(scheduler, /Transcript follow-through live revision mismatch/);
  assert.doesNotMatch(scheduler, /--headers=.*Authorization/);
  assert.doesNotMatch(scheduler, /secret versions access/);
});

test("Transcript-enabled Nest revisions receive the exact scheduler identity and Cloud Run audience", () => {
  assert.match(deploy, /CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_SERVICE_ACCOUNT=/);
  assert.match(deploy, /CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_AUDIENCE=/);
  assert.match(deploy, /transcript_follow_through_env_vars/);
  assert.match(deploy, /value\(status\.url\)/);
  assert.doesNotMatch(deploy, /CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_SECRET/);
});

test("Production promotion activates and reads back automatic transcript follow-through", () => {
  assert.match(promote, /quipsly-production-status\.sh/);
  assert.match(promote, /quipsly-transcript-follow-through-scheduler\.sh/);
  assert.match(promote, /Production or transcript automation readback failed/);
  assert.match(promote, /--to-revisions="\$\{previous_revision\}=100"/);
});
