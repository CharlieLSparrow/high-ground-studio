/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import {
  listStudioProjectsForAccess,
  resolveStudioProjectAccess,
} from "./studio-project-access";

jest.mock("@/lib/server/quipsly-onboarding", () => ({
  ensureQuipslyStarterStateForUser: jest.fn(),
}));
jest.mock("@/lib/server/studio-user-identity", () => ({
  ensureInvitedStudioUserByEmail: jest.fn(),
}));

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1"
  ? describe
  : describe.skip;

if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the canonical project-access smoke.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("canonical project list and direct access parity", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const aliasOwnerPrimary = `project-owner-${nonce}@example.test`;
  const aliasOwnerEmail = `project-owner-alias-${nonce}@example.test`;
  const viewerEmail = `project-viewer-${nonce}@example.test`;
  const staffEmail = `project-staff-${nonce}@example.test`;
  const outsiderEmail = `project-outsider-${nonce}@example.test`;
  const ownerProjectSlug = `owner-project-${nonce}`;
  const grantProjectSlug = `grant-project-${nonce}`;
  let workspaceId = "";
  let ambiguousWorkspaceId = "";
  let ownerProjectId = "";
  let grantProjectId = "";
  let ambiguousOwnedProjectId = "";
  let ambiguousForeignProjectId = "";
  const ambiguousSlug = `ambiguous-project-${nonce}`;
  const userIds: string[] = [];

  beforeAll(async () => {
    const [owner, viewer, staff, outsider] = await Promise.all([
      prisma.user.create({
        data: {
          primaryEmail: aliasOwnerPrimary,
          aliases: { create: { email: aliasOwnerEmail } },
        },
      }),
      prisma.user.create({ data: { primaryEmail: viewerEmail } }),
      prisma.user.create({
        data: {
          primaryEmail: staffEmail,
          roles: { create: { role: "OWNER" } },
        },
      }),
      prisma.user.create({ data: { primaryEmail: outsiderEmail } }),
    ]);
    userIds.push(owner.id, viewer.id, staff.id, outsider.id);

    const workspace = await prisma.studioWorkspace.create({
      data: {
        slug: `project-access-${nonce}`,
        name: "Project access parity",
        ownerLabel: aliasOwnerEmail.toUpperCase(),
      },
    });
    workspaceId = workspace.id;
    const [ownerProject, grantProject] = await Promise.all([
      prisma.studioProject.create({
        data: { workspaceId, slug: ownerProjectSlug, name: "Alias-owned project" },
      }),
      prisma.studioProject.create({
        data: { workspaceId, slug: grantProjectSlug, name: "Viewer-granted project" },
      }),
    ]);
    ownerProjectId = ownerProject.id;
    grantProjectId = grantProject.id;
    await prisma.studioProjectAccessGrant.create({
      data: {
        projectId: grantProjectId,
        email: viewerEmail,
        role: "VIEWER",
        status: "ACTIVE",
        createdByUserId: owner.id,
        createdByEmail: aliasOwnerPrimary,
      },
    });
    const ambiguousWorkspace = await prisma.studioWorkspace.create({
      data: {
        slug: `project-access-ambiguous-${nonce}`,
        name: "Ambiguous project locator",
      },
    });
    ambiguousWorkspaceId = ambiguousWorkspace.id;
    const [ambiguousOwned, ambiguousForeign] = await Promise.all([
      prisma.studioProject.create({
        data: { workspaceId, slug: ambiguousSlug, name: "Accessible ambiguous project" },
      }),
      prisma.studioProject.create({
        data: { workspaceId: ambiguousWorkspaceId, slug: ambiguousSlug, name: "Foreign ambiguous project" },
      }),
    ]);
    ambiguousOwnedProjectId = ambiguousOwned.id;
    ambiguousForeignProjectId = ambiguousForeign.id;
    await prisma.studioProjectAccessGrant.create({
      data: {
        projectId: ambiguousOwnedProjectId,
        email: aliasOwnerPrimary,
        role: "OWNER",
        status: "ACTIVE",
        createdByUserId: owner.id,
        createdByEmail: aliasOwnerPrimary,
      },
    });
  });

  afterAll(async () => {
    try {
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (ambiguousWorkspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: ambiguousWorkspaceId } });
      if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("lists every explicit staff decision and matches direct project access", async () => {
    const listed = await listStudioProjectsForAccess({ email: staffEmail, action: "manage", prisma });
    const targets = listed.filter((project) => [ownerProjectId, grantProjectId].includes(project.id));
    expect(targets).toHaveLength(2);
    expect(targets.every((project) => project.role === "OWNER" && project.accessSource === "staff")).toBe(true);
    await expect(resolveStudioProjectAccess({
      projectSlug: grantProjectSlug,
      email: staffEmail,
      action: "manage",
      prisma,
    })).resolves.toMatchObject({ allowed: true, role: "OWNER", source: "staff", projectId: grantProjectId });
  });

  it("uses verified aliases for both listing and direct workspace-owner access", async () => {
    const listed = await listStudioProjectsForAccess({ email: aliasOwnerPrimary, action: "manage", prisma });
    expect(listed).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: ownerProjectId, role: "OWNER", accessSource: "workspace-owner-label" }),
      expect.objectContaining({ id: grantProjectId, role: "OWNER", accessSource: "workspace-owner-label" }),
    ]));
    await expect(resolveStudioProjectAccess({
      projectSlug: ownerProjectSlug,
      email: aliasOwnerPrimary,
      action: "manage",
      prisma,
    })).resolves.toMatchObject({ allowed: true, role: "OWNER", source: "workspace-owner-label", projectId: ownerProjectId });
  });

  it("keeps VIEWER access read-only in both list and direct decisions", async () => {
    const [readable, writable, directRead, directWrite] = await Promise.all([
      listStudioProjectsForAccess({ email: viewerEmail, action: "read", prisma }),
      listStudioProjectsForAccess({ email: viewerEmail, action: "write", prisma }),
      resolveStudioProjectAccess({ projectSlug: grantProjectSlug, email: viewerEmail, action: "read", prisma }),
      resolveStudioProjectAccess({ projectSlug: grantProjectSlug, email: viewerEmail, action: "write", prisma }),
    ]);
    expect(readable).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: grantProjectId, role: "VIEWER", accessSource: "grant" }),
    ]));
    expect(writable.some((project) => project.id === grantProjectId)).toBe(false);
    expect(directRead).toMatchObject({ allowed: true, role: "VIEWER", source: "grant" });
    expect(directWrite).toMatchObject({ allowed: false, role: "VIEWER", source: "grant" });
  });

  it("returns no project and denies direct access for a separate account", async () => {
    await expect(listStudioProjectsForAccess({ email: outsiderEmail, action: "read", prisma })).resolves.toEqual([]);
    await expect(resolveStudioProjectAccess({
      projectSlug: ownerProjectSlug,
      email: outsiderEmail,
      action: "read",
      prisma,
    })).resolves.toMatchObject({ allowed: false, role: null, source: "none", projectId: ownerProjectId });
  });

  it("rejects an ambiguous legacy slug but accepts one exact ID and slug pair", async () => {
    const [legacy, exact, foreign, stale] = await Promise.all([
      resolveStudioProjectAccess({
        projectSlug: ambiguousSlug,
        email: aliasOwnerPrimary,
        action: "read",
        prisma,
      }),
      resolveStudioProjectAccess({
        projectId: ambiguousOwnedProjectId,
        projectSlug: ambiguousSlug,
        email: aliasOwnerPrimary,
        action: "read",
        prisma,
      }),
      resolveStudioProjectAccess({
        projectId: ambiguousForeignProjectId,
        projectSlug: ambiguousSlug,
        email: aliasOwnerPrimary,
        action: "read",
        prisma,
      }),
      resolveStudioProjectAccess({
        projectId: ambiguousOwnedProjectId,
        projectSlug: `${ambiguousSlug}-stale`,
        email: aliasOwnerPrimary,
        action: "read",
        prisma,
      }),
    ]);
    expect(legacy).toMatchObject({ allowed: false, projectId: null, source: "none" });
    expect(exact).toMatchObject({ allowed: true, projectId: ambiguousOwnedProjectId, source: "workspace-owner-label" });
    expect(foreign).toMatchObject({ allowed: false, projectId: ambiguousForeignProjectId, source: "none" });
    expect(stale).toMatchObject({ allowed: false, projectId: null, source: "none" });
  });
});
