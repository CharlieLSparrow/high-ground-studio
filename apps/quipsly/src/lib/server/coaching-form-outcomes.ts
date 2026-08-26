import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { parseQuipslyCoachingFormDefinition } from "@high-ground/quipsly-domain/coaching-forms";

import { CoachingFormWorkflowError } from "./coaching-form-workflows";

const REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(["NOTE", "TASK", "GOAL"] as const);
type OutcomeKind = "NOTE" | "TASK" | "GOAL";

type Actor = { id: string };

export async function promoteCoachingFormOutcome(input: {
  prisma: any;
  actor: Actor;
  body: unknown;
}) {
  const body = record(input.body);
  const requestId = requestIdFrom(body.requestId);
  const assignmentId = requiredIdentifier(
    body.assignmentId,
    "Choose one shared coaching form.",
  );
  const expectedResponseRevision = positiveInteger(
    body.responseRevision,
    "Refresh this response before creating follow-through.",
  );
  const kind = outcomeKind(body.kind);
  const selectedFieldIds = identifiers(
    body.selectedFieldIds,
    "Choose at least one shared answer.",
  );
  const title = boundedText(body.title, 500);
  const detail = boundedText(body.body, 20_000, true);
  const ownerUserId = boundedIdentifier(body.ownerUserId) || input.actor.id;
  const visibility =
    boundedText(body.visibility, 20).toUpperCase() === "PRIVATE"
      ? "PRIVATE"
      : "SHARED";
  const targetAt = optionalDate(body.targetAt);
  if (!kind || !title) {
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_OUTCOME_INVALID",
      "Choose a note, task, or goal and give it a clear name.",
    );
  }
  if (targetAt === "invalid") {
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_OUTCOME_DATE_INVALID",
      "Review the optional due or target date.",
    );
  }
  const inputSha256 = hash({
    schema: "quipsly-coaching-form-outcome-intent-v1",
    actorUserId: input.actor.id,
    assignmentId,
    expectedResponseRevision,
    kind,
    selectedFieldIds,
    title,
    detail,
    ownerUserId: kind === "NOTE" ? input.actor.id : ownerUserId,
    visibility: kind === "NOTE" ? visibility : "SHARED",
    targetAt: targetAt instanceof Date ? targetAt.toISOString() : null,
  });

  return input.prisma.$transaction(
    async (tx: any) => {
      await lock(tx, `coaching-form-outcome-request:${requestId}`);
      const replay = await tx.coachingFormOutcomePromotionReceipt.findUnique({
        where: { requestId },
      });
      if (replay) {
        if (
          replay.actorUserId !== input.actor.id ||
          replay.assignmentId !== assignmentId ||
          replay.inputSha256 !== inputSha256
        )
          collision();
        return receiptProjection(replay, true);
      }

      const assignment = await tx.coachingFormAssignment.findFirst({
        where: {
          id: assignmentId,
          assignedByUserId: input.actor.id,
          status: "SUBMITTED",
          currentResponseRevision: expectedResponseRevision,
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
        include: {
          templateVersion: true,
          assignedBy: { select: { id: true, name: true, primaryEmail: true } },
          assignedTo: { select: { id: true, name: true, primaryEmail: true } },
          responseRevisions: {
            where: { revision: expectedResponseRevision, state: "SUBMITTED" },
            take: 1,
          },
          engagement: {
            include: {
              members: {
                where: { status: "ACTIVE" },
                select: {
                  userId: true,
                  role: true,
                  user: { select: { name: true, primaryEmail: true } },
                },
              },
            },
          },
        },
      });
      const response = assignment?.responseRevisions?.[0];
      if (!assignment || !response) unavailable();

      let definition;
      try {
        definition = parseQuipslyCoachingFormDefinition(
          assignment.templateVersion.definitionJson,
        );
      } catch {
        throw new CoachingFormWorkflowError(
          409,
          "COACHING_FORM_OUTCOME_SOURCE_INVALID",
          "This submitted form needs support before follow-through can be created.",
        );
      }
      const answers = record(response.answersJson);
      const fieldById = new Map(
        definition.fields.map((field) => [field.id, field]),
      );
      const selectedAnswers = selectedFieldIds.map((fieldId) => {
        const field = fieldById.get(fieldId);
        if (!field || answers[fieldId] === undefined) {
          throw new CoachingFormWorkflowError(
            409,
            "COACHING_FORM_OUTCOME_SELECTION_STALE",
            "One selected answer changed. Refresh before creating follow-through.",
          );
        }
        return {
          fieldId,
          label: field.label,
          type: field.type,
          answer: answers[fieldId],
        };
      });

      const activeMembers = new Map<
        string,
        { id: string; name: string; email: string | null }
      >();
      for (const member of assignment.engagement.members) {
        activeMembers.set(member.userId, {
          id: member.userId,
          name:
            member.user.name || member.user.primaryEmail || "Quipsly member",
          email: member.user.primaryEmail || null,
        });
      }
      for (const person of [assignment.assignedBy, assignment.assignedTo]) {
        if (person) {
          activeMembers.set(person.id, {
            id: person.id,
            name: person.name || person.primaryEmail || "Quipsly member",
            email: person.primaryEmail || null,
          });
        }
      }
      if (kind !== "NOTE" && !activeMembers.has(ownerUserId)) {
        throw new CoachingFormWorkflowError(
          400,
          "COACHING_FORM_OUTCOME_OWNER_INVALID",
          "Choose an active member of this coaching relationship.",
        );
      }

      const sourceSnapshot = {
        schema: "quipsly-coaching-form-outcome-source-v1",
        assignmentId: assignment.id,
        templateVersionId: assignment.templateVersionId,
        templateRevision: assignment.templateVersion.revision,
        responseRevisionId: response.id,
        responseRevision: response.revision,
        responseInputSha256: response.inputSha256,
        selectedAnswers,
      };
      const sourceSha256 = hash(sourceSnapshot);
      const owner =
        kind === "NOTE"
          ? activeMembers.get(input.actor.id) || {
              id: input.actor.id,
              name: "Coach",
              email: null,
            }
          : activeMembers.get(ownerUserId)!;
      const reviewedPayload = {
        schema: "quipsly-coaching-form-outcome-reviewed-v1",
        title,
        body: detail || null,
        owner,
        visibility: kind === "NOTE" ? visibility : "SHARED",
        targetAt: targetAt instanceof Date ? targetAt.toISOString() : null,
        coachInitiated: true,
      };
      const sourceJson = {
        schema: "quipsly-coaching-form-outcome-v1",
        assignmentId: assignment.id,
        responseRevisionId: response.id,
        responseRevision: response.revision,
        sourceSha256,
        selectedFieldIds,
        promotionRequestId: requestId,
        createdByUserId: input.actor.id,
        origin: "coach-initiated-form-outcome",
        visibility:
          reviewedPayload.visibility === "PRIVATE"
            ? "author-private"
            : "engagement-shared",
        externalSideEffects: false,
        messageSent: false,
        reminderScheduled: false,
        calendarMutated: false,
        published: false,
      };
      const targetId = `coaching-form-${kind.toLowerCase()}-${requestId}`;

      if (kind === "NOTE") {
        await tx.coachingNote.create({
          data: {
            id: targetId,
            roomId: assignment.callRoomId,
            bookingId: assignment.bookingId,
            engagementId: assignment.engagementId,
            authorUserId: input.actor.id,
            kind: "FOLLOW_UP",
            visibility:
              visibility === "PRIVATE" ? "AUTHOR_PRIVATE" : "SESSION_SHARED",
            title,
            body: detail || title,
            sourceJson,
            revisions: {
              create: {
                id: randomUUID(),
                revision: 1,
                operation: "created-from-coach-initiated-form-response",
                actorUserId: input.actor.id,
                snapshotJson: { title, body: detail || title, sourceJson },
              },
            },
          },
        });
      } else if (kind === "TASK") {
        await tx.actionItem.create({
          data: {
            id: targetId,
            roomId: assignment.callRoomId,
            bookingId: assignment.bookingId,
            projectId: assignment.engagement.projectId,
            engagementId: assignment.engagementId,
            assignedUserId: ownerUserId,
            title,
            detail: detail || null,
            status: "OPEN",
            dueAt: targetAt,
            sourceJson,
          },
        });
      } else {
        await tx.goal.create({
          data: {
            id: targetId,
            roomId: assignment.callRoomId,
            bookingId: assignment.bookingId,
            projectId: assignment.engagement.projectId,
            engagementId: assignment.engagementId,
            ownerUserId,
            title,
            description: detail || null,
            status: "ACTIVE",
            targetAt,
            sourceJson,
          },
        });
      }

      const receipt = await tx.coachingFormOutcomePromotionReceipt.create({
        data: {
          id: `coaching-form-outcome-receipt-${requestId}`,
          requestId,
          assignmentId: assignment.id,
          responseRevisionId: response.id,
          actorUserId: input.actor.id,
          kind,
          targetId,
          inputSha256,
          sourceSha256,
          selectedFieldIdsJson:
            selectedFieldIds as unknown as Prisma.InputJsonValue,
          sourceSnapshotJson:
            sourceSnapshot as unknown as Prisma.InputJsonValue,
          reviewedPayloadJson:
            reviewedPayload as unknown as Prisma.InputJsonValue,
        },
      });
      return receiptProjection(receipt, false);
    },
    { isolationLevel: "Serializable" },
  );
}

function receiptProjection(receipt: any, idempotentReplay: boolean) {
  return {
    receipt: {
      id: receipt.id,
      requestId: receipt.requestId,
      assignmentId: receipt.assignmentId,
      responseRevisionId: receipt.responseRevisionId,
      kind: receipt.kind,
      targetId: receipt.targetId,
      sourceSha256: receipt.sourceSha256,
      selectedFieldIds: receipt.selectedFieldIdsJson,
      reviewedPayload: receipt.reviewedPayloadJson,
      createdAt: iso(receipt.createdAt),
    },
    idempotentReplay,
    externalSideEffects: false,
  };
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function boundedText(value: unknown, max = 20_000, preserveLineBreaks = false) {
  if (typeof value !== "string") return "";
  const normalized = preserveLineBreaks
    ? value.trim()
    : value.replace(/\s+/g, " ").trim();
  return normalized.slice(0, max);
}

function boundedIdentifier(value: unknown) {
  const parsed = boundedText(value, 240);
  return parsed && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(parsed) ? parsed : null;
}

function requiredIdentifier(value: unknown, message: string) {
  const parsed = boundedIdentifier(value);
  if (parsed) return parsed;
  throw new CoachingFormWorkflowError(
    400,
    "COACHING_FORM_OUTCOME_ID_INVALID",
    message,
  );
}

function identifiers(value: unknown, message: string) {
  if (!Array.isArray(value)) {
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_OUTCOME_FIELDS_INVALID",
      message,
    );
  }
  const parsed = [
    ...new Set(
      value.map(boundedIdentifier).filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!parsed.length || parsed.length > 40 || parsed.length !== value.length) {
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_OUTCOME_FIELDS_INVALID",
      message,
    );
  }
  return parsed;
}

function positiveInteger(value: unknown, message: string) {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  throw new CoachingFormWorkflowError(
    400,
    "COACHING_FORM_OUTCOME_REVISION_INVALID",
    message,
  );
}

function outcomeKind(value: unknown): OutcomeKind | null {
  const parsed = boundedText(value, 20).toUpperCase() as OutcomeKind;
  return KINDS.has(parsed) ? parsed : null;
}

function optionalDate(value: unknown) {
  const parsed = boundedText(value, 100);
  if (!parsed) return null;
  const date = new Date(parsed);
  return Number.isFinite(date.getTime()) ? date : ("invalid" as const);
}

function requestIdFrom(value: unknown) {
  const parsed = boundedText(value, 80).toLowerCase();
  if (REQUEST_ID.test(parsed)) return parsed;
  throw new CoachingFormWorkflowError(
    400,
    "COACHING_FORM_OUTCOME_REQUEST_ID_INVALID",
    "Refresh and try creating this follow-through again.",
  );
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : value || null;
}

async function lock(tx: any, identity: string) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))
  `;
}

function collision(): never {
  throw new CoachingFormWorkflowError(
    409,
    "COACHING_FORM_OUTCOME_REQUEST_COLLISION",
    "That retry identity belongs to different follow-through. Refresh and try again.",
  );
}

function unavailable(): never {
  throw new CoachingFormWorkflowError(
    404,
    "COACHING_FORM_UNAVAILABLE",
    "This private coaching form is unavailable to this account.",
  );
}
