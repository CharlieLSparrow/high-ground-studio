import type { BrowserSourceCaptureLedger } from "@high-ground/quipsly-domain";
import {
  browserSourceInterruptedRecoveryCandidate,
  browserSourcePostStopReceipt,
  browserSourceNextReviewAction,
  browserSourceReviewHref,
  browserSourceReceiptExitStatus,
  browserSourceSafetyLabel,
  browserSourceStopReceiptNeedsRepair,
  browserSourceExitSafety,
  browserSourceManualUploadRetryAvailable,
  browserSourceRecoverySummary,
  browserSourceUploadCanResumeAutomatically,
  browserSourceUploadRetryDelayMs,
  finalizeInterruptedBrowserSourceLedger,
  nextBrowserSourceUploadRecovery,
  projectBrowserSourceFinalization,
  resumeBrowserSourceUploads,
} from "./browser-source-upload-recovery";

function ledger(
  state: BrowserSourceCaptureLedger["state"],
  overrides: Partial<BrowserSourceCaptureLedger> = {},
) {
  return {
    captureId: `capture-${state}`,
    state,
    sha256: "a".repeat(64),
    stoppedAt: "2026-08-22T12:00:00.000Z",
    recordingConsentId: "consent-1",
    participantId: "participant-1",
    serverRecordingAssetId: state === "verified" ? "asset-default" : null,
    sizeBytes: 4_096,
    failureReason: null,
    ...overrides,
  } as BrowserSourceCaptureLedger;
}

describe("browser source upload recovery", () => {
  it("requires a canonical recording identity before verified media can drain", () => {
    expect(projectBrowserSourceFinalization({
      uploadStage: "verified",
      verification: { status: "verified" },
      finalization: { recordingAssetId: "asset-1", transcriptJobId: "job-1" },
    })).toEqual({
      state: "verified",
      recordingAssetId: "asset-1",
      transcriptJobId: "job-1",
      failureReason: null,
    });
    expect(projectBrowserSourceFinalization({
      uploadStage: "verified",
      verification: { status: "verified" },
      finalization: null,
    })).toMatchObject({
      state: "verifying",
      recordingAssetId: null,
      failureReason: expect.stringContaining("canonical recording identity"),
    });
    expect(projectBrowserSourceFinalization({
      uploadStage: "verifying",
      finalization: { recordingAssetId: "asset-early" },
    })).toMatchObject({
      state: "verifying",
      recordingAssetId: "asset-early",
      failureReason: null,
    });
  });

  it("retries transient reservation failures without retrying user or binding errors", () => {
    expect(
      browserSourceUploadRetryDelayMs({
        status: 503,
        retryAfter: null,
        attempt: 0,
      }),
    ).toBe(500);
    expect(
      browserSourceUploadRetryDelayMs({
        status: 429,
        retryAfter: "2",
        attempt: 1,
      }),
    ).toBe(2_000);
    expect(
      browserSourceUploadRetryDelayMs({
        status: null,
        retryAfter: null,
        attempt: 1,
      }),
    ).toBe(1_000);
    expect(
      browserSourceUploadRetryDelayMs({
        status: 409,
        retryAfter: null,
        attempt: 0,
      }),
    ).toBeNull();
    expect(
      browserSourceUploadRetryDelayMs({
        status: 503,
        retryAfter: null,
        attempt: 2,
      }),
    ).toBeNull();
  });

  it("automatically resumes complete local sources and transient held failures", () => {
    expect(browserSourceUploadCanResumeAutomatically(ledger("stopped"))).toBe(
      true,
    );
    expect(browserSourceUploadCanResumeAutomatically(ledger("uploading"))).toBe(
      true,
    );
    expect(browserSourceUploadCanResumeAutomatically(ledger("verifying"))).toBe(
      true,
    );
    expect(
      browserSourceUploadCanResumeAutomatically(
        ledger("held", { failureReason: "Failed to fetch" }),
      ),
    ).toBe(true);
  });

  it("retains a durable repair obligation when media stops before its room receipt arrives", () => {
    const pending = ledger("verified", {
      stopReceiptId: "stop-receipt-1",
      stopReceiptPersisted: false,
      serverRecordingAssetId: "asset-1",
    });
    expect(browserSourceStopReceiptNeedsRepair(pending)).toBe(true);
    expect(browserSourceStopReceiptNeedsRepair({
      ...pending,
      stoppedAt: null,
      sha256: null,
    })).toBe(false);
    expect(browserSourceSafetyLabel(pending)).toBe(
      "Verified · Session status syncing",
    );
    expect(browserSourceManualUploadRetryAvailable(pending)).toBe(true);
    expect(browserSourcePostStopReceipt("ready", pending)).toMatchObject({
      tone: "attention",
      title: "Recording saved · Session status syncing",
      safeToClose: true,
    });
    expect(browserSourceManualUploadRetryAvailable(ledger("verifying"))).toBe(
      true,
    );
  });

  it("does not loop on incomplete, verified, or non-transient failed sources", () => {
    expect(
      browserSourceUploadCanResumeAutomatically(
        ledger("recording", { stoppedAt: null, sha256: null }),
      ),
    ).toBe(false);
    expect(browserSourceUploadCanResumeAutomatically(
      ledger("verified", { serverRecordingAssetId: "asset-1" }),
    )).toBe(false);
    expect(browserSourceUploadCanResumeAutomatically(
      ledger("verified", { serverRecordingAssetId: null }),
    )).toBe(true);
    expect(
      browserSourceUploadCanResumeAutomatically(
        ledger("failed", { failureReason: "Checksum mismatch" }),
      ),
    ).toBe(false);
    expect(
      browserSourceUploadCanResumeAutomatically(
        ledger("held", { failureReason: "Upload allowance exceeded" }),
      ),
    ).toBe(false);
  });

  it("recovers only contiguous acknowledged chunks after an abrupt recorder loss", () => {
    const interrupted = ledger("recording", {
      captureId: "interrupted",
      stoppedAt: null,
      sha256: null,
      sizeBytes: 12,
      chunks: [
        {
          index: 0,
          byteOffset: 0,
          sizeBytes: 5,
          recorderTimecodeMs: 2_000,
          receivedAt: "2026-08-22T12:00:02.000Z",
        },
        {
          index: 1,
          byteOffset: 5,
          sizeBytes: 7,
          recorderTimecodeMs: 4_000,
          receivedAt: "2026-08-22T12:00:04.000Z",
        },
      ],
      sourceProfile: {
        monotonicStartedNanoseconds: "1000000000",
      } as unknown as BrowserSourceCaptureLedger["sourceProfile"],
    });
    expect(browserSourceInterruptedRecoveryCandidate(interrupted)).toBe(true);
    expect(
      browserSourceInterruptedRecoveryCandidate(interrupted, "interrupted"),
    ).toBe(false);
    expect(
      browserSourceInterruptedRecoveryCandidate({
        ...interrupted,
        chunks: [{ ...interrupted.chunks[0], byteOffset: 1 }],
      }),
    ).toBe(false);

    const recovered = finalizeInterruptedBrowserSourceLedger({
      ledger: interrupted,
      sha256: "b".repeat(64),
      sizeBytes: 12,
      recoveredAt: "2026-08-22T12:01:00.000Z",
    });
    expect(recovered).toMatchObject({
      state: "stopped",
      stoppedAt: "2026-08-22T12:00:04.000Z",
      sha256: "b".repeat(64),
      sourceProfile: {
        monotonicStoppedNanoseconds: "5000000000",
        interruptionRecovery: {
          originalState: "recording",
          mediaTailMayBeIncomplete: true,
          stopBoundaryInferredFromLastDurableChunk: true,
        },
      },
    });
  });

  it("selects the next unattempted source and provides calm safety labels", () => {
    const first = ledger("stopped", { captureId: "first" });
    const second = ledger("uploading", { captureId: "second" });
    expect(
      nextBrowserSourceUploadRecovery([first, second], new Set(["first"]))
        ?.captureId,
    ).toBe("second");
    expect(browserSourceSafetyLabel(first)).toBe("Saved on this device");
    expect(browserSourceSafetyLabel(ledger("verified"))).toBe(
      "Verified in Quipsly",
    );
    expect(browserSourceSafetyLabel(ledger("recording"))).toBe(
      "Recording interrupted",
    );
  });

  it("gives the latest stopped source one visible, honest confidence receipt", () => {
    expect(
      browserSourcePostStopReceipt("stopping", ledger("recording")),
    ).toEqual({
      tone: "working",
      title: "Saving recording",
      detail: expect.stringContaining("exact-byte checksum"),
      safeToClose: false,
    });
    expect(
      browserSourcePostStopReceipt("uploading", ledger("uploading")),
    ).toEqual({
      tone: "working",
      title: "Saved on this device",
      detail: expect.stringContaining("local original remains available"),
      safeToClose: false,
    });
    expect(browserSourcePostStopReceipt("ready", ledger("verified"))).toEqual({
      tone: "ready",
      title: "Saved and ready",
      detail: expect.stringContaining("permitted processing and editing"),
      safeToClose: true,
    });
    expect(
      browserSourcePostStopReceipt(
        "held",
        ledger("held", { failureReason: "Upload allowance exceeded" }),
      ),
    ).toMatchObject({
      tone: "attention",
      title: "Saved on this device",
      safeToClose: false,
    });
  });

  it("opens only an exact verified recording in the in-app Session workspace", () => {
    expect(
      browserSourceReviewHref(
        "room / coaching",
        ledger("verified", { serverRecordingAssetId: "asset / exact" }),
      ),
    ).toBe(
      "/sessions/room%20%2F%20coaching?mode=recordings&source=asset+%2F+exact",
    );
    expect(
      browserSourceReviewHref(
        "room-1",
        ledger("uploading", { serverRecordingAssetId: "asset-1" }),
      ),
    ).toBeNull();
    expect(browserSourceReviewHref(
      "room-1",
      ledger("verified", { serverRecordingAssetId: null }),
    )).toBeNull();
  });

  it("makes automatic transcription the next action without hiding recording review", () => {
    expect(
      browserSourceNextReviewAction(
        "room / coaching",
        ledger("verified", {
          serverRecordingAssetId: "asset / exact",
          serverTranscriptJobId: "transcript-1",
        }),
      ),
    ).toEqual({
      label: "Review transcript",
      href: "/sessions/room%20%2F%20coaching?mode=transcript&source=asset+%2F+exact",
      detail: "The timed transcript is being prepared automatically.",
    });
    expect(
      browserSourceNextReviewAction(
        "room-1",
        ledger("verified", { serverRecordingAssetId: "asset-1" }),
      ),
    ).toMatchObject({
      label: "Review recording",
      href: "/sessions/room-1?mode=recordings&source=asset-1",
    });
    expect(
      browserSourceNextReviewAction(
        "room-1",
        ledger("uploading", {
          serverRecordingAssetId: "asset-1",
          serverTranscriptJobId: "transcript-1",
        }),
      ),
    ).toBeNull();
  });

  it("never calls the page safe while another local recording still needs it", () => {
    const receipt = browserSourcePostStopReceipt("ready", ledger("verified"));
    expect(
      browserSourceReceiptExitStatus(
        receipt,
        browserSourceExitSafety("ready", [ledger("verified")]),
      ),
    ).toEqual({
      canClosePage: true,
      label: "Safe to close",
      detail: null,
    });
    expect(
      browserSourceReceiptExitStatus(
        receipt,
        browserSourceExitSafety("ready", [
          ledger("verified", { captureId: "latest" }),
          ledger("uploading", { captureId: "older-upload" }),
        ]),
      ),
    ).toEqual({
      canClosePage: false,
      label: "Keep open",
      detail:
        "This recording is verified, but another saved recording still needs this page open.",
    });
  });

  it("resumes each eligible source once without looping on a repeated held row", async () => {
    const first = ledger("stopped", { captureId: "first" });
    const second = ledger("uploading", { captureId: "second" });
    const resumed: string[] = [];
    const result = await resumeBrowserSourceUploads({
      attemptedCaptureIds: new Set(),
      list: async () => [first, second],
      resume: async (candidate) => {
        resumed.push(candidate.captureId);
      },
    });
    expect(result).toEqual(["first", "second"]);
    expect(resumed).toEqual(["first", "second"]);
  });

  it("offers manual retry for complete sources and pending verification", () => {
    expect(browserSourceManualUploadRetryAvailable(ledger("stopped"))).toBe(
      true,
    );
    expect(
      browserSourceManualUploadRetryAvailable(
        ledger("held", { failureReason: "Failed to fetch" }),
      ),
    ).toBe(true);
    expect(
      browserSourceManualUploadRetryAvailable(
        ledger("failed", { failureReason: "HTTP 503" }),
      ),
    ).toBe(true);
    expect(
      browserSourceManualUploadRetryAvailable(
        ledger("held", { failureReason: "Upload allowance exceeded" }),
      ),
    ).toBe(false);
    expect(
      browserSourceManualUploadRetryAvailable(
        ledger("failed", { failureReason: "Checksum mismatch" }),
      ),
    ).toBe(false);
    expect(browserSourceManualUploadRetryAvailable(ledger("uploading"))).toBe(
      false,
    );
    expect(browserSourceManualUploadRetryAvailable(ledger("verifying"))).toBe(
      true,
    );
    expect(
      browserSourceManualUploadRetryAvailable(
        ledger("recording", { stoppedAt: null, sha256: null }),
      ),
    ).toBe(false);
  });

  it("summarizes independent source progress without blocking healthy recordings", () => {
    expect(
      browserSourceRecoverySummary([
        ledger("verified", { captureId: "verified" }),
        ledger("uploading", { captureId: "uploading" }),
      ]),
    ).toMatchObject({
      label: "Uploading",
      verifiedCount: 1,
      uploadingCount: 1,
      shouldExpand: false,
    });

    expect(
      browserSourceRecoverySummary([
        ledger("verified", { captureId: "verified" }),
        ledger("failed", { captureId: "failed" }),
      ]),
    ).toMatchObject({
      label: "Needs attention",
      detail: expect.stringContaining("1 verified source remains usable"),
      attentionCount: 1,
      shouldExpand: true,
    });

    expect(
      browserSourceRecoverySummary([
        ledger("held", {
          captureId: "policy-held",
          failureReason: "Upload allowance exceeded",
        }),
      ]),
    ).toMatchObject({
      label: "Needs attention",
      attentionCount: 1,
      shouldExpand: true,
    });

    expect(
      browserSourceRecoverySummary([
        ledger("held", { captureId: "local-only", failureReason: null }),
      ]),
    ).toMatchObject({
      label: "Saved on this device",
      detail: expect.stringContaining("not yet verified in Quipsly"),
      safeCount: 1,
    });
  });

  it("gives one conservative page-exit answer from the local recovery ledger", () => {
    expect(browserSourceExitSafety("recording", [])).toMatchObject({
      state: "recording",
      canClosePage: false,
    });
    expect(
      browserSourceExitSafety("uploading", [ledger("uploading")]),
    ).toMatchObject({
      state: "keep-open",
      label: "Keep Quipsly open",
      canClosePage: false,
    });
    expect(
      browserSourceExitSafety("held", [
        ledger("held", { failureReason: null }),
      ]),
    ).toMatchObject({
      state: "keep-open",
      canClosePage: false,
    });
    expect(
      browserSourceExitSafety("error", [
        ledger("failed", { failureReason: "Upload allowance exceeded" }),
      ]),
    ).toMatchObject({
      state: "attention",
      canClosePage: false,
    });
    expect(
      browserSourceExitSafety("ready", [ledger("verified")]),
    ).toMatchObject({
      state: "safe",
      label: "Safe to close",
      canClosePage: true,
    });
    expect(browserSourceExitSafety("ready", [])).toMatchObject({
      state: "idle",
      canClosePage: true,
    });
  });
});
