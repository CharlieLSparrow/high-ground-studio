#!/bin/bash
# HighGroundOdyssey GCS Media Sync Script
# Uploads downloaded Insta360 footage from the external hard drive to Google Cloud Storage.

EXT_DIR="/Volumes/My Passport/Insta360 Download"
GCS_BUCKET="gs://high-ground-raw-footage"
KEY_FILE="/Users/wall-e/Dev/high-ground-studio/apps/local-engine/gcs-key.json"

echo "🚀 Starting HighGroundOdyssey GCS Media Sync"
echo "================================================="
echo "Source: $EXT_DIR"
echo "Destination: $GCS_BUCKET"
echo "================================================="

# 1. Ensure external drive is mounted
if [ ! -d "$EXT_DIR" ]; then
  echo "❌ Error: External drive folder not found at '$EXT_DIR'."
  echo "Please make sure your 'My Passport' drive is plugged in and try again."
  exit 1
fi

# 2. Authenticate using service account if needed
if [ -f "$KEY_FILE" ]; then
  echo "🔑 Authenticating with Google Cloud Storage key..."
  gcloud auth activate-service-account --key-file="$KEY_FILE"
else
  echo "⚠️ Warning: GCS key file not found at $KEY_FILE. Attempting sync with existing credentials..."
fi

# 3. Perform parallel rsync
echo "🔄 Syncing files to $GCS_BUCKET..."
gsutil -m rsync -r -x "^\..*$" "$EXT_DIR" "$GCS_BUCKET"

if [ $? -eq 0 ]; then
  echo "================================================="
  echo "✅ Sync complete! All files uploaded successfully."
else
  echo "❌ Sync failed. Please check your network connection and try again."
  exit 1
fi
