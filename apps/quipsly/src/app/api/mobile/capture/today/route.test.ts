/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { setSourceAnnotationStatus } from "@/lib/server/source-annotations";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { readTranscriptCorrectionDesk } from "@/lib/server/transcript-corrections";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));
jest.mock("@/lib/server/source-annotations", () => ({ setSourceAnnotationStatus: jest.fn() }));
jest.mock("@/lib/server/transcript-corrections", () => ({ readTranscriptCorrectionDesk: jest.fn() }));

const expected = new Date("2026-07-18T18:00:00.000Z");
const persisted = new Date("2026-07-18T18:00:01.000Z");

function signedIn() {
  jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com" } } as any);
}

describe("mobile Capture Today contract", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(expected);
    jest.clearAllMocks();
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([] as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue({
      ok: true,
      roomId: "room-1",
      transcriptJobId: "job-1",
      gate: { allowed: true },
      playback: { recordingAssetId: "asset-1" },
      segments: [{
        id: "segment-1",
        startSeconds: 3.66,
        endSeconds: 4.84,
        providerText: "Welcome, everybody.",
        providerSpeakerLabel: "Speaker",
        proposals: [{ id: "proposal-1", correctedText: null, correctedSpeakerLabel: "Charlie", reason: "Track identity", updatedAt: "2026-07-18T18:00:02.000Z" }],
      }],
    } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("fails before private reads when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await GET(new Request("http://localhost/api/mobile/capture/today"));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("returns canonical actor work while quarantining transcript candidates", async () => {
    signedIn();
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([
      { id: "project-1", slug: "high-ground", name: "High Ground", role: "EDITOR" },
      { id: "project-viewer", slug: "read-only", name: "Read-only Nest", role: "VIEWER" },
    ] as any);
    jest.mocked(getPrismaClient).mockReturnValue({
      actionItem: { findMany: jest.fn().mockResolvedValue([
        { id: "candidate", title: "Maybe follow up", detail: null, status: "OPEN", dueAt: null, updatedAt: expected, sourceJson: { source: "transcript-packet-builder", candidate: true }, room: null },
        { id: "generic-newer", title: "Generic newer task", detail: null, status: "OPEN", dueAt: null, updatedAt: persisted, sourceJson: { source: "manual" }, room: null },
        { id: "future-planned", title: "Next week's planned task", detail: null, status: "OPEN", dueAt: null, updatedAt: new Date("2026-07-17T18:00:00.000Z"), sourceJson: { source: "manual" }, room: null },
        { id: "task-1", title: "Proof-listen episode", detail: null, status: "OPEN", dueAt: null, updatedAt: expected, sourceJson: { schema: "quipsly-transcript-derived-task-v1", roomId: "room-1", transcriptJobId: "job-1", segmentId: "segment-1", startSeconds: 3.66, endSeconds: 4.84, providerTextSha256: "a".repeat(64), providerSpeakerLabel: "Speaker", effectiveTextSnapshot: "Welcome, everybody.", effectiveSpeakerLabelSnapshot: "Charlie", acceptedCorrectionId: null, recordingAssetId: "asset-1", playbackSourceId: "source-1" }, project: { id: "project-1", name: "High Ground", slug: "high-ground" }, tagLinks: [{ tag: { id: "tag-1", label: "Proof listen", slug: "proof-listen", projectId: "project-1", isActive: true } }, { tag: { id: "tag-archived", label: "Legacy review", slug: "legacy-review", projectId: "project-1", isActive: false } }], room: { id: "room-1", title: "Episode review" }, reminder: { id: "reminder-1", remindAt: new Date("2026-07-19T12:00:00.000Z"), status: "ACTIVE", updatedAt: persisted } },
        { id: "task-2", title: "Carry reviewed words forward", detail: null, status: "OPEN", dueAt: null, updatedAt: expected, sourceJson: { schema: "quipsly-transcript-derived-task-v1", roomId: "room-2", transcriptJobId: "job-2", segmentId: "segment-2", startSeconds: 10, endSeconds: 12, providerTextSha256: "b".repeat(64), providerSpeakerLabel: "Speaker", effectiveTextSnapshot: "One clear next move.", effectiveSpeakerLabelSnapshot: "Homer", acceptedCorrectionId: null, recordingAssetId: "asset-2", playbackSourceId: "source-2" }, room: { id: "room-2", title: "Coaching review" }, recurrenceOccurrence: { occurrenceKey: "2026-07-20T09:00[America/Denver]", scheduledLocalDate: "2026-07-20", series: { id: "series-1", ownerUserId: "user-1", cadence: "FIXED", frequency: "WEEKLY", interval: 1, timezone: "America/Denver", localTimeMinutes: 540, status: "ACTIVE", updatedAt: persisted } } },
      ]) },
      goal: { findMany: jest.fn().mockResolvedValue([
        { id: "goal-1", title: "Ship a trustworthy episode", description: null, status: "ACTIVE", targetAt: null, updatedAt: expected, sourceJson: { schema: "quipsly-transcript-derived-goal-v1", roomId: "room-1", transcriptJobId: "job-1", segmentId: "segment-1", startSeconds: 3.66, endSeconds: 4.84, providerTextSha256: "a".repeat(64), providerSpeakerLabel: "Speaker", effectiveTextSnapshot: "Welcome, everybody.", effectiveSpeakerLabelSnapshot: "Charlie", acceptedCorrectionId: null, recordingAssetId: "asset-1", playbackSourceId: "source-1" }, project: { id: "project-1", name: "High Ground", slug: "high-ground" }, tagLinks: [{ tag: { id: "tag-2", label: "Episode", slug: "episode", projectId: "project-1", isActive: true } }], room: { id: "room-1", title: "Episode review" }, progressReceipts: [] },
        { id: "goal-mismatch", title: "Do not invent a backlink", description: null, status: "ACTIVE", targetAt: null, updatedAt: expected, sourceJson: { schema: "quipsly-transcript-derived-goal-v1", roomId: "other-room", transcriptJobId: "job-1", segmentId: "segment-1", startSeconds: 3.66, endSeconds: 4.84, providerTextSha256: "a".repeat(64), providerSpeakerLabel: "Speaker", effectiveTextSnapshot: "Welcome, everybody.", effectiveSpeakerLabelSnapshot: "Charlie", acceptedCorrectionId: null, recordingAssetId: "asset-1", playbackSourceId: "source-1" }, room: { id: "room-1", title: "Episode review" }, progressReceipts: [] },
      ]) },
      workPlanBlock: { findMany: jest.fn().mockResolvedValue([
        { id: "block-1", startsAt: expected, endsAt: new Date("2026-07-18T18:50:00.000Z"), timezone: "America/Denver", status: "PLANNED", completedAt: null, updatedAt: expected, actionItem: { id: "task-1", title: "Proof-listen episode", status: "OPEN" }, goal: null },
        { id: "block-future", startsAt: new Date("2026-07-24T18:00:00.000Z"), endsAt: new Date("2026-07-24T18:50:00.000Z"), timezone: "America/Denver", status: "PLANNED", completedAt: null, updatedAt: expected, actionItem: { id: "future-planned", title: "Next week's planned task", status: "OPEN" }, goal: null },
      ]) },
      weeklyCommitment: { findFirst: jest.fn().mockResolvedValue(null) },
      callRoom: { findMany: jest.fn().mockResolvedValue([{ id: "room-1", title: "Episode review" }]) },
      taskReminder: { findMany: jest.fn().mockResolvedValue([
        { id: "reminder-1", actionItemId: "task-1", remindAt: new Date("2026-07-19T12:00:00.000Z"), status: "ACTIVE", updatedAt: persisted },
        { id: "reminder-canceled", actionItemId: "old-task", remindAt: new Date("2026-07-18T12:00:00.000Z"), status: "CANCELED", updatedAt: expected },
      ]) },
      studioTag: { findMany: jest.fn().mockResolvedValue([
        { id: "tag-2", projectId: "project-1", slug: "episode", label: "Episode", isActive: true },
        { id: "tag-1", projectId: "project-1", slug: "proof-listen", label: "Proof listen", isActive: true },
      ]) },
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: "annotation-1",
          projectId: "project-1",
          kind: "question",
          body: "Is this the opening tension?",
          exactText: "Keep the source intact.",
          status: "active",
          visibility: "private",
          createdByUserId: "user-1",
          updatedAt: expected,
          sourceTitle: "Production philosophy",
          projectName: "High Ground",
          projectSlug: "high-ground",
          tagLabels: ["Episode seed"],
        },
        {
          id: "annotation-resolved",
          projectId: "project-1",
          kind: "note",
          body: "This decision can be revisited.",
          exactText: "The source remains immutable.",
          status: "resolved",
          visibility: "project",
          createdByUserId: "user-1",
          updatedAt: persisted,
          sourceTitle: "Production philosophy",
          projectName: "High Ground",
          projectSlug: "high-ground",
          tagLabels: ["Decision"],
        },
        {
          id: "annotation-viewer-owned",
          projectId: "project-viewer",
          kind: "note",
          body: "Readable evidence must not become writable after access changes.",
          exactText: "Preserve the permission boundary.",
          status: "active",
          visibility: "private",
          createdByUserId: "user-1",
          updatedAt: expected,
          sourceTitle: "Access boundary",
          projectName: "Read-only Nest",
          projectSlug: "read-only",
          tagLabels: [],
        },
      ]),
    } as any);
    const response = await GET(new Request("http://localhost/api/mobile/capture/today"));
    const payload = await response.json();
    expect(payload.tasks.map((task: { id: string }) => task.id)).toEqual(["task-1", "task-2", "generic-newer", "future-planned"]);
    expect(payload.tasks[1]).toMatchObject({ id: "task-2", todayReason: "Reviewed transcript follow-through" });
    expect(payload.tasks[1].recurrence).toEqual({ seriesId: "series-1", occurrenceKey: "2026-07-20T09:00[America/Denver]", scheduledLocalDate: "2026-07-20", cadence: "FIXED", frequency: "WEEKLY", interval: 1, timezone: "America/Denver", localTimeMinutes: 540, status: "ACTIVE", updatedAt: persisted.toISOString(), ownerCanManage: true });
    expect(payload.tasks[3]).toMatchObject({ id: "future-planned", todayReason: null });
    expect(payload.tasks[0]).toMatchObject({ id: "task-1", todayReason: "Planned focus · reviewed transcript", canEditTags: true, tagIds: ["tag-1", "tag-archived"], tagLabels: ["Proof listen", "Legacy review"], sourceAnchor: { roomId: "room-1", segmentId: "segment-1", startSeconds: 3.66, recordingAssetId: "asset-1" } });
    expect(payload.tasks[0].reminder).toEqual({ id: "reminder-1", actionItemId: "task-1", remindAt: "2026-07-19T12:00:00.000Z", status: "ACTIVE", updatedAt: persisted.toISOString() });
    expect(payload.focusBlocks).toEqual(expect.arrayContaining([expect.objectContaining({ id: "block-1", targetId: "task-1" })]));
    expect(payload.goals[0]).toMatchObject({ id: "goal-1", roomId: "room-1", sessionTitle: "Episode review", canEditTags: true, tagIds: ["tag-2"], tagLabels: ["Episode"], sourceAnchor: { schema: "quipsly-transcript-derived-goal-v1", segmentId: "segment-1", startSeconds: 3.66, recordingAssetId: "asset-1" } });
    expect(payload.goals[1]).toMatchObject({ id: "goal-mismatch", roomId: "room-1", sourceAnchor: null });
    expect(payload).toMatchObject({ ok: true, briefKind: "quipsly-mobile-today-v1", transcriptReviews: [{ id: "proposal-1", roomId: "room-1", segmentId: "segment-1", recordingAssetId: "asset-1", proposedSpeakerLabel: "Charlie" }], sourceAnnotations: [{ id: "annotation-1", status: "active", sourceTitle: "Production philosophy", createdByMe: true, canChangeStatus: true, tagLabels: ["Episode seed"] }, { id: "annotation-resolved", status: "resolved", createdByMe: true, canChangeStatus: true, tagLabels: ["Decision"] }, { id: "annotation-viewer-owned", createdByMe: true, canChangeStatus: false }], taskReminderIntents: [{ id: "reminder-1", status: "ACTIVE" }, { id: "reminder-canceled", status: "CANCELED" }], tagCatalog: [{ id: "tag-2", projectId: "project-1", label: "Episode", isActive: true }, { id: "tag-archived", projectId: "project-1", label: "Legacy review", isActive: false }, { id: "tag-1", projectId: "project-1", label: "Proof listen", isActive: true }], boundaries: { transcriptCandidatesExcluded: true, externalCalendarMutated: false, sourceMutated: false, immutableSourceAnchors: true, aiOutputRequiresHumanReview: true, transcriptReviewMutatesWork: false, tasksRankedForToday: true, canonicalReminderIntents: true, taskReminderIntentProjectionComplete: true, deviceNotificationsReconciled: false, reminderDeliveryClaimed: false, canonicalProjectTags: true, tagMutationExternalSideEffects: false, annotationResolveReopenAvailable: true, annotationReviewMutatesSource: false } });
  });

  it("reopens the same accessible author-owned source annotation without mutating its source", async () => {
    signedIn();
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([
      { id: "project-1", slug: "high-ground", name: "High Ground", role: "EDITOR" },
    ] as any);
    jest.mocked(setSourceAnnotationStatus).mockResolvedValue({
      ok: true,
      id: "annotation-1",
      updatedAt: persisted.toISOString(),
      reused: false,
    });
    const queryRaw = jest.fn().mockResolvedValue([{ id: "annotation-1" }]);
    jest.mocked(getPrismaClient).mockReturnValue({ $queryRaw: queryRaw } as any);

    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "source-annotation-status",
        id: "annotation-1",
        nextStatus: "active",
        expectedUpdatedAt: expected.toISOString(),
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      action: "source-annotation-status",
      id: "annotation-1",
      status: "active",
      updatedAt: persisted.toISOString(),
      boundaries: {
        sourceMutated: false,
        immutableSourceAnchors: true,
        annotationResolveReopenAvailable: true,
        annotationReviewMutatesSource: false,
      },
    });
    expect(setSourceAnnotationStatus).toHaveBeenCalledWith(
      expect.anything(),
      {
        annotationId: "annotation-1",
        actorUserId: "user-1",
        expectedUpdatedAt: expected,
        nextStatus: "active",
      },
    );
  });

  it("does not reveal or mutate a source annotation outside the actor's accessible Nests", async () => {
    signedIn();
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([
      { id: "project-1", slug: "high-ground", name: "High Ground", role: "VIEWER" },
    ] as any);
    const queryRaw = jest.fn();
    jest.mocked(getPrismaClient).mockReturnValue({ $queryRaw: queryRaw } as any);

    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "source-annotation-status",
        id: "annotation-private-to-someone-else",
        nextStatus: "active",
        expectedUpdatedAt: expected.toISOString(),
      }),
    }));

    expect(response.status).toBe(404);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(setSourceAnnotationStatus).not.toHaveBeenCalled();
  });

  it("edits an owner-scoped one-time task from the iPhone with a DST-safe receipt and no external effects", async () => {
    signedIn();
    const tx = {
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "task-1",
          roomId: "room-1",
          status: "OPEN",
          title: "Rough task wording",
          detail: null,
          dueAt: null,
          sourceJson: {
            source: "quipsly-work-manual-v1",
            immutableSourceAnchor: { segmentId: "segment-1" },
          },
          updatedAt: expected,
          recurrenceOccurrence: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: "task-1",
          roomId: "room-1",
          title: "Prepare the episode clip",
          detail: "Confirm the shared playback cue.",
          dueAt: new Date("2026-07-24T15:15:00.000Z"),
          updatedAt: persisted,
        }),
      },
    };
    const transaction = jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as any);

    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "task-edit",
        id: "task-1",
        title: "Prepare the episode clip",
        detail: "Confirm the shared playback cue.",
        dueLocal: "2026-07-24T09:15",
        timezone: "America/Denver",
        expectedUpdatedAt: expected.toISOString(),
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      action: "task-edit",
      id: "task-1",
      title: "Prepare the episode clip",
      detail: "Confirm the shared playback cue.",
      dueAt: "2026-07-24T15:15:00.000Z",
      updatedAt: persisted.toISOString(),
      receiptId: expect.any(String),
      boundaries: {
        externalCalendarMutated: false,
        providerMutated: false,
        sourceMutated: false,
      },
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(tx.actionItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: "task-1",
        assignedUserId: "user-1",
        status: "OPEN",
        updatedAt: expected,
      },
      data: {
        title: "Prepare the episode clip",
        detail: "Confirm the shared playback cue.",
        dueAt: new Date("2026-07-24T15:15:00.000Z"),
        sourceJson: expect.objectContaining({
          immutableSourceAnchor: { segmentId: "segment-1" },
          editReceipts: [expect.objectContaining({
            kind: "quipsly-work-item-edit-v1",
            surface: "ios-capture-today",
            dueIntent: {
              requestedLocalDateTime: "2026-07-24T09:15",
              resolvedLocalDateTime: "2026-07-24T09:15",
              dstResolution: "exact",
              timezone: "America/Denver",
            },
            reminderChanged: false,
            recurrenceChanged: false,
            statusChanged: false,
            tagsChanged: false,
            goalLinksChanged: false,
            providerCalendarEventChanged: false,
            externalSideEffects: false,
          })],
        }),
      },
    });
  });

  it("requires an explicit due-date decision before an iPhone task edit", async () => {
    signedIn();
    const transaction = jest.fn();
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as any);
    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "task-edit",
        id: "task-1",
        title: "Prepare the episode clip",
        timezone: "America/Denver",
        expectedUpdatedAt: expected.toISOString(),
      }),
    }));
    expect(response.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects oversized task text and malformed due decisions instead of silently truncating them", async () => {
    signedIn();
    const transaction = jest.fn();
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as any);

    const oversized = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "task-edit",
        id: "task-1",
        title: "x".repeat(501),
        detail: "y".repeat(5_001),
        dueLocal: null,
        timezone: "America/Denver",
        expectedUpdatedAt: expected.toISOString(),
      }),
    }));
    const malformedDue = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "task-edit",
        id: "task-1",
        title: "Prepare the episode clip",
        dueLocal: { clear: true },
        timezone: "America/Denver",
        expectedUpdatedAt: expected.toISOString(),
      }),
    }));

    expect(oversized.status).toBe(400);
    expect(malformedDue.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("edits an owner-scoped goal definition and target without changing progress or source evidence", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-30T06:00:00.000Z"));
    signedIn();
    const tx = {
      goal: {
        findFirst: jest.fn().mockResolvedValue({
          id: "goal-1",
          roomId: "room-1",
          status: "ACTIVE",
          title: "Old direction",
          description: null,
          targetAt: null,
          sourceJson: {
            schema: "quipsly-transcript-derived-goal-v1",
            immutableSourceAnchor: { segmentId: "segment-1" },
          },
          updatedAt: expected,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: "goal-1",
          roomId: "room-1",
          status: "ACTIVE",
          title: "Publish a proof-listened episode",
          description: "Both hosts approve the final timeline.",
          targetAt: new Date("2026-08-15T18:00:00.000Z"),
          updatedAt: persisted,
        }),
      },
    };
    const transaction = jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as any);

    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "goal-edit",
        id: "goal-1",
        title: "Publish a proof-listened episode",
        description: "Both hosts approve the final timeline.",
        targetDecision: "SET",
        targetLocalDate: "2026-08-15",
        timezone: "America/Denver",
        expectedUpdatedAt: expected.toISOString(),
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      action: "goal-edit",
      id: "goal-1",
      title: "Publish a proof-listened episode",
      description: "Both hosts approve the final timeline.",
      targetAt: "2026-08-15T18:00:00.000Z",
      updatedAt: persisted.toISOString(),
      receiptId: expect.any(String),
      boundaries: {
        externalCalendarMutated: false,
        providerMutated: false,
        sourceMutated: false,
      },
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(tx.goal.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        title: "Publish a proof-listened episode",
        description: "Both hosts approve the final timeline.",
        targetAt: new Date("2026-08-15T18:00:00.000Z"),
        sourceJson: expect.objectContaining({
          immutableSourceAnchor: { segmentId: "segment-1" },
          editReceipts: [expect.objectContaining({
            kind: "quipsly-goal-edit-v1",
            surface: "ios-capture-work",
            targetDecision: "SET",
            targetIntent: {
              requestedLocalDate: "2026-08-15",
              resolvedLocalDateTime: "2026-08-15T12:00",
              timezone: "America/Denver",
            },
            statusChanged: false,
            progressChanged: false,
            taskLinksChanged: false,
            tagsChanged: false,
            sourceAnchorChanged: false,
            externalSideEffects: false,
          })],
        }),
      },
    }));
  });

  it("requires an explicit, correctly typed goal target decision", async () => {
    signedIn();
    const transaction = jest.fn();
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as any);
    const missingTarget = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "goal-edit",
        id: "goal-1",
        title: "Publish a proof-listened episode",
        targetDecision: "KEEP",
        timezone: "America/Denver",
        expectedUpdatedAt: expected.toISOString(),
      }),
    }));
    const malformedTarget = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "goal-edit",
        id: "goal-1",
        title: "Publish a proof-listened episode",
        targetDecision: "CLEAR",
        targetLocalDate: { clear: true },
        timezone: "America/Denver",
        expectedUpdatedAt: expected.toISOString(),
      }),
    }));
    expect(missingTarget.status).toBe(400);
    expect(malformedTarget.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("creates a DST-safe canonical reminder from the iPhone wall clock without claiming delivery", async () => {
    signedIn();
    const tx = {
      taskReminderRevision: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "revision-1" }),
      },
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "task-1",
          status: "OPEN",
          updatedAt: expected,
          recurrenceOccurrence: null,
          reminder: null,
        }),
      },
      taskReminder: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          ...data,
          updatedAt: persisted,
        })),
      },
    };
    const transaction = jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as any);

    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "task-reminder",
        id: "task-1",
        remindAtLocal: "2026-07-24T09:15",
        timezone: "America/Denver",
        expectedUpdatedAt: expected.toISOString(),
        expectedReminderUpdatedAt: null,
        clientRequestId: "c77bdc93-06f0-4585-86f0-5383c61dbd2a",
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      action: "task-reminder",
      status: "ACTIVE",
      idempotentReplay: false,
      reminder: {
        id: "mobile-task-reminder-decision-c77bdc93-06f0-4585-86f0-5383c61dbd2a",
        actionItemId: "task-1",
        remindAt: "2026-07-24T15:15:00.000Z",
        status: "ACTIVE",
        deviceNotificationsReconciled: false,
        delivered: false,
      },
      boundaries: {
        canonicalReminderIntents: true,
        deviceNotificationsReconciled: false,
        reminderDeliveryClaimed: false,
      },
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(tx.taskReminder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionItemId: "task-1",
        ownerUserId: "user-1",
        remindAt: new Date("2026-07-24T15:15:00.000Z"),
        sourceJson: expect.objectContaining({
          surface: "ios-capture-today",
          timezone: "America/Denver",
          requestedLocalDateTime: "2026-07-24T09:15",
          deviceNotificationScheduled: false,
          deliveryClaimed: false,
        }),
      }),
    });
  });

  it("cancels the same owner-scoped reminder while preserving its canonical time", async () => {
    signedIn();
    const currentReminder = {
      id: "reminder-1",
      actionItemId: "task-1",
      ownerUserId: "user-1",
      remindAt: new Date("2026-07-24T15:15:00.000Z"),
      status: "ACTIVE",
      sourceJson: { schema: "quipsly-task-reminder-intent-v1" },
      updatedAt: expected,
    };
    const tx = {
      taskReminderRevision: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "revision-1" }),
      },
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "task-1",
          status: "OPEN",
          updatedAt: expected,
          recurrenceOccurrence: null,
          reminder: currentReminder,
        }),
      },
      taskReminder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...currentReminder,
          status: "CANCELED",
          updatedAt: persisted,
        }),
      },
    };
    jest.mocked(getPrismaClient).mockReturnValue({
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as any);

    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "task-reminder",
        id: "task-1",
        remindAtLocal: null,
        timezone: "America/Denver",
        expectedUpdatedAt: expected.toISOString(),
        expectedReminderUpdatedAt: expected.toISOString(),
        clientRequestId: "b9cb972c-753b-443f-852f-c72bd6cfe8f3",
      }),
    }));
    const payload = await response.json();

    expect(payload).toMatchObject({
      ok: true,
      status: "CANCELED",
      reminder: {
        id: "reminder-1",
        remindAt: "2026-07-24T15:15:00.000Z",
        status: "CANCELED",
        deviceNotificationsReconciled: false,
        delivered: false,
      },
    });
    expect(tx.taskReminderRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: "CANCELED",
        previousRemindAt: currentReminder.remindAt,
        remindAt: null,
        previousStatus: "ACTIVE",
        status: "CANCELED",
      }),
    });
  });

  it("rejects an invalid iPhone reminder timezone before opening a transaction", async () => {
    signedIn();
    const transaction = jest.fn();
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as any);

    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "task-reminder",
        id: "task-1",
        remindAtLocal: "2026-07-24T09:15",
        timezone: "Mountain-ish",
        expectedUpdatedAt: expected.toISOString(),
        expectedReminderUpdatedAt: null,
        clientRequestId: "9635bb82-184e-4842-b33f-6fbf2d09e733",
      }),
    }));

    expect(response.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("completes a recurring task through the shared canonical transaction and returns its successor", async () => {
    signedIn();
    const series = {
      id: "series-1", ownerUserId: "user-1", projectId: null, title: "Weekly production review", detail: null,
      cadence: "FIXED", frequency: "WEEKLY", interval: 1, timezone: "America/Denver", localTimeMinutes: 540,
      anchorLocalDate: "2026-07-20", anchorDayOfMonth: 20, status: "ACTIVE",
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lockAcquired: false }]),
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({ id: "task-1", roomId: null, status: "OPEN", sourceJson: {}, updatedAt: expected, recurrenceOccurrence: { id: "occurrence-1", sourceJson: {}, series } }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ roomId: null, status: "DONE", updatedAt: persisted }),
      },
      taskOccurrence: {
        findFirst: jest.fn().mockResolvedValue({ scheduledLocalDate: "2026-07-27" }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) } as any);
    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "task-status", id: "task-1", nextStatus: "DONE", expectedUpdatedAt: expected.toISOString() }),
    }));
    const payload = await response.json();
    expect(payload).toMatchObject({ ok: true, action: "task-status", status: "DONE", nextOccurrenceTaskId: expect.any(String), boundaries: { recurrenceAppOwned: true, recurrenceNotificationsScheduled: false } });
    expect(tx.actionItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ title: "Weekly production review", assignedUserId: "user-1" }) });
    expect(tx.taskOccurrence.update).toHaveBeenCalledWith({ where: { id: "occurrence-1" }, data: { sourceJson: expect.objectContaining({ followingOccurrenceReceipt: expect.objectContaining({ surface: "ios-capture-today", nextActionItemId: payload.nextOccurrenceTaskId, externalSideEffects: false }) }) } });
  });

  it("lets only the series owner resume a repeat and restores the canonical horizon", async () => {
    signedIn();
    const series = {
      id: "series-paused", ownerUserId: "user-1", projectId: null, title: "Weekly production review", detail: null,
      cadence: "FIXED", frequency: "WEEKLY", interval: 1, timezone: "America/Denver", localTimeMinutes: 540,
      anchorLocalDate: "2026-07-20", anchorDayOfMonth: 20, status: "PAUSED", sourceJson: {}, updatedAt: expected,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lockAcquired: false }]),
      taskRecurrenceSeries: {
        findFirst: jest.fn().mockResolvedValue(series),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ status: "ACTIVE", updatedAt: persisted }),
      },
      taskOccurrence: {
        count: jest.fn().mockResolvedValue(2),
        findFirst: jest.fn().mockResolvedValue({ scheduledLocalDate: "2026-07-27" }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      actionItem: { create: jest.fn().mockResolvedValue({}) },
    };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) } as any);

    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "recurrence-status", id: "series-paused", nextStatus: "ACTIVE", expectedUpdatedAt: expected.toISOString() }),
    }));
    const payload = await response.json();

    expect(payload).toMatchObject({
      ok: true,
      action: "recurrence-status",
      id: "series-paused",
      status: "ACTIVE",
      materializedCount: 1,
      boundaries: { recurrenceAppOwned: true, recurrenceNotificationsScheduled: false, externalCalendarMutated: false },
    });
    expect(tx.taskRecurrenceSeries.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "series-paused", ownerUserId: "user-1" },
    }));
    expect(tx.taskRecurrenceSeries.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "series-paused", ownerUserId: "user-1", updatedAt: expected },
      data: expect.objectContaining({
        status: "ACTIVE",
        sourceJson: expect.objectContaining({
          statusReceipts: [expect.objectContaining({
            surface: "ios-capture-today",
            previousStatus: "PAUSED",
            nextStatus: "ACTIVE",
          })],
          lastStatusReceipt: expect.objectContaining({
            surface: "ios-capture-today",
            previousStatus: "PAUSED",
            nextStatus: "ACTIVE",
            externalSideEffects: false,
            notificationsChanged: false,
            providerCalendarChanged: false,
          }),
        }),
      }),
    }));
    expect(tx.actionItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      assignedUserId: "user-1",
      title: "Weekly production review",
    }) });
    expect(tx.taskRecurrenceSeries.update).toHaveBeenCalledWith({
      where: { id: "series-paused" },
      data: { sourceJson: expect.objectContaining({ lastStatusReceipt: expect.objectContaining({ materializedActionItemIds: [expect.any(String)] }) }) },
    });
  });

  it("edits one recurring task idempotently without changing its due time or series", async () => {
    signedIn();
    const tx = {
      actionItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "task-1",
          title: "Review the episode",
          detail: null,
          dueAt: new Date("2026-07-20T15:00:00.000Z"),
          status: "OPEN",
          sourceJson: {},
          updatedAt: expected,
          recurrenceOccurrence: { id: "occurrence-1", seriesId: "series-1", occurrenceKey: "2026-07-20T09:00[America/Denver]" },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: "task-1", title: "Proof-listen the episode", detail: null, dueAt: new Date("2026-07-20T15:00:00.000Z"), updatedAt: persisted }),
      },
    };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) } as any);
    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "recurrence-edit",
        id: "task-1",
        seriesId: "series-1",
        scope: "THIS_OCCURRENCE",
        title: "Proof-listen the episode",
        detail: "",
        expectedUpdatedAt: expected.toISOString(),
        expectedSeriesUpdatedAt: expected.toISOString(),
        clientRequestId: "97767053-f2c1-47fc-a21d-6bd32ed30a0e",
      }),
    }));
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      action: "recurrence-edit",
      scope: "THIS_OCCURRENCE",
      historicalOccurrencesPreserved: true,
      boundaries: { externalCalendarMutated: false, recurrenceNotificationsScheduled: false },
    });
    expect(tx.actionItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: "Proof-listen the episode",
        sourceJson: expect.objectContaining({ lastEditReceipt: expect.objectContaining({ dueAtPreserved: "2026-07-20T15:00:00.000Z" }) }),
      }),
    }));
  });

  it("rejects an invalid future recurrence edit before opening a database transaction", async () => {
    signedIn();
    const transaction = jest.fn();
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as any);
    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "recurrence-edit",
        id: "task-1",
        seriesId: "series-1",
        scope: "THIS_AND_FUTURE",
        title: "Move the future review",
        expectedUpdatedAt: expected.toISOString(),
        expectedSeriesUpdatedAt: expected.toISOString(),
        clientRequestId: "fd80c8b1-12c2-47e8-8658-d0f07b2e5c7f",
        recurrence: { cadence: "FIXED", frequency: "WEEKLY", interval: 1, timezone: "Mountain-ish", localTimeMinutes: 540, anchorLocalDate: "2026-07-20" },
      }),
    }));
    expect(response.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("completes a personal focus block without mutating its task or goal", async () => {
    signedIn();
    const tx = { workPlanBlock: {
      findFirst: jest.fn().mockResolvedValue({ status: "PLANNED", sourceJson: {}, updatedAt: expected }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ status: "COMPLETED", updatedAt: persisted }),
    } };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) } as any);
    const response = await POST(new Request("http://localhost/api/mobile/capture/today", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "focus-status", id: "block-1", nextStatus: "COMPLETED", expectedUpdatedAt: expected.toISOString() }) }));
    const payload = await response.json();
    expect(payload).toMatchObject({ ok: true, status: "COMPLETED", boundaries: { completingFocusBlockMutatesTarget: false, providerMutated: false } });
    expect(tx).not.toHaveProperty("actionItem");
    expect(tx).not.toHaveProperty("goal");
    expect(tx.workPlanBlock.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceJson: expect.objectContaining({ planReceipts: [expect.objectContaining({ surface: "ios-capture-today", targetStatusMutated: false })] }) }) }));
  });

  it("records an owner-only goal check-in without completing the goal or causing external actions", async () => {
    signedIn();
    const tx = {
      goal: {
        findFirst: jest.fn().mockResolvedValue({ id: "goal-1", status: "ACTIVE", sourceJson: { source: "manual" }, updatedAt: expected }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ status: "ACTIVE", updatedAt: persisted }),
      },
      goalProgressReceipt: { create: jest.fn().mockResolvedValue({ id: "receipt-1" }) },
    };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) } as any);

    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "goal-progress",
        id: "goal-1",
        progressPercent: 75,
        note: "  Proof-listened   the first act.  ",
        expectedUpdatedAt: expected.toISOString(),
      }),
    }));
    const payload = await response.json();

    expect(payload).toMatchObject({
      ok: true,
      action: "goal-progress",
      id: "goal-1",
      status: "ACTIVE",
      progressPercent: 75,
      note: "Proof-listened the first act.",
      boundaries: { goalCheckInMutatesStatus: false, externalCalendarMutated: false, providerMutated: false },
    });
    expect(tx.goal.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "goal-1", ownerUserId: "user-1", updatedAt: expected },
      data: { sourceJson: expect.objectContaining({
        source: "manual",
        lastProgressReceipt: expect.objectContaining({
          kind: "quipsly-goal-progress-v1",
          surface: "ios-capture-today",
          progressPercent: 75,
          note: "Proof-listened the first act.",
          externalSideEffects: false,
          goalStatusMutated: false,
        }),
      }) },
    }));
    expect(tx.goalProgressReceipt.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      goalId: "goal-1",
      actorUserId: "user-1",
      kind: "PROGRESS",
      progressPercent: 75,
      note: "Proof-listened the first act.",
    }) });
  });

  it("does not write a goal receipt when the iPhone revision is stale", async () => {
    signedIn();
    const tx = {
      goal: {
        findFirst: jest.fn().mockResolvedValue({ id: "goal-1", status: "ACTIVE", sourceJson: {}, updatedAt: persisted }),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
      goalProgressReceipt: { create: jest.fn() },
    };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) } as any);

    const response = await POST(new Request("http://localhost/api/mobile/capture/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "goal-progress", id: "goal-1", progressPercent: 50, expectedUpdatedAt: expected.toISOString() }),
    }));

    expect(response.status).toBe(409);
    expect(tx.goal.updateMany).not.toHaveBeenCalled();
    expect(tx.goalProgressReceipt.create).not.toHaveBeenCalled();
  });
});
