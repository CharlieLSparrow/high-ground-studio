/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import {
  sessionAccessWhere,
  sessionMutationAccessWhere,
} from "./session-access";

const runLocalDatabaseSmoke =
  process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;

if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for the Session access smoke.",
    );
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("canonical Session collaboration access", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const ownerEmail = `session-owner-${nonce}@example.test`;
  const collaboratorEmail = `session-collab-${nonce}@example.test`;
  const outsiderEmail = `session-outsider-${nonce}@example.test`;
  const viewerEmail = `session-viewer-${nonce}@example.test`;
  let ownerUserId = "";
  let collaboratorUserId = "";
  let outsiderUserId = "";
  let viewerUserId = "";
  let workspaceId = "";
  let projectId = "";
  let roomId = "";

  beforeAll(async () => {
    const [owner, collaborator, outsider, viewer] = await Promise.all([
      prisma.user.create({
        data: { primaryEmail: ownerEmail, name: "Session owner" },
      }),
      prisma.user.create({
        data: { primaryEmail: collaboratorEmail, name: "Session collaborator" },
      }),
      prisma.user.create({
        data: { primaryEmail: outsiderEmail, name: "Session outsider" },
      }),
      prisma.user.create({
        data: { primaryEmail: viewerEmail, name: "Session viewer" },
      }),
    ]);
    ownerUserId = owner.id;
    collaboratorUserId = collaborator.id;
    outsiderUserId = outsider.id;
    viewerUserId = viewer.id;

    const workspace = await prisma.studioWorkspace.create({
      data: {
        slug: `session-access-${nonce}`,
        name: "Session access smoke",
      },
    });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({
      data: {
        workspaceId,
        slug: `session-access-project-${nonce}`,
        name: "Session access project",
      },
    });
    projectId = project.id;
    await prisma.studioProjectAccessGrant.createMany({
      data: [
        {
          projectId,
          email: collaboratorEmail,
          role: "EDITOR",
          status: "ACTIVE",
          createdByUserId: ownerUserId,
          createdByEmail: ownerEmail,
        },
        {
          projectId,
          email: viewerEmail,
          role: "VIEWER",
          status: "ACTIVE",
          createdByUserId: ownerUserId,
          createdByEmail: ownerEmail,
        },
      ],
    });
    const room = await prisma.callRoom.create({
      data: {
        title: "Project-granted collaboration Session",
        projectId,
        createdByUserId: ownerUserId,
      },
    });
    roomId = room.id;
  });

  afterAll(async () => {
    try {
      if (roomId) await prisma.callRoom.deleteMany({ where: { id: roomId } });
      if (projectId) {
        await prisma.studioProject.deleteMany({ where: { id: projectId } });
      }
      if (workspaceId) {
        await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      }
      const userIds = [
        ownerUserId,
        collaboratorUserId,
        outsiderUserId,
        viewerUserId,
      ].filter(Boolean);
      if (userIds.length) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("keeps a project viewer read-only while admitting the editor mutation boundary", async () => {
    const [viewerRead, viewerMutation, editorMutation] = await Promise.all([
      prisma.callRoom.findFirst({
        where: sessionAccessWhere(roomId, {
          id: viewerUserId,
          primaryEmail: viewerEmail,
        }),
        select: { id: true },
      }),
      prisma.callRoom.findFirst({
        where: sessionMutationAccessWhere(roomId, {
          id: viewerUserId,
          primaryEmail: viewerEmail,
        }),
        select: { id: true },
      }),
      prisma.callRoom.findFirst({
        where: sessionMutationAccessWhere(roomId, {
          id: collaboratorUserId,
          primaryEmail: collaboratorEmail,
        }),
        select: { id: true },
      }),
    ]);

    expect(viewerRead).toEqual({ id: roomId });
    expect(viewerMutation).toBeNull();
    expect(editorMutation).toEqual({ id: roomId });
  });

  it("admits the active Nest collaborator but denies a separate outsider account", async () => {
    const [collaboratorRoom, outsiderRoom] = await Promise.all([
      prisma.callRoom.findFirst({
        where: sessionAccessWhere(roomId, {
          id: collaboratorUserId,
          primaryEmail: ` ${collaboratorEmail.toUpperCase()} `,
        }),
        select: { id: true },
      }),
      prisma.callRoom.findFirst({
        where: sessionAccessWhere(roomId, {
          id: outsiderUserId,
          primaryEmail: outsiderEmail,
        }),
        select: { id: true },
      }),
    ]);

    expect(collaboratorRoom).toEqual({ id: roomId });
    expect(outsiderRoom).toBeNull();
  });

  it("denies the collaborator immediately after the grant is revoked", async () => {
    await prisma.studioProjectAccessGrant.update({
      where: {
        projectId_email: { projectId, email: collaboratorEmail },
      },
      data: { status: "REVOKED" },
    });

    await expect(
      prisma.callRoom.findFirst({
        where: sessionMutationAccessWhere(roomId, {
          id: collaboratorUserId,
          primaryEmail: collaboratorEmail,
        }),
        select: { id: true },
      }),
    ).resolves.toBeNull();

    await expect(
      prisma.callRoom.count({
        where: { id: roomId },
      }),
    ).resolves.toBe(1);
  });
});
