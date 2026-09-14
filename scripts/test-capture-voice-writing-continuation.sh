#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_directory="$(mktemp -d -t quipsly-writing-continuation)"
cleanup() {
  rm -f "$temporary_directory/VoiceWritingDraftStore.swift" "$temporary_directory/RecordingIdentity.swift" "$temporary_directory/WritingEditorActions.swift" "$temporary_directory/continuation-harness"
  rmdir "$temporary_directory"
}
trap cleanup EXIT

# Extract the actual store before its HTTP adapter, and the real recording
# identity accessor. No duplicate implementation of continuation matching.
node - "$repo_root" "$temporary_directory" <<'NODE'
const {readFileSync, writeFileSync} = require('node:fs');
const [root, output] = process.argv.slice(2);
const base = `${root}/apps/mobile-capture/HighGroundCapture/HighGroundCapture`;
const source = readFileSync(`${base}/VoiceWritingDraftStore.swift`, 'utf8');
const boundary = '\nprivate struct VoiceWritingSyncRequest: Encodable {';
if (source.split(boundary).length !== 2) throw new Error('Draft store boundary changed');
writeFileSync(`${output}/VoiceWritingDraftStore.swift`, source.split(boundary)[0]);
const recording = readFileSync(`${base}/LocalRecordingLibrary.swift`, 'utf8');
const start = recording.indexOf('    var voiceWritingCallRoomId: String? {');
const end = recording.indexOf('\n    var needsPersonalVoiceNoteMaterialization:', start);
if (start < 0 || end < 0) throw new Error('Recording identity accessor changed');
writeFileSync(`${output}/RecordingIdentity.swift`, `import Foundation\nextension LocalRecording {\n${recording.slice(start, end)}\n}\n`);
// Exercise the actual UI action ordering against that same real store. Only
// focus, dismissal, and the outgoing recorder/sync boundaries are substituted.
const shell = readFileSync(`${base}/CapturePhoneShell.swift`, 'utf8');
function methodBetween(startMarker, endMarker) {
  if (shell.split(startMarker).length !== 2) throw new Error(`Writing action boundary changed: ${startMarker}`);
  const start = shell.indexOf(startMarker);
  const end = shell.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Writing action end changed: ${endMarker}`);
  return shell.slice(start, end);
}
const continueAction = methodBetween('    private func continueByVoice() {', '\n    private var voiceContinuationInsertionUtf16:');
const saveAction = methodBetween('    private func saveImmediately() -> VoiceWritingDraft? {', '\n    @MainActor\n    private func exportWordDocument()');
writeFileSync(`${output}/WritingEditorActions.swift`, `import Foundation\n@MainActor extension WritingEditorActionProbe {\nfunc tapContinue() { continueByVoice() }\n${continueAction}\n${saveAction}\n}\n`);
NODE

xcrun swiftc -parse-as-library \
  "$temporary_directory/VoiceWritingDraftStore.swift" \
  "$temporary_directory/RecordingIdentity.swift" \
  "$temporary_directory/WritingEditorActions.swift" \
  "$repo_root/apps/mobile-capture/HighGroundCapture/HighGroundCapture/VoiceWritingTextComposer.swift" \
  "$repo_root/apps/mobile-capture/HighGroundCapture/HighGroundCapture/VoiceWritingRichText.swift" \
  "$repo_root/apps/mobile-capture/HighGroundCapture/HighGroundCapture/VoiceWritingRecognitionContext.swift" \
  "$repo_root/apps/mobile-capture/HighGroundCapture/Testing/VoiceWritingContinuationHarness.swift" \
  -o "$temporary_directory/continuation-harness"
"$temporary_directory/continuation-harness"
