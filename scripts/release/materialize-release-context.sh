#!/usr/bin/env bash
set -euo pipefail

RELEASE_ID="${1:-}"
SOURCE_REF="${2:-${SOURCE_REF:-HEAD}}"
OUTPUT_DIR="${3:-}"
NORMALIZED_RELEASE_MTIME_UTC="2000-01-01T00:00:00Z"

if [[ ! "${RELEASE_ID}" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "Release id must be a lowercase manifest id: ${RELEASE_ID:-<missing>}" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
source_sha="$(git -C "${repo_root}" rev-parse --verify "${SOURCE_REF}^{commit}")"
release_manifest_path="release/manifests/${RELEASE_ID}.json"

if ! git -C "${repo_root}" cat-file -e "${source_sha}:${release_manifest_path}" 2>/dev/null; then
  echo "Release manifest is missing at ${source_sha}: ${release_manifest_path}" >&2
  exit 1
fi

required_paths=()
optional_paths=()
optional_path_count=0
manifest_max_mib=""
receipt_filename=""
while IFS=$'\t' read -r record_kind record_value; do
  case "${record_kind}" in
    maxMiB)
      manifest_max_mib="${record_value}"
      ;;
    receipt)
      receipt_filename="${record_value}"
      ;;
    required)
      required_paths+=("${record_value}")
      ;;
    optional)
      optional_paths+=("${record_value}")
      optional_path_count=$((optional_path_count + 1))
      ;;
    *)
      echo "Unexpected release manifest record: ${record_kind}" >&2
      exit 1
      ;;
  esac
done < <(
  git -C "${repo_root}" show "${source_sha}:${release_manifest_path}" \
    | RELEASE_ID_FOR_CONTEXT="${RELEASE_ID}" node -e '
      const fs = require("node:fs");
      const manifest = JSON.parse(fs.readFileSync(0, "utf8"));
      if (manifest.schemaVersion !== 1 || manifest.id !== process.env.RELEASE_ID_FOR_CONTEXT) {
        throw new Error(`Expected ${process.env.RELEASE_ID_FOR_CONTEXT} release manifest schema v1.`);
      }
      const context = manifest.releaseContext;
      if (
        !context
        || typeof context.maxMiB !== "number"
        || !Number.isFinite(context.maxMiB)
        || context.maxMiB <= 0
        || !Array.isArray(context.requiredPaths)
        || context.requiredPaths.length === 0
        || !Array.isArray(context.optionalPaths)
      ) {
        throw new Error(`${manifest.id} releaseContext is missing or invalid.`);
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
      const receipt = manifest.artifact?.provenanceReceipt;
      if (
        typeof receipt !== "string"
        || !/^[a-z0-9][a-z0-9-]*\.json$/.test(receipt)
      ) {
        throw new Error(`${manifest.id} must declare a JSON provenance receipt filename.`);
      }
      process.stdout.write(`maxMiB\t${context.maxMiB}\n`);
      process.stdout.write(`receipt\t${receipt}\n`);
      for (const value of required) process.stdout.write(`required\t${value}\n`);
      for (const value of optional) process.stdout.write(`optional\t${value}\n`);
    '
)

if [[ -z "${manifest_max_mib}" ]] \
  || [[ -z "${receipt_filename}" ]] \
  || [[ "${#required_paths[@]}" -eq 0 ]]; then
  echo "${RELEASE_ID} manifest did not provide a usable release context." >&2
  exit 1
fi
context_max_mib="${CONTEXT_MAX_MIB:-${manifest_max_mib}}"
context_max_mib="$(
  node -e '
    const value = Number(process.argv[1]);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("CONTEXT_MAX_MIB must be a positive number.");
    }
    process.stdout.write(String(value));
  ' "${context_max_mib}"
)"

if [[ -z "${OUTPUT_DIR}" ]]; then
  OUTPUT_DIR="$(
    mktemp -d "${TMPDIR:-/tmp}/${RELEASE_ID}-release-${source_sha:0:12}.XXXXXX"
  )"
elif [[ -e "${OUTPUT_DIR}" ]]; then
  if [[ ! -d "${OUTPUT_DIR}" ]] \
    || [[ -n "$(find "${OUTPUT_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo "Release context destination must be a new or empty directory: ${OUTPUT_DIR}" >&2
    exit 2
  fi
else
  mkdir -p "${OUTPUT_DIR}"
fi

output_dir="$(cd "${OUTPUT_DIR}" && pwd -P)"

for required_path in "${required_paths[@]}"; do
  if ! git -C "${repo_root}" cat-file -e "${source_sha}:${required_path}" 2>/dev/null; then
    echo "Required ${RELEASE_ID} release input is missing at ${source_sha}: ${required_path}" >&2
    exit 1
  fi
done

archive_paths=("${required_paths[@]}")
if [[ "${optional_path_count}" -gt 0 ]]; then
  for optional_path in "${optional_paths[@]}"; do
    if git -C "${repo_root}" cat-file -e "${source_sha}:${optional_path}" 2>/dev/null; then
      archive_paths+=("${optional_path}")
    fi
  done
fi

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

cat >"${output_dir}/${receipt_filename}" <<EOF
{
  "schemaVersion": 1,
  "releaseId": "${RELEASE_ID}",
  "releaseManifest": "${release_manifest_path}",
  "sourceSha": "${source_sha}",
  "inventorySha1": "${inventory_sha}",
  "normalizedMtimeUtc": "${NORMALIZED_RELEASE_MTIME_UTC}",
  "contextMaxMiB": ${context_max_mib}
}
EOF

touch "${output_dir}/.quipsly-release-context"
bash "${repo_root}/scripts/release/quipsly-normalize-context-metadata.sh" \
  "${output_dir}"

read -r context_files context_bytes < <(
  node - "${output_dir}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

let count = 0;
let total = 0;
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(entryPath);
    if (entry.isFile()) {
      count += 1;
      total += fs.statSync(entryPath).size;
    }
  }
};
visit(process.argv[2]);
process.stdout.write(`${count} ${total}\n`);
NODE
)

if ! node - "${context_bytes}" "${context_max_mib}" <<'NODE'
const totalBytes = Number(process.argv[2]);
const maximumMiB = Number(process.argv[3]);
if (
  !Number.isFinite(totalBytes)
  || !Number.isFinite(maximumMiB)
  || maximumMiB <= 0
  || totalBytes > maximumMiB * 1024 * 1024
) {
  process.exitCode = 1;
}
NODE
then
  echo "${RELEASE_ID} release context exceeds ${context_max_mib} MiB: ${context_bytes} bytes" >&2
  exit 1
fi

node - "${context_bytes}" "${context_files}" "${source_sha}" "${RELEASE_ID}" <<'NODE' >&2
const size = Number(process.argv[2]) / 1024 / 1024;
console.error(
  `Materialized ${process.argv[5]} release context: `
  + `${process.argv[3]} files, ${size.toFixed(1)} MiB, source ${process.argv[4]}`,
);
NODE

printf '%s\n' "${output_dir}"
