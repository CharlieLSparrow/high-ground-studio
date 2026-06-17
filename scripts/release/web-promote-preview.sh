#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="web"
TAG_NAME="web-preview"

echo "Promoting ${SERVICE_NAME} preview to 100% live traffic..."

gcloud run services update-traffic "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --to-tags="${TAG_NAME}=100" \
  --quiet

echo "Successfully shifted 100% of live traffic to the preview revision."
