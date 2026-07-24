/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { buildPortableNestExport } from "@/lib/server/nest-portable-export";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/nest-portable-export", () => ({ buildPortableNestExport: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({ resolveStudioProjectAccess: jest.fn() }));

describe("portable Nest export route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects before private reads when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await GET(
      new Request("http://localhost/api/nests/private/portable-export"),
      { params: Promise.resolve({ slug: "private" }) },
    );
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(buildPortableNestExport).not.toHaveBeenCalled();
  });

  it("requires owner access and downloads a no-store JSON package", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "owner@example.com" },
    } as never);
    jest.mocked(getPrismaClient).mockReturnValue({ kind: "prisma" } as never);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      role: "OWNER",
      source: "grant",
      projectId: "project-1",
      projectSlug: "private",
    });
    jest.mocked(buildPortableNestExport).mockResolvedValue({
      schemaVersion: "quipsly-nest-export-v1",
      exportedAt: "2026-07-24T21:00:00.000Z",
      sourceNest: { id: "project-1", slug: "private", name: "Private", description: null, sourceLabel: null, updatedAt: "2026-07-24T20:00:00.000Z" },
      tags: [],
      notes: [],
      tasks: [],
      goals: [],
      goalTaskLinks: [],
      planBlocks: [],
      boundaries: {
        ownerAuthorized: true,
        actorScopedWork: true,
        noteDocumentsIncluded: true,
        mediaBytesIncluded: false,
        sessionsIncluded: false,
        collaboratorAssignmentsIncluded: false,
        remindersRestoredActive: false,
        recurrenceRestoredActive: false,
        planBlocksRestoreAsCanceled: true,
        externalResourcesFetched: false,
        externalSideEffects: false,
      },
      integrity: {
        algorithm: "sha256",
        manifestSha256: "a".repeat(64),
        tagCount: 0,
        aliasCount: 0,
        noteCount: 0,
        blockCount: 0,
        spanCount: 0,
        taskCount: 0,
        goalCount: 0,
        progressReceiptCount: 0,
        goalTaskLinkCount: 0,
        planBlockCount: 0,
      },
    });

    const response = await GET(
      new Request("http://localhost/api/nests/private/portable-export"),
      { params: Promise.resolve({ slug: "private" }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("quipsly-private-nest-2026-07-24.json");
    expect(resolveStudioProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ action: "manage" }));
    expect(buildPortableNestExport).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "prisma" }),
      { projectId: "project-1", actorUserId: "user-1" },
    );
  });
});
