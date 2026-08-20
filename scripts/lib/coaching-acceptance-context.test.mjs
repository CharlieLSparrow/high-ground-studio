import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadFreshCoachingAcceptanceContext } from "./coaching-acceptance-context.mjs";

function packet(baseURL) {
  return {
    schema: "quipsly-fresh-coaching-acceptance-context-v1",
    baseURL,
    keychainService: "com.quipsly.qa.fresh-coaching",
    testLane: "fresh-ui-automation",
    humanAcceptanceSatisfied: false,
    sessionTitle: "Fresh coaching acceptance a1b2c3d4",
    roomId: "room_12345678",
    bookingId: "booking_12345678",
    engagementId: "engagement_12345678",
    clientEntryPath: "/sessions/room_12345678?mode=live",
    identities: {
      coach: {
        role: "coach",
        email: "acceptance-coach-a1b2c3d4@dev.test",
        displayName: "Coach",
        firebaseUid: "firebase_coach_123",
        userId: "user_coach_123",
      },
      client: {
        role: "client",
        email: "acceptance-client-a1b2c3d4@dev.test",
        displayName: "Client",
        firebaseUid: "firebase_client_123",
        userId: "user_client_123",
      },
    },
    boundaries: {
      passwordsStoredInMacOSKeychain: true,
      passwordsWrittenToArtifact: false,
    },
  };
}

test("returns null when fresh continuation is not requested", async () => {
  assert.equal(
    await loadFreshCoachingAcceptanceContext({
      baseURL: "http://127.0.0.1:3012",
      env: {},
    }),
    null,
  );
});

test("loads a private fresh context without inventing fixture authority", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "quipsly-fresh-context-"),
  );
  const contextPath = path.join(directory, "context.json");
  await writeFile(
    contextPath,
    JSON.stringify(packet("http://127.0.0.1:3012")),
    { mode: 0o600 },
  );
  const loaded = await loadFreshCoachingAcceptanceContext({
    baseURL: "http://127.0.0.1:3012",
    env: { QUIPSLY_COACHING_ACCEPTANCE_CONTEXT: contextPath },
  });
  assert.equal(loaded.fixtureIdentifiersUsed, false);
  assert.equal(loaded.sessionTitle, "Fresh coaching acceptance a1b2c3d4");
  assert.equal(loaded.clientEntryPath, "/sessions/room_12345678?mode=live");
  assert.equal(
    loaded.identities.coach.email,
    "acceptance-coach-a1b2c3d4@dev.test",
  );
});

test("rejects a context exposed to other local users", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "quipsly-fresh-context-"),
  );
  const contextPath = path.join(directory, "context.json");
  await writeFile(
    contextPath,
    JSON.stringify(packet("http://127.0.0.1:3012")),
    { mode: 0o600 },
  );
  await chmod(contextPath, 0o644);
  await assert.rejects(
    loadFreshCoachingAcceptanceContext({
      baseURL: "http://127.0.0.1:3012",
      env: { QUIPSLY_COACHING_ACCEPTANCE_CONTEXT: contextPath },
    }),
    /must not be readable by group or others/,
  );
});
