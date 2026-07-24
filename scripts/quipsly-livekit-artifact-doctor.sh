#!/usr/bin/env bash
set -euo pipefail

# Diagnose and optionally prefetch the heavy binary artifacts used by LiveKit's
# Swift SDK. Keep this separate from HighGroundCapture until artifact acquisition
# is repeatable; otherwise every iOS build can get stuck on provider SDK setup.
#
# Usage:
#   scripts/quipsly-livekit-artifact-doctor.sh
#   DOWNLOAD=1 scripts/quipsly-livekit-artifact-doctor.sh
#
# Optional env:
#   LIVEKIT_SWIFT_VERSION=2.15.1
#   LIVEKIT_UNIFFI_VERSION=0.0.6
#   LIVEKIT_WEBRTC_VERSION=144.7559.10
#   ARTIFACT_CACHE_DIR="$HOME/Library/Caches/Quipsly/LiveKitArtifacts"
#   CONNECT_TIMEOUT_SECONDS=30
#   ARTIFACT_TIMEOUT_SECONDS=900
#   FORCE_DOWNLOAD=1

LIVEKIT_SWIFT_VERSION="${LIVEKIT_SWIFT_VERSION:-2.15.1}"
LIVEKIT_UNIFFI_VERSION="${LIVEKIT_UNIFFI_VERSION:-0.0.6}"
LIVEKIT_WEBRTC_VERSION="${LIVEKIT_WEBRTC_VERSION:-144.7559.10}"
ARTIFACT_CACHE_DIR="${ARTIFACT_CACHE_DIR:-${HOME}/Library/Caches/Quipsly/LiveKitArtifacts}"
CONNECT_TIMEOUT_SECONDS="${CONNECT_TIMEOUT_SECONDS:-30}"
ARTIFACT_TIMEOUT_SECONDS="${ARTIFACT_TIMEOUT_SECONDS:-900}"
DOWNLOAD="${DOWNLOAD:-0}"
FORCE_DOWNLOAD="${FORCE_DOWNLOAD:-0}"

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required." >&2
  exit 127
fi

mkdir -p "${ARTIFACT_CACHE_DIR}"

declare -a ARTIFACT_NAMES=(
  "LiveKit"
  "RustLiveKitUniFFI"
  "LiveKitWebRTC"
)

declare -a ARTIFACT_URLS=(
  "https://github.com/livekit/client-sdk-swift-xcframework/releases/download/${LIVEKIT_SWIFT_VERSION}/LiveKit.xcframework.zip"
  "https://github.com/livekit/livekit-uniffi-xcframework/releases/download/${LIVEKIT_UNIFFI_VERSION}/RustLiveKitUniFFI.xcframework.zip"
  "https://github.com/livekit/webrtc-xcframework/releases/download/${LIVEKIT_WEBRTC_VERSION}/LiveKitWebRTC.xcframework.zip"
)

echo "Quipsly LiveKit artifact doctor"
echo "cache=${ARTIFACT_CACHE_DIR}"
echo "download=${DOWNLOAD}"
echo "force_download=${FORCE_DOWNLOAD}"
echo "livekit_swift_version=${LIVEKIT_SWIFT_VERSION}"
echo "uniffi_version=${LIVEKIT_UNIFFI_VERSION}"
echo "webrtc_version=${LIVEKIT_WEBRTC_VERSION}"

status=0

for index in "${!ARTIFACT_NAMES[@]}"; do
  name="${ARTIFACT_NAMES[$index]}"
  url="${ARTIFACT_URLS[$index]}"
  filename="${url##*/}"
  target="${ARTIFACT_CACHE_DIR}/${filename}"

  echo
  echo "== ${name} =="
  echo "url=${url}"

  if [[ -s "${target}" ]]; then
    bytes="$(wc -c < "${target}" | tr -d ' ')"
    echo "cached=${target}"
    echo "cached_bytes=${bytes}"
  fi

  echo "checking_headers=1"
  if ! curl \
    --fail \
    --location \
    --silent \
    --show-error \
    --head \
    --connect-timeout "${CONNECT_TIMEOUT_SECONDS}" \
    --max-time 120 \
    "${url}" >/tmp/quipsly-livekit-artifact-headers.txt; then
    echo "ERROR: could not reach artifact headers for ${name}." >&2
    status=1
    continue
  fi

  content_length="$(
    awk 'BEGIN{IGNORECASE=1} /^content-length:/ {value=$2} END{gsub(/\r/, "", value); print value}' \
      /tmp/quipsly-livekit-artifact-headers.txt
  )"
  content_type="$(
    awk 'BEGIN{IGNORECASE=1} /^content-type:/ {value=$0} END{sub(/^[^:]+:[[:space:]]*/, "", value); gsub(/\r/, "", value); print value}' \
      /tmp/quipsly-livekit-artifact-headers.txt
  )"

  echo "headers_ok=1"
  if [[ -n "${content_length}" ]]; then
    echo "content_length=${content_length}"
  fi
  if [[ -n "${content_type}" ]]; then
    echo "content_type=${content_type}"
  fi

  if [[ "${DOWNLOAD}" != "1" ]]; then
    echo "download_skipped=1"
    continue
  fi

  if [[ -s "${target}" && "${FORCE_DOWNLOAD}" != "1" ]]; then
    echo "download_skipped_cached=1"
    continue
  fi

  echo "downloading=${target}"
  partial="${target}.part"
  if curl \
    --fail \
    --location \
    --show-error \
    --continue-at - \
    --retry 3 \
    --retry-delay 5 \
    --connect-timeout "${CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${ARTIFACT_TIMEOUT_SECONDS}" \
    --speed-time 90 \
    --speed-limit 1024 \
    --output "${partial}" \
    "${url}"; then
    mv "${partial}" "${target}"
    bytes="$(wc -c < "${target}" | tr -d ' ')"
    echo "download_ok=1"
    echo "downloaded_bytes=${bytes}"
  else
    echo "ERROR: artifact download failed for ${name}." >&2
    status=1
  fi
done

echo
if [[ "${status}" == "0" ]]; then
  echo "OK: LiveKit artifact diagnostics completed."
else
  echo "ERROR: LiveKit artifact diagnostics found a blocker." >&2
fi

exit "${status}"
