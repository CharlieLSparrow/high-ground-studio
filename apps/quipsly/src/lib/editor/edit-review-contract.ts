import type { AiEditProposalSet } from "./ai-edit-proposal-contract";

export const EDIT_REVIEW_ACTIONS = [
  "PROOF_LISTENED",
  "PROOF_WATCHED",
  "APPLIED_TO_DRAFT",
  "DISMISSED",
  "RESTORED_TO_DRAFT",
] as const;

export type EditReviewAction = (typeof EDIT_REVIEW_ACTIONS)[number];
export type EditReviewScope = "REVIEW_ONLY" | "LOCAL_DRAFT" | "CANONICAL_TIMELINE";
export type EditReviewSubjectKind = "proposal" | "candidate" | "range" | "proposal-set" | "timeline";

export type EpisodeEditReviewReceipt = {
  id: string;
  proposalSetId: string | null;
  actorEmail: string;
  action: EditReviewAction | "PROPOSAL_CREATED" | "TIMELINE_SAVED";
  scope: EditReviewScope;
  subjectId: string | null;
  subjectKind: string | null;
  sourceRange: { startSeconds: number; endSeconds: number } | null;
  proposalTimelineFingerprintSha256: string;
  timelineFingerprintBeforeSha256: string;
  timelineFingerprintAfterSha256: string | null;
  transcriptSha256: string | null;
  sourceSha256: string | null;
  storageGeneration: string | null;
  signalProfileSha256: string | null;
  evidence: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
};

export type EpisodeEditProposalSetRecord = {
  proposalSet: AiEditProposalSet;
  payloadSha256: string;
  createdByEmail: string;
  createdAt: string;
};

export function editReviewScope(action: EditReviewAction): EditReviewScope {
  return action === "APPLIED_TO_DRAFT" || action === "RESTORED_TO_DRAFT"
    ? "LOCAL_DRAFT"
    : "REVIEW_ONLY";
}

export function isEditReviewAction(value: unknown): value is EditReviewAction {
  return typeof value === "string" && EDIT_REVIEW_ACTIONS.includes(value as EditReviewAction);
}
