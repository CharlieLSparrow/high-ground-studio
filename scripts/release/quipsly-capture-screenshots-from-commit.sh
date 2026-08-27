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
metadata_path="${worktree_path}/release/app-store/quipsly-capture/en-US.json"
[[ -f "$metadata_path" ]] ||
  fail "Committed App Store metadata is unavailable at ${metadata_path}"
materialization_mode="runner"
if [[ ! -f "$draft_receipt" ]]; then
  manifest_path="${output_directory}/xcresult-attachments/manifest.json"
  result_bundle="${output_directory}/QuipslyCapture-AppStore-Drafts.xcresult"
  attachment_directory="${output_directory}/xcresult-attachments"
  materializer="${worktree_path}/apps/mobile-capture/HighGroundCapture/scripts/app-store-draft-screenshots.mjs"
  [[ -f "$manifest_path" ]] ||
    fail "Committed screenshot runner returned without a receipt or attachment manifest."
  [[ -d "$result_bundle" ]] ||
    fail "Committed screenshot runner returned without a receipt or result bundle."
  [[ -f "$materializer" && -f "$metadata_path" ]] ||
    fail "Exact committed screenshot materializer inputs are unavailable."

  IFS=$'\t' read -r manifest_device_name manifest_device_id < <(
    node - "$manifest_path" <<'NODE'
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const attachment = manifest
  .flatMap((test) => Array.isArray(test?.attachments) ? test.attachments : [])
  .find((candidate) => candidate?.deviceName && candidate?.deviceId);
if (!attachment) {
  process.exit(2);
}
process.stdout.write(`${attachment.deviceName}\t${attachment.deviceId}\n`);
NODE
  ) || fail "Could not recover simulator identity from the attachment manifest."

  echo "WARN Screenshot runner omitted its receipt; invoking the exact committed materializer."
  node --input-type=module - "$materializer" \
    --metadata "$metadata_path" \
    --manifest "$manifest_path" \
    --exported-directory "$attachment_directory" \
    --output-directory "$output_directory" \
    --source-revision "$source_revision" \
    --source-isolation "detached-worktree" \
    --result-bundle "$result_bundle" \
    --device-name "$manifest_device_name" \
    --device-id "$manifest_device_id" <<'NODE'
import { pathToFileURL } from "node:url";

const [materializerPath, ...materializerArguments] = process.argv.slice(2);
const materializer = await import(pathToFileURL(materializerPath).href);
if (typeof materializer.runDraftScreenshotCli !== "function") {
  throw new Error("Exact committed materializer does not export runDraftScreenshotCli.");
}
const result = materializer.runDraftScreenshotCli(materializerArguments);
if (result !== 0) {
  process.exit(result);
}
NODE
  materialization_mode="exact-committed-recovery"
fi
[[ -f "$draft_receipt" ]] ||
  fail "Exact committed screenshot materialization returned without a draft receipt."

node - "$draft_receipt" "$metadata_path" "$output_directory" "$source_revision" "$materialization_mode" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [
  draftReceiptPath,
  metadataPath,
  outputDirectory,
  sourceRevision,
  materializationMode,
] = process.argv.slice(2);
const draft = JSON.parse(fs.readFileSync(draftReceiptPath, "utf8"));
const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const plannedScreenshots = metadata?.screenshots?.planned;
if (
  !Array.isArray(plannedScreenshots)
  || plannedScreenshots.length < 1
  || plannedScreenshots.length > 10
) {
  throw new Error(
    "committed App Store metadata must declare between one and ten planned screenshots",
  );
}
const expectedScreenshotCount = plannedScreenshots.length;
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
if (
  !Array.isArray(draft.screenshots)
  || draft.screenshots.length !== expectedScreenshotCount
) {
  throw new Error(
    `expected ${expectedScreenshotCount} canonical draft screenshots from committed metadata`,
  );
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
  materializationMode,
  draftReceiptPath,
  expectedScreenshotCount,
  screenshotCount: draft.screenshots.length,
};
const receiptPath = path.join(
  outputDirectory,
  "committed-source-receipt.json",
);
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`PASS Committed-source receipt: ${receiptPath}`);
NODE

derived_data_directory="${output_directory}/DerivedData"
if [[ -d "$derived_data_directory" && "${QUIPSLY_CAPTURE_KEEP_DERIVED_DATA:-0}" != "1" ]]; then
  rm -rf -- "$derived_data_directory"
  echo "INFO Removed regenerable committed-run screenshot DerivedData."
fi

echo "PASS Quipsly Capture App Store drafts returned from committed source ${source_revision}"
echo "BLOCKED Drafts remain ineligible until recaptured from the exact signed candidate or TestFlight install and human-approved."
