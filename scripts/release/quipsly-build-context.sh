#!/usr/bin/env bash
set -euo pipefail

SOURCE_REF="${1:-${SOURCE_REF:-HEAD}}"
OUTPUT_DIR="${2:-}"
CONTEXT_MAX_MIB="${CONTEXT_MAX_MIB:-300}"
NORMALIZED_RELEASE_MTIME="200001010000.00"
NORMALIZED_RELEASE_MTIME_UTC="2000-01-01T00:00:00Z"

repo_root="$(git rev-parse --show-toplevel)"
source_sha="$(git -C "${repo_root}" rev-parse --verify "${SOURCE_REF}^{commit}")"

if [[ -z "${OUTPUT_DIR}" ]]; then
  OUTPUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-release-${source_sha:0:12}.XXXXXX")"
elif [[ -e "${OUTPUT_DIR}" ]]; then
  if [[ ! -d "${OUTPUT_DIR}" || -n "$(find "${OUTPUT_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo "Release context destination must be a new or empty directory: ${OUTPUT_DIR}" >&2
    exit 2
  fi
else
  mkdir -p "${OUTPUT_DIR}"
fi

output_dir="$(cd "${OUTPUT_DIR}" && pwd -P)"

required_paths=(
  .dockerignore
  .gcloudignore
  .npmrc
  cloudbuild.quipsly-web.yaml
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  prisma.config.ts
  apps/quipsly
  packages/content-studio-domain
  packages/quipsly-document-kernel
  packages/quipsly-domain
  packages/studio-domain
  prisma
  scripts/quipsly-owner-override-retirement.test.mjs
  scripts/release
  scripts/scan-beta-blockers.mjs
  scripts/sync-prisma-pnpm-clients.mjs
  docs/coordination/BETA-MANIFEST.md
  apps/web/content/publish/hgo-episodes/episode-1-write-it-down.json
  apps/web/content/publish/hgo-episodes/episode-2-look-for-lessons.json
  apps/web/content/publish/hgo-episodes/episode-3-chub-and-jack.json
)

optional_paths=(
  docs/coordination/antigravity-reports
)

for path in "${required_paths[@]}"; do
  if ! git -C "${repo_root}" cat-file -e "${source_sha}:${path}" 2>/dev/null; then
    echo "Required Quipsly release input is missing at ${source_sha}: ${path}" >&2
    exit 1
  fi
done

archive_paths=("${required_paths[@]}")
for path in "${optional_paths[@]}"; do
  if git -C "${repo_root}" cat-file -e "${source_sha}:${path}" 2>/dev/null; then
    archive_paths+=("${path}")
  fi
done

git -C "${repo_root}" archive --format=tar "${source_sha}" -- "${archive_paths[@]}" \
  | tar -xf - -C "${output_dir}"

inventory_sha="$(
  cd "${output_dir}"
  find . -type f -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 shasum \
    | shasum \
    | awk '{print $1}'
)"

cat >"${output_dir}/quipsly-release-source.json" <<EOF
{
  "schemaVersion": 1,
  "sourceSha": "${source_sha}",
  "inventorySha1": "${inventory_sha}",
  "normalizedMtimeUtc": "${NORMALIZED_RELEASE_MTIME_UTC}"
}
EOF

touch "${output_dir}/.quipsly-release-context"

# git archive assigns the source commit's timestamp to every extracted path.
# Normalize metadata after writing our generated files so unchanged Docker COPY
# inputs retain identical Kaniko cache keys across different source commits.
TZ=UTC find "${output_dir}" -exec touch -t "${NORMALIZED_RELEASE_MTIME}" {} +

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

if ! python3 - "${context_bytes}" "${CONTEXT_MAX_MIB}" <<'PY'
import sys

total = int(sys.argv[1])
maximum_mib = float(sys.argv[2])
sys.exit(0 if total <= maximum_mib * 1024 * 1024 else 1)
PY
then
  echo "Quipsly release context exceeds ${CONTEXT_MAX_MIB} MiB: ${context_bytes} bytes" >&2
  exit 1
fi

python3 - "${context_bytes}" "${context_files}" "${source_sha}" <<'PY' >&2
import sys

size = int(sys.argv[1]) / 1024 / 1024
print(
    f"Materialized Quipsly release context: "
    f"{sys.argv[2]} files, {size:.1f} MiB, source {sys.argv[3]}"
)
PY

printf '%s\n' "${output_dir}"
