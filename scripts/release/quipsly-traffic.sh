#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-studio}"

gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --format='table(status.traffic[].revisionName,status.traffic[].tag,status.traffic[].percent,status.traffic[].url)'
