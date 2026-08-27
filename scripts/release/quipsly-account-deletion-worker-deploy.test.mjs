import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const script = fileURLToPath(new URL("./quipsly-account-deletion-worker-deploy.sh", import.meta.url));

test("worker deployment is read-only by default and requires an exact apply target", () => {
  execFileSync("bash", ["-n", script], { cwd: root, stdio: "pipe" });
  const source = readFileSync(script, "utf8");
  assert.match(source, /if \[\[ "\$\{apply\}" != "1" \]\]; then/);
  assert.match(source, /exec node .*quipsly-account-deletion-worker-readiness\.mjs/);
  assert.match(source, /--apply requires --confirm-target/);
  assert.match(source, /Apply requires a clean checkout/);
  assert.doesNotMatch(source, /--allow-unauthenticated/);
});

test("worker deployment isolates destructive provider authority", () => {
  const source = readFileSync(script, "utf8");
  assert.match(source, /roles\/cloudsql\.client/);
  assert.match(source, /roles\/firebaseauth\.admin/);
  assert.match(source, /roles\/storage\.objectUser/);
  assert.match(source, /roles\/secretmanager\.secretAccessor/);
  assert.match(source, /roles\/run\.invoker/);
  assert.match(source, /--service-account="\$\{worker_service_account\}"/);
  assert.match(source, /--concurrency=1/);
  assert.match(source, /--min=0/);
  assert.match(source, /--max=1/);
  assert.match(source, /--no-allow-unauthenticated/);
  assert.match(source, /QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS=\$\{bucket\}/);
  assert.match(source, /completion_email_secret_mounts/);
  assert.match(source, /deletion remains enabled and receipts record that state/);
  assert.match(source, /QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY=\$\{resend_secret\}/);
  assert.match(source, /QUIPSLY_ACCOUNT_DELETION_EMAIL_FROM=\$\{sender_secret\}/);
  assert.doesNotMatch(source, /,RESEND_API_KEY=/);
  assert.doesNotMatch(source, /,HGO_EMAIL_FROM=/);
  assert.match(source, /openssl rand -base64 48/);
  assert.match(source, /No account was deleted/);
});
