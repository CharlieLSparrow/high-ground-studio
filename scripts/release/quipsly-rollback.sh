#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-studio}"
ROLLBACK_REVISION="${1:-${ROLLBACK_REVISION:-}}"

if [[ -z "${ROLLBACK_REVISION}" ]]; then
  cat >&2 <<'USAGE'
Usage:
  ROLLBACK_REVISION=studio-00042-abc scripts/release/quipsly-rollback.sh
  scripts/release/quipsly-rollback.sh studio-00042-abc

Current traffic:
USAGE
  scripts/release/quipsly-traffic.sh >&2 || true
  exit 2
fi

echo "Current traffic before rollback:"
scripts/release/quipsly-traffic.sh || true

echo "Rolling ${SERVICE_NAME} in ${REGION} back to revision ${ROLLBACK_REVISION}"
gcloud run services update-traffic "${SERVICE_NAME}" \
  --region="${REGION}" \
  --to-revisions="${ROLLBACK_REVISION}=100" \
  --quiet

echo "Current traffic after rollback:"
scripts/release/quipsly-traffic.sh
