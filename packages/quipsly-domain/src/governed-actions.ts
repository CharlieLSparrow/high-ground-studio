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

const writingManifest = (
  id: string,
  title: string,
  riskLevel: GovernedActionRiskLevel,
  consequences: readonly string[],
  recovery: readonly GovernedActionRecoveryKind[],
): GovernedActionCapabilityManifest => ({
  id,
  version: 1,
  title,
  promise: "Record an evidence-bound writing proposal without silently changing the source document.",
  objectTypes: ["StudioProject", "StudioDocument", "StudioDocumentBlock", "StudioAssistantAction"],
  scope: "DOCUMENT",
  decisionPolicy: "EXPLICIT_APPROVAL",
  riskLevel,
  consequences,
  evidence: [
    "authorized project and document scope",
    "canonical source block identities",
    "typed proposal payload hash",
    "append-only proposal and decision receipts",
    "changed-version readback when an approved proposal executes",
  ],
  recovery,
  entryPoints: ["writing desk assistant", "story bible review inbox"],
  apiExposure: "FIRST_PARTY",
  mcpExposure: "PLANNED",
  accessibility: ["keyboard-operable review", "text explanation", "status not conveyed by color alone"],
  qualification: "OPERATED_LOCAL",
});

const WRITING_CAPABILITIES = {
  "suggest-tags": writingManifest(
    "quipsly.writing.tags.suggest",
    "Suggest writing tags",
    "LOW",
    ["creates a review proposal only"],
    ["SUPERSEDE"],
  ),
  "find-related-blocks": writingManifest(
    "quipsly.writing.related-blocks.find",
    "Find related writing blocks",
    "LOW",
    ["creates a navigable result proposal only"],
    ["RETRY", "SUPERSEDE"],
  ),
  "find-examples": writingManifest(
    "quipsly.writing.examples.find",
    "Find source-grounded examples",
    "LOW",
    ["creates a review proposal only"],
    ["RETRY", "SUPERSEDE"],
  ),
  "search-quotes": writingManifest(
    "quipsly.writing.quotes.search",
    "Search source-grounded quotes",
    "LOW",
    ["creates a review proposal only"],
    ["RETRY", "SUPERSEDE"],
  ),
  "create-research-packet-note": writingManifest(
    "quipsly.writing.research-note.propose",
    "Propose a research packet note",
    "MEDIUM",
    ["may create a private draft after explicit approval"],
    ["UNDO", "SUPERSEDE"],
  ),
  "summarize-selected-block": writingManifest(
    "quipsly.writing.block-summary.propose",
    "Propose a selected-block summary",
    "LOW",
    ["creates a review proposal only"],
    ["SUPERSEDE"],
  ),
  "propose-output-plan": writingManifest(
    "quipsly.output.plan.propose",
    "Propose an output plan",
    "LOW",
    ["creates a capability/readiness plan; does not publish"],
    ["SUPERSEDE"],
  ),
  "PROPOSE_ENTITY": writingManifest(
    "quipsly.story-bible.entity.propose-create",
    "Propose a Story Bible entity",
    "MEDIUM",
    ["may create a source-anchored entity after explicit approval"],
    ["UNDO", "SUPERSEDE"],
  ),
  "PROPOSE_ENTITY_UPDATE": writingManifest(
    "quipsly.story-bible.entity.propose-update",
    "Propose a Story Bible entity update",
    "HIGH",
    ["may change a source-anchored entity after explicit approval"],
    ["UNDO", "SUPERSEDE"],
  ),
  "PROPOSE_DRAFT": writingManifest(
    "quipsly.writing.draft.propose",
    "Propose manuscript draft text",
    "HIGH",
    ["may insert a private manuscript block after explicit approval"],
    ["UNDO", "SUPERSEDE"],
  ),
  "PROPOSE_REWRITE": writingManifest(
    "quipsly.writing.rewrite.propose",
    "Propose an exact-block rewrite",
    "HIGH",
    ["may replace one exact source block after explicit approval and stale-source verification"],
    ["UNDO", "SUPERSEDE"],
  ),
  "CHECK_CONTINUITY": writingManifest(
    "quipsly.writing.continuity.check",
    "Check manuscript continuity",
    "LOW",
    ["creates a review finding only"],
    ["RETRY", "SUPERSEDE"],
  ),
  "PROPOSE_CONTINUITY_FIX": writingManifest(
    "quipsly.writing.continuity-fix.propose",
    "Propose a continuity repair",
    "HIGH",
    ["may replace one exact source block after explicit approval and stale-source verification"],
    ["UNDO", "SUPERSEDE"],
  ),
  "open-document": writingManifest(
    "quipsly.writing.document-open.propose",
    "Propose opening a related document",
    "LOW",
    ["creates a navigational proposal only"],
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

export const GOVERNED_ACTION_CAPABILITIES: readonly GovernedActionCapabilityManifest[] = [
  SESSION_PREFLIGHT_MANIFEST,
  TRANSCRIPT_GOAL_MATERIALIZE_MANIFEST,
  TRANSCRIPT_TASK_MATERIALIZE_MANIFEST,
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
