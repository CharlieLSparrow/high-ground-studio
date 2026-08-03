import "server-only";

import {
  CLIENT_FOLLOW_UP_MANIFEST_SCHEMA,
  CLIENT_FOLLOW_UP_SCHEMA,
  clientFollowUpRecordSha256Matches,
  clientFollowUpSha256,
} from "./session-client-follow-up";

export const CLIENT_FOLLOW_UP_ATTENTION_SCHEMA =
  "quipsly-client-follow-up-attention-v1";

type AttentionClient = any;

export type ClientFollowUpAttention = {
  schema: typeof CLIENT_FOLLOW_UP_ATTENTION_SCHEMA;
  outputId: string;
  roomId: string;
  sessionTitle: string;
  title: string;
  revision: number;
  contentSha256: string;
  releasedAt: string;
  coachLabel: string;
  selectedCount: number;
  href: string;
};

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function rows(value: unknown): Record<string, any>[] {
  return Array.isArray(value) ? value.map(object) : [];
}

function text(value: unknown, max = 4_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function matchingRecordSnapshot(
  kind: "notes" | "goals" | "tasks",
  bodyRecord: Record<string, any>,
  manifestRecord: Record<string, any>,
) {
  const expected = text(manifestRecord.contentSha256, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  const snapshot = kind === "notes"
    ? {
        title: bodyRecord.title ?? null,
        body: bodyRecord.body ?? null,
        kind: bodyRecord.kind ?? null,
        sourceAnchor: bodyRecord.sourceAnchor ?? null,
      }
    : kind === "goals"
      ? {
          title: bodyRecord.title ?? null,
          description: bodyRecord.description ?? null,
          status: bodyRecord.status ?? null,
          targetAt: bodyRecord.targetAt ?? null,
          sourceAnchor: bodyRecord.sourceAnchor ?? null,
        }
      : {
          title: bodyRecord.title ?? null,
          detail: bodyRecord.detail ?? null,
          status: bodyRecord.status ?? null,
          dueAt: bodyRecord.dueAt ?? null,
          sourceAnchor: bodyRecord.sourceAnchor ?? null,
        };
  return clientFollowUpRecordSha256Matches(snapshot, expected);
}

function selectedCountForVerifiedSnapshot(output: any) {
  const body = object(output.bodyJson);
  const manifest = object(output.sourceManifestJson);
  const manifestRecords = object(manifest.records);
  let count = 0;
  for (const kind of ["notes", "goals", "tasks"] as const) {
    const bodyRows = rows(body[kind]);
    const manifestRows = rows(manifestRecords[kind]);
    const bodyById = new Map(bodyRows.map((row) => [text(row.id, 240), row]));
    const manifestById = new Map(manifestRows.map((row) => [text(row.id, 240), row]));
    if (
      bodyById.size !== bodyRows.length
      || manifestById.size !== manifestRows.length
      || bodyById.size !== manifestById.size
    ) return null;
    for (const [id, bodyRecord] of bodyById) {
      const manifestRecord = manifestById.get(id);
      if (!id || !manifestRecord || !matchingRecordSnapshot(kind, bodyRecord, manifestRecord)) {
        return null;
      }
    }
    count += bodyRows.length;
  }
  return count;
}

export function projectClientFollowUpAttention(
  output: any,
  recipientUserId: string,
): ClientFollowUpAttention | null {
  const room = output?.room;
  const booking = room?.booking;
  const body = object(output?.bodyJson);
  const manifest = object(output?.sourceManifestJson);
  const releasedAt = output?.releasedAt instanceof Date
    ? output.releasedAt
    : new Date(output?.releasedAt ?? "");
  const selectedCount = selectedCountForVerifiedSnapshot(output);
  const session = object(body.session);
  if (
    output?.kind !== "CLIENT_FOLLOW_UP"
    || output?.status !== "RELEASED"
    || output?.recipientUserId !== recipientUserId
    || booking?.clientUserId !== recipientUserId
    || !booking?.coachUserId
    || output?.createdByUserId !== booking.coachUserId
    || body.schema !== CLIENT_FOLLOW_UP_SCHEMA
    || manifest.schema !== CLIENT_FOLLOW_UP_MANIFEST_SCHEMA
    || manifest.roomId !== output.roomId
    || manifest.recipientUserId !== recipientUserId
    || session.id !== output.roomId
    || text(body.title, 500) !== text(output.title, 500)
    || clientFollowUpSha256(body) !== text(output.contentSha256, 64).toLowerCase()
    || selectedCount === null
    || !Number.isFinite(releasedAt.getTime())
  ) return null;

  const opened = (output.deliveries ?? []).some((event: any) => (
    event.kind === "OPENED_IN_APP"
    && event.status === "CONFIRMED"
    && event.outputId === output.id
    && event.roomId === output.roomId
    && event.recipientUserId === recipientUserId
    && event.actorUserId === recipientUserId
    && text(event.contentSha256, 64).toLowerCase()
      === text(output.contentSha256, 64).toLowerCase()
  ));
  if (opened) return null;

  return {
    schema: CLIENT_FOLLOW_UP_ATTENTION_SCHEMA,
    outputId: output.id,
    roomId: output.roomId,
    sessionTitle: text(room.title, 500) || text(session.title, 500) || "Coaching Session",
    title: text(output.title, 500),
    revision: output.revision,
    contentSha256: text(output.contentSha256, 64).toLowerCase(),
    releasedAt: releasedAt.toISOString(),
    coachLabel:
      text(booking.coachUser?.name, 320)
      || text(booking.coachUser?.primaryEmail, 320)
      || "Coach",
    selectedCount,
    href: `/sessions/${encodeURIComponent(output.roomId)}?mode=outputs#client-follow-up`,
  };
}

export async function loadClientFollowUpAttention(
  client: AttentionClient,
  recipientUserId: string,
): Promise<ClientFollowUpAttention | null> {
  if (!recipientUserId) return null;
  const candidates = await client.sessionOutput.findMany({
    where: {
      kind: "CLIENT_FOLLOW_UP",
      status: "RELEASED",
      recipientUserId,
    },
    orderBy: [{ releasedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    take: 25,
    select: {
      id: true,
      roomId: true,
      createdByUserId: true,
      recipientUserId: true,
      kind: true,
      status: true,
      title: true,
      bodyJson: true,
      sourceManifestJson: true,
      contentSha256: true,
      revision: true,
      releasedAt: true,
      updatedAt: true,
      room: {
        select: {
          id: true,
          title: true,
          booking: {
            select: {
              clientUserId: true,
              coachUserId: true,
              coachUser: { select: { name: true, primaryEmail: true } },
            },
          },
        },
      },
      deliveries: {
        where: { kind: "OPENED_IN_APP" },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 10,
        select: {
          outputId: true,
          roomId: true,
          actorUserId: true,
          recipientUserId: true,
          kind: true,
          status: true,
          contentSha256: true,
        },
      },
    },
  });
  for (const candidate of candidates) {
    const projected = projectClientFollowUpAttention(candidate, recipientUserId);
    if (projected) return projected;
  }
  return null;
}
