import "server-only";

import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import {
  createEpisodeMilestone,
  EPISODE_MILESTONE_KINDS,
  EPISODE_MILESTONE_STATUSES,
  EpisodeMilestoneError,
  type EpisodeMilestoneKind,
  type EpisodeMilestoneStatus,
  type EpisodeMilestoneUpdate,
  updateEpisodeMilestone,
} from "@/lib/server/episode-production-milestones";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

export const PRODUCTION_MILESTONE_KINDS = EPISODE_MILESTONE_KINDS;
export const PRODUCTION_MILESTONE_STATUSES = EPISODE_MILESTONE_STATUSES;

type MilestoneActor = {
  id: string;
  primaryEmail: string;
};

export class ProductionMilestoneOperationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProductionMilestoneOperationError";
  }
}

function string(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function requiredDate(value: unknown, label: string) {
  const date = new Date(typeof value === "string" ? value : "");
  if (Number.isNaN(date.getTime())) {
    throw new ProductionMilestoneOperationError(
      `Choose a valid ${label}.`,
      "invalid-production-milestone-time",
      400,
    );
  }
  return date;
}

function optionalDate(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  return requiredDate(value, label);
}

function timezone(value: unknown) {
  const result = string(value, 100) || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: result }).format(new Date());
    return result;
  } catch {
    throw new ProductionMilestoneOperationError(
      "Choose a valid IANA timezone.",
      "invalid-production-milestone-timezone",
      400,
    );
  }
}

function kind(value: unknown): EpisodeMilestoneKind {
  if (
    typeof value === "string"
    && EPISODE_MILESTONE_KINDS.includes(value as EpisodeMilestoneKind)
  ) {
    return value as EpisodeMilestoneKind;
  }
  throw new ProductionMilestoneOperationError(
    "Choose a supported production milestone type.",
    "invalid-production-milestone-kind",
    400,
  );
}

function status(value: unknown): EpisodeMilestoneStatus {
  if (
    typeof value === "string"
    && EPISODE_MILESTONE_STATUSES.includes(value as EpisodeMilestoneStatus)
  ) {
    return value as EpisodeMilestoneStatus;
  }
  throw new ProductionMilestoneOperationError(
    "Choose a supported milestone status.",
    "invalid-production-milestone-status",
    400,
  );
}

function assertTimeWindow(startsAt: Date, endsAt: Date | null) {
  if (endsAt && endsAt <= startsAt) {
    throw new ProductionMilestoneOperationError(
      "A reserved production window must end after it starts.",
      "invalid-production-milestone-window",
      400,
    );
  }
}

function operationError(error: unknown): never {
  if (!(error instanceof EpisodeMilestoneError)) throw error;
  const code = error.code === "revision-conflict"
    ? "production-milestone-revision-conflict"
    : error.code === "request-conflict"
      ? "production-milestone-idempotency-conflict"
      : error.code === "not-found"
        ? "production-milestone-not-found"
        : `production-milestone-${error.code}`;
  throw new ProductionMilestoneOperationError(error.message, code, error.status);
}

async function writableEpisode(input: {
  prisma: any;
  actor: MilestoneActor;
  episodeProductionId: string;
}) {
  const episode = await input.prisma.studioEpisodeProduction.findUnique({
    where: { id: input.episodeProductionId },
    select: {
      id: true,
      title: true,
      slug: true,
      project: { select: { id: true, slug: true } },
    },
  });
  if (!episode) {
    throw new ProductionMilestoneOperationError(
      "That episode is unavailable.",
      "episode-not-found",
      404,
    );
  }
  const access = await resolveStudioProjectAccess({
    projectSlug: episode.project.slug,
    email: input.actor.primaryEmail,
    action: "write",
    prisma: input.prisma,
  });
  if (!access.allowed || access.projectId !== episode.project.id) {
    throw new ProductionMilestoneOperationError(
      "That episode is unavailable.",
      "episode-not-found",
      404,
    );
  }
  return episode;
}

function revisionRequestId(input: {
  actorId: string;
  milestoneId: string;
  expectedRevision: number;
  patch: EpisodeMilestoneUpdate;
}) {
  const digest = createHash("sha256").update(JSON.stringify({
    actorId: input.actorId,
    milestoneId: input.milestoneId,
    expectedRevision: input.expectedRevision,
    patch: {
      ...input.patch,
      startsAt: input.patch.startsAt?.toISOString(),
      endsAt: input.patch.endsAt instanceof Date
        ? input.patch.endsAt.toISOString()
        : input.patch.endsAt,
    },
  })).digest("hex");
  return `calendar-revision-${digest}`;
}

export async function createProductionMilestone(input: {
  prisma: any;
  actor: MilestoneActor;
  body: Record<string, unknown>;
}) {
  const episodeProductionId = string(input.body.episodeProductionId, 191);
  const requestId = string(input.body.requestId, 120);
  const title = string(input.body.title, 160);
  const detail = string(input.body.detail, 2_000) || null;
  const startsAt = requiredDate(input.body.startsAt, "milestone start");
  const endsAt = optionalDate(input.body.endsAt, "milestone end");
  const milestoneKind = kind(input.body.kind);
  const milestoneTimezone = timezone(input.body.timezone);
  if (
    !episodeProductionId
    || !requestId
    || !/^[A-Za-z0-9_-]{8,120}$/.test(requestId)
    || !title
  ) {
    throw new ProductionMilestoneOperationError(
      "Choose an episode, title, type, and start before saving the milestone.",
      "incomplete-production-milestone",
      400,
    );
  }
  assertTimeWindow(startsAt, endsAt);
  const episode = await writableEpisode({
    prisma: input.prisma,
    actor: input.actor,
    episodeProductionId,
  });

  try {
    const clientRequestId = `calendar-create-${createHash("sha256")
      .update(`${input.actor.id}\0${requestId}`)
      .digest("hex")}`;
    const persisted = await createEpisodeMilestone({
      prisma: input.prisma as PrismaClient,
      projectId: episode.project.id,
      episodeProductionId,
      actor: { id: input.actor.id, email: input.actor.primaryEmail },
      clientRequestId,
      milestone: {
        kind: milestoneKind,
        title,
        detail,
        startsAt,
        endsAt,
        timezone: milestoneTimezone,
      },
    });
    return {
      milestone: persisted.milestone,
      episode: { id: episode.id, title: episode.title, slug: episode.slug },
      idempotentReplay: persisted.replayed,
      externalSideEffects: false as const,
    };
  } catch (error) {
    return operationError(error);
  }
}

export async function reviseProductionMilestone(input: {
  prisma: any;
  actor: MilestoneActor;
  milestoneId: string;
  body: Record<string, unknown>;
}) {
  const expectedRevision = Number(input.body.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new ProductionMilestoneOperationError(
      "Refresh the current milestone before saving this change.",
      "invalid-production-milestone-revision",
      400,
    );
  }
  const current = await input.prisma.studioEpisodeMilestone.findUnique({
    where: { id: input.milestoneId },
    select: { episodeProductionId: true },
  });
  if (!current) {
    throw new ProductionMilestoneOperationError(
      "That production milestone is unavailable.",
      "production-milestone-not-found",
      404,
    );
  }
  const episode = await writableEpisode({
    prisma: input.prisma,
    actor: input.actor,
    episodeProductionId: current.episodeProductionId,
  });
  const patch: EpisodeMilestoneUpdate = {};
  if (input.body.status !== undefined) patch.status = status(input.body.status);
  if (input.body.kind !== undefined) patch.kind = kind(input.body.kind);
  if (input.body.title !== undefined) patch.title = string(input.body.title, 160);
  if (input.body.detail !== undefined) patch.detail = string(input.body.detail, 2_000) || null;
  if (input.body.startsAt !== undefined) patch.startsAt = requiredDate(input.body.startsAt, "milestone start");
  if (input.body.endsAt !== undefined) patch.endsAt = optionalDate(input.body.endsAt, "milestone end");
  if (input.body.timezone !== undefined) patch.timezone = timezone(input.body.timezone);
  if (Object.keys(patch).length === 0) {
    throw new ProductionMilestoneOperationError(
      "Choose at least one milestone change.",
      "incomplete-production-milestone-revision",
      400,
    );
  }

  try {
    const persisted = await updateEpisodeMilestone({
      prisma: input.prisma as PrismaClient,
      projectId: episode.project.id,
      episodeProductionId: current.episodeProductionId,
      milestoneId: input.milestoneId,
      actor: { id: input.actor.id, email: input.actor.primaryEmail },
      clientRequestId: revisionRequestId({
        actorId: input.actor.id,
        milestoneId: input.milestoneId,
        expectedRevision,
        patch,
      }),
      expectedRevision,
      patch,
    });
    return {
      milestone: persisted.milestone,
      idempotentReplay: persisted.replayed,
      externalSideEffects: false as const,
    };
  } catch (error) {
    return operationError(error);
  }
}
