/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("livekit-server-sdk", () => ({ ...jest.requireActual("livekit-server-sdk"), RoomServiceClient: jest.fn() }));

import { randomUUID } from "node:crypto";
import { RoomServiceClient } from "livekit-server-sdk";

import { getPrismaClient } from "@/lib/prisma";
import { createCoachingClientSpace, coachingClientSchedulingContext } from "./coaching-client-space";
import {
  coachingEngagementAccessWhere,
  ensureCoachingEngagement,
} from "./coaching-engagement";
import {
  sessionAccessWhere,
  sessionConversationAccessWhere,
  sessionMutationAccessWhere,
  sessionInvitationAccessWhere,
} from "./session-access";
import { captureRoomAccessWhere } from "./mobile-capture-room-join-diagnostics";
import { reconcileLiveSessionAccess, reconcileLiveKitParticipantJoin } from "./session-access-reconciliation";
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
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL).hostname)) {
    throw new Error("Coaching membership tests require a local disposable database.");
  }
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
  let roomId = "";
  let bookingId = "";
  let createdSpaceId = "";
  let createdHomeId = "";

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
      { projectId: ids.project, email: email("observer"), role: "EDITOR", status: "ACTIVE" },
      { projectId: ids.project, email: email("client"), role: "EDITOR", status: "ACTIVE" },
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
    const booking = await prisma.coachingBooking.create({ data: {
      clientUserId: ids.client, coachUserId: ids.coach, engagementId,
      scheduledStart: new Date("2026-09-10T10:00:00Z"), scheduledEnd: new Date("2026-09-10T11:00:00Z"),
    } });
    bookingId = booking.id;
    const room = await prisma.callRoom.create({ data: {
      projectId: ids.project, coachingEngagementId: engagementId, bookingId,
      createdByUserId: ids.coach, title: "Private client Session",
    } });
    roomId = room.id;
    await prisma.callParticipant.create({ data: { roomId, userId: ids.client, role: "CLIENT", displayName: "Client" } });
    await prisma.coachingEngagementMember.create({ data: {
      engagementId,
      userId: ids.observer,
      role: "OBSERVER",
      addedByUserId: ids.coach,
    } });
  });

  afterAll(async () => {
    try {
      if (createdSpaceId) await prisma.coachingEngagement.deleteMany({ where: { id: createdSpaceId } });
      if (createdHomeId) await prisma.studioProject.deleteMany({ where: { id: createdHomeId } });
      if (roomId) await prisma.callRoom.deleteMany({ where: { id: roomId } });
      if (bookingId) await prisma.coachingBooking.deleteMany({ where: { id: bookingId } });
      if (engagementId) await prisma.coachingEngagement.deleteMany({ where: { id: engagementId } });
      await prisma.studioProject.deleteMany({ where: { id: ids.project } });
      await prisma.studioWorkspace.deleteMany({ where: { id: ids.workspace } });
      await prisma.user.deleteMany({ where: { id: { in: [ids.coach, ids.client, ids.observer, ids.outsider, ids.editor, ids.viewer, ids.invitee, ids.revoked] } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("creates one private client space without a booking, preserves identity, and safely retries", async () => {
    const actor = { id: ids.coach, primaryEmail: email("coach") };
    const [first, second] = await Promise.all([
      createCoachingClientSpace({ prisma, actor, email: email("client"), name: "My client label" }),
      createCoachingClientSpace({ prisma, actor, email: email("client"), name: "My client label" }),
    ]);
    createdSpaceId = first.id;
    const saved = await prisma.coachingEngagement.findUniqueOrThrow({
      where: { id: first.id }, include: { members: true, callRooms: true, bookings: true },
    });
    createdHomeId = saved.projectId;
    expect(second.id).toBe(first.id);
    expect(saved.members.map((member) => member.userId).sort()).toEqual([ids.client, ids.coach].sort());
    expect(saved.callRooms).toHaveLength(0);
    expect(saved.bookings).toHaveLength(0);
    const context = await coachingClientSchedulingContext({ prisma, actor, engagementId: first.id });
    expect(context).toMatchObject({ engagementId: first.id, coachUserId: ids.coach, clientEmail: email("client"), clientName: "Client" });
    await expect(coachingClientSchedulingContext({ prisma, actor: { id: ids.outsider }, engagementId: first.id })).rejects.toMatchObject({ status: 404 });
    await expect(coachingClientSchedulingContext({ prisma, actor: { id: ids.client }, engagementId: first.id })).rejects.toMatchObject({ status: 404 });
    expect(await prisma.user.findUnique({ where: { id: ids.client }, select: { name: true, emailVerified: true } })).toEqual({ name: "Client", emailVerified: null });
    for (const userId of [ids.client, ids.coach]) {
      expect(await prisma.coachingEngagement.findFirst({ where: coachingEngagementAccessWhere(first.id, { id: userId }, "read") })).not.toBeNull();
    }
    expect(await prisma.coachingEngagement.findFirst({ where: coachingEngagementAccessWhere(first.id, { id: ids.outsider }, "read") })).toBeNull();
  });

  it("disconnects removed space members, retries provider outages, rejects token reuse, and preserves other spaces and restoration", async () => {
    const environment = { ...process.env };
    const spaces: string[] = [];
    const rooms: string[] = [];
    const makeSpace = async () => {
      const space = await prisma.coachingEngagement.create({ data: {
        projectId: ids.project, title: "Synthetic call access rehearsal",
        members: { create: [{ userId: ids.coach, role: "COACH" }, { userId: ids.client, role: "CLIENT" }] },
      } });
      spaces.push(space.id);
      const room = await prisma.callRoom.create({ data: {
        projectId: ids.project, coachingEngagementId: space.id, title: "Synthetic call",
        createdByUserId: ids.coach, provider: "livekit", providerRoomId: `test-${randomUUID()}`,
        participants: { create: [{ userId: ids.client, role: "CLIENT" }, { userId: ids.coach, role: "COACH" }] },
      }, include: { participants: true } });
      rooms.push(room.id);
      return { space, room, client: room.participants.find(p => p.userId === ids.client)! };
    };
    try {
      const first = await makeSpace();
      const second = await makeSpace();
      const member = await prisma.coachingEngagementMember.findUniqueOrThrow({ where: {
        engagementId_userId: { engagementId: first.space.id, userId: ids.client },
      } });
      const active = new Map([
        [first.room.providerRoomId!, new Set([`${first.client.id}:web`, `${first.client.id}:ios`, "unrelated-device"])],
        [second.room.providerRoomId!, new Set([`${second.client.id}:web`])],
      ]);
      for (const suffix of ["web", "ios"]) await prisma.callParticipantProviderGrantReceipt.create({ data: {
        roomId: first.room.id, participantId: first.client.id, tokenJti: randomUUID(),
        providerIdentity: `${first.client.id}:${suffix}`, providerRoomId: first.room.providerRoomId!,
        clientKind: suffix, issuedAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 60_000),
      } });
      const removeParticipant = jest.fn(async (room: string, identity: string) => { active.get(room)?.delete(identity); });
      const listParticipants = jest.fn(async (room: string) => [...active.get(room) ?? []].map(identity => ({ identity })));
      listParticipants.mockRejectedValueOnce(new Error("Synthetic provider outage"));
      jest.mocked(RoomServiceClient).mockImplementation(() => ({
        listRooms: jest.fn(async () => [...active.keys()].map(name => ({ name }))),
        listParticipants, removeParticipant,
      }) as unknown as RoomServiceClient);
      process.env.LIVEKIT_URL = "wss://synthetic.livekit.cloud";
      process.env.LIVEKIT_API_KEY = "synthetic-key";
      process.env.LIVEKIT_API_SECRET = "synthetic-secret";
      const request = { prisma, engagementId: first.space.id, memberId: member.id,
        actor: { id: ids.coach }, action: "REMOVE" as const, expectedRevision: 0, requestId: randomUUID() };
      await expect(changeCoachingEngagementMemberAccess({ ...request, actor: { id: ids.outsider } })).rejects.toMatchObject({ status: 404 });
      expect(listParticipants).not.toHaveBeenCalled();
      const removed = await changeCoachingEngagementMemberAccess(request);
      expect(removed.calls).toMatchObject({ pending: true });
      expect(await prisma.callRoom.findFirst({ where: captureRoomAccessWhere(first.room.id, { id: ids.client }) })).toBeNull();
      expect(await prisma.callParticipant.findUnique({ where: { id: first.client.id } })).toMatchObject({ accessStatus: "ACTIVE", providerAccessStatus: "FAILED" });
      expect(active.get(first.room.providerRoomId!)!.size).toBe(3);

      expect(await reconcileLiveSessionAccess({ prisma })).toMatchObject({ failed: 0, deferred: 0 });
      expect(active.get(first.room.providerRoomId!)).toEqual(new Set(["unrelated-device"]));
      expect(active.get(second.room.providerRoomId!)).toEqual(new Set([`${second.client.id}:web`]));
      expect(await prisma.callParticipantProviderGrantReceipt.count({ where: { participantId: first.client.id } })).toBe(2);
      expect(await prisma.callParticipant.findUnique({ where: { id: first.client.id } })).toMatchObject({ accessStatus: "ACTIVE", providerAccessStatus: "CONVERGED" });
      expect(await prisma.callParticipantAccessReceipt.count({ where: { participantId: first.client.id, action: "PROVIDER_RECONCILE" } })).toBe(2);

      const joined = { eventId: randomUUID(), eventType: "participant_joined", createdAt: null, egress: null,
        raw: { room: { name: first.room.providerRoomId }, participant: { identity: `${first.client.id}:web` } } };
      active.get(first.room.providerRoomId!)!.add(`${first.client.id}:web`);
      expect(await reconcileLiveKitParticipantJoin(joined, prisma)).toMatchObject({ status: "CONVERGED" });
      expect(active.get(first.room.providerRoomId!)!.has(`${first.client.id}:web`)).toBe(false);

      await changeCoachingEngagementMemberAccess({ ...request, action: "RESTORE", expectedRevision: 1, requestId: randomUUID() });
      active.get(first.room.providerRoomId!)!.add(`${first.client.id}:web`);
      const callsBeforeRestoreReadback = removeParticipant.mock.calls.length;
      expect(await reconcileLiveKitParticipantJoin(joined, prisma)).toEqual({ status: "NOT_REQUIRED" });
      expect(await changeCoachingEngagementMemberAccess(request)).toMatchObject({ replayed: true, member: { status: "ACTIVE" } });
      expect(removeParticipant.mock.calls).toHaveLength(callsBeforeRestoreReadback);
      expect(await prisma.callRoom.findFirst({ where: captureRoomAccessWhere(first.room.id, { id: ids.client }) })).not.toBeNull();
    } finally {
      process.env = environment;
      await prisma.callRoom.deleteMany({ where: { id: { in: rooms } } });
      await prisma.coachingEngagement.deleteMany({ where: { id: { in: spaces } } });
    }
  });

  it("rejects client-space creation by a non-coach and rejects self-coaching", async () => {
    await expect(createCoachingClientSpace({ prisma, actor: { id: ids.outsider }, email: email("client") })).rejects.toMatchObject({ status: 403 });
    await expect(createCoachingClientSpace({ prisma, actor: { id: ids.coach }, email: email("coach") })).rejects.toMatchObject({ status: 400 });
    await expect(createCoachingClientSpace({ prisma, actor: { id: ids.coach }, email: "not-an-email" })).rejects.toMatchObject({ status: 400 });
  });

  it("returns a normal space link for an existing member without changing access", async () => {
    const before = await prisma.coachingEngagementMember.findUniqueOrThrow({ where: { engagementId_userId: { engagementId: createdSpaceId, userId: ids.client } } });
    const result = await inviteCoachingEngagementMember({ prisma, engagementId: createdSpaceId,
      actor: { id: ids.coach }, email: email("client"), role: "COACH",
      requestId: randomUUID(), origin: "http://127.0.0.1:3012" });
    expect(result).toMatchObject({ alreadyMember: true, invitation: null, delivered: false,
      invitationPath: `/coaching/engagements/${createdSpaceId}` });
    expect(await prisma.coachingEngagementMember.findUnique({ where: { id: before.id } })).toEqual(before);
    expect(await prisma.coachingEngagementInvitation.count({ where: { engagementId: createdSpaceId } })).toBe(0);
    expect(await prisma.coachingEngagementMemberReceipt.count({ where: { engagementId: createdSpaceId } })).toBe(0);
    await expect(inviteCoachingEngagementMember({ prisma, engagementId: createdSpaceId,
      actor: { id: ids.outsider }, email: email("client"), role: "CLIENT", requestId: randomUUID(),
      origin: "http://127.0.0.1:3012" })).rejects.toMatchObject({ status: 404 });
  });

  it.each(["INVITE", "REMOVE", "RESTORE", "REVOKE_INVITE"] as const)(
    "rejects %s when the manager is removed after preflight but before the write transaction",
    async (action) => {
      const secret = process.env.AUTH_SECRET;
      process.env.AUTH_SECRET = "integration-only-membership-race-secret-1234567890";
      const space = await prisma.coachingEngagement.create({ data: {
        projectId: ids.project, title: `Membership race ${action}`,
        createdByUserId: ids.coach, primaryCoachUserId: ids.coach,
        primaryClientUserId: ids.client,
        members: { create: [
          { userId: ids.coach, role: "COACH", status: "ACTIVE" },
          { userId: ids.client, role: "CLIENT", status: action === "RESTORE" ? "REMOVED" : "ACTIVE" },
        ] },
      }, include: { members: true } });
      const actor = { id: ids.coach, primaryEmail: email("coach") };
      const target = space.members.find(member => member.userId === ids.client)!;
      const manager = space.members.find(member => member.userId === ids.coach)!;
      const requestId = randomUUID();
      try {
        const invitation = action === "REVOKE_INVITE"
          ? await inviteCoachingEngagementMember({ prisma, engagementId: space.id, actor,
            email: email("invitee"), role: "OBSERVER", requestId: randomUUID(), origin: "http://127.0.0.1:3012" })
          : null;
        const beforeInvites = await prisma.coachingEngagementInvitation.findMany({ where: { engagementId: space.id } });
        let crossedBoundary = false;
        // Real database interleaving: preflight passes, then revocation commits
        // before the mutation transaction starts. No query results are mocked.
        const interleaved = new Proxy(prisma, { get(client, key) {
          if (key !== "$transaction") return Reflect.get(client, key);
          return async (callback: (tx: any) => Promise<unknown>, options: any) => {
            crossedBoundary = true;
            await prisma.coachingEngagementMember.update({ where: { id: manager.id },
              data: { status: "REMOVED", accessRevision: { increment: 1 } } });
            return prisma.$transaction(callback, options);
          };
        } });
        const operation = action === "INVITE"
          ? inviteCoachingEngagementMember({ prisma: interleaved, engagementId: space.id, actor,
            email: email("invitee"), role: "OBSERVER", requestId, origin: "http://127.0.0.1:3012" })
          : action === "REVOKE_INVITE"
            ? revokeCoachingEngagementInvitation({ prisma: interleaved, engagementId: space.id, actor,
              invitationId: invitation!.invitation!.id, requestId })
            : changeCoachingEngagementMemberAccess({ prisma: interleaved, engagementId: space.id, actor,
              memberId: target.id, action, expectedRevision: target.accessRevision, requestId });
        await expect(operation).rejects.toMatchObject({ code: "ACCESS_CHANGED", status: 403 });
        expect(crossedBoundary).toBe(true);
        expect(await prisma.coachingEngagementMember.findUnique({ where: { id: target.id } })).toEqual(target);
        expect(await prisma.coachingEngagementInvitation.findMany({ where: { engagementId: space.id } })).toEqual(beforeInvites);
        expect(await prisma.coachingEngagementMemberReceipt.count({ where: { requestId } })).toBe(0);
      } finally {
        await prisma.coachingEngagement.delete({ where: { id: space.id } });
        if (secret === undefined) delete process.env.AUTH_SECRET;
        else process.env.AUTH_SECRET = secret;
      }
    },
  );

  it("admits coach/client but does not inherit Nest editor or viewer access", async () => {
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
    expect(editor).toBeNull();
    expect(outsider).toBeNull();
    expect(viewer).toBeNull();
  });

  it("does not let Nest owners or editors read, edit, or invite into private client spaces or Sessions", async () => {
    const actor = { id: ids.editor, primaryEmail: email("editor") };
    for (const role of ["OWNER", "EDITOR"] as const) {
      await prisma.studioProjectAccessGrant.update({ where: { projectId_email: { projectId: ids.project, email: email("editor") } }, data: { role } });
      for (const action of ["read", "write", "manage"] as const) {
        await expect(prisma.coachingEngagement.findFirst({ where: coachingEngagementAccessWhere(engagementId, actor, action) })).resolves.toBeNull();
      }
      for (const boundary of [sessionAccessWhere, sessionConversationAccessWhere, sessionMutationAccessWhere, sessionInvitationAccessWhere, captureRoomAccessWhere]) {
        await expect(prisma.callRoom.findFirst({ where: boundary(roomId, actor) })).resolves.toBeNull();
      }
    }
    await expect(inviteCoachingEngagementMember({
      engagementId, actor, email: email("outsider"), role: "OBSERVER", requestId: randomUUID(),
      origin: "http://127.0.0.1:3012", prisma,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("carries space membership into Sessions without granting observers write or invite access", async () => {
    for (const person of ["coach", "client", "observer"] as const) {
      const actor = { id: ids[person], primaryEmail: email(person) };
      await expect(prisma.callRoom.findFirst({ where: sessionAccessWhere(roomId, actor), select: { id: true } })).resolves.toEqual({ id: roomId });
      await expect(prisma.callRoom.findFirst({ where: sessionConversationAccessWhere(roomId, actor), select: { id: true } })).resolves.toEqual({ id: roomId });
      const mutation = await prisma.callRoom.findFirst({ where: sessionMutationAccessWhere(roomId, actor), select: { id: true } });
      expect(mutation).toEqual(person === "observer" ? null : { id: roomId });
      const invitation = await prisma.callRoom.findFirst({ where: sessionInvitationAccessWhere(roomId, actor), select: { id: true } });
      expect(invitation).toEqual(person === "coach" ? { id: roomId } : null);
      const join = await prisma.callRoom.findFirst({ where: captureRoomAccessWhere(roomId, actor), select: { id: true } });
      expect(join).toEqual(person === "observer" ? null : { id: roomId });
    }
    await expect(prisma.coachingEngagement.findFirst({
      where: coachingEngagementAccessWhere(engagementId, { id: ids.client, primaryEmail: "changed@example.test" }), select: { id: true },
    })).resolves.toEqual({ id: engagementId });
  });

  it("allows an explicitly invited Session guest without exposing the whole client relationship", async () => {
    const actor = { id: ids.outsider, primaryEmail: email("outsider") };
    const guest = await prisma.callParticipant.create({ data: { roomId, userId: ids.outsider, role: "GUEST", displayName: "Session guest" } });
    try {
      await expect(prisma.callRoom.findFirst({ where: sessionAccessWhere(roomId, actor), select: { id: true } })).resolves.toEqual({ id: roomId });
      await expect(prisma.callRoom.findFirst({ where: captureRoomAccessWhere(roomId, actor), select: { id: true } })).resolves.toEqual({ id: roomId });
      await expect(prisma.callRoom.findFirst({ where: sessionMutationAccessWhere(roomId, actor), select: { id: true } })).resolves.toEqual({ id: roomId });
      await expect(prisma.callRoom.findFirst({ where: sessionInvitationAccessWhere(roomId, actor) })).resolves.toBeNull();
      await expect(prisma.coachingEngagement.findFirst({ where: coachingEngagementAccessWhere(engagementId, actor) })).resolves.toBeNull();
      await prisma.callParticipant.update({ where: { id: guest.id }, data: { accessStatus: "REMOVED" } });
      await expect(prisma.callRoom.findFirst({ where: sessionAccessWhere(roomId, actor) })).resolves.toBeNull();
    } finally {
      await prisma.callParticipant.delete({ where: { id: guest.id } });
    }
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
    for (const boundary of [sessionAccessWhere, sessionConversationAccessWhere, sessionMutationAccessWhere, sessionInvitationAccessWhere, captureRoomAccessWhere]) {
      await expect(prisma.callRoom.findFirst({ where: boundary(roomId, { id: ids.client, primaryEmail: email("client") }) })).resolves.toBeNull();
    }
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
    const recovered = await inviteCoachingEngagementMember({ engagementId, actor: coach,
      email: email("invitee"), role: "COACH", requestId: randomUUID(),
      origin: "http://127.0.0.1:3012", prisma });
    expect(recovered).toMatchObject({ replayed: true, delivered: false,
      invitationUrl: invited.invitationUrl, invitation: { role: "CLIENT", status: "PENDING" } });
    expect(await prisma.coachingEngagementInvitation.count({ where: { engagementId, invitedUserId: ids.invitee } })).toBe(1);
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
      invitationId: revokedInvite.invitation!.id,
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
