import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("native session work decodes canonical tags and searches people, text and ownership together", { skip: process.platform !== "darwin" }, t => {
  const directory = mkdtempSync(path.join(tmpdir(), "quipsly-session-work-search-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const base = new URL("../apps/mobile-capture/HighGroundCapture/HighGroundCapture/", import.meta.url);
  const work = readFileSync(new URL("MobileSessionWork.swift", base), "utf8");
  const models = readFileSync(new URL("BridgeModels.swift", base), "utf8");
  // Compile the production decoding and search behavior without network/UI dependencies.
  const entry = work.slice(work.indexOf("struct MobileSessionWorkEntry:"), work.indexOf("    func task(")) + "}\n";
  const tag = models.slice(models.indexOf("struct MobileCaptureTag:"), models.indexOf("struct MobileCaptureProjectDestination:"));
  assert.ok(entry.includes("func matches("));
  const source = String.raw`
import Foundation
struct CaptureTranscriptWorkLink { init?(href: String) { return nil } }
${tag}
${entry}
var payload: [String: Any] = [
    "id": "task", "kind": "TASK", "title": "Practice reflective listening",
    "body": "Use the next coaching conversation", "status": "OPEN",
    "updatedAt": "2026-09-13T12:00:00Z", "canEdit": true,
    "ownerLabel": "Casey Park", "ownedByCurrentActor": true,
    "tags": [["id": "reflection", "slug": "reflection", "label": "Reflection", "hexColor": "#506b46"]]
]
func decode() throws -> MobileSessionWorkEntry {
    try JSONDecoder().decode(MobileSessionWorkEntry.self, from: JSONSerialization.data(withJSONObject: payload))
}
let task = try decode()
assert(task.tags?.first?.hexColor == "#506b46")
assert(task.matches(query: "  CASEY reflection  ", kind: "TASK", assignedToMe: true))
assert(task.matches(query: "conversation practice", kind: "ALL", assignedToMe: false))
assert(!task.matches(query: "Casey missing", kind: "ALL", assignedToMe: false))
assert(!task.matches(query: "", kind: "GOAL", assignedToMe: false))
payload["status"] = "DONE"
payload["ownedByCurrentActor"] = false
let completed = try decode()
assert(completed.completed && completed.matches(query: "reflection", kind: "ALL", assignedToMe: false))
assert(!completed.matches(query: "", kind: "ALL", assignedToMe: true))
payload.removeValue(forKey: "tags")
payload.removeValue(forKey: "ownedByCurrentActor")
payload.removeValue(forKey: "ownerLabel")
let unassigned = try decode()
assert(unassigned.tags == nil && unassigned.matches(query: "  ", kind: "ALL", assignedToMe: false))
assert(!unassigned.matches(query: "", kind: "ALL", assignedToMe: true))
print("Canonical session work search passed")
`;
  const file = path.join(directory, "main.swift");
  writeFileSync(file, source);
  const result = spawnSync("swift", [file], { encoding: "utf8", timeout: 60000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /Canonical session work search passed/);
});
