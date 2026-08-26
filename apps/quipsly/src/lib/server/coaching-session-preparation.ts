import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CoachingSessionPreparationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CoachingSessionPreparationError";
  }
}

export type CoachingSessionPreparationProjection = {
  roomId: string;
  bookingId: string;
  role: "client" | "coach";
  revision: number;
  client: {
    focus: string;
    desiredOutcome: string;
    successMeasure: string;
    progressScore: number | null;
    update: string;
    submittedAt: string | null;
  };
  coachPrivate: null | {
    note: string;
    preparedAt: string | null;
  };
  boundaries: {
    clientAnswersSharedWithAssignedCoach: true;
    coachPreparationVisibleOnlyToAssignedCoach: true;
    preparationOptionalBeforeJoining: true;
    noMessageOrReminderSent: true;
    noTaskGoalOrNoteCreated: true;
  };
};

type Actor = { id: string };

type ClientInput = {
  focus: string;
  desiredOutcome: string;
  successMeasure: string;
  progressScore: number | null;
  update: string;
};

type CoachInput = { note: string };

type SaveInput =
  | { operation: "SAVE_CLIENT"; requestId: string; values: ClientInput }
  | { operation: "SAVE_COACH"; requestId: string; values: CoachInput };

export function parseCoachingSessionPreparationInput(value: unknown): SaveInput {
  const row = record(value);
  const operation = text(row.operation).toUpperCase();
  const requestId = text(row.requestId).toLowerCase();
  if (!REQUEST_ID.test(requestId)) {
    throw new CoachingSessionPreparationError(
      400,
      "PREPARATION_REQUEST_ID_INVALID",
      "Refresh this Session and try saving again.",
    );
  }
  if (operation === "SAVE_CLIENT") {
    return {
      operation,
      requestId,
      values: {
        focus: boundedText(row.focus, 2_000, "Session focus"),
        desiredOutcome: boundedText(
          row.desiredOutcome,
          2_000,
          "Desired outcome",
        ),
        successMeasure: boundedText(
          row.successMeasure,
          2_000,
          "Success measure",
        ),
        progressScore: optionalScore(row.progressScore),
        update: boundedText(row.update, 4_000, "Progress update"),
      },
    };
  }
  if (operation === "SAVE_COACH") {
    return {
      operation,
      requestId,
      values: {
        note: boundedText(row.note, 8_000, "Private coach preparation"),
      },
    };
  }
  throw new CoachingSessionPreparationError(
    400,
    "PREPARATION_OPERATION_INVALID",
    "Choose the client check-in or private coach preparation lane.",
  );
}

export async function readCoachingSessionPreparation(input: {
  prisma: any;
  roomId: string;
  actor: Actor;
}): Promise<CoachingSessionPreparationProjection> {
  const booking = await accessibleBooking(input);
  const preparation = await input.prisma.coachingSessionPreparation.findUnique({
    where: { bookingId: booking.id },
  });
  return project({ roomId: input.roomId, booking, preparation, actor: input.actor });
}

export async function saveCoachingSessionPreparation(input: {
  prisma: any;
  roomId: string;
  actor: Actor;
  body: unknown;
}): Promise<{
  preparation: CoachingSessionPreparationProjection;
  savedRevision: number;
  idempotentReplay: boolean;
}> {
  const parsed = parseCoachingSessionPreparationInput(input.body);
  const booking = await accessibleBooking(input);
  const role = actorRole(booking, input.actor.id);
  const lane = parsed.operation === "SAVE_CLIENT" ? "CLIENT_SHARED" : "COACH_PRIVATE";
  if (
    (parsed.operation === "SAVE_CLIENT" && role !== "client") ||
    (parsed.operation === "SAVE_COACH" && role !== "coach")
  ) {
    throw new CoachingSessionPreparationError(
      404,
      "PREPARATION_LANE_UNAVAILABLE",
      "This preparation lane is unavailable to this account.",
    );
  }
  const inputSha256 = hash({
    schema: "quipsly-coaching-session-preparation-request-v1",
    roomId: input.roomId,
    bookingId: booking.id,
    actorUserId: input.actor.id,
    lane,
    values: parsed.values,
  });

  return input.prisma.$transaction(
    async (tx: any) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`coaching-session-preparation:${booking.id}`}, 0)
        )
      `;
      const replay = await tx.coachingSessionPreparationRevision.findUnique({
        where: { requestId: parsed.requestId },
      });
      if (replay) {
        if (
          replay.actorUserId !== input.actor.id ||
          replay.lane !== lane ||
          replay.inputSha256 !== inputSha256
        ) {
          throw new CoachingSessionPreparationError(
            409,
            "PREPARATION_REQUEST_COLLISION",
            "That save identity belongs to a different preparation change. Refresh and try again.",
          );
        }
        const current = await tx.coachingSessionPreparation.findUniqueOrThrow({
          where: { id: replay.preparationId },
        });
        return {
          preparation: project({
            roomId: input.roomId,
            booking,
            preparation: current,
            actor: input.actor,
          }),
          savedRevision: replay.revision,
          idempotentReplay: true,
        };
      }

      let preparation = await tx.coachingSessionPreparation.findUnique({
        where: { bookingId: booking.id },
      });
      if (!preparation) {
        preparation = await tx.coachingSessionPreparation.create({
          data: {
            bookingId: booking.id,
            clientUserId: booking.clientUserId,
            coachUserId: booking.coachUserId,
          },
        });
      }
      const revision = preparation.revision + 1;
      const now = new Date();
      const update = parsed.operation === "SAVE_CLIENT"
        ? {
            clientFocus: parsed.values.focus || null,
            clientDesiredOutcome: parsed.values.desiredOutcome || null,
            clientSuccessMeasure: parsed.values.successMeasure || null,
            clientProgressScore: parsed.values.progressScore,
            clientUpdate: parsed.values.update || null,
            clientSubmittedAt: now,
            revision,
          }
        : {
            coachPrivateNote: parsed.values.note || null,
            coachPreparedAt: now,
            revision,
          };
      const updated = await tx.coachingSessionPreparation.update({
        where: { id: preparation.id },
        data: update,
      });
      const snapshot = parsed.operation === "SAVE_CLIENT"
        ? {
            schema: "quipsly-coaching-session-preparation-snapshot-v1",
            lane,
            client: clientProjection(updated),
          }
        : {
            schema: "quipsly-coaching-session-preparation-snapshot-v1",
            lane,
            coachPrivate: coachPrivateProjection(updated),
          };
      await tx.coachingSessionPreparationRevision.create({
        data: {
          requestId: parsed.requestId,
          preparationId: updated.id,
          actorUserId: input.actor.id,
          lane,
          revision,
          inputSha256,
          snapshotJson: snapshot as Prisma.InputJsonValue,
        },
      });
      return {
        preparation: project({
          roomId: input.roomId,
          booking,
          preparation: updated,
          actor: input.actor,
        }),
        savedRevision: revision,
        idempotentReplay: false,
      };
    },
    { isolationLevel: "Serializable" },
  );
}

async function accessibleBooking(input: {
  prisma: any;
  roomId: string;
  actor: Actor;
}) {
  const room = await input.prisma.callRoom.findFirst({
    where: {
      id: input.roomId,
      purpose: "COACHING",
      booking: {
        is: {
          OR: [
            { clientUserId: input.actor.id },
            { coachUserId: input.actor.id },
          ],
        },
      },
    },
    select: {
      id: true,
      booking: {
        select: {
          id: true,
          clientUserId: true,
          coachUserId: true,
        },
      },
    },
  });
  if (!room?.booking) {
    throw new CoachingSessionPreparationError(
      404,
      "PREPARATION_NOT_FOUND",
      "This private coaching Session is unavailable to this account.",
    );
  }
  return room.booking;
}

function actorRole(
  booking: { clientUserId: string; coachUserId: string | null },
  actorUserId: string,
) {
  if (booking.clientUserId === actorUserId) return "client" as const;
  if (booking.coachUserId === actorUserId) return "coach" as const;
  throw new CoachingSessionPreparationError(
    404,
    "PREPARATION_NOT_FOUND",
    "This private coaching Session is unavailable to this account.",
  );
}

function project(input: {
  roomId: string;
  booking: { id: string; clientUserId: string; coachUserId: string | null };
  preparation: any | null;
  actor: Actor;
}): CoachingSessionPreparationProjection {
  const role = actorRole(input.booking, input.actor.id);
  return {
    roomId: input.roomId,
    bookingId: input.booking.id,
    role,
    revision: input.preparation?.revision || 0,
    client: clientProjection(input.preparation),
    coachPrivate:
      role === "coach" ? coachPrivateProjection(input.preparation) : null,
    boundaries: {
      clientAnswersSharedWithAssignedCoach: true,
      coachPreparationVisibleOnlyToAssignedCoach: true,
      preparationOptionalBeforeJoining: true,
      noMessageOrReminderSent: true,
      noTaskGoalOrNoteCreated: true,
    },
  };
}

function clientProjection(preparation: any | null) {
  return {
    focus: text(preparation?.clientFocus),
    desiredOutcome: text(preparation?.clientDesiredOutcome),
    successMeasure: text(preparation?.clientSuccessMeasure),
    progressScore: optionalPersistedScore(preparation?.clientProgressScore),
    update: text(preparation?.clientUpdate),
    submittedAt: iso(preparation?.clientSubmittedAt),
  };
}

function coachPrivateProjection(preparation: any | null) {
  return {
    note: text(preparation?.coachPrivateNote),
    preparedAt: iso(preparation?.coachPreparedAt),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function boundedText(value: unknown, maximum: number, label: string) {
  const parsed = text(value);
  if (parsed.length > maximum) {
    throw new CoachingSessionPreparationError(
      400,
      "PREPARATION_TEXT_TOO_LONG",
      `${label} must be ${maximum.toLocaleString()} characters or fewer.`,
    );
  }
  return parsed;
}

function optionalScore(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10) {
    throw new CoachingSessionPreparationError(
      400,
      "PREPARATION_PROGRESS_INVALID",
      "Progress must be a whole number from 0 through 10.",
    );
  }
  return parsed;
}

function optionalPersistedScore(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10 ? parsed : null;
}

function iso(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
