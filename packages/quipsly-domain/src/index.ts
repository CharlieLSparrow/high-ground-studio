export type QuipslyId = string;

export type VerificationStatus =
  | "verified"
  | "attributed"
  | "variant"
  | "disputed"
  | "misattributed"
  | "needs-source"
  | "needs-review";

export type SourceType =
  | "book"
  | "speech"
  | "poem"
  | "letter"
  | "interview"
  | "article"
  | "essay"
  | "archive-item"
  | "web-page"
  | "film"
  | "episode"
  | "podcast"
  | "scripture"
  | "unknown";

export type PersonRole =
  | "author"
  | "speaker"
  | "translator"
  | "editor"
  | "character"
  | "actor"
  | "collector"
  | "source-contributor";

export type QuipslyState =
  | "idle"
  | "curious"
  | "found"
  | "thinking"
  | "saving"
  | "writing"
  | "nesting"
  | "celebrating"
  | "oops";

export type StreamMode =
  | "for-you"
  | "verified"
  | "by-theme"
  | "by-person"
  | "by-source"
  | "lorelist-builder"
  | "story-trail"
  | "newly-reviewed"
  | "curator-picks";

export type QuipStreamEventType =
  | "stream_session_started"
  | "quote_impression_shown"
  | "quote_impression_exited"
  | "next"
  | "previous"
  | "save"
  | "unsave"
  | "add_to_lorelist"
  | "remove_from_lorelist"
  | "open_quote_passport"
  | "open_person_page"
  | "open_source_page"
  | "expand_source_context"
  | "expand_variants_misquotes"
  | "copy_share"
  | "more_like_this"
  | "less_like_this"
  | "hide_theme_person_source"
  | "not_useful"
  | "too_cheesy"
  | "report_issue"
  | "merch_interest"
  | "story_interest";

export type QuipVisualCell =
  | "top-left"
  | "top-center"
  | "top-center-left"
  | "top-center-right"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-center-left"
  | "bottom-center-right"
  | "bottom-right";

export type QuipVisualGridColumns = 3 | 4;

export type QuipVisualGridRows = 2;

export type MerchEligibility = "safe" | "needs-rights-review" | "do-not-use";

export type MerchConceptStatus = "draft-ready" | "rights-review" | "blocked";

export type MerchProductType =
  | "desk-card"
  | "sticker"
  | "poster"
  | "notebook"
  | "pin"
  | "tote"
  | "mug"
  | "shirt"
  | "internal-review-card";

export type ApiEndpointMethod = "GET" | "POST";

export type ResearchQueueStatus =
  | "ready-for-review"
  | "needs-source"
  | "rights-review"
  | "variant-check"
  | "blocked";

export type ResearchPriority = "low" | "medium" | "high" | "urgent";

export type ResearchActionKind =
  | "locate-primary-source"
  | "verify-wording"
  | "review-rights"
  | "map-variant"
  | "check-misattribution"
  | "prepare-public-note"
  | "approve-merch-block";

export interface ThemeProjection {
  readonly id: QuipslyId;
  readonly slug: string;
  readonly label: string;
  readonly color?: string;
}

export interface PersonProjection {
  readonly id: QuipslyId;
  readonly slug: string;
  readonly name: string;
  readonly displayName: string;
  readonly dates?: string;
  readonly roles: readonly PersonRole[];
  readonly domains: readonly string[];
  readonly summary: string;
  readonly whyQuotable: string;
  readonly visualPrompt: string;
  readonly quipslyState: QuipslyState;
  readonly themeIds: readonly QuipslyId[];
  readonly relatedPersonIds: readonly QuipslyId[];
}

export interface SourceWorkProjection {
  readonly id: QuipslyId;
  readonly slug: string;
  readonly title: string;
  readonly type: SourceType;
  readonly year?: string;
  readonly creatorName?: string;
  readonly publicDomain?: boolean;
  readonly sourceNote: string;
}

export interface EvidenceProjection {
  readonly id: QuipslyId;
  readonly sourceWorkId: QuipslyId;
  readonly label: string;
  readonly locator?: string;
  readonly excerpt?: string;
  readonly evidenceNote: string;
}

export interface QuoteVariantProjection {
  readonly id: QuipslyId;
  readonly text: string;
  readonly status: VerificationStatus;
  readonly note: string;
}

export interface QuoteVisualProjection {
  readonly assetSrc: string;
  readonly alt: string;
  readonly spriteCell: QuipVisualCell;
  readonly spriteColumns?: QuipVisualGridColumns;
  readonly spriteRows?: QuipVisualGridRows;
  readonly mood: string;
  readonly caption: string;
}

export interface PageCompanionProjection {
  readonly id: QuipslyId;
  readonly assetSrc: string;
  readonly alt: string;
  readonly spriteCell: QuipVisualCell;
  readonly spriteColumns?: QuipVisualGridColumns;
  readonly spriteRows?: QuipVisualGridRows;
  readonly placement:
    | "bookmark"
    | "peek"
    | "stack"
    | "source-tag"
    | "nest"
    | "compass";
  readonly caption: string;
}

export interface QuipslyAssetCellProjection {
  readonly id: QuipslyId;
  readonly label: string;
  readonly spriteCell: QuipVisualCell;
  readonly alt: string;
  readonly mood: string;
  readonly intendedUse: string;
}

export interface QuipslyAssetSheetProjection {
  readonly id: QuipslyId;
  readonly title: string;
  readonly assetSrc: string;
  readonly spriteColumns: QuipVisualGridColumns;
  readonly spriteRows: QuipVisualGridRows;
  readonly usage: "quote-companion" | "page-companion" | "person-cosplay";
  readonly cells: readonly QuipslyAssetCellProjection[];
}

export interface QuoteProjection {
  readonly id: QuipslyId;
  readonly slug: string;
  readonly text: string;
  readonly shortText?: string;
  readonly personId: QuipslyId;
  readonly sourceWorkId: QuipslyId;
  readonly evidenceIds: readonly QuipslyId[];
  readonly verificationStatus: VerificationStatus;
  readonly confidence: number;
  readonly reviewNote: string;
  readonly contextNote: string;
  readonly quipslyNote: string;
  readonly themeIds: readonly QuipslyId[];
  readonly variantIds: readonly QuipslyId[];
  readonly relatedQuoteIds: readonly QuipslyId[];
  readonly merchEligibility: MerchEligibility;
  readonly storyHook: string;
  readonly visual?: QuoteVisualProjection;
}

export interface QuoteStoryBeatProjection {
  readonly id: QuipslyId;
  readonly title: string;
  readonly body: string;
  readonly evidenceIds: readonly QuipslyId[];
  readonly caution?: string;
}

export interface QuoteStoryProjection {
  readonly id: QuipslyId;
  readonly slug: string;
  readonly quoteId: QuipslyId;
  readonly title: string;
  readonly deck: string;
  readonly beats: readonly QuoteStoryBeatProjection[];
  readonly sourceCaution: string;
  readonly videoSeed: string;
  readonly recommendedRuntimeSeconds: number;
}

export interface MerchConceptProjection {
  readonly id: QuipslyId;
  readonly quoteId: QuipslyId;
  readonly title: string;
  readonly status: MerchConceptStatus;
  readonly statusNote: string;
  readonly productTypes: readonly MerchProductType[];
  readonly audience: string;
  readonly visualDirection: string;
  readonly sourceRequirement: string;
  readonly quipslyAngle: string;
}

export interface ApiEndpointExampleProjection {
  readonly label: string;
  readonly path: string;
  readonly description: string;
}

export interface ApiEndpointProjection {
  readonly id: QuipslyId;
  readonly method: ApiEndpointMethod;
  readonly path: string;
  readonly group:
    | "Quotes"
    | "Passports"
    | "People"
    | "QuipStream"
    | "Assets"
    | "Stories"
    | "Merch"
    | "Research"
    | "Spec";
  readonly title: string;
  readonly description: string;
  readonly gatewayUse: string;
  readonly example: ApiEndpointExampleProjection;
}

export interface ResearchActionProjection {
  readonly id: QuipslyId;
  readonly kind: ResearchActionKind;
  readonly title: string;
  readonly description: string;
}

export interface ResearchQueueItemProjection {
  readonly id: QuipslyId;
  readonly quote: QuipCardProjection;
  readonly status: ResearchQueueStatus;
  readonly priority: ResearchPriority;
  readonly confidenceGap: number;
  readonly assignedLane: string;
  readonly riskFlags: readonly string[];
  readonly nextActions: readonly ResearchActionProjection[];
}

export interface ResearchPacketProjection {
  readonly id: QuipslyId;
  readonly queueItem: ResearchQueueItemProjection;
  readonly passport: QuotePassportProjection;
  readonly story: QuoteStoryProjection;
  readonly merch: MerchConceptProjection;
  readonly sourceChecklist: readonly string[];
  readonly decisionLog: readonly string[];
  readonly databaseWritePlan: readonly string[];
}

export interface QuotePassportProjection {
  readonly quote: QuoteProjection;
  readonly person: PersonProjection;
  readonly sourceWork: SourceWorkProjection;
  readonly evidence: readonly EvidenceProjection[];
  readonly variants: readonly QuoteVariantProjection[];
  readonly themes: readonly ThemeProjection[];
  readonly relatedQuotes: readonly QuoteProjection[];
}

export interface QuipCardProjection {
  readonly quote: QuoteProjection;
  readonly person: PersonProjection;
  readonly sourceWork: SourceWorkProjection;
  readonly themes: readonly ThemeProjection[];
}

export interface LorelistItemProjection {
  readonly id: QuipslyId;
  readonly quoteId: QuipslyId;
  readonly curatorNote?: string;
}

export interface LorelistProjection {
  readonly id: QuipslyId;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly visibility: "public" | "private" | "unlisted";
  readonly coverThemeId: QuipslyId;
  readonly itemIds: readonly QuipslyId[];
  readonly curatorName: string;
  readonly arcLabel: string;
}

export interface NestProjection {
  readonly id: QuipslyId;
  readonly title: string;
  readonly description: string;
  readonly savedQuoteIds: readonly QuipslyId[];
  readonly activeLorelistId?: QuipslyId;
}

export interface QuipStreamCardProjection extends QuipCardProjection {
  readonly streamReason: string;
  readonly rank: number;
  readonly mode: StreamMode;
}

export interface QuipStreamSession {
  readonly id: QuipslyId;
  readonly mode: StreamMode;
  readonly startedAt: string;
  readonly entrySurface: string;
  readonly anonymous: boolean;
}

export interface QuipStreamEvent {
  readonly id: QuipslyId;
  readonly sessionId: QuipslyId;
  readonly type: QuipStreamEventType;
  readonly quoteId?: QuipslyId;
  readonly mode: StreamMode;
  readonly occurredAt: string;
  readonly dwellMs?: number;
  readonly metadata?: Record<string, string | number | boolean>;
}

export interface QuipStreamStats {
  readonly impressions: number;
  readonly saves: number;
  readonly lorelistAdds: number;
  readonly passportOpens: number;
  readonly positiveFeedback: number;
  readonly negativeFeedback: number;
}

export const verificationLabels: Record<VerificationStatus, string> = {
  verified: "Verified",
  attributed: "Attributed",
  variant: "Variant",
  disputed: "Disputed",
  misattributed: "Misattributed",
  "needs-source": "Needs source",
  "needs-review": "Needs review",
};

export const verificationTone: Record<VerificationStatus, "solid" | "watch" | "warning" | "danger"> = {
  verified: "solid",
  attributed: "solid",
  variant: "watch",
  disputed: "warning",
  misattributed: "danger",
  "needs-source": "warning",
  "needs-review": "watch",
};

export function createQuipStreamSession(input: {
  readonly mode: StreamMode;
  readonly entrySurface: string;
  readonly anonymous?: boolean;
  readonly now?: Date;
}): QuipStreamSession {
  const now = input.now ?? new Date();

  return {
    id: `qss_${now.getTime().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    mode: input.mode,
    startedAt: now.toISOString(),
    entrySurface: input.entrySurface,
    anonymous: input.anonymous ?? true,
  };
}

export function createQuipStreamEvent(input: {
  readonly sessionId: QuipslyId;
  readonly type: QuipStreamEventType;
  readonly mode: StreamMode;
  readonly quoteId?: QuipslyId;
  readonly dwellMs?: number;
  readonly metadata?: Record<string, string | number | boolean>;
  readonly now?: Date;
}): QuipStreamEvent {
  const now = input.now ?? new Date();

  return {
    id: `qse_${now.getTime().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    sessionId: input.sessionId,
    type: input.type,
    quoteId: input.quoteId,
    mode: input.mode,
    occurredAt: now.toISOString(),
    dwellMs: input.dwellMs,
    metadata: input.metadata,
  };
}

export function summarizeQuipStreamEvents(
  events: readonly QuipStreamEvent[],
): QuipStreamStats {
  return events.reduce<QuipStreamStats>(
    (stats, event) => {
      if (event.type === "quote_impression_shown") {
        return { ...stats, impressions: stats.impressions + 1 };
      }

      if (event.type === "save") {
        return { ...stats, saves: stats.saves + 1 };
      }

      if (event.type === "add_to_lorelist") {
        return { ...stats, lorelistAdds: stats.lorelistAdds + 1 };
      }

      if (event.type === "open_quote_passport") {
        return { ...stats, passportOpens: stats.passportOpens + 1 };
      }

      if (event.type === "more_like_this" || event.type === "story_interest") {
        return { ...stats, positiveFeedback: stats.positiveFeedback + 1 };
      }

      if (
        event.type === "less_like_this" ||
        event.type === "not_useful" ||
        event.type === "too_cheesy" ||
        event.type === "report_issue"
      ) {
        return { ...stats, negativeFeedback: stats.negativeFeedback + 1 };
      }

      return stats;
    },
    {
      impressions: 0,
      saves: 0,
      lorelistAdds: 0,
      passportOpens: 0,
      positiveFeedback: 0,
      negativeFeedback: 0,
    },
  );
}

export function isHighTrustStatus(status: VerificationStatus): boolean {
  return status === "verified" || status === "attributed";
}

export function formatSourceType(sourceType: SourceType): string {
  return sourceType
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
