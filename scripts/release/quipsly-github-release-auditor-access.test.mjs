import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = readFileSync(
  fileURLToPath(
    new URL("./quipsly-github-release-auditor-access.sh", import.meta.url),
  ),
  "utf8",
);

test("release auditor access is read-only and cannot inspect recording objects", () => {
  for (const permission of [
    "cloudsql.instances.get",
    "logging.logEntries.list",
    "logging.sinks.get",
    "run.domainmappings.get",
    "storage.buckets.get",
    "storage.managedFolders.getIamPolicy",
  ]) {
    assert.match(script, new RegExp(permission.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(script, /storage\.objects\.(?:get|list|create|delete|update)/);
  assert.doesNotMatch(script, /logging\.sinks\.(?:create|delete|update)/);
  assert.doesNotMatch(script, /cloudsql\.instances\.(?:create|delete|update)/);
});

test("Firebase auditor can verify token signing without changing users or policy", () => {
  assert.match(script, /iam\.serviceAccounts\.getIamPolicy/);
  assert.match(script, /resourcemanager\.projects\.getIamPolicy/);
  assert.doesNotMatch(script, /iam\.serviceAccounts\.(?:actAs|setIamPolicy)/);
  assert.doesNotMatch(script, /firebaseauth\.users\./);
  assert.doesNotMatch(script, /resourcemanager\.projects\.setIamPolicy/);
});

test("IAM mutation requires an exact target confirmation and verifies readback", () => {
  assert.match(script, /APPLY=1 requires CONFIRM_TARGET/);
  assert.match(script, /gcloud projects add-iam-policy-binding/);
  assert.match(script, /verify_role/);
  assert.match(script, /verify_binding/);
});
