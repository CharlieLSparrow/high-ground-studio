/** @jest-environment node */

import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccessById } from "./access";
import { createGoalFromMessage, getGoalData, updateGoalStage } from "@/app/actions/kanban-actions";
import { addClipToTimeline } from "@/app/actions/timeline-actions";
import { createWorkflowStageAction, deleteWorkflowStageAction } from "@/app/(app)/nests/[slug]/settings/actions";
import { createDocumentInNest } from "@/app/(app)/nests/[slug]/actions";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const target = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL || "missing:");
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) throw new Error("This test only operates on a local disposable database");
  process.env.DATABASE_URL = target.href;
}

(enabled ? describe : describe.skip)("project commands with real membership and persistence", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID();
  const userIds: string[] = [];
  const projectIds: string[] = [];
  let workspaceId: string;
  let owner: { id: string; primaryEmail: string };
  let member: typeof owner;
  let outsider: typeof owner;
  let projectId: string;
  let foreignId: string;
  let ownStage: string;
  let foreignStage: string;
  let threadId: string;
  let messageId: string;
  let foreignMessageId: string;
  let privateThreadId: string;
  let privateMessageId: string;
  let trackId: string;
  let foreignTrackId: string;
  let ownGoalId: string;
  let foreignGoalId: string;
  let colleagueGoalId: string;
  let foreignAssetId: string;

  function signIn(user: typeof owner | null) {
    jest.mocked(auth).mockResolvedValue(user ? { user: { ...user, email: user.primaryEmail, isStaff: false, roles: [] } } as any : null);
  }

  beforeAll(async () => {
    const users = [];
    for (const name of ["owner", "member", "outsider"]) {
      const user = await prisma.user.create({ data: { primaryEmail: `project-actions-${name}-${nonce}@example.test`, name } });
      userIds.push(user.id); users.push(user);
    }
    [owner, member, outsider] = users;
    const workspace = await prisma.studioWorkspace.create({ data: { slug: `project-actions-${nonce}`, name: "Project command QA" } });
    workspaceId = workspace.id;
    for (const name of ["shared", "foreign"]) {
      const project = await prisma.studioProject.create({ data: { workspaceId, slug: `project-actions-${name}-${nonce}`, name } });
      projectIds.push(project.id);
    }
    [projectId, foreignId] = projectIds;
    foreignAssetId = (await prisma.studioMediaAsset.create({ data: {
      filename: "private-local-qa.mp4", url: "https://example.test/private-local-qa.mp4", projects: { connect: { id: foreignId } },
    } })).id;
    await prisma.studioProjectAccessGrant.createMany({ data: [
      { projectId, email: owner.primaryEmail, role: "OWNER" },
      { projectId, email: member.primaryEmail, role: "EDITOR" },
      { projectId: foreignId, email: outsider.primaryEmail, role: "OWNER" },
    ] });
    ownStage = (await prisma.studioWorkflowStage.create({ data: { projectId, name: "Ready", hexColor: "#456754" } })).id;
    foreignStage = (await prisma.studioWorkflowStage.create({ data: { projectId: foreignId, name: "Private", hexColor: "#456754" } })).id;
    for (const [scopeProjectId, key] of [[projectId, "default"], [foreignId, "default"], [projectId, "engagement:private-client"]]) {
      const thread = await prisma.studioNestChatThread.create({ data: { projectId: scopeProjectId, key } });
      const message = await prisma.studioNestChatMessage.create({ data: { projectId: scopeProjectId, threadId: thread.id, authorEmail: owner.primaryEmail, body: "A conversation idea" } });
      if (key !== "default") { privateThreadId = thread.id; privateMessageId = message.id; }
      else if (scopeProjectId === projectId) { threadId = thread.id; messageId = message.id; }
      else foreignMessageId = message.id;
    }
    ownGoalId = (await prisma.goal.create({ data: { projectId, ownerUserId: owner.id, title: "Owner private goal", stageId: ownStage } })).id;
    colleagueGoalId = (await prisma.goal.create({ data: { projectId, ownerUserId: member.id, title: "Member private goal" } })).id;
    foreignGoalId = (await prisma.goal.create({ data: { projectId: foreignId, ownerUserId: outsider.id, title: "Outside goal" } })).id;
    for (const scopeProjectId of projectIds) {
      const timeline = await prisma.studioNLEProject.create({ data: { projectId: scopeProjectId, name: "Local test timeline" } });
      const track = await prisma.studioNLETrack.create({ data: { nleProjectId: timeline.id, name: "Video", trackType: "VIDEO", orderIndex: 0 } });
      if (scopeProjectId === projectId) trackId = track.id;
      else foreignTrackId = track.id;
    }
  });

  afterAll(async () => {
    try {
      if (projectIds.length) {
        await prisma.studioNestChatMessage.deleteMany({ where: { projectId: { in: projectIds } } });
        await prisma.goal.deleteMany({ where: { projectId: { in: projectIds } } });
        await prisma.studioProject.deleteMany({ where: { id: { in: projectIds } } });
      }
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (foreignAssetId) await prisma.studioMediaAsset.deleteMany({ where: { id: foreignAssetId } });
      if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally { await prisma.$disconnect(); }
  });

  beforeEach(() => signIn(owner));

  it("admits the owner and editor to an empty project without creating a document", async () => {
    expect((await requireProjectAccessById(projectId, "write")).user.id).toBe(owner.id);
    signIn(member);
    expect((await requireProjectAccessById(projectId, "write")).user.id).toBe(member.id);
    expect(await prisma.studioDocument.count({ where: { projectId } })).toBe(0);
  });

  it("rejects an uninvited and a signed-out actor before any stage is created", async () => {
    const before = await prisma.studioWorkflowStage.count({ where: { projectId } });
    signIn(outsider);
    await expect(createWorkflowStageAction(projectId, "Intrusion", "#456754", 0)).rejects.toThrow("FORBIDDEN");
    signIn(null);
    await expect(createWorkflowStageAction(projectId, "Intrusion", "#456754", 0)).rejects.toThrow("UNAUTHORIZED");
    expect(await prisma.studioWorkflowStage.count({ where: { projectId } })).toBe(before);
  });

  it("creates an immediately writable blank page for owners and editors, without instructional body text", async () => {
    const project = await prisma.studioProject.findUniqueOrThrow({ where: { id: projectId } });
    for (const actor of [owner, member]) {
      signIn(actor);
      const result = await createDocumentInNest(project.slug, "draft");
      const document = await prisma.studioDocument.findUniqueOrThrow({ where: { id: result.documentId }, include: { blocks: true } });
      expect(document).toMatchObject({ projectId, title: "Untitled page", sourceLabel: "document-kind:draft" });
      expect(document.blocks).toHaveLength(1);
      expect(document.blocks[0]).toMatchObject({ body: "", order: 0 });
      expect(result.href).toBe(`/create?project=${project.slug}&document=${document.id}`);
    }
  });

  it("does not create a writing page for outsiders or signed-out visitors", async () => {
    const project = await prisma.studioProject.findUniqueOrThrow({ where: { id: projectId } });
    const before = await prisma.studioDocument.count({ where: { projectId } });
    for (const actor of [outsider, null]) {
      signIn(actor);
      await expect(createDocumentInNest(project.slug, "draft")).rejects.toThrow("UNAUTHORIZED");
    }
    expect(await prisma.studioDocument.count({ where: { projectId } })).toBe(before);
  });

  it("enforces revocation and viewer read-only capability at each invocation", async () => {
    signIn(member);
    await prisma.studioProjectAccessGrant.update({ where: { projectId_email: { projectId, email: member.primaryEmail } }, data: { role: "VIEWER" } });
    try {
      await expect(requireProjectAccessById(projectId, "read")).resolves.toMatchObject({ role: "VIEWER" });
      await expect(createWorkflowStageAction(projectId, "Denied", "#456754", 0)).rejects.toThrow("FORBIDDEN");
      await prisma.studioProjectAccessGrant.update({ where: { projectId_email: { projectId, email: member.primaryEmail } }, data: { status: "REVOKED" } });
      await expect(requireProjectAccessById(projectId, "read")).rejects.toThrow("FORBIDDEN");
    } finally {
      await prisma.studioProjectAccessGrant.update({ where: { projectId_email: { projectId, email: member.primaryEmail } }, data: { role: "EDITOR", status: "ACTIVE" } });
    }
  });

  it("cannot fetch foreign or another member's private goals by supplying an accessible project", async () => {
    expect((await getGoalData(projectId, ownGoalId))?.id).toBe(ownGoalId);
    expect(await getGoalData(projectId, foreignGoalId)).toBeNull();
    expect(await getGoalData(projectId, colleagueGoalId)).toBeNull();
  });

  it("keeps stage moves and fallback deletion inside the project without partial writes", async () => {
    await expect(updateGoalStage(projectId, ownGoalId, foreignStage)).rejects.toThrow("NOT_FOUND");
    await expect(deleteWorkflowStageAction(projectId, ownStage, foreignStage)).rejects.toThrow("NOT_FOUND");
    expect((await prisma.goal.findUniqueOrThrow({ where: { id: ownGoalId } })).stageId).toBe(ownStage);
    expect(await prisma.studioWorkflowStage.findUnique({ where: { id: ownStage } })).not.toBeNull();
  });

  it("does not create goals from another project's message or a narrower client thread", async () => {
    const before = await prisma.goal.count({ where: { projectId } });
    await expect(createGoalFromMessage(projectId, threadId, foreignMessageId, "Wrong message")).rejects.toThrow("NOT_FOUND");
    await expect(createGoalFromMessage(projectId, privateThreadId, privateMessageId, "Private thread")).rejects.toThrow("NOT_FOUND");
    expect(await prisma.goal.count({ where: { projectId } })).toBe(before);
  });

  it("creates and links a goal atomically and replays the same request without duplication", async () => {
    const first = await createGoalFromMessage(projectId, threadId, messageId, "Follow this idea", ownStage);
    const retry = await createGoalFromMessage(projectId, threadId, messageId, "Follow this idea", ownStage);
    expect(retry.id).toBe(first.id);
    expect((await prisma.studioNestChatMessage.findUniqueOrThrow({ where: { id: messageId } })).linkedGoalId).toBe(first.id);
  });

  it("cannot add a clip to another project's track", async () => {
    await expect(addClipToTimeline(projectId, foreignTrackId, null, "Wrong timeline", 0, 24, null)).rejects.toThrow("NOT_FOUND");
    expect(await prisma.studioNLEClip.count({ where: { trackId: foreignTrackId } })).toBe(0);
    const clip = await addClipToTimeline(projectId, trackId, null, "Local generated clip", 0, 24, null);
    expect((await prisma.studioNLEClip.findUniqueOrThrow({ where: { id: clip.id } })).trackId).toBe(trackId);
  });

  it("cannot attach another project's media even to an accessible track", async () => {
    const before = await prisma.studioNLEClip.count({ where: { trackId } });
    await expect(addClipToTimeline(projectId, trackId, foreignAssetId, "Wrong media", 0, 24, null)).rejects.toThrow("NOT_FOUND");
    expect(await prisma.studioNLEClip.count({ where: { trackId } })).toBe(before);
  });

  it("rolls back the losing concurrent link instead of leaving an orphan goal", async () => {
    const message = await prisma.studioNestChatMessage.create({ data: { projectId, threadId, body: "Concurrent local QA" } });
    const before = await prisma.goal.count({ where: { projectId } });
    const results = await Promise.allSettled([
      createGoalFromMessage(projectId, threadId, message.id, "One result"),
      createGoalFromMessage(projectId, threadId, message.id, "One result"),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect(await prisma.goal.count({ where: { projectId } })).toBe(before + 1);
    const saved = await prisma.studioNestChatMessage.findUniqueOrThrow({ where: { id: message.id } });
    for (const result of results) {
      if (result.status === "fulfilled") expect(result.value.id).toBe(saved.linkedGoalId);
      else expect(result.reason).toEqual(expect.objectContaining({ message: expect.stringContaining("CONFLICT") }));
    }
  });
});
