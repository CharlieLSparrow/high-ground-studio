import assert from "node:assert/strict";
import test from "node:test";
import {ensureLocalCaptureTestIdentity} from "./local-capture-test-identity.mjs";

const email = "capture-new@dev.test", uid = "capture-new-user", password = "A-test-password-with-enough-length";
function fixture(prior, retained) {
  const actions = [];
  return {actions, input: {email, uid,
    auth: {getUserByEmail: async () => {
      if (prior) return prior;
      throw Object.assign(new Error("not found"), {code: "auth/user-not-found"});
    }, createUser: async data => {actions.push(["create", data]);}},
    readPassword: () => retained,
    writePassword: value => {actions.push(["retain", value]);},
    generatePassword: () => password,
  }};
}
test("creates once and retains credentials before creating the local account", async () => {
  const f = fixture(null, null);
  assert.equal((await ensureLocalCaptureTestIdentity(f.input)).created, true);
  assert.deepEqual(f.actions.map(action => action[0]), ["retain", "create"]);
  assert.deepEqual(f.actions[1][1], {email, uid, password, emailVerified: true});
});
test("reuses an existing account without changing its identity, password, or verification", async () => {
  const f = fixture({uid}, password);
  assert.deepEqual(await ensureLocalCaptureTestIdentity(f.input), {uid, email, password, created: false});
  assert.deepEqual(f.actions, []);
});
test("resumes creation with an already retained password after interruption", async () => {
  const f = fixture(null, password);
  await ensureLocalCaptureTestIdentity(f.input);
  assert.deepEqual(f.actions.map(action => action[0]), ["create"]);
});
test("missing credentials and identity conflicts never trigger account replacement", async () => {
  for (const [prior, retained] of [[{uid}, null], [{uid: "different-user"}, password]]) {
    const f = fixture(prior, retained);
    await assert.rejects(ensureLocalCaptureTestIdentity(f.input), /nothing was changed|not changed/);
    assert.deepEqual(f.actions, []);
  }
});
test("refuses a real account or unbounded UID before touching Auth", async () => {
  const f = fixture(null, null);
  await assert.rejects(ensureLocalCaptureTestIdentity({...f.input, email: "someone@gmail.com"}), /reserved/);
  await assert.rejects(ensureLocalCaptureTestIdentity({...f.input, uid: "../unsafe"}), /bounded/);
  assert.deepEqual(f.actions, []);
});
test("does not create an account when credential retention fails", async () => {
  const f = fixture(null, null);
  f.input.writePassword = () => {throw new Error("Keychain unavailable");};
  await assert.rejects(ensureLocalCaptureTestIdentity(f.input), /Keychain unavailable/);
  assert.deepEqual(f.actions, []);
});
test("an unexpected Auth failure is not mistaken for a missing account", async () => {
  const f = fixture(null, null);
  f.input.auth.getUserByEmail = async () => {throw new Error("emulator unavailable");};
  await assert.rejects(ensureLocalCaptureTestIdentity(f.input), /emulator unavailable/);
  assert.deepEqual(f.actions, []);
});
