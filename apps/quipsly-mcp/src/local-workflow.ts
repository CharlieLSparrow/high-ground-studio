/** Opt-in real HTTP rehearsal. Creates retained synthetic work; never runs in normal CI. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { QuipslyApi } from "./quipsly-api.js";
import { createQuipslyServer } from "./server.js";

function required(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}
const engagementId = required("QUIPSLY_QA_ENGAGEMENT_ID");
const projectSlug = required("QUIPSLY_QA_PROJECT_SLUG");
const baseUrl = "http://127.0.0.1:3012";
const connections: Array<{
  client: Client;
  server: ReturnType<typeof createQuipslyServer>;
}> = [];
async function actor(role: string) {
  const response = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-emulator-key",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: required(`QUIPSLY_QA_${role}_EMAIL`),
        password: required(`QUIPSLY_QA_${role}_PASSWORD`),
        returnSecureToken: true,
      }),
    },
  );
  const credential = (await response.json()) as { idToken?: string };
  if (!response.ok || !credential.idToken)
    throw new Error(`Local ${role} authentication failed`);
  const server = createQuipslyServer(
    new QuipslyApi({ baseUrl, token: async () => credential.idToken! }),
  );
  const client = new Client({ name: "local-coaching-rehearsal", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  connections.push({ client, server });
  return async (
    name: string,
    args: Record<string, unknown>,
    expectedError?: string,
  ) => {
    const result = await client.callTool({ name, arguments: args });
    const data = result.structuredContent as Record<string, any>;
    if (expectedError) assert.equal(data?.code, expectedError);
    else
      assert.notEqual(
        result.isError,
        true,
        `${name}: ${data?.code || "unknown failure"}`,
      );
    return data;
  };
}

try {
  const coach = await actor("COACH");
  const client = await actor("CLIENT");
  const outsider = await actor("OUTSIDER");
  const marker = `Agent workflow ${randomUUID().slice(0, 8)}`;
  const command = {
    engagementId,
    kind: "NOTE",
    title: marker,
    body: "Synthetic rehearsal: identify one manageable next step, then reflect together.",
    visibility: "SHARED",
    clientRequestId: randomUUID(),
  };
  const created = await coach("create_client_work", command);
  const replay = await coach("create_client_work", command);
  assert.equal(replay.entry.id, created.entry.id);
  assert.equal(replay.idempotentReplay, true);
  const identity = {
    engagementId,
    kind: "NOTE",
    id: created.entry.id,
    expectedUpdatedAt: created.entry.updatedAt,
  };
  const clientRead = await client("read_client_work", {
    engagementId,
    item: identity.id,
  });
  assert.equal(clientRead.engagement.entries[0].body, command.body);
  await outsider(
    "read_client_work",
    { engagementId, item: identity.id },
    "WORK_UNAVAILABLE",
  );
  await outsider(
    "update_client_work",
    { ...identity, title: "intrusion", body: "rejected", visibility: "SHARED" },
    "WORK_UNAVAILABLE",
  );
  const update = {
    ...identity,
    title: marker,
    body: `${command.body}\nClient added: start with a five-minute writing session.`,
    visibility: "SHARED",
  };
  const edited = await client("update_client_work", update);
  await coach("update_client_work", update, "WORK_CHANGED");
  const removed = await coach("remove_client_work", {
    ...identity,
    expectedUpdatedAt: edited.entry.updatedAt,
  });
  const hidden = await client("read_client_work", { engagementId, q: marker });
  assert.equal(hidden.engagement.entries.length, 0);
  const restored = await coach("restore_client_work", {
    ...identity,
    expectedUpdatedAt: removed.removal.updatedAt,
  });
  assert.equal(restored.entry.body, update.body);
  const privateNote = await coach("create_client_work", {
    ...command,
    title: `${marker} private`,
    visibility: "PRIVATE",
    clientRequestId: randomUUID(),
  });
  const privateRead = await client("read_client_work", {
    engagementId,
    q: `${marker} private`,
  });
  assert.equal(privateRead.engagement.entries.length, 0);
  const privateEdit = await coach("update_client_work", {
    engagementId,
    kind: "NOTE",
    id: privateNote.entry.id,
    expectedUpdatedAt: privateNote.entry.updatedAt,
    title: `${marker} private`,
    body: "Still author-only after an agent edit.",
    visibility: "PRIVATE",
  });
  assert.equal(privateEdit.entry.visibility, "PRIVATE");
  const finalRead = await client("read_client_work", {
    engagementId,
    item: identity.id,
  });
  assert.equal(finalRead.engagement.entries[0].body, update.body);
  const message = {
    projectSlug,
    threadKey: `engagement:${engagementId}`,
    body: `${marker}: the shared note is ready to edit. Synthetic test message.`,
    clientMessageId: randomUUID(),
  };
  await coach("send_conversation_message", message);
  await coach("send_conversation_message", message);
  const conversation = await client("read_conversation", {
    projectSlug,
    threadKey: message.threadKey,
  });
  assert.equal(JSON.stringify(conversation).split(message.body).length - 1, 1);
  await outsider(
    "read_conversation",
    { projectSlug, threadKey: message.threadKey },
    "WORK_UNAVAILABLE",
  );
  console.log(
    JSON.stringify({
      ok: true,
      sharedCreateRetryEditRestore: true,
      privateNotesHidden: true,
      outsiderReadAndWriteRejected: true,
      chatRetryDeduplicated: true,
      browserReadback: `${baseUrl}/coaching/engagements/${engagementId}?work=${identity.id}`,
    }),
  );
} finally {
  for (const { client, server } of connections) {
    await client.close();
    await server.close();
  }
}
