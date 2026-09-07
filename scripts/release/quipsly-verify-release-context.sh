#!/usr/bin/env bash
set -euo pipefail

context="${1:-}"
if [[ -z "${context}" || ! -d "${context}" ]]; then
  echo "Usage: $0 <fresh-materialized-nest-context>" >&2
  exit 2
fi
context="$(cd "${context}" && pwd -P)"
if [[ "${context}" == / || ! -f "${context}/.quipsly-release-context" ]]; then
  echo "Refusing an unmarked Nest release context." >&2
  exit 2
fi

# Match the inventory produced by materialize-release-context.sh. Run before
# installing dependencies: generated files must not become release inputs. The
# regular preflight already materializes a fresh context on every invocation.
# This detects accidental drift, not a maliciously rewritten receipt.
receipt="$(node - "${context}/quipsly-release-source.json" <<'NODE'
const fs = require('node:fs');
try {
  const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (value.schemaVersion !== 1 || value.releaseId !== 'nest'
      || value.releaseManifest !== 'release/manifests/nest.json'
      || !/^[a-f0-9]{40}$/.test(value.sourceSha)
      || !/^[a-f0-9]{40}$/.test(value.inventorySha1)) {
    throw new Error('invalid source identity or inventory');
  }
  console.log(`${value.sourceSha} ${value.inventorySha1}`);
} catch {
  console.error('Nest release receipt is missing or invalid. Materialize the intended commit again.');
  process.exitCode = 1;
}
NODE
)"
read -r source_sha expected_inventory <<<"${receipt}"

# The materializer currently emits regular source files. A symlink could
# otherwise substitute an unmeasured external input because find -type f skips
# it. Dependency symlinks also identify an already-used build directory.
if [[ -n "$(find "${context}" -type l -print -quit)" ]]; then
  echo "Nest release context contains symlinks or installed dependencies. Materialize a fresh context before building." >&2
  exit 1
fi

actual_inventory="$(
  cd "${context}"
  find . -type f \
    ! -path './quipsly-release-source.json' \
    ! -path './.quipsly-release-context' -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 shasum \
    | shasum \
    | awk '{print $1}'
)"
if [[ "${actual_inventory}" != "${expected_inventory}" ]]; then
  echo "Nest release inputs differ from the materialized commit ${source_sha}." >&2
  echo "A source file was changed, added, or removed, or this directory already contains build outputs. Materialize the intended commit again; the build was not started." >&2
  exit 1
fi
echo "PASS Nest release input bytes match the materialized source ${source_sha}."
