#!/usr/bin/env bash
set -e

# Load environment variables
if [ -f .env ]; then
  source .env
fi

if [ -z "$QUIPSLY_MEDIA_BUCKET" ]; then
  echo "Error: QUIPSLY_MEDIA_BUCKET is not set in .env"
  exit 1
fi

echo "Verifying GCP Bucket: $QUIPSLY_MEDIA_BUCKET"

# Check if authenticated
if ! gcloud auth print-access-token &> /dev/null; then
  echo "You are not authenticated with gcloud. Please run:"
  echo "gcloud auth login"
  exit 1
fi

# Check if bucket exists
if gcloud storage ls "gs://$QUIPSLY_MEDIA_BUCKET" &> /dev/null; then
  echo "Bucket gs://$QUIPSLY_MEDIA_BUCKET already exists."
else
  echo "Bucket gs://$QUIPSLY_MEDIA_BUCKET does not exist. Creating..."
  gcloud storage buckets create "gs://$QUIPSLY_MEDIA_BUCKET" --location=US --uniform-bucket-level-access
fi

# Configure CORS for browser upload/playback
cat <<EOF > /tmp/cors.json
[
    {
      "origin": ["*"],
      "method": ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],
      "responseHeader": ["Content-Type", "Authorization", "Content-Length", "User-Agent", "x-goog-resumable"],
      "maxAgeSeconds": 3600
    }
]
EOF

echo "Setting CORS policy on bucket..."
gcloud storage buckets update "gs://$QUIPSLY_MEDIA_BUCKET" --cors-file=/tmp/cors.json
rm /tmp/cors.json

echo "✅ Bucket $QUIPSLY_MEDIA_BUCKET is verified and ready for production ingest."
