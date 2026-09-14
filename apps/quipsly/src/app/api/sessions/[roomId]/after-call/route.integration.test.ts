/** @jest-environment node */
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { GET } from "./route";

jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
const integration = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("A local test database is required.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

integration("shared after-call recording availability against PostgreSQL", () => {
  const prisma = getPrismaClient();
  const suffix = randomUUID();
  let users: { id: string; primaryEmail: string | null }[] = [];
  let roomId = "";
  let otherRoomId = "";
  let phoneId = "";

  beforeAll(async () => {
    users = await Promise.all(["coach", "client", "outsider"].map(role => prisma.user.create({ data: { primaryEmail: `${role}-${suffix}@example.test`, name: `After-call ${role}` } })));
    const room = await prisma.callRoom.create({ data: { title: "After-call integration", createdByUserId: users[0].id } });
    roomId = room.id;
    otherRoomId = (await prisma.callRoom.create({ data: { title: "Another client's private call", createdByUserId: users[2].id } })).id;
    await prisma.callParticipant.create({ data: { roomId, userId: users[1].id, role: "CLIENT", displayName: "Invited client" } });
    phoneId = (await prisma.recordingAsset.create({ data: { roomId, kind: "LOCAL_AUDIO", status: "UPLOADING", localManifestJson: { source: "after-call-test" } } })).id;
    await prisma.recordingAsset.create({ data: { roomId: otherRoomId, status: "VERIFIED", verifiedAt: new Date(), localManifestJson: { exactBytesVerified: true } } });
  });
  afterAll(async () => {
    try {
      await prisma.callRoom.deleteMany({ where: { id: { in: [roomId, otherRoomId].filter(Boolean) } } });
      await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    } finally { await prisma.$disconnect(); }
  });
  const read = async (index: number, id = roomId) => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { ...users[index], isStaff: false } } as any);
    return GET(new Request(`http://localhost/api/sessions/${id}/after-call`), { params: Promise.resolve({ roomId: id }) });
  };

  it("lets both participants see the same phone upload arrive without exposing another client's recordings", async () => {
    for (const account of [0, 1]) {
      const result = await read(account);
      expect(result.status).toBe(200);
      expect((await result.json()).summary.recordings).toEqual({ uploaded: 0, pending: 1, attention: 0 });
      expect((await read(account, otherRoomId)).status).toBe(404);
    }
    await prisma.recordingAsset.update({ where: { id: phoneId }, data: { status: "VERIFIED", verifiedAt: new Date(), localManifestJson: { exactBytesVerified: true } } });
    for (const account of [0, 1]) expect((await (await read(account)).json()).summary.recordings).toEqual({ uploaded: 1, pending: 0, attention: 0 });
    expect((await read(2)).status).toBe(404);
  });
  it("keeps the original transcript available to both participants through running and failed retries", async () => {
    await prisma.transcriptJob.create({ data: {
      roomId, assetId: phoneId, status: "COMPLETED", createdAt: new Date(Date.now() - 60_000),
      segments: { create: { startSeconds: 0, endSeconds: 2, text: "Retained test transcript" } },
    } });
    const retry = await prisma.transcriptJob.create({ data: { roomId, assetId: phoneId, status: "RUNNING" } });
    for (const status of ["RUNNING", "FAILED"] as const) {
      await prisma.transcriptJob.update({ where: { id: retry.id }, data: { status } });
      for (const account of [0, 1]) {
        const payload = await (await read(account)).json();
        expect(payload.summary.transcripts).toEqual({ available: 1, processing: status === "RUNNING" ? 1 : 0, attention: status === "FAILED" ? 1 : 0 });
        expect(payload.summary.transcriptSourceId).toBe(phoneId);
        expect(JSON.stringify(payload)).not.toContain("Retained test transcript");
      }
    }
    expect((await read(2)).status).toBe(404);
  });
  it("keeps both accounts on the latest take while its upload and transcript arrive", async () => {
    const participant = await prisma.callParticipant.findFirstOrThrow({where: {roomId, userId: users[1].id}});
    await prisma.recordingAsset.update({where: {id: phoneId}, data: {participantId: participant.id,
      recordedStartedAt: new Date("2026-09-13T10:00:00Z"), recordedStoppedAt: new Date("2026-09-13T10:01:00Z"),
      localManifestJson: {exactBytesVerified: true, captureGroupId: "earlier-take"}}});
    const latest = await prisma.recordingAsset.create({data: {roomId, participantId: participant.id, kind: "LOCAL_AUDIO", status: "UPLOADING",
      recordedStartedAt: new Date("2026-09-13T11:00:00Z"), recordedStoppedAt: new Date("2026-09-13T11:01:00Z"),
      localManifestJson: {captureGroupId: "latest-take"}}});
    for (const account of [0, 1]) expect((await (await read(account)).json()).summary).toMatchObject({
      recordings: {uploaded: 0, pending: 1, attention: 0}, transcripts: {available: 0, processing: 0, attention: 0},
      transcriptSourceId: null, recordingSourceId: latest.id, otherRecordingCount: 1});
    await prisma.recordingAsset.update({where: {id: latest.id}, data: {status: "VERIFIED", verifiedAt: new Date(),
      localManifestJson: {exactBytesVerified: true, captureGroupId: "latest-take"}}});
    await prisma.transcriptJob.create({data: {roomId, assetId: latest.id, status: "COMPLETED",
      segments: {create: {startSeconds: 0, endSeconds: 2, text: "Latest take transcript"}}}});
    for (const account of [0, 1]) expect((await (await read(account)).json()).summary).toMatchObject({
      recordings: {uploaded: 1, pending: 0, attention: 0}, transcripts: {available: 1, processing: 0, attention: 0},
      transcriptSourceId: latest.id, recordingSourceId: latest.id, otherRecordingCount: 1});
    expect((await read(2)).status).toBe(404);
  });

  it("shows editable current recap and ordinary work without leaking private or other-session work", async () => {
    const currentSource = (await (await read(0)).json()).summary.recordingSourceId;
    const provenance = {roomId, origin: "quipsly-session-follow-through", recordingAssetId: currentSource};
    const shared = await prisma.coachingNote.create({data: {roomId, authorUserId: users[0].id, kind: "SUMMARY", visibility: "SESSION_SHARED",
      title: "Our session recap", body: "The words we actually edited together.", sourceJson: provenance}});
    await prisma.coachingNote.create({data: {roomId, authorUserId: users[0].id, kind: "SUMMARY", visibility: "AUTHOR_PRIVATE",
      title: "Private coach reflection", body: "Not for the client", sourceJson: provenance}});
    await prisma.coachingNote.create({data: {roomId, authorUserId: users[0].id, kind: "SUMMARY", visibility: "SESSION_SHARED",
      title: "Old take recap", body: "Stale words must not be the latest recap", sourceJson: {...provenance, recordingAssetId: phoneId}}});
    await prisma.coachingNote.create({data: {roomId: otherRoomId, authorUserId: users[2].id, kind: "SUMMARY", visibility: "SESSION_SHARED",
      title: "Another client's recap", body: "Another space", sourceJson: provenance}});
    await prisma.actionItem.createMany({data: [
      {roomId, assignedUserId: users[0].id, title: "Try the next chapter", sourceJson: {roomId, visibility: "SESSION_SHARED"}},
      {roomId, assignedUserId: users[0].id, title: "Private coach task", sourceJson: {roomId, visibility: "AUTHOR_PRIVATE"}},
      {roomId, assignedUserId: users[0].id, title: "Already finished", status: "DONE", sourceJson: {roomId, visibility: "SESSION_SHARED"}},
      {roomId: otherRoomId, assignedUserId: users[2].id, title: "Other client's task", sourceJson: {roomId: otherRoomId, visibility: "SESSION_SHARED"}},
    ]});
    const client = (await (await read(1)).json()).summary.followThrough;
    expect(client).toMatchObject({recap: {id: shared.id, excerpt: "The words we actually edited together."}, openTasks: 1, openGoals: 0});
    expect(client.nextSteps.map((entry: {title: string}) => entry.title)).toEqual(["Try the next chapter"]);
    expect(JSON.stringify(client)).not.toMatch(/Private coach|Another client|Other client|Stale words|Already finished/);
    const coach = (await (await read(0)).json()).summary.followThrough;
    expect(coach.openTasks).toBe(2);
    expect(coach.recap.title).toBe("Private coach reflection");
    expect((await read(2)).status).toBe(404);
  });

  it("removes visibility immediately when the participant's access is revoked", async () => {
    await prisma.callParticipant.updateMany({ where: { roomId, userId: users[1].id }, data: { accessStatus: "REMOVED" } });
    expect((await read(1)).status).toBe(404);
    expect((await read(0)).status).toBe(200);
  });
});
