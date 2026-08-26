import {
  buildQuipslyCoachingPracticeCommand,
  QUIPSLY_COACHING_PRACTICE_COMMAND_SCHEMA,
} from "@high-ground/quipsly-domain/coaching-practice-command";

const NOW = "2026-08-26T18:00:00.000Z";

describe("buildQuipslyCoachingPracticeCommand", () => {
  it("orders live, client requests, repair, follow-up, and preparation deterministically", () => {
    const command = buildQuipslyCoachingPracticeCommand({
      now: NOW,
      bookings: [
        {
          id: "booking-prep",
          title: "Coaching Session",
          status: "CONFIRMED",
          scheduledStart: "2026-08-27T16:00:00.000Z",
          roomId: "room-prep",
          clientLabel: "Ada",
          clientCheckInSubmittedAt: NOW,
        },
      ],
      timeRequests: [
        {
          id: "request-one",
          status: "ACTIVE",
          expiresAt: "2026-08-26T19:00:00.000Z",
          scheduledStart: "2026-08-28T18:00:00.000Z",
          clientLabel: "Grace",
        },
      ],
      rooms: [
        {
          id: "room-live",
          title: "Live",
          status: "RECORDING",
          clientLabel: "Homer",
          recordingCount: 1,
        },
        {
          id: "room-bad-audio",
          title: "Repair",
          status: "ENDED",
          clientLabel: "Lin",
          recordingCount: 1,
          recordingStatus: "FAILED",
        },
        {
          id: "room-follow-up",
          title: "Follow-up",
          status: "ENDED",
          clientLabel: "Katherine",
          recordingCount: 2,
          transcriptStatus: "COMPLETED",
          packetStatus: "NOT_STARTED",
        },
        {
          id: "room-prep",
          title: "Prep",
          status: "PLANNED",
          clientLabel: "Ada",
          recordingCount: 0,
        },
      ],
    });

    expect(command.schema).toBe(QUIPSLY_COACHING_PRACTICE_COMMAND_SCHEMA);
    expect(command.items.map((candidate) => candidate.kind)).toEqual([
      "JOIN_LIVE_SESSION",
      "REVIEW_TIME_REQUEST",
      "REPAIR_RECORDING",
      "REVIEW_FOLLOW_UP",
      "PREPARE_SESSION",
    ]);
    expect(command.counts).toMatchObject({
      live: 1,
      requests: 1,
      attention: 2,
      prepare: 1,
      followUp: 1,
    });
    expect(command.externalSideEffects).toBe(false);
  });

  it("does not call a released follow-up or completed preparation unfinished", () => {
    const command = buildQuipslyCoachingPracticeCommand({
      now: NOW,
      bookings: [
        {
          id: "prepared",
          title: "Prepared Session",
          status: "CONFIRMED",
          scheduledStart: "2026-08-27T14:00:00.000Z",
          roomId: "prepared-room",
          coachPreparedAt: NOW,
        },
      ],
      timeRequests: [],
      rooms: [
        {
          id: "prepared-room",
          title: "Prepared Session",
          status: "PLANNED",
          recordingCount: 0,
        },
        {
          id: "released-room",
          title: "Released",
          status: "ENDED",
          recordingCount: 1,
          transcriptStatus: "COMPLETED",
          packetStatus: "READY_FOR_REVIEW",
          followUpReleased: true,
        },
      ],
    });

    expect(command.allCaughtUp).toBe(true);
    expect(command.items).toHaveLength(1);
    expect(command.items[0]).toMatchObject({
      kind: "OPEN_NEXT_SESSION",
      bookingId: "prepared",
    });
  });

  it("ignores expired requests and caps a noisy practice without changing priority", () => {
    const command = buildQuipslyCoachingPracticeCommand({
      now: NOW,
      maxItems: 2,
      bookings: [],
      timeRequests: [
        {
          id: "expired",
          status: "ACTIVE",
          expiresAt: "2026-08-26T17:59:59.000Z",
          scheduledStart: "2026-08-27T18:00:00.000Z",
        },
      ],
      rooms: ["b", "a", "c"].map((id) => ({
        id,
        title: id,
        status: "OPEN",
        scheduledStart: NOW,
        recordingCount: 0,
      })),
    });

    expect(command.items.map((candidate) => candidate.roomId)).toEqual(["a", "b"]);
    expect(command.counts.live).toBe(3);
    expect(command.counts.requests).toBe(0);
  });

  it("fails closed on an invalid time-sensitive clock", () => {
    expect(() =>
      buildQuipslyCoachingPracticeCommand({
        now: "sometime",
        bookings: [],
        timeRequests: [],
        rooms: [],
      }),
    ).toThrow("A valid practice command clock is required.");
  });
});
