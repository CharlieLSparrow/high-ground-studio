/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({ resolveStudioProjectAccess: jest.fn() }));

describe("portable research export", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects before private reads when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await GET(new Request("http://localhost/api/research/export?project=high-ground"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization, Cookie");
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("conceals an inaccessible Nest in a private non-cacheable response", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "outsider", primaryEmail: "outsider@example.test" },
    } as any);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: false } as any);
    jest.mocked(getPrismaClient).mockReturnValue({} as any);

    const response = await GET(new Request("http://localhost/api/research/export?project=high-ground"));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization, Cookie");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "That Nest is unavailable to the signed-in account.",
    });
  });

  it("exports preserved source text with actor-scoped overlays and integrity evidence", async () => {
    const createdAt = new Date("2026-07-18T18:00:00.000Z");
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com" } } as any);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: true, projectId: "project-1" } as any);
    const queries: any[] = [];
    const prisma = {
      studioProject: { findUnique: jest.fn().mockResolvedValue({ id: "project-1", slug: "high-ground", name: "High Ground", updatedAt: createdAt }) },
      studioSourceUnit: { findMany: jest.fn().mockResolvedValue([{
        id: "source-1", slug: "source-one", kind: "article", title: "Source one", sourceUrl: "https://example.com/source",
        sourcePath: null, author: "Charlie", capturedAt: createdAt, immutableText: "Preserved evidence.", editableNotes: null,
        metadataJson: {}, createdAt, updatedAt: createdAt,
      }]) },
      studioTag: { findMany: jest.fn().mockResolvedValue([{
        id: "tag-1", slug: "episode-seed", label: "Episode seed", description: null, category: "meaning", isPrivate: true,
        createdAt, updatedAt: createdAt,
      }]) },
      $queryRaw: jest.fn((query: any) => {
        queries.push(query);
        if (queries.length === 1) return Promise.resolve([{
          id: "annotation-1", sourceUnitId: "source-1", visibility: "private", exactText: "Preserved evidence.",
          tagIds: ["tag-1"], revisions: [{ revision: 1, operation: "created" }],
        }]);
        return Promise.resolve([{
          id: "use-1", annotationId: "annotation-1", documentId: "document-1", blockId: "block-1", useKind: "evidence",
          citationKey: "source-1", quoteSnapshot: "Preserved evidence.", citationLabel: "Source one", sourceJson: { responseBlockId: "block-2" },
          archivedAt: null, createdAt,
          writingTarget: {
            useId: "use-1",
            document: { id: "document-1", stableId: "draft-1", title: "Draft one", sourceLabel: null, sourcePath: null, projectionStatus: "draft", isPrivate: true, updatedAt: createdAt },
            block: { id: "block-1", stableId: "opening-1", order: 1, title: "Opening", body: "Body", sourceLabel: null, sourcePath: null, externalId: null, projectionStatus: "draft", isPrivate: true, archivedAt: null, updatedAt: createdAt },
            responseBlock: { id: "block-2", stableId: "response-1", order: 2, title: "Response", body: "Human response", sourceLabel: null, sourcePath: null, externalId: null, projectionStatus: "draft", isPrivate: true, archivedAt: null, updatedAt: createdAt },
          },
        }]);
      }),
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);

    const response = await GET(new Request("http://localhost/api/research/export?project=high-ground"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization, Cookie");
    expect(response.headers.get("content-disposition")).toContain("quipsly-high-ground-research-");
    expect(body).toMatchObject({
      schemaVersion: "quipsly-research-export-v1",
      project: { id: "project-1", slug: "high-ground" },
      sources: [{ id: "source-1", immutableText: "Preserved evidence.", immutableTextSha256: expect.stringMatching(/^[a-f0-9]{64}$/) }],
      annotations: [{ id: "annotation-1", visibility: "private" }],
      writingUses: [{ id: "use-1", annotationId: "annotation-1" }],
      writingTargets: [{ useId: "use-1", document: { id: "document-1" }, block: { id: "block-1", body: "Body" }, responseBlock: { id: "block-2", body: "Human response" } }],
      boundaries: { actorScoped: true, privateAnnotationsLimitedToExporter: true, privateWritingTargetsLimitedToCreator: true, writingTargetSnapshotsIncluded: true, linkedResponseBlockSnapshotsIncluded: true, externalResourcesFetched: false, sourceMutated: false },
      integrity: { algorithm: "sha256", manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/), sourceCount: 1, annotationCount: 1, writingUseCount: 1, writingTargetCount: 1 },
    });
    expect(queries).toHaveLength(2);
    expect(queries[0].strings.join("")).toContain("annotation.\"visibility\" = 'project'");
    expect(queries[0].strings.join("")).toContain("annotation.\"createdByUserId\"");
    expect(queries[1].strings.join("")).toContain("document.\"isPrivate\" = false");
    expect(queries[1].strings.join("")).toContain("annotation_use.\"createdByUserId\"");
    expect(queries[1].strings.join("")).toContain("response_block.\"id\"");
    expect(queries[1].strings.join("")).toContain("annotation_use.\"sourceJson\"->>'responseBlockId'");
  });
});
