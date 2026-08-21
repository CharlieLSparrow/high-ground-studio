import assert from "node:assert/strict";
import test from "node:test";

import { evaluateUserEmailSeparation } from "./user-email-separation-plan.mjs";

const input = {
  retainedEmail: "retained@example.com",
  separateEmail: "separate@example.com",
};

function user(overrides) {
  return {
    id: "user",
    primaryEmail: "retained@example.com",
    aliases: [],
    firebaseUid: null,
    isActive: true,
    emailVerified: new Date(),
    ...overrides,
  };
}

const retainedFirebase = {
  uid: "firebase-retained",
  emailVerified: true,
  disabled: false,
};
const separateFirebase = {
  uid: "firebase-separate",
  emailVerified: true,
  disabled: false,
};

test("accepts two independently bound canonical users as already separated", () => {
  const result = evaluateUserEmailSeparation({
    input,
    users: [
      user({ id: "retained-user", firebaseUid: retainedFirebase.uid }),
      user({
        id: "separate-user",
        primaryEmail: input.separateEmail,
        firebaseUid: separateFirebase.uid,
      }),
    ],
    retainedFirebase,
    separateFirebase,
    retainedLedgerOwnerUserId: "retained-user",
    separateLedgerOwnerUserId: "separate-user",
  });

  assert.equal(result.ok, true);
  assert.equal(result.alreadySeparated, true);
  assert.equal(result.canSeparate, false);
});

test("accepts an explicit alias binding as ready for deliberate separation", () => {
  const result = evaluateUserEmailSeparation({
    input,
    users: [
      user({
        id: "retained-user",
        firebaseUid: retainedFirebase.uid,
        aliases: [{ email: input.separateEmail }],
      }),
    ],
    retainedFirebase,
    separateFirebase,
    retainedLedgerOwnerUserId: "retained-user",
    separateLedgerOwnerUserId: "retained-user",
  });

  assert.equal(result.ok, true);
  assert.equal(result.canSeparate, true);
  assert.equal(result.alreadySeparated, false);
});

test("rejects separate primaries whose provider subject still belongs elsewhere", () => {
  const result = evaluateUserEmailSeparation({
    input,
    users: [
      user({ id: "retained-user", firebaseUid: retainedFirebase.uid }),
      user({ id: "separate-user", primaryEmail: input.separateEmail }),
    ],
    retainedFirebase,
    separateFirebase,
    retainedLedgerOwnerUserId: "retained-user",
    separateLedgerOwnerUserId: "retained-user",
  });

  assert.equal(result.ok, false);
  assert.equal(result.alreadySeparated, false);
  assert.equal(result.canSeparate, false);
});
