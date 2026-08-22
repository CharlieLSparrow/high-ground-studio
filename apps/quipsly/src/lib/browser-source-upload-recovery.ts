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
