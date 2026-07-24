#!/usr/bin/env bash
set -euo pipefail

SOURCE_REF="${1:-${SOURCE_REF:-HEAD}}"
OUTPUT_DIR="${2:-}"
NORMALIZED_RELEASE_MTIME_UTC="2000-01-01T00:00:00Z"
RELEASE_MANIFEST_PATH="release/manifests/nest.json"

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

if ! git -C "${repo_root}" cat-file -e "${source_sha}:${RELEASE_MANIFEST_PATH}" 2>/dev/null; then
  echo "Nest release manifest is missing at ${source_sha}: ${RELEASE_MANIFEST_PATH}" >&2
  exit 1
fi

required_paths=()
optional_paths=()
manifest_max_mib=""
while IFS=$'\t' read -r record_kind record_value; do
  case "${record_kind}" in
    maxMiB)
      manifest_max_mib="${record_value}"
      ;;
    required)
      required_paths+=("${record_value}")
      ;;
    optional)
      optional_paths+=("${record_value}")
      ;;
    *)
      echo "Unexpected Nest release manifest record: ${record_kind}" >&2
      exit 1
      ;;
  esac
done < <(
  git -C "${repo_root}" show "${source_sha}:${RELEASE_MANIFEST_PATH}" \
    | node -e '
      const fs = require("node:fs");
      const manifest = JSON.parse(fs.readFileSync(0, "utf8"));
      if (manifest.schemaVersion !== 1 || manifest.id !== "nest") {
        throw new Error("Expected the Nest release manifest schema v1.");
      }
      const context = manifest.releaseContext;
      if (
        !context
        || typeof context.maxMiB !== "number"
        || context.maxMiB <= 0
        || !Array.isArray(context.requiredPaths)
        || context.requiredPaths.length === 0
        || !Array.isArray(context.optionalPaths)
      ) {
        throw new Error("Nest releaseContext is missing or invalid.");
      }
      const checkedPaths = (kind, values) => values.map((value) => {
        if (
          typeof value !== "string"
          || value.length === 0
          || /[\u0000\r\n\t]/.test(value)
          || value.startsWith("/")
          || value.split("/").includes("..")
        ) {
          throw new Error(`Unsafe ${kind} release path: ${JSON.stringify(value)}`);
        }
        return value;
      });
      const required = checkedPaths("required", context.requiredPaths);
      const optional = checkedPaths("optional", context.optionalPaths);
      process.stdout.write(`maxMiB\t${context.maxMiB}\n`);
      for (const value of required) process.stdout.write(`required\t${value}\n`);
      for (const value of optional) process.stdout.write(`optional\t${value}\n`);
    '
)

if [[ -z "${manifest_max_mib}" || "${#required_paths[@]}" -eq 0 ]]; then
  echo "Nest release manifest did not provide a usable release context." >&2
  exit 1
fi
CONTEXT_MAX_MIB="${CONTEXT_MAX_MIB:-${manifest_max_mib}}"

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
  "releaseManifest": "${RELEASE_MANIFEST_PATH}",
  "sourceSha": "${source_sha}",
  "inventorySha1": "${inventory_sha}",
  "normalizedMtimeUtc": "${NORMALIZED_RELEASE_MTIME_UTC}"
}
EOF

touch "${output_dir}/.quipsly-release-context"

# git archive assigns the source commit's timestamp to every extracted path.
# Cloud Build also restamps uploaded source when it extracts the context. This
# first pass stabilizes local proof; cloudbuild.quipsly-web.yaml repeats it in
# the worker before BuildKit imports the context and evaluates cache keys.
bash "${repo_root}/scripts/release/quipsly-normalize-context-metadata.sh" \
  "${output_dir}"

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
