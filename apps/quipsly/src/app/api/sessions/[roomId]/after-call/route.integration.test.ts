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

  it("removes visibility immediately when the participant's access is revoked", async () => {
    await prisma.callParticipant.updateMany({ where: { roomId, userId: users[1].id }, data: { accessStatus: "REMOVED" } });
    expect((await read(1)).status).toBe(404);
    expect((await read(0)).status).toBe(200);
  });
});
