import type { BrowserSourceCaptureLedger } from "@high-ground/quipsly-domain";
import type { BrowserRetainedSourceStatus } from "@/lib/session-guardian";

const AUTO_RESUMABLE_STATES = new Set(["stopped", "uploading", "verifying"]);
const TRANSIENT_FAILURE =
  /failed to fetch|network|offline|connection|transport|timed out|timeout|http 408|http 429|http 5\d\d|failed \((?:408|429|5\d\d)\)|verification needs a retry/i;

const INTERRUPTED_STATES = new Set([
  "preparing",
  "recording",
  "held",
  "failed",
]);
type InterruptedBrowserSourceLedger = BrowserSourceCaptureLedger & {
  state: "preparing" | "recording" | "held" | "failed";
};

export function browserSourceUploadRetryDelayMs(input: {
  status: number | null;
  retryAfter: string | null;
  attempt: number;
  nowMs?: number;
}) {
  if (input.attempt >= 2) return null;
  const retryable =
    input.status == null ||
    input.status === 408 ||
    input.status === 425 ||
    input.status === 429 ||
    input.status >= 500;
  if (!retryable) return null;

  const retryAfter = input.retryAfter?.trim() ?? "";
  const retryAfterSeconds = Number(retryAfter);
  if (
    retryAfter &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds >= 0
  ) {
    return Math.max(250, Math.min(5_000, retryAfterSeconds * 1_000));
  }
  const retryAt = retryAfter ? Date.parse(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAt)) {
    return Math.max(
      250,
      Math.min(5_000, retryAt - (input.nowMs ?? Date.now())),
    );
  }
  return Math.min(5_000, 500 * 2 ** input.attempt);
}

export function browserSourceInterruptedRecoveryCandidate(
  ledger: BrowserSourceCaptureLedger,
  activeCaptureId?: string | null,
): ledger is InterruptedBrowserSourceLedger {
  if (ledger.captureId === activeCaptureId) return false;
  if (!INTERRUPTED_STATES.has(ledger.state)) return false;
  if (ledger.stoppedAt || ledger.sha256 || ledger.sizeBytes <= 0) return false;
  if (!ledger.recordingConsentId || !ledger.participantId) return false;
  if (!ledger.chunks.length) return false;
  let expectedOffset = 0;
  for (const chunk of ledger.chunks) {
    if (
      chunk.index < 0 ||
      chunk.byteOffset !== expectedOffset ||
      chunk.sizeBytes <= 0
    )
      return false;
    expectedOffset += chunk.sizeBytes;
  }
  return expectedOffset === ledger.sizeBytes;
}

function inferredMonotonicStop(ledger: BrowserSourceCaptureLedger) {
  const lastTimecode = ledger.chunks.reduce<number | null>((latest, chunk) => {
    if (
      chunk.recorderTimecodeMs == null ||
      !Number.isFinite(chunk.recorderTimecodeMs)
    )
      return latest;
    return latest == null
      ? chunk.recorderTimecodeMs
      : Math.max(latest, chunk.recorderTimecodeMs);
  }, null);
  if (lastTimecode == null) return null;
  try {
    return (
      BigInt(ledger.sourceProfile.monotonicStartedNanoseconds) +
      BigInt(Math.max(0, Math.round(lastTimecode * 1_000_000)))
    ).toString();
  } catch {
    return null;
  }
}

export function finalizeInterruptedBrowserSourceLedger(input: {
  ledger: BrowserSourceCaptureLedger;
  sha256: string;
  sizeBytes: number;
  recoveredAt: string;
}): BrowserSourceCaptureLedger {
  const { ledger } = input;
  if (!browserSourceInterruptedRecoveryCandidate(ledger)) {
    throw new Error(
      "This browser source is not a complete durable interruption candidate.",
    );
  }
  if (
    input.sizeBytes !== ledger.sizeBytes ||
    !/^[a-f0-9]{64}$/i.test(input.sha256)
  ) {
    throw new Error(
      "Recovered browser source bytes do not match the durable chunk ledger.",
    );
  }
  const lastDurableChunkAt = ledger.chunks.at(-1)!.receivedAt;
  const monotonicStoppedNanoseconds = inferredMonotonicStop(ledger);
  return {
    ...ledger,
    state: "stopped" as const,
    stoppedAt: lastDurableChunkAt,
    sha256: input.sha256.toLowerCase(),
    sourceProfile: {
      ...ledger.sourceProfile,
      monotonicStoppedNanoseconds,
      interruptionRecovery: {
        contractKind:
          "quipsly-browser-source-interruption-recovery-v1" as const,
        originalState: ledger.state,
        recoveredAt: input.recoveredAt,
        lastDurableChunkAt,
        stopBoundaryInferredFromLastDurableChunk: true as const,
        mediaTailMayBeIncomplete: true as const,
      },
    },
    failureReason: null,
    updatedAt: input.recoveredAt,
  } satisfies BrowserSourceCaptureLedger;
}

export function browserSourceUploadCanResumeAutomatically(
  ledger: BrowserSourceCaptureLedger,
) {
  const hasCompletedLocalSource = Boolean(
    ledger.sha256 &&
    ledger.stoppedAt &&
    ledger.recordingConsentId &&
    ledger.participantId &&
    ledger.sizeBytes > 0,
  );
  if (!hasCompletedLocalSource) return false;
  if (AUTO_RESUMABLE_STATES.has(ledger.state)) return true;
  return (
    ledger.state === "held" &&
    TRANSIENT_FAILURE.test(ledger.failureReason || "")
  );
}

export function nextBrowserSourceUploadRecovery(
  ledgers: readonly BrowserSourceCaptureLedger[],
  attemptedCaptureIds: ReadonlySet<string>,
) {
  return (
    ledgers.find(
      (ledger) =>
        !attemptedCaptureIds.has(ledger.captureId) &&
        browserSourceUploadCanResumeAutomatically(ledger),
    ) ?? null
  );
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
  if (ledger.state === "uploading" || ledger.state === "verifying")
    return "Uploading";
  if (ledger.state === "stopped" || ledger.state === "held")
    return "Saved on this device";
  if (ledger.state === "preparing" || ledger.state === "recording")
    return "Recording interrupted";
  return "Needs attention";
}

export type BrowserSourcePostStopReceipt = {
  tone: "working" | "ready" | "attention";
  title: string;
  detail: string;
  safeToClose: boolean;
};

export type BrowserSourceReceiptExitStatus = {
  canClosePage: boolean;
  label: "Safe to close" | "Keep open";
  detail: string | null;
};

export function browserSourcePostStopReceipt(
  status: BrowserRetainedSourceStatus,
  ledger: BrowserSourceCaptureLedger,
): BrowserSourcePostStopReceipt {
  if (status === "stopping") {
    return {
      tone: "working",
      title: "Saving recording",
      detail:
        "Quipsly is finishing the local file and its exact-byte checksum. Keep this page open.",
      safeToClose: false,
    };
  }
  if (ledger.state === "verified") {
    return {
      tone: "ready",
      title: "Saved and ready",
      detail:
        "Exact bytes are verified in Quipsly. This source is ready for the Session's permitted processing and editing.",
      safeToClose: true,
    };
  }
  if (
    status === "uploading" ||
    ["stopped", "uploading", "verifying"].includes(ledger.state)
  ) {
    return {
      tone: "working",
      title: "Saved on this device",
      detail:
        "Quipsly is uploading and verifying the exact bytes. Keep this page open; the local original remains available.",
      safeToClose: false,
    };
  }
  if (ledger.state === "held") {
    return {
      tone: ledger.failureReason ? "attention" : "working",
      title: "Saved on this device",
      detail: ledger.failureReason
        ? "The local original is protected, but upload needs attention. Retry or download it below."
        : "The local original is protected and waiting to upload. Keep this page open.",
      safeToClose: false,
    };
  }
  return {
    tone: "attention",
    title: "Recording needs attention",
    detail:
      "Quipsly has not verified a complete source. Keep this page open and use the recovery action below.",
    safeToClose: false,
  };
}

export function browserSourceReviewHref(
  roomId: string,
  ledger: BrowserSourceCaptureLedger,
) {
  const room = roomId.trim();
  const recordingAssetId = ledger.serverRecordingAssetId?.trim() ?? "";
  if (ledger.state !== "verified" || !room || !recordingAssetId) return null;
  const query = new URLSearchParams({
    mode: "recordings",
    source: recordingAssetId,
  });
  return `/sessions/${encodeURIComponent(room)}?${query.toString()}`;
}

export function browserSourceReceiptExitStatus(
  receipt: BrowserSourcePostStopReceipt,
  exitSafety: BrowserSourceExitSafety,
): BrowserSourceReceiptExitStatus {
  const canClosePage = receipt.safeToClose && exitSafety.canClosePage;
  return {
    canClosePage,
    label: canClosePage ? "Safe to close" : "Keep open",
    detail:
      receipt.safeToClose && !exitSafety.canClosePage
        ? "This recording is verified, but another saved recording still needs this page open."
        : null,
  };
}

export function browserSourceManualUploadRetryAvailable(
  ledger: BrowserSourceCaptureLedger,
) {
  const complete = Boolean(
    ledger.sha256 && ledger.stoppedAt && ledger.sizeBytes > 0,
  );
  if (!complete) return false;
  if (ledger.state === "stopped") return true;
  return (
    ["held", "failed"].includes(ledger.state) &&
    TRANSIENT_FAILURE.test(ledger.failureReason || "")
  );
}

export function browserSourceRecoverySummary(
  ledgers: readonly BrowserSourceCaptureLedger[],
) {
  const verifiedCount = ledgers.filter(
    (ledger) => ledger.state === "verified",
  ).length;
  const uploadingCount = ledgers.filter((ledger) =>
    browserSourceUploadCanResumeAutomatically(ledger),
  ).length;
  const safeCount = ledgers.filter(
    (ledger) => ledger.state === "held" && !(ledger.failureReason || "").trim(),
  ).length;
  const attentionCount = ledgers.filter(
    (ledger) =>
      ["preparing", "recording", "failed"].includes(ledger.state) ||
      (ledger.state === "held" &&
        Boolean((ledger.failureReason || "").trim()) &&
        !TRANSIENT_FAILURE.test(ledger.failureReason || "")),
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
      label: "Uploading",
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
      label: "Saved on this device",
      detail: `${safeCount} ${safeCount === 1 ? "recording is" : "recordings are"} protected locally but not yet verified in Quipsly. Upload can be retried without affecting verified sources.`,
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

export type BrowserSourceExitSafety = {
  state: "idle" | "recording" | "keep-open" | "safe" | "attention";
  label: string;
  detail: string;
  canClosePage: boolean;
};

export function browserSourceExitSafety(
  status: BrowserRetainedSourceStatus,
  ledgers: readonly BrowserSourceCaptureLedger[],
): BrowserSourceExitSafety {
  if (["starting", "recording", "stopping"].includes(status)) {
    return {
      state: "recording",
      label:
        status === "stopping" ? "Saving recording" : "Recording in progress",
      detail:
        "Do not close this page while Quipsly is finishing the local recording.",
      canClosePage: false,
    };
  }
  if (!ledgers.length) {
    return status === "uploading" || status === "held" || status === "error"
      ? {
          state: "attention",
          label: "Recording needs attention",
          detail:
            "Quipsly cannot confirm a recoverable local recording yet. Keep this page open and use the visible recovery message.",
          canClosePage: false,
        }
      : {
          state: "idle",
          label: "Call ended",
          detail: "No local recording is waiting to upload from this browser.",
          canClosePage: true,
        };
  }
  const summary = browserSourceRecoverySummary(ledgers);
  if (status === "uploading" || summary.uploadingCount > 0) {
    return {
      state: "keep-open",
      label: "Keep Quipsly open",
      detail:
        "Your recording is protected on this device and is still uploading. You may leave the call, but wait for Safe to close before closing this page.",
      canClosePage: false,
    };
  }
  if (summary.attentionCount > 0 || status === "error") {
    return {
      state: "attention",
      label: "Recording needs attention",
      detail: `${summary.detail} Keep this page open while you retry or download the protected local source.`,
      canClosePage: false,
    };
  }
  if (summary.safeCount > 0 || status === "held") {
    return {
      state: "keep-open",
      label: "Keep Quipsly open",
      detail:
        "Your recording is saved on this device but is not verified in Quipsly yet. Retry the upload below; the local source remains available.",
      canClosePage: false,
    };
  }
  if (summary.verifiedCount === ledgers.length) {
    return {
      state: "safe",
      label: "Safe to close",
      detail: `${summary.verifiedCount} ${summary.verifiedCount === 1 ? "recording is" : "recordings are"} verified in Quipsly. You can close this page.`,
      canClosePage: true,
    };
  }
  return {
    state: "attention",
    label: "Recording status unavailable",
    detail:
      "Keep this page open until Quipsly can confirm the recording state.",
    canClosePage: false,
  };
}
