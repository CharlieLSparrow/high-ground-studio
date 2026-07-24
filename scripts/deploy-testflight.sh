#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
release_runner="${repo_root}/scripts/release/quipsly-capture-release-from-commit.sh"

if [[ ! -x "${release_runner}" ]]; then
  echo "FAIL Isolated Capture release runner is unavailable at ${release_runner}" >&2
  exit 1
fi

exec "${release_runner}" beta "$@"
