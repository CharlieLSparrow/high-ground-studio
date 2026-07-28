#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/release/quipsly-capture-screenshots-from-commit.sh [--revision <commit-ish>] [--device <simulator-name>]

Captures Quipsly Capture's private-data-safe App Store layout drafts from a
disposable detached worktree at one resolved commit. Any uncommitted files in
the caller's worktree are excluded.

These DEBUG preview images remain draft composition evidence. This command
does not make them eligible for App Store submission.
USAGE
}

fail() {
  echo "FAIL $*" >&2
  exit 1
}

revision="HEAD"
device_name="${QUIPSLY_CAPTURE_SCREENSHOT_DEVICE:-iPhone 17 Pro Max}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --revision)
      [[ $# -ge 2 ]] || fail "--revision requires a commit-ish value."
      revision="$2"
      shift 2
      ;;
    --revision=*)
      revision="${1#--revision=}"
      [[ -n "$revision" ]] || fail "--revision requires a commit-ish value."
      shift
      ;;
    --device)
      [[ $# -ge 2 ]] || fail "--device requires a simulator name."
      device_name="$2"
      shift 2
      ;;
    --device=*)
      device_name="${1#--device=}"
      [[ -n "$device_name" ]] || fail "--device requires a simulator name."
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "Unknown option: $1"
      ;;
  esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "${script_dir}/../.." rev-parse --show-toplevel)"
source_revision="$(git -C "$repo_root" rev-parse --verify --end-of-options "${revision}^{commit}")" ||
  fail "Could not resolve revision '$revision' to a commit."

artifact_root_input="${QUIPSLY_CAPTURE_SCREENSHOT_ARTIFACT_ROOT:-/tmp/quipsly-capture-app-store-drafts}"
mkdir -p "$artifact_root_input"
artifact_root="$(cd "$artifact_root_input" && pwd)"
case "${artifact_root}/" in
  "${repo_root}/"*)
    fail "Screenshot evidence must be written outside the source repository."
    ;;
esac

run_id="${QUIPSLY_CAPTURE_SCREENSHOT_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
[[ "$run_id" =~ ^[A-Za-z0-9._-]+$ ]] ||
  fail "QUIPSLY_CAPTURE_SCREENSHOT_RUN_ID may contain only letters, numbers, dot, underscore, and hyphen."

output_directory="${artifact_root}/${source_revision:0:12}/${run_id}"
[[ ! -e "$output_directory" ]] ||
  fail "Screenshot evidence output already exists: $output_directory"

temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-capture-screenshot-worktree.XXXXXX")"
worktree_path="${temporary_root}/source"
worktree_added=0

cleanup() {
  if [[ "$worktree_added" -eq 1 ]]; then
    git -C "$repo_root" worktree remove --force "$worktree_path" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$temporary_root"
}
trap cleanup EXIT INT TERM

echo "Preparing Quipsly Capture App Store drafts from committed source ${source_revision}"
git -C "$repo_root" worktree add --detach "$worktree_path" "$source_revision"
worktree_added=1

capture_runner="${worktree_path}/apps/mobile-capture/HighGroundCapture/scripts/capture-app-store-draft-screenshots.sh"
[[ -x "$capture_runner" ]] ||
  fail "Committed screenshot runner is unavailable at ${capture_runner}"

export QUIPSLY_CAPTURE_SCREENSHOT_DIR="$output_directory"
export QUIPSLY_CAPTURE_SCREENSHOT_DEVICE="$device_name"
export QUIPSLY_CAPTURE_SCREENSHOT_RUN_ID="$run_id"
export QUIPSLY_CAPTURE_SCREENSHOT_SOURCE_ISOLATION="detached-worktree"

echo "Screenshot evidence: ${output_directory}"
(
  cd "$worktree_path"
  "$capture_runner"
)

draft_receipt="${output_directory}/draft-receipt.json"
[[ -f "$draft_receipt" ]] ||
  fail "Committed screenshot runner returned without a draft receipt."

node - "$draft_receipt" "$output_directory" "$source_revision" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [draftReceiptPath, outputDirectory, sourceRevision] = process.argv.slice(2);
const draft = JSON.parse(fs.readFileSync(draftReceiptPath, "utf8"));
if (draft.sourceRevision !== sourceRevision) {
  throw new Error(
    `draft source revision ${draft.sourceRevision ?? "<missing>"} does not match ${sourceRevision}`,
  );
}
if (draft.sourceDirty !== false) {
  throw new Error("detached screenshot source must be recorded as clean");
}
if (draft.submissionEligible !== false) {
  throw new Error("DEBUG layout drafts must remain ineligible for submission");
}
if (!Array.isArray(draft.screenshots) || draft.screenshots.length !== 5) {
  throw new Error("expected exactly five canonical draft screenshots");
}
if (
  draft.sourceIsolation !== undefined
  && draft.sourceIsolation !== "detached-worktree"
) {
  throw new Error(
    `draft source isolation ${draft.sourceIsolation} is not detached-worktree`,
  );
}

const receipt = {
  schema: "quipsly-capture-committed-screenshot-evidence-v1",
  verifiedAt: new Date().toISOString(),
  status: "draft-layout-evidence",
  submissionEligible: false,
  sourceRevision,
  sourceDirty: false,
  sourceIsolation: "detached-worktree",
  draftReceiptPath,
  screenshotCount: draft.screenshots.length,
};
const receiptPath = path.join(
  outputDirectory,
  "committed-source-receipt.json",
);
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`PASS Committed-source receipt: ${receiptPath}`);
NODE

echo "PASS Quipsly Capture App Store drafts returned from committed source ${source_revision}"
echo "BLOCKED Drafts remain ineligible until recaptured from Build 6/TestFlight and human-approved."
