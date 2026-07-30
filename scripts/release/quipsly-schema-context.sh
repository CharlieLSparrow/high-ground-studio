#!/usr/bin/env bash
set -euo pipefail

source_ref="${1:-${SOURCE_REF:-HEAD}}"
output_dir="${2:-}"
context_max_mib="${CONTEXT_MAX_MIB:-30}"

repo_root="$(git rev-parse --show-toplevel)"
source_sha="$(git -C "${repo_root}" rev-parse --verify "${source_ref}^{commit}")"

if [[ -z "${output_dir}" ]]; then
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-schema-${source_sha:0:12}.XXXXXX")"
elif [[ -e "${output_dir}" ]]; then
  if [[ ! -d "${output_dir}" || -n "$(find "${output_dir}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo "Schema context destination must be a new or empty directory: ${output_dir}" >&2
    exit 2
  fi
else
  mkdir -p "${output_dir}"
fi

output_dir="$(cd "${output_dir}" && pwd -P)"

required_paths=(
  .dockerignore
  .gcloudignore
  .npmrc
  cloudbuild.quipsly-schema.yaml
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  prisma.config.ts
  prisma/schema.prisma
  prisma/migrations
  ops/quipsly-schema.Dockerfile
  ops/episode-production-db-push.sql
  ops/quipsly-foundation-additive.sql
  ops/quipsly-foundation-baseline-repair.sql
  ops/quipsly-production-core-additive.sql
  ops/quipsly-coaching-capture-additive.sql
  scripts/quipsly-nest-chat-schema-push.mjs
  scripts/quipsly-production-core-schema-sync.mjs
  scripts/quipsly-coaching-capture-schema-sync.mjs
  scripts/quipsly-foundation-baseline-audit.mjs
  scripts/quipsly-schema-fixture.mjs
  apps/quipsly/package.json
  apps/web/package.json
  apps/motion-lab/package.json
  packages/content-studio-domain/package.json
  packages/quipsly-domain/package.json
  packages/quipsly-document-kernel/package.json
  packages/worldhub-domain/package.json
  packages/studio-domain/package.json
  packages/motion-engine/package.json
)

for path in "${required_paths[@]}"; do
  if ! git -C "${repo_root}" cat-file -e "${source_sha}:${path}" 2>/dev/null; then
    echo "Required schema input is missing at ${source_sha}: ${path}" >&2
    exit 1
  fi
done

git -C "${repo_root}" archive --format=tar "${source_sha}" -- "${required_paths[@]}" \
  | tar -xf - -C "${output_dir}"

inventory_sha="$(
  cd "${output_dir}"
  find . -type f -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 shasum \
    | shasum \
    | awk '{print $1}'
)"

printf '%s\n' \
  '{' \
  '  "schemaVersion": 1,' \
  "  \"sourceSha\": \"${source_sha}\"," \
  "  \"inventorySha1\": \"${inventory_sha}\"" \
  '}' \
  >"${output_dir}/quipsly-schema-source.json"

touch "${output_dir}/.quipsly-schema-context"

read -r context_files context_bytes < <(
  python3 - "${output_dir}" <<'PY'
import os
import sys

count = 0
total = 0
for root, _, files in os.walk(sys.argv[1]):
    for filename in files:
        count += 1
        total += os.path.getsize(os.path.join(root, filename))
print(count, total)
PY
)

if ! python3 - "${context_bytes}" "${context_max_mib}" <<'PY'
import sys

total = int(sys.argv[1])
maximum_mib = float(sys.argv[2])
sys.exit(0 if total <= maximum_mib * 1024 * 1024 else 1)
PY
then
  echo "Quipsly schema context exceeds ${context_max_mib} MiB: ${context_bytes} bytes" >&2
  exit 1
fi

python3 - "${context_bytes}" "${context_files}" "${source_sha}" <<'PY' >&2
import sys

size = int(sys.argv[1]) / 1024 / 1024
print(
    f"Materialized Quipsly schema context: "
    f"{sys.argv[2]} files, {size:.1f} MiB, source {sys.argv[3]}"
)
PY

printf '%s\n' "${output_dir}"
