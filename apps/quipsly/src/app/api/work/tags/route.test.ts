/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { createAndAssignWorkEntityTag, mutateWorkTagTaxonomy, replaceWorkEntityTags } from "@/lib/server/work-tags";

import { PATCH, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/work-tags", () => ({
  createAndAssignWorkEntityTag: jest.fn(),
  mutateWorkTagTaxonomy: jest.fn(),
  replaceWorkEntityTags: jest.fn(),
}));

function request(body: unknown) {
  return new Request("http://localhost/api/work/tags", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/work/tags", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("authenticated shared work tags route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects before database access when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await POST(request({}));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("rejects a signed-out vocabulary mutation before database access", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await PATCH(patchRequest({
      tagId: "tag-1",
      operation: "ARCHIVE",
      expectedUpdatedAt: "2026-07-30T12:00:00.000Z",
    }));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(mutateWorkTagTaxonomy).not.toHaveBeenCalled();
  });

  it("returns a canonical rename receipt with preserved-alias boundaries", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "Person@Example.test" },
    } as any);
    const prisma = {};
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    jest.mocked(mutateWorkTagTaxonomy).mockResolvedValue({
      ok: true,
      operation: "RENAME",
      projectId: "project-1",
      tag: {
        id: "tag-1",
        label: "Episode four",
        slug: "episode-four",
        isActive: true,
        archivedAt: null,
        updatedAt: new Date("2026-07-30T12:01:00.000Z"),
      },
      aliases: [{ id: "alias-1", label: "Episode 4", slug: "episode-4" }],
      revision: 2,
      receiptId: "receipt-rename",
    });
    const response = await PATCH(patchRequest({
      tagId: "tag-1",
      operation: "rename",
      label: "Episode four",
      expectedUpdatedAt: "2026-07-30T12:00:00.000Z",
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      operation: "RENAME",
      tag: {
        archivedAt: null,
        updatedAt: "2026-07-30T12:01:00.000Z",
      },
      aliases: [{ label: "Episode 4", slug: "episode-4" }],
      boundaries: {
        projectScoped: true,
        aliasesPreserved: true,
        existingAssignmentsPreserved: true,
        offlineQueueingAllowed: false,
        externalSideEffects: false,
      },
    });
    expect(mutateWorkTagTaxonomy).toHaveBeenCalledWith(expect.objectContaining({
      prisma,
      actorUserId: "user-1",
      actorEmail: "person@example.test",
      tagId: "tag-1",
      operation: "RENAME",
      label: "Episode four",
      expectedUpdatedAt: new Date("2026-07-30T12:00:00.000Z"),
    }));
  });

  it("maps stale vocabulary revisions to a conflict without claiming a mutation", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "person@example.test" },
    } as any);
    jest.mocked(getPrismaClient).mockReturnValue({} as any);
    jest.mocked(mutateWorkTagTaxonomy).mockResolvedValue({
      ok: false,
      code: "CONFLICT",
      error: "This tag changed elsewhere. Refresh before changing it.",
    });
    const response = await PATCH(patchRequest({
      tagId: "tag-1",
      operation: "ARCHIVE",
      expectedUpdatedAt: "2026-07-30T12:00:00.000Z",
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("rejects an incomplete rename before calling the taxonomy service", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "person@example.test" },
    } as any);
    const response = await PATCH(patchRequest({
      tagId: "tag-1",
      operation: "RENAME",
      label: "",
      expectedUpdatedAt: "2026-07-30T12:00:00.000Z",
    }));
    expect(response.status).toBe(400);
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(mutateWorkTagTaxonomy).not.toHaveBeenCalled();
  });

  it("returns the audited service receipt without implying external work", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test" } } as any);
    const prisma = {};
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    jest.mocked(replaceWorkEntityTags).mockResolvedValue({ ok: true, entityKind: "session", entityId: "room-1", projectId: "project-1", tagIds: ["tag-1"], requestedTagIds: ["tag-1"], newTagLabels: [], resolvedTags: [], updatedAt: new Date("2026-07-19T08:00:00.000Z"), tagRevision: null, receiptId: "receipt-1", idempotentReplay: false });
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
      requestedTagIds: ["tag-1"],
      newTagLabels: [],
      resolvedTags: [],
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
    jest.mocked(replaceWorkEntityTags).mockResolvedValue({ ok: true, entityKind: "note", entityId: "note-1", projectId: "project-1", tagIds: ["tag-1"], requestedTagIds: ["tag-1"], newTagLabels: [], resolvedTags: [], updatedAt: new Date("2026-07-23T08:00:00.000Z"), tagRevision: null, receiptId: "receipt-note", idempotentReplay: false });
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
      requestedTagIds: ["tag-1"],
      newTagLabels: [],
      resolvedTags: [],
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

  it("atomically resolves new iPhone vocabulary inside the complete tag decision", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test" } } as any);
    const prisma = {};
    const clientRequestId = "6593b18d-93a5-4d25-826e-b971e3864948";
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);
    jest.mocked(replaceWorkEntityTags).mockResolvedValue({
      ok: true,
      entityKind: "document",
      entityId: "document-1",
      projectId: "project-1",
      tagIds: ["tag-existing", "tag-new"],
      requestedTagIds: ["tag-existing"],
      newTagLabels: ["Recording day"],
      resolvedTags: [{ id: "tag-new", requestedLabel: "Recording day", label: "Recording day", slug: "recording-day", created: true }],
      updatedAt: new Date("2026-07-29T12:00:00.000Z"),
      tagRevision: 5,
      receiptId: `work-tags-${clientRequestId}`,
      idempotentReplay: false,
    });
    const response = await POST(request({
      entityKind: "document",
      entityId: "document-1",
      tagIds: ["tag-existing"],
      newTagLabels: ["Recording day"],
      expectedUpdatedAt: "2026-07-29T11:59:00.000Z",
      expectedTagRevision: 4,
      clientRequestId,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      tagIds: ["tag-existing", "tag-new"],
      requestedTagIds: ["tag-existing"],
      newTagLabels: ["Recording day"],
      resolvedTags: [{ id: "tag-new", created: true }],
      receiptId: `work-tags-${clientRequestId}`,
      boundaries: { projectScoped: true, externalSideEffects: false },
    });
    expect(replaceWorkEntityTags).toHaveBeenCalledWith(expect.objectContaining({
      prisma,
      entityKind: "document",
      tagIds: ["tag-existing"],
      newTagLabels: ["Recording day"],
      expectedTagRevision: 4,
      clientRequestId,
      surface: "ios-capture-today",
    }));
  });

  it("rejects an empty new vocabulary entry instead of silently dropping part of the phone decision", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test" } } as any);
    const response = await POST(request({
      entityKind: "task",
      entityId: "task-1",
      tagIds: [],
      newTagLabels: [""],
      expectedUpdatedAt: "2026-07-29T11:59:00.000Z",
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(replaceWorkEntityTags).not.toHaveBeenCalled();
  });
});
