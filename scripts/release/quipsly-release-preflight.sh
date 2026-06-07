#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-central1}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
SERVICE_NAME="${SERVICE_NAME:-studio}"
HOST_HEADER="${HOST_HEADER:-nest.quipsly.com}"
CONTEXT_WARN_MIB="${CONTEXT_WARN_MIB:-150}"

failures=0

pass() {
  printf "PASS %s\n" "$1"
}

warn() {
  printf "WARN %s\n" "$1" >&2
}

fail() {
  printf "FAIL %s\n" "$1" >&2
  failures=$((failures + 1))
}

print_step() {
  printf "\n== %s ==\n" "$1"
}

print_step "Operator config"

if [[ -z "${PROJECT_ID}" ]]; then
  fail "PROJECT_ID is missing and gcloud has no configured project."
else
  pass "Project: ${PROJECT_ID}"
fi

account="$(gcloud config get-value account 2>/dev/null || true)"
if [[ -z "${account}" ]]; then
  fail "No active gcloud account is configured."
else
  pass "Account: ${account}"
fi

print_step "Cloud auth"

if [[ -n "${PROJECT_ID}" ]] && gcloud projects describe "${PROJECT_ID}" --format="value(projectId)" >/dev/null 2>&1; then
  pass "gcloud token can access project ${PROJECT_ID}."
else
  fail "gcloud token cannot access ${PROJECT_ID}. Run: gcloud auth login --no-launch-browser --brief"
fi

print_step "Local git state"

if git diff --quiet && git diff --cached --quiet; then
  pass "Working tree has no uncommitted changes."
else
  warn "Working tree has uncommitted changes. Review before release:"
  git status --short >&2 || true
fi

current_branch="$(git branch --show-current 2>/dev/null || true)"
current_sha="$(git rev-parse --short HEAD 2>/dev/null || true)"
pass "Branch: ${current_branch:-unknown} @ ${current_sha:-unknown}"

if upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
  ahead_behind="$(git rev-list --left-right --count "${upstream}...HEAD" 2>/dev/null || true)"
  pass "Upstream: ${upstream} (${ahead_behind:-unknown})"
else
  warn "No upstream branch is configured yet."
fi

print_step "Release scripts"

for script in \
  scripts/release/quipsly-schema-sync.sh \
  scripts/release/quipsly-deploy-preview.sh \
  scripts/release/quipsly-smoke-preview.sh \
  scripts/release/quipsly-promote-preview.sh \
  scripts/release/quipsly-rollback.sh \
  scripts/release/quipsly-traffic.sh
do
  if [[ -f "${script}" ]]; then
    bash -n "${script}"
    pass "${script} parses."
  else
    fail "Missing release script: ${script}"
  fi
done

print_step "Cloud Build context"

context_list="$(mktemp)"
trap 'rm -f "${context_list}"' EXIT

if gcloud meta list-files-for-upload . >"${context_list}" 2>/dev/null; then
  context_summary="$(
    python3 - "${context_list}" <<'PY'
import os
import sys

count = 0
total = 0
largest = []

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    for raw in handle:
        path = raw.strip()
        if not path or not os.path.isfile(path):
            continue
        size = os.path.getsize(path)
        count += 1
        total += size
        largest.append((size, path))

largest.sort(reverse=True)
print(f"{count}\t{total}\t{total / 1024 / 1024:.1f}")
for size, path in largest[:8]:
    print(f"{size / 1024 / 1024:.1f}\t{path}")
PY
  )"
  context_files="$(printf "%s\n" "${context_summary}" | sed -n '1p' | awk -F '\t' '{print $1}')"
  context_bytes="$(printf "%s\n" "${context_summary}" | sed -n '1p' | awk -F '\t' '{print $2}')"
  context_mib="$(printf "%s\n" "${context_summary}" | sed -n '1p' | awk -F '\t' '{print $3}')"

  pass "Upload context: ${context_files} files, ${context_mib} MiB."

  if python3 - "${context_bytes}" "${CONTEXT_WARN_MIB}" <<'PY'
import sys
total = int(sys.argv[1])
warn_mib = float(sys.argv[2])
sys.exit(0 if total <= warn_mib * 1024 * 1024 else 1)
PY
  then
    :
  else
    warn "Upload context is larger than ${CONTEXT_WARN_MIB} MiB. Largest included files:"
    printf "%s\n" "${context_summary}" | sed -n '2,9p' >&2
  fi
else
  warn "Could not measure Cloud Build upload context with gcloud meta list-files-for-upload."
fi

print_step "Cloud Run service"

if [[ -n "${PROJECT_ID}" ]] && gcloud run services describe "${SERVICE_NAME}" --region="${REGION}" --project="${PROJECT_ID}" --format="value(metadata.name)" >/dev/null 2>&1; then
  pass "Cloud Run service ${SERVICE_NAME} exists in ${REGION}."
else
  fail "Could not describe Cloud Run service ${SERVICE_NAME} in ${REGION}."
fi

print_step "Next release commands"

cat <<EOF
REGION=${REGION} PROJECT_ID=${PROJECT_ID:-<project>} bash scripts/release/quipsly-schema-sync.sh
REGION=${REGION} PROJECT_ID=${PROJECT_ID:-<project>} bash scripts/release/quipsly-deploy-preview.sh
PREVIEW_URL=<preview-url> HOST_HEADER=${HOST_HEADER} bash scripts/release/quipsly-smoke-preview.sh
REGION=${REGION} PROJECT_ID=${PROJECT_ID:-<project>} bash scripts/release/quipsly-promote-preview.sh
EOF

if [[ "${failures}" -gt 0 ]]; then
  printf "\nPreflight failed with %s blocker(s).\n" "${failures}" >&2
  exit 1
fi

printf "\nPreflight passed. Release path is clear.\n"
