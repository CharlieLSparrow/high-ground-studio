import "server-only";

import { createHash } from "node:crypto";
import type { CoachingBookingStatus, Prisma } from "@prisma/client";
import {
  parseQuipslyCoachingFormDefinition,
  QUIPSLY_COACHING_STARTER_FORMS,
  validateQuipslyCoachingFormAnswers,
  type QuipslyCoachingFormDefinition,
} from "@high-ground/quipsly-domain/coaching-forms";

const REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMINGS = new Set([
  "ENGAGEMENT_START",
  "BEFORE_SESSION",
  "AFTER_SESSION",
  "ON_DEMAND",
]);
const ASSIGNABLE_BOOKING_STATUSES = [
  "REQUESTED",
  "HOLDING_PAYMENT",
  "CONFIRMED",
] satisfies CoachingBookingStatus[];

export class CoachingFormWorkflowError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CoachingFormWorkflowError";
  }
}

type Actor = { id: string };

export async function publishCoachingFormTemplate(input: {
  prisma: any;
  actor: Actor;
  body: unknown;
}) {
  await assertCoachIdentity(input.prisma, input.actor.id);
  const body = record(input.body);
  const requestId = requestIdFrom(body.requestId);
  const templateId = boundedIdentifier(body.templateId);
  let definition: QuipslyCoachingFormDefinition;
  try {
    definition = parseQuipslyCoachingFormDefinition(body.definition);
  } catch (error) {
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_DEFINITION_INVALID",
      error instanceof Error
        ? error.message
        : "This form definition is invalid.",
    );
  }
  const definitionSha256 = hash(definition);
  const inputSha256 = hash({
    schema: "quipsly-coaching-form-template-publish-v1",
    actorUserId: input.actor.id,
    templateId,
    definitionSha256,
  });

  return input.prisma.$transaction(
    async (tx: any) => {
      await lock(tx, `coaching-form-template-request:${requestId}`);
      const replay = await tx.coachingFormTemplateVersion.findUnique({
        where: { requestId },
        include: { template: true },
      });
      if (replay) {
        if (
          replay.createdByUserId !== input.actor.id ||
          replay.inputSha256 !== inputSha256
        ) {
          collision();
        }
        return publishedProjection(replay.template, replay, true);
      }

      let template = templateId
        ? await tx.coachingFormTemplate.findFirst({
            where: { id: templateId, ownerCoachUserId: input.actor.id },
          })
        : null;
      if (templateId && !template) unavailable();
      if (template?.status === "ARCHIVED") {
        throw new CoachingFormWorkflowError(
          409,
          "COACHING_FORM_TEMPLATE_ARCHIVED",
          "Restore this form before publishing another version.",
        );
      }
      if (!template) {
        template = await tx.coachingFormTemplate.create({
          data: {
            ownerCoachUserId: input.actor.id,
            title: definition.title,
            description: definition.description || null,
            purpose: definition.purpose,
            status: "DRAFT",
          },
        });
      }
      await lock(tx, `coaching-form-template:${template.id}`);
      const latest = await tx.coachingFormTemplateVersion.findFirst({
        where: { templateId: template.id },
        orderBy: { revision: "desc" },
        select: { revision: true },
      });
      const revision = (latest?.revision ?? 0) + 1;
      const version = await tx.coachingFormTemplateVersion.create({
        data: {
          requestId,
          templateId: template.id,
          revision,
          definitionSha256,
          inputSha256,
          definitionJson: definition as unknown as Prisma.InputJsonValue,
          createdByUserId: input.actor.id,
        },
      });
      template = await tx.coachingFormTemplate.update({
        where: { id: template.id },
        data: {
          title: definition.title,
          description: definition.description || null,
          purpose: definition.purpose,
          status: "PUBLISHED",
          publishedRevision: revision,
        },
      });
      return publishedProjection(template, version, false);
    },
    { isolationLevel: "Serializable" },
  );
}

export async function assignCoachingForm(input: {
  prisma: any;
  actor: Actor;
  body: unknown;
}) {
  const body = record(input.body);
  const requestId = requestIdFrom(body.requestId);
  const templateId = requiredIdentifier(
    body.templateId,
    "Choose a published coaching form.",
  );
  const engagementId = requiredIdentifier(
    body.engagementId,
    "Choose a coaching client.",
  );
  const bookingId = boundedIdentifier(body.bookingId);
  const callRoomId = boundedIdentifier(body.callRoomId);
  const timing = text(body.timing).toUpperCase() || "ON_DEMAND";
  if (!TIMINGS.has(timing)) {
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_TIMING_INVALID",
      "Choose when this form should appear.",
    );
  }
  const dueAt = optionalDate(body.dueAt, "Choose a valid due date.");
  const context = await assignmentContext({
    prisma: input.prisma,
    actorUserId: input.actor.id,
    engagementId,
    bookingId,
    callRoomId,
  });
  const template = await input.prisma.coachingFormTemplate.findFirst({
    where: {
      id: templateId,
      ownerCoachUserId: input.actor.id,
      status: "PUBLISHED",
      publishedRevision: { not: null },
    },
    include: {
      versions: {
        orderBy: { revision: "desc" },
        take: 1,
      },
    },
  });
  const version = template?.versions?.find(
    (candidate: any) => candidate.revision === template.publishedRevision,
  );
  if (!template || !version) unavailable();
  const intent = {
    schema: "quipsly-coaching-form-assignment-v1",
    templateId,
    templateVersionId: version.id,
    engagementId,
    bookingId,
    callRoomId,
    assignedByUserId: input.actor.id,
    assignedToUserId: context.clientUserId,
    timing,
    dueAt: dueAt?.toISOString() ?? null,
  };
  const inputSha256 = coachingFormAssignmentInputSha256(intent);

  return input.prisma.$transaction(
    async (tx: any) => {
      await lock(tx, `coaching-form-assignment-request:${requestId}`);
      const replay = await tx.coachingFormAssignment.findUnique({
        where: { requestId },
        include: assignmentInclude,
      });
      if (replay) {
        if (
          replay.assignedByUserId !== input.actor.id ||
          replay.inputSha256 !== inputSha256
        )
          collision();
        return assignmentProjection(replay, input.actor.id, true);
      }
      const assignment = await tx.coachingFormAssignment.create({
        data: {
          requestId,
          inputSha256,
          templateId,
          templateVersionId: version.id,
          engagementId,
          bookingId,
          callRoomId,
          assignedByUserId: input.actor.id,
          assignedToUserId: context.clientUserId,
          timing,
          dueAt,
        },
        include: assignmentInclude,
      });
      return assignmentProjection(assignment, input.actor.id, false);
    },
    { isolationLevel: "Serializable" },
  );
}

export async function saveCoachingFormResponse(input: {
  prisma: any;
  actor: Actor;
  assignmentId: string;
  body: unknown;
}) {
  const body = record(input.body);
  const requestId = requestIdFrom(body.requestId);
  const state = text(body.state).toUpperCase();
  if (
    !(["DRAFT", "SUBMITTED"] as const).includes(state as "DRAFT" | "SUBMITTED")
  ) {
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_RESPONSE_STATE_INVALID",
      "Save a draft or submit the form.",
    );
  }
  const assignment = await input.prisma.coachingFormAssignment.findFirst({
    where: {
      id: input.assignmentId,
      assignedToUserId: input.actor.id,
      status: { not: "CANCELED" },
      engagement: {
        is: {
          status: "ACTIVE",
          OR: [
            { primaryClientUserId: input.actor.id },
            {
              members: {
                some: {
                  userId: input.actor.id,
                  role: "CLIENT",
                  status: "ACTIVE",
                },
              },
            },
          ],
        },
      },
    },
    include: assignmentInclude,
  });
  if (!assignment) unavailable();
  let definition: QuipslyCoachingFormDefinition;
  try {
    definition = parseQuipslyCoachingFormDefinition(
      assignment.templateVersion.definitionJson,
    );
  } catch {
    throw new CoachingFormWorkflowError(
      409,
      "COACHING_FORM_ASSIGNED_VERSION_INVALID",
      "This assigned form needs coach support before it can be completed.",
    );
  }
  const validation = validateQuipslyCoachingFormAnswers({
    definition,
    answers: body.answers,
    state: state as "DRAFT" | "SUBMITTED",
  });
  if (!validation.ok) {
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_ANSWERS_INVALID",
      validation.errors[0]?.message || "Review the highlighted answers.",
    );
  }
  const inputSha256 = hash({
    schema: "quipsly-coaching-form-response-v1",
    assignmentId: assignment.id,
    actorUserId: input.actor.id,
    state,
    answers: validation.answers,
  });

  return input.prisma.$transaction(
    async (tx: any) => {
      await lock(tx, `coaching-form-response:${assignment.id}`);
      const replay = await tx.coachingFormResponseRevision.findUnique({
        where: { requestId },
      });
      if (replay) {
        if (
          replay.actorUserId !== input.actor.id ||
          replay.assignmentId !== assignment.id ||
          replay.inputSha256 !== inputSha256
        )
          collision();
        const current = await tx.coachingFormAssignment.findUniqueOrThrow({
          where: { id: assignment.id },
          include: assignmentInclude,
        });
        return {
          assignment: assignmentProjection(current, input.actor.id, true),
          savedRevision: replay.revision,
          idempotentReplay: true,
        };
      }
      const current = await tx.coachingFormAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
      });
      if (current.status === "CANCELED") unavailable();
      if (current.status === "SUBMITTED" && state === "DRAFT") {
        throw new CoachingFormWorkflowError(
          409,
          "COACHING_FORM_ALREADY_SUBMITTED",
          "This form is already shared. Submit your corrected answers when you are ready to update it.",
        );
      }
      const revision = current.currentResponseRevision + 1;
      const now = new Date();
      await tx.coachingFormResponseRevision.create({
        data: {
          requestId,
          assignmentId: assignment.id,
          actorUserId: input.actor.id,
          revision,
          state,
          inputSha256,
          answersJson: validation.answers as Prisma.InputJsonValue,
          submittedAt: state === "SUBMITTED" ? now : null,
        },
      });
      const updated = await tx.coachingFormAssignment.update({
        where: { id: assignment.id },
        data: {
          currentResponseRevision: revision,
          status: state === "SUBMITTED" ? "SUBMITTED" : "IN_PROGRESS",
          startedAt: current.startedAt || now,
          submittedAt: state === "SUBMITTED" ? now : current.submittedAt,
        },
        include: assignmentInclude,
      });
      return {
        assignment: assignmentProjection(updated, input.actor.id, false),
        savedRevision: revision,
        idempotentReplay: false,
      };
    },
    { isolationLevel: "Serializable" },
  );
}

export async function readCoachingFormWorkflows(input: {
  prisma: any;
  actor: Actor;
}) {
  const [coachProfile, coachingRelationships, templates, assignments] =
    await Promise.all([
      input.prisma.coachProfile.findFirst({
        where: { userId: input.actor.id, isActive: true },
        select: { id: true },
      }),
      input.prisma.coachingEngagement.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { primaryCoachUserId: input.actor.id },
            {
              members: {
                some: {
                  userId: input.actor.id,
                  role: "COACH",
                  status: "ACTIVE",
                },
              },
            },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: {
          id: true,
          title: true,
          members: {
            where: { role: "CLIENT", status: "ACTIVE" },
            orderBy: { joinedAt: "asc" },
            take: 2,
            select: {
              user: { select: { id: true, name: true, primaryEmail: true } },
            },
          },
          bookings: {
            where: { status: { in: ASSIGNABLE_BOOKING_STATUSES } },
            orderBy: { scheduledStart: "asc" },
            take: 12,
            select: {
              id: true,
              scheduledStart: true,
              callRoom: { select: { id: true, title: true } },
            },
          },
        },
      }),
      input.prisma.coachingFormTemplate.findMany({
        where: {
          ownerCoachUserId: input.actor.id,
          status: { not: "ARCHIVED" },
        },
        orderBy: { updatedAt: "desc" },
        include: {
          versions: { orderBy: { revision: "desc" }, take: 1 },
          _count: { select: { assignments: true } },
        },
      }),
      input.prisma.coachingFormAssignment.findMany({
        where: {
          OR: [
            {
              assignedByUserId: input.actor.id,
              engagement: {
                is: {
                  status: "ACTIVE",
                  OR: [
                    { primaryCoachUserId: input.actor.id },
                    {
                      members: {
                        some: {
                          userId: input.actor.id,
                          role: "COACH",
                          status: "ACTIVE",
                        },
                      },
                    },
                  ],
                },
              },
            },
            {
              assignedToUserId: input.actor.id,
              engagement: {
                is: {
                  status: "ACTIVE",
                  OR: [
                    { primaryClientUserId: input.actor.id },
                    {
                      members: {
                        some: {
                          userId: input.actor.id,
                          role: "CLIENT",
                          status: "ACTIVE",
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
        orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
        take: 100,
        include: assignmentInclude,
      }),
    ]);
  const isCoach = Boolean(coachProfile || coachingRelationships.length > 0);
  return {
    schema: "quipsly-coaching-form-workflows-v1",
    actor: { id: input.actor.id, isCoach },
    starters: isCoach ? QUIPSLY_COACHING_STARTER_FORMS : [],
    relationships: coachingRelationships.map((relationship: any) => {
      const client = relationship.members?.[0]?.user || null;
      return {
        id: relationship.id,
        title: relationship.title,
        client: person(client),
        upcomingSessions: relationship.bookings.map((booking: any) => ({
          id: booking.id,
          scheduledStart: iso(booking.scheduledStart),
          room: booking.callRoom,
        })),
      };
    }),
    templates: templates.map((template: any) => ({
      id: template.id,
      title: template.title,
      description: template.description,
      purpose: template.purpose,
      status: template.status,
      publishedRevision: template.publishedRevision,
      definition: template.versions?.[0]?.definitionJson ?? null,
      assignmentCount: template._count?.assignments ?? 0,
      updatedAt: iso(template.updatedAt),
    })),
    assignments: assignments.map((assignment: any) =>
      assignmentProjection(assignment, input.actor.id, false),
    ),
    boundaries: {
      exactCoachOrAssignedClientOnly: true,
      immutableTemplateVersion: true,
      draftAnswersRemainPrivate: true,
      noMessageReminderTaskOrGoalCreated: true,
      externalSideEffects: false,
    },
  };
}

const assignmentInclude = {
  template: true,
  templateVersion: true,
  engagement: {
    select: {
      id: true,
      title: true,
      primaryCoachUserId: true,
      primaryClientUserId: true,
    },
  },
  booking: { select: { id: true, scheduledStart: true } },
  callRoom: { select: { id: true, title: true } },
  assignedBy: { select: { id: true, name: true, primaryEmail: true } },
  assignedTo: { select: { id: true, name: true, primaryEmail: true } },
  responseRevisions: { orderBy: { revision: "desc" as const }, take: 1 },
  outcomePromotions: {
    where: { removedAt: null },
    orderBy: { createdAt: "desc" as const },
    take: 50,
    include: { responseRevision: { select: { revision: true } } },
  },
} as const;

async function assignmentContext(input: {
  prisma: any;
  actorUserId: string;
  engagementId: string;
  bookingId: string | null;
  callRoomId: string | null;
}) {
  const engagement = await input.prisma.coachingEngagement.findFirst({
    where: {
      id: input.engagementId,
      status: "ACTIVE",
      OR: [
        { primaryCoachUserId: input.actorUserId },
        {
          members: {
            some: {
              userId: input.actorUserId,
              role: "COACH",
              status: "ACTIVE",
            },
          },
        },
      ],
    },
    select: {
      id: true,
      primaryClientUserId: true,
      members: {
        where: { role: "CLIENT", status: "ACTIVE" },
        select: { userId: true },
        take: 2,
      },
      bookings: input.bookingId
        ? {
            where: { id: input.bookingId },
            select: { id: true, clientUserId: true, coachUserId: true },
            take: 1,
          }
        : false,
      callRooms: input.callRoomId
        ? {
            where: { id: input.callRoomId },
            select: { id: true, bookingId: true },
            take: 1,
          }
        : false,
    },
  });
  const clientUserId =
    engagement?.members?.find(
      (member: { userId: string }) =>
        member.userId === engagement.primaryClientUserId,
    )?.userId ??
    engagement?.members?.[0]?.userId ??
    null;
  if (!engagement || !clientUserId) unavailable();
  if (input.bookingId) {
    const booking = engagement.bookings?.[0];
    if (
      !booking ||
      booking.clientUserId !== clientUserId ||
      booking.coachUserId !== input.actorUserId
    )
      unavailable();
  }
  if (input.callRoomId) {
    const room = engagement.callRooms?.[0];
    if (!room || (input.bookingId && room.bookingId !== input.bookingId))
      unavailable();
  }
  return { clientUserId };
}

async function assertCoachIdentity(prisma: any, actorUserId: string) {
  const [profile, membership] = await Promise.all([
    prisma.coachProfile.findFirst({
      where: { userId: actorUserId, isActive: true },
      select: { id: true },
    }),
    prisma.coachingEngagementMember.findFirst({
      where: { userId: actorUserId, role: "COACH", status: "ACTIVE" },
      select: { id: true },
    }),
  ]);
  if (!profile && !membership) unavailable();
}

function assignmentProjection(
  assignment: any,
  actorUserId: string,
  idempotentReplay: boolean,
) {
  const latest = assignment.responseRevisions?.[0] || null;
  const isClient = assignment.assignedToUserId === actorUserId;
  const visibleResponse =
    latest && (isClient || latest.state === "SUBMITTED") ? latest : null;
  const visibleOutcomePromotions = (assignment.outcomePromotions || [])
    .filter((receipt: any) => {
      if (!isClient) return true;
      return record(receipt.reviewedPayloadJson).visibility === "SHARED";
    })
    .map((receipt: any) => ({
      id: receipt.id,
      kind: receipt.kind,
      targetId: receipt.targetId,
      responseRevision: receipt.responseRevision?.revision ?? null,
      selectedFieldIds: receipt.selectedFieldIdsJson,
      sourceSha256: receipt.sourceSha256,
      reviewedPayload: receipt.reviewedPayloadJson,
      createdAt: iso(receipt.createdAt),
    }));
  return {
    id: assignment.id,
    requestId: assignment.requestId,
    status: assignment.status,
    timing: assignment.timing,
    dueAt: iso(assignment.dueAt),
    startedAt: iso(assignment.startedAt),
    submittedAt: iso(assignment.submittedAt),
    template: {
      id: assignment.template.id,
      title: assignment.template.title,
      description: assignment.template.description,
      purpose: assignment.template.purpose,
      revision: assignment.templateVersion.revision,
      definition: assignment.templateVersion.definitionJson,
    },
    engagement: assignment.engagement,
    booking: assignment.booking
      ? {
          id: assignment.booking.id,
          scheduledStart: iso(assignment.booking.scheduledStart),
        }
      : null,
    room: assignment.callRoom,
    assignedBy: person(assignment.assignedBy),
    assignedTo: person(assignment.assignedTo),
    viewerRole: isClient ? "CLIENT" : "COACH",
    response: visibleResponse
      ? {
          revision: visibleResponse.revision,
          state: visibleResponse.state,
          answers: visibleResponse.answersJson,
          submittedAt: iso(visibleResponse.submittedAt),
        }
      : null,
    outcomePromotions: visibleOutcomePromotions,
    idempotentReplay,
    boundaries: {
      clientCanEditOwnResponse: isClient,
      coachCanReadSubmittedResponse:
        !isClient && visibleResponse?.state === "SUBMITTED",
      coachCanReadDraftResponse: false,
      coachInitiatedPromotion: true,
      editableAfterCreation: true,
      sourceReceiptVisible: true,
      externalSideEffects: false,
    },
  };
}

function publishedProjection(
  template: any,
  version: any,
  idempotentReplay: boolean,
) {
  return {
    template: {
      id: template.id,
      title: template.title,
      description: template.description,
      purpose: template.purpose,
      status: template.status,
      publishedRevision: template.publishedRevision,
    },
    version: {
      id: version.id,
      revision: version.revision,
      definitionSha256: version.definitionSha256,
      definition: version.definitionJson,
    },
    idempotentReplay,
    externalSideEffects: false,
  };
}

async function lock(tx: any, identity: string) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))
  `;
}

function person(value: any) {
  return value
    ? {
        id: value.id,
        name: value.name || value.primaryEmail || "Quipsly member",
        email: value.primaryEmail || null,
      }
    : null;
}

function collision(): never {
  throw new CoachingFormWorkflowError(
    409,
    "COACHING_FORM_REQUEST_COLLISION",
    "That save identity belongs to different form evidence. Refresh and try again.",
  );
}

function unavailable(): never {
  throw new CoachingFormWorkflowError(
    404,
    "COACHING_FORM_UNAVAILABLE",
    "This private coaching form is unavailable to this account.",
  );
}

function requestIdFrom(value: unknown) {
  const parsed = text(value).toLowerCase();
  if (!REQUEST_ID.test(parsed)) {
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_REQUEST_ID_INVALID",
      "Refresh and try saving again.",
    );
  }
  return parsed;
}

function requiredIdentifier(value: unknown, message: string) {
  const parsed = boundedIdentifier(value);
  if (!parsed)
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_IDENTITY_INVALID",
      message,
    );
  return parsed;
}

function boundedIdentifier(value: unknown) {
  const parsed = text(value);
  return parsed && parsed.length <= 240 ? parsed : null;
}

function optionalDate(value: unknown, message: string) {
  const parsed = text(value);
  if (!parsed) return null;
  const date = new Date(parsed);
  if (Number.isNaN(date.getTime())) {
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_DATE_INVALID",
      message,
    );
  }
  return date;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function iso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, candidate]) => [key, stable(candidate)]),
  );
}

function hash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

export function coachingFormAssignmentInputSha256(input: {
  templateId: string;
  templateVersionId: string;
  engagementId: string;
  bookingId: string | null;
  callRoomId: string | null;
  assignedByUserId: string;
  assignedToUserId: string;
  timing: string;
  dueAt: string | null;
}) {
  return hash({
    schema: "quipsly-coaching-form-assignment-v1",
    ...input,
  });
}
