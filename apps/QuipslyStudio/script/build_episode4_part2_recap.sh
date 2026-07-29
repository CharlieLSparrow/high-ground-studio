#!/usr/bin/env bash
set -euo pipefail

OUTPUT_ROOT="${1:-/Volumes/My Passport/Quipsly Media Vault/production/episode-4/two-part/recap}"
HOMER_PROXY="${QUIPSLY_EP4_HOMER_PROXY:-/Volumes/My Passport/Quipsly Media Vault/proxy/episode-4/v009/homer-b-proxy-720p.mp4}"
CHARLIE_PROXY="${QUIPSLY_EP4_CHARLIE_PROXY:-/Volumes/My Passport/Quipsly Media Vault/proxy/episode-4/v009/charlie-3750-proxy-720p.mp4}"
CHARLIE_AUDIO="${QUIPSLY_EP4_CHARLIE_AUDIO:-/Volumes/My Passport/Quipsly Media Vault/audio/episode-4/v016-charlie-sync-corrected/charlie-contribution-gated-sync-corrected.wav}"
HOMER_AUDIO="${QUIPSLY_EP4_HOMER_AUDIO:-/Volumes/My Passport/Quipsly Media Vault/audio/episode-4/v014-homer-parity-trim/homer-dji-treated-parity.wav}"
VOICE_NAME="${QUIPSLY_RECAP_VOICE:-Samantha}"
INTRO_DURATION=6.00
POST_RECAP_BEAT=2.00
OUTRO_DURATION=6.00

RECAP_START=3303.74
CHARLIE_CUT=3337.824
HOMER_RETURN=3339.744
RECAP_END=3346.894
HOMER_OFFSET=1965.53
CHARLIE_OFFSET=1904.982

for source_file in "$HOMER_PROXY" "$CHARLIE_PROXY" "$CHARLIE_AUDIO" "$HOMER_AUDIO"; do
  if [[ ! -f "$source_file" ]]; then
    echo "Missing recap source: $source_file" >&2
    exit 1
  fi
done

mkdir -p "$OUTPUT_ROOT"
version=1
while :; do
  version_label="v$(printf '%03d' "$version")"
  output_dir="$OUTPUT_ROOT/$version_label"
  output_clip="$output_dir/episode-4-part-2-last-time-on-$version_label.mp4"
  if [[ ! -e "$output_clip" ]]; then
    break
  fi
  version=$((version + 1))
done
mkdir -p "$output_dir"

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-recap.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
premaster_clip="$work_dir/episode-4-part-2-recap-premaster.mov"
audio_master_receipt="$output_dir/audio-master-receipt.json"
voice_aiff="$work_dir/last-time-on.aiff"
if ! say -v "$VOICE_NAME" -r 154 -o "$voice_aiff" "Last time on High Ground Odyssey."; then
  VOICE_NAME="Samantha"
  say -v "$VOICE_NAME" -r 154 -o "$voice_aiff" "Last time on High Ground Odyssey."
fi
conclusion_aiff="$work_dir/and-now-the-conclusion.aiff"
say -v "$VOICE_NAME" -r 148 -o "$conclusion_aiff" "And now, the conclusion."

homer_a_start="$(awk -v t="$RECAP_START" -v o="$HOMER_OFFSET" 'BEGIN {printf "%.6f", t-o}')"
homer_a_end="$(awk -v t="$CHARLIE_CUT" -v o="$HOMER_OFFSET" 'BEGIN {printf "%.6f", t-o}')"
charlie_start="$(awk -v t="$CHARLIE_CUT" -v o="$CHARLIE_OFFSET" 'BEGIN {printf "%.6f", t-o}')"
charlie_end="$(awk -v t="$HOMER_RETURN" -v o="$CHARLIE_OFFSET" 'BEGIN {printf "%.6f", t-o}')"
homer_b_start="$(awk -v t="$HOMER_RETURN" -v o="$HOMER_OFFSET" 'BEGIN {printf "%.6f", t-o}')"
homer_b_end="$(awk -v t="$RECAP_END" -v o="$HOMER_OFFSET" 'BEGIN {printf "%.6f", t-o}')"
recap_duration="$(awk -v a="$RECAP_START" -v b="$RECAP_END" 'BEGIN {printf "%.6f", b-a}')"
recap_with_beat_duration="$(awk -v body="$recap_duration" -v beat="$POST_RECAP_BEAT" 'BEGIN {printf "%.6f", body+beat}')"
body_fade_start="$(awk -v body="$recap_duration" 'BEGIN {printf "%.6f", body-0.35}')"
dialog_fade_start="$(awk -v body="$recap_duration" 'BEGIN {printf "%.6f", body-0.12}')"
intro_fade_start="$(awk -v duration="$INTRO_DURATION" 'BEGIN {printf "%.6f", duration-0.35}')"
outro_fade_start="$(awk -v duration="$OUTRO_DURATION" 'BEGIN {printf "%.6f", duration-0.35}')"
total_duration="$(awk -v body="$recap_duration" -v intro="$INTRO_DURATION" -v beat="$POST_RECAP_BEAT" -v outro="$OUTRO_DURATION" 'BEGIN {printf "%.6f", body+intro+beat+outro}')"

card_svg="$output_dir/last-time-on-title-card-$version_label.svg"
card_png="$output_dir/last-time-on-title-card-$version_label.png"
conclusion_svg="$output_dir/and-now-the-conclusion-title-card-$version_label.svg"
conclusion_png="$output_dir/and-now-the-conclusion-title-card-$version_label.png"
cat > "$card_svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <radialGradient id="canopy" cx="50%" cy="42%" r="76%">
      <stop offset="0" stop-color="#193526"/>
      <stop offset="0.52" stop-color="#0b2117"/>
      <stop offset="1" stop-color="#04100b"/>
    </radialGradient>
    <pattern id="grid" width="160" height="160" patternUnits="userSpaceOnUse">
      <path d="M 160 0 L 0 0 0 160" fill="none" stroke="#7da087" stroke-opacity="0.16" stroke-width="1"/>
      <circle cx="0" cy="0" r="3" fill="#d6ae61" fill-opacity="0.32"/>
    </pattern>
  </defs>
  <rect width="1920" height="1080" fill="url(#canopy)"/>
  <rect width="1920" height="1080" fill="url(#grid)"/>
  <path d="M110 850 C390 620 450 240 820 150" fill="none" stroke="#496d54" stroke-opacity="0.24" stroke-width="4"/>
  <path d="M1810 230 C1530 390 1490 760 1110 930" fill="none" stroke="#496d54" stroke-opacity="0.22" stroke-width="4"/>
  <rect x="180" y="275" width="1560" height="530" rx="34" fill="#0a1d14" fill-opacity="0.92" stroke="#d6ae61" stroke-opacity="0.72" stroke-width="3"/>
  <circle cx="960" cy="540" r="415" fill="none" stroke="#d6ae61" stroke-opacity="0.12" stroke-width="2"/>
  <circle cx="960" cy="540" r="330" fill="none" stroke="#9bb5a2" stroke-opacity="0.10" stroke-width="2"/>
  <rect x="650" y="332" width="620" height="456" rx="28" fill="#07170f" fill-opacity="0.42" stroke="#d6ae61" stroke-opacity="0.26" stroke-width="2"/>
  <text x="960" y="425" text-anchor="middle" font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="48" font-weight="600" letter-spacing="8" fill="#d6ae61">LAST TIME ON</text>
  <text x="960" y="545" text-anchor="middle" font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="72" font-weight="700" letter-spacing="4" fill="#f2ead7">HIGH GROUND</text>
  <text x="960" y="635" text-anchor="middle" font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="84" font-weight="700" letter-spacing="5" fill="#f2ead7">ODYSSEY</text>
  <rect x="750" y="680" width="420" height="3" fill="#d6ae61" fill-opacity="0.78"/>
  <text x="960" y="740" text-anchor="middle" font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="26" font-weight="500" letter-spacing="7" fill="#9bb5a2">THE STORY SO FAR</text>
</svg>
SVG
sips -s format png "$card_svg" --out "$card_png" >/dev/null
sed \
  -e 's/LAST TIME ON/AND NOW/' \
  -e 's/HIGH GROUND/THE/' \
  -e 's/ODYSSEY/CONCLUSION/' \
  -e 's/font-size="84"/font-size="52"/' \
  -e 's/THE STORY SO FAR/PART TWO/' \
  "$card_svg" > "$conclusion_svg"
sips -s format png "$conclusion_svg" --out "$conclusion_png" >/dev/null

ffmpeg -hide_banner -loglevel error -y \
  -i "$HOMER_PROXY" -i "$CHARLIE_PROXY" \
  -i "$CHARLIE_AUDIO" -i "$HOMER_AUDIO" -i "$voice_aiff" -i "$conclusion_aiff" \
  -loop 1 -framerate 30 -i "$card_png" \
  -loop 1 -framerate 30 -i "$conclusion_png" \
  -filter_complex \
  "[0:v]trim=start=${homer_a_start}:end=${homer_a_end},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];
   [1:v]trim=start=${charlie_start}:end=${charlie_end},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];
   [0:v]trim=start=${homer_b_start}:end=${homer_b_end},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v2];
   [v0][v1][v2]concat=n=3:v=1:a=0,fade=t=in:st=0:d=0.18,fade=t=out:st=${body_fade_start}:d=0.35,tpad=stop_mode=clone:stop_duration=${POST_RECAP_BEAT}[vbody];
   [6:v]trim=duration=${INTRO_DURATION},setpts=PTS-STARTPTS,scale=1920:1080,setsar=1,fade=t=in:st=0:d=0.20,fade=t=out:st=${intro_fade_start}:d=0.35[vintro];
   [7:v]trim=duration=${OUTRO_DURATION},setpts=PTS-STARTPTS,scale=1920:1080,setsar=1,fade=t=in:st=0:d=0.18,fade=t=out:st=${outro_fade_start}:d=0.35[voutro];
   [vintro][vbody][voutro]concat=n=3:v=1:a=0[v];
   [2:a]atrim=start=${RECAP_START}:end=${RECAP_END},asetpts=PTS-STARTPTS,aresample=48000[charlie];
   [3:a]atrim=start=${RECAP_START}:end=${RECAP_END},asetpts=PTS-STARTPTS,aresample=48000[homer];
   [charlie][homer]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95,afade=t=out:st=${dialog_fade_start}:d=0.12,apad=pad_dur=${POST_RECAP_BEAT},atrim=duration=${recap_with_beat_duration}[dialog];
   [4:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=90,lowpass=f=7800,equalizer=f=2500:t=o:w=1:g=1.8,acompressor=threshold=0.10:ratio=2.8:attack=8:release=120,aecho=0.80:0.12:45:0.08,volume=1.38,adelay=300|300,apad,atrim=duration=${INTRO_DURATION},afade=t=out:st=${intro_fade_start}:d=0.24[introvoice];
   [5:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=90,lowpass=f=7800,equalizer=f=2500:t=o:w=1:g=1.8,acompressor=threshold=0.10:ratio=2.8:attack=8:release=120,aecho=0.80:0.12:45:0.08,volume=1.38,adelay=250|250,apad,atrim=duration=${OUTRO_DURATION},afade=t=out:st=${outro_fade_start}:d=0.24[outrovoice];
   [introvoice][dialog][outrovoice]concat=n=3:v=0:a=1,alimiter=limit=0.95[a]" \
  -map "[v]" -map "[a]" -t "$total_duration" \
  -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p \
  -c:a pcm_s24le -ar 48000 \
  "$premaster_clip"

python3 "$(dirname "$0")/master_delivery_audio.py" \
  --input "$premaster_clip" \
  --output "$output_clip" \
  --receipt "$audio_master_receipt" \
  --target-lufs -16.0 \
  --true-peak -1.5

cat > "$output_dir/manifest.json" <<EOF
{
  "schemaVersion": 1,
  "kind": "episode-4-part-2-last-time-on-recap",
  "version": "$version_label",
  "sourceClockStart": $RECAP_START,
  "sourceClockEnd": $RECAP_END,
  "outputDurationSeconds": $total_duration,
  "recapFootageDurationSeconds": $recap_duration,
  "postRecapBreathSeconds": $POST_RECAP_BEAT,
  "recapEditorialIntent": "Preserve the complete leadership-is-learnable thought, Charlie's response, and the second-grade pivot before the conclusion sting.",
  "introAnnouncement": "Last time on High Ground Odyssey.",
  "outroAnnouncement": "And now, the conclusion.",
  "narratorVoice": "$VOICE_NAME",
  "narratorTreatment": "calm female ship-computer announcement; restrained presence EQ, compression, and short reflection",
  "openingGraphic": {
    "title": "Last Time on High Ground Odyssey",
    "subtitle": "The Story So Far",
    "durationSeconds": $INTRO_DURATION,
    "visualLanguage": "Quipsly cedar green, warm brass, technical archive grid",
    "svg": "$card_svg",
    "png": "$card_png"
  },
  "conclusionGraphic": {
    "title": "And Now, The Conclusion",
    "subtitle": "Part Two",
    "durationSeconds": $OUTRO_DURATION,
    "svg": "$conclusion_svg",
    "png": "$conclusion_png"
  },
  "visualDecisions": [
    {"source": "Homer", "start": $RECAP_START, "end": $CHARLIE_CUT},
    {"source": "Charlie", "start": $CHARLIE_CUT, "end": $HOMER_RETURN},
    {"source": "Homer", "start": $HOMER_RETURN, "end": $RECAP_END}
  ],
  "outputClip": "$output_clip",
  "audioMasterReceipt": "$audio_master_receipt",
  "audioTargetLufs": -16.0,
  "audioTruePeakTargetDbfs": -1.5,
  "sourceMediaMutated": false
}
EOF

printf '%s\n' "$output_clip"
