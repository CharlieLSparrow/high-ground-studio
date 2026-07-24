#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
source_ref="${1:-${SOURCE_REF:-HEAD}}"
output_dir="${2:-}"

exec bash "${repo_root}/scripts/release/materialize-release-context.sh" \
  nest \
  "${source_ref}" \
  "${output_dir}"
