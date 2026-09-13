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
  it("removes visibility immediately when the participant's access is revoked", async () => {
    await prisma.callParticipant.updateMany({ where: { roomId, userId: users[1].id }, data: { accessStatus: "REMOVED" } });
    expect((await read(1)).status).toBe(404);
    expect((await read(0)).status).toBe(200);
  });
});
