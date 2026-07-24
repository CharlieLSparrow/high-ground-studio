#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
capture_runner="${repo_root}/apps/mobile-capture/HighGroundCapture/scripts/run-fastlane.sh"

if [[ ! -x "${capture_runner}" ]]; then
  echo "FAIL Capture release runner is unavailable at ${capture_runner}" >&2
  exit 1
fi

exec "${capture_runner}" beta "$@"
