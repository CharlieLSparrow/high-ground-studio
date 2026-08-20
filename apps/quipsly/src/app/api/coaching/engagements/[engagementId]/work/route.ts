import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { coachingEngagementAccessWhere } from "@/lib/server/coaching-engagement";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

const REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORK_SCHEMA = "quipsly-coaching-engagement-work-v1";
const RECEIPT_LIMIT = 24;

type WorkKind = "NOTE" | "TASK" | "GOAL";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, max: number, preserveLineBreaks = false) {
  if (typeof value !== "string") return "";
  const normalized = preserveLineBreaks
    ? value.trim()
    : value.replace(/\s+/g, " ").trim();
  return normalized.slice(0, max);
}

function kind(value: unknown): WorkKind | null {
  const normalized = text(value, 20).toUpperCase();
  return ["NOTE", "TASK", "GOAL"].includes(normalized)
    ? (normalized as WorkKind)
    : null;
}

function optionalDate(value: unknown) {
  const raw = text(value, 100);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : "invalid";
}

function stableId(
  actorUserId: string,
  clientRequestId: string,
  workKind: WorkKind,
) {
  const digest = createHash("sha256")
    .update(`${actorUserId}|${clientRequestId}|${workKind}`)
    .digest("hex")
    .slice(0, 32);
  return `engagement-${workKind.toLowerCase()}-${digest}`;
}

function priorReceipts(source: Record<string, unknown>) {
  return Array.isArray(source.editReceipts)
    ? source.editReceipts
        .filter(
          (value) =>
            value && typeof value === "object" && !Array.isArray(value),
        )
        .slice(-RECEIPT_LIMIT + 1)
    : [];
}

function notePayload(row: any, actorUserId: string) {
  return {
    id: row.id,
    kind: "NOTE" as const,
    title: row.title,
    body: row.body,
    status: null,
    owner: row.authorUser
      ? {
          id: row.authorUserId,
          label: row.authorUser.name || row.authorUser.primaryEmail,
        }
      : null,
    visibility: row.visibility === "AUTHOR_PRIVATE" ? "PRIVATE" : "SHARED",
    dueAt: null,
    canEdit: row.authorUserId === actorUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function taskPayload(row: any) {
  return {
    id: row.id,
    kind: "TASK" as const,
    title: row.title,
    body: row.detail,
    status: String(row.status),
    owner: row.assignedUser
      ? {
          id: row.assignedUserId,
          label: row.assignedUser.name || row.assignedUser.primaryEmail,
        }
      : null,
    visibility: "SHARED" as const,
    dueAt: row.dueAt?.toISOString() ?? null,
    canEdit: true,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function goalPayload(row: any) {
  return {
    id: row.id,
    kind: "GOAL" as const,
    title: row.title,
    body: row.description,
    status: String(row.status),
    owner: {
      id: row.ownerUserId,
      label: row.owner.name || row.owner.primaryEmail,
    },
    visibility: "SHARED" as const,
    dueAt: row.targetAt?.toISOString() ?? null,
    canEdit: true,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const NOTE_SELECT = {
  id: true,
  authorUserId: true,
  title: true,
  body: true,
  visibility: true,
  createdAt: true,
  updatedAt: true,
  authorUser: { select: { name: true, primaryEmail: true } },
} as const;

const TASK_SELECT = {
  id: true,
  assignedUserId: true,
  title: true,
  detail: true,
  status: true,
  dueAt: true,
  createdAt: true,
  updatedAt: true,
  assignedUser: { select: { name: true, primaryEmail: true } },
} as const;

const GOAL_SELECT = {
  id: true,
  ownerUserId: true,
  title: true,
  description: true,
  status: true,
  targetAt: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { name: true, primaryEmail: true } },
} as const;

function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

/**
 * Nest and Quipsly Capture share this relationship projection. The native app
 * consumes the canonical engagement records instead of maintaining a second
 * task, note, or goal schema. Author-private notes are filtered in the query
 * and never enter another member's response.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ engagementId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return privateJson(
      { ok: false, error: "Sign in before opening this coaching space." },
      401,
    );
  }

  const { engagementId } = await context.params;
  const prisma = getPrismaClient() as any;
  try {
    const [engagement, writable] = await Promise.all([
      prisma.coachingEngagement.findFirst({
        where: coachingEngagementAccessWhere(
          engagementId,
          session.user,
          "read",
        ),
        select: {
          id: true,
          title: true,
          status: true,
          members: {
            where: { status: "ACTIVE" },
            orderBy: { joinedAt: "asc" },
            select: {
              role: true,
              userId: true,
              user: { select: { name: true, primaryEmail: true } },
            },
          },
          notes: {
            where: {
              OR: [
                { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
                { authorUserId: session.user.id },
              ],
            },
            orderBy: { updatedAt: "desc" },
            take: 100,
            select: NOTE_SELECT,
          },
          actionItems: {
            where: {
              sourceJson: {
                path: ["visibility"],
                equals: "engagement-shared",
              },
            },
            orderBy: [{ status: "asc" }, { dueAt: "asc" }],
            take: 100,
            select: TASK_SELECT,
          },
          goals: {
            where: {
              sourceJson: {
                path: ["visibility"],
                equals: "engagement-shared",
              },
            },
            orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
            take: 100,
            select: GOAL_SELECT,
          },
        },
      }),
      prisma.coachingEngagement.findFirst({
        where: coachingEngagementAccessWhere(
          engagementId,
          session.user,
          "write",
        ),
        select: { id: true },
      }),
    ]);

    if (!engagement) {
      return privateJson(
        { ok: false, error: "This coaching relationship is unavailable." },
        404,
      );
    }

    const entries = [
      ...engagement.notes.map((row: any) => notePayload(row, session.user.id)),
      ...engagement.actionItems.map((row: any) => taskPayload(row)),
      ...engagement.goals.map((row: any) => goalPayload(row)),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return privateJson({
      ok: true,
      engagement: {
        id: engagement.id,
        title: engagement.title,
        status: engagement.status,
        canWrite: Boolean(writable),
        currentUserId: session.user.id,
        members: engagement.members.map((member: any) => ({
          id: member.userId,
          label: member.user?.name || member.user?.primaryEmail || "Member",
          role: member.role,
        })),
        entries,
      },
      boundaries: {
        canonicalEngagementRecords: true,
        authorPrivateNotesFilteredServerSide: true,
        externalSideEffects: false,
      },
    });
  } catch (error) {
    console.error("Coaching engagement work read failed", error);
    return privateJson(
      { ok: false, error: "Quipsly could not load this coaching space." },
      503,
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ engagementId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Sign in before adding shared coaching work." },
      { status: 401 },
    );
  }

  const { engagementId } = await context.params;
  const input = record(await request.json().catch(() => ({})));
  const workKind = kind(input.kind);
  const clientRequestId = text(input.clientRequestId, 80).toLowerCase();
  const title = text(input.title, 500);
  const detail = text(input.body, 20_000, true);
  const ownerUserId = text(input.ownerUserId, 240) || session.user.id;
  const targetAt = optionalDate(input.targetAt);
  const noteVisibility =
    text(input.visibility, 20).toUpperCase() === "PRIVATE"
      ? "AUTHOR_PRIVATE"
      : "SESSION_SHARED";

  if (!workKind || !REQUEST_ID.test(clientRequestId) || !title) {
    return NextResponse.json(
      {
        ok: false,
        error: "Choose note, task, or goal and give it a clear name.",
      },
      { status: 400 },
    );
  }
  if (targetAt === "invalid") {
    return NextResponse.json(
      { ok: false, error: "Review the optional target date before saving." },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const id = stableId(session.user.id, clientRequestId, workKind);
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        engagementId,
        workKind,
        title,
        detail,
        ownerUserId,
        targetAt: targetAt?.toISOString() ?? null,
        noteVisibility,
      }),
    )
    .digest("hex");

  try {
    const result = await prisma.$transaction(
      async (tx: any) => {
        const engagement = await tx.coachingEngagement.findFirst({
          where: coachingEngagementAccessWhere(
            engagementId,
            session.user,
            "write",
          ),
          select: {
            id: true,
            projectId: true,
            members: {
              where: { status: "ACTIVE" },
              select: { userId: true },
            },
          },
        });
        if (!engagement) return { kind: "unavailable" as const };
        const memberIds = new Set(
          engagement.members.map((member: { userId: string }) => member.userId),
        );
        if (workKind !== "NOTE" && !memberIds.has(ownerUserId)) {
          return { kind: "invalid-owner" as const };
        }

        const sourceJson = {
          schema: WORK_SCHEMA,
          engagementId,
          clientRequestId,
          requestFingerprint: fingerprint,
          createdByUserId: session.user.id,
          origin: "explicit-human-capture",
          visibility:
            workKind === "NOTE" && noteVisibility === "AUTHOR_PRIVATE"
              ? "author-private"
              : "engagement-shared",
          externalSideEffects: false,
          messageSent: false,
          reminderScheduled: false,
          calendarMutated: false,
          published: false,
        };

        if (workKind === "NOTE") {
          const existing = await tx.coachingNote.findUnique({
            where: { id },
            select: { ...NOTE_SELECT, sourceJson: true },
          });
          if (existing) {
            return record(existing.sourceJson).requestFingerprint ===
              fingerprint
              ? {
                  kind: "saved" as const,
                  entry: notePayload(existing, session.user.id),
                  replay: true,
                }
              : { kind: "conflict" as const };
          }
          const created = await tx.coachingNote.create({
            data: {
              id,
              engagementId,
              authorUserId: session.user.id,
              title,
              body: detail || title,
              kind: "SESSION_NOTE",
              visibility: noteVisibility,
              sourceJson,
              revisions: {
                create: {
                  id: randomUUID(),
                  revision: 1,
                  operation: "created",
                  actorUserId: session.user.id,
                  snapshotJson: {
                    title,
                    body: detail || title,
                    visibility: noteVisibility,
                    sourceJson,
                  },
                },
              },
            },
            select: NOTE_SELECT,
          });
          return {
            kind: "saved" as const,
            entry: notePayload(created, session.user.id),
            replay: false,
          };
        }

        if (workKind === "TASK") {
          const existing = await tx.actionItem.findUnique({
            where: { id },
            select: { ...TASK_SELECT, sourceJson: true },
          });
          if (existing) {
            return record(existing.sourceJson).requestFingerprint ===
              fingerprint
              ? {
                  kind: "saved" as const,
                  entry: taskPayload(existing),
                  replay: true,
                }
              : { kind: "conflict" as const };
          }
          const created = await tx.actionItem.create({
            data: {
              id,
              engagementId,
              projectId: engagement.projectId,
              assignedUserId: ownerUserId,
              title,
              detail: detail || null,
              dueAt: targetAt,
              status: "OPEN",
              sourceJson,
            },
            select: TASK_SELECT,
          });
          return {
            kind: "saved" as const,
            entry: taskPayload(created),
            replay: false,
          };
        }

        const existing = await tx.goal.findUnique({
          where: { id },
          select: { ...GOAL_SELECT, sourceJson: true },
        });
        if (existing) {
          return record(existing.sourceJson).requestFingerprint === fingerprint
            ? {
                kind: "saved" as const,
                entry: goalPayload(existing),
                replay: true,
              }
            : { kind: "conflict" as const };
        }
        const created = await tx.goal.create({
          data: {
            id,
            engagementId,
            projectId: engagement.projectId,
            ownerUserId,
            title,
            description: detail || null,
            targetAt,
            status: "ACTIVE",
            sourceJson,
          },
          select: GOAL_SELECT,
        });
        return {
          kind: "saved" as const,
          entry: goalPayload(created),
          replay: false,
        };
      },
      { isolationLevel: "Serializable" },
    );

    if (result.kind === "unavailable") {
      return NextResponse.json(
        {
          ok: false,
          error: "This coaching relationship is unavailable or read-only.",
        },
        { status: 404 },
      );
    }
    if (result.kind === "invalid-owner") {
      return NextResponse.json(
        {
          ok: false,
          error: "Choose an active member of this coaching relationship.",
        },
        { status: 400 },
      );
    }
    if (result.kind === "conflict") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "That retry identity already belongs to different coaching work.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      idempotentReplay: result.replay,
      entry: result.entry,
      boundaries: {
        explicitHumanCapture: true,
        engagementScoped: true,
        externalSideEffects: false,
        messageSent: false,
        reminderScheduled: false,
        calendarMutated: false,
        published: false,
      },
    });
  } catch (error) {
    console.error("Coaching engagement work creation failed", error);
    return NextResponse.json(
      { ok: false, error: "Quipsly could not save this coaching work." },
      { status: 503 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ engagementId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Sign in before changing coaching work." },
      { status: 401 },
    );
  }
  const { engagementId } = await context.params;
  const input = record(await request.json().catch(() => ({})));
  const workKind = kind(input.kind);
  const id = text(input.id, 240);
  const title = text(input.title, 500);
  const detail = text(input.body, 20_000, true);
  const ownerUserId = text(input.ownerUserId, 240);
  const expectedUpdatedAt = new Date(text(input.expectedUpdatedAt, 100));
  const requestedStatus = text(input.status, 40).toUpperCase();
  const targetAt = optionalDate(input.targetAt);
  if (
    !workKind ||
    !id ||
    !title ||
    !Number.isFinite(expectedUpdatedAt.getTime()) ||
    targetAt === "invalid"
  ) {
    return NextResponse.json(
      { ok: false, error: "Refresh and review this item before saving." },
      { status: 400 },
    );
  }

  const allowedStatus =
    workKind === "TASK"
      ? ["OPEN", "DONE", "CANCELED"]
      : workKind === "GOAL"
        ? ["ACTIVE", "PAUSED", "ACHIEVED", "ARCHIVED"]
        : [];
  if (workKind !== "NOTE" && !allowedStatus.includes(requestedStatus)) {
    return NextResponse.json(
      { ok: false, error: "Choose a valid current status." },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  try {
    const result = await prisma.$transaction(
      async (tx: any) => {
        const engagement = await tx.coachingEngagement.findFirst({
          where: coachingEngagementAccessWhere(
            engagementId,
            session.user,
            "write",
          ),
          select: {
            id: true,
            members: {
              where: { status: "ACTIVE" },
              select: { userId: true },
            },
          },
        });
        if (!engagement) return { kind: "unavailable" as const };
        const memberIds = new Set(
          engagement.members.map((member: { userId: string }) => member.userId),
        );
        if (workKind !== "NOTE" && !memberIds.has(ownerUserId)) {
          return { kind: "invalid-owner" as const };
        }

        if (workKind === "NOTE") {
          const current = await tx.coachingNote.findFirst({
            where: {
              id,
              engagementId,
              authorUserId: session.user.id,
              updatedAt: expectedUpdatedAt,
            },
            select: {
              ...NOTE_SELECT,
              sourceJson: true,
              _count: { select: { revisions: true } },
            },
          });
          if (!current) return { kind: "conflict" as const };
          const visibility =
            text(input.visibility, 20).toUpperCase() === "PRIVATE"
              ? "AUTHOR_PRIVATE"
              : "SESSION_SHARED";
          const updated = await tx.coachingNote.update({
            where: { id },
            data: {
              title,
              body: detail || title,
              visibility,
              revisions: {
                create: {
                  id: randomUUID(),
                  revision: current._count.revisions + 1,
                  operation: "edited",
                  actorUserId: session.user.id,
                  snapshotJson: {
                    title,
                    body: detail || title,
                    visibility,
                    priorUpdatedAt: current.updatedAt.toISOString(),
                  },
                },
              },
            },
            select: NOTE_SELECT,
          });
          return {
            kind: "saved" as const,
            entry: notePayload(updated, session.user.id),
          };
        }

        const current =
          workKind === "TASK"
            ? await tx.actionItem.findFirst({
                where: { id, engagementId, updatedAt: expectedUpdatedAt },
                select: { ...TASK_SELECT, sourceJson: true },
              })
            : await tx.goal.findFirst({
                where: { id, engagementId, updatedAt: expectedUpdatedAt },
                select: { ...GOAL_SELECT, sourceJson: true },
              });
        if (!current) return { kind: "conflict" as const };
        const source = record(current.sourceJson);
        const editReceipt = {
          id: randomUUID(),
          schema: "quipsly-coaching-engagement-work-edit-v1",
          actorUserId: session.user.id,
          changedAt: new Date().toISOString(),
          previous: {
            title: current.title,
            body: workKind === "TASK" ? current.detail : current.description,
            ownerUserId:
              workKind === "TASK"
                ? current.assignedUserId
                : current.ownerUserId,
            status: String(current.status),
            targetAt:
              (workKind === "TASK"
                ? current.dueAt
                : current.targetAt
              )?.toISOString() ?? null,
          },
          next: {
            title,
            body: detail || null,
            ownerUserId,
            status: requestedStatus,
            targetAt: targetAt?.toISOString() ?? null,
          },
          externalSideEffects: false,
        };
        const nextSource = {
          ...source,
          editReceipts: [...priorReceipts(source), editReceipt],
        };
        if (workKind === "TASK") {
          const updated = await tx.actionItem.update({
            where: { id },
            data: {
              title,
              detail: detail || null,
              assignedUserId: ownerUserId,
              dueAt: targetAt,
              status: requestedStatus,
              completedAt: requestedStatus === "DONE" ? new Date() : null,
              sourceJson: nextSource,
            },
            select: TASK_SELECT,
          });
          return { kind: "saved" as const, entry: taskPayload(updated) };
        }
        const updated = await tx.goal.update({
          where: { id },
          data: {
            title,
            description: detail || null,
            ownerUserId,
            targetAt,
            status: requestedStatus,
            achievedAt: requestedStatus === "ACHIEVED" ? new Date() : null,
            sourceJson: nextSource,
          },
          select: GOAL_SELECT,
        });
        return { kind: "saved" as const, entry: goalPayload(updated) };
      },
      { isolationLevel: "Serializable" },
    );

    if (result.kind === "unavailable") {
      return NextResponse.json(
        {
          ok: false,
          error: "This coaching relationship is unavailable or read-only.",
        },
        { status: 404 },
      );
    }
    if (result.kind === "invalid-owner") {
      return NextResponse.json(
        {
          ok: false,
          error: "Choose an active member of this coaching relationship.",
        },
        { status: 400 },
      );
    }
    if (result.kind === "conflict") {
      return NextResponse.json(
        { ok: false, error: "This item changed. Refresh before saving again." },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      entry: result.entry,
      boundaries: {
        explicitHumanEdit: true,
        engagementScoped: true,
        externalSideEffects: false,
      },
    });
  } catch (error) {
    console.error("Coaching engagement work update failed", error);
    return NextResponse.json(
      { ok: false, error: "Quipsly could not update this coaching work." },
      { status: 503 },
    );
  }
}
