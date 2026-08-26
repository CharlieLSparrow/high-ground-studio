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
      "browserSourceNextReviewAction(callRoomId, activeLedger)",
    );
    expect(source).toContain("latestRecordingReviewAction.detail");
    expect(source).toContain("latestRecordingReviewAction.label");
  });

  it("keeps the safe-leave lock through a durable chunk write failure", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/browser-source-recorder.tsx"),
      "utf8",
    );
    const start = source.indexOf("recorder.ondataavailable =");
    const end = source.indexOf("recorder.onstop =", start);
    const handler = source.slice(start, end);

    expect(handler).toContain('setOperationalIssue({ kind: "encoder-stalled", detail })');
    expect(handler).toContain("Quipsly is stopping safely and preserving every committed local chunk.");
    expect(handler).toContain("onstop still owns writer close, hash, ledger, and recovery UI");
    expect(handler).not.toContain('setStatus("error")');
  });
});
