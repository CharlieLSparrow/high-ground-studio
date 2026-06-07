#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-studio}"
PREVIEW_TAG="${PREVIEW_TAG:-quipsly-preview}"

echo "Current traffic before promotion:"
scripts/release/quipsly-traffic.sh || true

cat <<EOF

Promoting tag '${PREVIEW_TAG}' to 100% traffic for service '${SERVICE_NAME}' in '${REGION}'.

This assumes the preview revision has already passed smoke checks.
EOF

gcloud run services update-traffic "${SERVICE_NAME}" \
  --region="${REGION}" \
  --to-tags="${PREVIEW_TAG}=100" \
  --quiet

echo "Current traffic after promotion:"
scripts/release/quipsly-traffic.sh
