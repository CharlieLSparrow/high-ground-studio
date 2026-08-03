/** @jest-environment node */

import { createPortableNestBundle, NEST_EXPORT_SCHEMA_VERSION, type PortableNestBundlePayload } from "@/lib/nest-portability";
import { getPrismaClient } from "@/lib/prisma";
import {
  applyNestRestore,
  buildNestRestorePlan,
  nestRestorePlanSha256,
  NestRestorePlanChangedError,
} from "@/lib/server/nest-portable-restore";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/nest-portable-restore", () => ({
  applyNestRestore: jest.fn(),
  buildNestRestorePlan: jest.fn(),
  nestRestorePlanSha256: jest.fn(),
  NestRestorePlanChangedError: class NestRestorePlanChangedError extends Error {},
}));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({ resolveStudioProjectAccess: jest.fn() }));

function emptyBundle() {
  const payload: PortableNestBundlePayload = {
    schemaVersion: NEST_EXPORT_SCHEMA_VERSION,
    exportedAt: "2026-07-24T21:00:00.000Z",
    sourceNest: { id: "source-1", slug: "source", name: "Source", description: null, sourceLabel: null, updatedAt: "2026-07-24T20:00:00.000Z" },
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
  };
  return createPortableNestBundle(payload);
}

describe("portable Nest restore route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "owner@example.com" },
    } as never);
    jest.mocked(getPrismaClient).mockReturnValue({ kind: "prisma" } as never);
    jest.mocked(nestRestorePlanSha256).mockReturnValue("b".repeat(64));
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      role: "OWNER",
      source: "grant",
      projectId: "target-1",
      projectSlug: "target",
    });
  });

  it("rejects before reading a private bundle when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await POST(
      new Request("http://localhost/api/nests/target/portable-restore", {
        method: "POST",
        body: JSON.stringify(emptyBundle()),
      }),
      { params: Promise.resolve({ slug: "target" }) },
    );
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("returns a read-only plan before explicit apply", async () => {
    jest.mocked(buildNestRestorePlan).mockResolvedValue({
      manifestSha256: "a".repeat(64),
      sourceNestSlug: "source",
      noteCreates: 1,
      overwrites: 0,
      sourceMutations: 0,
      externalSideEffects: 0,
    } as never);
    const response = await POST(
      new Request("http://localhost/api/nests/target/portable-restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(emptyBundle()),
      }),
      { params: Promise.resolve({ slug: "target" }) },
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      mode: "validate",
      requiresExplicitApply: true,
      planSha256: "b".repeat(64),
      plan: { noteCreates: 1, overwrites: 0 },
    });
    expect(resolveStudioProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ action: "manage" }));
    expect(buildNestRestorePlan).toHaveBeenCalled();
    expect(applyNestRestore).not.toHaveBeenCalled();
  });

  it("applies only when mode is explicit and keeps side effects false", async () => {
    jest.mocked(applyNestRestore).mockResolvedValue({
      plan: { noteCreates: 1, overwrites: 0 },
      planSha256: "b".repeat(64),
      boundaries: { overwroteExisting: false, externalSideEffects: false },
    } as never);
    const response = await POST(
      new Request("http://localhost/api/nests/target/portable-restore?mode=apply", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-quipsly-restore-plan-sha256": "b".repeat(64),
        },
        body: JSON.stringify(emptyBundle()),
      }),
      { params: Promise.resolve({ slug: "target" }) },
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      mode: "apply",
      boundaries: { overwroteExisting: false, externalSideEffects: false },
    });
    expect(applyNestRestore).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      expectedPlanSha256: "b".repeat(64),
    }));
  });

  it("requires a reviewed plan token before apply", async () => {
    const response = await POST(
      new Request("http://localhost/api/nests/target/portable-restore?mode=apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(emptyBundle()),
      }),
      { params: Promise.resolve({ slug: "target" }) },
    );
    expect(response.status).toBe(428);
    expect(applyNestRestore).not.toHaveBeenCalled();
  });

  it("reports destination drift before apply as a fresh-review requirement", async () => {
    jest.mocked(applyNestRestore).mockRejectedValue(new NestRestorePlanChangedError());
    const response = await POST(
      new Request("http://localhost/api/nests/target/portable-restore?mode=apply", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-quipsly-restore-plan-sha256": "b".repeat(64),
        },
        body: JSON.stringify(emptyBundle()),
      }),
      { params: Promise.resolve({ slug: "target" }) },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("validate again"),
    });
  });
});
