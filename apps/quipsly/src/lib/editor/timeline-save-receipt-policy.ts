export type TimelineSaveDisposition =
  | "WRITE_TIMELINE"
  | "LINK_REVIEWED_DRAFT"
  | "NO_OP";

/**
 * A canonical save receipt needs either new timeline bytes or an explicit link
 * from already-reviewed local draft actions to the unchanged canonical bytes.
 * Hydration, normalization, opening a route, and redundant Save clicks are not
 * editorial history.
 */
export function timelineSaveDisposition(input: {
  currentFingerprint: string;
  incomingFingerprint: string;
  linkedReviewReceiptIds: string[];
}): TimelineSaveDisposition {
  if (!input.currentFingerprint || input.currentFingerprint !== input.incomingFingerprint) {
    return "WRITE_TIMELINE";
  }
  return input.linkedReviewReceiptIds.length > 0
    ? "LINK_REVIEWED_DRAFT"
    : "NO_OP";
}
