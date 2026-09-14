import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { QuipslyApi, QuipslyApiError, type ApiRequest } from "./quipsly-api.js";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,239}$/);
const kind = z.enum(["NOTE", "TASK", "GOAL"]);
const title = z.string().trim().min(1).max(500);
const body = z.string().max(20_000);
const date = z.iso.datetime({ offset: true });
const versioned = { engagementId: id, kind, id, expectedUpdatedAt: date };
const content = { engagementId: id, title, body };
const privateNote = {
  kind: z.literal("NOTE"),
  visibility: z.enum(["PRIVATE", "SHARED"]),
};
const sharedWork = {
  visibility: z.literal("SHARED"),
  ownerUserId: id.optional(),
  targetAt: date.nullable().optional(),
};
const workPath = (engagementId: string) =>
  `/api/coaching/engagements/${engagementId}/work`;

type Definition = { tool: Tool; request: (args: unknown) => ApiRequest };
function define<S extends z.ZodType>(
  name: string,
  description: string,
  schema: S,
  request: (value: z.infer<S>) => ApiRequest,
  readOnlyHint = false,
  idempotentHint = false,
): Definition {
  return {
    tool: {
      name,
      description,
      inputSchema: {
        type: "object",
        ...z.toJSONSchema(schema, { target: "draft-7" }),
      } as Tool["inputSchema"],
      annotations: {
        readOnlyHint,
        idempotentHint,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    request: (args) => request(schema.parse(args ?? {})),
  };
}

const definitions = [
  define(
    "get_my_workspace",
    "Read the signed-in person's visible Nests and a bounded overview of one Nest. This is not complete historical search. Never infer access to other Nests from an ID.",
    z.strictObject({ projectId: id.optional() }),
    (query) => ({ method: "GET", path: "/api/mobile/capture/work", query }),
    true,
    true,
  ),
  define(
    "get_coaching_home",
    "Find the signed-in person's coaching relationships and Sessions using the same home data as Quipsly.",
    z.strictObject({}),
    () => ({ method: "GET", path: "/api/coaching/runway" }),
    true,
    true,
  ),
  define(
    "read_client_work",
    "Read or search notes, tasks and goals in a client space. Follow the returned page cursor for history. Use item for exact readback; private notes remain author-only.",
    z.strictObject({
      engagementId: id,
      q: z.string().max(200).optional(),
      kind: z.enum(["ALL", "NOTE", "TASK", "GOAL"]).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      cursor: z.string().max(2000).optional(),
      item: id.optional(),
    }),
    ({ engagementId, ...query }) => ({
      method: "GET",
      path: workPath(engagementId),
      query,
    }),
    true,
    true,
  ),
  define(
    "create_client_work",
    "Create ordinary editable work, not a pending proposal. Reuse the same UUID and identical content after an uncertain response. Notes can be private; tasks/goals are shared. Does not send messages, invite people or schedule reminders.",
    z.discriminatedUnion("kind", [
      z.strictObject({ ...content, ...privateNote, clientRequestId: z.uuid() }),
      z.strictObject({
        ...content,
        ...sharedWork,
        kind: z.literal("TASK"),
        clientRequestId: z.uuid(),
      }),
      z.strictObject({
        ...content,
        ...sharedWork,
        kind: z.literal("GOAL"),
        clientRequestId: z.uuid(),
      }),
    ]),
    ({ engagementId, ...body }) => ({
      method: "POST",
      path: workPath(engagementId),
      body,
    }),
    false,
    true,
  ),
  define(
    "update_client_work",
    "Save the complete current item with its updatedAt version from readback. Preserve fields not being changed: note visibility, task/goal owner, status and targetAt (null means no date). A stale version returns a conflict rather than overwriting another edit.",
    z.discriminatedUnion("kind", [
      z.strictObject({ ...versioned, ...content, ...privateNote }),
      z.strictObject({
        ...versioned,
        ...content,
        kind: z.literal("TASK"),
        status: z.enum(["OPEN", "DONE", "CANCELED"]),
        ownerUserId: id,
        targetAt: date.nullable(),
      }),
      z.strictObject({
        ...versioned,
        ...content,
        kind: z.literal("GOAL"),
        status: z.enum(["ACTIVE", "PAUSED", "ACHIEVED", "ARCHIVED"]),
        ownerUserId: id,
        targetAt: date.nullable(),
      }),
    ]),
    ({ engagementId, ...body }) => ({
      method: "PATCH",
      path: workPath(engagementId),
      body,
    }),
  ),
  define(
    "remove_client_work",
    "Remove an item reversibly using its current updatedAt. Retain the returned removal.updatedAt to restore it. Source recordings are untouched.",
    z.strictObject(versioned),
    ({ engagementId, ...body }) => ({
      method: "DELETE",
      path: workPath(engagementId),
      body,
    }),
  ),
  define(
    "restore_client_work",
    "Restore a removed item using the version returned by remove_client_work. Current membership and visibility still apply.",
    z.strictObject(versioned),
    ({ engagementId, ...body }) => ({
      method: "PUT",
      path: workPath(engagementId),
      body,
    }),
  ),
  define(
    "read_conversation",
    "Read a scoped conversation; may initialize its empty thread. For a client space use threadKey engagement:<engagementId> and its projectSlug. Follow cursor for older messages.",
    z.strictObject({
      projectSlug: id,
      threadKey: z.string().min(1).max(240),
      cursor: id.optional(),
    }),
    (query) => ({ method: "GET", path: "/api/nest-chat", query }),
    false,
    true,
  ),
  define(
    "send_conversation_message",
    "Send a message to the chosen shared conversation when asked to send, not merely draft. Reuse clientMessageId and identical content after an uncertain response. Does not change membership or invite anyone.",
    z.strictObject({
      projectSlug: id,
      threadKey: z.string().min(1).max(240),
      body: z.string().trim().min(1).max(8000),
      clientMessageId: z.uuid(),
    }),
    (body) => ({ method: "POST", path: "/api/nest-chat", body }),
    false,
    true,
  ),
];

export function createQuipslyServer(api: Pick<QuipslyApi, "request">) {
  const server = new Server(
    { name: "quipsly-mcp", version: "2.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: definitions.map(({ tool }) => tool),
  }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      const definition = definitions.find(
        ({ tool }) => tool.name === params.name,
      );
      if (!definition)
        throw new QuipslyApiError(
          "UNKNOWN_TOOL",
          "Choose an available Quipsly tool.",
        );
      const result = await api.request(definition.request(params.arguments));
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      const failure =
        error instanceof QuipslyApiError
          ? error
          : error instanceof z.ZodError
            ? new QuipslyApiError(
                "INVALID_INPUT",
                "The tool fields are incomplete or invalid. No request was sent.",
              )
            : new QuipslyApiError(
                "TOOL_FAILED",
                "The tool could not complete. Read back before retrying a write.",
              );
      const result = {
        ok: false,
        code: failure.code,
        message: failure.message,
        status: failure.status,
        retryable: failure.retryable,
      };
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  });
  return server;
}
