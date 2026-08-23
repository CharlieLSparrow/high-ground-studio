/** @jest-environment node */

jest.mock("server-only", () => ({}));

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import {
  coachingEngagementAccessWhere,
  ensureCoachingEngagement,
} from "./coaching-engagement";
import {
  acceptCoachingEngagementInvitation,
  changeCoachingEngagementMemberAccess,
  inviteCoachingEngagementMember,
  previewCoachingEngagementInvitation,
  revokeCoachingEngagementInvitation,
} from "./coaching-engagement-membership";

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("private Coaching Engagement collaboration", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const ids = {
    coach: `engagement-coach-${nonce}`,
    client: `engagement-client-${nonce}`,
    observer: `engagement-observer-${nonce}`,
    outsider: `engagement-outsider-${nonce}`,
    editor: `engagement-editor-${nonce}`,
    viewer: `engagement-viewer-${nonce}`,
    invitee: `engagement-invitee-${nonce}`,
    revoked: `engagement-revoked-${nonce}`,
    workspace: `engagement-workspace-${nonce}`,
    project: `engagement-project-${nonce}`,
  };
  const email = (role: string) => `engagement-${role}-${nonce}@example.test`;
  let engagementId = "";

  beforeAll(async () => {
    await prisma.user.createMany({ data: [
      { id: ids.coach, primaryEmail: email("coach"), name: "Coach" },
      { id: ids.client, primaryEmail: email("client"), name: "Client" },
      { id: ids.observer, primaryEmail: email("observer"), name: "Observer" },
      { id: ids.outsider, primaryEmail: email("outsider"), name: "Outsider" },
      { id: ids.editor, primaryEmail: email("editor"), name: "Nest editor" },
      { id: ids.viewer, primaryEmail: email("viewer"), name: "Nest viewer" },
      { id: ids.invitee, primaryEmail: email("invitee"), name: "Invited client" },
      { id: ids.revoked, primaryEmail: email("revoked"), name: "Revoked invitee" },
    ] });
    await prisma.studioWorkspace.create({ data: { id: ids.workspace, slug: ids.workspace, name: "Engagement privacy smoke" } });
    await prisma.studioProject.create({ data: { id: ids.project, workspaceId: ids.workspace, slug: ids.project, name: "Private coaching operations" } });
    await prisma.studioProjectAccessGrant.createMany({ data: [
      { projectId: ids.project, email: email("editor"), role: "EDITOR", status: "ACTIVE" },
      { projectId: ids.project, email: email("viewer"), role: "VIEWER", status: "ACTIVE" },
    ] });
    const engagement = await prisma.$transaction((tx) => ensureCoachingEngagement({
      prisma: tx,
      projectId: ids.project,
      actorUserId: ids.coach,
      clientUserId: ids.client,
      coachUserId: ids.coach,
      clientLabel: "Client",
    }));
    engagementId = engagement.id;
    await prisma.coachingEngagementMember.create({ data: {
      engagementId,
      userId: ids.observer,
      role: "OBSERVER",
      addedByUserId: ids.coach,
    } });
  });

  afterAll(async () => {
    try {
      if (engagementId) await prisma.coachingEngagement.deleteMany({ where: { id: engagementId } });
      await prisma.studioProject.deleteMany({ where: { id: ids.project } });
      await prisma.studioWorkspace.deleteMany({ where: { id: ids.workspace } });
      await prisma.user.deleteMany({ where: { id: { in: [ids.coach, ids.client, ids.observer, ids.outsider, ids.editor, ids.viewer, ids.invitee, ids.revoked] } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("admits coach/client and a Nest editor while denying outsiders and project viewers", async () => {
    const actors = {
      coach: { id: ids.coach, primaryEmail: email("coach") },
      client: { id: ids.client, primaryEmail: email("client") },
      outsider: { id: ids.outsider, primaryEmail: email("outsider") },
      editor: { id: ids.editor, primaryEmail: email("editor") },
      viewer: { id: ids.viewer, primaryEmail: email("viewer") },
    };
    const [coach, client, outsider, editor, viewer] = await Promise.all(Object.values(actors).map((actor) => (
      prisma.coachingEngagement.findFirst({ where: coachingEngagementAccessWhere(engagementId, actor, "read"), select: { id: true } })
    )));
    expect(coach).toEqual({ id: engagementId });
    expect(client).toEqual({ id: engagementId });
    expect(editor).toEqual({ id: engagementId });
    expect(outsider).toBeNull();
    expect(viewer).toBeNull();
    await expect(prisma.studioProjectAccessGrant.findUnique({ where: { projectId_email: { projectId: ids.project, email: email("client") } } })).resolves.toBeNull();
  });

  it("keeps observers read-only and reuses one exact active engagement", async () => {
    await expect(prisma.coachingEngagement.findFirst({
      where: coachingEngagementAccessWhere(engagementId, { id: ids.observer }, "read"),
      select: { id: true },
    })).resolves.toEqual({ id: engagementId });
    await expect(prisma.coachingEngagement.findFirst({
      where: coachingEngagementAccessWhere(engagementId, { id: ids.observer }, "write"),
      select: { id: true },
    })).resolves.toBeNull();

    const replay = await prisma.$transaction((tx) => ensureCoachingEngagement({
      prisma: tx,
      projectId: ids.project,
      actorUserId: ids.coach,
      clientUserId: ids.client,
      coachUserId: ids.coach,
      clientLabel: "Client renamed",
    }));
    expect(replay.id).toBe(engagementId);
    await expect(prisma.coachingEngagement.count({ where: { projectId: ids.project } })).resolves.toBe(1);
  });

  it("removes client access immediately without deleting the retained engagement", async () => {
    await prisma.coachingEngagementMember.update({
      where: { engagementId_userId: { engagementId, userId: ids.client } },
      data: { status: "REMOVED", removedAt: new Date(), removedByUserId: ids.coach },
    });
    await expect(prisma.coachingEngagement.findFirst({
      where: coachingEngagementAccessWhere(engagementId, { id: ids.client, primaryEmail: email("client") }, "read"),
      select: { id: true },
    })).resolves.toBeNull();
    await expect(prisma.coachingEngagement.count({ where: { id: engagementId } })).resolves.toBe(1);
    await expect(prisma.$transaction((tx) => ensureCoachingEngagement({
      prisma: tx,
      projectId: ids.project,
      actorUserId: ids.coach,
      clientUserId: ids.client,
      coachUserId: ids.coach,
      requestedEngagementId: engagementId,
    }))).rejects.toMatchObject({ code: "MEMBERSHIP_REMOVED" });
    await prisma.coachingEngagementMember.update({
      where: { engagementId_userId: { engagementId, userId: ids.client } },
      data: { status: "ACTIVE", removedAt: null, removedByUserId: null },
    });
  });

  it("invites, accepts, removes, restores, and revokes with exact scoped receipts", async () => {
    process.env.AUTH_SECRET = "integration-test-only-coaching-invitation-secret-1234567890";
    const coach = { id: ids.coach, primaryEmail: email("coach") };
    const inviteRequestId = randomUUID();
    const invited = await inviteCoachingEngagementMember({
      engagementId,
      actor: coach,
      email: email("invitee"),
      role: "CLIENT",
      requestId: inviteRequestId,
      origin: "http://127.0.0.1:3012",
      prisma,
    });
    expect(invited.invitationUrl).toContain("/coaching/engagements/join#token=");
    const token = decodeURIComponent(invited.invitationUrl.split("#token=")[1]);
    await expect(prisma.coachingEngagement.findFirst({
      where: coachingEngagementAccessWhere(engagementId, { id: ids.invitee, primaryEmail: email("invitee") }, "read"),
    })).resolves.toBeNull();
    await expect(acceptCoachingEngagementInvitation({
      token,
      actor: { id: ids.outsider, primaryEmail: email("outsider") },
      requestId: randomUUID(),
      prisma,
    })).rejects.toMatchObject({ code: "WRONG_ACCOUNT" });

    const acceptRequestId = randomUUID();
    const accepted = await acceptCoachingEngagementInvitation({
      token,
      actor: { id: ids.invitee, primaryEmail: email("invitee") },
      requestId: acceptRequestId,
      prisma,
    });
    expect(accepted.member).toMatchObject({ status: "ACTIVE", accessRevision: 1 });
    await expect(previewCoachingEngagementInvitation({
      token,
      actor: { id: ids.invitee, primaryEmail: email("invitee") },
      prisma,
    })).resolves.toMatchObject({ canAccept: false, canOpen: true });
    const replay = await acceptCoachingEngagementInvitation({
      token,
      actor: { id: ids.invitee, primaryEmail: email("invitee") },
      requestId: acceptRequestId,
      prisma,
    });
    expect(replay.replayed).toBe(true);
    await expect(prisma.studioProjectAccessGrant.findUnique({
      where: { projectId_email: { projectId: ids.project, email: email("invitee") } },
    })).resolves.toBeNull();

    const removed = await changeCoachingEngagementMemberAccess({
      engagementId,
      memberId: accepted.member.id,
      actor: coach,
      action: "REMOVE",
      expectedRevision: 1,
      requestId: randomUUID(),
      prisma,
    });
    expect(removed.member).toMatchObject({ status: "REMOVED", accessRevision: 2 });
    await expect(changeCoachingEngagementMemberAccess({
      engagementId,
      memberId: accepted.member.id,
      actor: coach,
      action: "RESTORE",
      expectedRevision: 1,
      requestId: randomUUID(),
      prisma,
    })).rejects.toMatchObject({ code: "ACCESS_CHANGED" });
    const restored = await changeCoachingEngagementMemberAccess({
      engagementId,
      memberId: accepted.member.id,
      actor: coach,
      action: "RESTORE",
      expectedRevision: 2,
      requestId: randomUUID(),
      prisma,
    });
    expect(restored.member).toMatchObject({ status: "ACTIVE", accessRevision: 3 });

    const revokedInvite = await inviteCoachingEngagementMember({
      engagementId,
      actor: coach,
      email: email("revoked"),
      role: "OBSERVER",
      requestId: randomUUID(),
      origin: "http://127.0.0.1:3012",
      prisma,
    });
    const revokedToken = decodeURIComponent(revokedInvite.invitationUrl.split("#token=")[1]);
    await revokeCoachingEngagementInvitation({
      engagementId,
      invitationId: revokedInvite.invitation.id,
      actor: coach,
      requestId: randomUUID(),
      prisma,
    });
    await expect(acceptCoachingEngagementInvitation({
      token: revokedToken,
      actor: { id: ids.revoked, primaryEmail: email("revoked") },
      requestId: randomUUID(),
      prisma,
    })).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    await expect(prisma.coachingEngagementMemberReceipt.count({ where: { engagementId } })).resolves.toBe(6);
  });
});
