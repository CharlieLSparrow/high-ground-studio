import "server-only";

import { createHash } from "node:crypto";
import type {
  CoachingFormAutomationOverrideAction,
  CoachingFormAutomationPolicyStatus,
  CoachingFormAutomationTrigger,
  CoachingFormAutomationVersionMode,
  Prisma,
} from "@prisma/client";

import {
  coachingFormAssignmentInputSha256,
  CoachingFormWorkflowError,
} from "@/lib/server/coaching-form-workflows";

const REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRIGGERS = new Set<CoachingFormAutomationTrigger>([
  "BEFORE_SESSION",
  "AFTER_SESSION",
]);
const STATUSES = new Set<CoachingFormAutomationPolicyStatus>([
  "ACTIVE",
  "PAUSED",
]);
const VERSION_MODES = new Set<CoachingFormAutomationVersionMode>([
  "LATEST_PUBLISHED",
  "PINNED_VERSION",
]);
const OVERRIDE_ACTIONS = new Set<CoachingFormAutomationOverrideAction>([
  "SEND_NOW",
  "SKIP",
  "CLEAR",
]);
const MAX_OFFSET_MINUTES = 365 * 24 * 60;

type Actor = { id: string };

export async function saveCoachingFormAutomationPolicy(input: {
  prisma: any;
  actor: Actor;
  body: unknown;
  now?: Date;
}) {
  const body = record(input.body);
  const requestId = requestIdFrom(body.requestId);
  const policyId = boundedIdentifier(body.policyId);
  const templateId = requiredIdentifier(
    body.templateId,
    "Choose a published form.",
  );
  const engagementId = requiredIdentifier(
    body.engagementId,
    "Choose one coaching relationship.",
  );
  const trigger = enumValue(
    body.trigger,
    TRIGGERS,
    "Choose before or after each Session.",
  );
  const status = enumValue(
    body.status || "ACTIVE",
    STATUSES,
    "Choose whether this rule is active or paused.",
  );
  const versionMode = enumValue(
    body.versionMode || "LATEST_PUBLISHED",
    VERSION_MODES,
    "Choose which published form version this rule should use.",
  );
  const releaseOffsetMinutes = boundedInteger(
    body.releaseOffsetMinutes,
    "Choose when the form should become available.",
  );
  const dueOffsetMinutes = boundedInteger(
    body.dueOffsetMinutes,
    "Choose when the form should be due.",
  );
  validateOffsets(trigger, releaseOffsetMinutes, dueOffsetMinutes);
  const requestedPinnedVersionId = boundedIdentifier(
    body.pinnedTemplateVersionId,
  );
  const snapshotInput = {
    schema: "quipsly-coaching-form-automation-policy-v1",
    ownerCoachUserId: input.actor.id,
    templateId,
    engagementId,
    trigger,
    status,
    versionMode,
    releaseOffsetMinutes,
    dueOffsetMinutes,
    requestedPinnedVersionId,
  };
  const inputSha256 = hash(snapshotInput);

  const saved = await input.prisma.$transaction(
    async (tx: any) => {
      await lock(tx, `coaching-form-automation-policy-request:${requestId}`);
      const replay = await tx.coachingFormAutomationPolicyRevision.findUnique({
        where: { requestId },
        include: { policy: true },
      });
      if (replay) {
        if (
          replay.actorUserId !== input.actor.id ||
          replay.inputSha256 !== inputSha256
        ) {
          collision();
        }
        return { policy: replay.policy, idempotentReplay: true };
      }

      const context = await policyContext({
        prisma: tx,
        actorUserId: input.actor.id,
        templateId,
        engagementId,
      });
      const pinnedTemplateVersionId =
        versionMode === "PINNED_VERSION"
          ? requestedPinnedVersionId || context.latestVersionId
          : null;
      if (
        versionMode === "PINNED_VERSION" &&
        !context.versionIds.has(pinnedTemplateVersionId || "")
      ) {
        unavailable();
      }

      let policy = policyId
        ? await tx.coachingFormAutomationPolicy.findFirst({
            where: {
              id: policyId,
              ownerCoachUserId: input.actor.id,
              templateId,
              engagementId,
              trigger,
            },
          })
        : await tx.coachingFormAutomationPolicy.findUnique({
            where: {
              templateId_engagementId_trigger: {
                templateId,
                engagementId,
                trigger,
              },
            },
          });
      if (policy && policy.ownerCoachUserId !== input.actor.id) unavailable();
      if (policyId && !policy) unavailable();

      if (!policy) {
        policy = await tx.coachingFormAutomationPolicy.create({
          data: {
            ownerCoachUserId: input.actor.id,
            templateId,
            pinnedTemplateVersionId,
            engagementId,
            trigger,
            status,
            versionMode,
            releaseOffsetMinutes,
            dueOffsetMinutes,
            revision: 1,
          },
        });
      } else {
        await lock(tx, `coaching-form-automation-policy:${policy.id}`);
        policy = await tx.coachingFormAutomationPolicy.update({
          where: { id: policy.id },
          data: {
            pinnedTemplateVersionId,
            status,
            versionMode,
            releaseOffsetMinutes,
            dueOffsetMinutes,
            revision: { increment: 1 },
          },
        });
      }
      const snapshot = policySnapshot(policy);
      await tx.coachingFormAutomationPolicyRevision.create({
        data: {
          requestId,
          policyId: policy.id,
          revision: policy.revision,
          actorUserId: input.actor.id,
          inputSha256,
          snapshotJson: snapshot as Prisma.InputJsonValue,
        },
      });
      return { policy, idempotentReplay: false };
    },
    { isolationLevel: "Serializable" },
  );

  const reconciliation =
    saved.policy.status === "ACTIVE"
      ? await reconcileCoachingFormAutomation({
          prisma: input.prisma,
          policyIds: [saved.policy.id],
          now: input.now,
        })
      : emptyReconciliation();
  return {
    policy: await readPolicyProjection(input.prisma, saved.policy.id),
    idempotentReplay: saved.idempotentReplay,
    reconciliation,
    externalSideEffects: false,
  };
}

export async function saveCoachingFormAutomationOverride(input: {
  prisma: any;
  actor: Actor;
  body: unknown;
  now?: Date;
}) {
  const body = record(input.body);
  const requestId = requestIdFrom(body.requestId);
  const policyId = requiredIdentifier(body.policyId, "Choose an automation rule.");
  const bookingId = requiredIdentifier(body.bookingId, "Choose a Session.");
  const action = enumValue(
    body.overrideAction,
    OVERRIDE_ACTIONS,
    "Choose send now, skip, or restore the schedule.",
  );
  const reason = boundedText(body.reason, 500) || null;
  const inputSha256 = hash({
    schema: "quipsly-coaching-form-automation-override-v1",
    actorUserId: input.actor.id,
    policyId,
    bookingId,
    action,
    reason,
  });

  const saved = await input.prisma.$transaction(
    async (tx: any) => {
      await lock(tx, `coaching-form-automation-override-request:${requestId}`);
      const replay = await tx.coachingFormAutomationOverride.findUnique({
        where: { requestId },
      });
      if (replay) {
        if (
          replay.actorUserId !== input.actor.id ||
          replay.inputSha256 !== inputSha256
        ) {
          collision();
        }
        return { override: replay, idempotentReplay: true };
      }
      const policy = await tx.coachingFormAutomationPolicy.findFirst({
        where: {
          id: policyId,
          ownerCoachUserId: input.actor.id,
          engagement: {
            is: {
              bookings: { some: { id: bookingId } },
            },
          },
        },
      });
      if (!policy) unavailable();
      await lock(
        tx,
        `coaching-form-automation-override:${policyId}:${bookingId}`,
      );
      const latest = await tx.coachingFormAutomationOverride.findFirst({
        where: { policyId, bookingId },
        orderBy: { revision: "desc" },
        select: { revision: true },
      });
      const override = await tx.coachingFormAutomationOverride.create({
        data: {
          requestId,
          policyId,
          bookingId,
          actorUserId: input.actor.id,
          action,
          inputSha256,
          reason,
          revision: (latest?.revision || 0) + 1,
        },
      });
      return { override, idempotentReplay: false };
    },
    { isolationLevel: "Serializable" },
  );
  const reconciliation = await reconcileCoachingFormAutomation({
    prisma: input.prisma,
    policyIds: [policyId],
    bookingIds: [bookingId],
    now: input.now,
    allowPausedManualSend: action === "SEND_NOW",
  });
  return {
    override: overrideProjection(saved.override),
    idempotentReplay: saved.idempotentReplay,
    reconciliation,
    externalSideEffects: false,
  };
}

export async function reconcileCoachingFormAutomation(input: {
  prisma: any;
  policyIds?: string[];
  bookingIds?: string[];
  now?: Date;
  limit?: number;
  allowPausedManualSend?: boolean;
}) {
  const now = input.now || new Date();
  const limit = Math.min(Math.max(input.limit || 100, 1), 500);
  const policies = await input.prisma.coachingFormAutomationPolicy.findMany({
    where: {
      status: input.allowPausedManualSend
        ? { in: ["ACTIVE", "PAUSED"] }
        : "ACTIVE",
      ...(input.policyIds?.length ? { id: { in: input.policyIds } } : {}),
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    include: {
      template: {
        include: { versions: { orderBy: { revision: "desc" }, take: 1 } },
      },
      engagement: {
        include: {
          bookings: {
            where: {
              ...(input.bookingIds?.length
                ? { id: { in: input.bookingIds } }
                : {}),
              status: { in: ["CONFIRMED", "COMPLETED"] },
            },
            orderBy: { scheduledStart: "asc" },
            take: limit,
            include: { callRoom: true },
          },
        },
      },
    },
  });

  const summary = emptyReconciliation();
  for (const policy of policies) {
    for (const booking of policy.engagement.bookings) {
      summary.examined += 1;
      const latestOverride =
        await input.prisma.coachingFormAutomationOverride.findFirst({
          where: { policyId: policy.id, bookingId: booking.id },
          orderBy: { revision: "desc" },
        });
      if (latestOverride?.action === "SKIP") {
        summary.skippedByCoach += 1;
        continue;
      }
      const forced = latestOverride?.action === "SEND_NOW";
      const event = policyEvent(policy, booking, forced ? now : null);
      if (!event) {
        summary.waitingForEvent += 1;
        continue;
      }
      if (!forced && event.eligibleAt.getTime() > now.getTime()) {
        summary.waitingForTime += 1;
        continue;
      }
      const result = await materializeAutomationAssignment({
        prisma: input.prisma,
        policyId: policy.id,
        bookingId: booking.id,
        now,
        allowPausedManualSend: Boolean(input.allowPausedManualSend && forced),
      });
      if (result === "CREATED") summary.created += 1;
      else if (result === "EXISTS") summary.alreadyAssigned += 1;
      else if (result === "SKIPPED") summary.skippedByCoach += 1;
      else summary.waitingForEvent += 1;
    }
  }
  return summary;
}

export async function reconcileCoachingFormAutomationForCoach(input: {
  prisma: any;
  actor: Actor;
  now?: Date;
}) {
  const policies = await input.prisma.coachingFormAutomationPolicy.findMany({
    where: { ownerCoachUserId: input.actor.id, status: "ACTIVE" },
    select: { id: true },
    take: 500,
  });
  return reconcileCoachingFormAutomation({
    prisma: input.prisma,
    policyIds: policies.map((policy: { id: string }) => policy.id),
    now: input.now,
    limit: 500,
  });
}

export async function readCoachingFormAutomationOverview(input: {
  prisma: any;
  actor: Actor;
}) {
  const policies = await input.prisma.coachingFormAutomationPolicy.findMany({
    where: { ownerCoachUserId: input.actor.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: policyProjectionInclude,
  });
  return {
    schema: "quipsly-coaching-form-automation-v1",
    policies: policies.map(policyProjection),
    boundaries: {
      relationshipScoped: true,
      exactTemplateVersionReceipts: true,
      exactlyOncePerPolicyEvent: true,
      appendOnlyOverrides: true,
      externalSideEffects: false,
    },
  };
}

async function materializeAutomationAssignment(input: {
  prisma: any;
  policyId: string;
  bookingId: string;
  now: Date;
  allowPausedManualSend: boolean;
}): Promise<"CREATED" | "EXISTS" | "SKIPPED" | "WAITING"> {
  return input.prisma.$transaction(
    async (tx: any) => {
      const eventKey = `coaching-booking:${input.bookingId}`;
      await lock(
        tx,
        `coaching-form-automation-event:${input.policyId}:${eventKey}`,
      );
      const existing = await tx.coachingFormAutomationReceipt.findUnique({
        where: {
          policyId_eventKey: { policyId: input.policyId, eventKey },
        },
      });
      if (existing) return "EXISTS" as const;
      const policy = await tx.coachingFormAutomationPolicy.findFirst({
        where: {
          id: input.policyId,
          status: input.allowPausedManualSend
            ? { in: ["ACTIVE", "PAUSED"] }
            : "ACTIVE",
        },
        include: {
          template: {
            include: {
              versions: { orderBy: { revision: "desc" }, take: 1 },
            },
          },
          engagement: {
            include: {
              members: {
                where: { status: "ACTIVE" },
                select: { userId: true, role: true },
              },
              bookings: {
                where: { id: input.bookingId },
                include: { callRoom: true },
              },
            },
          },
        },
      });
      const booking = policy?.engagement.bookings?.[0];
      if (!policy || !booking) return "WAITING" as const;
      const latestOverride = await tx.coachingFormAutomationOverride.findFirst({
        where: { policyId: policy.id, bookingId: booking.id },
        orderBy: { revision: "desc" },
      });
      if (latestOverride?.action === "SKIP") return "SKIPPED" as const;
      const forced = latestOverride?.action === "SEND_NOW";
      const event = policyEvent(
        policy,
        booking,
        forced ? input.now : null,
      );
      if (!event || (!forced && event.eligibleAt.getTime() > input.now.getTime()))
        return "WAITING" as const;
      const clientIds = new Set<string>([
        ...(policy.engagement.primaryClientUserId
          ? [policy.engagement.primaryClientUserId]
          : []),
        ...policy.engagement.members
          .filter((member: any) => member.role === "CLIENT")
          .map((member: any) => member.userId),
      ]);
      const coachIds = new Set<string>([
        ...(policy.engagement.primaryCoachUserId
          ? [policy.engagement.primaryCoachUserId]
          : []),
        ...policy.engagement.members
          .filter((member: any) => member.role === "COACH")
          .map((member: any) => member.userId),
      ]);
      if (
        !clientIds.has(booking.clientUserId) ||
        !coachIds.has(policy.ownerCoachUserId) ||
        booking.coachUserId !== policy.ownerCoachUserId
      ) {
        return "WAITING" as const;
      }
      const version =
        policy.versionMode === "PINNED_VERSION"
          ? await tx.coachingFormTemplateVersion.findFirst({
              where: {
                id: policy.pinnedTemplateVersionId || "",
                templateId: policy.templateId,
              },
            })
          : policy.template.versions.find(
              (candidate: any) =>
                candidate.revision === policy.template.publishedRevision,
            );
      if (!version || policy.template.status !== "PUBLISHED")
        return "WAITING" as const;

      const timing =
        policy.trigger === "BEFORE_SESSION"
          ? "BEFORE_SESSION"
          : "AFTER_SESSION";
      const assignmentRequestId = deterministicRequestId(
        `coaching-form-automation-assignment:${policy.id}:${eventKey}`,
      );
      const assignmentIntent = {
        templateId: policy.templateId,
        templateVersionId: version.id,
        engagementId: policy.engagementId,
        bookingId: booking.id,
        callRoomId: booking.callRoom?.id || null,
        assignedByUserId: policy.ownerCoachUserId,
        assignedToUserId: booking.clientUserId,
        timing,
        dueAt: event.dueAt.toISOString(),
      };
      const assignment = await tx.coachingFormAssignment.create({
        data: {
          requestId: assignmentRequestId,
          inputSha256:
            coachingFormAssignmentInputSha256(assignmentIntent),
          ...assignmentIntent,
          dueAt: event.dueAt,
        },
      });
      await tx.coachingFormAutomationReceipt.create({
        data: {
          policyId: policy.id,
          bookingId: booking.id,
          callRoomId: booking.callRoom?.id || null,
          templateVersionId: version.id,
          assignmentId: assignment.id,
          trigger: policy.trigger,
          eventKey,
          eventAt: event.eventAt,
          eligibleAt: event.eligibleAt,
          dueAt: event.dueAt,
          manualOverride: forced,
        },
      });
      return "CREATED" as const;
    },
    { isolationLevel: "Serializable" },
  );
}

function policyEvent(policy: any, booking: any, manualEventAt: Date | null = null) {
  let eventAt: Date | null = null;
  if (policy.trigger === "BEFORE_SESSION" && booking.status === "CONFIRMED") {
    eventAt = date(booking.scheduledStart);
  }
  if (policy.trigger === "AFTER_SESSION") {
    eventAt = date(booking.callRoom?.endedAt);
    if (!eventAt && booking.status === "COMPLETED") {
      eventAt = date(booking.scheduledEnd);
    }
    if (!eventAt && manualEventAt) eventAt = manualEventAt;
  }
  if (!eventAt) return null;
  return {
    eventAt,
    eligibleAt: addMinutes(eventAt, policy.releaseOffsetMinutes),
    dueAt: addMinutes(eventAt, policy.dueOffsetMinutes),
  };
}

async function policyContext(input: {
  prisma: any;
  actorUserId: string;
  templateId: string;
  engagementId: string;
}) {
  const [template, engagement] = await Promise.all([
    input.prisma.coachingFormTemplate.findFirst({
      where: {
        id: input.templateId,
        ownerCoachUserId: input.actorUserId,
        status: "PUBLISHED",
        publishedRevision: { not: null },
      },
      include: { versions: { orderBy: { revision: "desc" } } },
    }),
    input.prisma.coachingEngagement.findFirst({
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
      select: { id: true },
    }),
  ]);
  const latestVersion = template?.versions.find(
    (candidate: any) => candidate.revision === template.publishedRevision,
  );
  if (!template || !latestVersion || !engagement) unavailable();
  return {
    latestVersionId: latestVersion.id,
    versionIds: new Set<string>(template.versions.map((item: any) => item.id)),
  };
}

const policyProjectionInclude = {
  template: true,
  pinnedTemplateVersion: { select: { id: true, revision: true } },
  engagement: {
    select: {
      id: true,
      title: true,
      primaryClient: {
        select: { id: true, name: true, primaryEmail: true },
      },
      bookings: {
        where: { status: { in: ["CONFIRMED", "COMPLETED"] as const } },
        orderBy: { scheduledStart: "asc" as const },
        take: 12,
        select: {
          id: true,
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          callRoom: { select: { id: true, title: true, endedAt: true } },
          coachingFormAutomationReceipts: {
            select: { id: true, policyId: true },
          },
          coachingFormAutomationOverrides: {
            orderBy: { revision: "desc" as const },
            take: 50,
            select: {
              id: true,
              policyId: true,
              action: true,
              reason: true,
              revision: true,
              createdAt: true,
            },
          },
        },
      },
    },
  },
  receipts: {
    orderBy: { createdAt: "desc" as const },
    take: 20,
    include: {
      assignment: { select: { id: true, status: true } },
      templateVersion: { select: { id: true, revision: true } },
      booking: {
        select: { id: true, scheduledStart: true },
      },
    },
  },
} as const;

async function readPolicyProjection(prisma: any, policyId: string) {
  const policy = await prisma.coachingFormAutomationPolicy.findUniqueOrThrow({
    where: { id: policyId },
    include: policyProjectionInclude,
  });
  return policyProjection(policy);
}

function policyProjection(policy: any) {
  return {
    id: policy.id,
    status: policy.status,
    trigger: policy.trigger,
    versionMode: policy.versionMode,
    pinnedTemplateVersion: policy.pinnedTemplateVersion,
    releaseOffsetMinutes: policy.releaseOffsetMinutes,
    dueOffsetMinutes: policy.dueOffsetMinutes,
    revision: policy.revision,
    template: {
      id: policy.template.id,
      title: policy.template.title,
      publishedRevision: policy.template.publishedRevision,
    },
    relationship: {
      id: policy.engagement.id,
      title: policy.engagement.title,
      client: person(policy.engagement.primaryClient),
    },
    sessions: (policy.engagement.bookings || []).map((booking: any) => {
      const override = (
        booking.coachingFormAutomationOverrides || []
      ).find((candidate: any) => candidate.policyId === policy.id) || null;
      const receipt = (booking.coachingFormAutomationReceipts || []).find(
        (candidate: any) => candidate.policyId === policy.id,
      );
      const event = policyEvent(policy, booking);
      return {
        id: booking.id,
        status: booking.status,
        scheduledStart: iso(booking.scheduledStart),
        scheduledEnd: iso(booking.scheduledEnd),
        room: booking.callRoom
          ? {
              id: booking.callRoom.id,
              title: booking.callRoom.title,
              endedAt: iso(booking.callRoom.endedAt),
            }
          : null,
        eligibleAt: event ? iso(event.eligibleAt) : null,
        dueAt: event ? iso(event.dueAt) : null,
        assignmentCreated: Boolean(receipt),
        override: override ? overrideProjection(override) : null,
      };
    }),
    receipts: (policy.receipts || []).map((receipt: any) => ({
      id: receipt.id,
      trigger: receipt.trigger,
      eventAt: iso(receipt.eventAt),
      eligibleAt: iso(receipt.eligibleAt),
      dueAt: iso(receipt.dueAt),
      manualOverride: receipt.manualOverride,
      createdAt: iso(receipt.createdAt),
      assignment: receipt.assignment,
      templateRevision: receipt.templateVersion.revision,
      booking: {
        id: receipt.booking.id,
        scheduledStart: iso(receipt.booking.scheduledStart),
      },
    })),
  };
}

function overrideProjection(value: any) {
  return {
    id: value.id,
    action: value.action,
    reason: value.reason,
    revision: value.revision,
    createdAt: iso(value.createdAt),
  };
}

function policySnapshot(policy: any) {
  return {
    schema: "quipsly-coaching-form-automation-policy-snapshot-v1",
    id: policy.id,
    ownerCoachUserId: policy.ownerCoachUserId,
    templateId: policy.templateId,
    pinnedTemplateVersionId: policy.pinnedTemplateVersionId,
    engagementId: policy.engagementId,
    trigger: policy.trigger,
    status: policy.status,
    versionMode: policy.versionMode,
    releaseOffsetMinutes: policy.releaseOffsetMinutes,
    dueOffsetMinutes: policy.dueOffsetMinutes,
    revision: policy.revision,
  };
}

function emptyReconciliation() {
  return {
    examined: 0,
    created: 0,
    alreadyAssigned: 0,
    waitingForTime: 0,
    waitingForEvent: 0,
    skippedByCoach: 0,
  };
}

function validateOffsets(
  trigger: CoachingFormAutomationTrigger,
  releaseOffsetMinutes: number,
  dueOffsetMinutes: number,
) {
  const valid =
    trigger === "BEFORE_SESSION"
      ? releaseOffsetMinutes <= 0 && dueOffsetMinutes >= 0
      : releaseOffsetMinutes >= 0 && dueOffsetMinutes >= releaseOffsetMinutes;
  if (!valid) {
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_AUTOMATION_TIMING_INVALID",
      trigger === "BEFORE_SESSION"
        ? "A before-Session form must arrive before the Session and be due no earlier than its start."
        : "An after-Session form must be due after it becomes available.",
    );
  }
}

function deterministicRequestId(identity: string) {
  const digest = createHash("sha256").update(identity).digest("hex").slice(0, 32);
  const chars = digest.split("");
  chars[12] = "4";
  chars[16] = ["8", "9", "a", "b"][parseInt(chars[16] || "0", 16) % 4];
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function lock(tx: any, identity: string) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))
  `;
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

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<T>,
  message: string,
) {
  const parsed = text(value).toUpperCase() as T;
  if (!allowed.has(parsed)) {
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_AUTOMATION_OPTION_INVALID",
      message,
    );
  }
  return parsed;
}

function boundedInteger(value: unknown, message: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    Math.abs(parsed) > MAX_OFFSET_MINUTES
  ) {
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_AUTOMATION_OFFSET_INVALID",
      message,
    );
  }
  return parsed;
}

function requiredIdentifier(value: unknown, message: string) {
  const parsed = boundedIdentifier(value);
  if (!parsed) {
    throw new CoachingFormWorkflowError(
      400,
      "COACHING_FORM_IDENTITY_INVALID",
      message,
    );
  }
  return parsed;
}

function boundedIdentifier(value: unknown) {
  const parsed = text(value);
  return parsed && parsed.length <= 240 ? parsed : null;
}

function boundedText(value: unknown, maximum: number) {
  return text(value).slice(0, maximum);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60_000);
}

function date(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function iso(value: unknown) {
  return date(value)?.toISOString() || null;
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

function collision(): never {
  throw new CoachingFormWorkflowError(
    409,
    "COACHING_FORM_REQUEST_COLLISION",
    "That save identity belongs to different automation evidence. Refresh and try again.",
  );
}

function unavailable(): never {
  throw new CoachingFormWorkflowError(
    404,
    "COACHING_FORM_UNAVAILABLE",
    "This private coaching automation is unavailable to this account.",
  );
}
