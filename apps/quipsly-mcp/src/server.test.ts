import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { createQuipslyServer } from "./server.js";
import { QuipslyApiError, type ApiRequest } from "./quipsly-api.js";

const requestId = "12345678-1234-4123-8123-123456789012";
const version = "2026-09-07T12:00:00.000Z";

test("the real stdio entrypoint exposes tools without inventing a signed-in user", async () => {
  const client = new Client({ name: "stdio-rehearsal", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--import",
      "tsx",
      fileURLToPath(new URL("./index.ts", import.meta.url)),
    ],
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      QUIPSLY_API_BASE_URL: "http://127.0.0.1:1",
      QUIPSLY_SESSION_TOKEN_FILE:
        "/does-not-exist/quipsly-synthetic-session.jwt",
    },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 9);
    const result = await client.callTool({
      name: "get_coaching_home",
      arguments: {},
    });
    assert.equal(result.isError, true);
    assert.equal(
      (result.structuredContent as Record<string, unknown>)?.code,
      "SESSION_REQUIRED",
    );
  } finally {
    await client.close();
  }
});
async function connected(
  request: (input: ApiRequest) => Promise<Record<string, unknown>>,
) {
  const server = createQuipslyServer({ request });
  const client = new Client({ name: "quipsly-test", version: "1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

test("actual MCP discovery and calls use fixed canonical routes, not database impersonation", async () => {
  const requests: ApiRequest[] = [];
  const connection = await connected(async (input) => {
    requests.push(input);
    return { ok: true, entry: { id: "saved" } };
  });
  try {
    const { tools } = await connection.client.listTools();
    assert.equal(tools.length, 9);
    assert.ok(tools.every((tool) => tool.inputSchema.type === "object"));
    assert.equal(
      tools.find((tool) => tool.name === "read_conversation")?.annotations
        ?.readOnlyHint,
      false,
    );
    const command = {
      engagementId: "client-space",
      kind: "NOTE",
      visibility: "PRIVATE",
      title: "Next steps",
      body: "Ordinary editable work",
      clientRequestId: requestId,
    };
    for (let i = 0; i < 2; i++) {
      const result = await connection.client.callTool({
        name: "create_client_work",
        arguments: command,
      });
      assert.notEqual(result.isError, true);
      assert.deepEqual(result.structuredContent, {
        ok: true,
        entry: { id: "saved" },
      });
    }
    assert.deepEqual(requests[0], requests[1]);
    assert.equal(
      requests[0]?.path,
      "/api/coaching/engagements/client-space/work",
    );
    assert.equal(requests[0]?.body?.clientRequestId, requestId);
    assert.equal(requests[0]?.body?.visibility, "PRIVATE");
    assert.equal(requests[0]?.body?.engagementId, undefined);
  } finally {
    await connection.close();
  }
});

test("partial updates cannot silently share private notes or clear task owners and dates", async () => {
  let calls = 0;
  const connection = await connected(async () => {
    calls++;
    return { ok: true };
  });
  try {
    const cases = [
      {
        name: "create_client_work",
        arguments: {
          engagementId: "../outside",
          kind: "NOTE",
          title: "x",
          body: "",
          visibility: "PRIVATE",
          clientRequestId: requestId,
        },
      },
      {
        name: "create_client_work",
        arguments: {
          engagementId: "space",
          kind: "TASK",
          title: "x",
          body: "",
          visibility: "PRIVATE",
          clientRequestId: requestId,
        },
      },
      { name: "get_my_workspace", arguments: { actorUserId: "someone-else" } },
      {
        name: "update_client_work",
        arguments: {
          engagementId: "space",
          kind: "NOTE",
          id: "note",
          expectedUpdatedAt: version,
          title: "x",
          body: "private",
        },
      },
      {
        name: "update_client_work",
        arguments: {
          engagementId: "space",
          kind: "TASK",
          id: "task",
          expectedUpdatedAt: version,
          title: "x",
          body: "",
          status: "DONE",
        },
      },
      {
        name: "send_conversation_message",
        arguments: {
          projectSlug: "home",
          threadKey: "engagement:space",
          body: "x",
        },
      },
    ];
    for (const request of cases) {
      const result = await connection.client.callTool(request);
      assert.equal(result.isError, true);
      assert.equal(
        (result.structuredContent as Record<string, unknown>)?.code,
        "INVALID_INPUT",
      );
    }
    assert.equal(calls, 0);
  } finally {
    await connection.close();
  }
});

test("work lifecycle forwards exact versions and messages preserve retry identity", async () => {
  const requests: ApiRequest[] = [];
  const connection = await connected(async (input) => {
    requests.push(input);
    return { ok: true };
  });
  try {
    const identity = {
      engagementId: "space",
      kind: "NOTE",
      id: "note",
      expectedUpdatedAt: version,
    };
    await connection.client.callTool({
      name: "update_client_work",
      arguments: {
        ...identity,
        title: "Updated",
        body: "Still private",
        visibility: "PRIVATE",
      },
    });
    await connection.client.callTool({
      name: "remove_client_work",
      arguments: identity,
    });
    await connection.client.callTool({
      name: "restore_client_work",
      arguments: identity,
    });
    await connection.client.callTool({
      name: "send_conversation_message",
      arguments: {
        projectSlug: "home",
        threadKey: "engagement:space",
        body: "Shared next step",
        clientMessageId: requestId,
      },
    });
    assert.deepEqual(
      requests.map((x) => x.method),
      ["PATCH", "DELETE", "PUT", "POST"],
    );
    assert.ok(
      requests.slice(0, 3).every((x) => x.body?.expectedUpdatedAt === version),
    );
    assert.equal(requests[0]?.body?.visibility, "PRIVATE");
    assert.equal(requests[3]?.body?.clientMessageId, requestId);
    assert.equal(requests[3]?.path, "/api/nest-chat");
  } finally {
    await connection.close();
  }
});

test("scope errors are MCP tool failures with structured recovery data", async () => {
  const connection = await connected(async () => {
    throw new QuipslyApiError("WORK_UNAVAILABLE", "Work is unavailable.", 404);
  });
  try {
    const result = await connection.client.callTool({
      name: "read_client_work",
      arguments: { engagementId: "other-space" },
    });
    assert.equal(result.isError, true);
    assert.equal(
      (result.structuredContent as Record<string, unknown>)?.code,
      "WORK_UNAVAILABLE",
    );
    assert.equal(
      (result.structuredContent as Record<string, unknown>)?.status,
      404,
    );
  } finally {
    await connection.close();
  }
});
