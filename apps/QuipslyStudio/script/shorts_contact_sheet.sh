#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
QuipslyStudio shorts contact sheet

Usage:
  script/shorts_contact_sheet.sh /absolute/path/to/short.mp4 [/absolute/output.png]

Purpose:
  Create a six-frame visual review sheet for an exported 9:16 short so humans
  and agents can quickly inspect framing, crop, title-card risk, and obvious
  visual defects before marking keep/refine/reject.
USAGE
}

input="${1:-}"
output="${2:-}"
if [[ -z "$input" || "$input" == "-h" || "$input" == "--help" ]]; then
  usage
  if [[ -z "$input" ]]; then
    exit 2
  fi
  exit 0
fi
if [[ ! -f "$input" ]]; then
  echo "error=missing_input path=$input" >&2
  exit 1
fi
resolve_tool() {
  local tool="$1"
  local env_name="$2"
  local env_value="${!env_name:-}"
  if [[ -n "$env_value" && -x "$env_value" ]]; then
    printf '%s\n' "$env_value"
    return 0
  fi
  if command -v "$tool" >/dev/null 2>&1; then
    command -v "$tool"
    return 0
  fi
  for candidate in "/opt/homebrew/bin/$tool" "/usr/local/bin/$tool"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

ffmpeg_bin="$(resolve_tool ffmpeg FFMPEG_PATH || true)"
ffprobe_bin="$(resolve_tool ffprobe FFPROBE_PATH || true)"
if [[ -z "$ffmpeg_bin" || -z "$ffprobe_bin" ]]; then
  echo "error=ffmpeg_or_ffprobe_missing ffmpeg=${ffmpeg_bin:-missing} ffprobe=${ffprobe_bin:-missing}" >&2
  exit 1
fi
if [[ -z "$output" ]]; then
  base="$(basename "$input")"
  output="${TMPDIR:-/tmp}/${base%.*}-contact-sheet.png"
fi
mkdir -p "$(dirname "$output")"

duration="$("$ffprobe_bin" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$input" | head -n 1)"
rate="$(python3 - "$duration" <<'PY'
import sys
try:
    duration = float(sys.argv[1])
except Exception:
    duration = 0
if duration <= 0:
    print("1")
else:
    print(max(0.05, 6.0 / duration))
PY
)"

"$ffmpeg_bin" -hide_banner -loglevel error -y \
  -i "$input" \
  -vf "fps=${rate},scale=300:-1,tile=3x2:padding=10:margin=10:color=0x101915" \
  -frames:v 1 "$output"

python3 - "$input" "$output" "$duration" <<'PY'
import json
import os
import sys
payload = {
    "status": "generated",
    "input": sys.argv[1],
    "output": sys.argv[2],
    "durationSeconds": float(sys.argv[3]) if sys.argv[3] else 0,
    "reviewUse": "Use this for visual framing/crop/sync sanity only. It does not replace watching/listening before keep/refine/reject.",
    "sourcePolicy": "Reads exported derivative short only; does not touch originals, proxies, or edit metadata.",
}
print(json.dumps(payload, indent=2, sort_keys=True))
PY
