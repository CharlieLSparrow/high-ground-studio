#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Render Quipsly audio-stage candidates from one already-synced stem.

Usage:
  audio_stage_render.sh --input INPUT.wav --out-dir DIR [--label homer]

Outputs equal-duration WAV stage candidates:
  01-raw-synced.wav
  02-clean.wav
  03-contribution-gate.wav
  04-presence.wav
  05-delivery-preview.wav
  stage-manifest.json

This tool is non-destructive. It never alters INPUT.
HELP
}

INPUT=""
OUT_DIR=""
LABEL="stem"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --input) INPUT="${2:-}"; shift 2 ;;
    --out-dir) OUT_DIR="${2:-}"; shift 2 ;;
    --label) LABEL="${2:-stem}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$INPUT" || -z "$OUT_DIR" ]]; then
  usage >&2
  exit 2
fi
if [[ ! -f "$INPUT" ]]; then
  echo "Input file not found: $INPUT" >&2
  exit 1
fi
command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe not found" >&2; exit 1; }

mkdir -p "$OUT_DIR"

raw_filter="aresample=48000,aformat=channel_layouts=mono"
clean_filter="aresample=48000,aformat=channel_layouts=mono,highpass=f=80,lowpass=f=16000,afftdn=nf=-22"
contribution_filter="${clean_filter},agate=threshold=0.0018:ratio=1.35:attack=8:release=900:makeup=1.15"
presence_filter="${clean_filter},acompressor=threshold=-25dB:ratio=1.9:attack=10:release=220:makeup=2,equalizer=f=160:t=q:w=1:g=1.2,equalizer=f=3200:t=q:w=1:g=2.2,equalizer=f=6500:t=q:w=1:g=1.0,alimiter=limit=0.90"
delivery_filter="${presence_filter},loudnorm=I=-16:TP=-1.8:LRA=11"

render() {
  local name="$1"
  local filter="$2"
  local output="$OUT_DIR/$name"
  if ! ffmpeg -hide_banner -loglevel error -y -i "$INPUT" -af "$filter" -ar 48000 -ac 1 -c:a pcm_s24le "$output"; then
    echo "Failed rendering stage $name with filter: $filter" >&2
    exit 1
  fi
  printf '%s\n' "$output"
}

RAW=$(render "01-${LABEL}-raw-synced.wav" "$raw_filter")
CLEAN=$(render "02-${LABEL}-clean.wav" "$clean_filter")
CONTRIBUTION=$(render "03-${LABEL}-contribution-gate.wav" "$contribution_filter")
PRESENCE=$(render "04-${LABEL}-presence.wav" "$presence_filter")
DELIVERY=$(render "05-${LABEL}-delivery-preview.wav" "$delivery_filter")

manifest="$OUT_DIR/stage-manifest.json"
python3 - "$manifest" "$LABEL" "$INPUT" \
  "01" "raw-synced" "$RAW" "$raw_filter" \
  "02" "clean" "$CLEAN" "$clean_filter" \
  "03" "contribution-gate" "$CONTRIBUTION" "$contribution_filter" \
  "04" "presence" "$PRESENCE" "$presence_filter" \
  "05" "delivery-preview" "$DELIVERY" "$delivery_filter" <<'PY'
import datetime
import json
import subprocess
import sys

manifest_path, label, input_path, *raw_stage_args = sys.argv[1:]
stages = []
for index in range(0, len(raw_stage_args), 4):
    stage_id, title, path, filter_graph = raw_stage_args[index:index + 4]
    try:
        duration_text = subprocess.check_output(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=nw=1:nk=1",
                path,
            ],
            text=True,
        ).strip()
        duration = float(duration_text)
    except Exception:
        duration = 0.0
    stages.append(
        {
            "id": stage_id,
            "title": title,
            "path": path,
            "durationSeconds": duration,
            "filter": filter_graph,
        }
    )

with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "schema": "quipsly.audioStageCandidates.v1",
            "label": label,
            "input": input_path,
            "generatedAt": datetime.datetime.now().isoformat(),
            "stages": stages,
        },
        handle,
        indent=2,
    )
    handle.write("\n")
PY

printf 'Rendered stage candidates to %s\n' "$OUT_DIR"
printf 'Manifest: %s\n' "$manifest"
