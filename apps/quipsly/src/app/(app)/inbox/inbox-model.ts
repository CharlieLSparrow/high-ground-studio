import {
  mergePacketActionCandidates,
  selectLatestCorrelatedPacketNotes,
} from "@/lib/server/coaching-packets";

export type InboxRoom = {
  id: string;
  title: string | null;
  purpose: string;
  updatedAt: Date | string;
  project?: { id: string; name: string; slug: string } | null;
  notes: Array<{
    id: string;
    kind: string;
    title?: string | null;
    body: string;
    sourceJson: unknown;
    createdAt: Date | string;
    updatedAt: Date | string;
  }>;
  actionItems?: Array<{
    id: string;
    roomId?: string | null;
    title: string;
    detail?: string | null;
    sourceJson: unknown;
  }>;
};

export type InboxReviewItem = {
  id: string;
  kind: "SOURCE" | "ACTION" | "GOAL" | "LANE";
  state: "READY" | "REVISE" | "DEFERRED";
  title: string;
  detail: string | null;
  roomId: string | null;
  roomTitle: string | null;
  project: { id: string; name: string; slug: string } | null;
  segmentId: string | null;
  sourceLabel: string;
  updatedAt: string;
  captureCount?: number;
};

export type InboxPersonalCapture = {
  id: string;
  captureType: "SNIPPET" | "BOOKMARK";
  title: string;
  excerpt: string;
  updatedAt: Date | string;
  captureCount?: number;
  lastCapturedAt?: Date | string | null;
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function items(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item)) : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function iso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function stateFromActionStatus(status: string): InboxReviewItem["state"] | null {
  if (status === "READY_FOR_HUMAN_REVIEW") return "READY";
  if (status === "EDITED_FOR_REVIEW") return "REVISE";
  if (status === "DEFERRED_BY_HUMAN") return "DEFERRED";
  return null;
}

function stateFromGoalDecision(decision: string): InboxReviewItem["state"] | null {
  if (!decision) return "READY";
  if (decision === "EDIT") return "REVISE";
  if (decision === "DEFER") return "DEFERRED";
  return null;
}

function stateFromLaneStatus(status: string): InboxReviewItem["state"] | null {
  if (status === "READY_FOR_HUMAN_REVIEW") return "READY";
  if (status === "NEEDS_REVISION") return "REVISE";
  return null;
}

export function buildInboxSnapshot(rooms: InboxRoom[], personalCaptures: InboxPersonalCapture[] = []) {
  const reviewItems: InboxReviewItem[] = [];

  for (const capture of personalCaptures) {
    reviewItems.push({
      id: capture.id,
      kind: "SOURCE",
      state: "READY",
      title: text(capture.title) || (capture.captureType === "BOOKMARK" ? "Saved link" : "Saved passage"),
      detail: text(capture.excerpt) || null,
      roomId: null,
      roomTitle: null,
      project: null,
      segmentId: null,
      sourceLabel: capture.captureType === "BOOKMARK" ? "iPhone link capture" : "iPhone passage capture",
      updatedAt: iso(capture.lastCapturedAt || capture.updatedAt),
      captureCount: Math.max(1, capture.captureCount || 0),
    });
  }

  for (const room of rooms) {
    const packet = selectLatestCorrelatedPacketNotes(room.notes);
    if (!packet.summary) continue;
    const source = record(packet.summary.sourceJson);
    const roomTitle = text(room.title) || "Capture session";
    const updatedAt = iso(packet.summary.updatedAt);

    for (const candidate of mergePacketActionCandidates({
      sourceJson: packet.summary.sourceJson,
      legacyActionItems: room.actionItems ?? [],
    })) {
      const state = stateFromActionStatus(candidate.reviewStatus);
      if (!state || candidate.committedActionItemId) continue;
      reviewItems.push({
        id: candidate.id,
        kind: "ACTION",
        state,
        title: text(candidate.title) || "Review this follow-up",
        detail: text(candidate.detail) || null,
        roomId: room.id,
        roomTitle,
        project: room.project ?? null,
        segmentId: text(candidate.segmentId) || null,
        sourceLabel: "Transcript action proposal",
        updatedAt,
      });
    }

    const brief = record(source.packetBrief);
    const goalSection = items(brief.sections).find((section) => section.id === "goals");
    const goalReceipts = items(source.goalCandidateReviewReceipts);
    if (packet.packetBuildId && brief.kind === "quipsly-transcript-packet-brief-v1" && brief.candidateOnly === true && brief.humanApprovalRequired === true) {
      for (const goal of items(goalSection?.items)) {
        const segmentId = text(goal.segmentId);
        if (!segmentId) continue;
        const id = `packet-goal-${packet.packetBuildId}-${segmentId}`;
        const latestReceipt = goalReceipts.filter((receipt) => text(receipt.kind) === "quipsly-goal-candidate-review-receipt-v1" && text(receipt.goalCandidateId) === id).at(-1);
        const state = stateFromGoalDecision(text(latestReceipt?.decision));
        if (!state) continue;
        const draft = record(latestReceipt?.candidateDraftAfter);
        reviewItems.push({
          id,
          kind: "GOAL",
          state,
          title: text(draft.title) || text(goal.text) || "Review this goal",
          detail: text(draft.description) || null,
          roomId: room.id,
          roomTitle,
          project: room.project ?? null,
          segmentId,
          sourceLabel: "Transcript goal proposal",
          updatedAt,
        });
      }
    }

    for (const lane of items(source.reviewLanes)) {
      const state = stateFromLaneStatus(text(lane.status));
      if (!state) continue;
      reviewItems.push({
        id: `${packet.summary.id}:lane:${text(lane.id) || reviewItems.length}`,
        kind: "LANE",
        state,
        title: text(lane.label) || "Packet review lane",
        detail: text(lane.meaning) || text(lane.reviewRule) || null,
        roomId: room.id,
        roomTitle,
        project: room.project ?? null,
        segmentId: null,
        sourceLabel: "Packet review lane",
        updatedAt,
      });
    }
  }

  reviewItems.sort((left, right) => {
    const stateRank = { READY: 0, REVISE: 1, DEFERRED: 2 } as const;
    const kindRank = { SOURCE: 0, ACTION: 1, GOAL: 2, LANE: 3 } as const;
    return stateRank[left.state] - stateRank[right.state]
      || right.updatedAt.localeCompare(left.updatedAt)
      || kindRank[left.kind] - kindRank[right.kind]
      || left.id.localeCompare(right.id);
  });

  return {
    ready: reviewItems.filter((item) => item.state !== "DEFERRED").slice(0, 50),
    deferred: reviewItems.filter((item) => item.state === "DEFERRED").slice(0, 25),
    counts: {
      ready: reviewItems.filter((item) => item.state === "READY").length,
      revise: reviewItems.filter((item) => item.state === "REVISE").length,
      deferred: reviewItems.filter((item) => item.state === "DEFERRED").length,
      sources: reviewItems.filter((item) => item.kind === "SOURCE").length,
      sessions: new Set(reviewItems.map((item) => item.roomId).filter(Boolean)).size,
    },
    boundaries: {
      actorAccessibleSessionsOnly: true,
      transcriptPacketReviewIncluded: true,
      personalSourceCaptureIncluded: true,
      readOnlyTriageDoorway: true,
      noUnreadClaim: true,
      externalSideEffects: false,
    },
  };
}
