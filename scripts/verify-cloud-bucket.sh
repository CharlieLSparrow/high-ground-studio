#!/usr/bin/env bash
set -euo pipefail

PRIMARY_MEDIA_VAULT_BUCKET="high-ground-odyssey-media"
MEDIA_VAULT_PREFIXES=(
  "media-vault/raw"
  "media-vault/proxy"
  "media-vault/thumb"
  "media-vault/recordings/livekit"
  "media-vault/recordings/mobile"
  "media-vault/exports"
  "media-vault/packets"
  "media-vault/review"
)

CREATE_BUCKET=0
APPLY_CORS=0
ALLOW_NON_PRIMARY=0
PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
LOCATION="${LOCATION:-US}"
CORS_ORIGINS="${QUIPSLY_CORS_ORIGINS:-https://nest.quipsly.com,https://quipsly.com,http://localhost:3012,http://127.0.0.1:3012}"
BUCKET_REPORT=""
BUCKET_ERROR=""
CORS_FILE=""

cleanup() {
  [[ -z "$BUCKET_REPORT" ]] || rm -f -- "$BUCKET_REPORT"
  [[ -z "$BUCKET_ERROR" ]] || rm -f -- "$BUCKET_ERROR"
  [[ -z "$CORS_FILE" ]] || rm -f -- "$CORS_FILE"
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
Usage: scripts/verify-cloud-bucket.sh [--create] [--apply-cors] [--allow-non-primary]

Dry-run by default. Verifies the Quipsly media-vault bucket contract without
creating buckets, changing CORS, moving objects, or writing marker files.

Flags:
  --create             Create the configured bucket if it is missing.
  --apply-cors         Apply the configured browser upload/playback CORS policy.
  --allow-non-primary  Allow a non-primary media bucket after documenting why.

Policy:
  Primary bucket: gs://high-ground-odyssey-media
  Proxies:        media-vault/proxy/...
  Recordings:     media-vault/recordings/livekit/... and media-vault/recordings/mobile/...

Buckets store bytes. Quipsly/Nest records own meaning, access, attachment,
review, publishing readiness, and receipts.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --create)
      CREATE_BUCKET=1
      ;;
    --apply-cors)
      APPLY_CORS=1
      ;;
    --allow-non-primary)
      ALLOW_NON_PRIMARY=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

# Read only the two supported values. Never source arbitrary repository-local
# shell from .env in a release or infrastructure helper.
load_dotenv_key() {
  local key="$1"
  local line value
  if [[ -n "${!key:-}" || ! -f .env ]]; then
    return 0
  fi
  line="$(grep -E "^${key}=" .env | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 0
  fi
  value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  export "$key=$value"
}

load_dotenv_key "QUIPSLY_MEDIA_BUCKET"
load_dotenv_key "LIVEKIT_EGRESS_GCS_BUCKET"

QUIPSLY_MEDIA_BUCKET="${QUIPSLY_MEDIA_BUCKET:-$PRIMARY_MEDIA_VAULT_BUCKET}"
LIVEKIT_EGRESS_GCS_BUCKET="${LIVEKIT_EGRESS_GCS_BUCKET:-}"

echo "Quipsly media-vault bucket verification"
echo "Project: $PROJECT_ID"
echo "Configured media bucket: gs://$QUIPSLY_MEDIA_BUCKET"
echo "Primary policy bucket:   gs://$PRIMARY_MEDIA_VAULT_BUCKET"
echo "Mutation mode: create=$CREATE_BUCKET apply-cors=$APPLY_CORS"
echo

if [[ "$QUIPSLY_MEDIA_BUCKET" != "$PRIMARY_MEDIA_VAULT_BUCKET" && "$ALLOW_NON_PRIMARY" != "1" ]]; then
  cat >&2 <<EOF
ERROR: QUIPSLY_MEDIA_BUCKET points at gs://$QUIPSLY_MEDIA_BUCKET, but the current
Quipsly media-vault policy points at gs://$PRIMARY_MEDIA_VAULT_BUCKET.

Do not upload proxy or recording bytes into a different bucket unless this is an
intentional IAM, lifecycle, billing, residency, or compliance split.

Pass --allow-non-primary only after documenting that migration decision.
EOF
  exit 1
fi

if [[ -n "$LIVEKIT_EGRESS_GCS_BUCKET" && "$LIVEKIT_EGRESS_GCS_BUCKET" != "$QUIPSLY_MEDIA_BUCKET" ]]; then
  cat >&2 <<EOF
WARNING: LIVEKIT_EGRESS_GCS_BUCKET points at gs://$LIVEKIT_EGRESS_GCS_BUCKET while
QUIPSLY_MEDIA_BUCKET points at gs://$QUIPSLY_MEDIA_BUCKET.

That can be valid, but it means room recordings and editor proxies are split
across buckets. Prefer the same media-vault bucket unless the split is explicit.
EOF
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "ERROR: gcloud is not installed or not on PATH." >&2
  exit 1
fi

if ! gcloud auth print-access-token >/dev/null 2>&1; then
  cat >&2 <<'EOF'
ERROR: gcloud cannot mint an access token.

Run:
  gcloud auth login --update-adc --brief
  gcloud auth application-default set-quota-project quipsly-reef
  bash scripts/release/quipsly-gcloud-auth-check.sh

Then re-run this script. No bucket mutation was attempted.
EOF
  exit 1
fi

BUCKET_URI="gs://$QUIPSLY_MEDIA_BUCKET"
BUCKET_REPORT="$(mktemp -t quipsly-media-bucket.XXXXXX.json)"
BUCKET_ERROR="$(mktemp -t quipsly-media-bucket.XXXXXX.err)"

if gcloud storage buckets describe "$BUCKET_URI" \
  --project="$PROJECT_ID" \
  --format=json >"$BUCKET_REPORT" 2>"$BUCKET_ERROR"; then
  echo "PASS Bucket exists: $BUCKET_URI"
else
  echo "Bucket does not exist or is not accessible: $BUCKET_URI" >&2
  cat "$BUCKET_ERROR" >&2 || true
  if [[ "$CREATE_BUCKET" != "1" ]]; then
    cat >&2 <<EOF
Refusing to mutate bucket in dry-run mode.

If this bucket should be created, run:
  PROJECT_ID=$PROJECT_ID LOCATION=$LOCATION scripts/verify-cloud-bucket.sh --create
EOF
    exit 1
  fi
  echo "Creating $BUCKET_URI in $LOCATION with uniform bucket-level access..."
  gcloud storage buckets create "$BUCKET_URI" \
    --project="$PROJECT_ID" \
    --location="$LOCATION" \
    --uniform-bucket-level-access
  echo "Created bucket. Reading it back before reporting success..."
  gcloud storage buckets describe "$BUCKET_URI" \
    --project="$PROJECT_ID" \
    --format=json >"$BUCKET_REPORT"
fi

echo
echo "Expected media-vault prefixes:"
for prefix in "${MEDIA_VAULT_PREFIXES[@]}"; do
  echo "  - $prefix/"
done
echo
echo "Note: GCS has no real folders. Empty prefixes are valid until a workflow writes objects."

if [[ "$APPLY_CORS" == "1" ]]; then
  CORS_FILE="$(mktemp -t quipsly-media-vault-cors.XXXXXX.json)"
  CORS_ORIGINS="$CORS_ORIGINS" python3 - "$CORS_FILE" <<'PY'
import json
import os
import sys
from urllib.parse import urlparse

origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "").split(",")
    if origin.strip()
]
if not origins:
    raise SystemExit("No CORS origins configured.")
if "*" in origins:
    raise SystemExit("Wildcard CORS origins are not allowed.")

for origin in origins:
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path not in {"", "/"}:
        raise SystemExit(f"Invalid origin: {origin}")

payload = [{
    "origin": origins,
    "method": ["GET", "HEAD", "PUT", "POST", "OPTIONS"],
    "responseHeader": [
        "Content-Type",
        "Authorization",
        "Content-Length",
        "Content-Range",
        "User-Agent",
        "x-goog-if-generation-match",
        "x-goog-resumable",
    ],
    "maxAgeSeconds": 3600,
}]

with open(sys.argv[1], "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
PY
  echo "Applying CORS to $BUCKET_URI for origins: $CORS_ORIGINS"
  gcloud storage buckets update "$BUCKET_URI" \
    --project="$PROJECT_ID" \
    --cors-file="$CORS_FILE"
  echo "Applied CORS. Reading back the bucket before reporting success..."
  gcloud storage buckets describe "$BUCKET_URI" \
    --project="$PROJECT_ID" \
    --format=json >"$BUCKET_REPORT"
else
  echo "Dry-run: not changing CORS. To apply, run with --apply-cors."
fi

echo
echo "PASS Media-vault bucket contract is ready for proxy, recording, export, packet, and review workflows."
echo "PASS Proxy files should use:        $BUCKET_URI/media-vault/proxy/..."
echo "PASS LiveKit recordings should use: $BUCKET_URI/media-vault/recordings/livekit/..."
echo "PASS Mobile recordings should use:  $BUCKET_URI/media-vault/recordings/mobile/..."
