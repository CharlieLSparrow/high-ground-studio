/** @jest-environment node */

import {
  GOVERNED_ACTION_CAPABILITIES,
  SESSION_PREFLIGHT_PUBLISH_CAPABILITY_ID,
  TRANSCRIPT_GOAL_EVIDENCE_MERGE_CAPABILITY_ID,
  TRANSCRIPT_GOAL_MATERIALIZE_CAPABILITY_ID,
  TRANSCRIPT_NOTE_MATERIALIZE_CAPABILITY_ID,
  TRANSCRIPT_NOTE_MERGE_CAPABILITY_ID,
  TRANSCRIPT_TASK_EVIDENCE_MERGE_CAPABILITY_ID,
  governedCapabilityForAssistantToolKind,
} from "@high-ground/quipsly-domain/governed-actions";
import {
  createGovernedAssistantProposalRun,
  governedActionSha256,
  governedActionStableJson,
  readGovernedActionSourceReference,
  recordGovernedAssistantTransition,
  recordSucceededSessionPreflightAction,
  recordSucceededTranscriptWorkAction,
} from "./governed-action-runtime";

jest.mock("server-only", () => ({}));

function transaction() {
  return {
    governedActionRun: {
      create: jest.fn().mockResolvedValue({ id: "run-1" }),
      update: jest.fn().mockResolvedValue({ id: "run-1" }),
    },
    governedAction: {
      create: jest.fn().mockResolvedValue({ id: "governed-action-1" }),
      update: jest.fn().mockResolvedValue({ id: "governed-action-1" }),
      findUnique: jest.fn().mockResolvedValue({ id: "governed-action-1", runId: "run-1", status: "PROPOSED" }),
      findMany: jest.fn().mockResolvedValue([{ status: "SUCCEEDED" }]),
    },
    governedActionAttempt: {
      create: jest.fn().mockResolvedValue({ id: "attempt-1" }),
      count: jest.fn().mockResolvedValue(0),
    },
    governedActionReceipt: {
      create: jest.fn().mockResolvedValue({ id: "receipt-1" }),
    },
    studioAssistantAction: {
      update: jest.fn().mockResolvedValue({ id: "assistant-action-1" }),
    },
  };
}

describe("governed action capability and ledger runtime", () => {
  it("publishes one unique manifest per registered capability and refuses unknown assistant tools", () => {
    expect(new Set(GOVERNED_ACTION_CAPABILITIES.map((manifest) => manifest.id)).size)
      .toBe(GOVERNED_ACTION_CAPABILITIES.length);
    expect(governedCapabilityForAssistantToolKind("PROPOSE_REWRITE")).toMatchObject({
      id: "quipsly.writing.rewrite.propose",
      decisionPolicy: "EXPLICIT_APPROVAL",
      riskLevel: "HIGH",
      recovery: expect.arrayContaining(["UNDO"]),
    });
    expect(governedCapabilityForAssistantToolKind("DELETE_EVERYTHING")).toBeNull();
    expect(GOVERNED_ACTION_CAPABILITIES).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: TRANSCRIPT_GOAL_EVIDENCE_MERGE_CAPABILITY_ID,
        consequences: expect.arrayContaining([expect.stringContaining("does not change the target identity")]),
      }),
      expect.objectContaining({
        id: TRANSCRIPT_TASK_EVIDENCE_MERGE_CAPABILITY_ID,
        qualification: "OPERATED_LOCAL",
      }),
      expect.objectContaining({
        id: TRANSCRIPT_NOTE_MATERIALIZE_CAPABILITY_ID,
        qualification: "OPERATED_LOCAL",
        consequences: expect.arrayContaining([expect.stringContaining("does not send or deliver")]),
      }),
      expect.objectContaining({
        id: TRANSCRIPT_NOTE_MERGE_CAPABILITY_ID,
        riskLevel: "HIGH",
        recovery: expect.arrayContaining(["COMPENSATE"]),
      }),
    ]));
  });

  it("hashes canonical JSON independently of object insertion order", () => {
    expect(governedActionStableJson({ z: 1, a: { y: 2, x: 3 } }))
      .toBe('{"a":{"x":3,"y":2},"z":1}');
    expect(governedActionSha256({ z: 1, a: { y: 2, x: 3 } }))
      .toBe(governedActionSha256({ a: { x: 3, y: 2 }, z: 1 }));
  });

  it("adapts writing proposals into one project run with typed actions and immutable receipts", async () => {
    const tx = transaction();
    const result = await createGovernedAssistantProposalRun(tx as never, {
      projectId: "project-1",
      documentId: "document-1",
      assistantSessionId: "assistant-session-1",
      actorUserId: "user-1",
      actorEmail: "writer@example.test",
      intent: "Draft a safer opening.",
      sourceSurface: "nest-writing-assistant",
      provider: "local-fallback",
      readSet: [{ objectType: "StudioDocumentBlock", objectId: "block-1", contentSha256: "source-hash" }],
      proposals: [{
        assistantActionId: "assistant-action-1",
        kind: "PROPOSE_REWRITE",
        label: "Rewrite the opening",
        explanation: "The user requested a different opening.",
        payload: { blockId: "block-1", originalText: "Before", rewriteText: "After" },
      }],
    });

    expect(result).toEqual({
      runId: "run-1",
      actions: [{ assistantActionId: "assistant-action-1", governedActionId: "governed-action-1", capabilityId: "quipsly.writing.rewrite.propose" }],
    });
    expect(tx.governedActionRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "project-1",
        decisionPolicy: "EXPLICIT_APPROVAL",
        riskLevel: "HIGH",
        status: "AWAITING_DECISION",
        consequenceJson: expect.objectContaining({ sourceTruthChanged: false }),
      }),
      select: { id: true },
    });
    expect(tx.governedAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        capabilityId: "quipsly.writing.rewrite.propose",
        capabilityVersion: 1,
        decisionStatus: "PENDING",
        status: "PROPOSED",
        payloadSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        requestSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
      select: { id: true },
    });
    expect(tx.governedActionReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "PROPOSAL_RECORDED", newStatus: "PROPOSED" }),
    });
    expect(tx.studioAssistantAction.update).toHaveBeenCalledWith({
      where: { id: "assistant-action-1" },
      data: { governedActionId: "governed-action-1" },
    });
  });

  it("fails the whole proposal adapter before writing when a tool kind is unregistered", async () => {
    const tx = transaction();
    await expect(createGovernedAssistantProposalRun(tx as never, {
      projectId: "project-1",
      documentId: "document-1",
      assistantSessionId: "assistant-session-1",
      actorUserId: "user-1",
      actorEmail: "writer@example.test",
      intent: "Do something unregistered.",
      sourceSurface: "nest-writing-assistant",
      provider: "test",
      readSet: [],
      proposals: [{
        assistantActionId: "assistant-action-1",
        kind: "DELETE_EVERYTHING",
        label: "No",
        explanation: "No",
        payload: {},
      }],
    })).rejects.toThrow("UNREGISTERED_ASSISTANT_CAPABILITY");
    expect(tx.governedActionRun.create).not.toHaveBeenCalled();
  });

  it("records a user-initiated preflight as a zero-byte succeeded attempt with domain readback", async () => {
    const tx = transaction();
    const result = await recordSucceededSessionPreflightAction(tx as never, {
      requestId: "6e4cc29d-baf7-4a24-9148-d3ba9e808ca1",
      requestSha256: "domain-sha",
      projectId: "project-1",
      roomId: "room-1",
      actorUserId: "user-1",
      actorEmail: "charlie@example.test",
      clientKind: "ios",
      payload: {
        clientInstanceId: "ios-install-1",
        microphoneLabel: "iPhone microphone",
        playbackDecision: "HEARD_CLEAR",
        privateSampleBytesRetained: false,
        privateSampleUploaded: false,
      },
      status: "READY",
      issueCodes: [],
      testedAt: new Date("2026-08-06T12:00:00.000Z"),
      expiresAt: new Date("2026-08-06T14:00:00.000Z"),
    });

    expect(result).toEqual({ runId: "run-1", actionId: "governed-action-1", attemptId: "attempt-1", receiptId: "receipt-1" });
    expect(tx.governedAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        capabilityId: SESSION_PREFLIGHT_PUBLISH_CAPABILITY_ID,
        decisionPolicy: "USER_INITIATED",
        decisionStatus: "NOT_REQUIRED",
        status: "READY",
      }),
      select: { id: true },
    });
    expect(tx.governedActionAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "SUCCEEDED", executorKind: "quipsly-session-preflight-domain-service" }),
      select: { id: true },
    });
    expect(tx.governedActionReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "EXECUTION_SUCCEEDED",
        previousStatus: "READY",
        newStatus: "SUCCEEDED",
        evidenceJson: expect.objectContaining({
          privateSampleBytesRetained: false,
          privateSampleUploaded: false,
          recordingStarted: false,
          providerJoined: false,
          sourceTruthChanged: false,
        }),
      }),
      select: { id: true },
    });
  });

  it("records reviewed transcript evidence as one targeted canonical-work action", async () => {
    const tx = transaction();
    const result = await recordSucceededTranscriptWorkAction(tx as never, {
      capabilityId: TRANSCRIPT_GOAL_MATERIALIZE_CAPABILITY_ID,
      clientRequestId: "goal-request-1",
      projectId: "project-1",
      roomId: "room-1",
      actorUserId: "user-1",
      actorEmail: "coach@example.test",
      sourceSurface: "nest-session-packet-goal-review",
      targetObjectType: "Goal",
      targetObjectId: "goal-1",
      payload: {
        roomId: "room-1",
        segmentId: "segment-1",
        expectedProviderTextSha256: "a".repeat(64),
        title: "Build the coaching review habit",
      },
      sourceEvidence: {
        objectType: "TranscriptSegmentSpan",
        transcriptJobId: "job-1",
        recordingAssetId: "asset-1",
        segmentIds: ["segment-1"],
      },
      result: { targetObjectType: "Goal", targetObjectId: "goal-1", status: "ACTIVE" },
      boundaries: { transcriptMutated: false, recordingMutated: false, calendarMutated: false },
    });

    expect(result).toEqual({
      schema: "quipsly-governed-action-reference-v1",
      runId: "run-1",
      actionId: "governed-action-1",
      attemptId: "attempt-1",
      receiptId: "receipt-1",
      capabilityId: TRANSCRIPT_GOAL_MATERIALIZE_CAPABILITY_ID,
      capabilityVersion: 1,
    });
    expect(tx.governedAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        capabilityId: TRANSCRIPT_GOAL_MATERIALIZE_CAPABILITY_ID,
        targetObjectType: "Goal",
        targetObjectId: "goal-1",
        decisionPolicy: "USER_INITIATED",
        decisionStatus: "NOT_REQUIRED",
        status: "READY",
      }),
      select: { id: true },
    });
    expect(tx.governedActionReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "EXECUTION_SUCCEEDED",
        evidenceJson: expect.objectContaining({
          targetObjectType: "Goal",
          targetObjectId: "goal-1",
          boundaries: expect.objectContaining({ transcriptMutated: false, calendarMutated: false }),
        }),
      }),
      select: { id: true },
    });
    expect(readGovernedActionSourceReference(result)).toEqual(result);
    expect(readGovernedActionSourceReference({ ...result, actionId: "" })).toBeNull();
  });

  it("fails closed when a transcript capability targets the wrong canonical object type", async () => {
    const tx = transaction();
    await expect(recordSucceededTranscriptWorkAction(tx as never, {
      capabilityId: TRANSCRIPT_GOAL_MATERIALIZE_CAPABILITY_ID,
      clientRequestId: "bad-target",
      projectId: "project-1",
      roomId: "room-1",
      actorUserId: "user-1",
      actorEmail: "coach@example.test",
      sourceSurface: "test",
      targetObjectType: "ActionItem",
      targetObjectId: "task-1",
      payload: { roomId: "room-1", segmentId: "segment-1", expectedProviderTextSha256: "a".repeat(64), title: "No" },
      sourceEvidence: {},
      result: {},
      boundaries: {},
    })).rejects.toThrow("TRANSCRIPT_WORK_TARGET_MISMATCH");
    expect(tx.governedActionRun.create).not.toHaveBeenCalled();
  });

  it("records an evidence-only merge with unchanged target snapshots and supersession recovery", async () => {
    const tx = transaction();
    const targetSnapshot = {
      id: "task-1",
      title: "Keep the canonical title",
      status: "OPEN",
      updatedAt: "2026-08-06T12:00:00.000Z",
    };
    const result = await recordSucceededTranscriptWorkAction(tx as never, {
      capabilityId: TRANSCRIPT_TASK_EVIDENCE_MERGE_CAPABILITY_ID,
      clientRequestId: "packet-review-receipt-1",
      projectId: "project-1",
      roomId: "room-1",
      actorUserId: "user-1",
      actorEmail: "coach@example.test",
      sourceSurface: "nest-session-packet-task-review",
      targetObjectType: "ActionItem",
      targetObjectId: "task-1",
      payload: {
        roomId: "room-1",
        segmentId: "segment-1",
        expectedProviderTextSha256: "a".repeat(64),
        targetObjectId: "task-1",
        expectedTargetUpdatedAt: targetSnapshot.updatedAt,
        evidenceReceiptId: "task-evidence-1",
      },
      sourceEvidence: {
        objectType: "TranscriptSegmentSpan",
        transcriptJobId: "job-1",
        recordingAssetId: "asset-1",
        segmentIds: ["segment-1"],
      },
      result: {
        targetObjectType: "ActionItem",
        targetObjectId: "task-1",
        evidenceReceiptId: "task-evidence-1",
        targetBefore: targetSnapshot,
        targetAfter: targetSnapshot,
      },
      boundaries: {
        taskIdentityMutated: false,
        taskStatusMutated: false,
        calendarMutated: false,
      },
    });

    expect(result.capabilityId).toBe(TRANSCRIPT_TASK_EVIDENCE_MERGE_CAPABILITY_ID);
    expect(tx.governedActionRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        intent: expect.stringContaining("without changing its work fields"),
        readSetJson: expect.arrayContaining([expect.objectContaining({ transcriptJobId: "job-1" })]),
      }),
      select: { id: true },
    });
    expect(tx.governedAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        capabilityId: TRANSCRIPT_TASK_EVIDENCE_MERGE_CAPABILITY_ID,
        actionKind: "MERGE_TRANSCRIPT_EVIDENCE_INTO_TASK",
        targetObjectType: "ActionItem",
        targetObjectId: "task-1",
        recoveryJson: expect.objectContaining({ method: "append-an-explicit-superseding-evidence-review" }),
        resultJson: expect.objectContaining({ targetBefore: targetSnapshot, targetAfter: targetSnapshot }),
      }),
      select: { id: true },
    });
    expect(tx.governedActionAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ executorKind: "quipsly-transcript-evidence-merge-domain-service" }),
      select: { id: true },
    });
    expect(readGovernedActionSourceReference(result)).toEqual(result);
  });

  it("records a reviewed note materialization with explicit audience and no delivery", async () => {
    const tx = transaction();
    const result = await recordSucceededTranscriptWorkAction(tx as never, {
      capabilityId: TRANSCRIPT_NOTE_MATERIALIZE_CAPABILITY_ID,
      clientRequestId: "packet-note-receipt-1",
      projectId: "project-1",
      roomId: "room-1",
      actorUserId: "user-1",
      actorEmail: "coach@example.test",
      sourceSurface: "nest-session-packet-note-review",
      targetObjectType: "CoachingNote",
      targetObjectId: "note-1",
      payload: {
        roomId: "room-1",
        segmentId: "segment-1",
        expectedProviderTextSha256: "a".repeat(64),
        noteId: "note-1",
        noteRevisionId: "note-revision-1",
        contentSha256: "b".repeat(64),
        visibility: "CLIENT_SAFE",
      },
      sourceEvidence: { objectType: "TranscriptSegmentSpan", transcriptJobId: "job-1", segmentIds: ["segment-1"] },
      result: { targetObjectType: "CoachingNote", targetObjectId: "note-1", audienceAfter: { visibility: "CLIENT_SAFE", externallyDelivered: false } },
      boundaries: { externalDelivery: false, clientFollowUpCreated: false },
    });

    expect(result.capabilityId).toBe(TRANSCRIPT_NOTE_MATERIALIZE_CAPABILITY_ID);
    expect(tx.governedAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionKind: "MATERIALIZE_TRANSCRIPT_NOTE",
        targetObjectType: "CoachingNote",
        targetObjectId: "note-1",
        recoveryJson: expect.objectContaining({ method: "append-a-note-revision-or-supersede-this-note" }),
      }),
      select: { id: true },
    });
    expect(tx.governedActionAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ executorKind: "quipsly-transcript-note-domain-service" }),
      select: { id: true },
    });
    expect(tx.governedActionReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        evidenceJson: expect.objectContaining({ contractKind: "quipsly-transcript-note-governed-action-receipt-v1" }),
      }),
      select: { id: true },
    });
  });

  it("records a high-risk note merge with retained before and after revisions", async () => {
    const tx = transaction();
    const result = await recordSucceededTranscriptWorkAction(tx as never, {
      capabilityId: TRANSCRIPT_NOTE_MERGE_CAPABILITY_ID,
      clientRequestId: "packet-note-merge-receipt-1",
      projectId: "project-1",
      roomId: "room-1",
      actorUserId: "user-1",
      actorEmail: "coach@example.test",
      sourceSurface: "ios-capture-session-packet-review",
      targetObjectType: "CoachingNote",
      targetObjectId: "note-1",
      payload: {
        roomId: "room-1",
        segmentId: "segment-1",
        expectedProviderTextSha256: "a".repeat(64),
        noteId: "note-1",
        expectedTargetUpdatedAt: "2026-08-06T12:00:00.000Z",
        noteRevisionId: "note-revision-2",
        previousContentSha256: "b".repeat(64),
        nextContentSha256: "c".repeat(64),
      },
      sourceEvidence: { objectType: "TranscriptSegmentSpan", transcriptJobId: "job-1", segmentIds: ["segment-1"] },
      result: { targetObjectType: "CoachingNote", targetObjectId: "note-1", targetBefore: { visibility: "AUTHOR_PRIVATE" }, targetAfter: { visibility: "SESSION_SHARED" } },
      boundaries: { visibilityChanged: true, priorContentRetainedInRevision: true, externalDelivery: false },
    });

    expect(result.capabilityId).toBe(TRANSCRIPT_NOTE_MERGE_CAPABILITY_ID);
    expect(tx.governedActionRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ riskLevel: "HIGH", intent: expect.stringContaining("complete previous content and audience") }),
      select: { id: true },
    });
    expect(tx.governedAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionKind: "MERGE_TRANSCRIPT_CANDIDATE_INTO_NOTE",
        recoveryJson: expect.objectContaining({ method: "append-a-compensating-note-revision-and-supersede-this-decision" }),
        resultJson: expect.objectContaining({ targetBefore: { visibility: "AUTHOR_PRIVATE" }, targetAfter: { visibility: "SESSION_SHARED" } }),
      }),
      select: { id: true },
    });
    expect(readGovernedActionSourceReference(result)).toEqual(result);
  });

  it("projects an approved writing decision into the governed action and parent run", async () => {
    const tx = transaction();
    tx.governedAction.findMany.mockResolvedValue([{ status: "READY" }]);

    await recordGovernedAssistantTransition(tx as never, {
      governedActionId: "governed-action-1",
      assistantActionId: "assistant-action-1",
      previousStatus: "proposed",
      newStatus: "approved",
      actorUserId: "user-1",
      actorEmail: "writer@example.test",
      evidence: { decision: "approved" },
    });

    expect(tx.governedAction.update).toHaveBeenCalledWith({
      where: { id: "governed-action-1" },
      data: expect.objectContaining({
        status: "READY",
        decisionStatus: "APPROVED",
        approvedByUserId: "user-1",
      }),
    });
    expect(tx.governedActionReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "DECISION_RECORDED", previousStatus: "PROPOSED", newStatus: "READY" }),
    });
    expect(tx.governedActionRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({ status: "READY" }),
    });
  });
});
