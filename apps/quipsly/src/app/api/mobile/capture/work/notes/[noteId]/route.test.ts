/** @jest-environment node */

import { revalidatePath } from "next/cache";

import { editCanonicalDocumentNoteInTransaction } from "@/lib/server/canonical-document-note-edit";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { PATCH } from "./route";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/server/canonical-document-note-edit", () => ({
  editCanonicalDocumentNoteInTransaction: jest.fn(),
}));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

const requestBody = {
  expectedContentRevision: "a".repeat(64),
  clientRequestId: "57f90335-4ec5-4d24-b388-f3b41e5b1f78",
  title: "A clearer opening",
  blocks: [{
    id: "block-1",
    stableId: "stable-block-1",
    body: "Begin with the surprising admission, then leave room for Homer.",
  }],
};

function patch(body: unknown = requestBody) {
  return PATCH(
    new Request("http://localhost/api/mobile/capture/work/notes/note-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ noteId: "note-1" }) },
  );
}

describe("mobile canonical document-note edit route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fails before a mutation when the request is not signed in", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);

    const response = await patch();

    expect(response.status).toBe(401);
    expect(editCanonicalDocumentNoteInTransaction).not.toHaveBeenCalled();
  });

  it("returns the exact canonical acknowledgement and explicit side-effect boundary", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "actor-1",
        primaryEmail: "person@example.com",
      },
    } as never);
    jest.mocked(editCanonicalDocumentNoteInTransaction).mockResolvedValue({
      ok: true,
      receiptId: "document-note-edit-receipt",
      idempotentReplay: false,
      changedBlockIds: ["block-1"],
      note: {
        id: "note-1",
        stableId: "stable-note-1",
        projectId: "project-1",
        projectSlug: "high-ground",
        title: requestBody.title,
        blocks: requestBody.blocks.map((block, order) => ({ ...block, order })),
        contentRevision: "b".repeat(64),
        updatedAt: "2026-07-30T06:00:00.000Z",
        canEditContent: true,
        contentEditBoundary: "Canonical private note.",
      },
    });

    const response = await patch();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(editCanonicalDocumentNoteInTransaction).toHaveBeenCalledWith({
      actorUserId: "actor-1",
      actorEmail: "person@example.com",
      documentId: "note-1",
      ...requestBody,
    });
    expect(payload).toMatchObject({
      ok: true,
      schema: "quipsly-mobile-document-note-edit-v1",
      receiptId: "document-note-edit-receipt",
      note: {
        id: "note-1",
        title: requestBody.title,
        contentRevision: "b".repeat(64),
      },
      boundaries: {
        canonicalDocument: true,
        stableBlocksPreserved: true,
        optimisticContentRevision: true,
        protectedOfflineIntentSupported: true,
        anchorsPreservedOrHeldForReview: true,
        tagsChanged: false,
        structureChanged: false,
        sourceMutated: false,
        externalSideEffects: false,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/work");
    expect(revalidatePath).toHaveBeenCalledWith("/library");
    expect(revalidatePath).toHaveBeenCalledWith("/find");
  });

  it("keeps a stale protected draft held with the current canonical revision", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    jest.mocked(editCanonicalDocumentNoteInTransaction).mockResolvedValue({
      ok: false,
      code: "CONFLICT",
      error: "This note changed in Nest.",
      current: {
        id: "note-1",
        stableId: "stable-note-1",
        projectId: "project-1",
        projectSlug: "high-ground",
        title: "Newer Nest title",
        blocks: [],
        contentRevision: "c".repeat(64),
        updatedAt: "2026-07-30T06:01:00.000Z",
        canEditContent: true,
        contentEditBoundary: "Canonical private note.",
      },
    });

    const response = await patch();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "CONFLICT",
      current: {
        title: "Newer Nest title",
        contentRevision: "c".repeat(64),
      },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
