import type { BrowserSourceCaptureLedger } from "@high-ground/quipsly-domain";
import {
  browserSourceSafetyLabel,
  browserSourceUploadCanResumeAutomatically,
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
  it("automatically resumes complete local sources and transient held failures", () => {
    expect(browserSourceUploadCanResumeAutomatically(ledger("stopped"))).toBe(true);
    expect(browserSourceUploadCanResumeAutomatically(ledger("uploading"))).toBe(true);
    expect(browserSourceUploadCanResumeAutomatically(ledger("verifying"))).toBe(true);
    expect(browserSourceUploadCanResumeAutomatically(ledger("held", { failureReason: "Failed to fetch" }))).toBe(true);
  });

  it("does not loop on incomplete, verified, or non-transient failed sources", () => {
    expect(browserSourceUploadCanResumeAutomatically(ledger("recording", { stoppedAt: null, sha256: null }))).toBe(false);
    expect(browserSourceUploadCanResumeAutomatically(ledger("verified"))).toBe(false);
    expect(browserSourceUploadCanResumeAutomatically(ledger("failed", { failureReason: "Checksum mismatch" }))).toBe(false);
    expect(browserSourceUploadCanResumeAutomatically(ledger("held", { failureReason: "Upload allowance exceeded" }))).toBe(false);
  });

  it("selects the next unattempted source and provides calm safety labels", () => {
    const first = ledger("stopped", { captureId: "first" });
    const second = ledger("uploading", { captureId: "second" });
    expect(nextBrowserSourceUploadRecovery([first, second], new Set(["first"]))?.captureId).toBe("second");
    expect(browserSourceSafetyLabel(first)).toBe("Safe on this device");
    expect(browserSourceSafetyLabel(ledger("verified"))).toBe("Verified in Quipsly");
    expect(browserSourceSafetyLabel(ledger("recording"))).toBe("Interrupted · needs recovery");
  });

  it("resumes each eligible source once without looping on a repeated held row", async () => {
    const first = ledger("stopped", { captureId: "first" });
    const second = ledger("uploading", { captureId: "second" });
    const resumed: string[] = [];
    const result = await resumeBrowserSourceUploads({
      attemptedCaptureIds: new Set(),
      list: async () => [first, second],
      resume: async (candidate) => { resumed.push(candidate.captureId); },
    });
    expect(result).toEqual(["first", "second"]);
    expect(resumed).toEqual(["first", "second"]);
  });
});
