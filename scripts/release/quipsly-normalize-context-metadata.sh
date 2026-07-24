#!/usr/bin/env bash
set -euo pipefail

CONTEXT_DIR="${1:-/workspace}"
NORMALIZED_RELEASE_MTIME="200001010000.00"

if [[ ! -d "${CONTEXT_DIR}" ]]; then
  echo "Quipsly release context does not exist: ${CONTEXT_DIR}" >&2
  exit 2
fi

context_dir="$(cd "${CONTEXT_DIR}" && pwd -P)"
if [[ "${context_dir}" == "/" || ! -f "${context_dir}/.quipsly-release-context" ]]; then
  echo "Refusing to normalize an unmarked release context: ${context_dir}" >&2
  exit 2
fi

# Cloud Build restamps uploaded source files when it extracts the context.
# Run this both before upload and inside the worker so Kaniko sees stable COPY
# metadata regardless of the source commit or Cloud Build extraction time.
TZ=UTC find "${context_dir}" -exec touch -t "${NORMALIZED_RELEASE_MTIME}" {} +
