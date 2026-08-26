import { loadCoachingPracticeCommandForActor } from "./coaching-practice-command";

const NOW = new Date("2026-08-26T18:00:00.000Z");

function prismaFixture({ coach = true } = {}) {
  return {
    coachProfile: {
      findFirst: jest
        .fn()
        .mockResolvedValue(coach ? { id: "coach-profile-1" } : null),
    },
    coachingBooking: { findMany: jest.fn().mockResolvedValue([]) },
    bookingHold: { findMany: jest.fn().mockResolvedValue([]) },
    callRoom: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe("loadCoachingPracticeCommandForActor", () => {
  it("fails closed before loading practice records for a non-coach", async () => {
    const prisma = prismaFixture({ coach: false });

    await expect(
      loadCoachingPracticeCommandForActor({
        prisma,
        userId: "client-1",
        now: NOW,
      }),
    ).resolves.toBeNull();
    expect(prisma.coachProfile.findFirst).toHaveBeenCalledWith({
      where: { userId: "client-1", isActive: true },
      select: { id: true },
    });
    expect(prisma.coachingBooking.findMany).not.toHaveBeenCalled();
    expect(prisma.bookingHold.findMany).not.toHaveBeenCalled();
    expect(prisma.callRoom.findMany).not.toHaveBeenCalled();
  });

  it("projects only the exact coach's bounded Session evidence", async () => {
    const prisma = prismaFixture();
    prisma.coachingBooking.findMany.mockResolvedValue([
      {
        id: "booking-1",
        status: "CONFIRMED",
        scheduledStart: new Date("2026-08-27T17:00:00.000Z"),
        scheduledEnd: new Date("2026-08-27T18:00:00.000Z"),
        engagementId: "engagement-1",
        clientUser: { name: "Ada", primaryEmail: "ada@example.test" },
        offering: { title: "Coaching Session" },
        sessionPreparation: {
          clientSubmittedAt: NOW,
          coachPreparedAt: null,
        },
        callRoom: {
          id: "room-1",
          title: "Ada's Session",
          status: "PLANNED",
          coachingEngagementId: "engagement-1",
        },
      },
    ]);
    prisma.bookingHold.findMany.mockResolvedValue([
      {
        id: "request-1",
        status: "ACTIVE",
        expiresAt: new Date("2026-08-27T18:00:00.000Z"),
        scheduledStart: new Date("2026-08-28T17:00:00.000Z"),
        scheduledEnd: new Date("2026-08-28T18:00:00.000Z"),
        contactEmail: "grace@example.test",
        clientUser: { name: "Grace", primaryEmail: "grace@example.test" },
        offering: { title: "Coaching Session" },
      },
    ]);
    prisma.callRoom.findMany.mockResolvedValue([
      {
        id: "room-live",
        bookingId: "booking-live",
        coachingEngagementId: "engagement-live",
        title: "Live Session",
        status: "OPEN",
        scheduledStart: NOW,
        endedAt: null,
        booking: {
          engagementId: "engagement-live",
          clientUser: { name: "Homer", primaryEmail: "homer@example.test" },
        },
        recordingAssets: [],
        providerRecordingCommands: [],
        transcriptJobs: [],
        notes: [],
        outputs: [],
      },
    ]);

    const command = await loadCoachingPracticeCommandForActor({
      prisma,
      userId: "coach-1",
      now: NOW,
    });

    expect(command?.items.map((item) => item.kind)).toEqual([
      "JOIN_LIVE_SESSION",
      "REVIEW_TIME_REQUEST",
      "PREPARE_SESSION",
    ]);
    expect(command?.items[0]).toMatchObject({
      roomId: "room-live",
      engagementId: "engagement-live",
      href: "/sessions/room-live?mode=live",
    });
    expect(command?.deterministic).toBe(true);
    expect(command?.externalSideEffects).toBe(false);

    expect(prisma.coachingBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ coachUserId: "coach-1" }),
        take: 40,
      }),
    );
    expect(prisma.bookingHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ coachProfileId: "coach-profile-1" }),
        take: 30,
      }),
    );
    expect(prisma.callRoom.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ booking: { coachUserId: "coach-1" } }),
        take: 30,
      }),
    );
  });
});
