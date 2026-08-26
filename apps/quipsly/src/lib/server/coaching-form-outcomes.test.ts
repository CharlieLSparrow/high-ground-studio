jest.mock("server-only", () => ({}));

import { QUIPSLY_COACHING_STARTER_FORMS } from "@high-ground/quipsly-domain/coaching-forms";

import { promoteCoachingFormOutcome } from "./coaching-form-outcomes";

const COACH_ID = "coach-user";
const CLIENT_ID = "client-user";
const ASSIGNMENT_ID = "assignment-1";
const RESPONSE_ID = "response-2";
const FIELD_ID = QUIPSLY_COACHING_STARTER_FORMS[0].fields[0].id;
const TASK_REQUEST = "c1f6c421-e267-46c3-84d4-874bb721f4fb";

describe("reviewed coaching form outcomes", () => {
  it("creates one canonical client task with exact source evidence and replays safely", async () => {
    const prisma = fakePrisma();
    const body = {
      requestId: TASK_REQUEST,
      assignmentId: ASSIGNMENT_ID,
      responseRevision: 2,
      kind: "TASK",
      selectedFieldIds: [FIELD_ID],
      title: "Practice the smallest next step",
      body: "Use the decision from the shared reflection.",
      ownerUserId: CLIENT_ID,
      targetAt: "2026-08-30T18:00:00.000Z",
    };

    const first = await promoteCoachingFormOutcome({
      prisma,
      actor: { id: COACH_ID },
      body,
    });
    expect(first).toMatchObject({
      idempotentReplay: false,
      externalSideEffects: false,
      receipt: {
        assignmentId: ASSIGNMENT_ID,
        responseRevisionId: RESPONSE_ID,
        kind: "TASK",
        selectedFieldIds: [FIELD_ID],
        reviewedPayload: {
          title: "Practice the smallest next step",
          owner: { id: CLIENT_ID, name: "Casey Client" },
          visibility: "SHARED",
          coachInitiated: true,
        },
      },
    });
    expect(prisma.actionItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignedUserId: CLIENT_ID,
        engagementId: "engagement-1",
        bookingId: "booking-1",
        roomId: "room-1",
        projectId: "project-1",
        sourceJson: expect.objectContaining({
          schema: "quipsly-coaching-form-outcome-v1",
          assignmentId: ASSIGNMENT_ID,
          responseRevisionId: RESPONSE_ID,
          selectedFieldIds: [FIELD_ID],
          origin: "coach-initiated-form-outcome",
          externalSideEffects: false,
        }),
      }),
    });
    expect(prisma.state.receipts[0].sourceSnapshotJson).toMatchObject({
      responseRevision: 2,
      selectedAnswers: [
        expect.objectContaining({
          fieldId: FIELD_ID,
          answer: "I can make the decision smaller.",
        }),
      ],
    });

    const replay = await promoteCoachingFormOutcome({
      prisma,
      actor: { id: COACH_ID },
      body,
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(prisma.actionItem.create).toHaveBeenCalledTimes(1);

    await expect(
      promoteCoachingFormOutcome({
        prisma,
        actor: { id: COACH_ID },
        body: { ...body, title: "Different work under the same request" },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "COACHING_FORM_OUTCOME_REQUEST_COLLISION",
    });
  });

  it("creates a private canonical note only after explicit review", async () => {
    const prisma = fakePrisma();
    const result = await promoteCoachingFormOutcome({
      prisma,
      actor: { id: COACH_ID },
      body: {
        requestId: "c028031c-c855-47e5-a832-02301480fd81",
        assignmentId: ASSIGNMENT_ID,
        responseRevision: 2,
        kind: "NOTE",
        selectedFieldIds: [FIELD_ID],
        title: "Coach reflection",
        body: "Ask about the client's language next time.",
        visibility: "PRIVATE",
      },
    });

    expect(result.receipt.reviewedPayload).toMatchObject({
      visibility: "PRIVATE",
      coachInitiated: true,
    });
    expect(prisma.coachingNote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        authorUserId: COACH_ID,
        visibility: "AUTHOR_PRIVATE",
        kind: "FOLLOW_UP",
        sourceJson: expect.objectContaining({ visibility: "author-private" }),
      }),
    });
    expect(prisma.actionItem.create).not.toHaveBeenCalled();
    expect(prisma.goal.create).not.toHaveBeenCalled();
  });

  it("fails closed for stale or unauthorized response evidence", async () => {
    const prisma = fakePrisma();
    prisma.coachingFormAssignment.findFirst.mockResolvedValueOnce(null);
    await expect(
      promoteCoachingFormOutcome({
        prisma,
        actor: { id: "neighbor-coach" },
        body: {
          requestId: "407b934e-e40c-4f05-a45c-c834cb421225",
          assignmentId: ASSIGNMENT_ID,
          responseRevision: 2,
          kind: "GOAL",
          selectedFieldIds: [FIELD_ID],
          title: "Invisible neighboring goal",
          ownerUserId: CLIENT_ID,
        },
      }),
    ).rejects.toMatchObject({ status: 404, code: "COACHING_FORM_UNAVAILABLE" });
    expect(prisma.coachingNote.create).not.toHaveBeenCalled();
    expect(prisma.actionItem.create).not.toHaveBeenCalled();
    expect(prisma.goal.create).not.toHaveBeenCalled();
    expect(
      prisma.coachingFormOutcomePromotionReceipt.create,
    ).not.toHaveBeenCalled();
  });
});

function fakePrisma() {
  const state: { receipts: any[] } = { receipts: [] };
  const receiptStore = {
    findUnique: jest.fn(
      async ({ where }: any) =>
        state.receipts.find(
          (receipt) => receipt.requestId === where.requestId,
        ) || null,
    ),
    create: jest.fn(async ({ data }: any) => {
      const receipt = {
        ...data,
        createdAt: new Date("2026-08-26T18:00:00.000Z"),
      };
      state.receipts.push(receipt);
      return receipt;
    }),
  };
  const prisma: any = {
    state,
    $executeRaw: jest.fn(async () => 1),
    coachingFormOutcomePromotionReceipt: receiptStore,
    coachingFormAssignment: {
      findFirst: jest.fn(async () => ({
        id: ASSIGNMENT_ID,
        templateVersionId: "template-version-1",
        engagementId: "engagement-1",
        bookingId: "booking-1",
        callRoomId: "room-1",
        assignedByUserId: COACH_ID,
        assignedToUserId: CLIENT_ID,
        currentResponseRevision: 2,
        templateVersion: {
          id: "template-version-1",
          revision: 1,
          definitionJson: QUIPSLY_COACHING_STARTER_FORMS[0],
        },
        assignedBy: {
          id: COACH_ID,
          name: "Quinn Coach",
          primaryEmail: "coach@example.test",
        },
        assignedTo: {
          id: CLIENT_ID,
          name: "Casey Client",
          primaryEmail: "client@example.test",
        },
        responseRevisions: [
          {
            id: RESPONSE_ID,
            revision: 2,
            state: "SUBMITTED",
            inputSha256: "a".repeat(64),
            answersJson: { [FIELD_ID]: "I can make the decision smaller." },
          },
        ],
        engagement: {
          id: "engagement-1",
          projectId: "project-1",
          members: [
            {
              userId: COACH_ID,
              role: "COACH",
              user: { name: "Quinn Coach", primaryEmail: "coach@example.test" },
            },
            {
              userId: CLIENT_ID,
              role: "CLIENT",
              user: {
                name: "Casey Client",
                primaryEmail: "client@example.test",
              },
            },
          ],
        },
      })),
    },
    coachingNote: { create: jest.fn(async ({ data }: any) => data) },
    actionItem: { create: jest.fn(async ({ data }: any) => data) },
    goal: { create: jest.fn(async ({ data }: any) => data) },
  };
  prisma.$transaction = jest.fn(async (operation: (tx: any) => unknown) =>
    operation(prisma),
  );
  return prisma;
}
