import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scheduler = readFileSync(
  new URL("./quipsly-transactional-email-scheduler.sh", import.meta.url),
  "utf8",
);

test("transactional email scheduler uses short-lived OIDC without an embedded bearer secret", () => {
  assert.match(scheduler, /--oidc-service-account-email=/);
  assert.match(scheduler, /--oidc-token-audience=/);
  assert.match(scheduler, /roles\/run\.invoker/);
  assert.match(scheduler, /\/api\/cron\/transactional-email/);
  assert.doesNotMatch(scheduler, /--headers=.*Authorization/);
  assert.doesNotMatch(scheduler, /secret versions access/);
});
