import type { AudibleEventDetectorReceipt, AudibleEventDetectorSuggestion } from "./audible-event-analysis";

export type AudibleEventReviewDecision = "confirmed" | "false-positive" | "needs-comparison";

export type AudibleEventPlaybackEvidence = {
  protectedPlaybackSourceId: string;
  contextStartSeconds: number;
  contextEndSeconds: number;
  listenedSecondBins: number[];
  clientTrackedPlaybackIsNotProofOfAudibility: true;
};
export type PublicAudibleEventReview = {
  id: string;
  analysisId: string;
  eventId: string;
  decision: AudibleEventReviewDecision;
  actorEmail: string;
  note: string | null;
  occurredAt: string;
};

export type PublicAudibleEventReviewEntry = {
  suggestion: AudibleEventDetectorSuggestion;
  latestReview: PublicAudibleEventReview | null;
  reviewCounts: {
    confirmed: number;
    falsePositive: number;
    needsComparison: number;
  };
};

export type AudibleEventReviewStatus = {
  available: boolean;
  analysis: AudibleEventDetectorReceipt | null;
  entries: PublicAudibleEventReviewEntry[];
  summary: {
    suggestionCount: number;
    reviewedSuggestionCount: number;
    confirmedSuggestionCount: number;
    falsePositiveSuggestionCount: number;
    needsComparisonSuggestionCount: number;
    pendingSuggestionCount: number;
  };
  boundaries: {
    detectorOutputIsListeningTriageOnly: true;
    humanStateComesFromAppendOnlyReceipts: true;
    reviewDoesNotAuthorizeRepairOrEdit: true;
    sourceIdentityIsReverifiedServerSide: true;
    surfacedSuggestionsAloneCannotMeasureRecall: true;
  };
};
