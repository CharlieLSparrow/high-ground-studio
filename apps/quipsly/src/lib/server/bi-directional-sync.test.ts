/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({
  getPrismaClient: jest.fn(),
}));

jest.mock("@/lib/server/home-nest", () => ({
  ensureHomeNestForEmail: jest.fn(),
  homeNestSlugForEmail: jest.fn((email: string) =>
    `home-${email
      .toLowerCase()
      .replace(/@/g, "-at-")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")}`,
  ),
}));

import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail } from "@/lib/server/home-nest";

import {
  parseQuipslyNoteToBlocks,
  syncBlocksToQuipslyNote,
} from "./bi-directional-sync";

const USER_ID = "user-owner";
const OWNER_EMAIL = "owner@example.com";
const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const HOME_NEST_ID = "home-nest-id";
const DOCUMENT_ID = "document-id";

const ownedNote = {
  id: NOTE_ID,
  userId: USER_ID,
  title: "Private field notes",
  content: "First block\n\nSecond block",
  tags: [] as string[],
  folderName: null,
  createdAt: new Date("2026-07-17T12:00:00.000Z"),
  updatedAt: new Date("2026-07-18T12:00:00.000Z"),
  user: { primaryEmail: OWNER_EMAIL },
};

function document(projectId = HOME_NEST_ID) {
  return {
    id: DOCUMENT_ID,
    projectId,
    stableId: NOTE_ID,
    title: "Earlier title",
    sourceLabel: "quipsly-native-note",
    sourcePath: null,
    projectionStatus: "private" as const,
    isPrivate: true,
    createdAt: new Date("2026-07-17T12:00:00.000Z"),
    updatedAt: new Date("2026-07-18T12:00:00.000Z"),
  };
}

function prismaMocks() {
  const tx = {
    studioDocumentBlock: {
      deleteMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    studioTaggedSpan: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    studioTag: {
      upsert: jest.fn(),
    },
  };
  const prisma = {
    quipslyNote: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    studioProjectAccessGrant: {
      findUnique: jest.fn(),
    },
    studioDocument: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    studioDocumentBlock: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (operation: (client: typeof tx) => unknown) =>
      operation(tx),
    ),
  };

  return { prisma, tx };
}

function reverseDocument({
  sourceLabel = "quipsly-native-note",
  projectId = HOME_NEST_ID,
  projectSlug = "home-owner-at-example-com",
}: {
  sourceLabel?: string;
  projectId?: string;
  projectSlug?: string;
} = {}) {
  return {
    ...document(projectId),
    sourceLabel,
    title: "Edited in Nest",
    project: {
      id: projectId,
      slug: projectSlug,
      name: "Owner Home Nest",
      sourceLabel: "nest-kind:home",
      workspace: {
        slug: "tonight-pack",
      },
    },
    blocks: [
      { id: "block-one", body: "Edited first block", order: 0 },
      { id: "block-two", body: "Edited second block", order: 1000 },
    ],
  };
}

function prepareOwnedHomeNest(prisma: ReturnType<typeof prismaMocks>["prisma"]) {
  prisma.quipslyNote.findFirst.mockResolvedValue(ownedNote);
  jest.mocked(ensureHomeNestForEmail).mockResolvedValue({
    id: HOME_NEST_ID,
    slug: "home-owner-at-example-com",
    name: "Owner Home Nest",
    sourceLabel: "nest-kind:home",
  });
  prisma.studioProjectAccessGrant.findUnique.mockResolvedValue({
    role: "OWNER",
    status: "ACTIVE",
  });
}

describe("parseQuipslyNoteToBlocks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("binds note lookup to the expected authenticated user", async () => {
    const { prisma, tx } = prismaMocks();
    prisma.quipslyNote.findFirst.mockResolvedValue(null);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);

    await expect(
      parseQuipslyNoteToBlocks(NOTE_ID, "another-user"),
    ).rejects.toThrow("unavailable for the expected owner");

    expect(prisma.quipslyNote.findFirst).toHaveBeenCalledWith({
      where: { id: NOTE_ID, userId: "another-user" },
      include: { user: { select: { primaryEmail: true } } },
    });
    expect(ensureHomeNestForEmail).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.studioDocumentBlock.create).not.toHaveBeenCalled();
  });

  it("fails closed when canonical Home Nest provisioning has no owner grant", async () => {
    const { prisma } = prismaMocks();
    prisma.quipslyNote.findFirst.mockResolvedValue(ownedNote);
    jest.mocked(ensureHomeNestForEmail).mockResolvedValue({
      id: HOME_NEST_ID,
      slug: "home-owner-at-example-com",
      name: "Owner Home Nest",
      sourceLabel: "nest-kind:home",
    });
    prisma.studioProjectAccessGrant.findUnique.mockResolvedValue(null);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);

    await expect(
      parseQuipslyNoteToBlocks(NOTE_ID, USER_ID),
    ).rejects.toThrow("owner grant is missing");

    expect(ensureHomeNestForEmail).toHaveBeenCalledWith(OWNER_EMAIL, prisma);
    expect(prisma.studioDocument.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a global stableId collision in another Nest", async () => {
    const { prisma, tx } = prismaMocks();
    prepareOwnedHomeNest(prisma);
    prisma.studioDocument.findUnique.mockResolvedValue(document("foreign-nest-id"));
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);

    await expect(
      parseQuipslyNoteToBlocks(NOTE_ID, USER_ID),
    ).rejects.toThrow("belongs to another document or Nest");

    expect(prisma.studioDocument.create).not.toHaveBeenCalled();
    expect(prisma.studioDocumentBlock.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.studioDocumentBlock.update).not.toHaveBeenCalled();
  });

  it("rejects an unrelated document collision inside the same Home Nest", async () => {
    const { prisma } = prismaMocks();
    prepareOwnedHomeNest(prisma);
    prisma.studioDocument.findUnique.mockResolvedValue({
      ...document(),
      sourceLabel: "home-nest",
    });
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);

    await expect(
      parseQuipslyNoteToBlocks(NOTE_ID, USER_ID),
    ).rejects.toThrow("belongs to another document or Nest");

    expect(prisma.studioDocument.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates a private note document and private blocks in the owned Home Nest", async () => {
    const { prisma, tx } = prismaMocks();
    prepareOwnedHomeNest(prisma);
    prisma.studioDocument.findUnique.mockResolvedValue(null);
    prisma.studioDocument.create.mockResolvedValue(document());
    prisma.studioDocumentBlock.findMany.mockResolvedValue([]);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);

    await expect(
      parseQuipslyNoteToBlocks(NOTE_ID, USER_ID),
    ).resolves.toBe(DOCUMENT_ID);

    expect(prisma.studioDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: HOME_NEST_ID,
        stableId: NOTE_ID,
        sourceLabel: "quipsly-native-note",
        projectionStatus: "private",
        isPrivate: true,
      }),
    });
    expect(tx.studioDocumentBlock.create).toHaveBeenCalledTimes(2);
    for (const [call] of tx.studioDocumentBlock.create.mock.calls) {
      expect(call).toEqual({
        data: expect.objectContaining({
          documentId: DOCUMENT_ID,
          projectionStatus: "private",
          isPrivate: true,
        }),
      });
    }
  });

  it("repairs an existing projected block back to private", async () => {
    const { prisma, tx } = prismaMocks();
    prepareOwnedHomeNest(prisma);
    prisma.quipslyNote.findFirst.mockResolvedValue({
      ...ownedNote,
      content: "First block",
    });
    prisma.studioDocument.findUnique.mockResolvedValue(document());
    prisma.studioDocument.updateMany.mockResolvedValue({ count: 1 });
    prisma.studioDocumentBlock.findMany.mockResolvedValue([
      {
        id: "block-id",
        documentId: DOCUMENT_ID,
        stableId: "stable-block-id",
        order: 0,
        title: null,
        body: "First block",
        isPrivate: false,
      },
    ]);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);

    await parseQuipslyNoteToBlocks(NOTE_ID, USER_ID);

    expect(prisma.studioDocument.updateMany).toHaveBeenCalledWith({
      where: { id: DOCUMENT_ID, projectId: HOME_NEST_ID },
      data: expect.objectContaining({
        projectionStatus: "private",
        isPrivate: true,
      }),
    });
    expect(tx.studioDocumentBlock.update).toHaveBeenCalledWith({
      where: { id: "block-id" },
      data: expect.objectContaining({
        projectionStatus: "private",
        isPrivate: true,
      }),
    });
  });
});

describe("syncBlocksToQuipslyNote", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("leaves non-native Studio documents as an explicit no-op", async () => {
    const { prisma } = prismaMocks();
    prisma.studioDocument.findUnique.mockResolvedValue(
      reverseDocument({ sourceLabel: "manuscript" }),
    );
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);

    await expect(syncBlocksToQuipslyNote(DOCUMENT_ID)).resolves.toEqual({
      status: "skipped",
      reason: "not-native-note-document",
      documentId: DOCUMENT_ID,
    });

    expect(prisma.quipslyNote.findUnique).not.toHaveBeenCalled();
    expect(prisma.quipslyNote.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a native-note stableId collision outside the owner's canonical Home Nest", async () => {
    const { prisma } = prismaMocks();
    prisma.studioDocument.findUnique.mockResolvedValue(
      reverseDocument({
        projectId: "foreign-project",
        projectSlug: "shared-writing-nest",
      }),
    );
    prisma.quipslyNote.findUnique.mockResolvedValue(ownedNote);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);

    await expect(syncBlocksToQuipslyNote(DOCUMENT_ID)).rejects.toThrow(
      "outside the source owner's canonical Home Nest",
    );

    expect(prisma.studioProjectAccessGrant.findUnique).not.toHaveBeenCalled();
    expect(prisma.quipslyNote.updateMany).not.toHaveBeenCalled();
  });

  it("reverse-syncs a validated native document with note id and userId scope", async () => {
    const { prisma } = prismaMocks();
    prisma.studioDocument.findUnique.mockResolvedValue(reverseDocument());
    prisma.quipslyNote.findUnique.mockResolvedValue(ownedNote);
    prisma.studioProjectAccessGrant.findUnique.mockResolvedValue({
      role: "OWNER",
      status: "ACTIVE",
    });
    prisma.quipslyNote.updateMany.mockResolvedValue({ count: 1 });
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);

    await expect(syncBlocksToQuipslyNote(DOCUMENT_ID)).resolves.toEqual({
      status: "synced",
      documentId: DOCUMENT_ID,
      noteId: NOTE_ID,
      userId: USER_ID,
    });

    expect(prisma.studioProjectAccessGrant.findUnique).toHaveBeenCalledWith({
      where: {
        projectId_email: {
          projectId: HOME_NEST_ID,
          email: OWNER_EMAIL,
        },
      },
      select: { role: true, status: true },
    });
    expect(prisma.quipslyNote.updateMany).toHaveBeenCalledWith({
      where: { id: NOTE_ID, userId: USER_ID },
      data: {
        content: "Edited first block\n\nEdited second block",
        title: "Edited in Nest",
        folderName: "Owner Home Nest",
      },
    });
  });
});
