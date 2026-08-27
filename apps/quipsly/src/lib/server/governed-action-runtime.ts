import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { GovernedActionStatus, Prisma } from "@prisma/client";
import {
  assertGovernedActionPayload,
  getGovernedActionCapability,
  governedCapabilityForAssistantToolKind,
  SESSION_PREFLIGHT_PUBLISH_CAPABILITY_ID,
  TRANSCRIPT_GOAL_EVIDENCE_MERGE_CAPABILITY_ID,
  TRANSCRIPT_GOAL_MATERIALIZE_CAPABILITY_ID,
  TRANSCRIPT_NOTE_MATERIALIZE_CAPABILITY_ID,
  TRANSCRIPT_NOTE_MERGE_CAPABILITY_ID,
  TRANSCRIPT_TASK_EVIDENCE_MERGE_CAPABILITY_ID,
  TRANSCRIPT_TASK_MATERIALIZE_CAPABILITY_ID,
  type GovernedActionCapabilityManifest,
  type GovernedActionDecisionPolicy,
  type GovernedActionRiskLevel,
} from "@high-ground/quipsly-domain/governed-actions";

type Tx = Prisma.TransactionClient;
type JsonObject = Record<string, unknown>;

type AssistantProposalInput = {
  assistantActionId: string;
  kind: string;
  label: string;
  explanation: string;
  payload: JsonObject;
};

export type CreateAssistantProposalRunInput = {
  projectId: string;
  documentId: string | null;
  assistantSessionId: string;
  actorUserId: string;
  actorEmail: string;
  intent: string;
  sourceSurface: string;
  provider: string;
  model?: string | null;
  readSet: readonly JsonObject[];
  proposals: readonly AssistantProposalInput[];
};

export type RecordSessionPreflightActionInput = {
  requestId: string;
  requestSha256: string;
  projectId: string | null;
  roomId: string;
  actorUserId: string;
  actorEmail: string;
  clientKind: string;
  payload: JsonObject;
  status: "READY" | "NEEDS_ATTENTION";
  issueCodes: readonly string[];
  testedAt: Date;
  expiresAt: Date;
};

export type TranscriptWorkCapabilityId =
  | typeof TRANSCRIPT_GOAL_MATERIALIZE_CAPABILITY_ID
  | typeof TRANSCRIPT_TASK_MATERIALIZE_CAPABILITY_ID
  | typeof TRANSCRIPT_GOAL_EVIDENCE_MERGE_CAPABILITY_ID
  | typeof TRANSCRIPT_TASK_EVIDENCE_MERGE_CAPABILITY_ID
  | typeof TRANSCRIPT_NOTE_MATERIALIZE_CAPABILITY_ID
  | typeof TRANSCRIPT_NOTE_MERGE_CAPABILITY_ID;

export type RecordTranscriptWorkActionInput = {
  capabilityId: TranscriptWorkCapabilityId;
  clientRequestId: string;
  projectId: string | null;
  roomId: string;
  actorUserId: string;
  actorEmail: string;
  sourceSurface: string;
  targetObjectType: "Goal" | "ActionItem" | "CoachingNote";
  targetObjectId: string;
  payload: JsonObject;
  sourceEvidence: JsonObject;
  result: JsonObject;
  boundaries: JsonObject;
};

export type GovernedActionSourceReference = {
  schema: "quipsly-governed-action-reference-v1";
  runId: string;
  actionId: string;
  attemptId: string;
  receiptId: string;
  capabilityId: TranscriptWorkCapabilityId;
  capabilityVersion: number;
};

function canonical(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return String(value);
}

export function governedActionStableJson(value: unknown) {
  return JSON.stringify(canonical(value));
}

export function governedActionSha256(value: unknown) {
  return createHash("sha256").update(governedActionStableJson(value)).digest("hex");
}

function json(value: unknown): Prisma.InputJsonValue {
  return canonical(value) as Prisma.InputJsonValue;
}

function highestRisk(manifests: readonly GovernedActionCapabilityManifest[]): GovernedActionRiskLevel {
  const rank: Record<GovernedActionRiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  return manifests.reduce<GovernedActionRiskLevel>(
    (current, manifest) => rank[manifest.riskLevel] > rank[current] ? manifest.riskLevel : current,
    "LOW",
  );
}

function strictestDecisionPolicy(
  manifests: readonly GovernedActionCapabilityManifest[],
): GovernedActionDecisionPolicy {
  const rank: Record<GovernedActionDecisionPolicy, number> = {
    READ_ONLY: 0,
    USER_INITIATED: 1,
    DELEGATED: 2,
    EXPLICIT_APPROVAL: 3,
  };
  return manifests.reduce<GovernedActionDecisionPolicy>(
    (current, manifest) => rank[manifest.decisionPolicy] > rank[current]
      ? manifest.decisionPolicy
      : current,
    "READ_ONLY",
  );
}

function actionEnvelope(input: {
  capability: GovernedActionCapabilityManifest;
  principalKind: string;
  principalId: string;
  projectId: string | null;
  roomId: string | null;
  payload: JsonObject;
  idempotencyKey: string;
}) {
  const payloadSha256 = governedActionSha256(input.payload);
  return {
    payloadSha256,
    requestSha256: governedActionSha256({
      contractKind: "quipsly-governed-action-request-v1",
      capabilityId: input.capability.id,
      capabilityVersion: input.capability.version,
      principalKind: input.principalKind,
      principalId: input.principalId,
      projectId: input.projectId,
      roomId: input.roomId,
      idempotencyKey: input.idempotencyKey,
      payloadSha256,
    }),
  };
}

export async function createGovernedAssistantProposalRun(
  tx: Tx,
  input: CreateAssistantProposalRunInput,
) {
  if (!input.proposals.length) return {
    runId: null,
    actions: [] as Array<{
      assistantActionId: string;
      governedActionId: string;
      capabilityId: string;
      decisionPolicy: GovernedActionDecisionPolicy;
      decisionStatus: "PENDING" | "NOT_REQUIRED";
      status: "PROPOSED" | "READY";
      assistantStatus: "proposed" | "ready";
    }>,
  };
  const prepared = input.proposals.map((proposal) => {
    const capability = governedCapabilityForAssistantToolKind(proposal.kind);
    if (!capability) throw new Error(`UNREGISTERED_ASSISTANT_CAPABILITY:${proposal.kind}`);
    assertGovernedActionPayload(capability.id, proposal.payload);
    return { proposal, capability };
  });
  const manifests = prepared.map(({ capability }) => capability);
  const runDecisionPolicy = strictestDecisionPolicy(manifests);
  const requiresDecision = runDecisionPolicy === "EXPLICIT_APPROVAL";
  const run = await tx.governedActionRun.create({
    data: {
      projectId: input.projectId,
      requestedByUserId: input.actorUserId,
      requestedByEmail: input.actorEmail,
      principalKind: "USER",
      principalId: input.actorUserId,
      sourceSurface: input.sourceSurface,
      intent: input.intent,
      decisionPolicy: runDecisionPolicy,
      riskLevel: highestRisk(manifests),
      status: requiresDecision ? "AWAITING_DECISION" : "READY",
      authorityJson: json({
        contractKind: "quipsly-governed-authority-snapshot-v1",
        basis: requiresDecision
          ? "authorized-project-read-and-deliberate-apply-before-mutation"
          : "authorized-project-read-or-user-initiated-navigation",
        projectId: input.projectId,
        documentId: input.documentId,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
      }),
      budgetJson: json({
        provider: input.provider,
        model: input.model ?? null,
        proposalCount: input.proposals.length,
        monetaryLimitUsd: null,
      }),
      readSetJson: json(input.readSet),
      consequenceJson: json({
        immediate: requiresDecision ? "proposal-ledger-only" : "bounded-action-ready",
        sourceTruthChanged: false,
        requiresExplicitApprovalBeforeMutation: requiresDecision,
      }),
      progressJson: json({
        proposed: prepared.filter(({ capability }) => capability.decisionPolicy === "EXPLICIT_APPROVAL").length,
        ready: prepared.filter(({ capability }) => capability.decisionPolicy !== "EXPLICIT_APPROVAL").length,
        completed: 0,
      }),
    },
    select: { id: true },
  });

  const actions: Array<{
    assistantActionId: string;
    governedActionId: string;
    capabilityId: string;
    decisionPolicy: GovernedActionDecisionPolicy;
    decisionStatus: "PENDING" | "NOT_REQUIRED";
    status: "PROPOSED" | "READY";
    assistantStatus: "proposed" | "ready";
  }> = [];
  for (const { proposal, capability } of prepared) {
    const actionRequiresDecision = capability.decisionPolicy === "EXPLICIT_APPROVAL";
    const governedStatus = actionRequiresDecision ? "PROPOSED" as const : "READY" as const;
    const assistantStatus = actionRequiresDecision ? "proposed" as const : "ready" as const;
    const decisionStatus = actionRequiresDecision ? "PENDING" as const : "NOT_REQUIRED" as const;
    const requestId = randomUUID();
    const envelope = actionEnvelope({
      capability,
      principalKind: "USER",
      principalId: input.actorUserId,
      projectId: input.projectId,
      roomId: null,
      payload: proposal.payload,
      idempotencyKey: proposal.assistantActionId,
    });
    const action = await tx.governedAction.create({
      data: {
        runId: run.id,
        requestId,
        capabilityId: capability.id,
        capabilityVersion: capability.version,
        actionKind: proposal.kind,
        label: proposal.label,
        explanation: proposal.explanation,
        payloadJson: json(proposal.payload),
        payloadSha256: envelope.payloadSha256,
        requestSha256: envelope.requestSha256,
        idempotencyKey: proposal.assistantActionId,
        decisionPolicy: capability.decisionPolicy,
        decisionStatus,
        riskLevel: capability.riskLevel,
        status: governedStatus,
        consequenceJson: json({ consequences: capability.consequences }),
        recoveryJson: json({ supported: capability.recovery }),
      },
      select: { id: true },
    });
    if (actionRequiresDecision) {
      await tx.governedActionReceipt.create({
        data: {
          actionId: action.id,
          kind: "PROPOSAL_RECORDED",
          previousStatus: null,
          newStatus: "PROPOSED",
          actorUserId: input.actorUserId,
          actorEmail: input.actorEmail,
          evidenceJson: json({
            contractKind: "quipsly-governed-action-proposal-receipt-v1",
            assistantSessionId: input.assistantSessionId,
            assistantActionId: proposal.assistantActionId,
            capabilityId: capability.id,
            capabilityVersion: capability.version,
            requestSha256: envelope.requestSha256,
            payloadSha256: envelope.payloadSha256,
          }),
        },
      });
    }
    await tx.studioAssistantAction.update({
      where: { id: proposal.assistantActionId },
      data: { governedActionId: action.id, status: assistantStatus },
    });
    actions.push({
      assistantActionId: proposal.assistantActionId,
      governedActionId: action.id,
      capabilityId: capability.id,
      decisionPolicy: capability.decisionPolicy,
      decisionStatus,
      status: governedStatus,
      assistantStatus,
    });
  }
  return { runId: run.id, actions };
}

export async function recordSucceededSessionPreflightAction(
  tx: Tx,
  input: RecordSessionPreflightActionInput,
) {
  const capability = getGovernedActionCapability(SESSION_PREFLIGHT_PUBLISH_CAPABILITY_ID);
  if (!capability) throw new Error("SESSION_PREFLIGHT_CAPABILITY_NOT_REGISTERED");
  assertGovernedActionPayload(capability.id, input.payload);
  const envelope = actionEnvelope({
    capability,
    principalKind: "USER",
    principalId: input.actorUserId,
    projectId: input.projectId,
    roomId: input.roomId,
    payload: input.payload,
    idempotencyKey: input.requestId,
  });
  if (envelope.payloadSha256 !== governedActionSha256(input.payload)) {
    throw new Error("GOVERNED_ACTION_PAYLOAD_HASH_MISMATCH");
  }
  const now = new Date();
  const run = await tx.governedActionRun.create({
    data: {
      projectId: input.projectId,
      roomId: input.roomId,
      requestedByUserId: input.actorUserId,
      requestedByEmail: input.actorEmail,
      principalKind: "USER",
      principalId: input.actorUserId,
      sourceSurface: input.clientKind === "ios" ? "quipsly-capture" : input.clientKind === "macos" ? "quipsly-mac" : "nest-session-lobby",
      intent: "Share this endpoint's bounded private-playback readiness receipt with Session collaborators.",
      decisionPolicy: capability.decisionPolicy,
      riskLevel: capability.riskLevel,
      status: "EXECUTING",
      authorityJson: json({
        contractKind: "quipsly-governed-authority-snapshot-v1",
        basis: "current-session-participant-or-project-collaborator-access",
        roomId: input.roomId,
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
      }),
      budgetJson: json({ providerCalls: 0, uploadedSampleBytes: 0, retainedSampleBytes: 0 }),
      readSetJson: json([{ objectType: "CallRoom", objectId: input.roomId }]),
      consequenceJson: json({
        appendOnlyReceipt: true,
        sampleBytesRetained: false,
        sampleBytesUploaded: false,
        recordingStarted: false,
        providerJoined: false,
        sourceTruthChanged: false,
      }),
      progressJson: json({ completed: 1, total: 1 }),
      summaryJson: json({ status: input.status, issueCodes: input.issueCodes }),
      startedAt: now,
    },
    select: { id: true },
  });
  const action = await tx.governedAction.create({
    data: {
      runId: run.id,
      requestId: input.requestId,
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      actionKind: "PUBLISH_SESSION_PREFLIGHT_RECEIPT",
      label: "Share private-playback setup receipt",
      explanation: "The participant deliberately completed and submitted a bounded setup check; no private sample bytes crossed the endpoint boundary.",
      payloadJson: json(input.payload),
      payloadSha256: envelope.payloadSha256,
      requestSha256: envelope.requestSha256,
      idempotencyKey: input.requestId,
      decisionPolicy: capability.decisionPolicy,
      decisionStatus: "NOT_REQUIRED",
      riskLevel: capability.riskLevel,
      status: "READY",
      consequenceJson: json({ consequences: capability.consequences }),
      recoveryJson: json({ supported: capability.recovery, method: "publish-a-newer-expiring-receipt" }),
      approvedByUserId: input.actorUserId,
      approvedByEmail: input.actorEmail,
      approvedAt: now,
    },
    select: { id: true },
  });
  const attempt = await tx.governedActionAttempt.create({
    data: {
      actionId: action.id,
      attemptNumber: 1,
      executorKind: "quipsly-session-preflight-domain-service",
      status: "SUCCEEDED",
      evidenceJson: json({
        domainRequestId: input.requestId,
        domainRequestSha256: input.requestSha256,
        payloadSha256: envelope.payloadSha256,
        requestSha256: envelope.requestSha256,
      }),
      startedAt: now,
      completedAt: now,
    },
    select: { id: true },
  });
  await tx.governedAction.update({
    where: { id: action.id },
    data: {
      status: "SUCCEEDED",
      resultJson: json({
        domainRequestId: input.requestId,
        domainRequestSha256: input.requestSha256,
        status: input.status,
        issueCodes: input.issueCodes,
        testedAt: input.testedAt,
        expiresAt: input.expiresAt,
      }),
      completedAt: now,
    },
  });
  const receipt = await tx.governedActionReceipt.create({
    data: {
      actionId: action.id,
      attemptId: attempt.id,
      kind: "EXECUTION_SUCCEEDED",
      previousStatus: "READY",
      newStatus: "SUCCEEDED",
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      evidenceJson: json({
        contractKind: "quipsly-session-preflight-governed-action-receipt-v1",
        domainRequestId: input.requestId,
        domainRequestSha256: input.requestSha256,
        capabilityId: capability.id,
        capabilityVersion: capability.version,
        privateSampleBytesRetained: false,
        privateSampleUploaded: false,
        recordingStarted: false,
        providerJoined: false,
        sourceTruthChanged: false,
      }),
    },
    select: { id: true },
  });
  await tx.governedActionRun.update({
    where: { id: run.id },
    data: { status: "SUCCEEDED", completedAt: now },
  });
  return { runId: run.id, actionId: action.id, attemptId: attempt.id, receiptId: receipt.id };
}

export function readGovernedActionSourceReference(value: unknown): GovernedActionSourceReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const reference = value as Record<string, unknown>;
  if (
    reference.schema !== "quipsly-governed-action-reference-v1"
    || typeof reference.runId !== "string"
    || !reference.runId
    || typeof reference.actionId !== "string"
    || !reference.actionId
    || typeof reference.attemptId !== "string"
    || !reference.attemptId
    || typeof reference.receiptId !== "string"
    || !reference.receiptId
    || (
      reference.capabilityId !== TRANSCRIPT_GOAL_MATERIALIZE_CAPABILITY_ID
      && reference.capabilityId !== TRANSCRIPT_TASK_MATERIALIZE_CAPABILITY_ID
      && reference.capabilityId !== TRANSCRIPT_GOAL_EVIDENCE_MERGE_CAPABILITY_ID
      && reference.capabilityId !== TRANSCRIPT_TASK_EVIDENCE_MERGE_CAPABILITY_ID
      && reference.capabilityId !== TRANSCRIPT_NOTE_MATERIALIZE_CAPABILITY_ID
      && reference.capabilityId !== TRANSCRIPT_NOTE_MERGE_CAPABILITY_ID
    )
    || reference.capabilityVersion !== 1
  ) return null;
  return reference as GovernedActionSourceReference;
}

export async function recordSucceededTranscriptWorkAction(
  tx: Tx,
  input: RecordTranscriptWorkActionInput,
): Promise<GovernedActionSourceReference> {
  const capability = getGovernedActionCapability(input.capabilityId);
  if (!capability) throw new Error(`TRANSCRIPT_WORK_CAPABILITY_NOT_REGISTERED:${input.capabilityId}`);
  const isGoalCapability = input.capabilityId === TRANSCRIPT_GOAL_MATERIALIZE_CAPABILITY_ID
    || input.capabilityId === TRANSCRIPT_GOAL_EVIDENCE_MERGE_CAPABILITY_ID;
  const isNoteCapability = input.capabilityId === TRANSCRIPT_NOTE_MATERIALIZE_CAPABILITY_ID
    || input.capabilityId === TRANSCRIPT_NOTE_MERGE_CAPABILITY_ID;
  const isNoteMaterialization = input.capabilityId === TRANSCRIPT_NOTE_MATERIALIZE_CAPABILITY_ID;
  const isNoteMerge = input.capabilityId === TRANSCRIPT_NOTE_MERGE_CAPABILITY_ID;
  const isEvidenceMerge = input.capabilityId === TRANSCRIPT_GOAL_EVIDENCE_MERGE_CAPABILITY_ID
    || input.capabilityId === TRANSCRIPT_TASK_EVIDENCE_MERGE_CAPABILITY_ID;
  const expectedTarget = isNoteCapability ? "CoachingNote" : isGoalCapability ? "Goal" : "ActionItem";
  if (input.targetObjectType !== expectedTarget) {
    throw new Error(`TRANSCRIPT_WORK_TARGET_MISMATCH:${input.capabilityId}`);
  }
  assertGovernedActionPayload(capability.id, input.payload);
  const envelope = actionEnvelope({
    capability,
    principalKind: "USER",
    principalId: input.actorUserId,
    projectId: input.projectId,
    roomId: input.roomId,
    payload: input.payload,
    idempotencyKey: input.clientRequestId,
  });
  const now = new Date();
  const intent = isNoteMerge
    ? "Create one reviewed revision of the Session note I selected, retaining its complete previous content and audience without sending it anywhere."
    : isNoteMaterialization
      ? "Create one canonical Session note from the reviewed transcript evidence, wording, purpose, and audience I selected without sending it anywhere."
      : isEvidenceMerge
        ? `Add the reviewed transcript evidence I selected to one existing ${input.targetObjectType === "Goal" ? "goal" : "task"} without changing its work fields.`
        : input.targetObjectType === "Goal"
          ? "Create one canonical goal from the reviewed transcript evidence I selected."
          : "Create one canonical task from the reviewed transcript evidence I selected.";
  const actionKind = isNoteMerge
    ? "MERGE_TRANSCRIPT_CANDIDATE_INTO_NOTE"
    : isNoteMaterialization
      ? "MATERIALIZE_TRANSCRIPT_NOTE"
      : isEvidenceMerge
        ? input.targetObjectType === "Goal"
          ? "MERGE_TRANSCRIPT_EVIDENCE_INTO_GOAL"
          : "MERGE_TRANSCRIPT_EVIDENCE_INTO_TASK"
        : input.targetObjectType === "Goal"
          ? "MATERIALIZE_TRANSCRIPT_GOAL"
          : "MATERIALIZE_TRANSCRIPT_TASK";
  const recoveryMethod = isNoteMerge
    ? "append-a-compensating-note-revision-and-supersede-this-decision"
    : isNoteMaterialization
      ? "append-a-note-revision-or-supersede-this-note"
      : isEvidenceMerge
        ? "append-an-explicit-superseding-evidence-review"
        : "edit-or-close-the-canonical-work-object";
  const run = await tx.governedActionRun.create({
    data: {
      projectId: input.projectId,
      roomId: input.roomId,
      requestedByUserId: input.actorUserId,
      requestedByEmail: input.actorEmail,
      principalKind: "USER",
      principalId: input.actorUserId,
      sourceSurface: input.sourceSurface,
      intent,
      decisionPolicy: capability.decisionPolicy,
      riskLevel: capability.riskLevel,
      status: "EXECUTING",
      authorityJson: json({
        contractKind: "quipsly-governed-authority-snapshot-v1",
        basis: "current-session-mutation-access-and-deliberate-transcript-review",
        roomId: input.roomId,
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
      }),
      budgetJson: json({ providerCalls: 0, externalWrites: 0, estimatedCostUsd: 0 }),
      readSetJson: json([input.sourceEvidence]),
      consequenceJson: json(input.boundaries),
      progressJson: json({ completed: 1, total: 1 }),
      summaryJson: json({ targetObjectType: input.targetObjectType, targetObjectId: input.targetObjectId }),
      startedAt: now,
    },
    select: { id: true },
  });
  const action = await tx.governedAction.create({
    data: {
      runId: run.id,
      requestId: randomUUID(),
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      actionKind,
      targetObjectType: input.targetObjectType,
      targetObjectId: input.targetObjectId,
      label: capability.title,
      explanation: capability.promise,
      payloadJson: json(input.payload),
      payloadSha256: envelope.payloadSha256,
      requestSha256: envelope.requestSha256,
      idempotencyKey: input.clientRequestId,
      decisionPolicy: capability.decisionPolicy,
      decisionStatus: "NOT_REQUIRED",
      riskLevel: capability.riskLevel,
      status: "READY",
      consequenceJson: json({ consequences: capability.consequences, boundaries: input.boundaries }),
      recoveryJson: json({
        supported: capability.recovery,
        method: recoveryMethod,
      }),
      resultJson: json(input.result),
      approvedByUserId: input.actorUserId,
      approvedByEmail: input.actorEmail,
      approvedAt: now,
    },
    select: { id: true },
  });
  const attempt = await tx.governedActionAttempt.create({
    data: {
      actionId: action.id,
      attemptNumber: 1,
      executorKind: isNoteCapability
        ? "quipsly-transcript-note-domain-service"
        : isEvidenceMerge
          ? "quipsly-transcript-evidence-merge-domain-service"
          : "quipsly-transcript-work-domain-service",
      status: "SUCCEEDED",
      evidenceJson: json({
        sourceEvidence: input.sourceEvidence,
        targetObjectType: input.targetObjectType,
        targetObjectId: input.targetObjectId,
        payloadSha256: envelope.payloadSha256,
        requestSha256: envelope.requestSha256,
      }),
      startedAt: now,
      completedAt: now,
    },
    select: { id: true },
  });
  await tx.governedAction.update({
    where: { id: action.id },
    data: { status: "SUCCEEDED", completedAt: now },
  });
  const receipt = await tx.governedActionReceipt.create({
    data: {
      actionId: action.id,
      attemptId: attempt.id,
      kind: "EXECUTION_SUCCEEDED",
      previousStatus: "READY",
      newStatus: "SUCCEEDED",
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      evidenceJson: json({
        contractKind: isNoteCapability
          ? "quipsly-transcript-note-governed-action-receipt-v1"
          : "quipsly-transcript-work-governed-action-receipt-v1",
        capabilityId: capability.id,
        capabilityVersion: capability.version,
        clientRequestId: input.clientRequestId,
        targetObjectType: input.targetObjectType,
        targetObjectId: input.targetObjectId,
        sourceEvidence: input.sourceEvidence,
        boundaries: input.boundaries,
      }),
    },
    select: { id: true },
  });
  await tx.governedActionRun.update({
    where: { id: run.id },
    data: { status: "SUCCEEDED", completedAt: now },
  });
  return {
    schema: "quipsly-governed-action-reference-v1",
    runId: run.id,
    actionId: action.id,
    attemptId: attempt.id,
    receiptId: receipt.id,
    capabilityId: input.capabilityId,
    capabilityVersion: capability.version,
  };
}

function governedStatusForAssistantStatus(status: string): GovernedActionStatus {
  if (status === "ready" || status === "approved") return "READY";
  if (status === "running") return "EXECUTING";
  if (status === "rejected") return "REJECTED";
  if (status === "completed" || status === "applied" || status === "committed") return "SUCCEEDED";
  if (status === "undone") return "UNDONE";
  return "PROPOSED";
}

async function projectRunStatus(tx: Tx, runId: string) {
  const actions = await tx.governedAction.findMany({
    where: { runId },
    select: { status: true },
  });
  const statuses = actions.map((action) => action.status);
  const status = statuses.every((value) => ["SUCCEEDED", "REJECTED", "UNDONE", "SUPERSEDED"].includes(value))
    ? "SUCCEEDED"
    : statuses.some((value) => value === "FAILED")
      ? "PARTIAL"
      : statuses.some((value) => value === "EXECUTING")
        ? "EXECUTING"
        : statuses.some((value) => value === "READY")
          ? "READY"
          : "AWAITING_DECISION";
  await tx.governedActionRun.update({
    where: { id: runId },
    data: {
      status,
      completedAt: status === "SUCCEEDED" ? new Date() : null,
      progressJson: json({
        total: statuses.length,
        proposed: statuses.filter((value) => value === "PROPOSED").length,
        ready: statuses.filter((value) => value === "READY").length,
        completed: statuses.filter((value) => ["SUCCEEDED", "REJECTED", "UNDONE", "SUPERSEDED"].includes(value)).length,
      }),
    },
  });
}

export async function recordGovernedAssistantTransition(
  tx: Tx,
  input: {
    governedActionId: string | null;
    assistantActionId: string;
    previousStatus: string;
    newStatus: string;
    actorUserId?: string | null;
    actorEmail: string;
    evidence: JsonObject;
  },
) {
  if (!input.governedActionId) return null;
  const action = await tx.governedAction.findUnique({
    where: { id: input.governedActionId },
    select: { id: true, runId: true, status: true, decisionPolicy: true },
  });
  if (!action) throw new Error("GOVERNED_ACTION_NOT_FOUND");
  const nextStatus = governedStatusForAssistantStatus(input.newStatus);
  const isExecution = nextStatus === "SUCCEEDED";
  const isRecovery = nextStatus === "UNDONE";
  const isDecision = ["READY", "REJECTED", "PROPOSED"].includes(nextStatus);
  const needsDecision = action.decisionPolicy === "EXPLICIT_APPROVAL";
  const now = new Date();
  let attemptId: string | null = null;
  if (isExecution || isRecovery) {
    const count = await tx.governedActionAttempt.count({ where: { actionId: action.id } });
    const attempt = await tx.governedActionAttempt.create({
      data: {
        actionId: action.id,
        attemptNumber: count + 1,
        executorKind: isRecovery ? "quipsly-writing-recovery-domain-service" : "quipsly-writing-domain-service",
        status: "SUCCEEDED",
        evidenceJson: json({ assistantActionId: input.assistantActionId, ...input.evidence }),
        startedAt: now,
        completedAt: now,
      },
      select: { id: true },
    });
    attemptId = attempt.id;
  }
  await tx.governedAction.update({
    where: { id: action.id },
    data: {
      status: nextStatus,
      decisionStatus: !needsDecision
        ? "NOT_REQUIRED"
        : nextStatus === "READY" || isExecution
          ? "APPROVED"
        : nextStatus === "REJECTED"
          ? "REJECTED"
          : nextStatus === "PROPOSED"
            ? "PENDING"
            : undefined,
      approvedByUserId: needsDecision && (nextStatus === "READY" || isExecution) ? input.actorUserId ?? null : undefined,
      approvedByEmail: needsDecision && (nextStatus === "READY" || isExecution) ? input.actorEmail : undefined,
      approvedAt: needsDecision && (nextStatus === "READY" || isExecution) ? now : undefined,
      completedAt: isExecution || isRecovery || nextStatus === "REJECTED" ? now : null,
      resultJson: isExecution || isRecovery ? json(input.evidence) : undefined,
    },
  });
  await tx.governedActionReceipt.create({
    data: {
      actionId: action.id,
      attemptId,
      kind: isRecovery
        ? "RECOVERY_COMPLETED"
        : isExecution
          ? "EXECUTION_SUCCEEDED"
          : isDecision
            ? "DECISION_RECORDED"
            : "READBACK_VERIFIED",
      previousStatus: action.status,
      newStatus: nextStatus,
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail,
      evidenceJson: json({
        contractKind: "quipsly-assistant-governed-transition-v1",
        assistantActionId: input.assistantActionId,
        legacyPreviousStatus: input.previousStatus,
        legacyNewStatus: input.newStatus,
        ...input.evidence,
      }),
    },
  });
  await projectRunStatus(tx, action.runId);
  return { actionId: action.id, runId: action.runId, status: nextStatus };
}
