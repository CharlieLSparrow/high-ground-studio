/**
 * Stable, provider-neutral capability contracts for consequential Quipsly work.
 *
 * UI, first-party assistants, scheduled work, and future API/MCP clients must
 * all name one of these capabilities. The model may explain or propose an
 * action, but only registered code decides its authority, consequence,
 * evidence, and recovery contract.
 */

export type GovernedActionDecisionPolicy =
  | "READ_ONLY"
  | "USER_INITIATED"
  | "EXPLICIT_APPROVAL"
  | "DELEGATED";

export type GovernedActionRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type GovernedActionRecoveryKind =
  | "NONE"
  | "RETRY"
  | "SUPERSEDE"
  | "COMPENSATE"
  | "UNDO";

export type GovernedActionQualification =
  | "REGISTERED"
  | "AUTOMATED"
  | "OPERATED_LOCAL"
  | "OPERATED_PHYSICAL"
  | "PRODUCTION_QUALIFIED";

export type GovernedActionScopeKind = "PROJECT" | "SESSION" | "DOCUMENT";

export type GovernedActionCapabilityManifest = {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly promise: string;
  readonly objectTypes: readonly string[];
  readonly scope: GovernedActionScopeKind;
  readonly decisionPolicy: GovernedActionDecisionPolicy;
  readonly riskLevel: GovernedActionRiskLevel;
  readonly consequences: readonly string[];
  readonly evidence: readonly string[];
  readonly recovery: readonly GovernedActionRecoveryKind[];
  readonly entryPoints: readonly string[];
  readonly apiExposure: "FIRST_PARTY" | "AUTHORIZED_API" | "NONE";
  readonly mcpExposure: "PLANNED" | "NONE";
  readonly accessibility: readonly string[];
  readonly qualification: GovernedActionQualification;
};

export const SESSION_PREFLIGHT_PUBLISH_CAPABILITY_ID = "quipsly.session.preflight.publish";
export const TRANSCRIPT_GOAL_MATERIALIZE_CAPABILITY_ID = "quipsly.session.transcript-goal.materialize";
export const TRANSCRIPT_TASK_MATERIALIZE_CAPABILITY_ID = "quipsly.session.transcript-task.materialize";
export const TRANSCRIPT_GOAL_EVIDENCE_MERGE_CAPABILITY_ID = "quipsly.session.transcript-goal-evidence.merge";
export const TRANSCRIPT_TASK_EVIDENCE_MERGE_CAPABILITY_ID = "quipsly.session.transcript-task-evidence.merge";
export const TRANSCRIPT_NOTE_MATERIALIZE_CAPABILITY_ID = "quipsly.session.transcript-note.materialize";
export const TRANSCRIPT_NOTE_MERGE_CAPABILITY_ID = "quipsly.session.transcript-note.merge";

const writingManifest = (
  id: string,
  title: string,
  decisionPolicy: GovernedActionDecisionPolicy,
  riskLevel: GovernedActionRiskLevel,
  promise: string,
  consequences: readonly string[],
  recovery: readonly GovernedActionRecoveryKind[],
): GovernedActionCapabilityManifest => ({
  id,
  version: 1,
  title,
  promise,
  objectTypes: ["StudioProject", "StudioDocument", "StudioDocumentBlock", "StudioAssistantAction"],
  scope: "DOCUMENT",
  decisionPolicy,
  riskLevel,
  consequences,
  evidence: [
    "authorized project and document scope",
    "canonical source block identities",
    "typed action payload hash",
    "append-only action and result receipts",
    "changed-version readback when a write executes",
  ],
  recovery,
  entryPoints: ["writing desk assistant", "story bible review inbox"],
  apiExposure: "FIRST_PARTY",
  mcpExposure: "PLANNED",
  accessibility: ["keyboard-operable actions", "text explanation", "status not conveyed by color alone"],
  qualification: "OPERATED_LOCAL",
});

const WRITING_CAPABILITIES = {
  "suggest-tags": writingManifest(
    "quipsly.writing.tags.suggest",
    "Suggest writing tags",
    "READ_ONLY",
    "LOW",
    "Show useful tag suggestions immediately without changing the document.",
    ["returns suggestions only", "does not apply or remove tags"],
    ["RETRY"],
  ),
  "find-related-blocks": writingManifest(
    "quipsly.writing.related-blocks.find",
    "Find related writing blocks",
    "READ_ONLY",
    "LOW",
    "Find and show related writing immediately without changing source truth.",
    ["returns navigable results only", "does not change writing"],
    ["RETRY"],
  ),
  "find-examples": writingManifest(
    "quipsly.writing.examples.find",
    "Find source-grounded examples",
    "READ_ONLY",
    "LOW",
    "Search authorized source material and show grounded examples immediately.",
    ["reads authorized sources", "returns cited results", "does not change source material"],
    ["RETRY"],
  ),
  "search-quotes": writingManifest(
    "quipsly.writing.quotes.search",
    "Search source-grounded quotes",
    "READ_ONLY",
    "LOW",
    "Search authorized source material and show grounded quotes immediately.",
    ["reads authorized sources", "returns cited results", "does not change source material"],
    ["RETRY"],
  ),
  "create-research-packet-note": writingManifest(
    "quipsly.writing.research-note.propose",
    "Preview a research packet note",
    "READ_ONLY",
    "LOW",
    "Prepare and show a research-note preview without saving or publishing it.",
    ["returns a private preview only", "does not create or publish a note"],
    ["RETRY"],
  ),
  "summarize-selected-block": writingManifest(
    "quipsly.writing.block-summary.propose",
    "Summarize the selected block",
    "READ_ONLY",
    "LOW",
    "Show a summary of the selected source immediately without changing it.",
    ["returns a summary only", "does not change the selected block"],
    ["RETRY"],
  ),
  "propose-output-plan": writingManifest(
    "quipsly.output.plan.propose",
    "Prepare an output plan",
    "READ_ONLY",
    "LOW",
    "Show a capability and readiness plan immediately without publishing anything.",
    ["returns a capability and readiness plan", "does not publish or alter an output"],
    ["RETRY"],
  ),
  "PROPOSE_ENTITY": writingManifest(
    "quipsly.story-bible.entity.propose-create",
    "Propose a Story Bible entity",
    "EXPLICIT_APPROVAL",
    "MEDIUM",
    "Prepare an evidence-bound entity that changes the Story Bible only when the user chooses Add.",
    ["may create a source-anchored entity after explicit approval"],
    ["UNDO", "SUPERSEDE"],
  ),
  "PROPOSE_ENTITY_UPDATE": writingManifest(
    "quipsly.story-bible.entity.propose-update",
    "Propose a Story Bible entity update",
    "EXPLICIT_APPROVAL",
    "HIGH",
    "Prepare an evidence-bound entity update that changes the Story Bible only when the user chooses Apply.",
    ["may change a source-anchored entity after explicit approval"],
    ["UNDO", "SUPERSEDE"],
  ),
  "PROPOSE_DRAFT": writingManifest(
    "quipsly.writing.draft.propose",
    "Propose manuscript draft text",
    "EXPLICIT_APPROVAL",
    "HIGH",
    "Prepare draft text that enters the manuscript only when the user chooses Apply.",
    ["may insert a private manuscript block after explicit approval"],
    ["UNDO", "SUPERSEDE"],
  ),
  "PROPOSE_REWRITE": writingManifest(
    "quipsly.writing.rewrite.propose",
    "Propose an exact-block rewrite",
    "EXPLICIT_APPROVAL",
    "HIGH",
    "Prepare an exact-block rewrite that replaces source text only when the user chooses Apply.",
    ["may replace one exact source block after explicit approval and stale-source verification"],
    ["UNDO", "SUPERSEDE"],
  ),
  "CHECK_CONTINUITY": writingManifest(
    "quipsly.writing.continuity.check",
    "Check manuscript continuity",
    "READ_ONLY",
    "LOW",
    "Show evidence-bound continuity findings immediately without changing the manuscript.",
    ["returns findings only", "does not change the manuscript or Story Bible"],
    ["RETRY"],
  ),
  "PROPOSE_CONTINUITY_FIX": writingManifest(
    "quipsly.writing.continuity-fix.propose",
    "Propose a continuity repair",
    "EXPLICIT_APPROVAL",
    "HIGH",
    "Prepare an exact-block continuity repair that changes the manuscript only when the user chooses Apply.",
    ["may replace one exact source block after explicit approval and stale-source verification"],
    ["UNDO", "SUPERSEDE"],
  ),
  "open-document": writingManifest(
    "quipsly.writing.document-open.propose",
    "Open a related document",
    "USER_INITIATED",
    "LOW",
    "Open an authorized related document when the user chooses Open.",
    ["changes the current navigation only", "does not change project data"],
    ["NONE"],
  ),
} as const;

export type AssistantGovernedToolKind = keyof typeof WRITING_CAPABILITIES;

const SESSION_PREFLIGHT_MANIFEST: GovernedActionCapabilityManifest = {
  id: SESSION_PREFLIGHT_PUBLISH_CAPABILITY_ID,
  version: 1,
  title: "Publish a private Session setup-check receipt",
  promise: "Share bounded endpoint readiness without retaining or uploading the private sound-check sample.",
  objectTypes: ["CallRoom", "CallParticipant", "CallParticipantPreflightReceipt"],
  scope: "SESSION",
  decisionPolicy: "USER_INITIATED",
  riskLevel: "LOW",
  consequences: [
    "appends one expiring participant/endpoint readiness receipt",
    "may change the collaborators' projected readiness state",
    "does not start recording, join a provider, upload sample bytes, or change source truth",
  ],
  evidence: [
    "current Session mutation authority",
    "bounded device and route labels",
    "meter summary",
    "complete local playback decision",
    "client observation and server receipt clocks",
    "idempotency and payload hashes",
  ],
  recovery: ["RETRY", "SUPERSEDE"],
  entryPoints: ["browser Session lobby", "Quipsly Capture Session setup"],
  apiExposure: "AUTHORIZED_API",
  mcpExposure: "NONE",
  accessibility: ["explicit heard-clear decision", "issue text", "status not conveyed by color alone"],
  qualification: "OPERATED_LOCAL",
};

const transcriptWorkManifest = (
  id: string,
  title: string,
  objectType: "Goal" | "ActionItem",
): GovernedActionCapabilityManifest => ({
  id,
  version: 1,
  title,
  promise: `Turn one reviewed, playback-linked transcript span into one canonical ${objectType === "Goal" ? "goal" : "task"} without changing transcript or recording truth.`,
  objectTypes: ["CallRoom", "TranscriptJob", "TranscriptSegment", objectType],
  scope: "SESSION",
  decisionPolicy: "USER_INITIATED",
  riskLevel: "MEDIUM",
  consequences: [
    `creates one canonical actor-owned ${objectType === "Goal" ? "goal" : "task"}`,
    "preserves the exact released transcript and playback source anchor",
    "does not mutate provider transcript, correction overlay, recording, calendar, delivery, or publication",
  ],
  evidence: [
    "current Session mutation authority",
    "released recording-backed transcript gate",
    "provider and effective-text hashes",
    "exact segment or thought-span identities and source clock",
    "human-reviewed materialization wording",
    "canonical target identity and immutable action receipt",
  ],
  recovery: ["SUPERSEDE"],
  entryPoints: ["Nest Session transcript review", "Quipsly Capture transcript review"],
  apiExposure: "AUTHORIZED_API",
  mcpExposure: "PLANNED",
  accessibility: ["source playback return", "text consequence preview", "status not conveyed by color alone"],
  qualification: "OPERATED_LOCAL",
});

const TRANSCRIPT_GOAL_MATERIALIZE_MANIFEST = transcriptWorkManifest(
  TRANSCRIPT_GOAL_MATERIALIZE_CAPABILITY_ID,
  "Create a canonical goal from reviewed transcript evidence",
  "Goal",
);

const TRANSCRIPT_TASK_MATERIALIZE_MANIFEST = transcriptWorkManifest(
  TRANSCRIPT_TASK_MATERIALIZE_CAPABILITY_ID,
  "Create a canonical task from reviewed transcript evidence",
  "ActionItem",
);

const transcriptEvidenceMergeManifest = (
  id: string,
  title: string,
  objectType: "Goal" | "ActionItem",
): GovernedActionCapabilityManifest => ({
  id,
  version: 1,
  title,
  promise: `Append one reviewed, playback-linked transcript span to an existing ${objectType === "Goal" ? "goal" : "task"} without changing its canonical work fields.`,
  objectTypes: ["CallRoom", "TranscriptJob", "TranscriptSegment", objectType, objectType === "Goal" ? "GoalProgressReceipt" : "ActionItemEvidenceReceipt"],
  scope: "SESSION",
  decisionPolicy: "USER_INITIATED",
  riskLevel: "MEDIUM",
  consequences: [
    `appends one immutable transcript-evidence receipt to one explicitly selected actor-owned ${objectType === "Goal" ? "goal" : "task"}`,
    "preserves exact target snapshots before and after the append",
    "does not change the target identity, wording, lifecycle, ownership, dates, relationships, tags, reminder, recurrence, project, or source truth",
    "does not mutate recording, transcript, calendar, delivery, provider, or publication state",
  ],
  evidence: [
    "current Session mutation authority",
    "released recording-backed transcript gate",
    "provider and effective-text hashes",
    "exact segment or thought-span identities and source clock",
    "explicitly selected target identity and expected current version",
    "immutable evidence-receipt identity and unchanged target readback",
  ],
  recovery: ["SUPERSEDE"],
  entryPoints: ["Nest Session transcript review", "Quipsly Capture transcript review"],
  apiExposure: "AUTHORIZED_API",
  mcpExposure: "PLANNED",
  accessibility: ["source playback return", "target state preview", "text consequence preview", "status not conveyed by color alone"],
  qualification: "OPERATED_LOCAL",
});

const TRANSCRIPT_GOAL_EVIDENCE_MERGE_MANIFEST = transcriptEvidenceMergeManifest(
  TRANSCRIPT_GOAL_EVIDENCE_MERGE_CAPABILITY_ID,
  "Add reviewed transcript evidence to an existing goal",
  "Goal",
);

const TRANSCRIPT_TASK_EVIDENCE_MERGE_MANIFEST = transcriptEvidenceMergeManifest(
  TRANSCRIPT_TASK_EVIDENCE_MERGE_CAPABILITY_ID,
  "Add reviewed transcript evidence to an existing task",
  "ActionItem",
);

const TRANSCRIPT_NOTE_MATERIALIZE_MANIFEST: GovernedActionCapabilityManifest = {
  id: TRANSCRIPT_NOTE_MATERIALIZE_CAPABILITY_ID,
  version: 1,
  title: "Create a canonical note from reviewed transcript evidence",
  promise: "Turn one reviewed, playback-linked transcript span into one actor-authored Session note with an explicit in-app audience and no delivery side effect.",
  objectTypes: ["CallRoom", "TranscriptJob", "TranscriptSegment", "CoachingNote", "CoachingNoteRevision"],
  scope: "SESSION",
  decisionPolicy: "USER_INITIATED",
  riskLevel: "MEDIUM",
  consequences: [
    "creates one canonical actor-authored note and its first immutable revision",
    "makes the note readable only through its explicitly reviewed AUTHOR_PRIVATE, SESSION_SHARED, CLIENT_SAFE, or PROJECT_TEAM audience",
    "CLIENT_SAFE marks eligibility for a separately reviewed follow-up; it does not send or deliver the note",
    "preserves the exact released transcript and playback source anchor",
    "does not mutate transcript, recording, task, goal, calendar, message, external delivery, or publication state",
  ],
  evidence: [
    "current Session mutation authority",
    "released recording-backed transcript gate",
    "provider and effective-text hashes",
    "exact segment or thought-span identities and source clock",
    "human-reviewed note wording, purpose, and audience",
    "canonical note and revision identities with immutable action receipt",
  ],
  recovery: ["SUPERSEDE", "COMPENSATE"],
  entryPoints: ["Nest Session transcript review", "Quipsly Capture transcript review"],
  apiExposure: "AUTHORIZED_API",
  mcpExposure: "PLANNED",
  accessibility: ["source playback return", "audience consequence preview", "status not conveyed by color alone"],
  qualification: "OPERATED_LOCAL",
};

const TRANSCRIPT_NOTE_MERGE_MANIFEST: GovernedActionCapabilityManifest = {
  id: TRANSCRIPT_NOTE_MERGE_CAPABILITY_ID,
  version: 1,
  title: "Merge reviewed transcript evidence into an existing note",
  promise: "Create one explicit revision of an actor-owned Session note from reviewed transcript evidence while retaining the complete prior content and audience.",
  objectTypes: ["CallRoom", "TranscriptJob", "TranscriptSegment", "CoachingNote", "CoachingNoteRevision"],
  scope: "SESSION",
  decisionPolicy: "USER_INITIATED",
  riskLevel: "HIGH",
  consequences: [
    "changes one explicitly selected actor-owned note's reviewed wording, purpose, or in-app audience",
    "retains exact before and after snapshots in an immutable revision and governed receipt",
    "may widen who can read the note in Quipsly when the reviewed audience changes",
    "CLIENT_SAFE marks eligibility for a separately reviewed follow-up; it does not send or deliver the note",
    "does not mutate transcript, recording, task, goal, calendar, message, external delivery, or publication state",
  ],
  evidence: [
    "current Session mutation authority",
    "released recording-backed transcript gate",
    "provider and effective-text hashes",
    "exact segment or thought-span identities and source clock",
    "explicitly selected note identity and expected current version",
    "exact reviewed before and after content, purpose, and audience",
    "immutable revision identity and changed-note readback",
  ],
  recovery: ["COMPENSATE", "SUPERSEDE"],
  entryPoints: ["Nest Session transcript review", "Quipsly Capture transcript review"],
  apiExposure: "AUTHORIZED_API",
  mcpExposure: "PLANNED",
  accessibility: ["source playback return", "before and after audience preview", "status not conveyed by color alone"],
  qualification: "OPERATED_LOCAL",
};

export const GOVERNED_ACTION_CAPABILITIES: readonly GovernedActionCapabilityManifest[] = [
  SESSION_PREFLIGHT_MANIFEST,
  TRANSCRIPT_GOAL_MATERIALIZE_MANIFEST,
  TRANSCRIPT_TASK_MATERIALIZE_MANIFEST,
  TRANSCRIPT_GOAL_EVIDENCE_MERGE_MANIFEST,
  TRANSCRIPT_TASK_EVIDENCE_MERGE_MANIFEST,
  TRANSCRIPT_NOTE_MATERIALIZE_MANIFEST,
  TRANSCRIPT_NOTE_MERGE_MANIFEST,
  ...Object.values(WRITING_CAPABILITIES),
];

const CAPABILITY_BY_ID = new Map(
  GOVERNED_ACTION_CAPABILITIES.map((manifest) => [manifest.id, manifest] as const),
);

export function getGovernedActionCapability(id: string) {
  return CAPABILITY_BY_ID.get(id) ?? null;
}

export function governedCapabilityForAssistantToolKind(kind: string) {
  return Object.prototype.hasOwnProperty.call(WRITING_CAPABILITIES, kind)
    ? WRITING_CAPABILITIES[kind as AssistantGovernedToolKind]
    : null;
}

export function assertGovernedActionPayload(
  capabilityId: string,
  payload: unknown,
): asserts payload is Record<string, unknown> {
  const manifest = getGovernedActionCapability(capabilityId);
  if (!manifest) throw new Error(`UNREGISTERED_CAPABILITY:${capabilityId}`);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`INVALID_ACTION_PAYLOAD:${capabilityId}`);
  }
  const record = payload as Record<string, unknown>;
  if (capabilityId === SESSION_PREFLIGHT_PUBLISH_CAPABILITY_ID) {
    if (
      typeof record.clientInstanceId !== "string"
      || !record.clientInstanceId.trim()
      || typeof record.microphoneLabel !== "string"
      || !record.microphoneLabel.trim()
      || typeof record.playbackDecision !== "string"
    ) {
      throw new Error(`INVALID_ACTION_PAYLOAD:${capabilityId}`);
    }
  }
  if (
    [TRANSCRIPT_GOAL_MATERIALIZE_CAPABILITY_ID, TRANSCRIPT_TASK_MATERIALIZE_CAPABILITY_ID].includes(capabilityId)
    && (
      typeof record.roomId !== "string"
      || !record.roomId.trim()
      || typeof record.segmentId !== "string"
      || !record.segmentId.trim()
      || typeof record.expectedProviderTextSha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(record.expectedProviderTextSha256)
      || typeof record.title !== "string"
      || !record.title.trim()
    )
  ) {
    throw new Error(`INVALID_ACTION_PAYLOAD:${capabilityId}`);
  }
  if (
    capabilityId === TRANSCRIPT_NOTE_MATERIALIZE_CAPABILITY_ID
    && (
      typeof record.roomId !== "string"
      || !record.roomId.trim()
      || typeof record.segmentId !== "string"
      || !record.segmentId.trim()
      || typeof record.expectedProviderTextSha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(record.expectedProviderTextSha256)
      || typeof record.noteId !== "string"
      || !record.noteId.trim()
      || typeof record.noteRevisionId !== "string"
      || !record.noteRevisionId.trim()
      || typeof record.contentSha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(record.contentSha256)
      || typeof record.visibility !== "string"
      || !record.visibility.trim()
    )
  ) {
    throw new Error(`INVALID_ACTION_PAYLOAD:${capabilityId}`);
  }
  if (
    capabilityId === TRANSCRIPT_NOTE_MERGE_CAPABILITY_ID
    && (
      typeof record.roomId !== "string"
      || !record.roomId.trim()
      || typeof record.segmentId !== "string"
      || !record.segmentId.trim()
      || typeof record.expectedProviderTextSha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(record.expectedProviderTextSha256)
      || typeof record.noteId !== "string"
      || !record.noteId.trim()
      || typeof record.expectedTargetUpdatedAt !== "string"
      || !record.expectedTargetUpdatedAt.trim()
      || typeof record.noteRevisionId !== "string"
      || !record.noteRevisionId.trim()
      || typeof record.previousContentSha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(record.previousContentSha256)
      || typeof record.nextContentSha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(record.nextContentSha256)
    )
  ) {
    throw new Error(`INVALID_ACTION_PAYLOAD:${capabilityId}`);
  }
  if (
    [TRANSCRIPT_GOAL_EVIDENCE_MERGE_CAPABILITY_ID, TRANSCRIPT_TASK_EVIDENCE_MERGE_CAPABILITY_ID].includes(capabilityId)
    && (
      typeof record.roomId !== "string"
      || !record.roomId.trim()
      || typeof record.segmentId !== "string"
      || !record.segmentId.trim()
      || typeof record.expectedProviderTextSha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(record.expectedProviderTextSha256)
      || typeof record.targetObjectId !== "string"
      || !record.targetObjectId.trim()
      || typeof record.expectedTargetUpdatedAt !== "string"
      || !record.expectedTargetUpdatedAt.trim()
      || typeof record.evidenceReceiptId !== "string"
      || !record.evidenceReceiptId.trim()
    )
  ) {
    throw new Error(`INVALID_ACTION_PAYLOAD:${capabilityId}`);
  }
  if (capabilityId === "quipsly.writing.draft.propose" && typeof record.draftText !== "string") {
    throw new Error(`INVALID_ACTION_PAYLOAD:${capabilityId}`);
  }
  if (
    ["quipsly.writing.rewrite.propose", "quipsly.writing.continuity-fix.propose"].includes(capabilityId)
    && (typeof record.blockId !== "string" || typeof record.originalText !== "string" || typeof record.rewriteText !== "string")
  ) {
    throw new Error(`INVALID_ACTION_PAYLOAD:${capabilityId}`);
  }
}
