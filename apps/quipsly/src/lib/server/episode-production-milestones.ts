import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { normalizeAccessEmail } from "@/lib/server/studio-project-access";

export const EPISODE_MILESTONE_KINDS = [
  "RESEARCH_LOCK",
  "RUN_OF_SHOW_READY",
  "TECH_CHECK",
  "RECORDING",
  "SOURCE_UPLOAD_VERIFIED",
  "TRANSCRIPT_REVIEW",
  "ROUGH_CUT",
  "EDITORIAL_REVIEW",
  "FINAL_APPROVAL",
  "SCHEDULED_PUBLICATION",
  "RELEASE",
  "CLIPS_WINDOW",
  "FOLLOW_UP",
  "CUSTOM",
] as const;

export const EPISODE_MILESTONE_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
] as const;

export type EpisodeMilestoneKind = (typeof EPISODE_MILESTONE_KINDS)[number];
export type EpisodeMilestoneStatus = (typeof EPISODE_MILESTONE_STATUSES)[number];

export type EpisodeMilestoneActor = {
  id?: string | null;
  email: string;
};

export type EpisodeMilestoneInput = {
  kind: EpisodeMilestoneKind;
  title: string;
  detail?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  timezone: string;
  assigneeUserId?: string | null;
  dependsOnMilestoneId?: string | null;
};

export type EpisodeMilestoneUpdate = Partial<EpisodeMilestoneInput> & {
  status?: EpisodeMilestoneStatus;
};

export class EpisodeMilestoneError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid-input"
      | "not-found"
      | "revision-conflict"
      | "request-conflict"
      | "invalid-assignee"
      | "invalid-dependency"
      | "dependency-incomplete",
    readonly status = 400,
  ) {
    super(message);
    this.name = "EpisodeMilestoneError";
  }
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function cleanInput(input: EpisodeMilestoneInput): EpisodeMilestoneInput {
  const title = input.title.trim().replace(/\s+/g, " ").slice(0, 160);
  const detail = String(input.detail ?? "").trim().slice(0, 2_000) || null;
  const timezone = input.timezone.trim().slice(0, 100);
  if (!EPISODE_MILESTONE_KINDS.includes(input.kind) || !title) {
    throw new EpisodeMilestoneError("Choose a milestone type and title.", "invalid-input");
  }
  if (!Number.isFinite(input.startsAt.getTime()) || (input.endsAt && !Number.isFinite(input.endsAt.getTime()))) {
    throw new EpisodeMilestoneError("Choose a valid milestone date and time.", "invalid-input");
  }
  if (input.endsAt && input.endsAt <= input.startsAt) {
    throw new EpisodeMilestoneError("A milestone window must end after it starts.", "invalid-input");
  }
  if (!timezone || !validTimezone(timezone)) {
    throw new EpisodeMilestoneError("Choose a valid IANA timezone.", "invalid-input");
  }
  return {
    kind: input.kind,
    title,
    detail,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    timezone,
    assigneeUserId: input.assigneeUserId?.trim() || null,
    dependsOnMilestoneId: input.dependsOnMilestoneId?.trim() || null,
  };
}

function milestoneSnapshot(input: {
  milestone: {
    id: string;
    stableId: string;
    episodeProductionId: string;
    kind: string;
    title: string;
    detail: string | null;
    startsAt: Date;
    endsAt: Date | null;
    timezone: string;
    status: string;
    assigneeUserId: string | null;
    dependsOnMilestoneId: string | null;
    revision: number;
    completedAt: Date | null;
    canceledAt: Date | null;
  };
  clientRequestId: string;
  requestDigest: string;
}) {
  const milestone = input.milestone;
  return {
    schema: "quipsly-episode-milestone-revision-v1",
    milestoneId: milestone.id,
    stableId: milestone.stableId,
    episodeProductionId: milestone.episodeProductionId,
    revision: milestone.revision,
    kind: milestone.kind,
    title: milestone.title,
    detail: milestone.detail,
    startsAt: milestone.startsAt.toISOString(),
    endsAt: milestone.endsAt?.toISOString() ?? null,
    timezone: milestone.timezone,
    status: milestone.status,
    assigneeUserId: milestone.assigneeUserId,
    dependsOnMilestoneId: milestone.dependsOnMilestoneId,
    completedAt: milestone.completedAt?.toISOString() ?? null,
    canceledAt: milestone.canceledAt?.toISOString() ?? null,
    clientRequestId: input.clientRequestId,
    requestDigest: input.requestDigest,
    externalCalendarMutated: false,
  };
}

const milestoneSelect = {
  id: true,
  stableId: true,
  episodeProductionId: true,
  kind: true,
  title: true,
  detail: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  status: true,
  assigneeUserId: true,
  dependsOnMilestoneId: true,
  revision: true,
  completedAt: true,
  canceledAt: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, primaryEmail: true, name: true } },
  dependsOn: { select: { id: true, title: true, status: true } },
} satisfies Prisma.StudioEpisodeMilestoneSelect;

type MilestoneRow = Prisma.StudioEpisodeMilestoneGetPayload<{ select: typeof milestoneSelect }>;

export function projectEpisodeMilestone(row: MilestoneRow) {
  const dependencyIncomplete = Boolean(
    row.dependsOn && row.dependsOn.status !== "COMPLETED",
  );
  return {
    id: row.id,
    stableId: row.stableId,
    episodeProductionId: row.episodeProductionId,
    kind: row.kind,
    title: row.title,
    detail: row.detail,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    timezone: row.timezone,
    status: row.status,
    revision: row.revision,
    assignee: row.assignee
      ? {
          id: row.assignee.id,
          email: row.assignee.primaryEmail,
          label: row.assignee.name || row.assignee.primaryEmail,
        }
      : null,
    dependsOn: row.dependsOn
      ? {
          id: row.dependsOn.id,
          title: row.dependsOn.title,
          status: row.dependsOn.status,
        }
      : null,
    blocked: row.status !== "CANCELED" && dependencyIncomplete,
    completedAt: row.completedAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listEpisodeMilestones(
  prisma: PrismaClient,
  episodeProductionId: string,
) {
  const rows = await prisma.studioEpisodeMilestone.findMany({
    where: { episodeProductionId },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    select: milestoneSelect,
  });
  return rows.map(projectEpisodeMilestone);
}

export async function listEpisodeMilestoneAssignees(
  prisma: PrismaClient,
  projectId: string,
  actorUserId?: string | null,
) {
  const grants = await prisma.studioProjectAccessGrant.findMany({
    where: {
      projectId,
      status: "ACTIVE",
      role: { in: ["OWNER", "EDITOR"] },
    },
    select: { email: true },
  });
  const emails = [...new Set(grants.map((grant) => normalizeAccessEmail(grant.email)).filter(Boolean))];
  if (!emails.length && !actorUserId) return [];
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        ...(emails.length ? [{ primaryEmail: { in: emails } }, { aliases: { some: { email: { in: emails } } } }] : []),
        ...(actorUserId ? [{ id: actorUserId }] : []),
      ],
    },
    orderBy: [{ name: "asc" }, { primaryEmail: "asc" }],
    select: { id: true, primaryEmail: true, name: true },
  });
  return users.map((user) => ({
    id: user.id,
    email: user.primaryEmail,
    label: user.name || user.primaryEmail,
  }));
}

async function assertAssignee(
  tx: Prisma.TransactionClient,
  projectId: string,
  assigneeUserId: string | null | undefined,
  actorUserId?: string | null,
) {
  if (!assigneeUserId) return;
  const assignees = await listEpisodeMilestoneAssignees(tx as unknown as PrismaClient, projectId, actorUserId);
  if (!assignees.some((candidate) => candidate.id === assigneeUserId)) {
    throw new EpisodeMilestoneError(
      "Assign this milestone to an active Nest owner or editor.",
      "invalid-assignee",
      403,
    );
  }
}

async function assertDependency(
  tx: Prisma.TransactionClient,
  input: {
    milestoneId?: string;
    episodeProductionId: string;
    dependsOnMilestoneId?: string | null;
  },
) {
  if (!input.dependsOnMilestoneId) return null;
  if (input.dependsOnMilestoneId === input.milestoneId) {
    throw new EpisodeMilestoneError("A milestone cannot depend on itself.", "invalid-dependency");
  }
  let cursor: string | null = input.dependsOnMilestoneId;
  let directDependency: { id: string; episodeProductionId: string; dependsOnMilestoneId: string | null; status: string } | null = null;
  for (let depth = 0; depth < 100 && cursor; depth += 1) {
    const row: { id: string; episodeProductionId: string; dependsOnMilestoneId: string | null; status: string } | null =
      await tx.studioEpisodeMilestone.findUnique({
        where: { id: cursor },
        select: { id: true, episodeProductionId: true, dependsOnMilestoneId: true, status: true },
      });
    if (!row || row.episodeProductionId !== input.episodeProductionId) {
      throw new EpisodeMilestoneError(
        "A milestone can depend only on another milestone in this episode.",
        "invalid-dependency",
      );
    }
    if (row.id === input.milestoneId) {
      throw new EpisodeMilestoneError("That dependency would create a cycle.", "invalid-dependency");
    }
    directDependency ??= row;
    if (depth === 99 && row.dependsOnMilestoneId) {
      throw new EpisodeMilestoneError("The milestone dependency chain is too deep.", "invalid-dependency");
    }
    cursor = row.dependsOnMilestoneId;
  }
  return directDependency;
}

export async function createEpisodeMilestone(input: {
  prisma: PrismaClient;
  projectId: string;
  episodeProductionId: string;
  actor: EpisodeMilestoneActor;
  clientRequestId: string;
  milestone: EpisodeMilestoneInput;
}) {
  const clean = cleanInput(input.milestone);
  const actorEmail = normalizeAccessEmail(input.actor.email);
  if (!actorEmail || !input.clientRequestId.trim()) {
    throw new EpisodeMilestoneError("A verified actor and request identity are required.", "invalid-input");
  }
  const clientRequestId = input.clientRequestId.trim().slice(0, 160);
  const requestDigest = sha256({
    episodeProductionId: input.episodeProductionId,
    ...clean,
    startsAt: clean.startsAt.toISOString(),
    endsAt: clean.endsAt?.toISOString() ?? null,
  });
  const stableId = `episode-milestone-${sha256({ episodeProductionId: input.episodeProductionId, clientRequestId }).slice(0, 32)}`;

  return input.prisma.$transaction(async (tx) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `quipsly:episode-milestone:${input.episodeProductionId}`);
    const existing = await tx.studioEpisodeMilestone.findUnique({
      where: { stableId },
      select: milestoneSelect,
    });
    if (existing) {
      const revision = await tx.studioEpisodeMilestoneRevision.findUnique({
        where: { milestoneId_revision: { milestoneId: existing.id, revision: 1 } },
        select: { snapshotJson: true },
      });
      const snapshot = revision?.snapshotJson as Record<string, unknown> | undefined;
      if (snapshot?.requestDigest !== requestDigest) {
        throw new EpisodeMilestoneError(
          "That create request was already used for different milestone details.",
          "request-conflict",
          409,
        );
      }
      return { milestone: projectEpisodeMilestone(existing), replayed: true };
    }
    const episode = await tx.studioEpisodeProduction.findUnique({
      where: { id: input.episodeProductionId },
      select: { id: true, projectId: true },
    });
    if (!episode || episode.projectId !== input.projectId) {
      throw new EpisodeMilestoneError("Episode production not found.", "not-found", 404);
    }
    await assertAssignee(tx, input.projectId, clean.assigneeUserId, input.actor.id);
    await assertDependency(tx, {
      episodeProductionId: input.episodeProductionId,
      dependsOnMilestoneId: clean.dependsOnMilestoneId,
    });
    const row = await tx.studioEpisodeMilestone.create({
      data: {
        episodeProductionId: input.episodeProductionId,
        stableId,
        kind: clean.kind,
        title: clean.title,
        detail: clean.detail,
        startsAt: clean.startsAt,
        endsAt: clean.endsAt,
        timezone: clean.timezone,
        assigneeUserId: clean.assigneeUserId,
        dependsOnMilestoneId: clean.dependsOnMilestoneId,
        createdByUserId: input.actor.id || null,
        createdByEmail: actorEmail,
      },
      select: milestoneSelect,
    });
    await tx.studioEpisodeMilestoneRevision.create({
      data: {
        milestoneId: row.id,
        revision: 1,
        operation: `CREATE:${clientRequestId}`,
        actorUserId: input.actor.id || null,
        actorEmail,
        snapshotJson: json(milestoneSnapshot({ milestone: row, clientRequestId, requestDigest })),
      },
    });
    return { milestone: projectEpisodeMilestone(row), replayed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateEpisodeMilestone(input: {
  prisma: PrismaClient;
  projectId: string;
  episodeProductionId: string;
  milestoneId: string;
  actor: EpisodeMilestoneActor;
  clientRequestId: string;
  expectedRevision: number;
  patch: EpisodeMilestoneUpdate;
}) {
  const actorEmail = normalizeAccessEmail(input.actor.email);
  const clientRequestId = input.clientRequestId.trim().slice(0, 160);
  if (!actorEmail || !clientRequestId || input.expectedRevision < 1) {
    throw new EpisodeMilestoneError("A verified actor, request identity, and revision are required.", "invalid-input");
  }
  if (input.patch.kind && !EPISODE_MILESTONE_KINDS.includes(input.patch.kind)) {
    throw new EpisodeMilestoneError("Choose a valid milestone type.", "invalid-input");
  }
  if (input.patch.status && !EPISODE_MILESTONE_STATUSES.includes(input.patch.status)) {
    throw new EpisodeMilestoneError("Choose a valid milestone status.", "invalid-input");
  }
  const operation = `UPDATE:${clientRequestId}`;
  const requestDigest = sha256({
    milestoneId: input.milestoneId,
    expectedRevision: input.expectedRevision,
    patch: {
      ...input.patch,
      startsAt: input.patch.startsAt?.toISOString(),
      endsAt: input.patch.endsAt instanceof Date ? input.patch.endsAt.toISOString() : input.patch.endsAt,
    },
  });

  return input.prisma.$transaction(async (tx) => {
    // Dependency validation is episode-wide. Serializing only on the edited
    // milestone would allow concurrent A -> B and B -> A updates to both pass
    // their cycle checks before either transaction commits.
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `quipsly:episode-milestone:${input.episodeProductionId}`,
    );
    const replay = await tx.studioEpisodeMilestoneRevision.findFirst({
      where: { milestoneId: input.milestoneId, operation },
      select: { snapshotJson: true },
    });
    if (replay) {
      const snapshot = replay.snapshotJson as Record<string, unknown>;
      if (snapshot.requestDigest !== requestDigest) {
        throw new EpisodeMilestoneError(
          "That update request was already used for different milestone details.",
          "request-conflict",
          409,
        );
      }
      const row = await tx.studioEpisodeMilestone.findUnique({ where: { id: input.milestoneId }, select: milestoneSelect });
      if (!row) throw new EpisodeMilestoneError("Milestone not found.", "not-found", 404);
      return { milestone: projectEpisodeMilestone(row), replayed: true };
    }

    const current = await tx.studioEpisodeMilestone.findUnique({
      where: { id: input.milestoneId },
      select: milestoneSelect,
    });
    if (!current || current.episodeProductionId !== input.episodeProductionId) {
      throw new EpisodeMilestoneError("Milestone not found.", "not-found", 404);
    }
    const episode = await tx.studioEpisodeProduction.findUnique({
      where: { id: input.episodeProductionId },
      select: { projectId: true },
    });
    if (!episode || episode.projectId !== input.projectId) {
      throw new EpisodeMilestoneError("Episode production not found.", "not-found", 404);
    }
    if (current.revision !== input.expectedRevision) {
      throw new EpisodeMilestoneError(
        `Milestone changed from revision ${input.expectedRevision} to ${current.revision}. Refresh before saving.`,
        "revision-conflict",
        409,
      );
    }

    const next = cleanInput({
      kind: input.patch.kind ?? current.kind,
      title: input.patch.title ?? current.title,
      detail: input.patch.detail === undefined ? current.detail : input.patch.detail,
      startsAt: input.patch.startsAt ?? current.startsAt,
      endsAt: input.patch.endsAt === undefined ? current.endsAt : input.patch.endsAt,
      timezone: input.patch.timezone ?? current.timezone,
      assigneeUserId: input.patch.assigneeUserId === undefined ? current.assigneeUserId : input.patch.assigneeUserId,
      dependsOnMilestoneId: input.patch.dependsOnMilestoneId === undefined
        ? current.dependsOnMilestoneId
        : input.patch.dependsOnMilestoneId,
    });
    const nextStatus = input.patch.status ?? current.status;
    await assertAssignee(tx, input.projectId, next.assigneeUserId, input.actor.id);
    const dependency = await assertDependency(tx, {
      milestoneId: current.id,
      episodeProductionId: input.episodeProductionId,
      dependsOnMilestoneId: next.dependsOnMilestoneId,
    });
    if (nextStatus === "COMPLETED" && dependency && dependency.status !== "COMPLETED") {
      throw new EpisodeMilestoneError(
        "Complete the prerequisite milestone before completing this one.",
        "dependency-incomplete",
        409,
      );
    }
    const now = new Date();
    const row = await tx.studioEpisodeMilestone.update({
      where: { id: current.id },
      data: {
        kind: next.kind,
        title: next.title,
        detail: next.detail,
        startsAt: next.startsAt,
        endsAt: next.endsAt,
        timezone: next.timezone,
        status: nextStatus,
        assigneeUserId: next.assigneeUserId,
        dependsOnMilestoneId: next.dependsOnMilestoneId,
        revision: { increment: 1 },
        completedAt: nextStatus === "COMPLETED" ? current.completedAt ?? now : null,
        canceledAt: nextStatus === "CANCELED" ? current.canceledAt ?? now : null,
      },
      select: milestoneSelect,
    });
    await tx.studioEpisodeMilestoneRevision.create({
      data: {
        milestoneId: row.id,
        revision: row.revision,
        operation,
        actorUserId: input.actor.id || null,
        actorEmail,
        snapshotJson: json(milestoneSnapshot({ milestone: row, clientRequestId, requestDigest })),
      },
    });
    return { milestone: projectEpisodeMilestone(row), replayed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
