import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";

const PROJECT_ID = "demo-studio-cut-rules";
const BUCKET_URL = `gs://${PROJECT_ID}.appspot.com`;
const ROOM_PROJECT_ID = "episode-004";
const ROOM_BRANCH_ID = "main";
const ROOM_META_PATH = `studioCutProjects/${ROOM_PROJECT_ID}/branches/${ROOM_BRANCH_ID}/room/meta`;
const DECISION_EVENT_PATH = `studioCutProjects/${ROOM_PROJECT_ID}/branches/${ROOM_BRANCH_ID}/decisionEvents/decision-1`;
const PRESENCE_PATH = `studioCutProjects/${ROOM_PROJECT_ID}/branches/${ROOM_BRANCH_ID}/presence/session-charlie`;
const STORAGE_PROXY_PATH = `studioCutProjects/${ROOM_PROJECT_ID}/branches/${ROOM_BRANCH_ID}/source-monitor-proxy/source-monitor.mp4`;

let testEnv;

before(async () => {
  const [firestoreRules, storageRules] = await Promise.all([
    readFile("firestore.rules", "utf8"),
    readFile("storage.rules", "utf8"),
  ]);

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: firestoreRules,
    },
    storage: {
      rules: storageRules,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

after(async () => {
  await testEnv?.cleanup();
});

test("approved High Ground users can read and write room metadata", async () => {
  const approved = approvedContext("charlie");
  const db = approved.firestore();

  await assertSucceeds(db.doc(ROOM_META_PATH).set(createRoomMetadata()));
  await assertSucceeds(db.doc(ROOM_META_PATH).get());
});

test("anonymous and outside-domain users cannot read or write room metadata", async () => {
  const approved = approvedContext("charlie");
  const anonymous = testEnv.unauthenticatedContext().firestore();
  const outside = outsideContext("guest").firestore();
  const unverified = testEnv
    .authenticatedContext("unverified", {
      email: "unverified@highgroundodyssey.com",
      email_verified: false,
    })
    .firestore();

  await assertSucceeds(approved.firestore().doc(ROOM_META_PATH).set(createRoomMetadata()));
  await assertFails(anonymous.doc(ROOM_META_PATH).get());
  await assertFails(outside.doc(ROOM_META_PATH).get());
  await assertFails(unverified.doc(ROOM_META_PATH).get());
  await assertFails(anonymous.doc(ROOM_META_PATH).set(createRoomMetadata()));
  await assertFails(outside.doc(ROOM_META_PATH).set(createRoomMetadata()));
  await assertFails(unverified.doc(ROOM_META_PATH).set(createRoomMetadata()));
});

test("room metadata must match the project and branch path", async () => {
  const db = approvedContext("charlie").firestore();

  await assertFails(
    db.doc(ROOM_META_PATH).set(
      createRoomMetadata({
        branchId: "wrong-branch",
      }),
    ),
  );
});

test("approved users can create decisions and tombstone them without deletes", async () => {
  const db = approvedContext("charlie").firestore();
  const decision = createDecisionEvent();

  await assertSucceeds(db.doc(DECISION_EVENT_PATH).set(decision));
  await assertSucceeds(
    db.doc(DECISION_EVENT_PATH).set(
      {
        ...decision,
        removedAt: "2026-05-22T12:10:00.000Z",
        removedBy: "charlie@highgroundodyssey.com",
        operation: "remove",
      },
      { merge: true },
    ),
  );
  await assertFails(db.doc(DECISION_EVENT_PATH).delete());
});

test("decision document ids and room data must match the Firestore path", async () => {
  const db = approvedContext("charlie").firestore();

  await assertFails(
    db.doc(DECISION_EVENT_PATH).set(
      createDecisionEvent({
        id: "wrong-decision",
      }),
    ),
  );
  await assertFails(
    db.doc(DECISION_EVENT_PATH).set(
      createDecisionEvent({
        projectId: "wrong-project",
      }),
    ),
  );
});

test("approved users can write only their own presence document data", async () => {
  const db = approvedContext("charlie").firestore();

  await assertSucceeds(db.doc(PRESENCE_PATH).set(createPresence()));
  await assertSucceeds(
    db.doc(PRESENCE_PATH).set(
      {
        ...createPresence(),
        currentSourceTimeMs: 2000,
      },
      { merge: true },
    ),
  );
  await assertFails(
    db.doc(PRESENCE_PATH).set(
      createPresence({
        userEmail: "mako@highgroundodyssey.com",
      }),
    ),
  );
  await assertFails(db.doc(PRESENCE_PATH).delete());
});

test("approved users can upload and read source-monitor proxy files only on the intended path", async () => {
  const storage = approvedContext("charlie").storage(BUCKET_URL);
  const proxyRef = storage.ref(STORAGE_PROXY_PATH);

  await assertSucceeds(
    proxyRef.put(new Uint8Array([1, 2, 3, 4]), {
      contentType: "video/mp4",
    }),
  );
  await assertSucceeds(proxyRef.getMetadata());
  await assertFails(proxyRef.delete());
  await assertFails(
    storage.ref("studioCutProjects/episode-004/full-res/source.mp4").put(
      new Uint8Array([1, 2, 3, 4]),
      {
        contentType: "video/mp4",
      },
    ),
  );
  await assertFails(
    storage.ref(STORAGE_PROXY_PATH.replace(".mp4", ".txt")).put(
      new Uint8Array([1, 2, 3, 4]),
      {
        contentType: "text/plain",
      },
    ),
  );
});

test("anonymous and outside-domain users cannot upload or read source-monitor proxy files", async () => {
  const approved = approvedContext("charlie").storage(BUCKET_URL);
  const anonymous = testEnv.unauthenticatedContext().storage(BUCKET_URL);
  const outside = outsideContext("guest").storage(BUCKET_URL);

  await assertSucceeds(
    approved.ref(STORAGE_PROXY_PATH).put(new Uint8Array([1, 2, 3, 4]), {
      contentType: "video/mp4",
    }),
  );
  await assertFails(anonymous.ref(STORAGE_PROXY_PATH).getMetadata());
  await assertFails(outside.ref(STORAGE_PROXY_PATH).getMetadata());
  await assertFails(
    anonymous.ref(STORAGE_PROXY_PATH).put(new Uint8Array([1, 2, 3, 4]), {
      contentType: "video/mp4",
    }),
  );
  await assertFails(
    outside.ref(STORAGE_PROXY_PATH).put(new Uint8Array([1, 2, 3, 4]), {
      contentType: "video/mp4",
    }),
  );
});

test("rules test environment is connected to Firestore and Storage emulators", () => {
  assert.ok(testEnv.emulators.firestore);
  assert.ok(testEnv.emulators.storage);
});

function approvedContext(uid) {
  return testEnv.authenticatedContext(uid, {
    email: `${uid}@highgroundodyssey.com`,
    email_verified: true,
  });
}

function outsideContext(uid) {
  return testEnv.authenticatedContext(uid, {
    email: `${uid}@example.com`,
    email_verified: true,
  });
}

function createRoomMetadata(overrides = {}) {
  return {
    projectId: ROOM_PROJECT_ID,
    branchId: ROOM_BRANCH_ID,
    title: "Episode 004",
    manifest: {
      id: ROOM_PROJECT_ID,
      title: "Episode 004",
      durationMs: 600000,
      sources: {
        homer: { role: "homer", label: "Homer source" },
        charlie: { role: "charlie", label: "Charlie source" },
        clip: { role: "clip", label: "Clip source" },
        program: { role: "program", label: "Program source" },
      },
      sourceMonitorProxy: {
        localPlaceholderPath: "source-monitor-proxy.mp4",
        panes: {
          homer: { x: 0, y: 0, width: 0.5, height: 0.5 },
          charlie: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
          clip: { x: 0, y: 0.5, width: 1, height: 0.5 },
        },
      },
      syncBootstrap: {
        source: "premiere",
      },
    },
    sourceMonitorProxyStoragePath: STORAGE_PROXY_PATH,
    sourceMonitorProxyFileName: "source-monitor.mp4",
    sourceMonitorProxyContentType: "video/mp4",
    sourceMonitorProxySizeBytes: 1024,
    createdBy: "charlie@highgroundodyssey.com",
    createdAt: "2026-05-22T12:00:00.000Z",
    updatedAt: "2026-05-22T12:01:00.000Z",
    ...overrides,
  };
}

function createDecisionEvent(overrides = {}) {
  return {
    id: "decision-1",
    projectId: ROOM_PROJECT_ID,
    branchId: ROOM_BRANCH_ID,
    sourceTimeMs: 5000,
    state: "both",
    createdBy: "charlie@highgroundodyssey.com",
    createdAt: "2026-05-22T12:05:00.000Z",
    clientId: "session-charlie",
    operation: "upsert",
    ...overrides,
  };
}

function createPresence(overrides = {}) {
  return {
    sessionId: "session-charlie",
    userEmail: "charlie@highgroundodyssey.com",
    currentSourceTimeMs: 1000,
    currentState: "both",
    updatedAt: "2026-05-22T12:06:00.000Z",
    appVersion: "studio-cut-web",
    ...overrides,
  };
}
