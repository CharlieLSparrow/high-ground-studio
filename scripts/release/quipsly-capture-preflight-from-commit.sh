#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/release/quipsly-capture-preflight-from-commit.sh [--revision <commit-ish>] [--offline]

Runs the complete Quipsly Capture preflight from a disposable detached worktree.
The worktree recreates the locked pnpm workspace graph, so caller worktree drift
and node_modules links cannot affect the result.
USAGE
}

fail() {
  echo "FAIL $*" >&2
  exit 1
}

revision="HEAD"
offline=0
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
    --offline)
      offline=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "Unsupported option: $1"
      ;;
  esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "${script_dir}/../.." rev-parse --show-toplevel)"
source_revision="$(git -C "$repo_root" rev-parse --verify --end-of-options "${revision}^{commit}")" ||
  fail "Could not resolve revision '$revision' to a commit."

corepack_bin="${QUIPSLY_COREPACK_BIN:-$(command -v corepack || true)}"
[[ -n "$corepack_bin" && -x "$corepack_bin" ]] ||
  fail "corepack is required to recreate the committed pnpm workspace graph."

temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-capture-preflight.XXXXXX")"
worktree_path="${temporary_root}/source"
worktree_added=0

cleanup() {
  if [[ "$worktree_added" -eq 1 ]]; then
    git -C "$repo_root" worktree remove --force "$worktree_path" >/dev/null 2>&1 || true
  fi
  rmdir "$temporary_root" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "Preparing full Quipsly Capture preflight from committed source ${source_revision}"
git -C "$repo_root" worktree add --detach "$worktree_path" "$source_revision"
worktree_added=1

preflight="${worktree_path}/scripts/quipsly-mobile-capture-preflight.sh"
[[ -x "$preflight" ]] ||
  fail "Committed Capture preflight is unavailable at ${preflight}"

install_arguments=(pnpm install --frozen-lockfile)
if [[ "$offline" -eq 1 ]]; then
  install_arguments+=(--offline)
fi

(
  cd "$worktree_path"
  CI=1 "$corepack_bin" "${install_arguments[@]}"
)

git -C "$worktree_path" diff --quiet ||
  fail "Dependency bootstrap changed committed files."
git -C "$worktree_path" diff --cached --quiet ||
  fail "Dependency bootstrap staged committed-file changes."
[[ "$(git -C "$worktree_path" rev-parse HEAD)" == "$source_revision" ]] ||
  fail "Detached preflight worktree changed revisions."

export QUIPSLY_CAPTURE_SOURCE_REVISION="$source_revision"
export QUIPSLY_CAPTURE_PREFLIGHT_ISOLATED=1
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

(
  cd "$worktree_path"
  "$preflight"
)

echo "PASS full Quipsly Capture preflight returned from committed source ${source_revision}"
