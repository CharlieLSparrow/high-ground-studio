#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
subject="${script_dir}/quipsly-capture-release-from-commit.sh"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-capture-release-test.XXXXXX")"
export QUIPSLY_CAPTURE_MIN_FREE_GIB=1

cleanup() {
  rm -rf -- "$fixture_root"
}
trap cleanup EXIT INT TERM

fail() {
  echo "FAIL $*" >&2
  exit 1
}

fixture_repo="${fixture_root}/fixture-repo"
fixture_release="${fixture_root}/release-output"
receipt="${fixture_root}/mock-receipt.txt"
mkdir -p \
  "${fixture_repo}/scripts/release" \
  "${fixture_repo}/apps/mobile-capture/HighGroundCapture/scripts"
cp "$subject" "${fixture_repo}/scripts/release/quipsly-capture-release-from-commit.sh"

cat >"${fixture_repo}/apps/mobile-capture/HighGroundCapture/scripts/run-fastlane.sh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
[[ ! -e "${repo_root}/uncommitted-only.txt" ]] ||
  { echo "dirty source leaked into isolated worktree" >&2; exit 1; }
git diff --quiet
git diff --cached --quiet

{
  printf 'cwd=%s\n' "$repo_root"
  printf 'revision=%s\n' "$(git rev-parse HEAD)"
  printf 'lane=%s\n' "${1:-}"
  printf 'sourceRevision=%s\n' "${QUIPSLY_CAPTURE_SOURCE_REVISION:-}"
  printf 'releaseDirectory=%s\n' "${QUIPSLY_CAPTURE_RELEASE_DIR:-}"
  printf 'releaseRunID=%s\n' "${QUIPSLY_CAPTURE_RELEASE_RUN_ID:-}"
  printf 'isolated=%s\n' "${QUIPSLY_CAPTURE_RELEASE_ISOLATED:-}"
  shift
  printf 'arguments='
  printf '<%s>' "$@"
  printf '\n'
} >"$MOCK_RECEIPT_PATH"

if [[ "${MOCK_RUNNER_FAIL:-0}" == "1" ]]; then
  exit 42
fi

if [[ -n "${MOCK_CREATE_XCTEST_DEVICE_ID:-}" ]]; then
  mkdir -p "${QUIPSLY_CAPTURE_XCTEST_DEVICE_ROOT}/${MOCK_CREATE_XCTEST_DEVICE_ID}"
  printf 'disposable test device\n' >"${QUIPSLY_CAPTURE_XCTEST_DEVICE_ROOT}/${MOCK_CREATE_XCTEST_DEVICE_ID}/fixture.txt"
fi
MOCK
chmod +x \
  "${fixture_repo}/scripts/release/quipsly-capture-release-from-commit.sh" \
  "${fixture_repo}/apps/mobile-capture/HighGroundCapture/scripts/run-fastlane.sh"

git -C "$fixture_repo" init -q
git -C "$fixture_repo" config user.name "Quipsly Release Test"
git -C "$fixture_repo" config user.email "release-test@quipsly.invalid"
git -C "$fixture_repo" add \
  scripts/release/quipsly-capture-release-from-commit.sh \
  apps/mobile-capture/HighGroundCapture/scripts/run-fastlane.sh
git -C "$fixture_repo" commit -qm "test: committed release fixture"
source_revision="$(git -C "$fixture_repo" rev-parse HEAD)"
printf 'must not enter release\n' >"${fixture_repo}/uncommitted-only.txt"
fixture_xctest_root="${fixture_root}/XCTestDevices"
preexisting_xctest_device="11111111-1111-4111-8111-111111111111"
created_xctest_device="22222222-2222-4222-8222-222222222222"
mkdir -p "${fixture_xctest_root}/${preexisting_xctest_device}"
printf 'keep me\n' >"${fixture_xctest_root}/${preexisting_xctest_device}/fixture.txt"

if MOCK_RECEIPT_PATH="$receipt" \
  QUIPSLY_CAPTURE_MIN_FREE_GIB=999999999 \
  QUIPSLY_CAPTURE_RELEASE_DIR="$fixture_release" \
  "${fixture_repo}/scripts/release/quipsly-capture-release-from-commit.sh" \
    candidate \
    --revision "$source_revision" >/dev/null 2>&1; then
  fail "Candidate qualification must fail before worktree creation when disk capacity is insufficient."
fi
[[ ! -e "$receipt" ]] ||
  fail "The committed runner must not start after the disk-capacity gate fails."

MOCK_RECEIPT_PATH="$receipt" \
MOCK_CREATE_XCTEST_DEVICE_ID="$created_xctest_device" \
QUIPSLY_CAPTURE_XCTEST_DEVICE_ROOT="$fixture_xctest_root" \
QUIPSLY_CAPTURE_RELEASE_DIR="$fixture_release" \
"${fixture_repo}/scripts/release/quipsly-capture-release-from-commit.sh" \
  candidate \
  --revision "$source_revision" \
  --device "iPhone Test"

grep -Fqx "revision=${source_revision}" "$receipt" ||
  fail "Runner did not receive the exact committed revision."
grep -Fqx "lane=candidate" "$receipt" ||
  fail "Runner did not receive the requested lane."
grep -Fqx "sourceRevision=${source_revision}" "$receipt" ||
  fail "Source revision environment did not match."
canonical_release_directory="$(cd "$fixture_release" && pwd)"
grep -Fqx "releaseDirectory=${canonical_release_directory}" "$receipt" ||
  fail "Release output directory was not stable across the worktree."
grep -Fqx "isolated=1" "$receipt" ||
  fail "Runner did not receive the isolated-release marker."
grep -Eq '^releaseRunID=[A-Za-z0-9._-]+$' "$receipt" ||
  fail "Runner did not receive a safe unique release-run identity."
grep -Fqx "arguments=<--device><iPhone Test>" "$receipt" ||
  fail "Fastlane arguments were not preserved exactly."
[[ -d "${fixture_xctest_root}/${preexisting_xctest_device}" ]] ||
  fail "Candidate cleanup removed a pre-existing XCTest device."
[[ ! -e "${fixture_xctest_root}/${created_xctest_device}" ]] ||
  fail "Candidate cleanup retained an XCTest device created by the run."

MOCK_RECEIPT_PATH="$receipt" \
QUIPSLY_CAPTURE_RELEASE_DIR="$fixture_release" \
"${fixture_repo}/scripts/release/quipsly-capture-release-from-commit.sh" \
  upload_qualified \
  --revision "$source_revision" \
  'receipt_path:/tmp/Quipsly Capture/release.json'

grep -Fqx "lane=upload_qualified" "$receipt" ||
  fail "Runner did not receive the sealed-candidate upload lane."
grep -Fqx "arguments=<receipt_path:/tmp/Quipsly Capture/release.json>" "$receipt" ||
  fail "Qualified receipt path was not preserved exactly."

MOCK_RECEIPT_PATH="$receipt" \
QUIPSLY_CAPTURE_RELEASE_DIR="$fixture_release" \
"${fixture_repo}/scripts/release/quipsly-capture-release-from-commit.sh" \
  upload_qualified \
  --revision "$source_revision" \
  --receipt "/tmp/Quipsly Capture/release.json" \
  --api-key-path "/tmp/Quipsly Secrets/api key.json"

grep -Fqx "arguments=<receipt_path:/tmp/Quipsly Capture/release.json><api_key_path:/tmp/Quipsly Secrets/api key.json>" "$receipt" ||
  fail "Named upload flags did not preserve their exact paths."

runner_cwd="$(sed -n 's/^cwd=//p' "$receipt")"
[[ "$runner_cwd" != "$fixture_repo" ]] ||
  fail "Runner executed in the caller's dirty worktree."
[[ ! -e "$runner_cwd" ]] ||
  fail "Disposable release worktree remained after the run."

worktree_count="$(
  git -C "$fixture_repo" worktree list --porcelain |
    awk '$1 == "worktree" { count += 1 } END { print count + 0 }'
)"
[[ "$worktree_count" -eq 1 ]] ||
  fail "Disposable worktree registration was not removed."

if MOCK_RECEIPT_PATH="$receipt" \
  MOCK_RUNNER_FAIL=1 \
  QUIPSLY_CAPTURE_RELEASE_DIR="$fixture_release" \
  "${fixture_repo}/scripts/release/quipsly-capture-release-from-commit.sh" \
    release \
    --revision "$source_revision" >/dev/null 2>&1; then
  fail "A failing committed runner must propagate failure."
fi
worktree_count_after_failure="$(
  git -C "$fixture_repo" worktree list --porcelain |
    awk '$1 == "worktree" { count += 1 } END { print count + 0 }'
)"
[[ "$worktree_count_after_failure" -eq 1 ]] ||
  fail "Disposable worktree registration remained after runner failure."

if "${fixture_repo}/scripts/release/quipsly-capture-release-from-commit.sh" invalid >/dev/null 2>&1; then
  fail "Invalid release lanes must fail closed."
fi

echo "PASS committed Capture releases exclude caller worktree drift"
