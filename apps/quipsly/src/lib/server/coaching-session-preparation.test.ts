jest.mock("server-only", () => ({}));

import {
  CoachingSessionPreparationError,
  parseCoachingSessionPreparationInput,
  readCoachingSessionPreparation,
  saveCoachingSessionPreparation,
} from "./coaching-session-preparation";

const CLIENT_ID = "client_user_123";
const COACH_ID = "coach_user_123";
const ROOM_ID = "coaching_room_123";
const BOOKING_ID = "coaching_booking_123";
const CLIENT_REQUEST = "0d96c0a7-82b3-4bfd-8d0e-113847d23fd0";
const COACH_REQUEST = "a1be98f8-e168-4b59-9605-b22159271465";

describe("coaching Session preparation", () => {
  it("parses bounded conventional check-in fields", () => {
    expect(
      parseCoachingSessionPreparationInput({
        operation: "save_client",
        requestId: CLIENT_REQUEST,
        focus: "Choose the next step",
        desiredOutcome: "A decision",
        successMeasure: "I can explain what I am doing next",
        progressScore: "7",
        update: "The first experiment worked.",
      }),
    ).toMatchObject({
      operation: "SAVE_CLIENT",
      requestId: CLIENT_REQUEST,
      values: { progressScore: 7 },
    });
    expect(() =>
      parseCoachingSessionPreparationInput({
        operation: "SAVE_CLIENT",
        requestId: CLIENT_REQUEST,
        progressScore: 11,
      }),
    ).toThrow("0 through 10");
    expect(() =>
      parseCoachingSessionPreparationInput({
        operation: "SAVE_COACH",
        requestId: "not-a-uuid",
        note: "Remember the prior commitment.",
      }),
    ).toThrow(CoachingSessionPreparationError);
  });

  it("keeps client-shared and coach-private lanes separate with exact replay", async () => {
    const prisma = fakePrisma();
    const clientBody = {
      operation: "SAVE_CLIENT",
      requestId: CLIENT_REQUEST,
      focus: "Decide whether to accept the role",
      desiredOutcome: "A grounded yes or no",
      successMeasure: "I know what evidence matters",
      progressScore: 6,
      update: "I spoke with two people on the team.",
    };
    const first = await saveCoachingSessionPreparation({
      prisma,
      roomId: ROOM_ID,
      actor: { id: CLIENT_ID },
      body: clientBody,
    });
    expect(first.idempotentReplay).toBe(false);
    expect(first.savedRevision).toBe(1);
    expect(first.preparation.role).toBe("client");
    expect(first.preparation.client.focus).toContain("accept the role");
    expect(first.preparation.coachPrivate).toBeNull();

    const replay = await saveCoachingSessionPreparation({
      prisma,
      roomId: ROOM_ID,
      actor: { id: CLIENT_ID },
      body: clientBody,
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.savedRevision).toBe(1);
    expect(prisma.state.revisions).toHaveLength(1);

    await expect(
      saveCoachingSessionPreparation({
        prisma,
        roomId: ROOM_ID,
        actor: { id: CLIENT_ID },
        body: { ...clientBody, focus: "Changed payload" },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "PREPARATION_REQUEST_COLLISION",
    });

    const coach = await saveCoachingSessionPreparation({
      prisma,
      roomId: ROOM_ID,
      actor: { id: COACH_ID },
      body: {
        operation: "SAVE_COACH",
        requestId: COACH_REQUEST,
        note: "Stay curious about the evidence behind urgency.",
      },
    });
    expect(coach.savedRevision).toBe(2);
    expect(coach.preparation.client.progressScore).toBe(6);
    expect(coach.preparation.coachPrivate?.note).toContain("curious");

    const clientReadback = await readCoachingSessionPreparation({
      prisma,
      roomId: ROOM_ID,
      actor: { id: CLIENT_ID },
    });
    expect(clientReadback.client.focus).toContain("accept the role");
    expect(clientReadback.coachPrivate).toBeNull();
    expect(prisma.state.revisions).toHaveLength(2);
  });

  it("does not broaden preparation to another Session participant or lane", async () => {
    const prisma = fakePrisma();
    await expect(
      readCoachingSessionPreparation({
        prisma,
        roomId: ROOM_ID,
        actor: { id: "observer_user_123" },
      }),
    ).rejects.toMatchObject({ status: 404, code: "PREPARATION_NOT_FOUND" });
    await expect(
      saveCoachingSessionPreparation({
        prisma,
        roomId: ROOM_ID,
        actor: { id: CLIENT_ID },
        body: {
          operation: "SAVE_COACH",
          requestId: COACH_REQUEST,
          note: "Attempted private lane write",
        },
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: "PREPARATION_LANE_UNAVAILABLE",
    });
  });
});

function fakePrisma() {
  const booking = {
    id: BOOKING_ID,
    clientUserId: CLIENT_ID,
    coachUserId: COACH_ID,
  };
  const state: {
    preparation: null | Record<string, any>;
    revisions: Array<Record<string, any>>;
  } = { preparation: null, revisions: [] };

  const prisma: any = {
    state,
    callRoom: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.id !== ROOM_ID) return null;
        const conditions = where.booking?.is?.OR || [];
        const actorCanRead = conditions.some(
          (condition: any) =>
            condition.clientUserId === CLIENT_ID ||
            condition.coachUserId === COACH_ID,
        );
        return actorCanRead ? { id: ROOM_ID, booking } : null;
      }),
    },
    coachingSessionPreparation: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (!state.preparation) return null;
        if (where.bookingId && where.bookingId !== BOOKING_ID) return null;
        if (where.id && where.id !== state.preparation.id) return null;
        return { ...state.preparation };
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        if (!state.preparation || where.id !== state.preparation.id) {
          throw new Error("not found");
        }
        return { ...state.preparation };
      }),
      create: jest.fn(async ({ data }: any) => {
        state.preparation = {
          id: "session_preparation_123",
          revision: 0,
          clientFocus: null,
          clientDesiredOutcome: null,
          clientSuccessMeasure: null,
          clientProgressScore: null,
          clientUpdate: null,
          clientSubmittedAt: null,
          coachPrivateNote: null,
          coachPreparedAt: null,
          ...data,
        };
        return { ...state.preparation };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        if (!state.preparation || where.id !== state.preparation.id) {
          throw new Error("not found");
        }
        state.preparation = { ...state.preparation, ...data };
        return { ...state.preparation };
      }),
    },
    coachingSessionPreparationRevision: {
      findUnique: jest.fn(async ({ where }: any) =>
        state.revisions.find((revision) => revision.requestId === where.requestId) || null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const revision = { id: `revision_${state.revisions.length + 1}`, ...data };
        state.revisions.push(revision);
        return revision;
      }),
    },
    $executeRaw: jest.fn(async () => 1),
  };
  prisma.$transaction = jest.fn(async (operation: (tx: any) => unknown) =>
    operation(prisma),
  );
  return prisma;
}
