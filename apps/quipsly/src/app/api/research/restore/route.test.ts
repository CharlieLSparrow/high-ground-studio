/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { researchSha256, stableResearchJson } from "@/lib/research-portability";
import { applyResearchRestore, buildResearchRestorePlan } from "@/lib/server/research-restore";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({ resolveStudioProjectAccess: jest.fn() }));
jest.mock("@/lib/server/research-restore", () => ({
  buildResearchRestorePlan: jest.fn(),
  applyResearchRestore: jest.fn(),
}));

function validBundle() {
  const payload = {
    schemaVersion: "quipsly-research-export-v1",
    exportedAt: "2026-07-18T20:00:00.000Z",
    project: { id: "project-source", slug: "source-nest", name: "Source Nest", updatedAt: "2026-07-18T19:00:00.000Z" },
    sources: [{
      id: "source-1", slug: "source-one", kind: "article", title: "Source one", sourceUrl: null, sourcePath: null, author: null,
      capturedAt: null, immutableText: "Evidence", immutableTextSha256: researchSha256("Evidence"), editableNotes: null, metadataJson: {},
    }],
    tags: [],
    annotations: [],
    writingUses: [],
    writingTargets: [],
    boundaries: { actorScoped: true, sourceMutated: false },
  };
  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      manifestSha256: researchSha256(stableResearchJson(payload)),
      sourceCount: 1,
      annotationCount: 0,
      writingUseCount: 0,
      writingTargetCount: 0,
    },
  };
}

describe("portable research restore route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com" } } as never);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: true, projectId: "project-target" } as never);
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
  });

  it("rejects before reading a private bundle when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await POST(new Request("http://localhost/api/research/restore?project=target", {
      method: "POST",
      body: JSON.stringify(validBundle()),
    }));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("returns a non-mutating plan before explicit apply", async () => {
    jest.mocked(buildResearchRestorePlan).mockResolvedValue({ sourceCreates: 1, sourceMutations: 0, overwrites: 0 } as never);
    const response = await POST(new Request("http://localhost/api/research/restore?project=target", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBundle()),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, mode: "validate", requiresExplicitApply: true, plan: { sourceCreates: 1, overwrites: 0 } });
    expect(buildResearchRestorePlan).toHaveBeenCalled();
    expect(applyResearchRestore).not.toHaveBeenCalled();
  });

  it("applies only when mode is explicit and write access is verified", async () => {
    jest.mocked(applyResearchRestore).mockResolvedValue({
      plan: { sourceCreates: 1, annotationCreates: 0 },
      boundaries: { sourceMutated: false, overwroteExisting: false },
    } as never);
    const response = await POST(new Request("http://localhost/api/research/restore?project=target&mode=apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBundle()),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, mode: "apply", boundaries: { sourceMutated: false, overwroteExisting: false } });
    expect(resolveStudioProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ action: "write", projectSlug: "target" }));
    expect(applyResearchRestore).toHaveBeenCalled();
  });
});
