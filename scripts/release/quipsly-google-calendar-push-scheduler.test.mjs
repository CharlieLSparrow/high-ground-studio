import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scheduler = readFileSync(new URL("./quipsly-google-calendar-push-scheduler.sh", import.meta.url), "utf8");
const deploy = readFileSync(new URL("./quipsly-deploy-preview.sh", import.meta.url), "utf8");

test("Calendar push scheduler uses short-lived OIDC identity without an embedded bearer secret", () => {
  assert.match(scheduler, /--oidc-service-account-email=/);
  assert.match(scheduler, /--oidc-token-audience=/);
  assert.match(scheduler, /roles\/run\.invoker/);
  assert.doesNotMatch(scheduler, /--headers=.*Authorization/);
  assert.doesNotMatch(scheduler, /secret versions access/);
});

test("Calendar-enabled Nest revisions receive the exact scheduler identity and Cloud Run audience", () => {
  assert.match(deploy, /GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT=/);
  assert.match(deploy, /GOOGLE_CALENDAR_PUSH_WORKER_AUDIENCE=/);
  assert.match(deploy, /value\(status\.url\)/);
  assert.doesNotMatch(deploy, /GOOGLE_CALENDAR_PUSH_WORKER_SECRET/);
});
