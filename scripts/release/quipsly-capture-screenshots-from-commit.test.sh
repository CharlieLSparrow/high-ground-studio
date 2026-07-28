#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
subject="${script_dir}/quipsly-capture-screenshots-from-commit.sh"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-capture-screenshot-release-test.XXXXXX")"

cleanup() {
  rm -rf -- "$fixture_root"
}
trap cleanup EXIT INT TERM

fail() {
  echo "FAIL $*" >&2
  exit 1
}

fixture_repo="${fixture_root}/fixture-repo"
fixture_artifacts="${fixture_root}/screenshot-output"
runner_receipt="${fixture_root}/mock-runner-receipt.txt"
mkdir -p \
  "${fixture_repo}/scripts/release" \
  "${fixture_repo}/apps/mobile-capture/HighGroundCapture/scripts"
cp "$subject" "${fixture_repo}/scripts/release/quipsly-capture-screenshots-from-commit.sh"

cat >"${fixture_repo}/apps/mobile-capture/HighGroundCapture/scripts/capture-app-store-draft-screenshots.sh" <<'MOCK'
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
  printf 'outputDirectory=%s\n' "${QUIPSLY_CAPTURE_SCREENSHOT_DIR:-}"
  printf 'runID=%s\n' "${QUIPSLY_CAPTURE_SCREENSHOT_RUN_ID:-}"
  printf 'device=%s\n' "${QUIPSLY_CAPTURE_SCREENSHOT_DEVICE:-}"
  printf 'sourceIsolation=%s\n' "${QUIPSLY_CAPTURE_SCREENSHOT_SOURCE_ISOLATION:-}"
} >"$MOCK_RUNNER_RECEIPT_PATH"

if [[ "${MOCK_RUNNER_FAIL:-0}" == "1" ]]; then
  exit 42
fi

mkdir -p "$QUIPSLY_CAPTURE_SCREENSHOT_DIR"
node - "$QUIPSLY_CAPTURE_SCREENSHOT_DIR/draft-receipt.json" <<'NODE'
const fs = require("node:fs");
const receiptPath = process.argv[2];
fs.writeFileSync(receiptPath, `${JSON.stringify({
  submissionEligible: false,
  sourceRevision: require("node:child_process")
    .execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
    .trim(),
  sourceDirty: false,
  sourceIsolation: process.env.QUIPSLY_CAPTURE_SCREENSHOT_SOURCE_ISOLATION,
  screenshots: Array.from({ length: 5 }, (_, index) => ({
    order: index + 1,
  })),
}, null, 2)}\n`);
NODE
MOCK
chmod +x \
  "${fixture_repo}/scripts/release/quipsly-capture-screenshots-from-commit.sh" \
  "${fixture_repo}/apps/mobile-capture/HighGroundCapture/scripts/capture-app-store-draft-screenshots.sh"

git -C "$fixture_repo" init -q
git -C "$fixture_repo" config user.name "Quipsly Screenshot Test"
git -C "$fixture_repo" config user.email "screenshot-test@quipsly.invalid"
git -C "$fixture_repo" add \
  scripts/release/quipsly-capture-screenshots-from-commit.sh \
  apps/mobile-capture/HighGroundCapture/scripts/capture-app-store-draft-screenshots.sh
git -C "$fixture_repo" commit -qm "test: committed screenshot fixture"
source_revision="$(git -C "$fixture_repo" rev-parse HEAD)"
printf 'must not enter screenshot evidence\n' >"${fixture_repo}/uncommitted-only.txt"

MOCK_RUNNER_RECEIPT_PATH="$runner_receipt" \
QUIPSLY_CAPTURE_SCREENSHOT_ARTIFACT_ROOT="$fixture_artifacts" \
QUIPSLY_CAPTURE_SCREENSHOT_RUN_ID="fixture-run" \
"${fixture_repo}/scripts/release/quipsly-capture-screenshots-from-commit.sh" \
  --revision "$source_revision" \
  --device "iPhone Test"

grep -Fqx "revision=${source_revision}" "$runner_receipt" ||
  fail "Runner did not receive the exact committed revision."
grep -Fqx "runID=fixture-run" "$runner_receipt" ||
  fail "Runner did not receive the explicit run identity."
grep -Fqx "device=iPhone Test" "$runner_receipt" ||
  fail "Runner did not receive the requested simulator."
grep -Fqx "sourceIsolation=detached-worktree" "$runner_receipt" ||
  fail "Runner did not receive detached-worktree provenance."

canonical_fixture_artifacts="$(cd "$fixture_artifacts" && pwd)"
output_directory="${canonical_fixture_artifacts}/${source_revision:0:12}/fixture-run"
grep -Fqx "outputDirectory=${output_directory}" "$runner_receipt" ||
  fail "Screenshot output directory was not stable across the worktree."
[[ -f "${output_directory}/committed-source-receipt.json" ]] ||
  fail "Committed-source receipt was not created."
node - "${output_directory}/committed-source-receipt.json" "$source_revision" <<'NODE'
const fs = require("node:fs");
const [receiptPath, sourceRevision] = process.argv.slice(2);
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
if (
  receipt.sourceRevision !== sourceRevision
  || receipt.sourceDirty !== false
  || receipt.sourceIsolation !== "detached-worktree"
  || receipt.submissionEligible !== false
  || receipt.screenshotCount !== 5
) {
  throw new Error("committed-source screenshot receipt is incomplete");
}
NODE

runner_cwd="$(sed -n 's/^cwd=//p' "$runner_receipt")"
[[ "$runner_cwd" != "$fixture_repo" ]] ||
  fail "Runner executed in the caller's dirty worktree."
[[ ! -e "$runner_cwd" ]] ||
  fail "Disposable screenshot worktree remained after the run."

worktree_count="$(
  git -C "$fixture_repo" worktree list --porcelain |
    awk '$1 == "worktree" { count += 1 } END { print count + 0 }'
)"
[[ "$worktree_count" -eq 1 ]] ||
  fail "Disposable worktree registration was not removed."

if MOCK_RUNNER_RECEIPT_PATH="$runner_receipt" \
  MOCK_RUNNER_FAIL=1 \
  QUIPSLY_CAPTURE_SCREENSHOT_ARTIFACT_ROOT="$fixture_artifacts" \
  QUIPSLY_CAPTURE_SCREENSHOT_RUN_ID="failure-run" \
  "${fixture_repo}/scripts/release/quipsly-capture-screenshots-from-commit.sh" \
    --revision "$source_revision" >/dev/null 2>&1; then
  fail "A failing committed screenshot runner must propagate failure."
fi
worktree_count_after_failure="$(
  git -C "$fixture_repo" worktree list --porcelain |
    awk '$1 == "worktree" { count += 1 } END { print count + 0 }'
)"
[[ "$worktree_count_after_failure" -eq 1 ]] ||
  fail "Disposable worktree registration remained after runner failure."

if QUIPSLY_CAPTURE_SCREENSHOT_ARTIFACT_ROOT="${fixture_repo}/artifacts" \
  "${fixture_repo}/scripts/release/quipsly-capture-screenshots-from-commit.sh" \
    --revision "$source_revision" >/dev/null 2>&1; then
  fail "Screenshot artifacts inside the source repository must fail closed."
fi

echo "PASS committed Capture screenshot drafts exclude caller worktree drift"
