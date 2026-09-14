#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_directory="$(mktemp -d -t quipsly-writing-account-context)"
cleanup() {
  rm -f "$temporary_directory/account-context-harness"
  rmdir "$temporary_directory"
}
trap cleanup EXIT
native="$repo_root/apps/mobile-capture/HighGroundCapture/HighGroundCapture"
xcrun swiftc -parse-as-library \
  "$native/VoiceWritingDraftStore.swift" \
  "$native/VoiceWritingTextComposer.swift" \
  "$native/VoiceWritingRichText.swift" \
  "$native/VoiceWritingRecognitionContext.swift" \
  "$repo_root/apps/mobile-capture/HighGroundCapture/Testing/VoiceWritingAccountContextHarness.swift" \
  -o "$temporary_directory/account-context-harness"
"$temporary_directory/account-context-harness"
