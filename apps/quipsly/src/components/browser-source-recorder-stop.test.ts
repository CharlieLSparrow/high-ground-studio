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

  it("does not let background recovery replace the live recorder ledger", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/browser-source-recorder.tsx"),
      "utf8",
    );
    const persistStart = source.indexOf("const persistLedger = useCallback(");
    const updateStart = source.indexOf("const updateLedger = useCallback(", persistStart);
    const activateStart = source.indexOf("const activateLedger = useCallback(", updateStart);
    const closeGapStart = source.indexOf("const closeCallTransportGap", activateStart);
    const persist = source.slice(persistStart, updateStart);
    const update = source.slice(updateStart, activateStart);
    const activate = source.slice(activateStart, closeGapStart);

    expect(persist).not.toContain("ledgerRef.current = ledger");
    expect(update).toContain(
      "ledgerRef.current?.captureId === ledger.captureId",
    );
    expect(update).toContain("await persistLedger(ledger)");
    expect(activate).toContain("ledgerRef.current = ledger");
    expect(activate).toContain("await persistLedger(ledger)");
    expect(source).toContain("await activateLedger(ledger)");
    expect(source).toContain("activeCaptureOperationRef.current ||");
    expect(source).toContain("void resumeProtectedUploads()");
  });

  it("uploads protected bytes even when durable Session STOP delivery needs repair", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/browser-source-recorder.tsx"),
      "utf8",
    );
    const onStopStart = source.indexOf("recorder.onstop =");
    const onErrorStart = source.indexOf("recorder.onerror =", onStopStart);
    const onStop = source.slice(onStopStart, onErrorStart);

    expect(onStop).toContain("current = await repairStopReceipt(current)");
    expect(onStop).toContain(
      "current = await rememberStopReceiptFailure(current, error)",
    );
    expect(onStop).toContain("await uploadLedger(current)");
    expect(onStop).toContain(
      "Coordination delivery must not withhold protected media",
    );
    expect(onStop).not.toContain("It was not uploaded");
    expect(source).toContain("Retry Session status");
  });

  it("releases browser hardware before a durable writer close can fail", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/browser-source-recorder.tsx"),
      "utf8",
    );
    const onStopStart = source.indexOf("recorder.onstop =");
    const onErrorStart = source.indexOf("recorder.onerror =", onStopStart);
    const onStop = source.slice(onStopStart, onErrorStart);
    const releaseTracks = onStop.indexOf(
      "streamRef.current?.getTracks().forEach((track) => track.stop())",
    );
    const awaitWriterClose = onStop.indexOf("await durableWriter?.close()");

    expect(onStop).toContain(
      "const captureMeterPromise = stopRetainedSourceMeter(stoppedAt).catch(",
    );
    expect(releaseTracks).toBeGreaterThan(0);
    expect(awaitWriterClose).toBeGreaterThan(releaseTracks);
    expect(onStop).toContain("durableWriterRef.current = null");
    expect(onStop).toContain("const captureMeter = await captureMeterPromise");
  });

  it("does not claim verification before the canonical recording exists", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/browser-source-recorder.tsx"),
      "utf8",
    );

    expect(source).toContain(
      "const finalizationProjection = projectBrowserSourceFinalization(finalized)",
    );
    expect(source).toContain("state: finalizationProjection.state");
    expect(source).toContain(
      "serverRecordingAssetId: finalizationProjection.recordingAssetId",
    );
    expect(source).toContain("resumeProtectedUploads(true)");
    expect(source).toContain(
      "browserSourceStopReceiptNeedsRepair(ledger)",
    );
    expect(source).toContain('ledger.state === "verifying"');
    expect(source).not.toContain(
      'finalized.uploadStage === "verified" ||',
    );
  });
});
