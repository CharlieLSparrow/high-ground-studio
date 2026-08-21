#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/release/quipsly-capture-release-from-commit.sh <candidate|release|beta|upload_qualified> [--revision <commit-ish>] [fastlane options...]
  scripts/release/quipsly-capture-release-from-commit.sh upload_qualified --revision <commit-ish> --receipt <release-receipt.json> --api-key-path <api-key.json>

Builds or uploads Quipsly Capture from a disposable detached worktree at one
resolved commit. Any uncommitted files in the caller's worktree are excluded.

`candidate` is the canonical no-upload qualification lane: deterministic UI
tests followed by signed archive/export verification. `release` is the lower
level archive-only diagnostic lane. `beta` qualifies, uploads, and waits for
App Store Connect processing. `upload_qualified` re-verifies and uploads an
existing sealed candidate receipt without repeating qualification or rebuild.
The named upload flags are translated to Fastlane options so paths containing
spaces remain one argument. APP_STORE_CONNECT_API_KEY_PATH may replace
--api-key-path.
USAGE
}

fail() {
  echo "FAIL $*" >&2
  exit 1
}

lane="${1:-}"
case "$lane" in
  candidate | release | beta | upload_qualified) ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    fail "First argument must be candidate, release, beta, or upload_qualified."
    ;;
esac
shift

revision="HEAD"
fastlane_args=()
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
    --receipt)
      [[ $# -ge 2 && -n "$2" ]] || fail "--receipt requires a release-receipt.json path."
      fastlane_args+=("receipt_path:$2")
      shift 2
      ;;
    --receipt=*)
      receipt_path="${1#--receipt=}"
      [[ -n "$receipt_path" ]] || fail "--receipt requires a release-receipt.json path."
      fastlane_args+=("receipt_path:${receipt_path}")
      shift
      ;;
    --api-key-path)
      [[ $# -ge 2 && -n "$2" ]] || fail "--api-key-path requires a Fastlane API-key JSON path."
      fastlane_args+=("api_key_path:$2")
      shift 2
      ;;
    --api-key-path=*)
      api_key_path="${1#--api-key-path=}"
      [[ -n "$api_key_path" ]] || fail "--api-key-path requires a Fastlane API-key JSON path."
      fastlane_args+=("api_key_path:${api_key_path}")
      shift
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        fastlane_args+=("$1")
        shift
      done
      ;;
    *)
      fastlane_args+=("$1")
      shift
      ;;
  esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "${script_dir}/../.." rev-parse --show-toplevel)"
source_revision="$(git -C "$repo_root" rev-parse --verify --end-of-options "${revision}^{commit}")" ||
  fail "Could not resolve revision '$revision' to a commit."

release_root_input="${QUIPSLY_CAPTURE_RELEASE_DIR:-/tmp/quipsly-capture-release}"
mkdir -p "$release_root_input"
release_root="$(cd "$release_root_input" && pwd)"
case "${release_root}/" in
  "${repo_root}/"*)
    fail "Release artifacts must be written outside the source repository."
    ;;
esac

minimum_free_gib="${QUIPSLY_CAPTURE_MIN_FREE_GIB:-10}"
[[ "$minimum_free_gib" =~ ^[1-9][0-9]*$ ]] ||
  fail "QUIPSLY_CAPTURE_MIN_FREE_GIB must be a positive integer."
minimum_free_kib="$((minimum_free_gib * 1024 * 1024))"

require_free_space() {
  local path="$1"
  local label="$2"
  local available_kib
  available_kib="$(df -Pk "$path" | awk 'NR == 2 { print $4 }')"
  [[ "$available_kib" =~ ^[0-9]+$ ]] ||
    fail "Could not determine free space for ${label} at ${path}."
  (( available_kib >= minimum_free_kib )) ||
    fail "${label} requires at least ${minimum_free_gib} GiB free at ${path}; only $((available_kib / 1024 / 1024)) GiB is available. Remove disposable Xcode/release evidence or set the output directory to a larger volume."
}

if [[ "$lane" != "upload_qualified" ]]; then
  require_free_space "$release_root" "Capture release qualification"
fi

if [[ "$lane" == "candidate" || "$lane" == "beta" ]]; then
  ui_test_root_input="${QUIPSLY_CAPTURE_UI_TEST_DIR:-/tmp/quipsly-capture-ui-tests}"
  mkdir -p "$ui_test_root_input"
  ui_test_root="$(cd "$ui_test_root_input" && pwd)"
  case "${ui_test_root}/" in
    "${repo_root}/"*)
      fail "Capture UI evidence must be written outside the source repository."
      ;;
  esac
  require_free_space "$ui_test_root" "Capture UI qualification"
  export QUIPSLY_CAPTURE_UI_TEST_DIR="$ui_test_root"
fi

release_run_id="${QUIPSLY_CAPTURE_RELEASE_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
[[ "$release_run_id" =~ ^[A-Za-z0-9._-]+$ ]] ||
  fail "QUIPSLY_CAPTURE_RELEASE_RUN_ID may contain only letters, numbers, dot, underscore, and hyphen."

temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-capture-worktree.XXXXXX")"
worktree_path="${temporary_root}/source"
worktree_added=0

cleanup() {
  if [[ "$worktree_added" -eq 1 ]]; then
    git -C "$repo_root" worktree remove --force "$worktree_path" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$temporary_root"
}
trap cleanup EXIT INT TERM

echo "Preparing Quipsly Capture ${lane} from committed source ${source_revision}"
git -C "$repo_root" worktree add --detach "$worktree_path" "$source_revision"
worktree_added=1

capture_runner="${worktree_path}/apps/mobile-capture/HighGroundCapture/scripts/run-fastlane.sh"
[[ -x "$capture_runner" ]] ||
  fail "Committed Capture runner is unavailable at ${capture_runner}"

export QUIPSLY_CAPTURE_SOURCE_REVISION="$source_revision"
export QUIPSLY_CAPTURE_RELEASE_DIR="$release_root"
export QUIPSLY_CAPTURE_RELEASE_ISOLATED=1
export QUIPSLY_CAPTURE_RELEASE_RUN_ID="$release_run_id"

echo "Release artifacts: ${release_root}/${source_revision:0:12}/${release_run_id}"
if [[ ${#fastlane_args[@]} -gt 0 ]]; then
  (
    cd "$worktree_path"
    "$capture_runner" "$lane" "${fastlane_args[@]}"
  )
else
  (
    cd "$worktree_path"
    "$capture_runner" "$lane"
  )
fi

echo "PASS Quipsly Capture ${lane} returned from committed source ${source_revision}"
