import {
  chooseQuipslyCoachingClientPriority,
  QUIPSLY_COACHING_CLIENT_PRIORITY_SCHEMA,
} from "@high-ground/quipsly-domain/coaching-client-priority";

const NOW = "2026-08-25T18:00:00.000Z";

function room(
  id: string,
  status: string,
  scheduledStart: string | null,
  extras: Partial<{
    recordingCount: number;
    followUpReleased: boolean;
    endedAt: string;
  }> = {},
) {
  return { id, title: id, status, scheduledStart, ...extras };
}

describe("chooseQuipslyCoachingClientPriority", () => {
  it("puts a live Session ahead of every administrative or follow-up signal", () => {
    const priority = chooseQuipslyCoachingClientPriority({
      now: NOW,
      viewerRole: "COACH",
      overdueCommitmentCount: 4,
      rooms: [
        room("old-follow-up", "ENDED", "2026-08-20T18:00:00.000Z", {
          recordingCount: 1,
        }),
        room("live-room", "RECORDING", "2026-08-25T18:00:00.000Z"),
      ],
    });

    expect(priority).toMatchObject({
      schema: QUIPSLY_COACHING_CLIENT_PRIORITY_SCHEMA,
      kind: "JOIN_LIVE_SESSION",
      roomId: "live-room",
      rank: 0,
      deterministic: true,
      externalSideEffects: false,
    });
  });

  it("surfaces a missed planned Session before creating more work", () => {
    expect(
      chooseQuipslyCoachingClientPriority({
        now: NOW,
        viewerRole: "CLIENT",
        overdueCommitmentCount: 2,
        rooms: [
          room("late-room", "PLANNED", "2026-08-25T17:00:00.000Z"),
          room("future-room", "PLANNED", "2026-08-27T18:00:00.000Z"),
        ],
      }),
    ).toMatchObject({
      kind: "REVIEW_LATE_SESSION",
      roomId: "late-room",
      tone: "attention",
    });
  });

  it("puts a Session within 24 hours ahead of older coach follow-up", () => {
    expect(
      chooseQuipslyCoachingClientPriority({
        now: NOW,
        viewerRole: "COACH",
        overdueCommitmentCount: 0,
        rooms: [
          room("soon", "PLANNED", "2026-08-26T17:00:00.000Z"),
          room("follow-up", "ENDED", "2026-08-20T18:00:00.000Z", {
            recordingCount: 2,
          }),
        ],
      }),
    ).toMatchObject({
      kind: "PREPARE_UPCOMING_SESSION",
      roomId: "soon",
      rank: 2,
    });
  });

  it("keeps draft follow-up coach-only and released follow-up client-visible", () => {
    const rooms = [
      room("draft", "ENDED", "2026-08-24T18:00:00.000Z", {
        recordingCount: 1,
        followUpReleased: false,
      }),
      room("released", "ENDED", "2026-08-23T18:00:00.000Z", {
        recordingCount: 1,
        followUpReleased: true,
      }),
    ];

    expect(
      chooseQuipslyCoachingClientPriority({
        now: NOW,
        viewerRole: "COACH",
        overdueCommitmentCount: 0,
        rooms,
      }).kind,
    ).toBe("REVIEW_COACH_FOLLOW_UP");
    expect(
      chooseQuipslyCoachingClientPriority({
        now: NOW,
        viewerRole: "CLIENT",
        overdueCommitmentCount: 0,
        rooms,
      }),
    ).toMatchObject({
      kind: "VIEW_RELEASED_FOLLOW_UP",
      roomId: "released",
    });
  });

  it("falls through to overdue relationship work without inventing a room", () => {
    expect(
      chooseQuipslyCoachingClientPriority({
        now: NOW,
        viewerRole: "COACH",
        overdueCommitmentCount: 3,
        rooms: [],
      }),
    ).toMatchObject({
      kind: "REVIEW_OVERDUE_COMMITMENTS",
      roomId: null,
      overdueCommitmentCount: 3,
    });
  });

  it("does not expose coach drafts or client releases as support and observer actions", () => {
    const rooms = [
      room("draft", "ENDED", "2026-08-24T18:00:00.000Z", {
        recordingCount: 1,
      }),
      room("released", "ENDED", "2026-08-23T18:00:00.000Z", {
        recordingCount: 1,
        followUpReleased: true,
      }),
    ];

    for (const viewerRole of ["SUPPORT", "OBSERVER"] as const) {
      expect(
        chooseQuipslyCoachingClientPriority({
          now: NOW,
          viewerRole,
          overdueCommitmentCount: 0,
          rooms,
        }),
      ).toMatchObject({ kind: "OPEN_RELATIONSHIP", roomId: null });
    }
  });

  it("normalizes invalid counts and breaks equal-time ties consistently", () => {
    const priority = chooseQuipslyCoachingClientPriority({
      now: NOW,
      viewerRole: "COACH",
      overdueCommitmentCount: Number.NaN,
      rooms: [
        room("z-live", "OPEN", NOW),
        room("a-live", "OPEN", NOW),
      ],
    });

    expect(priority).toMatchObject({
      kind: "JOIN_LIVE_SESSION",
      roomId: "a-live",
      overdueCommitmentCount: 0,
    });
  });

  it("rejects an invalid clock rather than making time-sensitive priority nondeterministic", () => {
    expect(() =>
      chooseQuipslyCoachingClientPriority({
        now: "eventually",
        viewerRole: "COACH",
        overdueCommitmentCount: 0,
        rooms: [],
      }),
    ).toThrow("A valid priority clock is required.");
  });
});
