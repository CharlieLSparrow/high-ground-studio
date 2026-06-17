#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-central1}"
SERVICE_NAME="${1:-studio}"

if [[ -z "${SERVICE_NAME}" ]]; then
  echo "Usage: scripts/release/quipsly-logs.sh [service_name] (default: studio)" >&2
  exit 2
fi

echo "Tailing live production logs for Cloud Run service: ${SERVICE_NAME} in ${REGION}..."
echo "Press Ctrl+C to exit."
echo "---"

gcloud run services logs tail "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="$(gcloud config get-value project 2>/dev/null || echo "high-ground-odyssey")"
