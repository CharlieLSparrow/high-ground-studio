#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
subject="${script_dir}/quipsly-capture-preflight-from-commit.sh"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-capture-preflight-test.XXXXXX")"

cleanup() {
  rm -rf -- "$fixture_root"
}
trap cleanup EXIT INT TERM

fail() {
  echo "FAIL $*" >&2
  exit 1
}

fixture_repo="${fixture_root}/fixture-repo"
mock_bin="${fixture_root}/mock-bin"
receipt="${fixture_root}/receipt.txt"
mkdir -p \
  "${fixture_repo}/scripts/release" \
  "${fixture_repo}/scripts" \
  "$mock_bin"
cp "$subject" \
  "${fixture_repo}/scripts/release/quipsly-capture-preflight-from-commit.sh"

cat >"${fixture_repo}/scripts/quipsly-mobile-capture-preflight.sh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail

[[ -d node_modules ]] ||
  { echo "workspace graph was not bootstrapped" >&2; exit 1; }
[[ ! -e uncommitted-only.txt ]] ||
  { echo "caller worktree drift leaked into preflight" >&2; exit 1; }
[[ "${QUIPSLY_CAPTURE_PREFLIGHT_ISOLATED:-}" == "1" ]] ||
  { echo "isolated marker was not exported" >&2; exit 1; }
[[ "$(git rev-parse HEAD)" == "${QUIPSLY_CAPTURE_SOURCE_REVISION:-}" ]] ||
  { echo "source revision marker did not match HEAD" >&2; exit 1; }

{
  printf 'cwd=%s\n' "$PWD"
  printf 'revision=%s\n' "$(git rev-parse HEAD)"
  printf 'sourceRevision=%s\n' "${QUIPSLY_CAPTURE_SOURCE_REVISION:-}"
} >>"$MOCK_RECEIPT_PATH"

if [[ "${MOCK_PREFLIGHT_FAIL:-0}" == "1" ]]; then
  exit 42
fi
MOCK

cat >"${mock_bin}/corepack" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail

[[ "$#" -ge 3 ]] ||
  { echo "corepack invocation was incomplete" >&2; exit 1; }
[[ "$1" == "pnpm" && "$2" == "install" && "$3" == "--frozen-lockfile" ]] ||
  { echo "locked pnpm install was not requested" >&2; exit 1; }
[[ ! -e uncommitted-only.txt ]] ||
  { echo "caller worktree drift leaked into dependency bootstrap" >&2; exit 1; }
mkdir -p node_modules
printf 'corepackArguments=' >>"$MOCK_RECEIPT_PATH"
printf '<%s>' "$@" >>"$MOCK_RECEIPT_PATH"
printf '\n' >>"$MOCK_RECEIPT_PATH"
MOCK

chmod +x \
  "${fixture_repo}/scripts/release/quipsly-capture-preflight-from-commit.sh" \
  "${fixture_repo}/scripts/quipsly-mobile-capture-preflight.sh" \
  "${mock_bin}/corepack"

git -C "$fixture_repo" init -q
git -C "$fixture_repo" config user.name "Quipsly Preflight Test"
git -C "$fixture_repo" config user.email "preflight-test@quipsly.invalid"
git -C "$fixture_repo" add scripts
git -C "$fixture_repo" commit -qm "test: committed preflight fixture"
source_revision="$(git -C "$fixture_repo" rev-parse HEAD)"
printf 'must not enter preflight\n' >"${fixture_repo}/uncommitted-only.txt"

MOCK_RECEIPT_PATH="$receipt" \
QUIPSLY_COREPACK_BIN="${mock_bin}/corepack" \
"${fixture_repo}/scripts/release/quipsly-capture-preflight-from-commit.sh" \
  --revision "$source_revision" \
  --offline

grep -Fqx "corepackArguments=<pnpm><install><--frozen-lockfile><--offline>" "$receipt" ||
  fail "Offline locked install arguments were not preserved."
grep -Fqx "revision=${source_revision}" "$receipt" ||
  fail "Preflight did not run at the exact committed revision."
grep -Fqx "sourceRevision=${source_revision}" "$receipt" ||
  fail "Preflight source marker did not match the committed revision."

preflight_cwd="$(sed -n 's/^cwd=//p' "$receipt")"
[[ "$preflight_cwd" != "$fixture_repo" ]] ||
  fail "Preflight executed in the caller's dirty worktree."
[[ ! -e "$preflight_cwd" ]] ||
  fail "Disposable preflight worktree remained after the run."

worktree_count="$(
  git -C "$fixture_repo" worktree list --porcelain |
    awk '$1 == "worktree" { count += 1 } END { print count + 0 }'
)"
[[ "$worktree_count" -eq 1 ]] ||
  fail "Disposable worktree registration was not removed."

if MOCK_RECEIPT_PATH="$receipt" \
  MOCK_PREFLIGHT_FAIL=1 \
  QUIPSLY_COREPACK_BIN="${mock_bin}/corepack" \
  "${fixture_repo}/scripts/release/quipsly-capture-preflight-from-commit.sh" \
    --revision "$source_revision" >/dev/null 2>&1; then
  fail "A failing committed preflight must propagate failure."
fi

worktree_count_after_failure="$(
  git -C "$fixture_repo" worktree list --porcelain |
    awk '$1 == "worktree" { count += 1 } END { print count + 0 }'
)"
[[ "$worktree_count_after_failure" -eq 1 ]] ||
  fail "Disposable worktree registration remained after preflight failure."

if QUIPSLY_COREPACK_BIN="${mock_bin}/corepack" \
  "${fixture_repo}/scripts/release/quipsly-capture-preflight-from-commit.sh" \
    --revision not-a-commit >/dev/null 2>&1; then
  fail "An invalid revision must fail closed."
fi

echo "PASS committed Capture preflight bootstraps locked dependencies and excludes caller drift"
