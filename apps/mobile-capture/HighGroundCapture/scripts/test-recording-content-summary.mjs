import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Compile the actual wire model in isolation; do not maintain a test-only copy.
const models = readFileSync(new URL("../HighGroundCapture/BridgeModels.swift", import.meta.url), "utf8");
const start = models.indexOf("struct MobileCaptureContentReadiness:");
const end = models.indexOf("struct MobileCaptureJourneySummary:", start);
assert(start >= 0 && end > start, "Cannot locate the production recording summary model");
const checks = String.raw`
func require(_ condition: @autoclosure () -> Bool, _ message: String) {
    guard condition() else { fatalError(message) }
}
func decode(_ json: String) throws -> MobileCaptureContentReadiness {
    try JSONDecoder().decode(MobileCaptureContentReadiness.self, from: Data(json.utf8))
}
let short = try decode(#"{"status":"uploaded","captureAssetCount":1,"verifiedCaptureCount":1,"uploadedRecordingCount":1,"knownDurationSeconds":5.32,"attentionRecordingCount":0,"pendingRecordingCount":0}"#)
require(short.hasUploadedRecordings, "A five-second uploaded recording must be usable")
require(short.evidenceLine.contains("5.3 sec"), "Keep the duration visible")
require(!short.evidenceLine.contains("proof") && !short.evidenceLine.contains("simulator"), "No QA classification in product copy")
require(short.uploadedRecordingCount == 1, "Decode the canonical uploaded count")
for status in ["none", "uploading", "attention"] {
    let summary = try decode("{\"status\":\"\(status)\"}")
    require(!summary.hasUploadedRecordings, "Do not invent uploaded recordings from another status")
}
let empty = try decode("{}")
require(!empty.hasUploadedRecordings, "Missing summary is not upload proof")
require(empty.evidenceLine.contains("duration unknown"), "Unknown duration must stay unknown")
print("PASS native recording summary decoding and display semantics")
`;
const result = spawnSync("xcrun", ["swift", "-"], {
  input: `import Foundation\n${models.slice(start, end)}\n${checks}`,
  encoding: "utf8",
  timeout: 120_000,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
assert.equal(result.status, 0, "Production Swift recording summary checks failed");
