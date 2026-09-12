/** @jest-environment node */
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/subscription-entitlements", () => ({ quipslyCoachCapabilityAccess: jest.fn(async () => ({ allowed: true })) }));
jest.mock("@/lib/server/transactional-email-worker", () => {
  const actual = jest.requireActual("@/lib/server/transactional-email-worker");
  return {...actual, queueCoachingRescheduleEmail: jest.fn(actual.queueCoachingRescheduleEmail)};
});

import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { ensureCoachingEngagement } from "@/lib/server/coaching-engagement";
import { homeNestSlugForEmail } from "@/lib/server/home-nest";
import { GET, POST } from "./route";
import { GET as calendarGET } from "../bookings/[bookingId]/calendar/route";
import * as emailQueue from "@/lib/server/transactional-email-worker";

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const target = process.env.QUIPSLY_LOCAL_DATABASE_URL;
  if (!target || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(target).hostname)) {
    throw new Error("Booking workflow tests require an explicit disposable local database.");
  }
  process.env.DATABASE_URL = target;
}

(enabled ? describe : describe.skip)("client-space scheduling through the real application endpoint", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const coach = { id: `schedule-coach-${nonce}`, primaryEmail: `schedule-coach-${nonce}@example.test`, name: "Coach" };
  const client = { id: `schedule-client-${nonce}`, primaryEmail: `schedule-client-${nonce}@example.test`, name: "Client" };
  const outsider = { id: `schedule-outsider-${nonce}`, primaryEmail: `schedule-outsider-${nonce}@example.test`, name: "Other coach" };
  const workspaceId = `schedule-workspace-${nonce}`;
  const projectId = `schedule-project-${nonce}`;
  let engagementId = "";
  let offset = 0;

  async function act(body: Record<string, unknown>, actor = coach) {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: actor } as never);
    const response = await POST(new Request("http://localhost/api/coaching/runway", {
      method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
    }));
    return { status: response.status, body: await response.json() };
  }

  async function hold() {
    // Different future days keep tests independent without consulting a cloud calendar.
    const scheduledStart = new Date(Date.now() + (++offset + 2) * 86_400_000).toISOString();
    const result = await act({ action: "create-booking-hold", engagementId,
      clientEmail: "untrusted-body@example.test", projectSlug: "untrusted-project",
      title: "Prepare together", notes: "Questions prepared in the shared space.", scheduledStart, durationMinutes: 60, timezone: "UTC", purpose: "COACHING" });
    expect(result).toMatchObject({ status: 200, body: { ok: true } });
    return result.body.result.holdId as string;
  }

  beforeAll(async () => {
    await prisma.user.createMany({ data: [coach, client, outsider] });
    await prisma.coachProfile.createMany({ data: [{ userId: coach.id, isActive: true }, { userId: outsider.id, isActive: true }] });
    await prisma.studioWorkspace.create({ data: { id: workspaceId, slug: workspaceId, name: "Scheduling QA" } });
    await prisma.studioProject.create({ data: { id: projectId, workspaceId, slug: projectId, name: "Client work outside Home Nest" } });
    const engagement = await prisma.$transaction((tx) => ensureCoachingEngagement({ prisma: tx,
      projectId, actorUserId: coach.id, coachUserId: coach.id, clientUserId: client.id, clientLabel: client.name }));
    engagementId = engagement.id;
  });

  afterAll(async () => {
    try {
      await prisma.bookingHold.deleteMany({ where: { coachProfile: { userId: coach.id } } });
      await prisma.callRoom.deleteMany({ where: { projectId } });
      await prisma.coachingBooking.deleteMany({ where: { coachUserId: coach.id } });
      await prisma.appointment.deleteMany({ where: { coachUserId: coach.id } });
      await prisma.coachingEngagement.deleteMany({ where: { id: engagementId } });
      await prisma.studioProject.deleteMany({ where: { id: projectId } });
      await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      await prisma.user.deleteMany({ where: { id: { in: [coach.id, client.id, outsider.id] } } });
    } finally { await prisma.$disconnect(); }
  });

  it("keeps held time, booking, room, and participant identities in the original space", async () => {
    const holdId = await hold();
    const saved = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(saved).toMatchObject({ clientUserId: client.id, contactEmail: client.primaryEmail,
      metadataJson: { engagementId, projectSlug: projectId, purpose: "COACHING", externalInviteSent: false } });
    const [result, concurrent] = await Promise.all([
      act({ action: "convert-booking-hold", holdId }),
      act({ action: "convert-booking-hold", holdId }),
    ]);
    expect(result).toMatchObject({ status: 200, body: { ok: true, result: { engagementId, clientUserId: client.id } } });
    expect(concurrent).toMatchObject({ status: 200, body: { result: {
      bookingId: result.body.result.bookingId, callRoomId: result.body.result.callRoomId, engagementId,
    } } });
    const booking = await prisma.coachingBooking.findUniqueOrThrow({ where: { id: result.body.result.bookingId } });
    expect(booking).toMatchObject({ coachUserId: coach.id, clientUserId: client.id, engagementId, notes: "Questions prepared in the shared space." });
    const room = await prisma.callRoom.findUniqueOrThrow({ where: { id: result.body.result.callRoomId }, include: { participants: true } });
    expect(room).toMatchObject({ projectId, coachingEngagementId: engagementId, bookingId: booking.id, purpose: "COACHING", status: "PLANNED" });
    expect(room.participants.map((person) => person.userId).sort()).toEqual([coach.id, client.id].sort());
    const replay = await act({ action: "convert-booking-hold", holdId });
    expect(replay).toMatchObject({ status: 200, body: { result: { bookingId: booking.id, callRoomId: room.id, engagementId, replayed: true } } });
    expect(await prisma.coachingBooking.count({ where: { coachUserId: coach.id } })).toBe(1);
  });

  it("rejects another coach before creating a Nest or touching the hold", async () => {
    const holdId = await hold();
    expect((await act({ action: "convert-booking-hold", holdId }, outsider)).status).toBe(403);
    expect(await prisma.bookingHold.findUnique({ where: { id: holdId } })).toMatchObject({ status: "ACTIVE", convertedBookingId: null });
    expect(await prisma.studioProject.findFirst({ where: { slug: homeNestSlugForEmail(outsider.primaryEmail) } })).toBeNull();
  });

  it("atomically queues one client update for a reschedule and does not duplicate it on replay", async () => {
    const converted = await act({action: "convert-booking-hold", holdId: await hold()});
    const id = converted.body.result.bookingId;
    const scheduledStart = new Date(Date.now() + (++offset + 20) * 86_400_000).toISOString();
    const command = {action: "reschedule-booking", bookingId: id, scheduledStart, durationMinutes: 60, timezone: "UTC", notifyClient: true};
    expect((await act(command, outsider)).status).toBe(403);
    const [first, replay] = await Promise.all([act(command), act(command)]);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    const queued = await prisma.transactionalEmail.findMany({where: {bookingId: id, kind: "BOOKING_RESCHEDULED"}});
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({status: "PLANNED", recipientUserId: client.id, recipientEmail: client.primaryEmail, recipientRole: "CLIENT", attemptCount: 0});
    expect((await prisma.coachingBooking.findUniqueOrThrow({where: {id}})).scheduledStart.toISOString()).toBe(scheduledStart);
    expect((await prisma.callRoom.findUniqueOrThrow({where: {bookingId: id}})).scheduledStart?.toISOString()).toBe(scheduledStart);

    const laterStart = new Date(Date.parse(scheduledStart) + 86_400_000).toISOString();
    const failure = jest.mocked(emailQueue.queueCoachingRescheduleEmail).mockRejectedValueOnce(new Error("Injected delivery queue write failure"));
    try {
      expect((await act({...command, scheduledStart: laterStart})).status).toBeGreaterThanOrEqual(400);
      expect((await prisma.coachingBooking.findUniqueOrThrow({where: {id}})).scheduledStart.toISOString()).toBe(scheduledStart);
      expect((await prisma.callRoom.findUniqueOrThrow({where: {bookingId: id}})).scheduledStart?.toISOString()).toBe(scheduledStart);
    } finally { failure.mockImplementation(jest.requireActual("@/lib/server/transactional-email-worker").queueCoachingRescheduleEmail); }
    expect((await act({...command, scheduledStart: laterStart, notifyClient: false})).status).toBe(200);
    expect(await prisma.transactionalEmail.count({where: {bookingId: id}})).toBe(1);
  });

  it("rechecks space membership instead of treating a held-time ID as access", async () => {
    const holdId = await hold();
    await prisma.coachingEngagementMember.updateMany({ where: { engagementId, userId: coach.id }, data: { status: "REMOVED" } });
    try {
      expect((await act({ action: "convert-booking-hold", holdId })).status).toBe(404);
      expect(await prisma.bookingHold.findUnique({ where: { id: holdId } })).toMatchObject({ status: "ACTIVE", convertedBookingId: null });
    } finally {
      await prisma.coachingEngagementMember.updateMany({ where: { engagementId, userId: coach.id }, data: { status: "ACTIVE" } });
    }
  });

  it("revokes overview and calendar reads despite retained booking and room identities", async () => {
    const converted = await act({ action: "convert-booking-hold", holdId: await hold() });
    const bookingId = converted.body.result.bookingId;
    const roomId = converted.body.result.callRoomId;
    async function read(actor = client) {
      jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
        user: { ...actor, isStaff: false, roles: [actor.id === client.id ? "CLIENT" : "COACH"] },
      } as never);
      const overview = await GET(new Request("http://localhost/api/coaching/runway"));
      expect(overview.status).toBe(200);
      const body = await overview.json();
      const calendar = await calendarGET(new Request(`http://localhost/api/coaching/bookings/${bookingId}/calendar`), {
        params: Promise.resolve({ bookingId }),
      });
      const visible = body.upcomingBookings.some((booking: {id: string}) => booking.id === bookingId);
      expect(body.captureRooms.some((room: {id: string}) => room.id === roomId)).toBe(visible);
      return { visible, calendar };
    }
    expect(await read()).toMatchObject({ visible: true, calendar: { status: 200 } });
    expect(await read(outsider)).toMatchObject({ visible: false, calendar: { status: 404 } });
    await prisma.coachingEngagementMember.updateMany({ where: { engagementId, userId: client.id }, data: { status: "REMOVED" } });
    try {
      expect(await read()).toMatchObject({ visible: false, calendar: { status: 404 } });
      expect(await read(coach)).toMatchObject({ visible: true, calendar: { status: 200 } });
    } finally {
      await prisma.coachingEngagementMember.updateMany({ where: { engagementId, userId: client.id }, data: { status: "ACTIVE" } });
    }
    await prisma.callParticipant.updateMany({ where: { roomId, userId: client.id }, data: { accessStatus: "REMOVED" } });
    try {
      expect(await read()).toMatchObject({ visible: false, calendar: { status: 404 } });
      expect(await read(coach)).toMatchObject({ visible: true, calendar: { status: 200 } });
    } finally {
      await prisma.callParticipant.updateMany({ where: { roomId, userId: client.id }, data: { accessStatus: "ACTIVE" } });
    }
    expect(await read()).toMatchObject({ visible: true, calendar: { status: 200 } });
    expect(await prisma.coachingBooking.findUnique({ where: { id: bookingId } })).toMatchObject({ clientUserId: client.id });
  });

  it("does not silently move reserved time to a different space", async () => {
    const holdId = await hold();
    expect((await act({ action: "convert-booking-hold", holdId, engagementId: "another-space" })).status).toBe(409);
    expect(await prisma.bookingHold.findUnique({ where: { id: holdId } })).toMatchObject({ status: "ACTIVE", convertedBookingId: null });
  });

  it("returns not found without manufacturing a Home Nest", async () => {
    expect((await act({ action: "convert-booking-hold", holdId: `missing-${nonce}` })).status).toBe(404);
    expect(await prisma.studioProject.findFirst({ where: { slug: homeNestSlugForEmail(coach.primaryEmail) } })).toBeNull();
  });
});
