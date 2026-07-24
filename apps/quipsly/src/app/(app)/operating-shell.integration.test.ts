/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));

import { loadInbox } from "./inbox/inbox-loader";
import { loadToday } from "./today/today-page";

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the operating-shell smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("Today and Inbox local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `operating-shell-${nonce}@example.test`;
  const otherEmail = `operating-shell-other-${nonce}@example.test`;
  let actorUserId = "";
  let otherUserId = "";
  let actorRoomId = "";
  let otherRoomId = "";
  let projectId = "";
  let workspaceId = "";

  beforeAll(async () => {
    const [actor, other] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: actorEmail, name: "Operating shell actor" } }),
      prisma.user.create({ data: { primaryEmail: otherEmail, name: "Operating shell other" } }),
    ]);
    actorUserId = actor.id;
    otherUserId = other.id;
    const workspace = await prisma.studioWorkspace.create({ data: { slug: `operating-shell-${nonce}`, name: "Operating shell smoke" } });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({ data: { workspaceId, slug: `operating-shell-${nonce}`, name: "High Ground Odyssey smoke" } });
    projectId = project.id;
    await prisma.studioProjectAccessGrant.create({ data: { projectId, email: actorEmail, role: "EDITOR", status: "ACTIVE", createdByUserId: actorUserId, createdByEmail: actorEmail } });

    const now = Date.now();
    const [actorRoom, otherRoom] = await Promise.all([
      prisma.callRoom.create({ data: { createdByUserId: actorUserId, projectId, title: "Actor Episode 5", purpose: "PODCAST", scheduledStart: new Date(now + 60 * 60 * 1000), scheduledEnd: new Date(now + 2 * 60 * 60 * 1000) } }),
      prisma.callRoom.create({ data: { createdByUserId: otherUserId, projectId, title: "Other private session", purpose: "COACHING", scheduledStart: new Date(now + 30 * 60 * 1000), scheduledEnd: new Date(now + 90 * 60 * 1000) } }),
    ]);
    actorRoomId = actorRoom.id;
    otherRoomId = otherRoom.id;

    const [plannedTask] = await Promise.all([
      prisma.actionItem.create({ data: { roomId: actorRoomId, projectId, assignedUserId: actorUserId, title: "Proof listen Episode 5" } }),
      prisma.actionItem.create({ data: { roomId: actorRoomId, projectId, assignedUserId: actorUserId, title: "Prepare the cold open", dueAt: new Date(now + 2 * 60 * 60 * 1000) } }),
      prisma.actionItem.create({ data: { roomId: otherRoomId, projectId, assignedUserId: otherUserId, title: "Other private task", dueAt: new Date(now + 60 * 60 * 1000) } }),
    ]);
    await prisma.goal.create({ data: { ownerUserId: actorUserId, roomId: actorRoomId, projectId, title: "Ship one thoughtful episode" } });
    await prisma.workPlanBlock.create({ data: { ownerUserId: actorUserId, actionItemId: plannedTask.id, startsAt: new Date(now + 15 * 60 * 1000), endsAt: new Date(now + 45 * 60 * 1000), timezone: "America/Denver" } });

    const summarySource = (roomId: string, suffix: string) => ({
      packetBuildId: `build-${suffix}`,
      actionCandidates: [{
        id: `quipsly-transcript-action-candidate-v1:job-${suffix}:segment-${suffix}`,
        kind: "quipsly-transcript-action-candidate-v1",
        reviewStatus: "READY_FOR_HUMAN_REVIEW",
        title: suffix === "actor" ? "Review the opening beat" : "Other private proposal",
        detail: "Compare this moment with playback before accepting it.",
        transcriptJobId: `job-${suffix}`,
        recordingAssetId: `asset-${suffix}`,
        roomId,
        packetBuildId: `build-${suffix}`,
        segmentId: `segment-${suffix}`,
        speakerLabel: "Homer",
        startSeconds: 10,
        endSeconds: 14,
        humanApprovalRequired: true,
        committedActionItemId: null,
      }],
    });
    await Promise.all([
      prisma.coachingNote.create({ data: { roomId: actorRoomId, authorUserId: actorUserId, kind: "SUMMARY", title: "Actor review packet", body: "Actor packet", sourceJson: summarySource(actorRoomId, "actor") } }),
      prisma.coachingNote.create({ data: { roomId: otherRoomId, authorUserId: otherUserId, kind: "SUMMARY", title: "Other review packet", body: "Other packet", sourceJson: summarySource(otherRoomId, "other") } }),
      prisma.snippet.create({ data: { id: `mobile-source-${nonce}-actor`, userId: actorUserId, sourceTitle: "Actor iPhone research capture", highlightedText: "A private passage waiting for deliberate filing." } }),
      prisma.bookmark.create({ data: { id: `mobile-source-${nonce}-other`, userId: otherUserId, url: `https://example.test/private-${nonce}`, title: "Other private mobile source" } }),
    ]);
  });

  afterAll(async () => {
    try {
      if (actorRoomId || otherRoomId) await prisma.callRoom.deleteMany({ where: { id: { in: [actorRoomId, otherRoomId].filter(Boolean) } } });
      if (projectId) await prisma.studioProject.deleteMany({ where: { id: projectId } });
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (actorUserId || otherUserId) await prisma.user.deleteMany({ where: { id: { in: [actorUserId, otherUserId].filter(Boolean) } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("reads a bounded actor Today and only that actor's packet Inbox", async () => {
    const today = await loadToday(actorUserId, actorEmail);
    expect(today.nextSession).toMatchObject({ id: actorRoomId, title: "Actor Episode 5", project: { id: projectId } });
    expect(today.planBlocks.map((block) => block.title)).toEqual(["Proof listen Episode 5"]);
    expect(today.tasks.map((task) => task.title)).toEqual(["Prepare the cold open"]);
    expect(today.goals.map((goal) => goal.title)).toEqual(["Ship one thoughtful episode"]);
    expect(JSON.stringify(today)).not.toContain("Other private");

    const inbox = await loadInbox(actorUserId, actorEmail, false);
    expect(inbox.ready).toHaveLength(2);
    expect(inbox.ready.find((item) => item.kind === "SOURCE")).toMatchObject({ title: "Actor iPhone research capture", roomId: null, project: null });
    expect(inbox.ready.find((item) => item.kind === "ACTION")).toMatchObject({ title: "Review the opening beat", roomId: actorRoomId, segmentId: "segment-actor", project: { id: projectId } });
    expect(JSON.stringify(inbox)).not.toContain("Other private");
    expect(inbox.boundaries).toMatchObject({ actorAccessibleSessionsOnly: true, personalSourceCaptureIncluded: true, noUnreadClaim: true, externalSideEffects: false });
  });

  it("leaves the separate actor's private records stored while keeping them invisible", async () => {
    await expect(prisma.callRoom.findUnique({ where: { id: otherRoomId }, select: { title: true } })).resolves.toEqual({ title: "Other private session" });
    await expect(prisma.coachingNote.count({ where: { roomId: otherRoomId } })).resolves.toBe(1);
  });
});
