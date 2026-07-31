#!/usr/bin/env bash

set -euo pipefail

readonly typescript_version="7.0.2"
readonly typescript_api_version="6.0.2"
readonly typescript_native_specifier="npm:typescript@$typescript_version"
readonly typescript_api_specifier="npm:@typescript/typescript6@$typescript_api_version"
readonly project_configs=(
  "apps/ai-hub/tsconfig.json"
  "apps/desktop-companion/tsconfig.json"
  "apps/local-engine/tsconfig.json"
  "apps/motion-lab/tsconfig.json"
  "apps/photography-hub/tsconfig.json"
  "apps/quiplore/tsconfig.json"
  "apps/quipsly-api/tsconfig.json"
  "apps/quipsly-media-processor/tsconfig.json"
  "apps/quipsly-media-verifier/tsconfig.json"
  "apps/quipsly-transcript-worker/tsconfig.json"
  "apps/quipsly/tsconfig.json"
  "apps/render-engine/tsconfig.json"
  "apps/studio-cut-web/tsconfig.json"
  "apps/video-hub/tsconfig.json"
  "apps/web/tsconfig.json"
  "packages/content-studio-domain/tsconfig.json"
  "packages/motion-engine/tsconfig.json"
  "packages/quipsly-capture-verification/tsconfig.json"
  "packages/quipsly-document-kernel/tsconfig.json"
  "packages/quipsly-document-kernel/tsconfig.test.json"
  "packages/quipsly-domain/tsconfig.json"
  "packages/quipsly-media-processing/tsconfig.json"
  "packages/repository-governance/tsconfig.json"
  "packages/studio-cut-schema/tsconfig.json"
  "packages/studio-cut-schema/tsconfig.test.json"
  "packages/studio-domain/tsconfig.json"
  "packages/worldhub-domain/tsconfig.json"
)

if git grep -n -E '(^|[[:space:]])(pnpm[[:space:]]+dlx|npx)[[:space:]]+typescript@' \
  -- .github package.json apps packages scripts >/dev/null; then
  echo "FAIL TypeScript checks must use the package-pinned compiler, not a downloaded shadow compiler." >&2
  git grep -n -E '(^|[[:space:]])(pnpm[[:space:]]+dlx|npx)[[:space:]]+typescript@' \
    -- .github package.json apps packages scripts >&2
  exit 1
fi

while IFS= read -r tracked_project_config; do
  project_is_registered="false"

  for project_config in "${project_configs[@]}"; do
    if [[ "$project_config" == "$tracked_project_config" ]]; then
      project_is_registered="true"
      break
    fi
  done

  if [[ "$project_is_registered" != "true" ]]; then
    echo "FAIL Tracked TypeScript project is not registered in the TypeScript 7 gate: $tracked_project_config" >&2
    exit 1
  fi
done < <(git ls-files 'apps/**/tsconfig*.json' 'packages/**/tsconfig*.json' | sort)

if [[ "${1:-}" == "--list" ]]; then
  printf '%s\n' "${project_configs[@]}"
  exit 0
fi

for project_config in "${project_configs[@]}"; do
  if [[ ! -f "$project_config" ]]; then
    echo "FAIL Missing TypeScript project: $project_config" >&2
    exit 1
  fi

  project_directory="${project_config%/*}"
  project_filename="${project_config##*/}"
  package_manifest="$project_directory/package.json"

  if [[ ! -f "$package_manifest" ]]; then
    echo "FAIL Missing package manifest for $project_config: $package_manifest" >&2
    exit 1
  fi

  declared_typescript_native_specifier="$(
    node -e '
      const manifest = require(`./${process.argv[1]}`);
      process.stdout.write(
        manifest.devDependencies?.["@typescript/native"]
          ?? manifest.dependencies?.["@typescript/native"]
          ?? ""
      );
    ' "$package_manifest"
  )"

  if [[ "$declared_typescript_native_specifier" != "$typescript_native_specifier" ]]; then
    echo "FAIL $package_manifest must pin @typescript/native to $typescript_native_specifier; found '${declared_typescript_native_specifier:-missing}'." >&2
    exit 1
  fi

  declared_typescript_api_specifier="$(
    node -e '
      const manifest = require(`./${process.argv[1]}`);
      process.stdout.write(
        manifest.devDependencies?.typescript
          ?? manifest.dependencies?.typescript
          ?? ""
      );
    ' "$package_manifest"
  )"

  if [[ "$declared_typescript_api_specifier" != "$typescript_api_specifier" ]]; then
    echo "FAIL $package_manifest must pin the compatibility API to $typescript_api_specifier; found '${declared_typescript_api_specifier:-missing}'." >&2
    exit 1
  fi

  installed_typescript_version="$(
    pnpm --dir "$project_directory" exec tsc --version
  )"

  if [[ "$installed_typescript_version" != "Version $typescript_version" ]]; then
    echo "FAIL $project_config resolves $installed_typescript_version instead of Version $typescript_version." >&2
    exit 1
  fi

  uses_next_runtime="$(
    node -e '
      const manifest = require(`./${process.argv[1]}`);
      const scripts = Object.values(manifest.scripts ?? {});
      process.stdout.write(scripts.some((script) => /\bnext (?:dev|build|start)\b/.test(script)) ? "true" : "false");
    ' "$package_manifest"
  )"

  if [[ "$uses_next_runtime" == "true" ]]; then
    echo "Generating Next route types for $project_directory"
    pnpm --dir "$project_directory" exec next typegen
  fi

  echo "Checking $project_config with pinned TypeScript $typescript_version"
  pnpm --dir "$project_directory" exec tsc \
    -p "$project_filename" \
    --noEmit \
    --incremental false
done

echo "PASS ${#project_configs[@]} TypeScript projects pin and pass TypeScript $typescript_version."
