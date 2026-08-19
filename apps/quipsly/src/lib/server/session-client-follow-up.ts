import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { isUnreviewedTranscriptActionItemSource } from "@high-ground/quipsly-domain/coaching-packet";
import {
  readTranscriptDerivedGoalSource,
  readTranscriptDerivedNoteSource,
  readTranscriptDerivedTaskSource,
} from "@high-ground/quipsly-domain/transcript-derived-task";

import { sessionAccessWhere, type SessionAccessActor } from "./session-access";

export const CLIENT_FOLLOW_UP_SCHEMA = "quipsly-client-follow-up-v1";
export const CLIENT_FOLLOW_UP_MANIFEST_SCHEMA =
  "quipsly-client-follow-up-manifest-v1";

type RestoreClient = any;

type SelectedIds = {
  noteIds: string[];
  taskIds: string[];
  goalIds: string[];
};

type DraftInput = SelectedIds & {
  clientRequestId: string;
  title: string;
  intro: string;
  nextSessionFocus: string;
};

export class ClientFollowUpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function persistedJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clean(value: unknown, max: number) {
  return typeof value === "string"
    ? value.replace(/\r\n/g, "\n").trim().slice(0, max)
    : "";
}

function uniqueIds(value: unknown, max = 100) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.map((item) => clean(item, 240)).filter(Boolean)),
  ].slice(0, max);
}

export function stableClientFollowUpJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => item === undefined
      ? "null"
      : stableClientFollowUpJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nested]) =>
          `${JSON.stringify(key)}:${stableClientFollowUpJson(nested)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function legacyStableClientFollowUpJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(legacyStableClientFollowUpJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nested]) =>
          `${JSON.stringify(key)}:${legacyStableClientFollowUpJson(nested)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function clientFollowUpSha256(value: unknown) {
  return createHash("sha256")
    .update(stableClientFollowUpJson(value))
    .digest("hex");
}

function legacyClientFollowUpSha256(value: unknown) {
  return createHash("sha256")
    .update(legacyStableClientFollowUpJson(value))
    .digest("hex");
}

export function clientFollowUpRecordSha256Matches(
  snapshot: Record<string, unknown>,
  expectedSha256: string,
) {
  const expected = clean(expectedSha256, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  if (clientFollowUpSha256(snapshot) === expected) return true;

  // Releases created before the canonicalizer dropped undefined object fields
  // can contain a record digest that observed an optional sourceSpan as the
  // literal token `undefined`. Persisted JSON correctly omitted that field.
  // Accept the historical digest for readback while every new write uses the
  // JSON-compatible canonical form above.
  if (legacyClientFollowUpSha256(snapshot) === expected) return true;
  const sourceAnchor = object(snapshot.sourceAnchor);
  if (
    Object.keys(sourceAnchor).length > 0
    && !("sourceSpan" in sourceAnchor)
  ) {
    return legacyClientFollowUpSha256({
      ...snapshot,
      sourceAnchor: { ...sourceAnchor, sourceSpan: undefined },
    }) === expected;
  }
  return false;
}

function outputId(
  actorUserId: string,
  roomId: string,
  clientRequestId: string,
) {
  return `client-follow-up-${createHash("sha256")
    .update(`${actorUserId}|${roomId}|${clientRequestId}`)
    .digest("hex")
    .slice(0, 40)}`;
}

function isUniqueConstraintError(error: unknown) {
  return object(error).code === "P2002";
}

function isTransactionConflictError(error: unknown) {
  return object(error).code === "P2034";
}

function outputSnapshot(output: any) {
  return {
    id: output.id,
    roomId: output.roomId,
    createdByUserId: output.createdByUserId,
    recipientUserId: output.recipientUserId,
    kind: output.kind,
    status: output.status,
    title: output.title,
    intro: output.intro,
    nextSessionFocus: output.nextSessionFocus,
    bodyJson: output.bodyJson,
    sourceManifestJson: output.sourceManifestJson,
    contentSha256: output.contentSha256,
    revision: output.revision,
    releasedAt: output.releasedAt?.toISOString?.() ?? output.releasedAt ?? null,
    revokedAt: output.revokedAt?.toISOString?.() ?? output.revokedAt ?? null,
  };
}

const OUTPUT_SELECT = {
  id: true,
  roomId: true,
  createdByUserId: true,
  recipientUserId: true,
  kind: true,
  status: true,
  title: true,
  intro: true,
  nextSessionFocus: true,
  bodyJson: true,
  sourceManifestJson: true,
  contentSha256: true,
  revision: true,
  releasedAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, primaryEmail: true } },
  recipient: { select: { id: true, name: true, primaryEmail: true } },
  deliveries: {
    orderBy: { occurredAt: "asc" as const },
    select: {
      id: true,
      kind: true,
      destination: true,
      status: true,
      actorUserId: true,
      recipientUserId: true,
      occurredAt: true,
      contentSha256: true,
    },
  },
};

function serializeOutput(output: any) {
  if (!output) return null;
  return {
    ...outputSnapshot(output),
    createdAt: output.createdAt.toISOString(),
    updatedAt: output.updatedAt.toISOString(),
    createdBy: {
      id: output.createdBy.id,
      label: output.createdBy.name || output.createdBy.primaryEmail || "Coach",
    },
    recipient: {
      id: output.recipient.id,
      label: output.recipient.name || output.recipient.primaryEmail || "Client",
    },
    body: object(output.bodyJson),
    sourceManifest: object(output.sourceManifestJson),
    deliveryEvents: (output.deliveries || []).map((event: any) => ({
      ...event,
      occurredAt: event.occurredAt.toISOString(),
    })),
  };
}

function serializeRequiredOutput(output: any) {
  const serialized = serializeOutput(output);
  if (!serialized) {
    throw new ClientFollowUpError(
      409,
      "FOLLOW_UP_CHANGED",
      "The client follow-up changed before Quipsly could confirm the operation.",
    );
  }
  return serialized;
}

async function loadBoundary(
  client: RestoreClient,
  roomId: string,
  actor: SessionAccessActor,
) {
  const room = await client.callRoom.findFirst({
    where: sessionAccessWhere(roomId, actor),
    select: {
      id: true,
      title: true,
      purpose: true,
      scheduledStart: true,
      booking: {
        select: {
          id: true,
          clientUserId: true,
          coachUserId: true,
          clientUser: { select: { id: true, name: true, primaryEmail: true } },
          coachUser: { select: { id: true, name: true, primaryEmail: true } },
        },
      },
    },
  });
  if (!room?.booking?.clientUserId) {
    throw new ClientFollowUpError(
      404,
      "FOLLOW_UP_UNAVAILABLE",
      "This account does not have an available coaching follow-up for that Session.",
    );
  }
  const isCoach = room.booking.coachUserId === actor.id;
  const isRecipient = room.booking.clientUserId === actor.id;
  if (!isCoach && !isRecipient) {
    throw new ClientFollowUpError(
      404,
      "FOLLOW_UP_UNAVAILABLE",
      "This account does not have an available coaching follow-up for that Session.",
    );
  }
  return { room, isCoach, isRecipient };
}

async function loadEligibleRecords(client: RestoreClient, room: any) {
  const recipientUserId = room.booking.clientUserId;
  const [notes, taskRows, goals] = await Promise.all([
    client.coachingNote.findMany({
      where: {
        roomId: room.id,
        visibility: "CLIENT_SAFE",
        kind: { in: ["SESSION_NOTE", "FOLLOW_UP", "DECISION"] },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        body: true,
        kind: true,
        sourceJson: true,
        updatedAt: true,
        _count: { select: { revisions: true } },
      },
    }),
    client.actionItem.findMany({
      where: { roomId: room.id, assignedUserId: recipientUserId },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        detail: true,
        status: true,
        dueAt: true,
        completedAt: true,
        sourceJson: true,
        updatedAt: true,
      },
    }),
    client.goal.findMany({
      where: { roomId: room.id, ownerUserId: recipientUserId },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        targetAt: true,
        achievedAt: true,
        sourceJson: true,
        updatedAt: true,
      },
    }),
  ]);
  const tasks = taskRows.filter(
    (task: any) => !isUnreviewedTranscriptActionItemSource(task.sourceJson),
  );
  return { notes, tasks, goals };
}

function eligibleSummary(
  records: Awaited<ReturnType<typeof loadEligibleRecords>>,
  roomId: string,
) {
  return {
    notes: records.notes.map((note: any) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      kind: note.kind,
      sourceAnchor: sourceAnchorForRoom(readTranscriptDerivedNoteSource(note.sourceJson), roomId),
      revisionCount: note._count.revisions,
      updatedAt: note.updatedAt.toISOString(),
    })),
    tasks: records.tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      detail: task.detail,
      status: task.status,
      dueAt: task.dueAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      sourceAnchor: sourceAnchorForRoom(readTranscriptDerivedTaskSource(task.sourceJson), roomId),
      updatedAt: task.updatedAt.toISOString(),
    })),
    goals: records.goals.map((goal: any) => ({
      id: goal.id,
      title: goal.title,
      description: goal.description,
      status: goal.status,
      targetAt: goal.targetAt?.toISOString() ?? null,
      achievedAt: goal.achievedAt?.toISOString() ?? null,
      sourceAnchor: sourceAnchorForRoom(readTranscriptDerivedGoalSource(goal.sourceJson), roomId),
      updatedAt: goal.updatedAt.toISOString(),
    })),
  };
}

function sourceAnchorForRoom<T extends { roomId: string }>(anchor: T | null, roomId: string): T | null {
  return anchor?.roomId === roomId ? anchor : null;
}

function choose<T extends { id: string }>(
  all: T[],
  selected: string[],
  kind: string,
) {
  const byId = new Map(all.map((item) => [item.id, item]));
  const selectedIds = new Set(selected);
  if ([...selectedIds].some((id) => !byId.has(id))) {
    throw new ClientFollowUpError(
      409,
      "SOURCE_SELECTION_CHANGED",
      `One or more selected ${kind} records are no longer eligible for this client follow-up. Refresh before creating a draft.`,
    );
  }
  return all.filter((item) => selectedIds.has(item.id));
}

function draftIntentSha256(input: {
  outputId: string;
  expectedRevision: number;
  draft: DraftInput;
}) {
  return clientFollowUpSha256({
    outputId: input.outputId,
    expectedRevision: input.expectedRevision,
    title: input.draft.title,
    intro: input.draft.intro,
    nextSessionFocus: input.draft.nextSessionFocus,
    noteIds: [...input.draft.noteIds].sort(),
    taskIds: [...input.draft.taskIds].sort(),
    goalIds: [...input.draft.goalIds].sort(),
  });
}

function buildDraftContent(input: {
  room: any;
  records: Awaited<ReturnType<typeof loadEligibleRecords>>;
  selected: SelectedIds;
  title: string;
  intro: string;
  nextSessionFocus: string;
}) {
  const notes = choose(input.records.notes, input.selected.noteIds, "note");
  const tasks = choose(input.records.tasks, input.selected.taskIds, "task");
  const goals = choose(input.records.goals, input.selected.goalIds, "goal");
  const noteSourceAnchor = (note: any) => sourceAnchorForRoom(
    readTranscriptDerivedNoteSource(note.sourceJson),
    input.room.id,
  );
  const taskSourceAnchor = (task: any) => sourceAnchorForRoom(
    readTranscriptDerivedTaskSource(task.sourceJson),
    input.room.id,
  );
  const goalSourceAnchor = (goal: any) => sourceAnchorForRoom(
    readTranscriptDerivedGoalSource(goal.sourceJson),
    input.room.id,
  );
  if (
    notes.length + tasks.length + goals.length === 0 &&
    !input.intro &&
    !input.nextSessionFocus
  ) {
    throw new ClientFollowUpError(
      400,
      "EMPTY_FOLLOW_UP",
      "Choose at least one client-safe note, client-owned goal, client-owned task, or a deliberate follow-up message.",
    );
  }

  const body = persistedJson({
    schema: CLIENT_FOLLOW_UP_SCHEMA,
    title: input.title,
    intro: input.intro || null,
    session: {
      id: input.room.id,
      title: input.room.title || "Coaching Session",
      scheduledStart: input.room.scheduledStart?.toISOString() ?? null,
    },
    notes: notes.map((note: any) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      kind: note.kind,
      sourceAnchor: noteSourceAnchor(note),
    })),
    goals: goals.map((goal: any) => ({
      id: goal.id,
      title: goal.title,
      description: goal.description,
      status: goal.status,
      targetAt: goal.targetAt?.toISOString() ?? null,
      sourceAnchor: goalSourceAnchor(goal),
    })),
    tasks: tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      detail: task.detail,
      status: task.status,
      dueAt: task.dueAt?.toISOString() ?? null,
      sourceAnchor: taskSourceAnchor(task),
    })),
    nextSessionFocus: input.nextSessionFocus || null,
  });
  const sourceManifest = {
    schema: CLIENT_FOLLOW_UP_MANIFEST_SCHEMA,
    roomId: input.room.id,
    recipientUserId: input.room.booking.clientUserId,
    records: {
      notes: notes.map((note: any) => ({
        id: note.id,
        revisionCount: note._count.revisions,
        updatedAt: note.updatedAt.toISOString(),
        sourceAnchor: noteSourceAnchor(note),
        contentSha256: clientFollowUpSha256({
          title: note.title,
          body: note.body,
          kind: note.kind,
          sourceAnchor: noteSourceAnchor(note),
        }),
      })),
      goals: goals.map((goal: any) => ({
        id: goal.id,
        updatedAt: goal.updatedAt.toISOString(),
        sourceAnchor: goalSourceAnchor(goal),
        contentSha256: clientFollowUpSha256({
          title: goal.title,
          description: goal.description,
          status: goal.status,
          targetAt: goal.targetAt?.toISOString() ?? null,
          sourceAnchor: goalSourceAnchor(goal),
        }),
      })),
      tasks: tasks.map((task: any) => ({
        id: task.id,
        updatedAt: task.updatedAt.toISOString(),
        sourceAnchor: taskSourceAnchor(task),
        contentSha256: clientFollowUpSha256({
          title: task.title,
          detail: task.detail,
          status: task.status,
          dueAt: task.dueAt?.toISOString() ?? null,
          sourceAnchor: taskSourceAnchor(task),
        }),
      })),
    },
    boundaries: {
      privateNotesIncluded: false,
      sessionSharedNotesIncluded: false,
      projectTeamNotesIncluded: false,
      unreviewedCandidatesIncluded: false,
      sourceAnchorsRestrictedToSession: true,
      snapshotHashCanonical: true,
      externalMessageSent: false,
      providerCalendarMutated: false,
      publicationPerformed: false,
    },
  };
  return { body, sourceManifest, contentSha256: clientFollowUpSha256(body) };
}

type ClientFollowUpReadinessChange = {
  kind: "FOLLOW_UP" | "NOTE" | "GOAL" | "TASK";
  id: string;
  label: string;
  reason:
    | "SNAPSHOT_INVALID"
    | "MANIFEST_INVALID"
    | "SELECTION_MISMATCH"
    | "NO_LONGER_ELIGIBLE"
    | "CONTENT_CHANGED";
};

function manifestItems(value: unknown) {
  return Array.isArray(value) ? value.map(object) : [];
}

function bodyItems(value: unknown) {
  return Array.isArray(value) ? value.map(object) : [];
}

function bodyRecordLabel(
  body: Record<string, unknown>,
  kind: "notes" | "goals" | "tasks",
  id: string,
) {
  const record = bodyItems(body[kind]).find((item) => clean(item.id, 240) === id);
  return clean(record?.title, 500) || (kind === "notes" ? "Session note" : kind === "goals" ? "Goal" : "Task");
}

function recordContentSnapshot(
  kind: "notes" | "goals" | "tasks",
  record: any,
  roomId: string,
) {
  if (kind === "notes") {
    const sourceAnchor = sourceAnchorForRoom(readTranscriptDerivedNoteSource(record.sourceJson), roomId);
    return {
      title: record.title,
      body: record.body,
      kind: record.kind,
      sourceAnchor,
    };
  }
  if (kind === "goals") {
    const sourceAnchor = sourceAnchorForRoom(readTranscriptDerivedGoalSource(record.sourceJson), roomId);
    return {
      title: record.title,
      description: record.description,
      status: record.status,
      targetAt: record.targetAt?.toISOString() ?? null,
      sourceAnchor,
    };
  }
  const sourceAnchor = sourceAnchorForRoom(readTranscriptDerivedTaskSource(record.sourceJson), roomId);
  return {
    title: record.title,
    detail: record.detail,
    status: record.status,
    dueAt: record.dueAt?.toISOString() ?? null,
    sourceAnchor,
  };
}

export function clientFollowUpDraftReadiness(input: {
  output: any;
  records: Awaited<ReturnType<typeof loadEligibleRecords>>;
}) {
  const output = input.output;
  if (!output || output.status !== "DRAFT") return null;
  const changes: ClientFollowUpReadinessChange[] = [];
  const body = object(output.bodyJson);
  const manifest = object(output.sourceManifestJson);
  const manifestRecords = object(manifest.records);
  const addFollowUpChange = (
    reason: ClientFollowUpReadinessChange["reason"],
    label: string,
  ) => {
    changes.push({ kind: "FOLLOW_UP", id: output.id, label, reason });
  };

  const manifestBoundaries = object(manifest.boundaries);
  if (
    manifestBoundaries.snapshotHashCanonical === true &&
    clientFollowUpSha256(output.bodyJson) !== output.contentSha256
  ) {
    addFollowUpChange("SNAPSHOT_INVALID", "Follow-up snapshot");
  }
  if (
    body.schema !== CLIENT_FOLLOW_UP_SCHEMA ||
    manifest.schema !== CLIENT_FOLLOW_UP_MANIFEST_SCHEMA ||
    manifest.roomId !== output.roomId ||
    manifest.recipientUserId !== output.recipientUserId
  ) {
    addFollowUpChange("MANIFEST_INVALID", "Source manifest");
  }

  const kinds = [
    { bodyKey: "notes", manifestKey: "notes", kind: "NOTE" },
    { bodyKey: "goals", manifestKey: "goals", kind: "GOAL" },
    { bodyKey: "tasks", manifestKey: "tasks", kind: "TASK" },
  ] as const;
  for (const spec of kinds) {
    const current = new Map(input.records[spec.bodyKey].map((item: any) => [item.id, item]));
    const bodyIds = bodyItems(body[spec.bodyKey]).map((item) => clean(item.id, 240)).filter(Boolean);
    const entries = manifestItems(manifestRecords[spec.manifestKey]);
    const manifestIds = entries.map((item) => clean(item.id, 240)).filter(Boolean);
    if (
      new Set(bodyIds).size !== bodyIds.length ||
      new Set(manifestIds).size !== manifestIds.length ||
      [...bodyIds].sort().join("|") !== [...manifestIds].sort().join("|")
    ) {
      addFollowUpChange("SELECTION_MISMATCH", `${spec.kind.toLowerCase()} selection`);
    }
    for (const entry of entries) {
      const id = clean(entry.id, 240);
      const label = bodyRecordLabel(body, spec.bodyKey, id);
      const expectedSha256 = clean(entry.contentSha256, 64).toLowerCase();
      if (!id || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
        changes.push({ kind: spec.kind, id: id || output.id, label, reason: "MANIFEST_INVALID" });
        continue;
      }
      const record = current.get(id);
      if (!record) {
        changes.push({ kind: spec.kind, id, label, reason: "NO_LONGER_ELIGIBLE" });
        continue;
      }
      if (!clientFollowUpRecordSha256Matches(
        recordContentSnapshot(spec.bodyKey, record, output.roomId),
        expectedSha256,
      )) {
        changes.push({ kind: spec.kind, id, label, reason: "CONTENT_CHANGED" });
      }
    }
  }

  return {
    status: changes.length ? ("SOURCE_CHANGED" as const) : ("READY" as const),
    releaseAllowed: changes.length === 0,
    checkedRevision: output.revision,
    selectedCount:
      bodyItems(body.notes).length + bodyItems(body.goals).length + bodyItems(body.tasks).length,
    changedCount: changes.length,
    changes,
  };
}

export async function readClientFollowUp(
  client: RestoreClient,
  input: { roomId: string; actor: SessionAccessActor },
) {
  const boundary = await loadBoundary(client, input.roomId, input.actor);
  const records = boundary.isCoach
    ? await loadEligibleRecords(client, boundary.room)
    : null;
  const output = await client.sessionOutput.findFirst({
    where: boundary.isCoach
      ? {
          roomId: boundary.room.id,
          kind: "CLIENT_FOLLOW_UP",
          createdByUserId: input.actor.id,
          status: { in: ["DRAFT", "RELEASED"] },
        }
      : {
          roomId: boundary.room.id,
          kind: "CLIENT_FOLLOW_UP",
          recipientUserId: input.actor.id,
          status: "RELEASED",
        },
    orderBy: [{ releasedAt: "desc" }, { updatedAt: "desc" }],
    select: OUTPUT_SELECT,
  });
  const readiness = boundary.isCoach && records && output?.status === "DRAFT"
    ? clientFollowUpDraftReadiness({ output, records })
    : null;
  return {
    role: boundary.isCoach ? ("COACH" as const) : ("CLIENT" as const),
    room: {
      id: boundary.room.id,
      title: boundary.room.title || "Coaching Session",
      scheduledStart: boundary.room.scheduledStart?.toISOString() ?? null,
      coach: boundary.room.booking.coachUser
        ? {
            id: boundary.room.booking.coachUser.id,
            label:
              boundary.room.booking.coachUser.name ||
              boundary.room.booking.coachUser.primaryEmail ||
              "Coach",
          }
        : null,
      client: {
        id: boundary.room.booking.clientUser.id,
        label:
          boundary.room.booking.clientUser.name ||
          boundary.room.booking.clientUser.primaryEmail ||
          "Client",
      },
    },
    eligible: records ? eligibleSummary(records, boundary.room.id) : null,
    output: serializeOutput(output),
    readiness,
    boundaries: {
      draftsVisibleToClient: false,
      privateNotesEligible: false,
      unreviewedCandidatesEligible: false,
      externalMessageSent: false,
    },
  };
}

export function parseClientFollowUpDraft(value: unknown): DraftInput {
  const input = object(value);
  return {
    clientRequestId: clean(input.clientRequestId, 80).toLowerCase(),
    title: clean(input.title, 500),
    intro: clean(input.intro, 4_000),
    nextSessionFocus: clean(input.nextSessionFocus, 4_000),
    noteIds: uniqueIds(input.noteIds),
    taskIds: uniqueIds(input.taskIds),
    goalIds: uniqueIds(input.goalIds),
  };
}

export async function createClientFollowUpDraft(
  client: RestoreClient,
  input: { roomId: string; actor: SessionAccessActor; draft: DraftInput },
) {
  const boundary = await loadBoundary(client, input.roomId, input.actor);
  if (!boundary.isCoach) {
    throw new ClientFollowUpError(
      403,
      "COACH_REQUIRED",
      "Only the assigned coach can prepare a client follow-up.",
    );
  }
  if (!input.draft.clientRequestId || !input.draft.title) {
    throw new ClientFollowUpError(
      400,
      "INVALID_INPUT",
      "A stable request identity and follow-up title are required.",
    );
  }
  const id = outputId(
    input.actor.id,
    boundary.room.id,
    input.draft.clientRequestId,
  );
  const records = await loadEligibleRecords(client, boundary.room);
  const content = buildDraftContent({
    room: boundary.room,
    records,
    selected: input.draft,
    title: input.draft.title,
    intro: input.draft.intro,
    nextSessionFocus: input.draft.nextSessionFocus,
  });
  const assertReplayMatches = (output: any) => {
    if (
      output.roomId !== boundary.room.id ||
      output.createdByUserId !== input.actor.id ||
      output.recipientUserId !== boundary.room.booking.clientUserId ||
      output.contentSha256 !== content.contentSha256
    ) {
      throw new ClientFollowUpError(
        409,
        "REQUEST_ID_CONFLICT",
        "That request identity already belongs to a different client follow-up.",
      );
    }
    return {
      output: serializeRequiredOutput(output),
      idempotentReplay: true,
    };
  };
  const existing = await client.sessionOutput.findUnique({
    where: { id },
    select: OUTPUT_SELECT,
  });
  if (existing) {
    return assertReplayMatches(existing);
  }

  try {
    const created = await client.sessionOutput.create({
      data: {
        id,
        roomId: boundary.room.id,
        createdByUserId: input.actor.id,
        recipientUserId: boundary.room.booking.clientUserId,
        kind: "CLIENT_FOLLOW_UP",
        status: "DRAFT",
        title: input.draft.title,
        intro: input.draft.intro || null,
        nextSessionFocus: input.draft.nextSessionFocus || null,
        bodyJson: content.body,
        sourceManifestJson: content.sourceManifest,
        contentSha256: content.contentSha256,
        revision: 1,
        revisions: {
          create: {
            id: randomUUID(),
            revision: 1,
            operation: "DRAFT_CREATED",
            actorUserId: input.actor.id,
            snapshotJson: {
              ...content,
              title: input.draft.title,
              intro: input.draft.intro || null,
              nextSessionFocus: input.draft.nextSessionFocus || null,
              status: "DRAFT",
            },
          },
        },
      },
      select: OUTPUT_SELECT,
    });
    return {
      output: serializeRequiredOutput(created),
      idempotentReplay: false,
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await client.sessionOutput.findUnique({
      where: { id },
      select: OUTPUT_SELECT,
    });
    if (!raced) throw error;
    return assertReplayMatches(raced);
  }
}

export async function updateClientFollowUpDraft(
  client: RestoreClient,
  input: {
    roomId: string;
    outputId: string;
    actor: SessionAccessActor;
    expectedRevision: number;
    draft: DraftInput;
  },
) {
  const boundary = await loadBoundary(client, input.roomId, input.actor);
  if (!boundary.isCoach) {
    throw new ClientFollowUpError(
      403,
      "COACH_REQUIRED",
      "Only the assigned coach can revise a private client follow-up draft.",
    );
  }
  if (
    !input.draft.clientRequestId ||
    !input.draft.title ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  ) {
    throw new ClientFollowUpError(
      400,
      "INVALID_INPUT",
      "A stable request identity, title, and current draft revision are required.",
    );
  }
  const intentSha256 = draftIntentSha256({
    outputId: input.outputId,
    expectedRevision: input.expectedRevision,
    draft: input.draft,
  });

  const assertReplayMatches = async (revision: any) => {
    const snapshot = object(revision?.snapshotJson);
    const request = object(snapshot.request);
    if (
      revision?.outputId !== input.outputId ||
      revision?.actorUserId !== input.actor.id ||
      revision?.operation !== "DRAFT_UPDATED" ||
      request.intentSha256 !== intentSha256
    ) {
      throw new ClientFollowUpError(
        409,
        "REQUEST_ID_CONFLICT",
        "That request identity already belongs to a different follow-up revision.",
      );
    }
    const output = await client.sessionOutput.findFirst({
      where: {
        id: input.outputId,
        roomId: boundary.room.id,
        createdByUserId: input.actor.id,
        recipientUserId: boundary.room.booking.clientUserId,
        kind: "CLIENT_FOLLOW_UP",
      },
      select: OUTPUT_SELECT,
    });
    return {
      output: serializeRequiredOutput(output),
      idempotentReplay: true,
    };
  };

  const existingRevision = await client.sessionOutputRevision.findUnique({
    where: { id: input.draft.clientRequestId },
    select: {
      id: true,
      outputId: true,
      operation: true,
      actorUserId: true,
      snapshotJson: true,
    },
  });
  if (existingRevision) return assertReplayMatches(existingRevision);

  const current = await client.sessionOutput.findFirst({
    where: {
      id: input.outputId,
      roomId: boundary.room.id,
      createdByUserId: input.actor.id,
      recipientUserId: boundary.room.booking.clientUserId,
      kind: "CLIENT_FOLLOW_UP",
    },
    select: OUTPUT_SELECT,
  });
  if (!current) {
    throw new ClientFollowUpError(
      404,
      "FOLLOW_UP_NOT_FOUND",
      "That private client follow-up draft is unavailable.",
    );
  }
  if (current.status !== "DRAFT") {
    throw new ClientFollowUpError(
      409,
      "DRAFT_NOT_EDITABLE",
      "Only a private draft can be revised. Prepare a new draft instead of rewriting released history.",
    );
  }
  if (current.revision !== input.expectedRevision) {
    throw new ClientFollowUpError(
      409,
      "STALE_FOLLOW_UP",
      "The private draft changed before this save. Refresh and review the current revision.",
    );
  }

  const nextRevision = current.revision + 1;
  try {
    const updated = await client.$transaction(
      async (tx: any) => {
        const freshBoundary = await loadBoundary(tx, input.roomId, input.actor);
        if (!freshBoundary.isCoach) {
          throw new ClientFollowUpError(
            403,
            "COACH_REQUIRED",
            "Only the assigned coach can revise a private client follow-up draft.",
          );
        }
        const records = await loadEligibleRecords(tx, freshBoundary.room);
        const content = buildDraftContent({
          room: freshBoundary.room,
          records,
          selected: input.draft,
          title: input.draft.title,
          intro: input.draft.intro,
          nextSessionFocus: input.draft.nextSessionFocus,
        });
        const changed = await tx.sessionOutput.updateMany({
          where: {
            id: current.id,
            roomId: freshBoundary.room.id,
            kind: "CLIENT_FOLLOW_UP",
            createdByUserId: input.actor.id,
            recipientUserId: freshBoundary.room.booking.clientUserId,
            status: "DRAFT",
            revision: current.revision,
          },
          data: {
            title: input.draft.title,
            intro: input.draft.intro || null,
            nextSessionFocus: input.draft.nextSessionFocus || null,
            bodyJson: content.body,
            sourceManifestJson: content.sourceManifest,
            contentSha256: content.contentSha256,
            revision: nextRevision,
          },
        });
        if (changed.count !== 1) {
          throw new ClientFollowUpError(
            409,
            "STALE_FOLLOW_UP",
            "The private draft changed before this save. Refresh and review the current revision.",
          );
        }
        await tx.sessionOutputRevision.create({
          data: {
            id: input.draft.clientRequestId,
            outputId: current.id,
            revision: nextRevision,
            operation: "DRAFT_UPDATED",
            actorUserId: input.actor.id,
            snapshotJson: {
              ...content,
              title: input.draft.title,
              intro: input.draft.intro || null,
              nextSessionFocus: input.draft.nextSessionFocus || null,
              status: "DRAFT",
              revision: nextRevision,
              request: {
                clientRequestId: input.draft.clientRequestId,
                expectedRevision: input.expectedRevision,
                intentSha256,
                externalMessageSent: false,
                providerCalendarMutated: false,
                publicationPerformed: false,
              },
            },
          },
        });
        return tx.sessionOutput.findUnique({
          where: { id: current.id },
          select: OUTPUT_SELECT,
        });
      },
      { isolationLevel: "Serializable" },
    );
    return {
      output: serializeRequiredOutput(updated),
      idempotentReplay: false,
    };
  } catch (error) {
    if (isTransactionConflictError(error)) {
      throw new ClientFollowUpError(
        409,
        "STALE_FOLLOW_UP",
        "The private draft changed before this save. Refresh and review the current revision.",
      );
    }
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await client.sessionOutputRevision.findUnique({
      where: { id: input.draft.clientRequestId },
      select: {
        id: true,
        outputId: true,
        operation: true,
        actorUserId: true,
        snapshotJson: true,
      },
    });
    if (!raced) throw error;
    return assertReplayMatches(raced);
  }
}

async function transitionOutput(
  client: RestoreClient,
  input: {
    roomId: string;
    outputId: string;
    actor: SessionAccessActor;
    expectedRevision: number;
    clientRequestId: string;
    action: "RELEASE" | "REVOKE";
  },
) {
  const boundary = await loadBoundary(client, input.roomId, input.actor);
  if (!boundary.isCoach) {
    throw new ClientFollowUpError(
      403,
      "COACH_REQUIRED",
      "Only the assigned coach can change client follow-up visibility.",
    );
  }
  const current = await client.sessionOutput.findFirst({
    where: {
      id: input.outputId,
      roomId: boundary.room.id,
      createdByUserId: input.actor.id,
      recipientUserId: boundary.room.booking.clientUserId,
      kind: "CLIENT_FOLLOW_UP",
    },
    select: OUTPUT_SELECT,
  });
  if (!current)
    throw new ClientFollowUpError(
      404,
      "FOLLOW_UP_NOT_FOUND",
      "That client follow-up is unavailable.",
    );

  const nextStatus = input.action === "RELEASE" ? "RELEASED" : "REVOKED";
  const expectedStatus = input.action === "RELEASE" ? "DRAFT" : "RELEASED";
  const eventKind = input.action === "RELEASE" ? "RELEASED_IN_APP" : "REVOKED";
  const alreadyApplied = current.status === nextStatus;
  if (alreadyApplied) {
    const replay = await client.deliveryEvent.findUnique({
      where: {
        actorUserId_clientRequestId: {
          actorUserId: input.actor.id,
          clientRequestId: input.clientRequestId,
        },
      },
    });
    if (
      !replay ||
      replay.outputId !== current.id ||
      replay.kind !== eventKind
    ) {
      throw new ClientFollowUpError(
        409,
        "REQUEST_ID_CONFLICT",
        "That visibility request identity belongs to a different operation.",
      );
    }
    return { output: serializeRequiredOutput(current), idempotentReplay: true };
  }
  if (
    current.status !== expectedStatus ||
    current.revision !== input.expectedRevision
  ) {
    throw new ClientFollowUpError(
      409,
      "STALE_FOLLOW_UP",
      "The client follow-up changed before this visibility decision. Refresh before trying again.",
    );
  }

  const now = new Date();
  const nextRevision = current.revision + 1;
  const updated = await client.$transaction(
    async (tx: any) => {
      const freshBoundary = await loadBoundary(tx, input.roomId, input.actor);
      if (!freshBoundary.isCoach) {
        throw new ClientFollowUpError(
          403,
          "COACH_REQUIRED",
          "Only the assigned coach can change client follow-up visibility.",
        );
      }
      const freshCurrent = await tx.sessionOutput.findFirst({
        where: {
          id: current.id,
          roomId: freshBoundary.room.id,
          createdByUserId: input.actor.id,
          recipientUserId: freshBoundary.room.booking.clientUserId,
          kind: "CLIENT_FOLLOW_UP",
          status: expectedStatus,
          revision: current.revision,
        },
        select: OUTPUT_SELECT,
      });
      if (!freshCurrent) {
        throw new ClientFollowUpError(
          409,
          "STALE_FOLLOW_UP",
          "The client follow-up changed before this visibility decision.",
        );
      }
      if (input.action === "RELEASE") {
        const records = await loadEligibleRecords(tx, freshBoundary.room);
        const readiness = clientFollowUpDraftReadiness({
          output: freshCurrent,
          records,
        });
        if (!readiness?.releaseAllowed) {
          throw new ClientFollowUpError(
            409,
            "FOLLOW_UP_SOURCE_CHANGED",
            "One or more selected notes, goals, or tasks changed after this private draft was saved. Review and save a current private revision before release.",
            { readiness },
          );
        }
      }
      const changed = await tx.sessionOutput.updateMany({
        where: {
          id: freshCurrent.id,
          roomId: freshBoundary.room.id,
          createdByUserId: input.actor.id,
          recipientUserId: freshBoundary.room.booking.clientUserId,
          kind: "CLIENT_FOLLOW_UP",
          status: expectedStatus,
          revision: freshCurrent.revision,
        },
        data: {
          status: nextStatus,
          revision: nextRevision,
          releasedAt: input.action === "RELEASE" ? now : freshCurrent.releasedAt,
          revokedAt: input.action === "REVOKE" ? now : null,
        },
      });
      if (changed.count !== 1) {
        throw new ClientFollowUpError(
          409,
          "STALE_FOLLOW_UP",
          "The client follow-up changed before this visibility decision.",
        );
      }
      await tx.sessionOutputRevision.create({
        data: {
          id: randomUUID(),
          outputId: freshCurrent.id,
          revision: nextRevision,
          operation: input.action === "RELEASE" ? "RELEASED_IN_APP" : "REVOKED",
          actorUserId: input.actor.id,
          snapshotJson: {
            ...outputSnapshot(freshCurrent),
            status: nextStatus,
            revision: nextRevision,
            releasedAt:
              input.action === "RELEASE"
                ? now.toISOString()
                : (freshCurrent.releasedAt?.toISOString() ?? null),
            revokedAt: input.action === "REVOKE" ? now.toISOString() : null,
          },
        },
      });
      await tx.deliveryEvent.create({
        data: {
          id: randomUUID(),
          outputId: freshCurrent.id,
          roomId: freshCurrent.roomId,
          actorUserId: input.actor.id,
          recipientUserId: freshCurrent.recipientUserId,
          kind: eventKind,
          destination: "quipsly-session",
          status: "CONFIRMED",
          contentSha256: freshCurrent.contentSha256,
          clientRequestId: input.clientRequestId,
          occurredAt: now,
          metadataJson: {
            inAppVisibilityChanged: true,
            externalMessageSent: false,
            providerCalendarMutated: false,
            publicationPerformed: false,
          },
        },
      });
      return tx.sessionOutput.findUnique({
        where: { id: freshCurrent.id },
        select: OUTPUT_SELECT,
      });
    },
    { isolationLevel: "Serializable" },
  );
  return { output: serializeRequiredOutput(updated), idempotentReplay: false };
}

export function releaseClientFollowUp(
  client: RestoreClient,
  input: {
    roomId: string;
    outputId: string;
    actor: SessionAccessActor;
    expectedRevision: number;
    clientRequestId: string;
  },
) {
  return transitionOutput(client, { ...input, action: "RELEASE" });
}

export function revokeClientFollowUp(
  client: RestoreClient,
  input: {
    roomId: string;
    outputId: string;
    actor: SessionAccessActor;
    expectedRevision: number;
    clientRequestId: string;
  },
) {
  return transitionOutput(client, { ...input, action: "REVOKE" });
}

export async function acknowledgeClientFollowUp(
  client: RestoreClient,
  input: {
    roomId: string;
    outputId: string;
    actor: SessionAccessActor;
    clientRequestId: string;
  },
) {
  const boundary = await loadBoundary(client, input.roomId, input.actor);
  if (!boundary.isRecipient) {
    throw new ClientFollowUpError(
      403,
      "CLIENT_REQUIRED",
      "Only the intended client can confirm opening this follow-up.",
    );
  }
  const output = await client.sessionOutput.findFirst({
    where: {
      id: input.outputId,
      roomId: boundary.room.id,
      recipientUserId: input.actor.id,
      kind: "CLIENT_FOLLOW_UP",
      status: "RELEASED",
    },
    select: OUTPUT_SELECT,
  });
  if (!output)
    throw new ClientFollowUpError(
      404,
      "FOLLOW_UP_NOT_FOUND",
      "That released follow-up is unavailable.",
    );
  const existing = await client.deliveryEvent.findUnique({
    where: {
      actorUserId_clientRequestId: {
        actorUserId: input.actor.id,
        clientRequestId: input.clientRequestId,
      },
    },
  });
  if (existing) {
    if (existing.outputId !== output.id || existing.kind !== "OPENED_IN_APP") {
      throw new ClientFollowUpError(
        409,
        "REQUEST_ID_CONFLICT",
        "That readback request identity belongs to a different operation.",
      );
    }
    return { output: serializeRequiredOutput(output), idempotentReplay: true };
  }
  await client.deliveryEvent.create({
    data: {
      id: randomUUID(),
      outputId: output.id,
      roomId: output.roomId,
      actorUserId: input.actor.id,
      recipientUserId: input.actor.id,
      kind: "OPENED_IN_APP",
      destination: "quipsly-session",
      status: "CONFIRMED",
      contentSha256: output.contentSha256,
      clientRequestId: input.clientRequestId,
      occurredAt: new Date(),
      metadataJson: {
        recipientConfirmedOpen: true,
        externalMessageSent: false,
      },
    },
  });
  const refreshed = await client.sessionOutput.findUnique({
    where: { id: output.id },
    select: OUTPUT_SELECT,
  });
  return {
    output: serializeRequiredOutput(refreshed),
    idempotentReplay: false,
  };
}

export async function exportClientFollowUp(
  client: RestoreClient,
  input: {
    roomId: string;
    outputId: string;
    actor: SessionAccessActor;
    clientRequestId: string;
    expectedRevision: number;
    expectedContentSha256: string;
  },
) {
  const boundary = await loadBoundary(client, input.roomId, input.actor);
  const output = await client.sessionOutput.findFirst({
    where: boundary.isCoach
      ? {
          id: input.outputId,
          roomId: boundary.room.id,
          createdByUserId: input.actor.id,
          kind: "CLIENT_FOLLOW_UP",
          status: { in: ["DRAFT", "RELEASED"] },
        }
      : {
          id: input.outputId,
          roomId: boundary.room.id,
          recipientUserId: input.actor.id,
          kind: "CLIENT_FOLLOW_UP",
          status: "RELEASED",
        },
    select: OUTPUT_SELECT,
  });
  if (!output) {
    throw new ClientFollowUpError(
      404,
      "FOLLOW_UP_NOT_FOUND",
      "That client follow-up is unavailable for file export.",
    );
  }
  if (
    output.revision !== input.expectedRevision ||
    output.contentSha256 !== input.expectedContentSha256
  ) {
    throw new ClientFollowUpError(
      409,
      "FOLLOW_UP_CHANGED",
      "The client-safe snapshot changed before Quipsly could record this file export. Refresh and try again.",
    );
  }
  const existing = await client.deliveryEvent.findUnique({
    where: {
      actorUserId_clientRequestId: {
        actorUserId: input.actor.id,
        clientRequestId: input.clientRequestId,
      },
    },
  });
  if (existing) {
    if (existing.outputId !== output.id || existing.kind !== "EXPORTED") {
      throw new ClientFollowUpError(
        409,
        "REQUEST_ID_CONFLICT",
        "That export request identity belongs to a different operation.",
      );
    }
    return { output: serializeRequiredOutput(output), idempotentReplay: true };
  }
  await client.deliveryEvent.create({
    data: {
      id: randomUUID(),
      outputId: output.id,
      roomId: output.roomId,
      actorUserId: input.actor.id,
      recipientUserId: output.recipientUserId,
      kind: "EXPORTED",
      destination: "local-file",
      status: "CONFIRMED",
      contentSha256: output.contentSha256,
      clientRequestId: input.clientRequestId,
      occurredAt: new Date(),
      metadataJson: {
        format: "text/markdown",
        localFilePrepared: true,
        externalDeliveryConfirmed: false,
        sourceRecordsChanged: false,
      },
    },
  });
  const refreshed = await client.sessionOutput.findUnique({
    where: { id: output.id },
    select: OUTPUT_SELECT,
  });
  return {
    output: serializeRequiredOutput(refreshed),
    idempotentReplay: false,
  };
}
