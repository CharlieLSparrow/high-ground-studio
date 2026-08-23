import type { BrowserSourceCaptureLedger } from "@high-ground/quipsly-domain";
import {
  browserSourceInterruptedRecoveryCandidate,
  browserSourceSafetyLabel,
  browserSourceManualUploadRetryAvailable,
  browserSourceRecoverySummary,
  browserSourceUploadCanResumeAutomatically,
  browserSourceUploadRetryDelayMs,
  finalizeInterruptedBrowserSourceLedger,
  nextBrowserSourceUploadRecovery,
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
    sizeBytes: 4_096,
    failureReason: null,
    ...overrides,
  } as BrowserSourceCaptureLedger;
}

describe("browser source upload recovery", () => {
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

  it("does not loop on incomplete, verified, or non-transient failed sources", () => {
    expect(
      browserSourceUploadCanResumeAutomatically(
        ledger("recording", { stoppedAt: null, sha256: null }),
      ),
    ).toBe(false);
    expect(browserSourceUploadCanResumeAutomatically(ledger("verified"))).toBe(
      false,
    );
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

  it("offers manual retry only for complete sources that are not already uploading", () => {
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
      false,
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
});
