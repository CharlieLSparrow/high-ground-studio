#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<'USAGE'
QuipslyStudio agent control

Usage:
  script/agentctl.sh health
  script/agentctl.sh commands
  script/agentctl.sh agent-manual
  script/agentctl.sh agent-capabilities
  script/agentctl.sh state
  script/agentctl.sh observe-after <any-agentctl-command> [args...]
  script/agentctl.sh wait-export [timeout-seconds]
  script/agentctl.sh editor-snapshot
  script/agentctl.sh control-plane
  script/agentctl.sh delivery-readiness
  script/agentctl.sh recovery-report
  script/agentctl.sh demo
  script/agentctl.sh premiere-packet /absolute/path/to/episode-1.json
  script/agentctl.sh import /absolute/path/to/video.mp4
  script/agentctl.sh decision charlie 12.5 4
  script/agentctl.sh decision homer 18 6
  script/agentctl.sh decision skip 31 3
  script/agentctl.sh lane-role "Unresolved Camera V1 - video clip 235" homer_camera
  script/agentctl.sh vault-lane "Charlie Camera"
  script/agentctl.sh relink-lane "Unresolved Camera V1 - video clip 235" /absolute/path/to/video.mp4
  script/agentctl.sh attach-proxy "Charlie Audio - First Pod Ever.wav" /absolute/path/to/audio_proxy.m4a
  script/agentctl.sh match-folder "/Volumes/My Passport/Episode 1"
  script/agentctl.sh retry-proxies
  script/agentctl.sh export-proxy-package /absolute/output/folder basename 8
  script/agentctl.sh audio-master-export /absolute/output/folder basename 8
  script/agentctl.sh delivery-packet
  script/agentctl.sh delivery-packet-generate /absolute/output/folder basename
  script/agentctl.sh release-prepare /absolute/output/folder basename 8
  script/agentctl.sh full-release
  script/agentctl.sh full-release-prepare /absolute/output/folder basename 8
  script/agentctl.sh publish-ledger
  script/agentctl.sh publish-destinations
  script/agentctl.sh publish-destination-guidance "YouTube Shorts" short-9x16-01 9:16
  script/agentctl.sh publish-ledger-generate
  script/agentctl.sh publish-release-checklist
  script/agentctl.sh publish-connector-readiness
  script/agentctl.sh publish-connector-preflight
  script/agentctl.sh publish-connector-worker
  script/agentctl.sh publish-connector-worker-dry-run "YouTube Shorts" social-short-clips /absolute/path/to/youtube_upload_worker.py
  script/agentctl.sh publish-connector-workers-dry-run-all
  script/agentctl.sh publish-connector-workers-dry-run-all Patreon episode-16x9-master
  script/agentctl.sh publish-packet
  script/agentctl.sh publish-packet-generate /absolute/output/folder basename
  script/agentctl.sh publish-upload-packet-bundle /absolute/output/folder optional-basename
  script/agentctl.sh podcast-packet
  script/agentctl.sh podcast-packet-generate /absolute/output/folder basename
  script/agentctl.sh podcast-ready-packet /absolute/podcast-manifest.json /absolute/output/folder [basename] [--zip]
  script/agentctl.sh podcast-ready-packet-generate /absolute/podcast-manifest.json /absolute/output/folder [basename] [--zip]
  script/agentctl.sh publication-ready-handoff
  script/agentctl.sh publication-operator-brief
  script/agentctl.sh publication-mission-control
  script/agentctl.sh publication-reveal-release
  script/agentctl.sh publication-copy-mission
  script/agentctl.sh publication-copy-missing-receipts
  script/agentctl.sh episode1-socials-load
  script/agentctl.sh publish-receipt-update RECEIPT_ID published https://example.com provider-id "notes" '{"title":"Custom"}' integration-needed
  script/agentctl.sh publish-receipt-update-platform YouTube episode-16x9-master published https://example.com provider-id "notes" "Episode title" "Episode description"
  script/agentctl.sh missing-publication-receipts
  script/agentctl.sh episode-receipt-capture YouTube published https://example.com provider-id "notes"
  script/agentctl.sh podcast-receipt-capture Spotify published https://example.com provider-id "notes"
  script/agentctl.sh publish-upload-packet RECEIPT_ID
  script/agentctl.sh save-session episode-2-native
  script/agentctl.sh load-session episode-2-native
  script/agentctl.sh vault-state
  script/agentctl.sh sessions
  script/agentctl.sh playback edit set
  script/agentctl.sh playback through play
  script/agentctl.sh seek 123.45
  script/agentctl.sh scrub 123.45
  script/agentctl.sh program-scroll 2.5
  script/agentctl.sh select-tag "Charlie Camera" TAG_UUID
  script/agentctl.sh select-decision first
  script/agentctl.sh select-decision first_video
  script/agentctl.sh select-decision at_playhead video
  script/agentctl.sh select-decision at_playhead "Charlie Camera"
  script/agentctl.sh nudge-selected 0.1
  script/agentctl.sh trim-selected -0.05 0.10
  script/agentctl.sh delete-selected-tag
  script/agentctl.sh focus-monitors
  script/agentctl.sh focus-timeline
  script/agentctl.sh left-workbench shorts
  script/agentctl.sh transcript-seed-demo
  script/agentctl.sh transcript-import /absolute/path/to/transcript.srt auto
  script/agentctl.sh transcript-generate "Charlie Audio" /absolute/path/to/transcriber-command
  script/agentctl.sh transcript-generate-selected /absolute/path/to/transcriber-command
  script/agentctl.sh transcript-select first
  script/agentctl.sh transcript-select at_playhead
  script/agentctl.sh transcript-apply-to-short caption
  script/agentctl.sh transcript-clear
  script/agentctl.sh transcript-clear-jobs
  script/agentctl.sh timeline-zoom precision
  script/agentctl.sh timeline-zoom set 160
  script/agentctl.sh select-lane "Charlie Camera"
  script/agentctl.sh format 9:16
  script/agentctl.sh program-crop-mode baseline
  script/agentctl.sh program-crop-mode keyframe
  script/agentctl.sh program-crop "Charlie Camera" 9:16 0.10 -0.05 1.25
  script/agentctl.sh program-crop-presets
  script/agentctl.sh program-crop-preset "Charlie Camera" 9:16 tighter baseline
  script/agentctl.sh program-crop-preset "Charlie Camera" 16:9 solo-safe baseline
  script/agentctl.sh program-crop-preset "Homer Camera" 9:16 stack-bottom keyframe 42.0
  script/agentctl.sh program-crop-preset "Charlie Camera" 9:16 headroom keyframe 28.5
  script/agentctl.sh program-crop-delta "Charlie Camera" 9:16 0.05 0 0.10
  script/agentctl.sh program-crop-keyframe "Charlie Camera" 9:16 28.5 0.10 -0.05 1.25
  script/agentctl.sh program-crop-keyframe-delta "Charlie Camera" 9:16 28.5 -0.03 0 0.08
  script/agentctl.sh program-crop-clear-keyframes "Charlie Camera" 9:16
  script/agentctl.sh source-window "Charlie Camera" show 10
  script/agentctl.sh source-window "Homer Camera" cut 4
  script/agentctl.sh switch-selected charlie
  script/agentctl.sh shorts-queue
  script/agentctl.sh shorts-add-selected "Optional title"
  script/agentctl.sh shorts-add-range 3000 3045 "Identity Changes Behavior"
  script/agentctl.sh shorts-update-selected hook "Opening hook"
  script/agentctl.sh shorts-preview-selected play
  script/agentctl.sh shorts-range-selected start delta -0.1
  script/agentctl.sh shorts-range-selected end time 42.5
  script/agentctl.sh shorts-export-selected /absolute/output/folder optional-basename
  script/agentctl.sh shorts-export-all /absolute/output/folder optional-basename
  script/agentctl.sh social-shorts-packet
  script/agentctl.sh social-shorts-packet-generate /absolute/output/folder optional-basename
  script/agentctl.sh social-publication-queue-generate /absolute/output/folder optional-basename
  script/agentctl.sh social-expansion-harvest /absolute/episode-9x16-master.mp4 /absolute/candidates.json /absolute/output/folder ["Episode 1 - The Wednesday Rule"] ["High Ground Odyssey Episode 1: The Wednesday Rule"] [--zip]
  script/agentctl.sh social-master-queue /absolute/output/folder [--episode-title "Episode Title"] /absolute/social-queue.json /absolute/social-expansion-pack.json [...]
  script/agentctl.sh social-master-queue-state
  script/agentctl.sh episode1-socials-first-wave
  script/agentctl.sh selected-social-candidate
  script/agentctl.sh selected-social-receipts
  script/agentctl.sh selected-social-posting-packet
  script/agentctl.sh social-master-open-selected-clip
  script/agentctl.sh social-master-copy-selected-platform-copy
  script/agentctl.sh social-ready-packet /absolute/social-master-queue.json /absolute/output/folder [basename] [top-count] [--zip]
  script/agentctl.sh social-ready-packet-generate /absolute/social-master-queue.json /absolute/output/folder [basename] [top-count] [--zip]
  script/agentctl.sh social-master-queue-load /absolute/social-master-queue.json
  script/agentctl.sh social-master-queue-select 3
  script/agentctl.sh social-master-queue-artifact open clipPath
  script/agentctl.sh social-master-queue-artifact reveal captionSrtPath
  script/agentctl.sh social-master-queue-artifact copy_handoff
  script/agentctl.sh social-master-queue-receipt 3 "YouTube Shorts" published https://example.com provider-id "notes"
  script/agentctl.sh publication-cockpit-generate /absolute/output/folder optional-basename
  script/agentctl.sh social-receipt-capture RECEIPT_ID published https://example.com provider-id "notes"
  script/agentctl.sh shorts-remove SHORT_CLIP_ID
  script/agentctl.sh tag "Charlie" active 12.5 4
  script/agentctl.sh tag "Homer" cut 12.5 4
  script/agentctl.sh offset "Homer" -2.5
  script/agentctl.sh clear-tags "Charlie"

Notes:
  - Requires the QuipslyMac app from apps/QuipslyStudio to be running.
  - Talks only to the app-local AgentServer on 127.0.0.1:8080 by default.
  - Use QUIPSLY_AGENT_URL to override the base URL if the port changes.
  - Command endpoints acknowledge intent. Use observe-after to run an action and
    then return authoritative /state for agent-safe observe/act/re-observe loops.
USAGE
}

urlencode() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

get() {
  curl --fail --silent --show-error "$BASE_URL$1"
  printf '\n'
}

observe_after() {
  local delay="${QUIPSLY_AGENT_OBSERVE_DELAY:-0.35}"
  local attempts="${QUIPSLY_AGENT_OBSERVE_ATTEMPTS:-1}"
  if [[ "$#" -lt 1 ]]; then
    usage
    exit 2
  fi
  "$0" "$@" >&2
  python3 - "$delay" "$attempts" <<'PY'
import sys
import time

delay = max(0.0, float(sys.argv[1]))
attempts = max(1, int(sys.argv[2]))
for _ in range(attempts):
    time.sleep(delay)
PY
  get "/state"
}

wait_export() {
  local timeout="${1:-120}"
  local tmp="${TMPDIR:-/tmp}/quipsly-agent-export-state.$$"
  local deadline=$((SECONDS + timeout))
  local status=""
  while (( SECONDS <= deadline )); do
    get "/state" > "$tmp"
    status="$(python3 - "$tmp" <<'PY'
import json
import sys

state = json.load(open(sys.argv[1]))
export_state = state.get("exportState") or {}
if export_state.get("stalled"):
    print("stalled")
else:
    print(export_state.get("status") or state.get("exportStatus") or "")
PY
)"
    case "$status" in
      completed)
        cat "$tmp"
        rm -f "$tmp"
        return 0
        ;;
      failed|blocked|stalled)
        cat "$tmp"
        rm -f "$tmp"
        return 1
        ;;
    esac
    sleep 1
  done
  cat "$tmp"
  rm -f "$tmp"
  echo "Timed out waiting for export status to complete." >&2
  return 1
}

command="${1:-}"
case "$command" in
  health)
    get "/health"
    ;;
  commands)
    get "/commands"
    ;;
  agent-manual)
    get "/agent_manual"
    ;;
  agent-capabilities)
    get "/agent_capabilities"
    ;;
  state)
    get "/state"
    ;;
  social-master-queue-state|social-master-queue-current)
    get "/social_master_queue"
    ;;
  episode1-socials-first-wave|social-master-queue-first-wave|first-wave-socials)
    get "/social_master_queue_first_wave"
    ;;
  selected-social-candidate|social-master-queue-selected)
    get "/social_master_queue_selected"
    ;;
  selected-social-receipts|social-master-selected-receipts)
    get "/social_master_queue_selected_receipts"
    ;;
  selected-social-posting-packet|social-master-selected-posting-packet)
    get "/social_master_queue_selected_posting_packet"
    ;;
  social-master-open-selected-clip|open-selected-social-candidate)
    get "/social_master_queue_open_selected_clip"
    ;;
  social-master-copy-selected-platform-copy|copy-selected-social-platform-copy)
    get "/social_master_queue_copy_selected_platform_copy"
    ;;
  publication-ready-handoff)
    get "/publication_ready_handoff"
    ;;
  publication-operator-brief|publish-operator-brief|operator-brief)
    get "/publication_operator_brief"
    ;;
  missing-publication-receipts)
    get "/missing_publication_receipts"
    ;;
  publication-mission-control|publish-mission-control)
    get "/publication_mission_control"
    ;;
  publication-reveal-release|publish-reveal-release)
    get "/publication_reveal_release_folder"
    ;;
  publication-copy-mission|publish-copy-mission)
    get "/publication_copy_mission_control"
    ;;
  publication-copy-missing-receipts|publish-copy-missing-receipts)
    get "/publication_copy_missing_receipts"
    ;;
  episode1-socials-load|load-episode1-socials|publish-load-episode1-socials)
    get "/social_master_queue_load?path=$(urlencode "/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-episode1-final-social-posting-packet/episode1-the-wednesday-rule-final-social-posting-packet.json")"
    ;;
  observe-after|do)
    shift
    observe_after "$@"
    ;;
  wait-export)
    wait_export "${2:-120}"
    ;;
  editor-snapshot)
    get "/editor_snapshot"
    ;;
  control-plane)
    get "/control_plane"
    ;;
  delivery-readiness)
    get "/delivery_readiness"
    ;;
  recovery-report)
    curl --fail --silent --show-error "$BASE_URL/state" | python3 -c '
import json, sys
payload = json.load(sys.stdin)
report = payload.get("mediaRecoveryReport")
if not report:
    print(json.dumps({
        "status": "missing_recovery_report",
        "hint": "Open QuipslyStudio and load a native session, then run agentctl recovery-report again."
    }, indent=2, sort_keys=True))
else:
    print(json.dumps(report, indent=2, sort_keys=True))
'
    ;;
  demo)
    get "/demo"
    ;;
  premiere-packet)
    path="${2:-}"
    if [[ -z "$path" ]]; then
      usage
      exit 2
    fi
    get "/premiere_packet?path=$(urlencode "$path")"
    ;;
  import)
    path="${2:-}"
    if [[ -z "$path" ]]; then
      usage
      exit 2
    fi
    get "/import?path=$(urlencode "$path")"
    ;;
  decision)
    action="${2:-}"
    start="${3:-}"
    duration="${4:-}"
    if [[ -z "$action" || -z "$start" || -z "$duration" ]]; then
      usage
      exit 2
    fi
    get "/decision?action=$(urlencode "$action")&start=$(urlencode "$start")&duration=$(urlencode "$duration")"
    ;;
  playback)
    mode="${2:-}"
    action="${3:-toggle}"
    if [[ -z "$mode" ]]; then
      usage
      exit 2
    fi
    get "/playback?mode=$(urlencode "$mode")&action=$(urlencode "$action")"
    ;;
  seek)
    time="${2:-}"
    if [[ -z "$time" ]]; then
      usage
      exit 2
    fi
    get "/seek?time=$(urlencode "$time")"
    ;;
  scrub)
    time="${2:-}"
    if [[ -z "$time" ]]; then
      usage
      exit 2
    fi
    get "/scrub?time=$(urlencode "$time")"
    ;;
  program-scroll)
    delta="${2:-}"
    if [[ -z "$delta" ]]; then
      usage
      exit 2
    fi
    get "/program_scroll?delta=$(urlencode "$delta")"
    ;;
  select-tag)
    lane="${2:-}"
    tag="${3:-}"
    if [[ -z "$lane" || -z "$tag" ]]; then
      usage
      exit 2
    fi
    get "/select_tag?lane_id=$(urlencode "$lane")&tag_id=$(urlencode "$tag")"
    ;;
  select-decision)
    mode="${2:-at_playhead}"
    lane="${3:-}"
    scope="${4:-}"
    case "$lane" in
      all|video|visual|source|support|audio|context)
        scope="$lane"
        lane=""
        ;;
    esac
    if [[ -n "$lane" && -n "$scope" ]]; then
      get "/select_decision?mode=$(urlencode "$mode")&lane_id=$(urlencode "$lane")&scope=$(urlencode "$scope")"
    elif [[ -n "$lane" ]]; then
      get "/select_decision?mode=$(urlencode "$mode")&lane_id=$(urlencode "$lane")"
    elif [[ -n "$scope" ]]; then
      get "/select_decision?mode=$(urlencode "$mode")&scope=$(urlencode "$scope")"
    else
      get "/select_decision?mode=$(urlencode "$mode")"
    fi
    ;;
  nudge-selected)
    delta="${2:-}"
    if [[ -z "$delta" ]]; then
      usage
      exit 2
    fi
    get "/nudge_selected?delta=$(urlencode "$delta")"
    ;;
  trim-selected)
    start_delta="${2:-}"
    duration_delta="${3:-}"
    if [[ -z "$start_delta" || -z "$duration_delta" ]]; then
      usage
      exit 2
    fi
    get "/trim_selected?start_delta=$(urlencode "$start_delta")&duration_delta=$(urlencode "$duration_delta")"
    ;;
  delete-selected-tag)
    get "/delete_selected_tag"
    ;;
  focus-monitors)
    get "/focus_monitors"
    ;;
  focus-timeline)
    get "/focus_timeline"
    ;;
  left-workbench)
    mode="${2:-shorts}"
    get "/left_workbench?mode=$(urlencode "$mode")"
    ;;
  transcript-seed-demo)
    get "/transcript_seed_demo"
    ;;
  transcript-import)
    path="${2:-}"
    format="${3:-auto}"
    if [[ -z "$path" ]]; then
      usage
      exit 2
    fi
    get "/transcript_import?path=$(urlencode "$path")&format=$(urlencode "$format")"
    ;;
  transcript-generate)
    lane="${2:-}"
    command_path="${3:-}"
    if [[ -z "$lane" ]]; then
      usage
      exit 2
    fi
    if [[ -n "$command_path" ]]; then
      get "/transcript_generate?lane_id=$(urlencode "$lane")&command_path=$(urlencode "$command_path")"
    else
      get "/transcript_generate?lane_id=$(urlencode "$lane")"
    fi
    ;;
  transcript-generate-selected)
    command_path="${2:-}"
    if [[ -n "$command_path" ]]; then
      get "/transcript_generate?command_path=$(urlencode "$command_path")"
    else
      get "/transcript_generate"
    fi
    ;;
  transcript-select)
    mode="${2:-at_playhead}"
    id="${3:-}"
    if [[ -n "$id" ]]; then
      get "/transcript_select?mode=$(urlencode "$mode")&id=$(urlencode "$id")"
    else
      get "/transcript_select?mode=$(urlencode "$mode")"
    fi
    ;;
  transcript-apply-to-short)
    field="${2:-caption}"
    get "/transcript_apply_to_short?field=$(urlencode "$field")"
    ;;
  transcript-clear)
    get "/transcript_clear"
    ;;
  transcript-clear-jobs)
    get "/transcript_clear_jobs"
    ;;
  timeline-zoom)
    mode="${2:-}"
    scale="${3:-}"
    if [[ -z "$mode" ]]; then
      usage
      exit 2
    fi
    if [[ -n "$scale" ]]; then
      get "/timeline_zoom?mode=$(urlencode "$mode")&scale=$(urlencode "$scale")"
    else
      get "/timeline_zoom?mode=$(urlencode "$mode")"
    fi
    ;;
  select-lane)
    lane="${2:-}"
    if [[ -z "$lane" ]]; then
      usage
      exit 2
    fi
    get "/select_lane?lane_id=$(urlencode "$lane")"
    ;;
  format)
    value="${2:-16:9}"
    get "/format?value=$(urlencode "$value")"
    ;;
  program-crop-mode)
    mode="${2:-baseline}"
    get "/program_crop_mode?mode=$(urlencode "$mode")"
    ;;
  program-crop)
    lane="${2:-}"
    format="${3:-}"
    pan_x="${4:-}"
    pan_y="${5:-}"
    zoom="${6:-}"
    if [[ -z "$lane" || -z "$format" || -z "$pan_x" || -z "$pan_y" || -z "$zoom" ]]; then
      usage
      exit 2
    fi
    get "/program_crop?lane_id=$(urlencode "$lane")&format=$(urlencode "$format")&pan_x=$(urlencode "$pan_x")&pan_y=$(urlencode "$pan_y")&zoom=$(urlencode "$zoom")"
    ;;
  program-crop-delta)
    lane="${2:-}"
    format="${3:-}"
    pan_x_delta="${4:-}"
    pan_y_delta="${5:-}"
    zoom_delta="${6:-}"
    if [[ -z "$lane" || -z "$format" || -z "$pan_x_delta" || -z "$pan_y_delta" || -z "$zoom_delta" ]]; then
      usage
      exit 2
    fi
    get "/program_crop?lane_id=$(urlencode "$lane")&format=$(urlencode "$format")&pan_x_delta=$(urlencode "$pan_x_delta")&pan_y_delta=$(urlencode "$pan_y_delta")&zoom_delta=$(urlencode "$zoom_delta")"
    ;;
  program-crop-presets)
    catalog_path="$ROOT_DIR/docs/quipslystudio-program-crop-presets.json"
    if [[ -f "$catalog_path" ]]; then
      cat "$catalog_path"
    else
      echo "{\"status\":\"missing\",\"path\":\"$catalog_path\"}" >&2
      exit 1
    fi
    ;;
  publish-destinations)
    catalog_path="$ROOT_DIR/docs/quipslystudio-publish-destinations.json"
    if [[ -f "$catalog_path" ]]; then
      cat "$catalog_path"
    else
      echo "{\"status\":\"missing\",\"path\":\"$catalog_path\"}" >&2
      exit 1
    fi
    ;;
  publish-destination-guidance)
    platform="${2:-}"
    lane_id="${3:-}"
    format="${4:-}"
    get "/publish_destination_guidance?platform=$(urlencode "$platform")&lane_id=$(urlencode "$lane_id")&format=$(urlencode "$format")"
    ;;
  program-crop-preset)
    lane="${2:-}"
    format="${3:-}"
    preset="${4:-}"
    mode="${5:-baseline}"
    time="${6:-}"
    if [[ -z "$lane" || -z "$format" || -z "$preset" ]]; then
      usage
      exit 2
    fi
    query="/program_crop_preset?lane_id=$(urlencode "$lane")&format=$(urlencode "$format")&preset=$(urlencode "$preset")&mode=$(urlencode "$mode")"
    if [[ -n "$time" ]]; then
      query="$query&time=$(urlencode "$time")"
    fi
    get "$query"
    ;;
  program-crop-keyframe)
    lane="${2:-}"
    format="${3:-}"
    time="${4:-}"
    pan_x="${5:-}"
    pan_y="${6:-}"
    zoom="${7:-}"
    if [[ -z "$lane" || -z "$format" || -z "$time" || -z "$pan_x" || -z "$pan_y" || -z "$zoom" ]]; then
      usage
      exit 2
    fi
    get "/program_crop_keyframe?lane_id=$(urlencode "$lane")&format=$(urlencode "$format")&time=$(urlencode "$time")&pan_x=$(urlencode "$pan_x")&pan_y=$(urlencode "$pan_y")&zoom=$(urlencode "$zoom")"
    ;;
  program-crop-keyframe-delta)
    lane="${2:-}"
    format="${3:-}"
    time="${4:-}"
    pan_x_delta="${5:-}"
    pan_y_delta="${6:-}"
    zoom_delta="${7:-}"
    if [[ -z "$lane" || -z "$format" || -z "$time" || -z "$pan_x_delta" || -z "$pan_y_delta" || -z "$zoom_delta" ]]; then
      usage
      exit 2
    fi
    get "/program_crop_keyframe?lane_id=$(urlencode "$lane")&format=$(urlencode "$format")&time=$(urlencode "$time")&pan_x_delta=$(urlencode "$pan_x_delta")&pan_y_delta=$(urlencode "$pan_y_delta")&zoom_delta=$(urlencode "$zoom_delta")"
    ;;
  program-crop-clear-keyframes)
    lane="${2:-}"
    format="${3:-}"
    if [[ -z "$lane" || -z "$format" ]]; then
      usage
      exit 2
    fi
    get "/program_crop_clear_keyframes?lane_id=$(urlencode "$lane")&format=$(urlencode "$format")"
    ;;
  source-window)
    lane="${2:-}"
    action="${3:-show}"
    duration="${4:-10}"
    if [[ -z "$lane" ]]; then
      usage
      exit 2
    fi
    get "/source_window?lane_id=$(urlencode "$lane")&action=$(urlencode "$action")&duration=$(urlencode "$duration")"
    ;;
  switch-selected)
    action="${2:-}"
    if [[ -z "$action" ]]; then
      usage
      exit 2
    fi
    get "/switch_selected_decision?action=$(urlencode "$action")"
    ;;
  shorts-queue)
    get "/shorts_queue"
    ;;
  shorts-add-selected)
    title="${2:-}"
    get "/shorts_queue_add_selected?title=$(urlencode "$title")"
    ;;
  shorts-add-range)
    start="${2:-}"
    end="${3:-}"
    title="${4:-}"
    if [[ -z "$start" || -z "$end" ]]; then
      usage
      exit 2
    fi
    get "/shorts_queue_add_range?start=$(urlencode "$start")&end=$(urlencode "$end")&title=$(urlencode "$title")"
    ;;
  shorts-update-selected)
    field="${2:-}"
    value="${3:-}"
    if [[ -z "$field" ]]; then
      usage
      exit 2
    fi
    get "/shorts_queue_update_selected?field=$(urlencode "$field")&value=$(urlencode "$value")"
    ;;
  shorts-preview-selected)
    play="${2:-false}"
    case "$play" in
      play|true|yes|1) play="true" ;;
      *) play="false" ;;
    esac
    get "/shorts_preview_selected?play=$(urlencode "$play")"
    ;;
  shorts-range-selected)
    boundary="${2:-}"
    mode="${3:-}"
    value="${4:-}"
    if [[ -z "$boundary" || -z "$mode" || -z "$value" ]]; then
      usage
      exit 2
    fi
    case "$mode" in
      time)
        get "/shorts_range_selected?boundary=$(urlencode "$boundary")&time=$(urlencode "$value")"
        ;;
      delta)
        get "/shorts_range_selected?boundary=$(urlencode "$boundary")&delta=$(urlencode "$value")"
        ;;
      *)
        usage
        exit 2
        ;;
    esac
    ;;
  shorts-export-selected)
    directory="${2:-}"
    basename="${3:-}"
    if [[ -z "$directory" ]]; then
      usage
      exit 2
    fi
    get "/shorts_export_selected?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")"
    ;;
  shorts-export-all)
    directory="${2:-}"
    basename="${3:-}"
    if [[ -z "$directory" ]]; then
      usage
      exit 2
    fi
    get "/shorts_export_all?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")"
    ;;
  social-shorts-packet)
    get "/social_shorts_packet"
    ;;
  social-shorts-packet-generate)
    directory="${2:-}"
    basename="${3:-}"
    if [[ -z "$directory" ]]; then
      usage
      exit 2
    fi
    get "/social_shorts_packet_generate?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")"
    ;;
  social-publication-queue-generate)
    directory="${2:-}"
    basename="${3:-}"
    if [[ -z "$directory" ]]; then
      usage
      exit 2
    fi
    get "/social_publication_queue_generate?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")"
    ;;
  social-ready-packet-generate)
    queue_path="${2:-}"
    output="${3:-}"
    basename="${4:-social-clips-ready}"
    top_count="${5:-12}"
    zip_flag="${6:-}"
    if [[ -z "$queue_path" || -z "$output" ]]; then
      usage
      exit 2
    fi
    get "/social_ready_packet_generate?queue_path=$(urlencode "$queue_path")&output=$(urlencode "$output")&basename=$(urlencode "$basename")&top_count=$(urlencode "$top_count")&zip=$(urlencode "$zip_flag")"
    ;;
  social-master-queue-load)
    queue_path="${2:-}"
    if [[ -z "$queue_path" ]]; then
      usage
      exit 2
    fi
    get "/social_master_queue_load?path=$(urlencode "$queue_path")"
    ;;
  social-master-queue-select)
    rank="${2:-}"
    if [[ -z "$rank" ]]; then
      usage
      exit 2
    fi
    get "/social_master_queue_select?rank=$(urlencode "$rank")"
    ;;
  social-master-queue-artifact)
    action="${2:-}"
    key="${3:-}"
    if [[ -z "$action" ]]; then
      usage
      exit 2
    fi
    get "/social_master_queue_artifact?action=$(urlencode "$action")&key=$(urlencode "$key")"
    ;;
  social-master-queue-receipt)
    rank="${2:-}"
    platform="${3:-YouTube Shorts}"
    status="${4:-published}"
    public_url="${5:-}"
    provider_id="${6:-}"
    notes="${7:-}"
    if [[ -z "$rank" || -z "$public_url" ]]; then
      usage
      exit 2
    fi
    get "/social_master_queue_receipt?rank=$(urlencode "$rank")&platform=$(urlencode "$platform")&status=$(urlencode "$status")&public_url=$(urlencode "$public_url")&provider_receipt_id=$(urlencode "$provider_id")&notes=$(urlencode "$notes")"
    ;;
  publication-cockpit-generate)
    directory="${2:-}"
    basename="${3:-}"
    if [[ -z "$directory" ]]; then
      usage
      exit 2
    fi
    get "/publication_cockpit_generate?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")"
    ;;
  social-receipt-capture)
    receipt_id="${2:-}"
    status="${3:-published}"
    public_url="${4:-}"
    provider_id="${5:-}"
    notes="${6:-}"
    if [[ -z "$receipt_id" || -z "$public_url" ]]; then
      usage
      exit 2
    fi
    get "/social_receipt_capture?receipt_id=$(urlencode "$receipt_id")&status=$(urlencode "$status")&public_url=$(urlencode "$public_url")&provider_receipt_id=$(urlencode "$provider_id")&notes=$(urlencode "$notes")"
    ;;
  publish-upload-packet)
    receipt_id="${2:-}"
    if [[ -z "$receipt_id" ]]; then
      usage
      exit 2
    fi
    get "/publish_upload_packet_copy?receipt_id=$(urlencode "$receipt_id")"
    ;;
  podcast-packet)
    get "/podcast_packet"
    ;;
  podcast-packet-generate)
    directory="${2:-}"
    basename="${3:-}"
    if [[ -z "$directory" ]]; then
      usage
      exit 2
    fi
    get "/podcast_packet_generate?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")"
    ;;
  podcast-ready-packet)
    manifest="${2:-}"
    output="${3:-}"
    basename="${4:-podcast-ready}"
    zip_flag="${5:-}"
    if [[ -z "$manifest" || -z "$output" ]]; then
      usage
      exit 2
    fi
    command=(
      "$ROOT_DIR/script/build_podcast_ready_packet.py"
      "$manifest"
      --output "$output"
      --basename "$basename"
    )
    if [[ "$zip_flag" == "--zip" || "$zip_flag" == "zip" ]]; then
      command+=(--zip)
    fi
    "${command[@]}"
    ;;
  podcast-ready-packet-generate)
    manifest="${2:-}"
    output="${3:-}"
    basename="${4:-podcast-ready}"
    zip_flag="${5:-}"
    if [[ -z "$manifest" || -z "$output" ]]; then
      usage
      exit 2
    fi
    get "/podcast_ready_packet_generate?manifest_path=$(urlencode "$manifest")&output=$(urlencode "$output")&basename=$(urlencode "$basename")&zip=$(urlencode "$zip_flag")"
    ;;
  shorts-remove)
    id="${2:-}"
    if [[ -z "$id" ]]; then
      usage
      exit 2
    fi
    get "/shorts_queue_remove?id=$(urlencode "$id")"
    ;;
  lane-role)
    lane="${2:-}"
    role="${3:-}"
    if [[ -z "$lane" || -z "$role" ]]; then
      usage
      exit 2
    fi
    get "/lane_role?lane_id=$(urlencode "$lane")&role=$(urlencode "$role")"
    ;;
  vault-lane)
    lane="${2:-}"
    if [[ -z "$lane" ]]; then
      usage
      exit 2
    fi
    get "/vault_lane?lane_id=$(urlencode "$lane")"
    ;;
  relink-lane)
    lane="${2:-}"
    path="${3:-}"
    if [[ -z "$lane" || -z "$path" ]]; then
      usage
      exit 2
    fi
    get "/relink_lane?lane_id=$(urlencode "$lane")&path=$(urlencode "$path")"
    ;;
  attach-proxy)
    lane="${2:-}"
    path="${3:-}"
    if [[ -z "$lane" || -z "$path" ]]; then
      usage
      exit 2
    fi
    get "/attach_proxy?lane_id=$(urlencode "$lane")&path=$(urlencode "$path")"
    ;;
  match-folder)
    path="${2:-}"
    if [[ -z "$path" ]]; then
      usage
      exit 2
    fi
    get "/match_folder?path=$(urlencode "$path")"
    ;;
  retry-proxies)
    get "/retry_proxies"
    ;;
  export-proxy-package)
    directory="${2:-}"
    basename="${3:-quipsly-export-proof}"
    proof_seconds="${4:-}"
    if [[ -z "$directory" ]]; then
      usage
      exit 2
    fi
    get "/export_proxy_package?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")&proof_seconds=$(urlencode "$proof_seconds")"
    ;;
  audio-master-export)
    directory="${2:-}"
    basename="${3:-quipsly-audio-master}"
    proof_seconds="${4:-}"
    if [[ -z "$directory" ]]; then
      usage
      exit 2
    fi
    get "/audio_master_export?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")&proof_seconds=$(urlencode "$proof_seconds")"
    ;;
  delivery-packet)
    get "/delivery_packet"
    ;;
  delivery-packet-generate)
    directory="${2:-}"
    basename="${3:-quipsly-delivery}"
    if [[ -z "$directory" ]]; then
      usage
      exit 2
    fi
    get "/delivery_packet_generate?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")"
    ;;
  release-prepare)
    directory="${2:-}"
    basename="${3:-quipsly-release}"
    proof_seconds="${4:-}"
    if [[ -z "$directory" ]]; then
      usage
      exit 2
    fi
    get "/release_prepare?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")&proof_seconds=$(urlencode "$proof_seconds")"
    ;;
  full-release)
    get "/full_release"
    ;;
  full-release-prepare)
    directory="${2:-}"
    basename="${3:-quipsly-full-release}"
    proof_seconds="${4:-}"
    if [[ -z "$directory" ]]; then
      usage
      exit 2
    fi
    get "/full_release_prepare?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")&proof_seconds=$(urlencode "$proof_seconds")"
    ;;
  publish-ledger)
    get "/publish_ledger"
    ;;
  publish-ledger-generate)
    get "/publish_ledger_generate"
    ;;
  publish-release-checklist)
    get "/publish_release_checklist"
    ;;
  publish-connector-readiness)
    get "/publish_connector_readiness"
    ;;
  publish-connector-preflight)
    get "/publish_connector_preflight"
    ;;
  publish-connector-worker)
    get "/publish_connector_worker"
    ;;
  publish-connector-worker-dry-run)
    platform="${2:-}"
    lane_id="${3:-}"
    worker_path="${4:-}"
    if [[ -z "$platform" || -z "$lane_id" || -z "$worker_path" ]]; then
      usage
      exit 2
    fi
    get "/publish_connector_worker_dry_run?platform=$(urlencode "$platform")&lane_id=$(urlencode "$lane_id")&worker_path=$(urlencode "$worker_path")"
    ;;
  publish-connector-workers-dry-run-all)
    platform="${2:-}"
    lane_id="${3:-}"
    get "/publish_connector_workers_dry_run_all?platform=$(urlencode "$platform")&lane_id=$(urlencode "$lane_id")"
    ;;
  publish-packet)
    get "/publish_packet"
    ;;
  publish-packet-generate)
    directory="${2:-}"
    basename="${3:-quipsly-publish}"
    get "/publish_packet_generate?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")"
    ;;
  publish-upload-packet-bundle)
    directory="${2:-}"
    basename="${3:-}"
    if [[ -z "$directory" ]]; then
      usage
      exit 2
    fi
    get "/publish_upload_packet_bundle_generate?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")"
    ;;
  social-expansion-harvest)
    source_master="${2:-}"
    candidates="${3:-}"
    output="${4:-}"
    episode_title="${5:-Episode 1 - The Wednesday Rule}"
    episode_label="${6:-High Ground Odyssey Episode 1: The Wednesday Rule}"
    zip_flag="${7:-}"
    if [[ -z "$source_master" || -z "$candidates" || -z "$output" ]]; then
      usage
      exit 2
    fi
    command=(
      "$ROOT_DIR/script/harvest_social_expansion_pack.py"
      --source-master "$source_master"
      --candidates "$candidates"
      --output "$output"
      --episode-title "$episode_title"
      --episode-label "$episode_label"
    )
    if [[ "$zip_flag" == "--zip" || "$zip_flag" == "zip" ]]; then
      command+=(--zip)
    fi
    "${command[@]}"
    ;;
  social-master-queue)
    output="${2:-}"
    shift 2 || true
    episode_title="Episode 1 - The Wednesday Rule"
    if [[ "${1:-}" == "--episode-title" ]]; then
      episode_title="${2:-}"
      shift 2 || true
    fi
    if [[ -z "$output" || "$#" -lt 1 ]]; then
      usage
      exit 2
    fi
    "$ROOT_DIR/script/build_social_master_queue.py" \
      --episode-title "$episode_title" \
      --output "$output" \
      "$@"
    ;;
  social-ready-packet)
    queue_path="${2:-}"
    output="${3:-}"
    basename="${4:-social-clips-ready}"
    top_count="${5:-12}"
    zip_flag="${6:-}"
    if [[ -z "$queue_path" || -z "$output" ]]; then
      usage
      exit 2
    fi
    command=(
      "$ROOT_DIR/script/build_social_ready_packet.py"
      "$queue_path"
      --output "$output"
      --basename "$basename"
      --top-count "$top_count"
    )
    if [[ "$zip_flag" == "--zip" || "$zip_flag" == "zip" ]]; then
      command+=(--zip)
    fi
    "${command[@]}"
    ;;
  publish-receipt-update)
    id="${2:-}"
    status="${3:-}"
    public_url="${4:-}"
    provider_receipt_id="${5:-}"
    notes="${6:-}"
    metadata_json="${7:-}"
    upload_job_status="${8:-}"
    if [[ -z "$id" ]]; then
      usage
      exit 2
    fi
    get "/publish_receipt_update?id=$(urlencode "$id")&status=$(urlencode "$status")&public_url=$(urlencode "$public_url")&provider_receipt_id=$(urlencode "$provider_receipt_id")&notes=$(urlencode "$notes")&metadata_json=$(urlencode "$metadata_json")&upload_job_status=$(urlencode "$upload_job_status")"
    ;;
  publish-receipt-update-platform)
    platform="${2:-}"
    lane_id="${3:-}"
    status="${4:-}"
    public_url="${5:-}"
    provider_receipt_id="${6:-}"
    notes="${7:-}"
    title="${8:-}"
    description="${9:-}"
    if [[ -z "$platform" || -z "$status" ]]; then
      usage >&2
      exit 2
    fi
    get "/publish_receipt_update_by_platform?platform=$(urlencode "$platform")&lane_id=$(urlencode "$lane_id")&status=$(urlencode "$status")&public_url=$(urlencode "$public_url")&provider_receipt_id=$(urlencode "$provider_receipt_id")&notes=$(urlencode "$notes")&title=$(urlencode "$title")&description=$(urlencode "$description")"
    ;;
  episode-receipt-capture)
    platform="${2:-}"
    status="${3:-published}"
    public_url="${4:-}"
    provider_receipt_id="${5:-}"
    notes="${6:-}"
    if [[ -z "$platform" || -z "$public_url" ]]; then
      usage >&2
      exit 2
    fi
    get "/episode_receipt_capture?platform=$(urlencode "$platform")&status=$(urlencode "$status")&public_url=$(urlencode "$public_url")&provider_receipt_id=$(urlencode "$provider_receipt_id")&notes=$(urlencode "$notes")"
    ;;
  podcast-receipt-capture)
    platform="${2:-}"
    status="${3:-published}"
    public_url="${4:-}"
    provider_receipt_id="${5:-}"
    notes="${6:-}"
    if [[ -z "$platform" || -z "$public_url" ]]; then
      usage >&2
      exit 2
    fi
    get "/podcast_receipt_capture?platform=$(urlencode "$platform")&status=$(urlencode "$status")&public_url=$(urlencode "$public_url")&provider_receipt_id=$(urlencode "$provider_receipt_id")&notes=$(urlencode "$notes")"
    ;;
  save-session)
    name="${2:-autosave}"
    get "/save_session?name=$(urlencode "$name")"
    ;;
  load-session)
    name="${2:-autosave}"
    get "/load_session?name=$(urlencode "$name")"
    ;;
  vault-state)
    get "/vault_state"
    ;;
  sessions)
    get "/sessions"
    ;;
  tag)
    lane="${2:-}"
    tag="${3:-}"
    start="${4:-}"
    duration="${5:-}"
    if [[ -z "$lane" || -z "$tag" || -z "$start" || -z "$duration" ]]; then
      usage
      exit 2
    fi
    get "/edit?lane_id=$(urlencode "$lane")&action=$(urlencode "$tag")&v1=$(urlencode "$start")&v2=$(urlencode "$duration")"
    ;;
  offset)
    lane="${2:-}"
    offset="${3:-}"
    if [[ -z "$lane" || -z "$offset" ]]; then
      usage
      exit 2
    fi
    get "/edit?lane_id=$(urlencode "$lane")&action=offset&v1=$(urlencode "$offset")"
    ;;
  clear-tags)
    lane="${2:-}"
    if [[ -z "$lane" ]]; then
      usage
      exit 2
    fi
    get "/edit?lane_id=$(urlencode "$lane")&action=clear_tags"
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
