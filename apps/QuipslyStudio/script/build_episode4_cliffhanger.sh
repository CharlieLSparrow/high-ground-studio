#!/usr/bin/env bash
set -euo pipefail

SOURCE_CLIP="${1:-/Users/wall-e/Desktop/Podcast/4/ToBeContinued.mp4}"
OUTPUT_ROOT="${2:-/Volumes/My Passport/Quipsly Media Vault/production/episode-4/two-part/cliffhanger}"
SOURCE_IN_SECONDS="${QUIPSLY_CLIFFHANGER_SOURCE_IN_SECONDS:-23.5}"
VOICE_DELAY_MS="${QUIPSLY_CLIFFHANGER_VOICE_DELAY_MS:-25000}"
VOICE_NAME="${QUIPSLY_CLIFFHANGER_VOICE:-Samantha}"

if [[ ! -f "$SOURCE_CLIP" ]]; then
  echo "Missing source clip: $SOURCE_CLIP" >&2
  exit 1
fi

for command_name in ffmpeg ffprobe say; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  fi
done

mkdir -p "$OUTPUT_ROOT"

version=1
while :; do
  version_label="v$(printf '%03d' "$version")"
  output_dir="$OUTPUT_ROOT/$version_label"
output_clip="$output_dir/episode-4-part-1-locutus-cliffhanger-$version_label.mp4"
  if [[ ! -e "$output_clip" ]]; then
    break
  fi
  version=$((version + 1))
done

mkdir -p "$output_dir"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-cliffhanger.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
premaster_clip="$work_dir/episode-4-part-1-cliffhanger-premaster.mov"
audio_master_receipt="$output_dir/audio-master-receipt.json"

voice_aiff="$work_dir/to-be-continued.aiff"
if ! say -v "$VOICE_NAME" -r 148 -o "$voice_aiff" "To be continued."; then
  VOICE_NAME="Samantha"
  say -v "$VOICE_NAME" -r 148 -o "$voice_aiff" "To be continued."
fi

source_duration="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$SOURCE_CLIP")"
clip_duration="$(awk -v total="$source_duration" -v start="$SOURCE_IN_SECONDS" 'BEGIN { printf "%.6f", total - start }')"

ffmpeg -hide_banner -loglevel error -y \
  -ss "$SOURCE_IN_SECONDS" -i "$SOURCE_CLIP" \
  -i "$voice_aiff" \
  -filter_complex \
  "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v];
   [0:a]aresample=48000,volume='if(between(t,24.0,29.0),0.14,0.92)':eval=frame[bed];
   [1:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=90,lowpass=f=7800,equalizer=f=2500:t=o:w=1:g=2.4,acompressor=threshold=0.08:ratio=3.2:attack=6:release=140,aecho=0.80:0.12:45:0.07,volume=1.90,adelay=${VOICE_DELAY_MS}|${VOICE_DELAY_MS}[voice];
   [bed][voice]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95[a]" \
  -map "[v]" -map "[a]" \
  -t "$clip_duration" \
  -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p \
  -c:a pcm_s24le -ar 48000 \
  "$premaster_clip"

python3 "$(dirname "$0")/master_delivery_audio.py" \
  --input "$premaster_clip" \
  --output "$output_clip" \
  --receipt "$audio_master_receipt" \
  --target-lufs -16.0 \
  --true-peak -1.5

voice_copy="$output_dir/to-be-continued-voice-$version_label.wav"
ffmpeg -hide_banner -loglevel error -y -i "$voice_aiff" -ar 48000 -ac 2 -c:a pcm_s24le "$voice_copy"

manifest_path="$output_dir/manifest.json"
cat > "$manifest_path" <<EOF
{
  "schemaVersion": 1,
  "kind": "episode-4-part-1-cliffhanger",
  "version": "$version_label",
  "sourceClip": "$SOURCE_CLIP",
  "sourceInSeconds": $SOURCE_IN_SECONDS,
  "sourceDurationSeconds": $source_duration,
  "outputDurationSeconds": $clip_duration,
  "voice": "$VOICE_NAME",
  "voiceText": "To be continued.",
  "voiceTreatment": "calm female ship-computer announcement; restrained presence EQ, compression, and short reflection",
  "voiceDelayMilliseconds": $VOICE_DELAY_MS,
  "outputClip": "$output_clip",
  "voiceStem": "$voice_copy",
  "audioMasterReceipt": "$audio_master_receipt",
  "audioTargetLufs": -16.0,
  "audioTruePeakTargetDbfs": -1.5,
  "sourceMediaMutated": false
}
EOF

printf '%s\n' "$output_clip"
