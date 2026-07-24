#!/usr/bin/env bash

set -euo pipefail

readonly typescript_version="7.0.2"
readonly project_configs=(
  "apps/ai-hub/tsconfig.json"
  "apps/desktop-companion/tsconfig.json"
  "apps/motion-lab/tsconfig.json"
  "apps/photography-hub/tsconfig.json"
  "apps/quiplore/tsconfig.json"
  "apps/quipsly-api/tsconfig.json"
  "apps/quipsly/tsconfig.json"
  "apps/render-engine/tsconfig.json"
  "apps/video-hub/tsconfig.json"
  "apps/web/tsconfig.json"
  "packages/content-studio-domain/tsconfig.json"
  "packages/motion-engine/tsconfig.json"
  "packages/quipsly-document-kernel/tsconfig.json"
  "packages/quipsly-document-kernel/tsconfig.test.json"
  "packages/quipsly-domain/tsconfig.json"
  "packages/studio-domain/tsconfig.json"
  "packages/worldhub-domain/tsconfig.json"
)

if [[ "${1:-}" == "--list" ]]; then
  printf '%s\n' "${project_configs[@]}"
  exit 0
fi

for project_config in "${project_configs[@]}"; do
  if [[ ! -f "$project_config" ]]; then
    echo "FAIL Missing TypeScript project: $project_config" >&2
    exit 1
  fi

  echo "Checking $project_config with TypeScript $typescript_version"
  pnpm dlx "typescript@$typescript_version" \
    -p "$project_config" \
    --noEmit \
    --incremental false
done

echo "PASS ${#project_configs[@]} TypeScript projects are compatible with TypeScript $typescript_version."
