import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { createNestQuickNoteAction } from "./actions";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({
  resolveStudioProjectAccess: jest.fn(),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

const requestId = "37eb0cd8-4360-4b71-8e06-e0e570b45a23";
const replayHash = createHash("sha256").update(JSON.stringify({
  actorUserId: "user-1",
  projectSlug: "project",
  title: "Keep this thought",
  body: "Durable evidence.",
})).digest("hex");

function signedIn() {
  jest.mocked(auth).mockResolvedValue({
    user: { id: "user-1", primaryEmail: "person@example.test" },
  } as any);
}

describe("project quick note capture", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects signed-out capture before opening the database", async () => {
    jest.mocked(auth).mockResolvedValue(null as any);

    await expect(createNestQuickNoteAction({
      projectSlug: "Project",
      title: "A note",
      body: "Evidence",
      clientRequestId: requestId,
    })).resolves.toMatchObject({ ok: false, code: "AUTH_REQUIRED" });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("atomically creates one private canonical note and an explicit human receipt", async () => {
    signedIn();
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "EDITOR",
    } as any);
    const tx = {
      studioDocument: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "document-1" }),
      },
      studioDocumentOperation: {
        create: jest.fn().mockResolvedValue({ id: "operation-1" }),
      },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any);

    const result = await createNestQuickNoteAction({
      projectSlug: "Project",
      title: "  Keep this thought  ",
      body: "  Durable evidence.  ",
      clientRequestId: requestId,
    });

    expect(result).toEqual({
      ok: true,
      documentId: "document-1",
      blockId: `project-note:user-1:${requestId}:body`,
      projectSlug: "project",
      href: `/create?project=project&document=document-1&block=project-note%3Auser-1%3A${requestId}%3Abody`,
      idempotentReplay: false,
      externalSideEffects: false,
    });
    expect(tx.studioDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "project-1",
        stableId: `project-note:user-1:${requestId}`,
        title: "Keep this thought",
        sourceLabel: "document-kind:note;origin:nest-project-capture",
        projectionStatus: "private",
        isPrivate: true,
        blocks: {
          create: [expect.objectContaining({
            body: "Durable evidence.",
            isPrivate: true,
          })],
        },
      }),
      select: { id: true },
    });
    expect(tx.studioDocumentOperation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        origin: "human",
        operationType: "create-project-quick-note",
        reversible: true,
        afterJson: expect.objectContaining({
          clientRequestId: requestId,
          sourceMutated: false,
          externalSideEffects: false,
        }),
      }),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/library");
    expect(revalidatePath).toHaveBeenCalledWith("/find");
  });

  it("replays the same evidence without creating a second document", async () => {
    signedIn();
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
      role: "EDITOR",
    } as any);
    const tx = {
      studioDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: "document-1",
          projectId: "project-1",
          blocks: [{ id: "block-1" }],
          documentOperations: [{ afterJson: {
            inputHash: replayHash,
          } }],
        }),
        create: jest.fn(),
      },
      studioDocumentOperation: { create: jest.fn() },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any);

    const result = await createNestQuickNoteAction({
      projectSlug: "project",
      title: "Keep this thought",
      body: "Durable evidence.",
      clientRequestId: requestId,
    });

    expect(result).toMatchObject({
      ok: true,
      documentId: "document-1",
      blockId: "block-1",
      idempotentReplay: true,
    });
    expect(tx.studioDocument.create).not.toHaveBeenCalled();
    expect(tx.studioDocumentOperation.create).not.toHaveBeenCalled();
  });

  it("recovers a concurrent unique race as the same idempotent note", async () => {
    signedIn();
    const replay = {
      id: "document-1",
      project: { slug: "project" },
      blocks: [{ id: "block-1" }],
      documentOperations: [{ afterJson: { inputHash: replayHash } }],
    };
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(Object.assign(new Error("unique race"), { code: "P2002" })),
      studioDocument: { findUnique: jest.fn().mockResolvedValue(replay) },
    };
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);

    const result = await createNestQuickNoteAction({
      projectSlug: "project",
      title: "Keep this thought",
      body: "Durable evidence.",
      clientRequestId: requestId,
    });

    expect(result).toMatchObject({
      ok: true,
      documentId: "document-1",
      blockId: "block-1",
      idempotentReplay: true,
      externalSideEffects: false,
    });
    expect(prisma.studioDocument.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { stableId: `project-note:user-1:${requestId}` },
    }));
  });
});
