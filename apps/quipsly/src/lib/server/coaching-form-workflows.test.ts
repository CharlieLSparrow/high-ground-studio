jest.mock("server-only", () => ({}));

import { QUIPSLY_COACHING_STARTER_FORMS } from "@high-ground/quipsly-domain/coaching-forms";

import {
  assignCoachingForm,
  publishCoachingFormTemplate,
  readCoachingFormWorkflows,
  saveCoachingFormResponse,
} from "./coaching-form-workflows";

const COACH_ID = "coach-user";
const CLIENT_ID = "client-user";
const OTHER_ID = "other-user";
const ENGAGEMENT_ID = "engagement-1";
const BOOKING_ID = "booking-1";
const ROOM_ID = "room-1";
const PUBLISH_REQUEST = "a29aaf28-0b53-40a8-982f-2a2f2f95fb5c";
const ASSIGN_REQUEST = "31f66c8e-e098-4ac0-bae8-e101dc3af529";
const DRAFT_REQUEST = "b187c8a3-af76-44d1-86b4-4d9123a4cf88";
const SUBMIT_REQUEST = "00fde5c9-aead-4d79-8d1b-c232375f9e55";

describe("coaching form workflows", () => {
  it("publishes one immutable version with exact replay and rejects non-coaches", async () => {
    const prisma = fakePrisma();
    const first = await publishCoachingFormTemplate({
      prisma,
      actor: { id: COACH_ID },
      body: {
        requestId: PUBLISH_REQUEST,
        definition: QUIPSLY_COACHING_STARTER_FORMS[0],
      },
    });
    expect(first.idempotentReplay).toBe(false);
    expect(first.version.revision).toBe(1);
    expect(first.version.definition).toEqual(QUIPSLY_COACHING_STARTER_FORMS[0]);

    const replay = await publishCoachingFormTemplate({
      prisma,
      actor: { id: COACH_ID },
      body: {
        requestId: PUBLISH_REQUEST,
        definition: QUIPSLY_COACHING_STARTER_FORMS[0],
      },
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(prisma.state.versions).toHaveLength(1);

    await expect(
      publishCoachingFormTemplate({
        prisma,
        actor: { id: OTHER_ID },
        body: {
          requestId: "47f15f85-7506-4f6b-8385-f87c9bd3d756",
          definition: QUIPSLY_COACHING_STARTER_FORMS[0],
        },
      }),
    ).rejects.toMatchObject({ status: 404, code: "COACHING_FORM_UNAVAILABLE" });
  });

  it("publishes a coach-owned revision without rewriting an assigned version", async () => {
    const prisma = fakePrisma();
    const firstDefinition = {
      ...QUIPSLY_COACHING_STARTER_FORMS[0],
      key: "coach-owned-reflection",
      title: "Coach-owned reflection",
    };
    const first = await publishCoachingFormTemplate({
      prisma,
      actor: { id: COACH_ID },
      body: { requestId: PUBLISH_REQUEST, definition: firstDefinition },
    });
    const assignment = await assignCoachingForm({
      prisma,
      actor: { id: COACH_ID },
      body: {
        requestId: ASSIGN_REQUEST,
        templateId: first.template.id,
        engagementId: ENGAGEMENT_ID,
      },
    });
    const revisedDefinition = {
      ...firstDefinition,
      title: "Coach-owned reflection refined",
      fields: firstDefinition.fields.map((field, index) =>
        index === 0
          ? { ...field, label: "What matters most before we meet?" }
          : field,
      ),
    };
    const second = await publishCoachingFormTemplate({
      prisma,
      actor: { id: COACH_ID },
      body: {
        requestId: "778f149d-4525-4c3b-9a18-ccf582552f3a",
        templateId: first.template.id,
        definition: revisedDefinition,
      },
    });

    expect(second).toMatchObject({
      template: { id: first.template.id, publishedRevision: 2 },
      version: { revision: 2, definition: revisedDefinition },
    });
    expect(prisma.state.versions).toHaveLength(2);
    expect(prisma.state.versions[0].definitionJson.title).toBe(
      "Coach-owned reflection",
    );
    expect(assignment.template.revision).toBe(1);
    expect(prisma.state.assignments[0].templateVersionId).toBe(
      prisma.state.versions[0].id,
    );
  });

  it("binds the exact published version, relationship, client, booking, and room", async () => {
    const prisma = fakePrisma();
    const published = await publishCoachingFormTemplate({
      prisma,
      actor: { id: COACH_ID },
      body: {
        requestId: PUBLISH_REQUEST,
        definition: QUIPSLY_COACHING_STARTER_FORMS[1],
      },
    });
    const assigned = await assignCoachingForm({
      prisma,
      actor: { id: COACH_ID },
      body: {
        requestId: ASSIGN_REQUEST,
        templateId: published.template.id,
        engagementId: ENGAGEMENT_ID,
        bookingId: BOOKING_ID,
        callRoomId: ROOM_ID,
        timing: "BEFORE_SESSION",
      },
    });
    expect(assigned).toMatchObject({
      viewerRole: "COACH",
      engagement: { id: ENGAGEMENT_ID },
      booking: { id: BOOKING_ID },
      room: { id: ROOM_ID },
      assignedTo: { id: CLIENT_ID },
      template: { revision: 1 },
    });

    const replay = await assignCoachingForm({
      prisma,
      actor: { id: COACH_ID },
      body: {
        requestId: ASSIGN_REQUEST,
        templateId: published.template.id,
        engagementId: ENGAGEMENT_ID,
        bookingId: BOOKING_ID,
        callRoomId: ROOM_ID,
        timing: "BEFORE_SESSION",
      },
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(prisma.state.assignments).toHaveLength(1);

    await expect(
      assignCoachingForm({
        prisma,
        actor: { id: OTHER_ID },
        body: {
          requestId: "507cffc7-0c4b-40b1-a90a-12b068557f8a",
          templateId: published.template.id,
          engagementId: ENGAGEMENT_ID,
        },
      }),
    ).rejects.toMatchObject({ status: 404, code: "COACHING_FORM_UNAVAILABLE" });
  });

  it("keeps client drafts private, reveals submission, and never permits a draft downgrade", async () => {
    const prisma = fakePrisma();
    const published = await publishCoachingFormTemplate({
      prisma,
      actor: { id: COACH_ID },
      body: {
        requestId: PUBLISH_REQUEST,
        definition: QUIPSLY_COACHING_STARTER_FORMS[2],
      },
    });
    const assigned = await assignCoachingForm({
      prisma,
      actor: { id: COACH_ID },
      body: {
        requestId: ASSIGN_REQUEST,
        templateId: published.template.id,
        engagementId: ENGAGEMENT_ID,
      },
    });
    const draftAnswers = { takeaway: "I can choose the smallest next step." };
    const draft = await saveCoachingFormResponse({
      prisma,
      actor: { id: CLIENT_ID },
      assignmentId: assigned.id,
      body: { requestId: DRAFT_REQUEST, state: "DRAFT", answers: draftAnswers },
    });
    expect(draft.assignment.response).toMatchObject({
      state: "DRAFT",
      answers: draftAnswers,
    });
    expect(prisma.coachingFormAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignedToUserId: CLIENT_ID,
          engagement: {
            is: expect.objectContaining({
              status: "ACTIVE",
              OR: expect.arrayContaining([{ primaryClientUserId: CLIENT_ID }]),
            }),
          },
        }),
      }),
    );

    const coachAfterDraft = await readCoachingFormWorkflows({
      prisma,
      actor: { id: COACH_ID },
    });
    expect(coachAfterDraft.assignments[0]).toMatchObject({
      status: "IN_PROGRESS",
      response: null,
      boundaries: { coachCanReadDraftResponse: false },
    });
    expect(prisma.coachingFormAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: expect.arrayContaining([
            expect.objectContaining({
              assignedByUserId: COACH_ID,
              engagement: {
                is: expect.objectContaining({ status: "ACTIVE" }),
              },
            }),
          ]),
        },
      }),
    );
    const clientAfterDraft = await readCoachingFormWorkflows({
      prisma,
      actor: { id: CLIENT_ID },
    });
    expect(clientAfterDraft.assignments[0].response).toMatchObject({
      state: "DRAFT",
      answers: draftAnswers,
    });
    expect(clientAfterDraft.starters).toEqual([]);
    expect(clientAfterDraft.templates).toEqual([]);

    const submittedAnswers = {
      takeaway: "I can choose the smallest next step.",
      commitment: "Write the first two sentences tomorrow morning.",
    };
    await saveCoachingFormResponse({
      prisma,
      actor: { id: CLIENT_ID },
      assignmentId: assigned.id,
      body: {
        requestId: SUBMIT_REQUEST,
        state: "SUBMITTED",
        answers: submittedAnswers,
      },
    });
    const coachAfterSubmit = await readCoachingFormWorkflows({
      prisma,
      actor: { id: COACH_ID },
    });
    expect(coachAfterSubmit.assignments[0]).toMatchObject({
      status: "SUBMITTED",
      response: { state: "SUBMITTED", answers: submittedAnswers },
      boundaries: { coachCanReadSubmittedResponse: true },
    });

    await expect(
      saveCoachingFormResponse({
        prisma,
        actor: { id: CLIENT_ID },
        assignmentId: assigned.id,
        body: {
          requestId: "decb5944-04f9-4ded-b59b-e750ace59bdd",
          state: "DRAFT",
          answers: submittedAnswers,
        },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "COACHING_FORM_ALREADY_SUBMITTED",
    });
    await expect(
      saveCoachingFormResponse({
        prisma,
        actor: { id: OTHER_ID },
        assignmentId: assigned.id,
        body: {
          requestId: "d6780bd7-f88d-448a-ae62-2f2a9fa9b233",
          state: "SUBMITTED",
          answers: submittedAnswers,
        },
      }),
    ).rejects.toMatchObject({ status: 404, code: "COACHING_FORM_UNAVAILABLE" });
  });
});

function fakePrisma() {
  const state: {
    templates: any[];
    versions: any[];
    assignments: any[];
    responses: any[];
  } = { templates: [], versions: [], assignments: [], responses: [] };

  const people = {
    [COACH_ID]: {
      id: COACH_ID,
      name: "Coach Quinn",
      primaryEmail: "coach@example.test",
    },
    [CLIENT_ID]: {
      id: CLIENT_ID,
      name: "Casey Client",
      primaryEmail: "client@example.test",
    },
  } as const;
  const engagement = {
    id: ENGAGEMENT_ID,
    title: "Casey and Quinn",
    primaryCoachUserId: COACH_ID,
    primaryClientUserId: CLIENT_ID,
  };
  const booking = {
    id: BOOKING_ID,
    clientUserId: CLIENT_ID,
    coachUserId: COACH_ID,
    scheduledStart: new Date("2026-08-27T17:00:00.000Z"),
  };
  const room = {
    id: ROOM_ID,
    title: "Casey coaching Session",
    bookingId: BOOKING_ID,
  };

  function decoratedAssignment(row: any) {
    const template = state.templates.find(
      (item) => item.id === row.templateId,
    )!;
    const templateVersion = state.versions.find(
      (item) => item.id === row.templateVersionId,
    )!;
    return {
      ...row,
      template,
      templateVersion,
      engagement,
      booking: row.bookingId ? booking : null,
      callRoom: row.callRoomId ? room : null,
      assignedBy: people[COACH_ID],
      assignedTo: people[CLIENT_ID],
      responseRevisions: state.responses
        .filter((item) => item.assignmentId === row.id)
        .sort((left, right) => right.revision - left.revision)
        .slice(0, 1),
    };
  }

  const prisma: any = {
    state,
    coachProfile: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.userId === COACH_ID ? { id: "profile-1" } : null,
      ),
    },
    coachingEngagementMember: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.userId === COACH_ID ? { id: "member-coach" } : null,
      ),
    },
    coachingEngagement: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.id !== ENGAGEMENT_ID) return null;
        const actor =
          where.OR?.[0]?.primaryCoachUserId ||
          where.OR?.[1]?.members?.some?.userId;
        if (actor !== COACH_ID) return null;
        return {
          ...engagement,
          members: [{ userId: CLIENT_ID }],
          bookings: where.bookings === false ? undefined : [{ ...booking }],
          callRooms: where.callRooms === false ? undefined : [{ ...room }],
        };
      }),
      findMany: jest.fn(async ({ where }: any) => {
        const actor =
          where.OR?.[0]?.primaryCoachUserId ||
          where.OR?.[1]?.members?.some?.userId;
        if (actor !== COACH_ID) return [];
        return [
          {
            ...engagement,
            primaryClient: people[CLIENT_ID],
            members: [{ user: people[CLIENT_ID] }],
            bookings: [{ ...booking, callRoom: room }],
            updatedAt: new Date(),
          },
        ];
      }),
    },
    coachingFormTemplate: {
      findFirst: jest.fn(async ({ where }: any) => {
        const template =
          state.templates.find(
            (item) =>
              item.id === where.id &&
              item.ownerCoachUserId === where.ownerCoachUserId,
          ) || null;
        if (!template) return null;
        return {
          ...template,
          versions: state.versions
            .filter((item) => item.templateId === template.id)
            .sort((left, right) => right.revision - left.revision)
            .slice(0, 1),
        };
      }),
      findMany: jest.fn(async ({ where }: any) =>
        state.templates
          .filter((item) => item.ownerCoachUserId === where.ownerCoachUserId)
          .map((template) => ({
            ...template,
            versions: state.versions
              .filter((item) => item.templateId === template.id)
              .sort((left, right) => right.revision - left.revision)
              .slice(0, 1),
            _count: {
              assignments: state.assignments.filter(
                (item) => item.templateId === template.id,
              ).length,
            },
          })),
      ),
      create: jest.fn(async ({ data }: any) => {
        const template = {
          id: `template-${state.templates.length + 1}`,
          publishedRevision: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.templates.push(template);
        return { ...template };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const index = state.templates.findIndex((item) => item.id === where.id);
        state.templates[index] = {
          ...state.templates[index],
          ...data,
          updatedAt: new Date(),
        };
        return { ...state.templates[index] };
      }),
    },
    coachingFormTemplateVersion: {
      findUnique: jest.fn(async ({ where }: any) => {
        const version = state.versions.find(
          (item) => item.requestId === where.requestId,
        );
        if (!version) return null;
        return {
          ...version,
          template: state.templates.find(
            (item) => item.id === version.templateId,
          ),
        };
      }),
      findFirst: jest.fn(
        async ({ where }: any) =>
          state.versions
            .filter((item) => item.templateId === where.templateId)
            .sort((left, right) => right.revision - left.revision)[0] || null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const version = {
          id: `version-${state.versions.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        state.versions.push(version);
        return { ...version };
      }),
    },
    coachingFormAssignment: {
      findUnique: jest.fn(async ({ where }: any) => {
        const row = state.assignments.find(
          (item) => item.requestId === where.requestId || item.id === where.id,
        );
        return row ? decoratedAssignment(row) : null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const row = state.assignments.find((item) => item.id === where.id);
        if (!row) throw new Error("not found");
        return where.id && decoratedAssignment(row);
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const row = state.assignments.find(
          (item) =>
            item.id === where.id &&
            item.assignedToUserId === where.assignedToUserId &&
            item.status !== "CANCELED",
        );
        return row ? decoratedAssignment(row) : null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        const actor =
          where.OR[0].assignedByUserId || where.OR[1].assignedToUserId;
        return state.assignments
          .filter(
            (item) =>
              item.assignedByUserId === actor ||
              item.assignedToUserId === actor,
          )
          .map(decoratedAssignment);
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `assignment-${state.assignments.length + 1}`,
          status: "ASSIGNED",
          startedAt: null,
          submittedAt: null,
          canceledAt: null,
          currentResponseRevision: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.assignments.push(row);
        return decoratedAssignment(row);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const index = state.assignments.findIndex(
          (item) => item.id === where.id,
        );
        state.assignments[index] = {
          ...state.assignments[index],
          ...data,
          updatedAt: new Date(),
        };
        return decoratedAssignment(state.assignments[index]);
      }),
    },
    coachingFormResponseRevision: {
      findUnique: jest.fn(
        async ({ where }: any) =>
          state.responses.find((item) => item.requestId === where.requestId) ||
          null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const response = {
          id: `response-${state.responses.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        state.responses.push(response);
        return response;
      }),
    },
    $executeRaw: jest.fn(async () => 1),
  };
  prisma.$transaction = jest.fn(async (operation: (tx: any) => unknown) =>
    operation(prisma),
  );
  return prisma;
}
