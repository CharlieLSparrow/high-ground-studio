/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { createAndAssignWorkEntityTag, replaceWorkEntityTags } from "@/lib/server/work-tags";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/work-tags", () => ({ createAndAssignWorkEntityTag: jest.fn(), replaceWorkEntityTags: jest.fn() }));

function request(body: unknown) {
  return new Request("http://localhost/api/work/tags", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("authenticated shared work tags route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects before database access when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await POST(request({}));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("returns the audited service receipt without implying external work", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test" } } as any);
    const prisma = {};
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    jest.mocked(replaceWorkEntityTags).mockResolvedValue({ ok: true, entityKind: "session", entityId: "room-1", projectId: "project-1", tagIds: ["tag-1"], updatedAt: new Date("2026-07-19T08:00:00.000Z"), tagRevision: null, receiptId: "receipt-1", idempotentReplay: false });
    const response = await POST(request({ entityKind: "session", entityId: "room-1", tagIds: ["tag-1"], expectedUpdatedAt: "2026-07-19T07:59:00.000Z" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, entityKind: "session", tagIds: ["tag-1"], boundaries: { projectScoped: true, externalSideEffects: false } });
    expect(replaceWorkEntityTags).toHaveBeenCalledWith(expect.objectContaining({ prisma, actorUserId: "user-1", actorEmail: "person@example.test", entityKind: "session", entityId: "room-1", tagIds: ["tag-1"] }));
  });

  it("binds a stable iPhone request identity to the audited tag decision", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test" } } as any);
    const prisma = {};
    const clientRequestId = "c77bdc93-06f0-4585-86f0-5383c61dbd2a";
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    jest.mocked(replaceWorkEntityTags).mockResolvedValue({
      ok: true,
      entityKind: "task",
      entityId: "task-1",
      projectId: "project-1",
      tagIds: ["tag-1"],
      updatedAt: new Date("2026-07-23T08:00:00.000Z"),
      tagRevision: null,
      receiptId: `work-tags-${clientRequestId}`,
      idempotentReplay: true,
    });
    const response = await POST(request({
      entityKind: "task",
      entityId: "task-1",
      tagIds: ["tag-1"],
      expectedUpdatedAt: "2026-07-23T07:59:00.000Z",
      clientRequestId,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      receiptId: `work-tags-${clientRequestId}`,
      idempotentReplay: true,
      boundaries: { projectScoped: true, externalSideEffects: false },
    });
    expect(replaceWorkEntityTags).toHaveBeenCalledWith(expect.objectContaining({
      prisma,
      clientRequestId,
      surface: "ios-capture-today",
    }));
  });

  it("creates and applies reusable vocabulary through the shared native/web contract", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test" } } as any);
    const prisma = {};
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    jest.mocked(createAndAssignWorkEntityTag).mockResolvedValue({
      ok: true,
      entityKind: "task",
      entityId: "task-1",
      projectId: "project-1",
      tag: { id: "tag-1", label: "Product development", slug: "product-development", category: "meaning", projectId: "project-1" },
      created: true,
      assignmentChanged: true,
      updatedAt: new Date("2026-07-22T20:00:00.000Z"),
      tagRevision: null,
      receiptId: "receipt-create",
    });
    const response = await POST(request({ operation: "CREATE_AND_ASSIGN", entityKind: "task", entityId: "task-1", label: "Product development", expectedUpdatedAt: "2026-07-22T19:59:00.000Z" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, created: true, tag: { slug: "product-development" }, boundaries: { projectScoped: true, reusableVocabulary: true, externalSideEffects: false } });
    expect(createAndAssignWorkEntityTag).toHaveBeenCalledWith(expect.objectContaining({ prisma, actorUserId: "user-1", actorEmail: "person@example.test", entityKind: "task", entityId: "task-1", label: "Product development" }));
  });

  it("routes a canonical note tag replacement through the same audited service", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test" } } as any);
    const prisma = {};
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    jest.mocked(replaceWorkEntityTags).mockResolvedValue({ ok: true, entityKind: "note", entityId: "note-1", projectId: "project-1", tagIds: ["tag-1"], updatedAt: new Date("2026-07-23T08:00:00.000Z"), tagRevision: null, receiptId: "receipt-note", idempotentReplay: false });
    const response = await POST(request({ entityKind: "note", entityId: "note-1", tagIds: ["tag-1"], expectedUpdatedAt: "2026-07-23T07:59:00.000Z" }));
    expect(response.status).toBe(200);
    expect(replaceWorkEntityTags).toHaveBeenCalledWith(expect.objectContaining({ prisma, entityKind: "note", entityId: "note-1", tagIds: ["tag-1"] }));
  });

  it("exposes document classification to authenticated Capture clients without creating passage spans", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test" } } as any);
    const prisma = {};
    const clientRequestId = "243b859c-06f8-48b9-a227-a35542ec9fda";
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    jest.mocked(replaceWorkEntityTags).mockResolvedValue({
      ok: true,
      entityKind: "document",
      entityId: "document-1",
      projectId: "project-1",
      tagIds: ["tag-1"],
      updatedAt: new Date("2026-07-28T20:00:00.000Z"),
      tagRevision: 5,
      receiptId: "receipt-document",
      idempotentReplay: false,
    });
    const response = await POST(request({
      entityKind: "document",
      entityId: "document-1",
      tagIds: ["tag-1"],
      expectedUpdatedAt: "2026-07-28T19:59:00.000Z",
      expectedTagRevision: 4,
      clientRequestId,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      entityKind: "document",
      boundaries: { projectScoped: true, externalSideEffects: false },
    });
    expect(replaceWorkEntityTags).toHaveBeenCalledWith(expect.objectContaining({
      prisma,
      entityKind: "document",
      entityId: "document-1",
      tagIds: ["tag-1"],
      expectedTagRevision: 4,
      clientRequestId,
      surface: "ios-capture-today",
    }));
  });
});
