import type { BrowserSourceCaptureLedger } from "@high-ground/quipsly-domain";

const AUTO_RESUMABLE_STATES = new Set(["stopped", "uploading", "verifying"]);
const TRANSIENT_FAILURE = /failed to fetch|network|offline|connection|transport|timed out|timeout|http 408|http 429|http 5\d\d|failed \((?:408|429|5\d\d)\)|verification needs a retry/i;

export function browserSourceUploadCanResumeAutomatically(
  ledger: BrowserSourceCaptureLedger,
) {
  const hasCompletedLocalSource = Boolean(
    ledger.sha256
      && ledger.stoppedAt
      && ledger.recordingConsentId
      && ledger.participantId
      && ledger.sizeBytes > 0,
  );
  if (!hasCompletedLocalSource) return false;
  if (AUTO_RESUMABLE_STATES.has(ledger.state)) return true;
  return ledger.state === "held" && TRANSIENT_FAILURE.test(ledger.failureReason || "");
}

export function nextBrowserSourceUploadRecovery(
  ledgers: readonly BrowserSourceCaptureLedger[],
  attemptedCaptureIds: ReadonlySet<string>,
) {
  return ledgers.find(
    (ledger) =>
      !attemptedCaptureIds.has(ledger.captureId)
      && browserSourceUploadCanResumeAutomatically(ledger),
  ) ?? null;
}

export async function resumeBrowserSourceUploads(input: {
  attemptedCaptureIds: Set<string>;
  list: () => Promise<BrowserSourceCaptureLedger[]>;
  resume: (ledger: BrowserSourceCaptureLedger) => Promise<void>;
}) {
  const resumedCaptureIds: string[] = [];
  let ledgers = await input.list();
  for (;;) {
    const next = nextBrowserSourceUploadRecovery(
      ledgers,
      input.attemptedCaptureIds,
    );
    if (!next) return resumedCaptureIds;
    input.attemptedCaptureIds.add(next.captureId);
    resumedCaptureIds.push(next.captureId);
    await input.resume(next);
    ledgers = await input.list();
  }
}

export function browserSourceSafetyLabel(ledger: BrowserSourceCaptureLedger) {
  if (ledger.state === "verified") return "Verified in Quipsly";
  if (ledger.state === "uploading" || ledger.state === "verifying") return "Uploading safely";
  if (ledger.state === "stopped" || ledger.state === "held") return "Safe on this device";
  if (ledger.state === "preparing" || ledger.state === "recording") return "Interrupted · needs recovery";
  return "Needs attention";
}

export function browserSourceManualUploadRetryAvailable(
  ledger: BrowserSourceCaptureLedger,
) {
  const complete = Boolean(ledger.sha256 && ledger.stoppedAt && ledger.sizeBytes > 0);
  if (!complete) return false;
  if (ledger.state === "stopped") return true;
  return ["held", "failed"].includes(ledger.state)
    && TRANSIENT_FAILURE.test(ledger.failureReason || "");
}

export function browserSourceRecoverySummary(
  ledgers: readonly BrowserSourceCaptureLedger[],
) {
  const verifiedCount = ledgers.filter((ledger) => ledger.state === "verified").length;
  const uploadingCount = ledgers.filter((ledger) =>
    browserSourceUploadCanResumeAutomatically(ledger),
  ).length;
  const safeCount = ledgers.filter((ledger) =>
    ledger.state === "held" && !(ledger.failureReason || "").trim(),
  ).length;
  const attentionCount = ledgers.filter((ledger) =>
    ["preparing", "recording", "failed"].includes(ledger.state)
      || (ledger.state === "held"
        && Boolean((ledger.failureReason || "").trim())
        && !TRANSIENT_FAILURE.test(ledger.failureReason || "")),
  ).length;
  const sourceWord = ledgers.length === 1 ? "recording" : "recordings";

  if (attentionCount > 0) {
    return {
      label: "Needs attention",
      detail: `${attentionCount} ${attentionCount === 1 ? "recording needs" : "recordings need"} attention. ${verifiedCount ? `${verifiedCount} verified ${verifiedCount === 1 ? "source remains" : "sources remain"} usable.` : attentionCount === 1 ? "Its local source remains listed below." : "Their local sources remain listed below."}`,
      shouldExpand: true,
      verifiedCount,
      uploadingCount,
      safeCount,
      attentionCount,
    };
  }
  if (uploadingCount > 0) {
    return {
      label: "Uploading safely",
      detail: `Quipsly resumes ${uploadingCount === 1 ? "this upload" : "these uploads"} automatically while this Session is open. ${verifiedCount ? `${verifiedCount} already ${verifiedCount === 1 ? "is" : "are"} verified.` : "The local originals remain available."}`,
      shouldExpand: false,
      verifiedCount,
      uploadingCount,
      safeCount,
      attentionCount,
    };
  }
  if (safeCount > 0) {
    return {
      label: "Safe on this device",
      detail: `${safeCount} ${safeCount === 1 ? "recording is" : "recordings are"} protected locally and can be retried without affecting verified sources.`,
      shouldExpand: false,
      verifiedCount,
      uploadingCount,
      safeCount,
      attentionCount,
    };
  }
  return {
    label: "Verified in Quipsly",
    detail: `${verifiedCount} ${sourceWord} ${verifiedCount === 1 ? "is" : "are"} verified and ready for transcription and editing.`,
    shouldExpand: false,
    verifiedCount,
    uploadingCount,
    safeCount,
    attentionCount,
  };
}
