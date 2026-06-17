#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${TMPDIR:-/tmp}/quipsly-episode1-visual-export-smoke"
HORIZONTAL_OUT="$OUT_DIR/episode1-visual-16x9-proof.mp4"
VERTICAL_OUT="$OUT_DIR/episode1-visual-9x16-proof.mp4"
MAX_DURATION="${QUIPSLY_VISUAL_EXPORT_SMOKE_DURATION:-8}"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

render() {
  local format="$1"
  local output="$2"
  "$ROOT_DIR/script/render_episode1_visual_proxy_export.sh" \
    --format "$format" \
    --max-duration "$MAX_DURATION" \
    --output "$output" \
    --json
}

horizontal_json="$(render horizontal16x9 "$HORIZONTAL_OUT")"
vertical_json="$(render vertical9x16 "$VERTICAL_OUT")"

python3 - "$horizontal_json" "$vertical_json" "$HORIZONTAL_OUT" "$VERTICAL_OUT" <<'PY'
import json
import pathlib
import sys

horizontal = json.loads(sys.argv[1])
vertical = json.loads(sys.argv[2])
horizontal_out = pathlib.Path(sys.argv[3])
vertical_out = pathlib.Path(sys.argv[4])

errors = []

def stream_size(summary):
    for stream in summary.get("probe", {}).get("streams", []):
        if stream.get("codec_type") == "video":
            return stream.get("width"), stream.get("height")
    return None, None

def has_audio(summary):
    return any(stream.get("codec_type") == "audio" for stream in summary.get("probe", {}).get("streams", []))

def check_common(label, summary, output_path):
    if summary.get("status") != "rendered":
        errors.append(f"{label}: status should be rendered, got {summary.get('status')!r}")
    if not output_path.is_file():
        errors.append(f"{label}: missing output {output_path}")
    if summary.get("audioIncluded") is not False:
        errors.append(f"{label}: audioIncluded should be false")
    if summary.get("usesProxyPlaybackOnly") is not True:
        errors.append(f"{label}: usesProxyPlaybackOnly should be true")
    if summary.get("renderedDurationSeconds", 0) <= 0:
        errors.append(f"{label}: rendered duration should be positive")
    if has_audio(summary):
        errors.append(f"{label}: smoke output should not contain audio until real audio proxies exist")

check_common("horizontal", horizontal, horizontal_out)
check_common("vertical", vertical, vertical_out)

horizontal_size = stream_size(horizontal)
vertical_size = stream_size(vertical)
if horizontal_size != (1280, 720):
    errors.append(f"horizontal: expected 1280x720, got {horizontal_size}")
if vertical_size != (720, 1280):
    errors.append(f"vertical: expected 720x1280, got {vertical_size}")

summary = {
    "horizontal": {
        "output": str(horizontal_out),
        "size": horizontal_size,
        "duration": horizontal.get("renderedDurationSeconds"),
        "segments": horizontal.get("renderedSegmentCount"),
    },
    "vertical": {
        "output": str(vertical_out),
        "size": vertical_size,
        "duration": vertical.get("renderedDurationSeconds"),
        "segments": vertical.get("renderedSegmentCount"),
    },
    "audioIncluded": False,
    "usesProxyPlaybackOnly": True,
    "nonDestructiveInvariant": "Both outputs are rendered from proxy playback paths and output-plan metadata; no source lanes were chopped or mutated.",
}

print(json.dumps(summary, indent=2))

if errors:
    print("\nEpisode 1 visual proxy export smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)

print("\nEpisode 1 visual proxy export smoke PASSED.")
PY
