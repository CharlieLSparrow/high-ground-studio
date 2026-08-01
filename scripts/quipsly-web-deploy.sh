#!/usr/bin/env bash
set -euo pipefail

# Compatibility entry point retained for old operator notes and bookmarks.
# All cloud mutation belongs to the committed-source, digest-readback preview
# pipeline. This wrapper must never rebuild a dirty tree or invent a timestamp
# image tag.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_ref="${SOURCE_REF:-HEAD}"

if [[ $# -gt 0 ]]; then
  echo "Positional image tags are retired because they create duplicate builds and unbounded Artifact Registry versions." >&2
  echo "Use SOURCE_REF=<commit-ish> bash scripts/release/quipsly-deploy-preview.sh." >&2
  exit 2
fi

if [[ "${STAGE_ONLY:-0}" == "1" ]]; then
  echo "Staging the bounded Nest release context for committed source ${source_ref}."
  exec bash "${repo_root}/scripts/release/quipsly-build-context.sh" \
    "${source_ref}" \
    "${CTX:-}"
fi

for retired in LOCAL_VALIDATE NO_TRAFFIC RUN_PREVIEW_SMOKE RUN_PUBLIC_INTEGRATION_SMOKE; do
  if [[ -n "${!retired:-}" ]]; then
    echo "Ignoring retired ${retired}; the canonical preview pipeline always validates committed source and deploys at zero traffic." >&2
  fi
done

echo "Routing legacy Quipsly deploy entry point through the committed-source preview pipeline."
exec env SOURCE_REF="${source_ref}" \
  bash "${repo_root}/scripts/release/quipsly-deploy-preview.sh"
