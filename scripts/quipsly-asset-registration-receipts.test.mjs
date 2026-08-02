import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLY_CONFIRMATION,
  classifyAssetRegistrationDatabaseTarget,
  parseAssetRegistrationReceiptArgs,
} from "./quipsly-asset-registration-receipts.mjs";

test("asset registration reconciliation is plan-only by default", () => {
  assert.deepEqual(parseAssetRegistrationReceiptArgs([]), {
    apply: false,
    allowRemote: false,
    confirmation: "",
  });
});

test("asset registration reconciliation parses explicit mutation authority", () => {
  assert.deepEqual(
    parseAssetRegistrationReceiptArgs([
      "--",
      "--apply",
      "--allow-remote",
      `--confirm=${APPLY_CONFIRMATION}`,
    ]),
    {
      apply: true,
      allowRemote: true,
      confirmation: APPLY_CONFIRMATION,
    },
  );
  assert.throws(
    () => parseAssetRegistrationReceiptArgs(["--delete"]),
    /Unknown argument/,
  );
});

test("asset registration reconciliation classifies loopback without exposing credentials", () => {
  assert.deepEqual(
    classifyAssetRegistrationDatabaseTarget(
      "postgresql://private-user:private-password@127.0.0.1:5432/quipsly_local",
    ),
    {
      local: true,
      hostname: "127.0.0.1",
      database: "quipsly_local",
    },
  );
  assert.equal(
    classifyAssetRegistrationDatabaseTarget(
      "postgresql://private-user:private-password@db.example.test/quipsly",
    ).local,
    false,
  );
  assert.throws(
    () => classifyAssetRegistrationDatabaseTarget("https://example.test/db"),
    /PostgreSQL/,
  );
});
