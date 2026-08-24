import fs from "node:fs";
import path from "node:path";

describe("browser source stop confidence", () => {
  it("renders the latest source receipt in the primary flow instead of only in recovery details", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/browser-source-recorder.tsx"),
      "utf8",
    );

    expect(source).toContain(
      "browserSourcePostStopReceipt(status, activeLedger)",
    );
    expect(source).toContain('aria-label="Latest recording receipt"');
    expect(source).toContain('data-testid="latest-recording-receipt"');
    expect(source).toContain(
      "browserSourceReceiptExitStatus(latestRecordingReceipt, exitSafety)",
    );
    expect(source).toContain("latestRecordingExit?.label");
    expect(source).toContain("activeLedger.fileName");
    expect(source).toContain("formatBytes(activeLedger.sizeBytes)");
    expect(source).toContain(
      "browserSourceReviewHref(callRoomId, activeLedger)",
    );
    expect(source).toContain("Review recording");
  });
});
