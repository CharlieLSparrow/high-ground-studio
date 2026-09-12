#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary_directory="$(mktemp -d)"

cleanup() {
  case "$temporary_directory" in
    /tmp/*|/var/folders/*) rm -rf -- "$temporary_directory" ;;
    *) echo "Refusing to remove unexpected temporary path: $temporary_directory" >&2 ;;
  esac
}
trap cleanup EXIT

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
# Compile the real transport model. A hand-copied test type previously drifted
# from the app's Codable model and stopped this recovery harness from compiling.
node - "$repo_root/apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift" "$temporary_directory/note-block.swift" <<'NODE'
const fs = require("node:fs");
const source = fs.readFileSync(process.argv[2], "utf8");
const declarations = [...source.matchAll(/^struct MobileCaptureWorkNoteBlock:[\s\S]*?^}/gm)];
if (declarations.length !== 1) throw new Error("Expected one canonical note block declaration");
fs.writeFileSync(process.argv[3], "import Foundation\n" + declarations[0][0] + "\n");
NODE
xcrun swiftc \
  -D DOCUMENT_NOTE_EDIT_HARNESS \
  -parse-as-library \
  "$temporary_directory/note-block.swift" \
  "$repo_root/apps/mobile-capture/HighGroundCapture/HighGroundCapture/DocumentNoteEditOutbox.swift" \
  "$repo_root/apps/mobile-capture/HighGroundCapture/Testing/DocumentNoteEditOutboxHarness.swift" \
  -o "$temporary_directory/document-note-edit-harness"

"$temporary_directory/document-note-edit-harness"
