/** @jest-environment node */
import { POST } from "./route";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { createNestConversationTask, NestConversationTaskError } from "@/lib/server/nest-conversation-task";
jest.mock("@/lib/prisma", () => ({ getPrismaClient: () => ({}) }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/nest-conversation-task", () => {
  const actual = jest.requireActual("@/lib/server/nest-conversation-task");
  return { ...actual, createNestConversationTask: jest.fn() };
});
const input = { projectSlug: "our-book", sourceMessageId: "message-1", title: "Gather ideas",
  clientRequestId: "dcb31747-9f8c-4385-8ab2-55dd45119349", tags: { tagIds: ["research"] } };
const request = (body: unknown = input) => new Request("http://localhost/api/nest-chat/tasks", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "current-user" } } as never);
});
test("requires a real authenticated actor", async () => {
  jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(createNestConversationTask).not.toHaveBeenCalled();
});
test("passes scope and tags to the canonical command, ignoring a submitted actor identity", async () => {
  jest.mocked(createNestConversationTask).mockResolvedValue({ entry: { id: "task", title: input.title, status: "OPEN", tags: [] }, idempotentReplay: false });
  const response = await POST(request({ ...input, actorUserId: "someone-else" }));
  expect(response.status).toBe(200);
  expect(createNestConversationTask).toHaveBeenCalledWith({ prisma: {}, actorUserId: "current-user", projectSlug: "our-book",
    messageId: input.sourceMessageId, title: input.title, clientRequestId: input.clientRequestId, tagIds: ["research"], newTagLabels: [] });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
test("passes inline tag names to the same task transaction", async () => {
  jest.mocked(createNestConversationTask).mockResolvedValue({ entry: { id: "task", title: input.title, status: "OPEN", tags: [] }, idempotentReplay: false });
  expect((await POST(request({ ...input, tags: { tagIds: [], newTagLabels: ["Chapter ideas"] } }))).status).toBe(200);
  expect(createNestConversationTask).toHaveBeenCalledWith(expect.objectContaining({ tagIds: [], newTagLabels: ["Chapter ideas"] }));
});
test.each([null, {}, { ...input, tags: { tagIds: [42] } },
  { ...input, tags: { tagIds: [], newTagLabels: [42] } },
  { ...input, tags: { tagIds: [], newTagLabels: "Chapter ideas" } }])("rejects malformed payloads", async body => {
  expect((await POST(request(body))).status).toBe(400);
  expect(createNestConversationTask).not.toHaveBeenCalled();
});
test("preserves authorization and conflict failures without claiming the task saved", async () => {
  jest.mocked(createNestConversationTask).mockRejectedValue(new NestConversationTaskError("This Nest isn't available to edit.", 404));
  const response = await POST(request());
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ ok: false });
});
