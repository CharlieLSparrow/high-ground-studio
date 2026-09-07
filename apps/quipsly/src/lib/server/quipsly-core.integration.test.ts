/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import {
  createNestWithOwner,
  listVisibleNestsForEmail,
  QuipslyNestCreateIdentityConflictError,
  resolveNestAccess,
} from "./quipsly-core";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runLocalDatabaseSmoke =
  process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;

if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for the canonical Nest creation smoke.",
    );
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL).hostname)) {
    throw new Error("Nest creation tests require a local disposable database.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("canonical Nest creation local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const ownerEmail = `nest-create-owner-${nonce}@example.test`;
  const secondOwnerEmail = `nest-create-second-${nonce}@example.test`;
  const outsiderEmail = `nest-create-outsider-${nonce}@example.test`;
  const projectIds = new Set<string>();

  afterAll(async () => {
    try {
      if (projectIds.size > 0) {
        await prisma.studioProject.deleteMany({
          where: { id: { in: [...projectIds] } },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("opens a general Nest's blank first page in the note editor without demo content", async () => {
    const created = await createNestWithOwner({
      prisma, name: `General workspace ${nonce}`, nestKind: "mixed", documentTitle: "Notes",
      ownerEmail, clientRequestId: randomUUID(),
    });
    projectIds.add(created.nest.id);
    const document = await prisma.studioDocument.findUniqueOrThrow({
      where: { id: created.document.id }, include: { blocks: true },
    });
    expect(document.sourceLabel).toBe("nest-kind:mixed;document-kind:note");
    expect(document.title).toBe("Notes");
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0].body).toBe("");
    expect(document.isPrivate).toBe(true);
  });

  it("persists a private owner-scoped Nest, starter document, and immutable creation receipt", async () => {
    const clientRequestId = randomUUID();
    const name = `Build 11 acceptance ${nonce}`;
    const description = "Disposable canonical Nest creation database acceptance.";
    const created = await createNestWithOwner({
      prisma,
      name,
      description,
      nestKind: "production",
      ownerEmail: ` ${ownerEmail.toUpperCase()} `,
      clientRequestId,
    });
    projectIds.add(created.nest.id);

    expect(created).toMatchObject({
      idempotentReplay: false,
      nest: {
        name,
        kind: "production",
      },
      document: {
        nestSlug: created.nest.slug,
        kind: "original-content",
      },
    });

    const stored = await prisma.studioProject.findUniqueOrThrow({
      where: { id: created.nest.id },
      include: {
        accessGrants: true,
        documents: {
          include: {
            blocks: { orderBy: { order: "asc" } },
            documentOperations: true,
          },
        },
      },
    });
    expect(stored).toMatchObject({
      name,
      description,
      sourceLabel: "nest-kind:production",
      isPrivate: true,
      accessGrants: [
        expect.objectContaining({
          email: ownerEmail,
          role: "OWNER",
          status: "ACTIVE",
          note: "Nest owner",
        }),
      ],
    });
    expect(stored.documents).toHaveLength(1);
    expect(stored.documents[0]).toMatchObject({
      id: created.document.id,
      stableId: `doc-${created.nest.slug}`,
      isPrivate: true,
    });
    expect(stored.documents[0].blocks).toEqual([
      expect.objectContaining({
        order: 0,
        body: "",
        isPrivate: true,
      }),
    ]);
    expect(stored.documents[0].documentOperations).toEqual([
      expect.objectContaining({
        id: created.receiptId,
        groupId: `create-nest:${clientRequestId}`,
        actorEmail: ownerEmail,
        operationType: "create-nest",
        status: "applied",
        reversible: false,
        payloadJson: expect.objectContaining({
          schema: "quipsly-create-nest-v1",
          clientRequestId,
          ownerEmail,
          name,
          description,
        }),
      }),
    ]);

    const [ownerAccess, outsiderAccess, ownerVisible, outsiderVisible] =
      await Promise.all([
        resolveNestAccess({
          prisma,
          nestSlug: created.nest.slug,
          email: ownerEmail,
          action: "manage",
        }),
        resolveNestAccess({
          prisma,
          nestSlug: created.nest.slug,
          email: outsiderEmail,
          action: "read",
        }),
        listVisibleNestsForEmail({ prisma, email: ownerEmail }),
        listVisibleNestsForEmail({ prisma, email: outsiderEmail }),
      ]);

    expect(ownerAccess).toMatchObject({
      allowed: true,
      role: "OWNER",
      projectId: created.nest.id,
    });
    expect(outsiderAccess).toMatchObject({
      allowed: false,
      projectId: created.nest.id,
    });
    expect(ownerVisible.map(({ nest }) => nest.id)).toContain(created.nest.id);
    expect(outsiderVisible.map(({ nest }) => nest.id)).not.toContain(
      created.nest.id,
    );

    const replay = await createNestWithOwner({
      prisma,
      name,
      description,
      nestKind: "production",
      ownerEmail,
      clientRequestId,
    });
    expect(replay).toMatchObject({
      idempotentReplay: true,
      receiptId: created.receiptId,
      nest: { id: created.nest.id },
      document: { id: created.document.id },
    });
    await expect(
      createNestWithOwner({
        prisma,
        name: `${name} changed`,
        description,
        nestKind: "production",
        ownerEmail,
        clientRequestId,
      }),
    ).rejects.toBeInstanceOf(QuipslyNestCreateIdentityConflictError);
    await expect(
      prisma.studioDocumentOperation.count({
        where: {
          projectId: created.nest.id,
          operationType: "create-nest",
        },
      }),
    ).resolves.toBe(1);
  });

  it("never grants an existing same-name Nest to a different owner", async () => {
    const name = `Same human name ${nonce}`;
    const [first, second] = await Promise.all([
      createNestWithOwner({
        prisma,
        name,
        nestKind: "writing",
        ownerEmail,
        clientRequestId: randomUUID(),
      }),
      createNestWithOwner({
        prisma,
        name,
        nestKind: "writing",
        ownerEmail: secondOwnerEmail,
        clientRequestId: randomUUID(),
      }),
    ]);
    projectIds.add(first.nest.id);
    projectIds.add(second.nest.id);

    expect(first.nest.id).not.toBe(second.nest.id);
    expect(first.nest.slug).not.toBe(second.nest.slug);

    const grants = await prisma.studioProjectAccessGrant.findMany({
      where: { projectId: { in: [first.nest.id, second.nest.id] } },
      orderBy: { projectId: "asc" },
    });
    expect(grants).toHaveLength(2);
    expect(
      grants.find(({ projectId }) => projectId === first.nest.id),
    ).toMatchObject({ email: ownerEmail, role: "OWNER", status: "ACTIVE" });
    expect(
      grants.find(({ projectId }) => projectId === second.nest.id),
    ).toMatchObject({
      email: secondOwnerEmail,
      role: "OWNER",
      status: "ACTIVE",
    });
  });

  it("serializes simultaneous retries into one project and one receipt", async () => {
    const clientRequestId = randomUUID();
    const input = {
      prisma,
      name: `Concurrent retry ${nonce}`,
      description: "The same protected request delivered twice.",
      nestKind: "mixed",
      ownerEmail,
      clientRequestId,
    };
    const [left, right] = await Promise.all([
      createNestWithOwner(input),
      createNestWithOwner(input),
    ]);
    projectIds.add(left.nest.id);
    projectIds.add(right.nest.id);

    expect(left.nest.id).toBe(right.nest.id);
    expect(left.document.id).toBe(right.document.id);
    expect(left.receiptId).toBe(right.receiptId);
    expect([left.idempotentReplay, right.idempotentReplay].sort()).toEqual([
      false,
      true,
    ]);
    await expect(
      prisma.studioProject.count({
        where: {
          accessGrants: { some: { email: ownerEmail, role: "OWNER" } },
          documentOperations: {
            some: { groupId: `create-nest:${clientRequestId}` },
          },
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.studioDocumentOperation.count({
        where: { groupId: `create-nest:${clientRequestId}` },
      }),
    ).resolves.toBe(1);
  });
});
