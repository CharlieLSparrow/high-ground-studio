import assert from "node:assert/strict";
import test from "node:test";

import {
  readRetainedQAPassword,
  resolveRetainedQAPassword,
  writeRetainedQAPassword,
} from "./retained-qa-keychain.mjs";

const SERVICE = "com.quipsly.qa.retained-coaching";
const ACCOUNT = "quipsly-coach@example.test";
const PASSWORD = "Qp-safe-longitudinal-password!26";

test("reads a retained password without putting it in process arguments", () => {
  const calls = [];
  const value = readRetainedQAPassword({
    service: SERVICE,
    account: ACCOUNT,
    platform: "darwin",
    runner(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: PASSWORD, stderr: "" };
    },
  });
  assert.equal(value, PASSWORD);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "xcrun");
  assert.equal(calls[0].args[0], "swift");
  assert.deepEqual(calls[0].args.slice(2), [
    "read",
    SERVICE,
    ACCOUNT,
  ]);
  assert.equal(calls[0].args.includes(PASSWORD), false);
  assert.equal(calls[0].options.stdio[0], "ignore");
});

test("stores a generated password through stdin instead of process arguments", () => {
  const calls = [];
  writeRetainedQAPassword({
    service: SERVICE,
    account: ACCOUNT,
    password: PASSWORD,
    platform: "darwin",
    runner(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "xcrun");
  assert.equal(calls[0].args[0], "swift");
  assert.equal(calls[0].args[2], "write");
  assert.equal(calls[0].args.includes(PASSWORD), false);
  assert.equal(calls[0].options.input, PASSWORD);
});

test("reuses an existing password and does not rewrite the Keychain item", () => {
  const calls = [];
  const result = resolveRetainedQAPassword({
    service: SERVICE,
    account: ACCOUNT,
    generate: () => {
      throw new Error("generator should not run");
    },
    platform: "darwin",
    runner(command, args) {
      calls.push({ command, args });
      return { status: 0, stdout: PASSWORD, stderr: "" };
    },
  });
  assert.deepEqual(result, { password: PASSWORD, created: false });
  assert.equal(calls.length, 1);
});

test("creates one password only when the exact item is absent", () => {
  const calls = [];
  const result = resolveRetainedQAPassword({
    service: SERVICE,
    account: ACCOUNT,
    generate: () => PASSWORD,
    platform: "darwin",
    runner(command, args, options) {
      calls.push({ command, args, options });
      if (args[2] === "read") {
        return { status: 44, stdout: "", stderr: "not found" };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.deepEqual(result, { password: PASSWORD, created: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].args.includes(PASSWORD), false);
  assert.equal(calls[1].options.input, PASSWORD);
});

test("fails closed outside macOS and for non-test accounts", () => {
  assert.throws(
    () => readRetainedQAPassword({
      service: SERVICE,
      account: ACCOUNT,
      platform: "linux",
    }),
    /only on macOS/,
  );
  assert.throws(
    () => writeRetainedQAPassword({
      service: SERVICE,
      account: "real-user@example.com",
      password: PASSWORD,
      platform: "darwin",
      runner() {
        throw new Error("must not execute");
      },
    }),
    /reserved \.test email/,
  );
});

test("does not treat a locked or failed Keychain as a missing item", () => {
  assert.throws(
    () => readRetainedQAPassword({
      service: SERVICE,
      account: ACCOUNT,
      platform: "darwin",
      runner() {
        return { status: 36, stdout: "", stderr: "interaction not allowed" };
      },
    }),
    /Could not read retained QA password/,
  );
});

test("rejects malformed secret bytes returned by Keychain", () => {
  assert.throws(
    () => readRetainedQAPassword({
      service: SERVICE,
      account: ACCOUNT,
      platform: "darwin",
      runner() {
        return { status: 0, stdout: `${PASSWORD}\nextra\n`, stderr: "" };
      },
    }),
    /safe characters/,
  );
});
