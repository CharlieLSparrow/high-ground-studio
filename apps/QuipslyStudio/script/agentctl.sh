#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

discover_base_url() {
  if [[ -n "${QUIPSLY_AGENT_URL:-}" ]]; then
    printf '%s\n' "$QUIPSLY_AGENT_URL"
    return
  fi

  python3 - <<'PY'
import json
import urllib.request

for port in (8080, 8765, 8766):
    base = f"http://127.0.0.1:{port}"
    for path in ("/health", "/state"):
        try:
            with urllib.request.urlopen(base + path, timeout=0.35) as response:
                body = response.read().decode("utf-8", errors="replace")
            if path == "/state":
                json.loads(body)
            print(base)
            raise SystemExit(0)
        except Exception:
            continue

print("http://127.0.0.1:8080")
PY
}

BASE_URL="$(discover_base_url)"

usage() {
  cat <<'USAGE'
QuipslyStudio agent control

Usage:
  script/agentctl.sh health
  script/agentctl.sh agent-url
  script/agentctl.sh commands
  script/agentctl.sh agent-manual
  script/agentctl.sh agent-capabilities
  script/agentctl.sh codex-handoff
  script/agentctl.sh editor-loop-proof
  script/agentctl.sh codex-observe
  script/agentctl.sh codex-observe-save [output-folder]
  script/agentctl.sh codex-act-save [--output output-folder] <agentctl-command> [args...]
  script/agentctl.sh codex-act-review [summary-json|latest]
  script/agentctl.sh codex-session-review [--json] [output-folder]
  script/agentctl.sh codex-release-observe
  script/agentctl.sh codex-release-observe-save [output-folder]
  script/agentctl.sh codex-release-act-save [--output output-folder] <agentctl-command> [args...]
  script/agentctl.sh codex-release-act-review [summary-json|latest]
  script/agentctl.sh codex-release-session-review [--json] [output-folder]
  script/agentctl.sh codex-production-review [--json] [output-folder]
  script/agentctl.sh codex-audit-status [--json] [output-folder]
  script/agentctl.sh codex-production-handoff [--audit observation-folder] [--output output-folder]
  script/agentctl.sh state
  script/agentctl.sh observe-after <any-agentctl-command> [args...]
  script/agentctl.sh wait-export [timeout-seconds]
  script/agentctl.sh editor-snapshot
  script/agentctl.sh control-plane
  script/agentctl.sh delivery-readiness
  script/agentctl.sh recovery-report
  script/agentctl.sh edit-target
  script/agentctl.sh demo
  script/agentctl.sh premiere-packet /absolute/path/to/episode-1.json
  script/agentctl.sh import /absolute/path/to/video.mp4
  script/agentctl.sh decision charlie 12.5 4
  script/agentctl.sh decision homer 18 6
  script/agentctl.sh decision skip 31 3
  script/agentctl.sh apply-edit-plan /absolute/path/to/edit-plan.json [save-name] [backup-name]
  script/agentctl.sh lane-role "Unresolved Camera V1 - video clip 235" homer_camera
  script/agentctl.sh lane-ignore "Unresolved Camera V1 - video clip 235" true
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
  script/agentctl.sh podcast-copy-receipt-commands
  script/agentctl.sh publication-ready-handoff
  script/agentctl.sh publication-operator-brief
  script/agentctl.sh publication-operator-runbook
  script/agentctl.sh publication-mission-control
  script/agentctl.sh ship-map-smoke
  script/agentctl.sh studio-edit-smoke
  script/agentctl.sh delivery-artifact-smoke
  script/agentctl.sh release-export-prepare [/absolute/output/folder] [basename] [proof-seconds|full] [wait-seconds]
  script/agentctl.sh release-export-smoke [/proof-folder-or-manifest.json]
  script/agentctl.sh release-export-review [/proof-folder-or-manifest.json] [--json]
  script/agentctl.sh release-receipt-ledger-prepare [/release-review-folder-or-json] [optional-basename]
  script/agentctl.sh release-receipt-ledger-update [/ledger-folder-or-json] RECEIPT_TARGET_ID scheduled|posted|proved <url-or-proof> [provider-id] [notes]
  script/agentctl.sh release-receipt-ledger-next [/ledger-folder-or-json]
  script/agentctl.sh release-receipt-ledger-smoke [/ledger-folder-or-json]
  script/agentctl.sh release-tower-local-prepare [/release-export-folder] [optional-basename]
  script/agentctl.sh vertical-slice
  script/agentctl.sh vertical-slice-packet
  script/agentctl.sh vertical-slice-packet-generate /absolute/output/folder optional-basename
  script/agentctl.sh vertical-slice-prepare [/absolute/output/folder] [optional-basename]
  script/agentctl.sh vertical-slice-next-markdown
  script/agentctl.sh vertical-slice-next-save [/absolute/output/folder] [optional-basename]
  script/agentctl.sh vertical-slice-next-smoke [/handoff-folder-or-one-loop-next.json]
  script/agentctl.sh vertical-slice-next-checkpoint [/absolute/output/folder] [optional-basename]
  script/agentctl.sh vertical-slice-next-checkpoint-markdown [/handoff-folder]
  script/agentctl.sh vertical-slice-next-validation-gate [/absolute/output/folder] [optional-basename]
  script/agentctl.sh vertical-slice-review [/proof-folder-or-manifest.json] [--json]
  script/agentctl.sh vertical-slice-smoke [/proof-folder-or-manifest.json]
  script/agentctl.sh episode-spine
  script/agentctl.sh publication-receipt-cockpit
  script/agentctl.sh publication-next-receipt
  script/agentctl.sh publication-next-receipt-markdown
  script/agentctl.sh publication-next-receipt-save [/absolute/output/folder] [optional-basename]
  script/agentctl.sh publication-writing-packet [--json]
  script/agentctl.sh publication-writing-packet-v2 [--json]
  script/agentctl.sh publication-destination-copy [--json]
  script/agentctl.sh episode1-publication-action-queue [--json]
  script/agentctl.sh episode1-studio-artifact-proof-requirements [--json]
  script/agentctl.sh episode1-studio-proof-attachment-queue [--json]
  script/agentctl.sh episode1-studio-proof-attach /absolute/release-manifest-or-folder [/absolute/output.json]
  script/agentctl.sh episode1-studio-proof-attach-latest [/absolute/output.json]
  script/agentctl.sh episode1-artifact-watch-review [/absolute/output.md|--json]
  script/agentctl.sh episode1-artifact-review-assist [/absolute/output.json]
  script/agentctl.sh episode1-artifact-sampled-contact-sheets [/absolute/output-dir]
  script/agentctl.sh episode1-artifact-sanity-review [/absolute/output.json]
  script/agentctl.sh episode1-artifact-review-samples [/absolute/output-dir]
  script/agentctl.sh episode1-artifact-review-station [/absolute/output.html]
  script/agentctl.sh episode1-tail-trim-candidate [/absolute/output-dir]
  script/agentctl.sh episode1-tail-trim-candidate-sanity
  script/agentctl.sh episode1-tail-trim-promote promote-for-review|reject-candidate [actor] [note]
  script/agentctl.sh episode1-artifact-review-status [--json]
  script/agentctl.sh episode1-artifact-review-handoff [--json]
  script/agentctl.sh episode1-artifact-review-launch [--json|--open]
  script/agentctl.sh episode1-tail-trim-ending-review [--json]
  script/agentctl.sh episode1-selected-artifact-review-station [--json|--open]
  script/agentctl.sh episode1-selected-artifact-review-assist [--json]
  script/agentctl.sh episode1-selected-watch-review-progress [--json|--html]
  script/agentctl.sh episode1-selected-watch-review-mark all:segment-001 pending|reviewed|issue|skip [actor] [note]
  script/agentctl.sh episode1-selected-segment-evidence [--json|--html]
  script/agentctl.sh episode1-selected-quality-scan [--json|--html]
  script/agentctl.sh episode1-selected-quality-triage [--json|--html]
  script/agentctl.sh episode1-selected-review-console [--json|--html]
  script/agentctl.sh episode1-selected-review-next [--json|--html]
  script/agentctl.sh episode1-selected-segment-review-pack [segment-001] [--json|--html]
  script/agentctl.sh episode1-selected-all-segment-review-packs [--json]
  script/agentctl.sh episode1-selected-review-index [--json|--html]
  script/agentctl.sh episode1-selected-review-gate [--json|--html]
  script/agentctl.sh episode1-selected-review-cockpit [--json|--html] [--refresh]
  script/agentctl.sh episode1-selected-review-session [--json|--html]
  script/agentctl.sh episode1-selected-review-session-draft [--json|--html]
  script/agentctl.sh episode1-selected-review-session-draft-add "Actor" check|answer|note|recommendation|issue "target" "response text"
  script/agentctl.sh episode1-selected-review-handoff [--json|--html]
  script/agentctl.sh episode1-selected-review-worksheet [--json|--html|--md]
  script/agentctl.sh episode1-current-next [--json|--html|--md]
  script/agentctl.sh episode1-mako-review-brief [--json|--html|--md]
  script/agentctl.sh episode1-mako-review-note [--dry-run] looks-good|needs-edit|blocked|note overall|cut|crop|audio|caption|pace|media|tool|other target "note text"
  script/agentctl.sh episode1-selected-review-notes [--json|--html]
  script/agentctl.sh episode1-selected-machine-review-summary [--json|--html]
  script/agentctl.sh episode1-selected-review-note-add "Actor" "scope" "observation"
  script/agentctl.sh episode1-artifact-watch-review-decision pass|needs-review|needs-fix|reject [actor] [note]
  script/agentctl.sh episode1-vertical-slice-refresh [/absolute/output.json]
  script/agentctl.sh episode1-vertical-slice-brief [--json]
  script/agentctl.sh episode1-vertical-slice-next [--json]
  script/agentctl.sh episode1-writing-tower-readiness [--json]
  script/agentctl.sh episode1-writing-nest-queue [--json]
  script/agentctl.sh episode1-writing-nest-ingest-receipt [--json]
  script/agentctl.sh episode1-writing-provenance [--json]
  script/agentctl.sh episode1-writing-draft-v2 [--json]
  script/agentctl.sh episode1-writing-current [--json]
  script/agentctl.sh episode1-writing-loop-status [--json]
  script/agentctl.sh episode1-writing-nest-intake [--json]
  script/agentctl.sh episode1-writing-human-handoff [--json]
  script/agentctl.sh episode1-writing-compare [--json]
  script/agentctl.sh episode1-writing-handoff [--json]
  script/agentctl.sh episode1-writing-review-checklist [--json]
  script/agentctl.sh episode1-writing-review-bundle [--json]
  script/agentctl.sh episode1-writing-review-ledger [--json]
  script/agentctl.sh episode1-writing-review-status [--json]
  script/agentctl.sh episode1-writing-review-decision needs-agent-revision|needs-human-rewrite|mixed-authorship-ready|canon-approved|publication-ready [actor] [note]
  script/agentctl.sh publication-reveal-release
  script/agentctl.sh publication-copy-mission
  script/agentctl.sh publication-copy-missing-receipts
  script/agentctl.sh episode-copy-receipt-commands
  script/agentctl.sh production-command-center-native fast|live [open]
  script/agentctl.sh production-command-center-open
  script/agentctl.sh episode1-socials-load
  script/agentctl.sh social-master-queue-promote-receipts
  script/agentctl.sh social-master-posting-run-packet
  script/agentctl.sh social-master-open-posting-run-packet
  script/agentctl.sh social-master-reveal-posting-run-packet
  script/agentctl.sh social-master-copy-posting-session
  script/agentctl.sh social-master-copy-receipt-command
  script/agentctl.sh social-master-copy-receipt-commands
  script/agentctl.sh social-master-select-receipt-platform "YouTube Shorts" [published|scheduled|uploaded]
  script/agentctl.sh social-master-select-next-posting-platform
  script/agentctl.sh social-master-queue-receipt-batch $'Instagram,scheduled,<real-platform-url>,<provider-id>,notes\nFacebook,published,<real-platform-url>,,notes'
  script/agentctl.sh publish-receipt-update RECEIPT_ID published https://example.com provider-id "notes" '{"title":"Custom"}' integration-needed
  script/agentctl.sh publish-receipt-update-platform YouTube episode-16x9-master published https://example.com provider-id "notes" "Episode title" "Episode description"
  script/agentctl.sh missing-publication-receipts
  script/agentctl.sh episode-receipt-capture YouTube published https://example.com provider-id "notes"
  script/agentctl.sh podcast-receipt-capture Spotify published https://example.com provider-id "notes"
  script/agentctl.sh publish-upload-packet RECEIPT_ID
  script/agentctl.sh save-session episode-2-native
  script/agentctl.sh load-session episode-2-native
  script/agentctl.sh load-session-wait episode-2-native [timeout-seconds]
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
  script/agentctl.sh left-workbench nest|shorts|transcript|publish|inspector|closed
  script/agentctl.sh nest-seed-context
  script/agentctl.sh nest-ensure-writing-document
  script/agentctl.sh nest-writing-queue
  script/agentctl.sh nest-writing-packet
  script/agentctl.sh nest-writing-packet-generate /absolute/output/folder optional-basename
  script/agentctl.sh nest-writing-review [/proof-folder-or-packet.json] [--json]
  script/agentctl.sh nest-writing-smoke
  script/agentctl.sh nest-writing-next-action [one-based-index] [optional-kind-or-label]
  script/agentctl.sh nest-outline
  script/agentctl.sh nest-append-block "Title" "Text" ["tag1,tag2"] [role] [episode-slug] [authorship] [provenance] [review-status]
  script/agentctl.sh nest-serious-draft "Title" "Draft text" [episode-slug] ["tag1,tag2"] ["why this draft exists"]
  script/agentctl.sh nest-serious-draft-file "Title" /absolute/path/to/draft.md [episode-slug] ["tag1,tag2"] ["why this draft exists"] [review-status]
  script/agentctl.sh nest-select-block BLOCK_ID
  script/agentctl.sh nest-update-block BLOCK_ID role tags episode chapter ["note"]
  script/agentctl.sh nest-replace-block-text BLOCK_ID "New text" ["note"] ["review-status"]
  script/agentctl.sh nest-mark-block canon-approved ["review note"] [block-id]
  script/agentctl.sh transcript-seed-demo
  script/agentctl.sh transcript-import /absolute/path/to/transcript.srt auto
  script/agentctl.sh transcript-generate "Charlie Audio" /absolute/path/to/transcriber-command
  script/agentctl.sh transcript-generate-selected /absolute/path/to/transcriber-command
  script/agentctl.sh transcript-search "stewardship" first|next|previous|current
  script/agentctl.sh transcript-select first
  script/agentctl.sh transcript-select at_playhead
  script/agentctl.sh transcript-word current|next|previous|first|last [segment-id] [word-index]
  script/agentctl.sh transcript-create-short current "Optional title" 1 2
  script/agentctl.sh transcript-create-short selected "Optional title" 0.5 1.5
  script/agentctl.sh transcript-apply-to-short caption
  script/agentctl.sh transcript-clear
  script/agentctl.sh transcript-clear-jobs
  script/agentctl.sh edit-pass "Codex Episode 2 first pass" Codex agent 1 "Review pacing and shorts" active
  script/agentctl.sh correction-note "This cut should breathe longer." Codex agent edit-correction
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
  script/agentctl.sh shorts-queue-summary
  script/agentctl.sh shorts-local-export-board [--json|--html|--md] [/absolute/output/folder] [basename]
  script/agentctl.sh shorts-growth-quality-board [--json|--html|--md] [/absolute/output/folder] [basename]
  script/agentctl.sh shorts-platform-package-board [--json|--html|--md] [/absolute/output/folder] [basename]
  script/agentctl.sh shorts-improvement-plan [--json|--html|--md] [/absolute/output/folder] [basename]
  script/agentctl.sh shorts-add-selected "Optional title"
  script/agentctl.sh shorts-add-range 3000 3045 "Identity Changes Behavior"
  script/agentctl.sh shorts-select id SHORT_CLIP_ID
  script/agentctl.sh shorts-select title "Identity Changes Behavior"
  script/agentctl.sh shorts-select index 1
  script/agentctl.sh ship-short-review id SHORT_CLIP_ID
  script/agentctl.sh ship-short-review title "Identity Changes Behavior"
  script/agentctl.sh ship-short-review index 1
  script/agentctl.sh ship-short-cue id SHORT_CLIP_ID
  script/agentctl.sh ship-short-cue title "Identity Changes Behavior"
  script/agentctl.sh ship-short-cue index 1
  script/agentctl.sh shorts-review-next [optional-status]
  script/agentctl.sh shorts-review-navigator
  script/agentctl.sh shorts-review-run-next
  script/agentctl.sh shorts-review-cue-next [--json]
  script/agentctl.sh shorts-review-listen-guide [--json]
  script/agentctl.sh shorts-audio-sanity /path/to/exported-short.mp4 [expected-duration-seconds]
  script/agentctl.sh shorts-audio-sanity-next
  script/agentctl.sh shorts-listen-review-packet /absolute/output/folder [basename]
  script/agentctl.sh shorts-listen-review-path
  script/agentctl.sh shorts-listen-review-open
  script/agentctl.sh shorts-append-selected-segment
  script/agentctl.sh shorts-update-selected hook "Opening hook"
  script/agentctl.sh shorts-quality-action fill-hook|draft-copy|draft-platform-pack|copy-platform-pack-json|save-platform-pack-json|copy-polish-prompt|needs-refine
  script/agentctl.sh shorts-platform-pack-index save|copy
  script/agentctl.sh shorts-overlay-burn-in request_review|approve_top_canopy|hold ["optional note"]
  script/agentctl.sh shorts-listen-through ["optional note"]
  script/agentctl.sh shorts-text-review approve|rewrite ["optional note"]
  script/agentctl.sh shorts-review-selected keep "optional notes"
  script/agentctl.sh shorts-review SHORT_CLIP_ID keep "optional notes"
  script/agentctl.sh shorts-preview-selected play
  script/agentctl.sh shorts-range-selected start delta -0.1
  script/agentctl.sh shorts-range-selected end time 42.5
  script/agentctl.sh shorts-export-selected /absolute/output/folder optional-basename
  script/agentctl.sh shorts-export-all /absolute/output/folder optional-basename
  script/agentctl.sh shorts-contact-sheet /absolute/exported-short.mp4 [/absolute/output.png]
  script/agentctl.sh short-review-template [--output /absolute/output/folder] [--basename review-decisions] [session-name ...]
  script/agentctl.sh review-shorts-import /absolute/review-shorts-decisions.json [--execute] [--save]
  script/agentctl.sh production-command-center [--output /absolute/output/folder] [--generate-reviewed] [--reuse-existing] [--open] [session-name ...]
  script/agentctl.sh episodes-social-readiness [--generate-reviewed] [--output /absolute/output/folder] [session-name ...]
  script/agentctl.sh episodes-release-readiness [--output /absolute/output/folder] [--proof-seconds 30] [session-name ...]
  script/agentctl.sh reviewed-social-queue --session episode-3-premiere-rescue --output /absolute/output/folder [--basename ep3-approved] [--include-status keep]
  script/agentctl.sh reviewed-social-queue-generate /absolute/output/folder optional-basename
  script/agentctl.sh social-shorts-packet
  script/agentctl.sh social-shorts-packet-generate /absolute/output/folder optional-basename
  script/agentctl.sh social-publication-queue-generate /absolute/output/folder optional-basename
  script/agentctl.sh social-expansion-harvest /absolute/episode-9x16-master.mp4 /absolute/candidates.json /absolute/output/folder ["Episode 1 - The Wednesday Rule"] ["High Ground Odyssey Episode 1: The Wednesday Rule"] [--zip]
  script/agentctl.sh social-master-queue /absolute/output/folder [--episode-title "Episode Title"] /absolute/social-queue.json /absolute/social-expansion-pack.json [...]
  script/agentctl.sh social-master-queue-state
  script/agentctl.sh social-master-queue-load-latest
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
  - Start Codex editing sessions with codex-observe, then a semantic command,
    then observe-after. Do not infer edit truth from pixels when the app exposes
    semantic state.
  - Use codex-act-save for meaningful agent edits. It saves before/response/after
    packets so humans can inspect what the agent saw and what changed.
  - Use codex-act-review latest after an agent edit to get the important changes
    without spelunking raw JSON.
  - Use codex-session-review to inspect the whole saved agent-edit trail.
  - Use codex-release-observe before release/publishing work. It gathers the
    editor handoff, delivery readiness, publication handoff, missing receipts,
    and social/podcast state into one proof-first packet.
  - Use codex-release-act-save for release/publishing commands. It saves release
    before/response/after packets so prepared, posted, and proved stay separate.
  - Use codex-release-act-review latest after release/publishing commands to see
    release-important state changes without opening raw packets first.
  - Use codex-release-session-review after a release/publishing run to inspect
    the full release-action trail before claiming anything shipped.
  - Use codex-production-review for one top-level report across audited edit and
    release work in the current observation folder.
  - Use codex-audit-status for a quick evidence-health check of the observation
    folder before trusting or handing off a production run.
  - Use codex-production-handoff to package the current observe/release/audit
    evidence into one timestamped folder for humans, agents, or collaborators.
  - Use vertical-slice-prepare to create one readable Nest -> Studio -> Tower
    proof folder. It writes stable START-HERE.md and latest-vertical-slice-manifest.json
    entrypoints plus run-specific audit artifacts.
USAGE
}

urlencode() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

get() {
  curl --fail --silent --show-error --max-time "${QUIPSLY_AGENT_TIMEOUT:-15}" "$BASE_URL$1"
  printf '\n'
}

selected_short_export_selector_query() {
  python3 - "$BASE_URL" <<'PY'
import json
import sys
import urllib.parse
import urllib.request

base = sys.argv[1].rstrip("/")
try:
    with urllib.request.urlopen(base + "/state", timeout=2) as response:
        state = json.loads(response.read().decode("utf-8", errors="replace"))
except Exception:
    print("")
    raise SystemExit(0)

proof = state.get("selectedShortProof") or {}
clip = state.get("selectedShortClip") or {}
short_id = str(proof.get("id") or clip.get("id") or "").strip()
title = str(proof.get("title") or clip.get("title") or "").strip()
params = {}
if short_id:
    params["id"] = short_id
if title:
    params["title"] = title
print(("&" + urllib.parse.urlencode(params)) if params else "")
PY
}

wait_active_session() {
  local expected="${1:-}"
  local timeout="${2:-30}"
  python3 - "$BASE_URL" "$expected" "$timeout" <<'PY'
import json
import sys
import time
import urllib.request

base_url, expected, timeout = sys.argv[1], sys.argv[2], float(sys.argv[3])
deadline = time.time() + timeout
last = {}

while time.time() < deadline:
    try:
        with urllib.request.urlopen(base_url.rstrip("/") + "/state", timeout=2) as response:
            last = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        last = {"error": str(exc)}
    if last.get("activeSessionName") == expected:
        print(json.dumps({
            "status": "active_session_ready",
            "activeSessionName": last.get("activeSessionName"),
            "shortCount": (last.get("shortClipQueue") or {}).get("count"),
            "productionReady": last.get("productionReady"),
            "productionReadinessDetail": last.get("productionReadinessDetail"),
        }, indent=2, sort_keys=True))
        raise SystemExit(0)
    time.sleep(0.25)

print(json.dumps({
    "status": "active_session_timeout",
    "expected": expected,
    "lastActiveSessionName": last.get("activeSessionName"),
    "lastError": last.get("error", ""),
}, indent=2, sort_keys=True), file=sys.stderr)
raise SystemExit(1)
PY
}

ship_map_smoke() {
  local state_path mission_path
  state_path="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-ship-state.XXXXXX")"
  mission_path="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-ship-mission.XXXXXX")"

  get "/state" > "$state_path"
  get "/publication_mission_control" > "$mission_path"

  python3 - "$state_path" "$mission_path" <<'PY'
import json
import shlex
import sys

state_path, mission_path = sys.argv[1:3]
with open(state_path) as f:
    state = json.load(f)
with open(mission_path) as f:
    direct_mission = json.load(f)

state_mission = state.get("publicationMissionControl") or {}
handoff = state.get("publicationReadyHandoff") or {}
receipt_proof = handoff.get("receiptProof") or {}
handoff_receipt_summary = receipt_proof.get("summary") or {}
direct_summary = direct_mission.get("summary") or {}
state_summary = state_mission.get("summary") or {}

def check(name, expected, actual, explanation):
    return {
        "name": name,
        "ok": expected == actual,
        "expected": expected,
        "actual": actual,
        "explanation": explanation,
    }

checks = [
    check(
        "direct mission status matches state mission status",
        direct_mission.get("status"),
        state_mission.get("status"),
        "The endpoint and /state should expose the same Tower mission status.",
    ),
    check(
        "ready lane count matches handoff",
        direct_summary.get("readyLaneCount"),
        handoff.get("readyLaneCount"),
        "The Ship Map readiness deck is driven by the same ready-lane count as Mission Control.",
    ),
    check(
        "lane count matches handoff",
        direct_summary.get("laneCount"),
        handoff.get("laneCount"),
        "Mission Control and the ready-to-publish handoff should agree on the number of output lanes.",
    ),
    check(
        "publication complete matches receipt handoff",
        direct_summary.get("publicationComplete"),
        handoff_receipt_summary.get("publicationComplete"),
        "Tower must not call publication complete unless receipt proof says it is complete.",
    ),
    check(
        "missing receipt count matches receipt handoff",
        direct_summary.get("missingReceiptCount"),
        handoff_receipt_summary.get("receiptRemainingCount"),
        "Receipt gaps should be consistent between Mission Control and the handoff panel.",
    ),
    check(
        "state mission summary mirrors direct mission summary",
        direct_summary,
        state_summary,
        "/state publicationMissionControl should be a current copy of /publication_mission_control.",
    ),
]

deliverables = direct_mission.get("deliverables") or []
checks.append({
    "name": "mission exposes required deliverables",
    "ok": len(deliverables) >= 4,
    "expected": "at least 4 deliverables",
    "actual": len(deliverables),
    "explanation": "Nest writing, 16:9 episode, 9:16 social, and podcast audio should all be visible.",
})

ok = all(item["ok"] for item in checks)
print(json.dumps({
    "model": "quipsly-ship-map-smoke",
    "version": "2026-06-20.ship-map-smoke.v1",
    "ok": ok,
    "status": direct_mission.get("status"),
    "nextAction": direct_mission.get("nextAction"),
    "checks": checks,
    "truth": "This is a read-only consistency check. It proves Tower's visible handoff state and mission-control endpoint agree; it does not publish, upload, or capture receipts.",
}, indent=2))

sys.exit(0 if ok else 1)
PY
}

studio_edit_smoke() {
  local state_path snapshot_path delivery_path shorts_path
  state_path="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-edit-state.XXXXXX")"
  snapshot_path="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-edit-snapshot.XXXXXX")"
  delivery_path="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-edit-delivery.XXXXXX")"
  shorts_path="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-edit-shorts.XXXXXX")"

  get "/state" > "$state_path"
  get "/editor_snapshot" > "$snapshot_path"
  get "/delivery_readiness" > "$delivery_path"
  get "/shorts_queue" > "$shorts_path"

  python3 - "$state_path" "$snapshot_path" "$delivery_path" "$shorts_path" <<'PY'
import json
import sys

state_path, snapshot_path, delivery_path, shorts_path = sys.argv[1:5]
with open(state_path, "r", encoding="utf-8") as handle:
    state = json.load(handle)
with open(snapshot_path, "r", encoding="utf-8") as handle:
    snapshot = json.load(handle)
with open(delivery_path, "r", encoding="utf-8") as handle:
    delivery = json.load(handle)
with open(shorts_path, "r", encoding="utf-8") as handle:
    shorts = json.load(handle)

lanes = state.get("lanes") or []
video_lanes = [
    lane for lane in lanes
    if str(lane.get("mediaKind") or "").lower() == "video" and not lane.get("ignoreForProduction")
]
audio_lanes = [
    lane for lane in lanes
    if str(lane.get("mediaKind") or "").lower() == "audio" and not lane.get("ignoreForProduction")
]
ready_video_lanes = [
    lane for lane in video_lanes
    if lane.get("sourceReady") is True or lane.get("sourceMonitorPlayerReady") is True or (lane.get("sourceReadiness") == "ready")
]
delivery_counts = delivery.get("counts") or {}
snapshot_evidence = snapshot.get("evidence") or {}
short_clips = shorts.get("clips") or (state.get("shortClipQueue") or {}).get("clips") or []
short_truth = (state.get("shortClipQueue") or {}).get("truth") or ""
source_sync = state.get("sourceSyncProof") or {}
agent_capabilities = state.get("agentCapabilityParity") or []
agent_ids = {str(item.get("id") or "") for item in agent_capabilities if isinstance(item, dict)}

def number(*values):
    for value in values:
        if isinstance(value, (int, float)):
            return value
        try:
            if value is not None and str(value).strip() != "":
                return float(value)
        except Exception:
            pass
    return 0

lane_count = int(number(state.get("laneCount"), len(lanes)))
video_proxy_ready = int(number(state.get("videoProxyReadyCount"), delivery_counts.get("videoProxyReady"), snapshot_evidence.get("videoProxyReadyCount"), len(ready_video_lanes)))
proxy_blocked = int(number(state.get("proxyBlockedCount"), delivery_counts.get("videoBlocked"), snapshot_evidence.get("videoBlockedCount")))
show_count = int(number(state.get("showDecisionCount"), delivery_counts.get("showDecisions"), snapshot_evidence.get("showDecisionCount")))
skip_count = int(number(state.get("skipDecisionCount"), delivery_counts.get("skipDecisions"), snapshot_evidence.get("skipDecisionCount")))
short_count = int(number(state.get("shortClipQueueCount"), (state.get("shortClipQueue") or {}).get("count"), delivery_counts.get("shortClipQueue"), shorts.get("clipCount"), len(short_clips)))
source_monitor_count = int(number(state.get("sourceMonitorVideoCount"), source_sync.get("sourceMonitorVideoCount"), snapshot_evidence.get("sourceMonitorVideoCount")))
source_player_count = int(number(state.get("sourcePlayerCount"), source_sync.get("sourcePlayerCount"), snapshot_evidence.get("sourcePlayerCount")))

checks = []

def check(name, ok, detail, expected=None, actual=None):
    checks.append({
        "name": name,
        "ok": bool(ok),
        "detail": detail,
        "expected": expected,
        "actual": actual,
    })

check(
    "editor snapshot production ready",
    snapshot.get("status") == "production_ready" and snapshot.get("canEditNow") is True,
    "The native editor should expose an edit-ready snapshot, not only raw state.",
    expected="production_ready and canEditNow=true",
    actual={"status": snapshot.get("status"), "canEditNow": snapshot.get("canEditNow")},
)
check(
    "architecture invariant is metadata-first",
    "Whole source lanes" in str(snapshot.get("architectureInvariant") or "") and "no chopped source clips" in str(snapshot.get("architectureInvariant") or ""),
    "Studio must stay source-lane + metadata-decision based.",
    expected="Whole source lanes plus metadata decisions; no chopped source clips.",
    actual=snapshot.get("architectureInvariant"),
)
check(
    "whole source lanes loaded",
    lane_count >= 3 and len(video_lanes) >= 2,
    "Episode editing needs whole synced lanes, not isolated chopped clips.",
    expected="at least 3 lanes and 2 video lanes",
    actual={"laneCount": lane_count, "videoLaneCount": len(video_lanes), "audioLaneCount": len(audio_lanes)},
)
check(
    "proxy-first preview ready",
    snapshot.get("proxyFirst") is True and video_proxy_ready >= 2 and proxy_blocked == 0,
    "The editor should work from proxies and avoid requiring raw-original playback for normal editing.",
    expected="proxyFirst true, >=2 video proxies, 0 blocked",
    actual={"proxyFirst": snapshot.get("proxyFirst"), "videoProxyReady": video_proxy_ready, "proxyBlocked": proxy_blocked},
)
check(
    "shared source monitor sync is passing",
    source_sync.get("sourceSyncPassing") is True and source_monitor_count >= 2 and source_player_count >= 2,
    "One sequence playhead should drive Program Output, source monitors, timeline, and agent state.",
    expected="sourceSyncPassing true, >=2 monitors, >=2 players",
    actual={
        "sourceSyncPassing": source_sync.get("sourceSyncPassing"),
        "status": source_sync.get("status"),
        "sourceMonitorVideoCount": source_monitor_count,
        "sourcePlayerCount": source_player_count,
        "maxDelta": source_sync.get("maxSourcePlayerDeltaSeconds"),
    },
)
check(
    "show and skip decisions exist",
    show_count > 0 and skip_count > 0,
    "Play Edit needs visible SHOW/SKIP decisions layered over the source lanes.",
    expected="show > 0 and skip > 0",
    actual={"show": show_count, "skip": skip_count},
)
check(
    "shorts are recipe-based",
    short_count > 0 and ("recipes over sequence time" in short_truth or shorts.get("canBatchExport") is True),
    "Shorts should be output recipes over sequence time, not chopped media files.",
    expected="short queue > 0 and recipe truth/batch endpoint",
    actual={"shortCount": short_count, "truth": short_truth, "canBatchExport": shorts.get("canBatchExport")},
)
check(
    "delivery readiness is render-ready but receipt-honest",
    delivery.get("renderFoundationReady") is True and delivery.get("visualRoughCutReady") is True and delivery.get("readyForDirectPublishing") is False,
    "Studio can prepare exports while Tower remains honest about publishing integration/receipt gaps.",
    expected="render ready, visual ready, direct publishing false",
    actual={
        "renderFoundationReady": delivery.get("renderFoundationReady"),
        "visualRoughCutReady": delivery.get("visualRoughCutReady"),
        "readyForDirectPublishing": delivery.get("readyForDirectPublishing"),
    },
)
check(
    "delivery source policy is proxy-first",
    "proxy-first" in str(delivery.get("sourcePolicy") or "").lower() and "originals stay untouched" in str(delivery.get("sourcePolicy") or "").lower(),
    "Delivery readiness must preserve original-media boundaries.",
    expected="proxy-first; originals stay untouched unless explicitly granted",
    actual=delivery.get("sourcePolicy"),
)
for capability in [
    "monitor-wall-scrub",
    "play-edit-through",
    "visual-decision-editing",
    "source-window-live-switching",
    "timeline-precision-navigation",
    "publish-workbench",
]:
    check(
        f"agent capability exposed: {capability}",
        capability in agent_ids,
        "Codex needs semantic controls for the same work humans do in Studio.",
        expected=capability,
        actual=sorted(agent_ids),
    )

ok = all(item["ok"] for item in checks)
print(json.dumps({
    "model": "quipsly-studio-edit-smoke",
    "version": "2026-06-20.studio-edit-smoke.v1",
    "ok": ok,
    "status": snapshot.get("status"),
    "sequenceTitle": state.get("sequenceTitle"),
    "playbackMode": state.get("playbackMode"),
    "counts": {
        "laneCount": lane_count,
        "videoLaneCount": len(video_lanes),
        "audioLaneCount": len(audio_lanes),
        "videoProxyReady": video_proxy_ready,
        "proxyBlocked": proxy_blocked,
        "sourceMonitorVideoCount": source_monitor_count,
        "sourcePlayerCount": source_player_count,
        "showDecisions": show_count,
        "skipDecisions": skip_count,
        "shortRecipes": short_count,
        "agentCapabilities": len(agent_ids),
    },
    "nextSafeAction": snapshot.get("nextSafeAction") or delivery.get("nextSafeAction"),
    "checks": checks,
    "truth": "This is a read-only Studio consistency check. It proves the native editor exposes proxy-first whole source lanes, metadata SHOW/SKIP decisions, synced monitors, short recipes, and agent-operable controls; it does not mutate edits, exports, or publication receipts.",
}, indent=2))

sys.exit(0 if ok else 1)
PY
}

delivery_artifact_smoke() {
  local state_path delivery_path handoff_path publish_path podcast_path
  state_path="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-delivery-state.XXXXXX")"
  delivery_path="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-delivery-packet.XXXXXX")"
  handoff_path="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-delivery-handoff.XXXXXX")"
  publish_path="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-delivery-publish.XXXXXX")"
  podcast_path="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-delivery-podcast.XXXXXX")"

  get "/state" > "$state_path"
  get "/delivery_packet" > "$delivery_path"
  get "/publication_ready_handoff" > "$handoff_path"
  get "/publish_packet" > "$publish_path"
  get "/podcast_packet" > "$podcast_path"

  python3 - "$state_path" "$delivery_path" "$handoff_path" "$publish_path" "$podcast_path" <<'PY'
import json
import os
import sys

state_path, delivery_path, handoff_path, publish_path, podcast_path = sys.argv[1:6]
with open(state_path, "r", encoding="utf-8") as handle:
    state = json.load(handle)
with open(delivery_path, "r", encoding="utf-8") as handle:
    delivery = json.load(handle)
with open(handoff_path, "r", encoding="utf-8") as handle:
    handoff = json.load(handle)
with open(publish_path, "r", encoding="utf-8") as handle:
    publish = json.load(handle)
with open(podcast_path, "r", encoding="utf-8") as handle:
    podcast = json.load(handle)

readiness = delivery.get("readiness") or state.get("deliveryReadiness") or {}
readiness_counts = readiness.get("counts") or {}
artifacts = delivery.get("artifacts") or []
destinations = delivery.get("destinations") or []
receipt_summary = ((handoff.get("receiptProof") or {}).get("summary") or {})
selected_short_proof = state.get("selectedShortProof") or {}
delivery_path_items = state.get("deliveryPath") or []
publish_output_path = (publish.get("outputPath") or "").strip()
podcast_receipt_commands = podcast.get("receiptCaptureCommands") or podcast.get("receiptCaptureCommand") or ""

artifact_ids = {str(item.get("id") or "") for item in artifacts if isinstance(item, dict)}
artifact_statuses = {str(item.get("id") or ""): str(item.get("status") or "") for item in artifacts if isinstance(item, dict)}
artifact_next_actions = [item.get("nextAction") for item in artifacts if isinstance(item, dict)]
destination_platforms = {str(item.get("platform") or "") for item in destinations if isinstance(item, dict)}
delivery_path_ids = {str(item.get("id") or "") for item in delivery_path_items if isinstance(item, dict)}

def int_value(value, default=0):
    try:
        if value is None or str(value).strip() == "":
            return default
        return int(value)
    except Exception:
        return default

checks = []

def check(name, ok, detail, expected=None, actual=None):
    checks.append({
        "name": name,
        "ok": bool(ok),
        "detail": detail,
        "expected": expected,
        "actual": actual,
    })

required_artifact_ids = {
    "episode-16x9-master-artifact",
    "episode-9x16-master-artifact",
    "social-short-clips-artifact",
    "podcast-audio-master-artifact",
}
check(
    "delivery packet exposes required artifact families",
    required_artifact_ids.issubset(artifact_ids),
    "Tower needs named 16:9, 9:16, shorts, and podcast artifact families before publication work can be sane.",
    expected=sorted(required_artifact_ids),
    actual=sorted(artifact_ids),
)
check(
    "artifact families have next actions",
    len([item for item in artifact_next_actions if item]) >= len(required_artifact_ids),
    "Export-needed is acceptable, but every artifact family should tell the operator what to do next.",
    expected=f">={len(required_artifact_ids)} next actions",
    actual=artifact_next_actions,
)
check(
    "render foundation is ready",
    readiness.get("renderFoundationReady") is True and readiness.get("visualRoughCutReady") is True,
    "The edit foundation should be ready to render artifacts even when files still need export.",
    expected="renderFoundationReady and visualRoughCutReady true",
    actual={
        "renderFoundationReady": readiness.get("renderFoundationReady"),
        "visualRoughCutReady": readiness.get("visualRoughCutReady"),
    },
)
check(
    "artifact statuses are honest about export need",
    all(status in {"export-needed", "ready", "exported", "generated", "missing"} for status in artifact_statuses.values()),
    "Artifact rows should use explicit artifact states, not vague success language.",
    expected="explicit artifact statuses",
    actual=artifact_statuses,
)
check(
    "direct platform publishing remains false",
    delivery.get("readyForDirectPublishing") is False and readiness.get("readyForDirectPublishing") is False,
    "Render readiness must not be conflated with authenticated platform publishing.",
    expected=False,
    actual={
        "delivery": delivery.get("readyForDirectPublishing"),
        "readiness": readiness.get("readyForDirectPublishing"),
    },
)
check(
    "receipt boundary remains incomplete",
    receipt_summary.get("publicationComplete") is False and int_value(receipt_summary.get("receiptRemainingCount")) > 0,
    "Prepared/exportable artifacts are not publication proof; receipts still need capture.",
    expected="publicationComplete false and receiptRemainingCount > 0",
    actual=receipt_summary,
)
check(
    "publication-ready handoff exposes all lanes",
    handoff.get("readyLaneCount") == handoff.get("laneCount") and int_value(handoff.get("laneCount")) >= 3,
    "The handoff should expose episode, shorts, and podcast lanes as ready to work.",
    expected="readyLaneCount == laneCount >= 3",
    actual={"readyLaneCount": handoff.get("readyLaneCount"), "laneCount": handoff.get("laneCount")},
)
check(
    "delivery path exposes proof lane",
    {"wide-episode-master", "vertical-social-shorts", "podcast-audio", "publication-proof"}.issubset(delivery_path_ids),
    "/state.deliveryPath should tell operators where the work stands without opening raw packets.",
    expected=["wide-episode-master", "vertical-social-shorts", "podcast-audio", "publication-proof"],
    actual=sorted(delivery_path_ids),
)
check(
    "selected short export proof is inspectable",
    selected_short_proof.get("lastExportExists") is True and bool(selected_short_proof.get("lastExportedPath")),
    "At least one selected short should carry a concrete exported proof artifact for review.",
    expected="lastExportExists true + lastExportedPath",
    actual={
        "lastExportExists": selected_short_proof.get("lastExportExists"),
        "lastExportedPath": selected_short_proof.get("lastExportedPath"),
        "reviewStatus": selected_short_proof.get("reviewStatus"),
    },
)
check(
    "selected short proof preserves recipe truth",
    selected_short_proof.get("supportsMultipleSegments") is True and "whole source lanes" in str(selected_short_proof.get("contract") or ""),
    "Short exports should remain recipes over the episode spine, not chopped source files.",
    expected="supportsMultipleSegments true + whole source lane contract",
    actual={
        "supportsMultipleSegments": selected_short_proof.get("supportsMultipleSegments"),
        "contract": selected_short_proof.get("contract"),
    },
)
check(
    "publish packet is discoverable",
    publish.get("status") in {"discovered", "generated", "ready"} and bool(publish_output_path),
    "The Tower publish packet should be findable even before direct integrations exist.",
    expected="status discovered/generated/ready + outputPath",
    actual={"status": publish.get("status"), "outputPath": publish_output_path, "exists": os.path.exists(publish_output_path)},
)
check(
    "podcast packet exposes receipt commands",
    "podcast-receipt-capture" in str(podcast_receipt_commands),
    "Podcast output can be prepared before publishing, but receipt capture commands must be visible.",
    expected="podcast-receipt-capture command",
    actual=podcast_receipt_commands,
)
check(
    "destination matrix includes core platforms",
    {"YouTube", "Patreon", "YouTube Shorts", "Instagram", "Facebook", "LinkedIn", "Spotify", "Apple Podcasts"}.issubset(destination_platforms),
    "Tower should know where each artifact family is headed even before integrations are automated.",
    expected=["YouTube", "Patreon", "YouTube Shorts", "Instagram", "Facebook", "LinkedIn", "Spotify", "Apple Podcasts"],
    actual=sorted(destination_platforms),
)
check(
    "delivery counts show editable source foundation",
    int_value(readiness_counts.get("videoProxyReady")) >= 2 and int_value(readiness_counts.get("shortRecipeQueue")) > 0,
    "Delivery readiness should be grounded in the Studio edit, not a freestanding publishing wish list.",
    expected="videoProxyReady >= 2 and shortRecipeQueue > 0",
    actual=readiness_counts,
)

ok = all(item["ok"] for item in checks)
print(json.dumps({
    "model": "quipsly-delivery-artifact-smoke",
    "version": "2026-06-20.delivery-artifact-smoke.v1",
    "ok": ok,
    "status": "truthful-artifacts-ready-to-prepare" if ok else "delivery-artifact-proof-failed",
    "sequenceTitle": state.get("sequenceTitle"),
    "deliveryStatus": delivery.get("status"),
    "renderFoundationReady": readiness.get("renderFoundationReady"),
    "readyForDirectPublishing": delivery.get("readyForDirectPublishing"),
    "publicationComplete": receipt_summary.get("publicationComplete"),
    "receiptRemainingCount": receipt_summary.get("receiptRemainingCount"),
    "artifactStatuses": artifact_statuses,
    "selectedShortExportPath": selected_short_proof.get("lastExportedPath"),
    "publishPacketOutputPath": publish_output_path,
    "checks": checks,
    "truth": "This is a read-only delivery artifact smoke. It proves Quipsly can name the output families, export/readiness state, selected short proof, publish/podcast packet surfaces, and receipt boundary without uploading, scheduling, publishing, or claiming publication.",
}, indent=2))

raise SystemExit(0 if ok else 1)
PY
}

release_export_prepare() {
  local output_dir="${1:-$HOME/Movies/QuipslyExports/Episode1Tower}"
  local basename="${2:-episode1-the-wednesday-rule-release-proof}"
  local proof_seconds="${3:-8}"
  local wait_seconds="${4:-180}"
  local export_proof_seconds="$proof_seconds"
  if [[ "$proof_seconds" == "full" || "$proof_seconds" == "FULL" || "$proof_seconds" == "all" ]]; then
    export_proof_seconds=""
  fi

  mkdir -p "$output_dir"

  local before_smoke_path command_path wait_path delivery_packet_path publish_packet_path podcast_packet_path after_smoke_path manifest_path start_here_path
  before_smoke_path="$output_dir/$basename-00-before-delivery-artifact-smoke.json"
  command_path="$output_dir/$basename-01-full-release-prepare-command.json"
  wait_path="$output_dir/$basename-02-export-wait-receipt.json"
  delivery_packet_path="$output_dir/$basename-03-delivery-packet-generate.json"
  publish_packet_path="$output_dir/$basename-04-publish-packet-generate.json"
  podcast_packet_path="$output_dir/$basename-05-podcast-packet-generate.json"
  after_smoke_path="$output_dir/$basename-06-after-delivery-artifact-smoke.json"
  manifest_path="$output_dir/$basename-release-export-manifest.json"
  start_here_path="$output_dir/START-HERE-$basename-release-export.md"

  delivery_artifact_smoke > "$before_smoke_path"
  get "/full_release_prepare?directory=$(urlencode "$output_dir")&basename=$(urlencode "$basename")&proof_seconds=$(urlencode "$export_proof_seconds")" > "$command_path"
  wait_export "$wait_seconds" > "$wait_path"
  get "/delivery_packet_generate?directory=$(urlencode "$output_dir")&basename=$(urlencode "$basename-delivery")" > "$delivery_packet_path"
  get "/publish_packet_generate?directory=$(urlencode "$output_dir")&basename=$(urlencode "$basename-publish")" > "$publish_packet_path"
  get "/podcast_packet_generate?directory=$(urlencode "$output_dir")&basename=$(urlencode "$basename-podcast")" > "$podcast_packet_path"
  delivery_artifact_smoke > "$after_smoke_path"

  python3 - "$manifest_path" "$start_here_path" "$output_dir" "$basename" "$proof_seconds" "$wait_seconds" "$before_smoke_path" "$command_path" "$wait_path" "$delivery_packet_path" "$publish_packet_path" "$podcast_packet_path" "$after_smoke_path" <<'PY'
import json
import glob
import os
import shutil
import sys
from datetime import datetime, timezone

(
    manifest_path,
    start_here_path,
    output_dir,
    basename,
    proof_seconds,
    wait_seconds,
    before_smoke_path,
    command_path,
    wait_path,
    delivery_packet_path,
    publish_packet_path,
    podcast_packet_path,
    after_smoke_path,
) = sys.argv[1:]

def load(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as error:
        return {"_loadError": str(error), "_path": path}

before_smoke = load(before_smoke_path)
command = load(command_path)
wait_receipt = load(wait_path)
delivery_packet = load(delivery_packet_path)
publish_packet = load(publish_packet_path)
podcast_packet = load(podcast_packet_path)
after_smoke = load(after_smoke_path)

export_state = wait_receipt.get("exportState") or wait_receipt
artifact_states = export_state.get("artifactStates") or []
output_paths = []
for value in [
    export_state.get("outputPaths"),
    wait_receipt.get("outputPaths"),
    command.get("outputPaths"),
]:
    if isinstance(value, list):
        output_paths.extend(path for path in value if isinstance(path, str) and path)
for item in artifact_states:
    if isinstance(item, dict) and item.get("path"):
        output_paths.append(item["path"])
for item in wait_receipt.get("paths") or []:
    if isinstance(item, dict) and item.get("path"):
        output_paths.append(item["path"])

unique_output_paths = []
for path in output_paths:
    if path not in unique_output_paths:
        unique_output_paths.append(path)

def infer_kind(path):
    name = os.path.basename(path)
    if name.endswith("-16x9.mp4"):
        return "episode-master"
    if name.endswith("-9x16.mp4"):
        return "vertical-master"
    if name.endswith("-9x16-short.mp4"):
        return "social-short"
    if name.endswith("-podcast-audio.m4a"):
        return "podcast-audio"
    return ""

if not artifact_states and unique_output_paths:
    artifact_states = [
        {
            "path": path,
            "kind": infer_kind(path),
            "status": "ready" if os.path.exists(path) and os.path.getsize(path) > 0 else "missing",
            "exists": os.path.exists(path),
            "sizeBytes": os.path.getsize(path) if os.path.exists(path) else 0,
        }
        for path in unique_output_paths
    ]

files = []
for path in unique_output_paths:
    files.append({
        "path": path,
        "exists": os.path.exists(path),
        "bytes": os.path.getsize(path) if os.path.exists(path) else 0,
        "kind": next((item.get("kind") for item in artifact_states if isinstance(item, dict) and item.get("path") == path), "") or infer_kind(path),
    })

artifact_summary = export_state.get("artifactSummary") or {}
ready_count = artifact_summary.get("readyCount")
planned_count = artifact_summary.get("plannedCount")
missing_count = artifact_summary.get("missingCount")
if ready_count is None:
    ready_count = len([item for item in artifact_states if isinstance(item, dict) and item.get("status") == "ready"])
if planned_count is None:
    planned_count = len(artifact_states) or len(files)
if missing_count is None:
    missing_count = len([item for item in artifact_states if isinstance(item, dict) and item.get("status") == "missing"])
export_status = export_state.get("status") or wait_receipt.get("waitStatus") or wait_receipt.get("exportStatus") or "unknown"
if wait_receipt.get("waitStatus") == "completed" and all(item["exists"] and item["bytes"] > 0 for item in files):
    export_status = "completed"

def first_existing(patterns):
    for pattern in patterns:
        matches = sorted(glob.glob(pattern))
        for match in matches:
            if os.path.exists(match):
                return match
    return ""

delivery_packet_output = (
    delivery_packet.get("outputPath")
    or first_existing([
        os.path.join(output_dir, f"{basename}-delivery-delivery-packet.json"),
        os.path.join(output_dir, f"{basename}*delivery-packet.json"),
    ])
)
publish_packet_output = (
    publish_packet.get("outputPath")
    or first_existing([
        os.path.join(output_dir, f"{basename}-publish-publish-packet"),
        os.path.join(output_dir, f"{basename}*publish-packet"),
    ])
)
podcast_packet_output = (
    podcast_packet.get("outputPath")
    or first_existing([
        os.path.join(output_dir, f"{basename}-podcast-podcast-packet"),
        os.path.join(output_dir, f"{basename}*podcast-packet"),
    ])
)

payload = {
    "packetType": "quipslystudio-release-export-prepare-manifest",
    "version": "2026-06-20.release-export-prepare.v1",
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "truth": "This operator prepares local derivative artifacts and packet surfaces. It does not upload, schedule, publish, canonize writing, or mutate source media.",
    "outputDir": output_dir,
    "basename": basename,
    "proofSeconds": proof_seconds,
    "waitSeconds": wait_seconds,
    "exportStatus": export_status,
    "exportKind": export_state.get("kind") or "release-prep",
    "artifactSummary": artifact_summary,
    "readyArtifactCount": ready_count,
    "plannedArtifactCount": planned_count,
    "missingArtifactCount": missing_count,
    "allKnownFilesExist": bool(files) and all(item["exists"] and item["bytes"] > 0 for item in files),
    "outputFileCount": len(files),
    "outputFiles": files,
    "deliveryArtifactSmokeOkBefore": before_smoke.get("ok"),
    "deliveryArtifactSmokeOkAfter": after_smoke.get("ok"),
    "publicationComplete": after_smoke.get("publicationComplete"),
    "receiptRemainingCount": after_smoke.get("receiptRemainingCount"),
    "sourcePolicy": "proxy-first derivative export; originals stay untouched",
    "canonBoundary": "Release export artifacts are not publication receipts.",
    "artifacts": {
        "beforeDeliveryArtifactSmoke": before_smoke_path,
        "fullReleasePrepareCommand": command_path,
        "exportWaitReceipt": wait_path,
        "deliveryPacketGenerate": delivery_packet_path,
        "publishPacketGenerate": publish_packet_path,
        "podcastPacketGenerate": podcast_packet_path,
        "afterDeliveryArtifactSmoke": after_smoke_path,
        "startHere": start_here_path,
        "manifest": manifest_path,
        "deliveryPacketPath": delivery_packet_output,
        "publishPacketPath": publish_packet_output,
        "podcastPacketPath": podcast_packet_output,
    },
    "nextSafeActions": [
        "Run release-export-smoke on this folder.",
        "Inspect 16:9, 9:16, podcast audio, and shorts before posting.",
        "Capture public/scheduled URLs or provider receipts only after real platform posting.",
    ],
}

with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")

latest_manifest = os.path.join(output_dir, "latest-release-export-manifest.json")
latest_start = os.path.join(output_dir, "START-HERE-release-export.md")
shutil.copyfile(manifest_path, latest_manifest)

lines = [
    f"# Quipsly release export proof: {basename}",
    "",
    "This folder contains local derivative artifacts and packet proof for the current Episode 1 release lane.",
    "",
    "## Current truth",
    "",
    f"- Export status: `{payload['exportStatus']}`",
    f"- Proof seconds: `{proof_seconds}`",
    f"- Ready artifacts: `{ready_count}/{planned_count}`",
    f"- Missing artifacts: `{missing_count}`",
    f"- Output files found: `{len(files)}`",
    f"- All known files exist: `{payload['allKnownFilesExist']}`",
    f"- Delivery artifact smoke after export: `{payload['deliveryArtifactSmokeOkAfter']}`",
    f"- Publication complete: `{payload['publicationComplete']}`",
    f"- Receipt remaining count: `{payload['receiptRemainingCount']}`",
    "",
    "## Guardrail",
    "",
    "These are local derivative/export artifacts. They are not proof of publication.",
    "Do not claim YouTube, Patreon, podcast, or social publication until receipts are captured.",
    "",
    "## Open next",
    "",
    f"- Manifest: `{manifest_path}`",
    f"- Latest manifest: `{latest_manifest}`",
    f"- Delivery packet response: `{delivery_packet_path}`",
    f"- Publish packet response: `{publish_packet_path}`",
    f"- Podcast packet response: `{podcast_packet_path}`",
    "",
    "## Files",
    "",
]
for item in files:
    lines.append(f"- `{item['kind'] or 'artifact'}`: `{item['path']}` ({item['bytes']} bytes)")
lines.append("")
lines.append("## Next safe command")
lines.append("")
lines.append(f"```bash\napps/QuipslyStudio/script/agentctl.sh release-export-smoke {output_dir!r}\n```")
lines.append("")
lines.append("Create a Tower operator checklist from this folder:")
lines.append("")
lines.append(f"```bash\napps/QuipslyStudio/script/agentctl.sh release-export-review {output_dir!r}\n```")
lines.append("")
lines.append("After review, prepare a local Tower receipt ledger:")
lines.append("")
lines.append(f"```bash\napps/QuipslyStudio/script/agentctl.sh release-receipt-ledger-prepare {output_dir!r}\n```")
lines.append("")
lines.append("Then prove the local ledger shape:")
lines.append("")
lines.append(f"```bash\napps/QuipslyStudio/script/agentctl.sh release-receipt-ledger-smoke {output_dir!r}\n```")
lines.append("")

with open(start_here_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines))

shutil.copyfile(start_here_path, latest_start)
payload["artifacts"]["latestManifest"] = latest_manifest
payload["artifacts"]["latestStartHere"] = latest_start
with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
shutil.copyfile(manifest_path, latest_manifest)

print(json.dumps(payload, indent=2, sort_keys=True))
PY
}

release_export_smoke() {
  local target="${1:-$HOME/Movies/QuipslyExports/Episode1Tower}"
  local manifest_path

  if [[ -d "$target" ]]; then
    manifest_path="$target/latest-release-export-manifest.json"
  else
    manifest_path="$target"
  fi

  if [[ ! -f "$manifest_path" ]]; then
    printf 'No release-export manifest found at %s\n' "$manifest_path" >&2
    printf 'Run: script/agentctl.sh release-export-prepare %s\n' "$(dirname "$manifest_path")" >&2
    return 1
  fi

  python3 - "$manifest_path" <<'PY'
import json
import os
import sys

manifest_path = sys.argv[1]
with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

artifacts = manifest.get("artifacts") or {}
output_files = manifest.get("outputFiles") or []

def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as error:
        return {"_loadError": str(error), "_path": path}

after_smoke = load_json(artifacts.get("afterDeliveryArtifactSmoke", ""))

checks = []

def check(name, ok, detail, expected=None, actual=None):
    checks.append({
        "name": name,
        "ok": bool(ok),
        "detail": detail,
        "expected": expected,
        "actual": actual,
    })

check(
    "export completed",
    manifest.get("exportStatus") == "completed",
    "Release export prepare should wait until the export engine reports completion.",
    expected="completed",
    actual=manifest.get("exportStatus"),
)
check(
    "all planned artifacts ready",
    manifest.get("plannedArtifactCount", 0) > 0 and manifest.get("readyArtifactCount") == manifest.get("plannedArtifactCount") and manifest.get("missingArtifactCount") == 0,
    "The release folder should not be treated as ready while known artifacts are missing.",
    expected="ready == planned and missing == 0",
    actual={
        "ready": manifest.get("readyArtifactCount"),
        "planned": manifest.get("plannedArtifactCount"),
        "missing": manifest.get("missingArtifactCount"),
    },
)
check(
    "all known files exist",
    manifest.get("allKnownFilesExist") is True and all(os.path.exists(item.get("path", "")) and os.path.getsize(item.get("path", "")) > 0 for item in output_files),
    "Every exported derivative listed in the manifest should exist and be non-empty.",
    expected=True,
    actual={"allKnownFilesExist": manifest.get("allKnownFilesExist"), "fileCount": len(output_files)},
)
kinds = {str(item.get("kind") or "") for item in output_files}
for kind in ["episode-master", "vertical-master", "social-short", "podcast-audio"]:
    check(
        f"export includes {kind}",
        kind in kinds,
        "The release proof should include long-form video, vertical video, shorts, and podcast audio.",
        expected=kind,
        actual=sorted(kinds),
    )
check(
    "delivery artifact smoke passed after export",
    manifest.get("deliveryArtifactSmokeOkAfter") is True and after_smoke.get("ok") is True,
    "After export, delivery artifact smoke should still prove the Tower boundary.",
    expected=True,
    actual={"manifest": manifest.get("deliveryArtifactSmokeOkAfter"), "artifact": after_smoke.get("ok")},
)
check(
    "publication still receipt-bound",
    manifest.get("publicationComplete") is False and (manifest.get("receiptRemainingCount") or 0) > 0,
    "Export completion is not publication completion.",
    expected="publicationComplete false and receipts remaining",
    actual={"publicationComplete": manifest.get("publicationComplete"), "receiptRemainingCount": manifest.get("receiptRemainingCount")},
)
for key in ["deliveryPacketPath", "publishPacketPath", "podcastPacketPath"]:
    value = artifacts.get(key) or ""
    check(
        f"packet path present: {key}",
        bool(value),
        "Release export prepare should refresh packet surfaces after creating derivatives.",
        expected="non-empty path",
        actual=value,
    )

ok = all(item["ok"] for item in checks)
print(json.dumps({
    "model": "quipsly-release-export-smoke",
    "version": "2026-06-20.release-export-smoke.v1",
    "ok": ok,
    "manifestPath": manifest_path,
    "exportStatus": manifest.get("exportStatus"),
    "readyArtifactCount": manifest.get("readyArtifactCount"),
    "plannedArtifactCount": manifest.get("plannedArtifactCount"),
    "missingArtifactCount": manifest.get("missingArtifactCount"),
    "outputFileCount": len(output_files),
    "publicationComplete": manifest.get("publicationComplete"),
    "receiptRemainingCount": manifest.get("receiptRemainingCount"),
    "checks": checks,
    "truth": "This is a read-only release export proof. It verifies local derivative files and packet surfaces exist while keeping publication receipt truth separate.",
}, indent=2))

raise SystemExit(0 if ok else 1)
PY
}

release_export_review() {
  local target="${1:-$HOME/Movies/QuipslyExports/Episode1Tower}"
  local output_format="${2:-text}"
  local manifest_path

  if [[ -d "$target" ]]; then
    manifest_path="$target/latest-release-export-manifest.json"
  else
    manifest_path="$target"
  fi

  if [[ ! -f "$manifest_path" ]]; then
    printf 'No release-export manifest found at %s\n' "$manifest_path" >&2
    printf 'Run: script/agentctl.sh release-export-prepare %s\n' "$(dirname "$manifest_path")" >&2
    return 1
  fi

  python3 - "$manifest_path" "$output_format" <<'PY'
import json
import os
import shutil
import sys
import re
import shlex
from datetime import datetime, timezone

manifest_path = sys.argv[1]
output_format = sys.argv[2]

with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

output_dir = manifest.get("outputDir") or os.path.dirname(manifest_path)
basename = manifest.get("basename") or os.path.splitext(os.path.basename(manifest_path))[0].replace("-release-export-manifest", "")
output_files = manifest.get("outputFiles") or []
artifact_paths = manifest.get("artifactPaths") or {}

def safe(value, fallback="unknown"):
    if value is None or value == "":
        return fallback
    return str(value)

def human_bytes(value):
    try:
        size = int(value or 0)
    except Exception:
        return "unknown"
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size < 1024 or unit == "TB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{size} B"
        size /= 1024
    return f"{size:.1f} TB"

def existing_bytes(path):
    return os.path.getsize(path) if path and os.path.exists(path) else 0

known_records = []
for item in output_files:
    path = item.get("path") or ""
    size = item.get("bytes")
    if size is None:
        size = existing_bytes(path)
    exists = bool(path) and os.path.exists(path) and int(size or 0) > 0
    known_records.append({
        "label": item.get("name") or os.path.basename(path) or item.get("kind") or "artifact",
        "kind": item.get("kind") or "unknown",
        "path": path,
        "exists": exists,
        "bytes": int(size or 0),
        "humanBytes": human_bytes(size),
    })

def by_kind(kind):
    return [item for item in known_records if item.get("kind") == kind]

def file_record(path, kind, label):
    size = existing_bytes(path)
    return {
        "label": label,
        "kind": kind,
        "path": path or "",
        "exists": bool(path) and os.path.exists(path) and size > 0,
        "bytes": size,
        "humanBytes": human_bytes(size),
    }

destination_families = [
    {
        "family": "16:9 episode master",
        "kind": "episode-master",
        "destinations": ["YouTube long-form", "Patreon episode/supporter post", "HighGroundOdyssey.com episode page"],
        "receiptCommandTemplates": [
            "apps/QuipslyStudio/script/agentctl.sh episode-receipt-capture YouTube published <public-url> <provider-id> \"notes\"",
            "apps/QuipslyStudio/script/agentctl.sh publish-receipt-update-platform YouTube episode-16x9-master published <public-url> <provider-id> \"notes\" \"title\" \"description\"",
        ],
    },
    {
        "family": "9:16 vertical master",
        "kind": "vertical-master",
        "destinations": ["review/reference vertical cut", "source for short review when useful"],
        "receiptCommandTemplates": [
            "No receipt needed unless this exact vertical master is posted as its own destination artifact.",
        ],
    },
    {
        "family": "9:16 social shorts",
        "kind": "social-short",
        "destinations": ["YouTube Shorts", "Instagram", "Facebook", "LinkedIn"],
        "receiptCommandTemplates": [
            "apps/QuipslyStudio/script/agentctl.sh social-master-copy-receipt-commands",
            "apps/QuipslyStudio/script/agentctl.sh social-receipt-capture RECEIPT_ID published <public-url> <provider-id> \"notes\"",
        ],
    },
    {
        "family": "podcast audio",
        "kind": "podcast-audio",
        "destinations": ["Spotify for Podcasters", "Apple Podcasts", "future owned podcast hosting"],
        "receiptCommandTemplates": [
            "apps/QuipslyStudio/script/agentctl.sh podcast-receipt-capture Spotify published <public-url> <provider-id> \"notes\"",
            "apps/QuipslyStudio/script/agentctl.sh podcast-receipt-capture \"Apple Podcasts\" published <public-url> <provider-id> \"notes\"",
        ],
    },
]

families = []
for family in destination_families:
    artifacts = by_kind(family["kind"])
    ready = [item for item in artifacts if item.get("exists") and int(item.get("bytes") or 0) > 0]
    families.append({
        **family,
        "artifactCount": len(artifacts),
        "readyArtifactCount": len(ready),
        "artifacts": artifacts,
        "status": "ready-for-operator-review" if ready else "missing-local-artifact",
    })

def slug(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "target"

def target_command(platform, family_kind, artifact, destination_index):
    artifact_path = artifact.get("path") or "<artifact-path>"
    platform_slug = slug(platform)
    if family_kind == "episode-master":
        if platform_slug == "youtube-long-form":
            return "apps/QuipslyStudio/script/agentctl.sh publish-receipt-update-platform YouTube episode-16x9-master published <public-url> <provider-id> \"notes\" \"title\" \"description\""
        if "patreon" in platform_slug:
            return "apps/QuipslyStudio/script/agentctl.sh publish-receipt-update-platform Patreon episode-16x9-master published <public-url> <provider-id> \"notes\" \"title\" \"description\""
        if "highgroundodyssey" in platform_slug:
            return "apps/QuipslyStudio/script/agentctl.sh publish-receipt-update-platform HighGroundOdyssey episode-16x9-master published <public-url> <provider-id> \"notes\" \"title\" \"description\""
        return "apps/QuipslyStudio/script/agentctl.sh episode-receipt-capture <platform> published <public-url> <provider-id> \"notes\""
    if family_kind == "social-short":
        return f"apps/QuipslyStudio/script/agentctl.sh social-receipt-capture <receipt-id-for-{platform_slug}> published <public-url> <provider-id> \"notes\""
    if family_kind == "podcast-audio":
        return f"apps/QuipslyStudio/script/agentctl.sh podcast-receipt-capture {json.dumps(platform)} published <public-url> <provider-id> \"notes\""
    return f"# Review-only artifact for {platform}; no receipt command until this artifact is intentionally posted. artifact={json.dumps(artifact_path)}"

receipt_targets = []
for family in families:
    if family["kind"] == "vertical-master":
        continue
    for artifact_index, artifact in enumerate(family.get("artifacts") or [], start=1):
        if not artifact.get("exists"):
            continue
        for destination_index, platform in enumerate(family.get("destinations") or [], start=1):
            target_id = "-".join([
                "receipt",
                slug(family["kind"]),
                str(artifact_index),
                slug(platform),
            ])
            receipt_targets.append({
                "id": target_id,
                "status": "needs-external-receipt",
                "family": family["family"],
                "kind": family["kind"],
                "platform": platform,
                "artifactPath": artifact.get("path") or "",
                "artifactLabel": artifact.get("label") or "",
                "artifactBytes": artifact.get("bytes") or 0,
                "receiptEvidenceNeeded": "public URL, scheduled URL, provider ID, screenshot, platform export ID, or equivalent proof",
                "suggestedCaptureCommand": target_command(platform, family["kind"], artifact, destination_index),
                "truth": "A local artifact exists, but this destination is not proved until receipt evidence is captured.",
            })

packet_records = [
    file_record(artifact_paths.get("deliveryPacketPath"), "delivery-packet", "Delivery packet"),
    file_record(artifact_paths.get("publishPacketPath"), "publish-packet", "Publish packet"),
    file_record(artifact_paths.get("podcastPacketPath"), "podcast-packet", "Podcast packet"),
]

def load_packet(path):
    if not path or not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as error:
        return {"_loadError": str(error), "_path": path}

def collect_receipt_commands(value, path="$"):
    commands = []
    if isinstance(value, dict):
        for key, item in value.items():
            key_path = f"{path}.{key}"
            commands.extend(collect_receipt_commands(item, key_path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            commands.extend(collect_receipt_commands(item, f"{path}[{index}]"))
    elif isinstance(value, str):
        text = value.strip()
        receipt_markers = [
            "receipt-capture",
            "publish-receipt-update",
            "publish_receipt",
            "receipt update",
            "capture receipt",
        ]
        if any(marker in text for marker in receipt_markers):
            commands.append({
                "path": path,
                "command": text,
            })
    return commands

publish_packet_payload = load_packet(artifact_paths.get("publishPacketPath"))
podcast_packet_payload = load_packet(artifact_paths.get("podcastPacketPath"))
delivery_packet_payload = load_packet(artifact_paths.get("deliveryPacketPath"))
packet_receipt_commands = []
for label, payload in [
    ("publish-packet", publish_packet_payload),
    ("podcast-packet", podcast_packet_payload),
    ("delivery-packet", delivery_packet_payload),
]:
    for command in collect_receipt_commands(payload):
        packet_receipt_commands.append({
            "source": label,
            **command,
        })

unique_packet_receipt_commands = []
seen_packet_commands = set()
for command in packet_receipt_commands:
    command_text = command.get("command") or ""
    if command_text in seen_packet_commands:
        continue
    seen_packet_commands.add(command_text)
    unique_packet_receipt_commands.append(command)

missing_files = [item for item in known_records if not item["exists"]]
ready_files = [item for item in known_records if item["exists"]]

summary = {
    "model": "quipsly-release-export-review",
    "version": "2026-06-20.release-export-review.v1",
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "manifestPath": manifest_path,
    "outputDir": output_dir,
    "basename": basename,
    "exportStatus": manifest.get("exportStatus"),
    "exportKind": manifest.get("exportKind"),
    "readyArtifactCount": manifest.get("readyArtifactCount"),
    "plannedArtifactCount": manifest.get("plannedArtifactCount"),
    "missingArtifactCount": manifest.get("missingArtifactCount"),
    "publicationComplete": manifest.get("publicationComplete"),
    "receiptRemainingCount": manifest.get("receiptRemainingCount"),
    "allKnownFilesExist": manifest.get("allKnownFilesExist"),
    "readyFileCount": len(ready_files),
    "missingFileCount": len(missing_files),
    "families": families,
    "receiptTargetCount": len(receipt_targets),
    "receiptTargets": receipt_targets,
    "packets": packet_records,
    "packetReceiptCommandCount": len(unique_packet_receipt_commands),
    "packetReceiptCommands": unique_packet_receipt_commands,
    "creativePartnerPolicy": {
        "agentAuthoredWorkAllowed": True,
        "seriousAgentWorkIsNotPlaceholder": True,
        "publicationGate": "artifact review plus platform receipt truth, not authorship purity",
        "requiredVisibleState": [
            "authorship",
            "source context",
            "review status",
            "canon status",
            "publication status",
            "external receipt evidence",
        ],
        "truth": "Codex and other Quipslys may create serious first-pass copy, captions, notes, packets, and metadata. Tower must keep provenance/review/publication state visible instead of flattening work into anonymous output.",
    },
    "truth": "This is a read-only Tower operator review for local derivative artifacts. It does not upload, schedule, publish, canonize, mutate source media, or capture receipts.",
    "nextActions": [
        "Watch/listen to artifacts before posting.",
        "Use destination-specific copy/metadata from the publish/podcast packets.",
        "Prefer packet-derived receipt commands when they exist; use generic templates only when a packet has not supplied exact commands yet.",
        "Upload or schedule on the destination platform.",
        "Capture platform URL, scheduled URL, provider ID, screenshot, or equivalent receipt.",
        "Only then mark a destination as posted/scheduled/proved.",
    ],
}

review_path = os.path.join(output_dir, f"RELEASE-EXPORT-REVIEW-{basename}.md")
latest_review_path = os.path.join(output_dir, "RELEASE-EXPORT-REVIEW.md")
review_json_path = os.path.join(output_dir, f"{basename}-release-export-review.json")
latest_review_json_path = os.path.join(output_dir, "latest-release-export-review.json")
receipt_ledger_prepare_command = f"apps/QuipslyStudio/script/agentctl.sh release-receipt-ledger-prepare {shlex.quote(latest_review_json_path)}"
receipt_ledger_smoke_command = f"apps/QuipslyStudio/script/agentctl.sh release-receipt-ledger-smoke {shlex.quote(output_dir)}"
receipt_ledger_update_template = f"apps/QuipslyStudio/script/agentctl.sh release-receipt-ledger-update {shlex.quote(output_dir)} RECEIPT_TARGET_ID scheduled|posted|proved <url-or-proof> [provider-id] [notes]"
summary["receiptLedgerPrepareCommand"] = receipt_ledger_prepare_command
summary["receiptLedgerSmokeCommand"] = receipt_ledger_smoke_command
summary["receiptLedgerUpdateCommandTemplate"] = receipt_ledger_update_template

os.makedirs(output_dir, exist_ok=True)
with open(review_json_path, "w", encoding="utf-8") as handle:
    json.dump(summary, handle, indent=2, sort_keys=True)
    handle.write("\n")
shutil.copyfile(review_json_path, latest_review_json_path)

lines = [
    f"# Release export operator review: {basename}",
    "",
    "This is the Tower checklist for local derivative artifacts created from Quipsly Studio.",
    "",
    "It is not publication proof. It is the bridge between exported files and receipt-backed platform truth.",
    "",
    "## Current state",
    "",
    f"- Export status: `{safe(summary.get('exportStatus'))}`",
    f"- Export kind: `{safe(summary.get('exportKind'))}`",
    f"- Ready artifacts: `{safe(summary.get('readyArtifactCount'))} / {safe(summary.get('plannedArtifactCount'))}`",
    f"- Missing artifacts: `{safe(summary.get('missingArtifactCount'))}`",
    f"- Known files exist: `{safe(summary.get('allKnownFilesExist'))}`",
    f"- Publication complete: `{safe(summary.get('publicationComplete'))}`",
    f"- Receipts remaining: `{safe(summary.get('receiptRemainingCount'))}`",
    "",
    "## Operator rule",
    "",
    "Do not call anything published until Tower has a real external receipt: public URL, scheduled URL, provider ID, screenshot, platform export ID, or equivalent proof.",
    "",
    "## Creative partner and provenance rule",
    "",
    "Codex and other Quipslys may create serious first-pass publication copy, captions, notes, metadata, and packets. Do not downgrade that work to placeholder merely because an agent created it.",
    "",
    "Tower's job is to preserve authorship, source context, review state, canon state, publication state, and receipt evidence. The publication gate is artifact review plus external receipt truth, not authorship purity.",
    "",
    "## Local artifacts",
    "",
]
if known_records:
    for item in known_records:
        status = "ready" if item["exists"] else "missing"
        lines.append(f"- `{status}` `{item['kind']}` {item['label']} - `{item['humanBytes']}` - `{item['path']}`")
else:
    lines.append("- No local artifacts were listed in the release-export manifest.")

lines.extend(["", "## Packet files", ""])
for packet in packet_records:
    status = "ready" if packet["exists"] else "missing"
    lines.append(f"- `{status}` {packet['label']} - `{packet['path']}`")

lines.extend(["", "## Packet-derived receipt commands", ""])
if unique_packet_receipt_commands:
    lines.append("Prefer these over generic templates because they came from the current generated packet files.")
    lines.append("")
    for index, command in enumerate(unique_packet_receipt_commands[:24], start=1):
        lines.append(f"{index}. `{command['command']}`")
        lines.append(f"   - source: `{command.get('source')}` path: `{command.get('path')}`")
    if len(unique_packet_receipt_commands) > 24:
        lines.append(f"- ...and {len(unique_packet_receipt_commands) - 24} more packet-derived commands in `{latest_review_json_path}`")
else:
    lines.append("No packet-derived receipt commands were found. Use the destination-family templates below, then rerun packet generation when Tower gets stronger binding.")

lines.extend(["", "## Receipt targets", ""])
if receipt_targets:
    lines.append("Each row is a destination that still needs real external proof after upload or scheduling.")
    lines.append("")
    for index, target in enumerate(receipt_targets[:40], start=1):
        lines.extend([
            f"### {index}. {target['platform']} / {target['family']}",
            "",
            f"- Target ID: `{target['id']}`",
            f"- Status: `{target['status']}`",
            f"- Artifact: `{target['artifactPath']}`",
            f"- Proof needed: {target['receiptEvidenceNeeded']}",
            f"- Suggested capture: `{target['suggestedCaptureCommand']}`",
            "",
        ])
    if len(receipt_targets) > 40:
        lines.append(f"...and {len(receipt_targets) - 40} more receipt targets in `{latest_review_json_path}`.")
else:
    lines.append("No receipt targets were created because no postable local artifacts were ready.")

lines.extend([
    "",
    "## Local receipt ledger next steps",
    "",
    "Prepare a local Tower receipt ledger from this review:",
    "",
    "```bash",
    receipt_ledger_prepare_command,
    "```",
    "",
    "Smoke the local ledger structure:",
    "",
    "```bash",
    receipt_ledger_smoke_command,
    "```",
    "",
    "When external proof arrives, update one row:",
    "",
    "```bash",
    receipt_ledger_update_template,
    "```",
    "",
    "The ledger remains local packet truth until imported into durable Tower persistence.",
])

lines.extend(["", "## Destination families", ""])
for family in families:
    lines.extend([
        f"### {family['family']}",
        "",
        f"- Status: `{family['status']}`",
        f"- Artifacts: `{family['readyArtifactCount']} / {family['artifactCount']}`",
        f"- Destinations: `{', '.join(family['destinations'])}`",
        "",
        "Receipt command templates:",
        "",
    ])
    for command in family["receiptCommandTemplates"]:
        lines.append(f"- `{command}`")
    lines.append("")

lines.extend(["## Next actions", ""])
for action in summary["nextActions"]:
    lines.append(f"- {action}")

lines.extend([
    "",
    "## Proof files",
    "",
    f"- Manifest: `{manifest_path}`",
    f"- Review JSON: `{review_json_path}`",
    f"- Latest review JSON: `{latest_review_json_path}`",
    "",
    "## Boundary",
    "",
    "This checklist does not upload, schedule, publish, canonize manuscript text, mutate source media, or capture receipts.",
    "",
])

with open(review_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines))
shutil.copyfile(review_path, latest_review_path)

summary["reviewPath"] = review_path
summary["latestReviewPath"] = latest_review_path
summary["reviewJsonPath"] = review_json_path
summary["latestReviewJsonPath"] = latest_review_json_path

if output_format == "--json" or output_format == "json":
    print(json.dumps(summary, indent=2, sort_keys=True))
else:
    print(f"Release export review written: {latest_review_path}")
    print(f"Review JSON written: {latest_review_json_path}")
    print(f"Export status: {summary.get('exportStatus')}")
    print(f"Ready files: {summary.get('readyFileCount')}")
    print(f"Missing files: {summary.get('missingFileCount')}")
    print("Receipt boundary: local artifacts are not publication proof.")
PY
}

release_receipt_ledger_prepare() {
  local target="${1:-$HOME/Movies/QuipslyExports/Episode1Tower}"
  local basename="${2:-}"
  local review_path

  if [[ -d "$target" ]]; then
    review_path="$target/latest-release-export-review.json"
  else
    review_path="$target"
  fi

  if [[ ! -f "$review_path" ]]; then
    printf 'No release-export review JSON found at %s\n' "$review_path" >&2
    printf 'Run: script/agentctl.sh release-export-review %s\n' "$(dirname "$review_path")" >&2
    return 1
  fi

  python3 - "$review_path" "$basename" <<'PY'
import json
import os
import shutil
import sys
from datetime import datetime, timezone

review_path = sys.argv[1]
basename_arg = sys.argv[2].strip()

with open(review_path, "r", encoding="utf-8") as handle:
    review = json.load(handle)

output_dir = review.get("outputDir") or os.path.dirname(review_path)
basename = basename_arg or review.get("basename") or "release-receipt-ledger"
receipt_targets = review.get("receiptTargets") or []
packet_commands = review.get("packetReceiptCommands") or []

def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def first_packet_command_for(target):
    platform = str(target.get("platform") or "").lower()
    kind = str(target.get("kind") or "").lower()
    for command in packet_commands:
        text = str(command.get("command") or "")
        lower = text.lower()
        if platform and platform.split()[0] in lower:
            return text
        if kind and kind.replace("-", "") in lower.replace("-", ""):
            return text
    return target.get("suggestedCaptureCommand") or ""

ledger_rows = []
for index, target in enumerate(receipt_targets, start=1):
    ledger_rows.append({
        "id": target.get("id") or f"receipt-target-{index}",
        "index": index,
        "status": "needs-external-receipt",
        "family": target.get("family") or "",
        "kind": target.get("kind") or "",
        "platform": target.get("platform") or "",
        "artifactPath": target.get("artifactPath") or "",
        "artifactLabel": target.get("artifactLabel") or "",
        "artifactBytes": target.get("artifactBytes") or 0,
        "receiptEvidenceNeeded": target.get("receiptEvidenceNeeded") or "public URL, scheduled URL, provider ID, screenshot, platform export ID, or equivalent proof",
        "captureCommand": first_packet_command_for(target),
        "publicUrl": "",
        "providerId": "",
        "scheduledAt": "",
        "postedAt": "",
        "provedAt": "",
        "proofEvidenceType": "none",
        "proofEvidenceGrade": "none",
        "proofEvidenceGradeLabel": "No external proof captured yet",
        "proofArtifactPath": "",
        "proofArtifactExists": False,
        "proofArtifactBytes": 0,
        "authorshipPolicy": "Receipt rows prove destination publication state. They do not require human-only authorship; agent-authored or mixed-authorship copy is valid when provenance and review state stay visible upstream.",
        "notes": "",
        "sourceReviewPath": review_path,
        "createdAt": now(),
        "updatedAt": now(),
        "truth": "This row is a receipt target. It is not proved until external evidence is captured.",
    })

initial_evidence_grade_counts = {"none": len(ledger_rows), "manual-reference": 0, "url": 0, "local-file": 0, "provider-verified": 0}
ledger = {
    "packetType": "quipsly-tower-release-receipt-ledger",
    "version": "2026-06-20.release-receipt-ledger.v1",
    "generatedAt": now(),
    "status": "receipt-targets-prepared" if ledger_rows else "no-receipt-targets",
    "basename": basename,
    "outputDir": output_dir,
    "sourceReviewPath": review_path,
    "sourceReleaseManifestPath": review.get("manifestPath") or "",
    "exportStatus": review.get("exportStatus"),
    "publicationComplete": False,
    "receiptTargetCount": len(ledger_rows),
    "provedReceiptCount": 0,
    "remainingReceiptCount": len(ledger_rows),
    "evidenceGradeCounts": initial_evidence_grade_counts,
    "creativePartnerPolicy": review.get("creativePartnerPolicy") or {
        "agentAuthoredWorkAllowed": True,
        "seriousAgentWorkIsNotPlaceholder": True,
        "publicationGate": "artifact review plus platform receipt truth, not authorship purity",
        "requiredVisibleState": [
            "authorship",
            "source context",
            "review status",
            "canon status",
            "publication status",
            "external receipt evidence",
        ],
    },
    "rows": ledger_rows,
    "truth": "This is a local Tower receipt ledger packet. It does not upload, schedule, publish, canonize, mutate source media, or prove publication.",
    "nextActions": [
        "Review each artifact before posting.",
        "Upload or schedule on the destination platform.",
        "Fill a row with publicUrl, providerId, scheduledAt, postedAt, provedAt, notes, or equivalent evidence.",
        "Only then move that row beyond needs-external-receipt.",
        "Later, import these rows into the durable Tower publication ledger.",
    ],
}

ledger_path = os.path.join(output_dir, f"{basename}-receipt-ledger.json")
latest_ledger_path = os.path.join(output_dir, "latest-release-receipt-ledger.json")
ledger_md_path = os.path.join(output_dir, f"RELEASE-RECEIPT-LEDGER-{basename}.md")
latest_ledger_md_path = os.path.join(output_dir, "RELEASE-RECEIPT-LEDGER.md")

os.makedirs(output_dir, exist_ok=True)
with open(ledger_path, "w", encoding="utf-8") as handle:
    json.dump(ledger, handle, indent=2, sort_keys=True)
    handle.write("\n")
shutil.copyfile(ledger_path, latest_ledger_path)

lines = [
    f"# Release receipt ledger: {basename}",
    "",
    "This is the local Tower ledger packet for receipt targets created from a release-export review.",
    "",
    "It is not publication proof. It is a tracking surface for what still needs external evidence.",
    "",
    "## Current state",
    "",
    f"- Status: `{ledger['status']}`",
    f"- Receipt targets: `{ledger['receiptTargetCount']}`",
    f"- Proved receipts: `{ledger['provedReceiptCount']}`",
        f"- Remaining receipts: `{ledger['remainingReceiptCount']}`",
        f"- Evidence grades: `{json.dumps(ledger.get('evidenceGradeCounts') or {}, sort_keys=True)}`",
        f"- Source review: `{review_path}`",
    f"- Source release manifest: `{ledger['sourceReleaseManifestPath']}`",
    "",
    "## Evidence grades",
    "",
    "- `none`: no external evidence has been captured.",
    "- `manual-reference`: an operator typed a reference or note, but Quipsly has not verified it.",
    "- `url`: an external URL was recorded, but Quipsly has not verified provider state.",
    "- `local-file`: a local screenshot/receipt/proof file exists and is attached to the row.",
    "- `provider-verified`: reserved for future API/provider verification.",
    "",
    "## Creative partner and provenance",
    "",
    "Agent-authored or mixed-authorship publication copy is allowed in Quipsly. This ledger's job is not to police whether a human typed every word. Its job is to preserve the receipt trail for whatever reviewed artifact is intentionally posted.",
    "",
    "Do not mark a row complete until the destination has external proof. Do not flatten authorship/provenance upstream just because this ledger is tracking platform receipts.",
    "",
    "## Rows",
    "",
]
if ledger_rows:
    for row in ledger_rows:
        lines.extend([
            f"### {row['index']}. {row['platform']} / {row['family']}",
            "",
            f"- ID: `{row['id']}`",
            f"- Status: `{row['status']}`",
            f"- Artifact: `{row['artifactPath']}`",
            f"- Evidence needed: {row['receiptEvidenceNeeded']}",
            f"- Capture command: `{row['captureCommand']}`",
            "",
        ])
else:
    lines.append("No receipt rows were created. Run `release-export-review` against a folder with ready local artifacts first.")

lines.extend([
    "",
    "## Boundary",
    "",
    "This ledger packet does not upload, schedule, publish, canonize manuscript text, mutate source media, or prove publication.",
    "",
    "The future durable Tower ledger should import this shape so every row can move through `needs-external-receipt`, `scheduled`, `posted`, and `proved`.",
    "",
])

with open(ledger_md_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines))
shutil.copyfile(ledger_md_path, latest_ledger_md_path)

ledger["ledgerPath"] = ledger_path
ledger["latestLedgerPath"] = latest_ledger_path
ledger["ledgerMarkdownPath"] = ledger_md_path
ledger["latestLedgerMarkdownPath"] = latest_ledger_md_path

print(json.dumps(ledger, indent=2, sort_keys=True))
PY
}

release_receipt_ledger_update() {
  local target="${1:-}"
  local row_id="${2:-}"
  local status="${3:-}"
  local proof_url="${4:-}"
  local provider_id="${5:-}"
  local notes="${6:-}"
  local ledger_path

  if [[ -z "$target" || -z "$row_id" || -z "$status" || -z "$proof_url" ]]; then
    printf 'Usage: script/agentctl.sh release-receipt-ledger-update [/ledger-folder-or-json] RECEIPT_TARGET_ID scheduled|posted|proved <url-or-proof> [provider-id] [notes]\n' >&2
    return 2
  fi

  if [[ -d "$target" ]]; then
    ledger_path="$target/latest-release-receipt-ledger.json"
  else
    ledger_path="$target"
  fi

  if [[ ! -f "$ledger_path" ]]; then
    printf 'No release receipt ledger found at %s\n' "$ledger_path" >&2
    printf 'Run: script/agentctl.sh release-receipt-ledger-prepare %s\n' "$(dirname "$ledger_path")" >&2
    return 1
  fi

  python3 - "$ledger_path" "$row_id" "$status" "$proof_url" "$provider_id" "$notes" <<'PY'
import json
import os
import shutil
import sys
from datetime import datetime, timezone

ledger_path, row_id, status, proof_url, provider_id, notes = sys.argv[1:7]
allowed = {"scheduled", "posted", "proved"}
if status not in allowed:
    raise SystemExit(f"Unsupported status {status!r}; expected one of {sorted(allowed)}")

with open(ledger_path, "r", encoding="utf-8") as handle:
    ledger = json.load(handle)

rows = ledger.get("rows") or []
now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
target = None
for row in rows:
    if row.get("id") == row_id:
        target = row
        break

if target is None:
    known = ", ".join(row.get("id", "") for row in rows[:20])
    raise SystemExit(f"Receipt target {row_id!r} not found. Known ids: {known}")

target["status"] = status
target["publicUrl"] = proof_url
target["providerId"] = provider_id
target["notes"] = notes
target["updatedAt"] = now
if os.path.exists(proof_url):
    target["proofArtifactPath"] = os.path.abspath(proof_url)
    target["proofArtifactExists"] = True
    target["proofArtifactBytes"] = os.path.getsize(proof_url)
    target["proofEvidenceType"] = "local-file"
    target["proofEvidenceGrade"] = "local-file"
    target["proofEvidenceGradeLabel"] = "Local screenshot or receipt file exists"
elif proof_url.startswith(("http://", "https://")):
    target["proofArtifactPath"] = ""
    target["proofArtifactExists"] = False
    target["proofArtifactBytes"] = 0
    target["proofEvidenceType"] = "url"
    target["proofEvidenceGrade"] = "url"
    target["proofEvidenceGradeLabel"] = "External URL recorded but not provider-verified"
else:
    target["proofArtifactPath"] = proof_url
    target["proofArtifactExists"] = False
    target["proofArtifactBytes"] = 0
    target["proofEvidenceType"] = "manual-reference"
    target["proofEvidenceGrade"] = "manual-reference"
    target["proofEvidenceGradeLabel"] = "Manual reference recorded without automatic verification"
if status == "scheduled":
    target["scheduledAt"] = target.get("scheduledAt") or now
elif status == "posted":
    target["postedAt"] = target.get("postedAt") or now
elif status == "proved":
    target["provedAt"] = target.get("provedAt") or now
    target["postedAt"] = target.get("postedAt") or now

history = target.get("history") or []
history.append({
    "at": now,
    "status": status,
    "publicUrl": proof_url,
    "providerId": provider_id,
    "proofEvidenceType": target.get("proofEvidenceType"),
    "proofEvidenceGrade": target.get("proofEvidenceGrade"),
    "proofEvidenceGradeLabel": target.get("proofEvidenceGradeLabel"),
    "proofArtifactPath": target.get("proofArtifactPath"),
    "proofArtifactExists": target.get("proofArtifactExists"),
    "notes": notes,
    "truth": "Operator supplied external receipt evidence for this local Tower ledger row.",
})
target["history"] = history

proved_count = sum(1 for row in rows if row.get("status") == "proved")
posted_count = sum(1 for row in rows if row.get("status") in {"posted", "proved"})
scheduled_count = sum(1 for row in rows if row.get("status") == "scheduled")
remaining_count = sum(1 for row in rows if row.get("status") == "needs-external-receipt")
evidence_grade_counts = {}
for row in rows:
    grade = row.get("proofEvidenceGrade") or "none"
    evidence_grade_counts[grade] = evidence_grade_counts.get(grade, 0) + 1
ledger["provedReceiptCount"] = proved_count
ledger["postedReceiptCount"] = posted_count
ledger["scheduledReceiptCount"] = scheduled_count
ledger["remainingReceiptCount"] = remaining_count
ledger["evidenceGradeCounts"] = evidence_grade_counts
ledger["publicationComplete"] = bool(rows) and remaining_count == 0 and all(row.get("status") in {"scheduled", "posted", "proved"} for row in rows)
ledger["status"] = "publication-proved" if ledger["publicationComplete"] and proved_count == len(rows) else "receipts-in-progress"
ledger["updatedAt"] = now
ledger["lastUpdatedReceiptTargetId"] = row_id

output_dir = ledger.get("outputDir") or os.path.dirname(ledger_path)
basename = ledger.get("basename") or os.path.basename(ledger_path).replace("-receipt-ledger.json", "")
latest_ledger_path = os.path.join(output_dir, "latest-release-receipt-ledger.json")
ledger_md_path = os.path.join(output_dir, f"RELEASE-RECEIPT-LEDGER-{basename}.md")
latest_ledger_md_path = os.path.join(output_dir, "RELEASE-RECEIPT-LEDGER.md")

with open(ledger_path, "w", encoding="utf-8") as handle:
    json.dump(ledger, handle, indent=2, sort_keys=True)
    handle.write("\n")
if os.path.abspath(ledger_path) != os.path.abspath(latest_ledger_path):
    shutil.copyfile(ledger_path, latest_ledger_path)
else:
    with open(latest_ledger_path, "w", encoding="utf-8") as handle:
        json.dump(ledger, handle, indent=2, sort_keys=True)
        handle.write("\n")

lines = [
    f"# Release receipt ledger: {basename}",
    "",
    "This is the local Tower ledger packet for receipt targets created from a release-export review.",
    "",
    "## Current state",
    "",
    f"- Status: `{ledger.get('status')}`",
    f"- Receipt targets: `{ledger.get('receiptTargetCount')}`",
    f"- Scheduled receipts: `{ledger.get('scheduledReceiptCount', 0)}`",
    f"- Posted receipts: `{ledger.get('postedReceiptCount', 0)}`",
    f"- Proved receipts: `{ledger.get('provedReceiptCount', 0)}`",
    f"- Remaining receipts: `{ledger.get('remainingReceiptCount')}`",
    f"- Publication complete: `{ledger.get('publicationComplete')}`",
    f"- Evidence grades: `{json.dumps(ledger.get('evidenceGradeCounts') or {}, sort_keys=True)}`",
    f"- Last updated target: `{row_id}`",
    "",
    "## Evidence grades",
    "",
    "- `none`: no external evidence has been captured.",
    "- `manual-reference`: an operator typed a reference or note, but Quipsly has not verified it.",
    "- `url`: an external URL was recorded, but Quipsly has not verified provider state.",
    "- `local-file`: a local screenshot/receipt/proof file exists and is attached to the row.",
    "- `provider-verified`: reserved for future API/provider verification.",
    "",
    "## Rows",
    "",
]
for row in rows:
    lines.extend([
        f"### {row.get('index')}. {row.get('platform')} / {row.get('family')}",
        "",
        f"- ID: `{row.get('id')}`",
        f"- Status: `{row.get('status')}`",
        f"- Artifact: `{row.get('artifactPath')}`",
        f"- Public/proof URL: `{row.get('publicUrl') or ''}`",
        f"- Provider ID: `{row.get('providerId') or ''}`",
        f"- Proof evidence type: `{row.get('proofEvidenceType') or ''}`",
        f"- Proof evidence grade: `{row.get('proofEvidenceGrade') or ''}`",
        f"- Proof evidence label: `{row.get('proofEvidenceGradeLabel') or ''}`",
        f"- Proof artifact: `{row.get('proofArtifactPath') or ''}`",
        f"- Proof artifact exists: `{row.get('proofArtifactExists') if 'proofArtifactExists' in row else ''}`",
        f"- Scheduled at: `{row.get('scheduledAt') or ''}`",
        f"- Posted at: `{row.get('postedAt') or ''}`",
        f"- Proved at: `{row.get('provedAt') or ''}`",
        f"- Notes: `{row.get('notes') or ''}`",
        "",
    ])

lines.extend([
    "## Boundary",
    "",
    "This local ledger records operator-supplied receipt evidence. It still needs durable Tower persistence before it becomes the final app-owned publication ledger.",
    "",
])
with open(ledger_md_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines))
shutil.copyfile(ledger_md_path, latest_ledger_md_path)

print(json.dumps({
    "status": "updated",
    "ledgerPath": ledger_path,
    "latestLedgerPath": latest_ledger_path,
    "ledgerMarkdownPath": ledger_md_path,
    "latestLedgerMarkdownPath": latest_ledger_md_path,
    "updatedReceiptTargetId": row_id,
    "updatedReceiptStatus": status,
    "publicationComplete": ledger.get("publicationComplete"),
    "remainingReceiptCount": ledger.get("remainingReceiptCount"),
    "truth": "This updates a local Tower receipt ledger row with operator-supplied evidence. It does not upload, schedule, publish, or verify the external URL automatically.",
}, indent=2, sort_keys=True))
PY
}

release_receipt_ledger_next() {
  local target="${1:-$HOME/Movies/QuipslyExports/Episode1Tower}"
  local ledger_path

  if [[ -d "$target" ]]; then
    ledger_path="$target/latest-release-receipt-ledger.json"
  else
    ledger_path="$target"
  fi

  if [[ ! -f "$ledger_path" ]]; then
    printf 'No release receipt ledger found at %s\n' "$ledger_path" >&2
    printf 'Run: script/agentctl.sh release-receipt-ledger-prepare %s\n' "$(dirname "$ledger_path")" >&2
    return 1
  fi

  python3 - "$ledger_path" <<'PY'
import json
import os
import shutil
import sys
from datetime import datetime, timezone

ledger_path = sys.argv[1]
with open(ledger_path, "r", encoding="utf-8") as handle:
    ledger = json.load(handle)

rows = ledger.get("rows") or []
priority = {"needs-external-receipt": 0, "scheduled": 1, "posted": 2, "proved": 9}
pending = [row for row in rows if row.get("status") != "proved"]
pending.sort(key=lambda row: (priority.get(row.get("status"), 5), row.get("index") or 999999))
next_row = pending[0] if pending else None
output_dir = ledger.get("outputDir") or os.path.dirname(ledger_path)
basename = ledger.get("basename") or os.path.basename(ledger_path).replace("-receipt-ledger.json", "")
next_path = os.path.join(output_dir, f"NEXT-RECEIPT-{basename}.md")
latest_next_path = os.path.join(output_dir, "NEXT-RECEIPT.md")

summary = {
    "packetType": "quipsly-tower-next-receipt",
    "version": "2026-06-20.release-receipt-ledger-next.v1",
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "ledgerPath": ledger_path,
    "outputDir": output_dir,
    "basename": basename,
    "publicationComplete": bool(ledger.get("publicationComplete")),
    "receiptTargetCount": ledger.get("receiptTargetCount", len(rows)),
    "remainingReceiptCount": ledger.get("remainingReceiptCount", len(pending)),
    "evidenceGradeCounts": ledger.get("evidenceGradeCounts") or {},
    "nextReceipt": next_row,
    "nextReceiptMarkdownPath": next_path,
    "latestNextReceiptMarkdownPath": latest_next_path,
    "truth": "This selects the next unresolved local Tower receipt row. It does not upload, schedule, publish, verify providers, or mutate the ledger.",
}

lines = [
    f"# Next Tower receipt: {basename}",
    "",
    "This is the smallest next receipt action from the local Tower ledger.",
    "",
    f"- Publication complete: `{summary['publicationComplete']}`",
    f"- Receipt targets: `{summary['receiptTargetCount']}`",
    f"- Remaining receipts: `{summary['remainingReceiptCount']}`",
    f"- Evidence grades: `{json.dumps(summary['evidenceGradeCounts'], sort_keys=True)}`",
    "",
]

if next_row:
    capture_command = next_row.get("captureCommand") or ""
    row_id = next_row.get("id") or ""
    lines.extend([
        "## Handle this next",
        "",
        f"- Row ID: `{row_id}`",
        f"- Status: `{next_row.get('status')}`",
        f"- Platform: `{next_row.get('platform')}`",
        f"- Family: `{next_row.get('family')}`",
        f"- Artifact: `{next_row.get('artifactPath')}`",
        f"- Evidence needed: {next_row.get('receiptEvidenceNeeded')}",
        "",
        "## Suggested capture command",
        "",
        "Use this after you have a real platform URL, scheduled URL, provider ID, screenshot, or equivalent proof.",
        "",
    ])
    if capture_command:
        lines.append(f"```bash\n{capture_command}\n```")
    else:
        lines.append("No destination-specific capture command was available for this row.")
    lines.extend([
        "",
        "## Generic local ledger update command",
        "",
        "This updates only the local Tower ledger packet:",
        "",
        f"```bash\napps/QuipslyStudio/script/agentctl.sh release-receipt-ledger-update {output_dir!r} {row_id} scheduled|posted|proved <url-or-proof> [provider-id] [notes]\n```",
    ])
else:
    lines.extend([
        "## No unresolved receipts",
        "",
        "Every local receipt row is already proved or no rows exist. Run the receipt smoke next and then decide whether the durable Tower ledger needs import/update.",
        "",
        f"```bash\napps/QuipslyStudio/script/agentctl.sh release-receipt-ledger-smoke {output_dir!r}\n```",
    ])

lines.extend([
    "",
    "## Boundary",
    "",
    summary["truth"],
    "",
    "Prepared artifacts and local ledger rows are not public proof until external destination evidence exists.",
])

with open(next_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines))
shutil.copyfile(next_path, latest_next_path)

print(json.dumps(summary, indent=2, sort_keys=True))
PY
}

release_receipt_ledger_smoke() {
  local target="${1:-$HOME/Movies/QuipslyExports/Episode1Tower}"
  local ledger_path

  if [[ -d "$target" ]]; then
    ledger_path="$target/latest-release-receipt-ledger.json"
  else
    ledger_path="$target"
  fi

  if [[ ! -f "$ledger_path" ]]; then
    printf 'No release receipt ledger found at %s\n' "$ledger_path" >&2
    printf 'Run: script/agentctl.sh release-receipt-ledger-prepare %s\n' "$(dirname "$ledger_path")" >&2
    return 1
  fi

  python3 - "$ledger_path" <<'PY'
import json
import os
import sys

ledger_path = sys.argv[1]
with open(ledger_path, "r", encoding="utf-8") as handle:
    ledger = json.load(handle)

rows = ledger.get("rows") or []
allowed_statuses = {"needs-external-receipt", "scheduled", "posted", "proved"}
allowed_evidence_grades = {"none", "manual-reference", "url", "local-file", "provider-verified"}

checks = []

def check(name, ok, detail, expected=None, actual=None):
    checks.append({
        "name": name,
        "ok": bool(ok),
        "detail": detail,
        "expected": expected,
        "actual": actual,
    })

ids = [row.get("id") for row in rows]
unique_ids = set(ids)
scheduled_count = sum(1 for row in rows if row.get("status") == "scheduled")
posted_count = sum(1 for row in rows if row.get("status") in {"posted", "proved"})
proved_count = sum(1 for row in rows if row.get("status") == "proved")
remaining_count = sum(1 for row in rows if row.get("status") == "needs-external-receipt")
evidence_grade_counts = {}
for row in rows:
    grade = row.get("proofEvidenceGrade") or "none"
    evidence_grade_counts[grade] = evidence_grade_counts.get(grade, 0) + 1
invalid_status_rows = [row.get("id") for row in rows if row.get("status") not in allowed_statuses]
invalid_evidence_grade_rows = [row.get("id") for row in rows if (row.get("proofEvidenceGrade") or "none") not in allowed_evidence_grades]
resolved_without_evidence_grade = [
    row.get("id")
    for row in rows
    if row.get("status") in {"scheduled", "posted", "proved"} and (row.get("proofEvidenceGrade") or "none") == "none"
]
missing_artifact_rows = [row.get("id") for row in rows if not row.get("artifactPath")]
missing_capture_rows = [row.get("id") for row in rows if not row.get("captureCommand")]
posted_without_evidence = [
    row.get("id")
    for row in rows
    if row.get("status") in {"scheduled", "posted", "proved"} and not (row.get("publicUrl") or row.get("providerId") or row.get("notes"))
]
local_proof_missing = [
    row.get("id")
    for row in rows
    if row.get("status") in {"scheduled", "posted", "proved"}
    and row.get("proofEvidenceType") == "local-file"
    and not (row.get("proofArtifactPath") and os.path.exists(row.get("proofArtifactPath")))
]
proved_without_time = [row.get("id") for row in rows if row.get("status") == "proved" and not row.get("provedAt")]
publication_complete_expected = bool(rows) and remaining_count == 0 and all(row.get("status") in {"scheduled", "posted", "proved"} for row in rows)

check(
    "ledger packet type present",
    ledger.get("packetType") == "quipsly-tower-release-receipt-ledger",
    "The file should be a Tower release receipt ledger packet.",
    expected="quipsly-tower-release-receipt-ledger",
    actual=ledger.get("packetType"),
)
check(
    "receipt rows exist",
    len(rows) > 0,
    "The ledger should contain destination receipt rows before it can track publication work.",
    expected=">0",
    actual=len(rows),
)
check(
    "receipt target count matches rows",
    int(ledger.get("receiptTargetCount") or 0) == len(rows),
    "Header counts should match row truth.",
    expected=len(rows),
    actual=ledger.get("receiptTargetCount"),
)
check(
    "receipt row ids unique",
    len(unique_ids) == len(ids) and all(ids),
    "Receipt target IDs should be stable and unique.",
    expected="unique non-empty ids",
    actual=ids,
)
check(
    "receipt statuses valid",
    not invalid_status_rows,
    "Rows should only use known local Tower receipt statuses.",
    expected=sorted(allowed_statuses),
    actual=invalid_status_rows,
)
check(
    "proof evidence grades valid",
    not invalid_evidence_grade_rows,
    "Rows should only use known evidence grades so Tower can compare proof strength consistently.",
    expected=sorted(allowed_evidence_grades),
    actual=invalid_evidence_grade_rows,
)
check(
    "resolved rows have evidence grade",
    not resolved_without_evidence_grade,
    "Rows that have moved beyond needs-external-receipt should name the grade of proof supplied.",
    expected="manual-reference, url, local-file, or provider-verified",
    actual=resolved_without_evidence_grade,
)
check(
    "artifact paths present",
    not missing_artifact_rows,
    "Every receipt row should name the local artifact it is proving.",
    expected="artifactPath on every row",
    actual=missing_artifact_rows,
)
check(
    "capture commands present",
    not missing_capture_rows,
    "Every receipt row should expose a capture command or fallback command.",
    expected="captureCommand on every row",
    actual=missing_capture_rows,
)
check(
    "scheduled or posted rows carry evidence",
    not posted_without_evidence,
    "Moving beyond needs-external-receipt requires some operator-supplied evidence.",
    expected="publicUrl/providerId/notes for scheduled, posted, or proved rows",
    actual=posted_without_evidence,
)
check(
    "local proof artifacts still exist",
    not local_proof_missing,
    "Rows using a local screenshot/file as evidence should point to a file that still exists.",
    expected="existing proofArtifactPath for local-file evidence",
    actual=local_proof_missing,
)
check(
    "proved rows have proved timestamp",
    not proved_without_time,
    "Proved rows should show when evidence was recorded.",
    expected="provedAt for proved rows",
    actual=proved_without_time,
)
check(
    "scheduled count matches rows",
    int(ledger.get("scheduledReceiptCount") or 0) == scheduled_count,
    "Header scheduled count should match row statuses.",
    expected=scheduled_count,
    actual=ledger.get("scheduledReceiptCount"),
)
check(
    "posted count matches rows",
    int(ledger.get("postedReceiptCount") or 0) == posted_count,
    "Header posted count should count posted and proved rows.",
    expected=posted_count,
    actual=ledger.get("postedReceiptCount"),
)
check(
    "proved count matches rows",
    int(ledger.get("provedReceiptCount") or 0) == proved_count,
    "Header proved count should match row statuses.",
    expected=proved_count,
    actual=ledger.get("provedReceiptCount"),
)
check(
    "remaining count matches rows",
    int(ledger.get("remainingReceiptCount") or 0) == remaining_count,
    "Header remaining count should match unresolved rows.",
    expected=remaining_count,
    actual=ledger.get("remainingReceiptCount"),
)
check(
    "publication complete flag matches rows",
    bool(ledger.get("publicationComplete")) == publication_complete_expected,
    "Local ledger publicationComplete should only become true when no rows remain unresolved.",
    expected=publication_complete_expected,
    actual=ledger.get("publicationComplete"),
)
check(
    "evidence grade counts match rows",
    (ledger.get("evidenceGradeCounts") or {}) == evidence_grade_counts,
    "Header evidence-grade counts should match row proof grades.",
    expected=evidence_grade_counts,
    actual=ledger.get("evidenceGradeCounts") or {},
)
check(
    "source review path present",
    bool(ledger.get("sourceReviewPath")),
    "The ledger should point back to the release-export review that created it.",
    expected="sourceReviewPath",
    actual=ledger.get("sourceReviewPath"),
)

ok = all(item["ok"] for item in checks)
print(json.dumps({
    "model": "quipsly-release-receipt-ledger-smoke",
    "version": "2026-06-20.release-receipt-ledger-smoke.v1",
    "ok": ok,
    "ledgerPath": ledger_path,
    "status": ledger.get("status"),
    "receiptTargetCount": len(rows),
    "scheduledReceiptCount": scheduled_count,
    "postedReceiptCount": posted_count,
    "provedReceiptCount": proved_count,
    "remainingReceiptCount": remaining_count,
    "evidenceGradeCounts": evidence_grade_counts,
    "publicationComplete": ledger.get("publicationComplete"),
    "checks": checks,
    "truth": "This is a read-only local Tower receipt ledger smoke. It proves row/count/evidence integrity; it does not verify external URLs or provider state.",
}, indent=2, sort_keys=True))

raise SystemExit(0 if ok else 1)
PY
}

release_tower_local_prepare() {
  local target="${1:-$HOME/Movies/QuipslyExports/Episode1Tower}"
  local basename="${2:-}"
  local output_dir

  if [[ -d "$target" ]]; then
    output_dir="$target"
  else
    output_dir="$(dirname "$target")"
  fi

  if [[ -z "$basename" ]]; then
    basename="$(basename "$output_dir")"
  fi

  mkdir -p "$output_dir"

  local review_path ledger_path smoke_path next_receipt_path summary_path
  review_path="$output_dir/$basename-20-release-export-review-command.json"
  ledger_path="$output_dir/$basename-21-release-receipt-ledger-prepare-command.json"
  smoke_path="$output_dir/$basename-22-release-receipt-ledger-smoke-command.json"
  next_receipt_path="$output_dir/$basename-23-release-receipt-ledger-next-command.json"
  summary_path="$output_dir/$basename-tower-local-prepare-summary.json"

  release_export_review "$target" json > "$review_path"
  release_receipt_ledger_prepare "$output_dir" "$basename" > "$ledger_path"
  release_receipt_ledger_smoke "$output_dir" > "$smoke_path"
  release_receipt_ledger_next "$output_dir" > "$next_receipt_path"

  python3 - "$summary_path" "$output_dir" "$basename" "$review_path" "$ledger_path" "$smoke_path" "$next_receipt_path" <<'PY'
import json
import os
import shutil
import sys
from datetime import datetime, timezone

summary_path, output_dir, basename, review_path, ledger_path, smoke_path, next_receipt_path = sys.argv[1:8]

def load(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as error:
        return {"_loadError": str(error), "_path": path}

review = load(review_path)
ledger = load(ledger_path)
smoke = load(smoke_path)
next_receipt = load(next_receipt_path)

summary = {
    "packetType": "quipsly-tower-local-prepare-summary",
    "version": "2026-06-20.tower-local-prepare.v1",
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "status": "ready-for-receipt-capture" if smoke.get("ok") else "needs-review",
    "outputDir": output_dir,
    "basename": basename,
    "releaseExportReviewOk": not bool(review.get("_loadError")),
    "receiptLedgerPrepared": ledger.get("status") in {"receipt-targets-prepared", "receipts-in-progress", "publication-proved"},
    "receiptLedgerSmokeOk": smoke.get("ok"),
    "receiptTargetCount": ledger.get("receiptTargetCount") or smoke.get("receiptTargetCount"),
    "remainingReceiptCount": ledger.get("remainingReceiptCount") if ledger.get("remainingReceiptCount") is not None else smoke.get("remainingReceiptCount"),
    "evidenceGradeCounts": ledger.get("evidenceGradeCounts") or smoke.get("evidenceGradeCounts") or {},
    "creativePartnerPolicy": ledger.get("creativePartnerPolicy") or review.get("creativePartnerPolicy") or {
        "agentAuthoredWorkAllowed": True,
        "seriousAgentWorkIsNotPlaceholder": True,
        "publicationGate": "artifact review plus platform receipt truth, not authorship purity",
    },
    "artifacts": {
        "releaseExportReviewCommand": review_path,
        "receiptLedgerPrepareCommand": ledger_path,
        "receiptLedgerSmokeCommand": smoke_path,
        "receiptLedgerNextCommand": next_receipt_path,
        "latestReleaseExportReview": os.path.join(output_dir, "latest-release-export-review.json"),
        "latestReleaseReceiptLedger": os.path.join(output_dir, "latest-release-receipt-ledger.json"),
        "nextReceiptMarkdown": os.path.join(output_dir, "NEXT-RECEIPT.md"),
        "releaseExportReviewMarkdown": os.path.join(output_dir, "RELEASE-EXPORT-REVIEW.md"),
        "releaseReceiptLedgerMarkdown": os.path.join(output_dir, "RELEASE-RECEIPT-LEDGER.md"),
    },
    "nextActions": [
        "Open RELEASE-EXPORT-REVIEW.md to inspect local artifacts and receipt targets.",
        "Open RELEASE-RECEIPT-LEDGER.md to choose the first receipt row.",
        "Open NEXT-RECEIPT.md for the smallest next operator action.",
        "After posting or scheduling externally, run release-receipt-ledger-update with the row ID and proof.",
        "Run release-receipt-ledger-smoke after updates.",
    ],
    "truth": "This command reviews existing local export artifacts, prepares local receipt rows, and smokes the local ledger. It does not export, upload, schedule, publish, verify providers, or capture receipts.",
}

with open(summary_path, "w", encoding="utf-8") as handle:
    json.dump(summary, handle, indent=2, sort_keys=True)
    handle.write("\n")

latest_summary_path = os.path.join(output_dir, "latest-tower-local-prepare-summary.json")
shutil.copyfile(summary_path, latest_summary_path)
summary["artifacts"]["latestSummary"] = latest_summary_path
summary_markdown_path = os.path.join(output_dir, f"START-HERE-TOWER-LOCAL-PREP-{basename}.md")
latest_summary_markdown_path = os.path.join(output_dir, "START-HERE-TOWER-LOCAL-PREP.md")
summary["artifacts"]["summaryMarkdown"] = summary_markdown_path
summary["artifacts"]["latestSummaryMarkdown"] = latest_summary_markdown_path

with open(summary_path, "w", encoding="utf-8") as handle:
    json.dump(summary, handle, indent=2, sort_keys=True)
    handle.write("\n")
shutil.copyfile(summary_path, latest_summary_path)

policy = summary.get("creativePartnerPolicy") or {}
lines = [
    f"# Tower local prep: {basename}",
    "",
    "This folder is ready for the human/operator side of Tower review.",
    "",
    "It was prepared from existing local release-export artifacts. It did not export, upload, schedule, publish, verify providers, or capture receipts.",
    "",
    "## Current state",
    "",
    f"- Status: `{summary.get('status')}`",
    f"- Receipt targets: `{summary.get('receiptTargetCount')}`",
    f"- Remaining receipts: `{summary.get('remainingReceiptCount')}`",
    f"- Receipt ledger smoke: `{summary.get('receiptLedgerSmokeOk')}`",
    f"- Evidence grades: `{json.dumps(summary.get('evidenceGradeCounts') or {}, sort_keys=True)}`",
    f"- Next receipt row: `{(next_receipt.get('nextReceipt') or {}).get('id') or 'none'}`",
    "",
    "## Open these first",
    "",
    f"1. Release review: `{summary['artifacts']['releaseExportReviewMarkdown']}`",
    f"2. Receipt ledger: `{summary['artifacts']['releaseReceiptLedgerMarkdown']}`",
    f"3. Next receipt card: `{summary['artifacts']['nextReceiptMarkdown']}`",
    f"4. JSON summary: `{latest_summary_path}`",
    "",
    "## Next actions",
    "",
]
for index, action in enumerate(summary.get("nextActions") or [], start=1):
    lines.append(f"{index}. {action}")
lines.extend([
    "",
    "## Creative partner and provenance",
    "",
    policy.get("truth") or "Agent-authored or mixed-authorship work is allowed when provenance, review state, canon state, publication state, and receipt evidence stay visible.",
    "",
    f"- Agent-authored work allowed: `{policy.get('agentAuthoredWorkAllowed')}`",
    f"- Serious agent work is not placeholder by default: `{policy.get('seriousAgentWorkIsNotPlaceholder')}`",
    f"- Publication gate: `{policy.get('publicationGate')}`",
    "",
    "## Boundary",
    "",
    summary.get("truth") or "",
    "",
])
with open(summary_markdown_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines))
shutil.copyfile(summary_markdown_path, latest_summary_markdown_path)

print(json.dumps(summary, indent=2, sort_keys=True))
PY
}

nest_writing_smoke() {
  local state_path packet_path
  state_path="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-nest-state.XXXXXX")"
  packet_path="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-nest-packet.XXXXXX")"

  get "/state" > "$state_path"
  get "/nest_writing_packet" > "$packet_path"

  python3 - "$state_path" "$packet_path" <<'PY'
import json
import os
import sys

state_path, packet_path = sys.argv[1:3]
with open(state_path) as f:
    state = json.load(f)
with open(packet_path) as f:
    packet_state = json.load(f)

nest = state.get("nest") or {}
readiness = nest.get("writingReadiness") or {}
selected_document = nest.get("selectedDocument") or {}
selected_block = nest.get("selectedBlock") or {}
agent_commands = nest.get("agentCommands") or []
packet_output_path = (packet_state.get("outputPath") or "").strip()

command_sources = [agent_commands, readiness.get("commands") or {}, readiness.get("nextActionQueue") or []]
command_parts = []
for source in command_sources:
    if isinstance(source, dict):
        command_parts.extend(str(value) for value in source.values())
    elif isinstance(source, list):
        command_parts.extend(str(value) for value in source)
    else:
        command_parts.append(str(source))
command_text = " ".join(command_parts)

def int_value(*values):
    for value in values:
        if isinstance(value, int):
            return value
        try:
            if value is not None and str(value).strip() != "":
                return int(value)
        except Exception:
            pass
    return 0

block_count = int_value(nest.get("blockCount"))
document_count = int_value(nest.get("documentCount"))
authored_count = int_value(readiness.get("authoredBlockCount"), nest.get("authoredBlockCount"))
review_count = int_value(readiness.get("authoredNeedsReviewCount"), readiness.get("reviewQueueCount"))
source_count = int_value(readiness.get("sourceContextBlockCount"), nest.get("sourceContextSummaryCount"))
source_status = readiness.get("sourceContextStatus") or nest.get("sourceContextStatus") or ""

checks = []

def check(name, ok, detail, expected=None, actual=None):
    checks.append({
        "name": name,
        "ok": bool(ok),
        "detail": detail,
        "expected": expected,
        "actual": actual,
    })

check(
    "writing document available",
    nest.get("writingDocumentAvailable") is True,
    "Nest needs a real writing document before it can be the manuscript/capture layer.",
    expected=True,
    actual=nest.get("writingDocumentAvailable"),
)
check(
    "documents exist",
    document_count > 0,
    "At least one document should be loaded in the Nest state.",
    expected=">0",
    actual=document_count,
)
check(
    "blocks exist",
    block_count > 0,
    "The writing/capture layer should expose blocks, not only an empty shell.",
    expected=">0",
    actual=block_count,
)
check(
    "authored work exists",
    authored_count > 0,
    "Dogfooding needs real authored or agent-authored material to travel through the loop.",
    expected=">0",
    actual=authored_count,
)
check(
    "review queue visible",
    review_count >= 0 and "authoredNeedsReviewCount" in readiness,
    "Nest should expose review state explicitly so agent-authored work is not flattened into canon.",
    expected="authoredNeedsReviewCount present",
    actual={"reviewCount": review_count, "keys": sorted(readiness.keys())},
)
check(
    "next review action visible",
    bool(readiness.get("nextActionQueue")) or review_count == 0,
    "When drafted work needs review, Nest should expose a concrete next action instead of making collaborators hunt.",
    expected="nextActionQueue when review count > 0",
    actual=readiness.get("nextActionQueue"),
)
check(
    "source context available",
    source_status == "available" or source_count > 0,
    "The writing layer should carry source/context snippets when available.",
    expected="available source context or source count > 0",
    actual={"sourceStatus": source_status, "sourceCount": source_count},
)
check(
    "selected document visible",
    bool(selected_document.get("id") or selected_document.get("title")),
    "A collaborator should be able to tell which document is active.",
    expected="selected document id/title",
    actual=selected_document,
)
check(
    "selected block visible",
    bool(selected_block.get("id") or selected_block.get("title") or selected_block.get("text")),
    "A collaborator should be able to tell which block is active or being reviewed.",
    expected="selected block id/title/text",
    actual=selected_block,
)
for command_name, endpoint_name in [
    ("nest-append-block", "nest_append_block"),
    ("nest-update-block", "nest_update_block"),
    ("nest-select-block", "nest_select_block"),
    ("nest-mark-block", "nest_mark_block"),
]:
    check(
        f"agent command exposed: {command_name}",
        command_name in command_text or endpoint_name in command_text,
        "Codex needs semantic writing controls, not hidden UI-only behavior.",
        expected=f"{command_name} or {endpoint_name} in Nest command surfaces",
        actual=command_text[:1000],
    )
check(
    "nest writing packet generated",
    packet_state.get("status") == "generated" and bool(packet_output_path),
    "The writing handoff should have a generated packet path for humans and agents.",
    expected="generated + outputPath",
    actual={"status": packet_state.get("status"), "outputPath": packet_output_path},
)
check(
    "nest writing packet exists on disk",
    bool(packet_output_path) and os.path.exists(packet_output_path),
    "Generated packet paths should be real files, not memory-only claims.",
    expected="existing packet file",
    actual=packet_output_path,
)

ok = all(item["ok"] for item in checks)
print(json.dumps({
    "model": "quipsly-nest-writing-smoke",
    "version": "2026-06-20.nest-writing-smoke.v1",
    "ok": ok,
    "writingStatus": readiness.get("status") or "unknown",
    "writingDocumentAvailable": nest.get("writingDocumentAvailable"),
    "documentCount": document_count,
    "blockCount": block_count,
    "authoredBlockCount": authored_count,
    "authoredNeedsReviewCount": review_count,
    "sourceContextStatus": source_status,
    "packetStatus": packet_state.get("status"),
    "packetOutputPath": packet_output_path,
    "checks": checks,
    "truth": "This is a read-only Nest writing/capture smoke. It proves the live Nest layer exposes authored work, review state, source context, semantic agent commands, and a generated writing packet; it does not canonize text.",
}, indent=2))

sys.exit(0 if ok else 1)
PY
}

shorts_queue_summary() {
  local payload_file
  payload_file="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-shorts-queue.XXXXXX")"
  get "/shorts_queue" > "$payload_file"
  python3 - "$payload_file" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

clips = payload.get("clips") or []

def exported_paths(clip):
    notes = clip.get("publishNotes") or ""
    paths = []
    for line in notes.splitlines():
        marker = "Exported 9:16 short: "
        if marker in line:
            paths.append(line.split(marker, 1)[1].strip())
        marker = "Export started: "
        if marker in line:
            paths.append(line.split(marker, 1)[1].strip())
    unique = []
    for path in paths:
        if path and path not in unique:
            unique.append(path)
    return unique

def review_next_action(clip):
    review = (clip.get("reviewStatus") or "draft").lower()
    export = (clip.get("exportStatus") or "").lower()
    if review in {"keep", "approved", "approved-for-social-queue"}:
        return "ready for social queue handoff; capture publication receipts after posting"
    if review == "reject":
        return "keep as learning data; do not publish"
    if review == "refine":
        return "tighten range, crop, hook, overlay, caption, or audio before export"
    if export == "exported":
        return "watch the exported artifact once, then mark keep/refine/reject"
    return "preview in the editor, then export a 9:16 artifact for review"

summary = {
    "status": payload.get("status", "ok"),
    "clipCount": len(clips),
    "canBatchExport": payload.get("canBatchExport"),
    "batchExportEndpoint": payload.get("batchExportEndpoint"),
    "clips": [],
}
for index, clip in enumerate(clips, start=1):
    segments = clip.get("segments") or []
    paths = exported_paths(clip)
    primary_path = paths[0] if paths else ""
    summary["clips"].append({
        "index": index,
        "id": clip.get("id"),
        "title": clip.get("title"),
        "status": clip.get("status"),
        "reviewStatus": clip.get("reviewStatus"),
        "exportStatus": clip.get("exportStatus"),
        "format": clip.get("format"),
        "duration": clip.get("duration") or clip.get("recipeDuration"),
        "startTime": clip.get("startTime") or clip.get("sequenceStartTime"),
        "endTime": clip.get("endTime") or clip.get("sequenceEndTime"),
        "segmentCount": clip.get("segmentCount") or len(segments),
        "hookText": clip.get("hookText"),
        "overlayText": clip.get("primaryOverlayText"),
        "destinations": clip.get("destinations"),
        "notes": clip.get("notes"),
        "publishNotes": clip.get("publishNotes"),
        "exportedPaths": paths,
        "primaryExportPath": primary_path,
        "contactSheetCommand": f"script/agentctl.sh shorts-contact-sheet {json.dumps(primary_path)}" if primary_path else "",
        "reviewNextAction": review_next_action(clip),
        "segments": [
            {
                "index": segment.get("index"),
                "start": segment.get("sequenceStartTime"),
                "end": segment.get("sequenceEndTime"),
                "duration": segment.get("duration"),
                "title": segment.get("title"),
            }
            for segment in segments[:8]
        ],
    })

print(json.dumps(summary, indent=2, sort_keys=True))
PY
  rm -f "$payload_file"
}

codex_observe() {
  python3 - "$BASE_URL" <<'PY'
import json
import sys
import urllib.request

base_url = sys.argv[1].rstrip("/")

def fetch(path):
    with urllib.request.urlopen(base_url + path, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))

payload = {
    "packetType": "quipslystudio-codex-observe",
    "truth": "Start here before agent-assisted editing. Handoff explains the contract; state is the live proof surface.",
    "handoff": fetch("/codex_editor_handoff"),
    "state": fetch("/state"),
}
print(json.dumps(payload, indent=2, sort_keys=True))
PY
}

codex_observe_save() {
  local output_dir="${1:-$ROOT_DIR/.quipsly/agent-observations}"
  mkdir -p "$output_dir"
  local stamp
  stamp="$(date -u +"%Y%m%dT%H%M%SZ")"
  local output_path="$output_dir/codex-observe-$stamp.json"
  codex_observe > "$output_path"
  printf '%s\n' "$output_path"
}

codex_release_observe() {
  python3 - "$BASE_URL" <<'PY'
import json
import sys
import urllib.error
import urllib.request

base_url = sys.argv[1].rstrip("/")

def fetch(path):
    try:
        with urllib.request.urlopen(base_url + path, timeout=5) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        return {"status": "http_error", "path": path, "code": error.code, "body": body[:2000]}
    except Exception as error:
        return {"status": "error", "path": path, "error": str(error)}

payload = {
    "packetType": "quipslystudio-codex-release-observe",
    "truth": "Start here before release or publishing work. Prepared artifacts are not proof of publication.",
    "handoff": fetch("/codex_editor_handoff"),
    "state": fetch("/state"),
    "deliveryReadiness": fetch("/delivery_readiness"),
    "publicationReadyHandoff": fetch("/publication_ready_handoff"),
    "missingPublicationReceipts": fetch("/missing_publication_receipts"),
    "publicationReceiptCockpit": fetch("/publication_receipt_cockpit"),
    "publicationNextReceipt": fetch("/publication_next_receipt"),
    "publicationMissionControl": fetch("/publication_mission_control"),
    "publishDestinations": fetch("/publish_destinations"),
    "socialMasterQueue": fetch("/social_master_queue"),
    "podcastPacket": fetch("/podcast_packet"),
}
print(json.dumps(payload, indent=2, sort_keys=True))
PY
}

codex_release_observe_save() {
  local output_dir="${1:-$ROOT_DIR/.quipsly/agent-observations}"
  mkdir -p "$output_dir"
  local stamp
  stamp="$(date -u +"%Y%m%dT%H%M%SZ")"
  local output_path="$output_dir/codex-release-observe-$stamp.json"
  codex_release_observe > "$output_path"
  printf '%s\n' "$output_path"
}

vertical_slice_prepare() {
  local output_dir="${1:-$ROOT_DIR/.quipsly/vertical-slice-handoffs}"
  local basename="${2:-}"
  local stamp
  stamp="$(date -u +"%Y%m%dT%H%M%SZ")"
  if [[ -z "$basename" ]]; then
    basename="episode-1-vertical-slice-$stamp"
  fi

  mkdir -p "$output_dir"

  local before_path next_action_path seed_path writing_generate_path slice_generate_path
  local nest_packet_path handoff_path mission_path receipt_cockpit_path next_receipt_path ship_smoke_path studio_smoke_path delivery_smoke_path slice_packet_path after_path manifest_path
  local start_here_path
  before_path="$output_dir/$basename-00-before-state.json"
  next_action_path="$output_dir/$basename-01-nest-next-action.json"
  seed_path="$output_dir/$basename-02-nest-seed-context.json"
  writing_generate_path="$output_dir/$basename-03-nest-writing-generate.json"
  slice_generate_path="$output_dir/$basename-04-vertical-slice-generate.json"
  nest_packet_path="$output_dir/$basename-05-nest-writing-packet-state.json"
  handoff_path="$output_dir/$basename-06-publication-ready-handoff.json"
  mission_path="$output_dir/$basename-07-publication-mission-control.json"
  receipt_cockpit_path="$output_dir/$basename-08-publication-receipt-cockpit.json"
  next_receipt_path="$output_dir/$basename-09-publication-next-receipt.json"
  ship_smoke_path="$output_dir/$basename-10-ship-map-smoke.json"
  studio_smoke_path="$output_dir/$basename-11-studio-edit-smoke.json"
  delivery_smoke_path="$output_dir/$basename-12-delivery-artifact-smoke.json"
  slice_packet_path="$output_dir/$basename-13-vertical-slice-packet-state.json"
  after_path="$output_dir/$basename-14-after-state.json"
  manifest_path="$output_dir/$basename-manifest.json"
  start_here_path="$output_dir/START-HERE-$basename.md"

  get "/state" > "$before_path"
  get "/nest_writing_next_action?index=1&kind=" > "$next_action_path"
  sleep "${QUIPSLY_AGENT_PREP_DELAY:-0.35}"
  get "/nest_seed_context" > "$seed_path"
  sleep "${QUIPSLY_AGENT_PREP_DELAY:-0.35}"
  get "/nest_writing_packet_generate?directory=$(urlencode "$output_dir")&basename=$(urlencode "$basename-nest-writing")" > "$writing_generate_path"
  sleep "${QUIPSLY_AGENT_PREP_DELAY:-0.65}"
  get "/vertical_slice_packet_generate?directory=$(urlencode "$output_dir")&basename=$(urlencode "$basename")" > "$slice_generate_path"
  sleep "${QUIPSLY_AGENT_PREP_DELAY:-0.65}"
  get "/nest_writing_packet" > "$nest_packet_path"
  get "/publication_ready_handoff" > "$handoff_path"
  get "/publication_mission_control" > "$mission_path"
  get "/publication_receipt_cockpit" > "$receipt_cockpit_path"
  get "/publication_next_receipt" > "$next_receipt_path"
  ship_map_smoke > "$ship_smoke_path"
  studio_edit_smoke > "$studio_smoke_path"
  delivery_artifact_smoke > "$delivery_smoke_path"
  get "/vertical_slice_packet" > "$slice_packet_path"
  get "/state" > "$after_path"

  python3 - "$manifest_path" "$start_here_path" "$output_dir" "$basename" "$before_path" "$next_action_path" "$seed_path" "$writing_generate_path" "$slice_generate_path" "$nest_packet_path" "$handoff_path" "$mission_path" "$receipt_cockpit_path" "$next_receipt_path" "$ship_smoke_path" "$studio_smoke_path" "$delivery_smoke_path" "$slice_packet_path" "$after_path" <<'PY'
import json
import os
import shlex
import shutil
import sys
from datetime import datetime, timezone

(
    manifest_path,
    start_here_path,
    output_dir,
    basename,
    before_path,
    next_action_path,
    seed_path,
    writing_generate_path,
    slice_generate_path,
    nest_packet_path,
    handoff_path,
    mission_path,
    receipt_cockpit_path,
    next_receipt_path,
    ship_smoke_path,
    studio_smoke_path,
    delivery_smoke_path,
    slice_packet_path,
    after_path,
) = sys.argv[1:]

def load(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as error:
        return {"_loadError": str(error), "_path": path}

before = load(before_path)
after = load(after_path)
next_action = load(next_action_path)
seed = load(seed_path)
writing_generate = load(writing_generate_path)
slice_generate = load(slice_generate_path)
nest_packet = load(nest_packet_path)
handoff = load(handoff_path)
mission = load(mission_path)
receipt_cockpit = load(receipt_cockpit_path)
next_receipt = load(next_receipt_path)
ship_smoke = load(ship_smoke_path)
studio_smoke = load(studio_smoke_path)
delivery_smoke = load(delivery_smoke_path)
slice_packet = load(slice_packet_path)

nest_writing = mission.get("nestWriting") or handoff.get("nestWriting") or {}
mission_summary = mission.get("summary") or {}
after_writing_readiness = ((after.get("nest") or {}).get("writingReadiness") or {})
authored_needs_review = (
    after_writing_readiness.get("authoredNeedsReviewCount")
    if isinstance(after_writing_readiness, dict)
    else None
)
if authored_needs_review is None:
    authored_needs_review = nest_writing.get("authoredNeedsReviewCount")
if authored_needs_review is None:
    authored_needs_review = nest_writing.get("reviewQueueCount") or mission_summary.get("nestWritingReviewQueueCount") or 0

release_export_dir = os.path.join(os.path.expanduser("~/Movies/QuipslyExports/Episode1Tower"), basename)
release_export_basename = f"{basename}-release"
release_export_prepare_command = (
    "apps/QuipslyStudio/script/agentctl.sh release-export-prepare "
    f"{shlex.quote(release_export_dir)} {shlex.quote(release_export_basename)} 8 180"
)
release_export_smoke_command = (
    "apps/QuipslyStudio/script/agentctl.sh release-export-smoke "
    f"{shlex.quote(release_export_dir)}"
)

payload = {
    "packetType": "quipslystudio-vertical-slice-prepare-manifest",
    "version": "2026-06-20.vertical-slice-prepare.v1",
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "truth": "This command orients Nest writing, refreshes source context, generates manuscript and vertical-slice packets, then reads Tower mission truth. It does not canonize writing, export media, upload, publish, or capture receipts.",
    "outputDir": output_dir,
    "basename": basename,
    "status": mission.get("status") or after.get("publicationMissionControl", {}).get("status") or "unknown",
    "nestWritingStatus": nest_writing.get("status") or mission_summary.get("nestWritingStatus") or "unknown",
    "nestWritingPacketStatus": nest_writing.get("packetStatus") or nest_packet.get("status") or "unknown",
    "nestWritingPacketPath": nest_writing.get("packetOutputPath") or nest_packet.get("outputPath") or "",
    "verticalSlicePacketStatus": slice_packet.get("status") or "unknown",
    "verticalSlicePacketPath": slice_packet.get("outputPath") or "",
    "authoredBlockCount": nest_writing.get("authoredBlockCount") or mission_summary.get("nestWritingAuthoredBlockCount") or 0,
    "reviewQueueCount": nest_writing.get("reviewQueueCount") or mission_summary.get("nestWritingReviewQueueCount") or 0,
    "authoredNeedsReviewCount": authored_needs_review,
    "sourceContextStatus": nest_writing.get("sourceContextStatus") or mission_summary.get("nestWritingSourceContextStatus") or "unknown",
    "readyLaneCount": mission_summary.get("readyLaneCount"),
    "laneCount": mission_summary.get("laneCount"),
    "publicationComplete": mission_summary.get("publicationComplete"),
    "receiptCockpitStatus": receipt_cockpit.get("status") or "unknown",
    "nextReceiptId": next_receipt.get("receiptId") or (next_receipt.get("nextReceipt") or {}).get("id") or "",
    "nextReceiptLabel": next_receipt.get("displayLabel") or (next_receipt.get("nextReceipt") or {}).get("displayLabel") or "",
    "shipMapSmokeOk": ship_smoke.get("ok"),
    "shipMapSmokeStatus": ship_smoke.get("status") or mission.get("status") or "unknown",
    "studioEditSmokeOk": studio_smoke.get("ok"),
    "studioEditSmokeStatus": studio_smoke.get("status") or "unknown",
    "deliveryArtifactSmokeOk": delivery_smoke.get("ok"),
    "deliveryArtifactSmokeStatus": delivery_smoke.get("status") or "unknown",
    "nextAction": mission.get("nextAction") or nest_writing.get("nextAction") or "",
    "creativePartnerTruth": "Codex/Quipslys may create serious first-pass content. This prep preserves authorship, review state, source context, packet paths, and publication boundaries.",
    "canonBoundary": "Prepared handoffs are not canon approval and not publication proof.",
    "releaseExport": {
        "status": "not-run-by-vertical-slice-prepare",
        "reason": "Vertical-slice prep is a lightweight handoff. Local derivative export is deliberate because it creates files and may be long-running.",
        "defaultOutputDir": release_export_dir,
        "defaultBasename": release_export_basename,
        "proofSecondsDefault": 8,
        "waitSecondsDefault": 180,
        "prepareCommand": release_export_prepare_command,
        "smokeCommand": release_export_smoke_command,
        "truth": "This creates local derivative artifacts only. It does not upload, schedule, publish, canonize manuscript text, mutate source media, or capture platform receipts.",
    },
    "artifacts": {
        "beforeState": before_path,
        "nestNextActionResponse": next_action_path,
        "nestSeedContextResponse": seed_path,
        "nestWritingGenerateResponse": writing_generate_path,
        "verticalSliceGenerateResponse": slice_generate_path,
        "nestWritingPacketState": nest_packet_path,
        "publicationReadyHandoff": handoff_path,
        "publicationMissionControl": mission_path,
        "publicationReceiptCockpit": receipt_cockpit_path,
        "publicationNextReceipt": next_receipt_path,
        "shipMapSmoke": ship_smoke_path,
        "studioEditSmoke": studio_smoke_path,
        "deliveryArtifactSmoke": delivery_smoke_path,
        "verticalSlicePacketState": slice_packet_path,
        "afterState": after_path,
        "startHere": start_here_path,
    },
    "responses": {
        "nestNextActionStatus": next_action.get("status"),
        "nestSeedContextStatus": seed.get("status"),
        "nestWritingGenerateStatus": writing_generate.get("status"),
        "verticalSliceGenerateStatus": slice_generate.get("status"),
    },
    "safeFollowups": [
        "Inspect publicationMissionControl before claiming release readiness.",
        "Inspect the generated Nest writing packet before promoting manuscript text toward canon.",
        "Run releaseExport.prepareCommand only when you intentionally want local derivative files for operator review.",
        "Capture platform receipts after upload/schedule before claiming anything is published.",
    ],
}

with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")

status = payload.get("status") or "unknown"
nest_status = payload.get("nestWritingStatus") or "unknown"
packet_status = payload.get("verticalSlicePacketStatus") or "unknown"
source_status = payload.get("sourceContextStatus") or "unknown"
ready_lanes = payload.get("readyLaneCount")
lane_count = payload.get("laneCount")
ready_text = f"{ready_lanes}/{lane_count}" if ready_lanes is not None and lane_count is not None else "unknown"

lines = [
    f"# Quipsly vertical-slice handoff: {basename}",
    "",
    "This folder is a proof packet for the current Nest -> Studio -> Tower loop.",
    "",
    "## Current read",
    "",
    f"- Overall Tower status: `{status}`",
    f"- Nest writing status: `{nest_status}`",
    f"- Nest writing packet: `{payload.get('nestWritingPacketStatus') or 'unknown'}`",
    f"- Vertical-slice packet: `{packet_status}`",
    f"- Source context: `{source_status}`",
    f"- Authored blocks: `{payload.get('authoredBlockCount')}`",
    f"- Authored blocks needing review: `{payload.get('authoredNeedsReviewCount')}`",
    f"- Packet review queue entries: `{payload.get('reviewQueueCount')}`",
    f"- Ready publication lanes: `{ready_text}`",
    f"- Publication complete: `{payload.get('publicationComplete')}`",
    f"- Receipt cockpit status: `{payload.get('receiptCockpitStatus')}`",
    f"- Next receipt: `{payload.get('nextReceiptLabel') or payload.get('nextReceiptId') or 'none'}`",
    f"- Ship Map consistency smoke: `{payload.get('shipMapSmokeOk')}`",
    f"- Studio edit smoke: `{payload.get('studioEditSmokeOk')}`",
    f"- Delivery artifact smoke: `{payload.get('deliveryArtifactSmokeOk')}`",
    "",
    "## What this does mean",
    "",
    "- The app can currently prepare a connected handoff across Nest writing context, Studio episode state, and Tower publication readiness.",
    "- Agent-authored work is treated as real reviewable work, not fake placeholder by default.",
    "- The handoff includes authorship, review state, source-context status, packet paths, and next actions.",
    "",
    "## Creative partner rule",
    "",
    "- Codex and Quipslys can create real first-pass writing, edits, captions, storyboards, research packets, shorts, and publication copy when the workflow needs material to move forward.",
    "- Do not treat all assistant-created work as placeholder. Placeholder work is disposable proof material; serious agent-authored work can be reviewed, revised, canonized, or published later.",
    "- The boundary is hidden mutation, not authorship. Keep provenance, source context, review state, canon state, and publication proof visible.",
    "",
    "## What this does not mean",
    "",
    "- This does not approve manuscript canon.",
    "- This does not upload to YouTube, Patreon, podcast hosts, or social platforms.",
    "- This does not prove publication. Platform URLs/provider receipts must still be captured after posting or scheduling.",
    "- This does not mutate protected source media.",
    "",
    "## Next action",
    "",
    payload.get("nextAction") or "Inspect the publication mission control packet and decide the next human/agent action.",
    "",
    "## Important files",
    "",
    f"- Manifest JSON: `{manifest_path}`",
    f"- Publication Mission Control: `{mission_path}`",
    f"- Publication Ready Handoff: `{handoff_path}`",
    f"- Publication Receipt Cockpit: `{receipt_cockpit_path}`",
    f"- Publication Next Receipt: `{next_receipt_path}`",
    f"- Nest Writing Packet State: `{nest_packet_path}`",
    f"- Vertical Slice Packet State: `{slice_packet_path}`",
    f"- Before state: `{before_path}`",
    f"- After state: `{after_path}`",
    "",
    "## Safe follow-ups",
    "",
]
for item in payload.get("safeFollowups") or []:
    lines.append(f"- {item}")
lines.extend([
    "",
    "## Optional local release export",
    "",
    "Vertical-slice prep does not render derivative files automatically. When you want local review artifacts, run:",
    "",
    "```bash",
    release_export_prepare_command,
    "```",
    "",
    "Then prove the exported folder with:",
    "",
    "```bash",
    release_export_smoke_command,
    "```",
    "",
    "This creates local 16:9, 9:16, shorts, and podcast-audio derivative artifacts for review. It does not upload, schedule, publish, canonize text, mutate source media, or capture receipts.",
    "",
    "## Operator rule",
    "",
    "Prepared handoffs are useful, but receipts are proof. If there is no platform URL/provider receipt, do not call it published.",
    "",
])
with open(start_here_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines))

latest_start_here_path = os.path.join(output_dir, "START-HERE.md")
latest_manifest_path = os.path.join(output_dir, "latest-vertical-slice-manifest.json")
nest_review_path = os.path.join(output_dir, f"NEST-WRITING-REVIEW-{basename}.md")
latest_nest_review_path = os.path.join(output_dir, "NEST-WRITING-REVIEW.md")
studio_review_path = os.path.join(output_dir, f"STUDIO-EDIT-REVIEW-{basename}.md")
latest_studio_review_path = os.path.join(output_dir, "STUDIO-EDIT-REVIEW.md")
tower_review_path = os.path.join(output_dir, f"TOWER-PUBLICATION-REVIEW-{basename}.md")
latest_tower_review_path = os.path.join(output_dir, "TOWER-PUBLICATION-REVIEW.md")
agent_first_pass_path = os.path.join(output_dir, f"AGENT-CREATIVE-FIRST-PASS-{basename}.md")
latest_agent_first_pass_path = os.path.join(output_dir, "AGENT-CREATIVE-FIRST-PASS.md")
shorts_platform_copy_path = os.path.join(output_dir, f"SHORTS-PLATFORM-COPY-{basename}.md")
latest_shorts_platform_copy_path = os.path.join(output_dir, "SHORTS-PLATFORM-COPY.md")

def one_line(text, limit=220):
    value = str(text or "").replace("\n", " ").strip()
    return value if len(value) <= limit else value[: max(0, limit - 3)] + "..."

def load_optional_json(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return {}

nest_packet_full = load_optional_json(payload.get("nestWritingPacketPath") or "")
nest_readiness = nest_packet_full.get("writingReadiness") or {}
nest_selected = nest_packet_full.get("selectedBlock") or {}
nest_review_queue = nest_packet_full.get("reviewQueue") or []
nest_next_draft = nest_readiness.get("nextDraftSuggestion") or {}
default_serious_draft_command = 'script/agentctl.sh nest-serious-draft "Title" "Draft text" episode-1'
nest_next_draft_command = nest_next_draft.get("fileCommand") or nest_next_draft.get("shortcutCommand") or nest_next_draft.get("appendCommand") or default_serious_draft_command
nest_review_lines = [
    f"# Nest writing review: {basename}",
    "",
    "This is the manuscript/content review page for the current vertical-slice handoff.",
    "",
    "## Current writing state",
    "",
    f"- Status: `{nest_readiness.get('status') or 'unknown'}`",
    f"- Authored blocks: `{nest_packet_full.get('authoredBlockCount', payload.get('authoredBlockCount'))}`",
    f"- Agent-authored blocks: `{nest_readiness.get('agentAuthoredBlockCount', 'unknown')}`",
    f"- Authored blocks needing review: `{nest_readiness.get('authoredNeedsReviewCount', payload.get('authoredNeedsReviewCount'))}`",
    f"- Packet review queue entries: `{nest_packet_full.get('reviewQueueCount', payload.get('reviewQueueCount'))}`",
    f"- Source context: `{nest_packet_full.get('sourceContextStatus', payload.get('sourceContextStatus'))}`",
    f"- Source summaries: `{nest_packet_full.get('sourceContextSummaryCount', payload.get('sourceContextSummaryCount', 'unknown'))}`",
    "",
    "## Next serious draft",
    "",
    "Use this only when the workflow needs real writing material to keep moving. This creates serious first-pass work, not fake placeholder text.",
    "",
    f"- Suggested title: `{nest_next_draft.get('title', 'Episode 1 - Next High Ground Odyssey beat')}`",
    f"- Authorship: `{nest_next_draft.get('authorship', 'agent-authored')}`",
    f"- Review status: `{nest_next_draft.get('reviewStatus', 'agent-first-pass')}`",
    f"- Shortcut: `{nest_next_draft_command}`",
    "",
    "## Authorship and review vocabulary",
    "",
    "- `agent-authored`: serious first-pass or support material by default, unless explicitly marked as disposable fixture content.",
    "- `mixed-authorship`: materially shaped by both human and agent collaborators.",
    "- `source-context`: supporting source material; do not silently promote it to manuscript canon.",
    "- `agent-first-pass`: reviewable draft state, not canon and not publication approval.",
    "- `canon-approved`: approved as manuscript/project canon.",
    "",
    "## Selected work",
    "",
]
if nest_selected:
    nest_review_lines.extend([
        one_line((nest_selected.get("textPreview") or nest_selected.get("id") or "Selected block"), 140),
        "",
        f"- Role: `{nest_selected.get('role', '')}`",
        f"- Authorship: `{nest_selected.get('authorship', '')}`",
        f"- Review status: `{nest_selected.get('reviewStatus', '')}`",
        f"- Episode: `{nest_selected.get('episodeSlug', '')}`",
        f"- Select command: `{nest_selected.get('selectCommand', '')}`",
        "",
    ])
else:
    nest_review_lines.extend(["No selected block was present in the packet.", ""])

nest_review_lines.extend([
    "## Review queue",
    "",
])
if nest_review_queue:
    for index, item in enumerate(nest_review_queue[:12], start=1):
        nest_review_lines.extend([
            f"### {index}. {one_line(item.get('title') or item.get('id') or f'Review item {index}', 120)}",
            "",
            f"- Role: `{item.get('role', '')}`",
            f"- Authorship: `{item.get('authorship', '')}`",
            f"- Review status: `{item.get('reviewStatus', '')}`",
            f"- Episode: `{item.get('episodeSlug', '')}`",
            f"- Preview: {one_line(item.get('textPreview'), 360)}",
            f"- Select: `{item.get('selectCommand', '')}`",
            f"- Mark reviewed: `{item.get('markHumanReviewedCommand', '')}`",
            f"- Mark canon: `{item.get('markCanonCommand', '')}`",
            "",
        ])
else:
    nest_review_lines.extend(["No review queue entries.", ""])

nest_review_lines.extend([
    "## Creative partner and provenance",
    "",
    "Codex and other Quipslys may create serious first-pass manuscript material, source summaries, research packets, article drafts, and episode copy when that helps the Nest workflow move. This is not placeholder by default.",
    "",
    "The Nest safeguard is visible lineage: authorship, source context, review status, canon status, and enough trail to revise, reject, or approve deliberately.",
    "",
    "## Guardrail",
    "",
    "This page is read-only review support. It does not canonize, approve, publish, or replace manuscript text.",
    "",
    "Agent-authored work can be serious first-pass work. The safeguard is visible authorship, provenance, review state, source context, and deliberate approval.",
    "",
])
with open(nest_review_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(nest_review_lines))
shutil.copyfile(nest_review_path, latest_nest_review_path)

delivery_readiness = after.get("deliveryReadiness") or {}
delivery_counts = delivery_readiness.get("counts") or {}
delivery_packet = after.get("deliveryPacket") or {}
editor_snapshot = after.get("editorProofSnapshot") or {}
media_report = after.get("mediaRecoveryReport") or {}
episode_spine = after.get("episodeSpine") or {}
studio_spine = episode_spine.get("studio") or {}
export_state = after.get("exportState") or {}
short_queue = after.get("shortClipQueue") or {}
short_review_counts = after.get("shortReviewCounts") or {}
selected_short = after.get("selectedShortClip") or {}
selected_short_proof = after.get("selectedShortProof") or {}
source_policy = (
    delivery_readiness.get("sourcePolicy")
    or delivery_packet.get("sourcePolicy")
    or media_report.get("rules", {}).get("sourcePolicy")
    or episode_spine.get("sourcePolicy")
    or "Whole source lanes stay intact; Studio edits through metadata decisions, proxies, recipes, and reviewable exports."
)

def markdown_value(value, fallback="unknown"):
    if value is None or value == "":
        return fallback
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)

def count_value(*values, fallback="unknown"):
    for value in values:
        if value is not None and value != "":
            return value
    return fallback

source_lanes = media_report.get("lanes") or []
studio_review_lines = [
    f"# Studio edit review: {basename}",
    "",
    "This is the Studio/edit review page for the current vertical-slice handoff.",
    "",
    "It is generated from current app state. It does not mutate edit decisions, source media, export files, or publication truth.",
    "",
    "## Current Studio state",
    "",
    f"- Session: `{markdown_value(after.get('sessionName') or delivery_packet.get('sessionName') or studio_spine.get('sessionName'))}`",
    f"- Sequence: `{markdown_value(after.get('sequenceTitle') or delivery_readiness.get('sequenceTitle') or episode_spine.get('sequenceTitle'))}`",
    f"- Studio spine status: `{markdown_value(studio_spine.get('status') or editor_snapshot.get('status'))}`",
    f"- Editor proof status: `{markdown_value(editor_snapshot.get('statusLabel') or editor_snapshot.get('status'))}`",
    f"- Delivery readiness: `{markdown_value(delivery_packet.get('readiness') or delivery_readiness.get('status') or delivery_packet.get('status'))}`",
    f"- Render foundation ready: `{markdown_value(delivery_readiness.get('renderFoundationReady') if 'renderFoundationReady' in delivery_readiness else delivery_packet.get('renderFoundationReady'))}`",
    f"- Visual rough cut ready: `{markdown_value(delivery_readiness.get('visualRoughCutReady') if 'visualRoughCutReady' in delivery_readiness else delivery_packet.get('visualRoughCutReady'))}`",
    "",
    "## Media and decision readiness",
    "",
    f"- Source lanes: `{count_value(media_report.get('laneCount'), delivery_counts.get('laneCount'))}`",
    f"- Video proxy ready: `{count_value(media_report.get('videoProxyReadyCount'), after.get('videoProxyReadyCount'), delivery_counts.get('videoProxyReadyCount'))}`",
    f"- Video blocked: `{count_value(media_report.get('videoBlockedCount'), delivery_counts.get('videoBlockedCount'))}`",
    f"- Audio ready: `{count_value(media_report.get('audioReadyCount'), delivery_counts.get('audioReadyCount'))}`",
    f"- Audio blocked: `{count_value(media_report.get('audioBlockedCount'), delivery_counts.get('audioBlockedCount'))}`",
    f"- SHOW decisions: `{count_value(media_report.get('showDecisionCount'), delivery_counts.get('showDecisionCount'))}`",
    f"- SKIP decisions: `{count_value(media_report.get('skipDecisionCount'), delivery_counts.get('skipDecisionCount'))}`",
    f"- Source monitor videos: `{count_value(media_report.get('sourceMonitorVideoCount'), delivery_counts.get('sourceMonitorVideoCount'))}`",
    f"- Proxy blocked count: `{markdown_value(after.get('proxyBlockedCount'))}`",
    "",
    "## Export and shorts state",
    "",
    f"- Export status: `{markdown_value(after.get('exportStatus') or export_state.get('status'))}`",
    f"- Export health: `{markdown_value(export_state.get('healthStatus'))}`",
    f"- Export output paths: `{len(after.get('exportOutputPaths') or export_state.get('outputPaths') or [])}`",
    f"- Shorts queued: `{markdown_value(after.get('shortClipQueueCount') or short_queue.get('count'))}`",
    f"- Short review counts: `{json.dumps(short_review_counts, sort_keys=True) if short_review_counts else '{}'}`",
    f"- Selected short: `{one_line(selected_short.get('title') or selected_short.get('id') or selected_short_proof.get('status') or '', 160) or 'none'}`",
    "",
    "## Source policy",
    "",
    one_line(source_policy, 500),
    "",
    "Studio must keep the important invariant visible: originals and whole synced lanes remain intact; SHOW/SKIP decisions, shorts recipes, captions, crops, and export packets are metadata layered on top.",
    "",
    "## Source lanes snapshot",
    "",
]
if source_lanes:
    for index, lane in enumerate(source_lanes[:12], start=1):
        studio_review_lines.extend([
            f"### {index}. {one_line(lane.get('displayName') or lane.get('name') or lane.get('id') or f'Lane {index}', 120)}",
            "",
            f"- Kind: `{markdown_value(lane.get('kind') or lane.get('role'))}`",
            f"- Status: `{markdown_value(lane.get('status') or lane.get('readiness'))}`",
            f"- Proxy: `{markdown_value(lane.get('proxyStatus') or lane.get('proxyReadiness') or lane.get('proxyReady'))}`",
            f"- SHOW: `{markdown_value(lane.get('showDecisionCount') or lane.get('showCount'))}`",
            f"- SKIP: `{markdown_value(lane.get('skipDecisionCount') or lane.get('skipCount'))}`",
            "",
        ])
else:
    studio_review_lines.extend(["No source lane details were present in this proof state.", ""])

studio_review_lines.extend([
    "## Creative partner and provenance",
    "",
    "Codex and other Quipslys may create serious first-pass edit decisions, shorts recipes, captions, crop/framing passes, review notes, and publication-prep media packets. They are part of the creative operator loop, not merely test automation.",
    "",
    "The Studio safeguard is that originals stay intact and agent decisions remain inspectable as metadata, recipes, ledgers, review state, and export artifacts.",
    "",
    "## Useful proof files",
    "",
    f"- After state: `{after_path}`",
    f"- Publication ready handoff: `{handoff_path}`",
    f"- Publication mission control: `{mission_path}`",
    f"- Vertical-slice packet state: `{slice_packet_path}`",
    f"- Manifest JSON: `{manifest_path}`",
    "",
    "## Guardrail",
    "",
    "This page is read-only review support. It does not export, approve, publish, mutate source media, canonize writing, or capture platform receipts.",
    "",
    "A Studio edit can be ready for review or ready for platform posting while still not being published. Tower receipt truth remains the release boundary.",
    "",
])
with open(studio_review_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(studio_review_lines))
shutil.copyfile(studio_review_path, latest_studio_review_path)

publication_mission = after.get("publicationMissionControl") or mission or {}
publication_handoff = after.get("publicationReadyHandoff") or handoff or {}
receipt_cockpit = after.get("publicationReceiptCockpit") or {}
missing_receipts = after.get("missingPublicationReceipts") or publication_mission.get("missingReceipts") or {}
publication_cockpit = after.get("publicationCockpit") or {}
mission_summary = publication_mission.get("summary") or mission_summary or {}
receipt_summary = receipt_cockpit.get("summary") or {}
next_receipt = receipt_cockpit.get("nextReceipt") or {}
family_summary = receipt_cockpit.get("familySummary") or {}
platform_summary = receipt_cockpit.get("platformSummary") or {}
operator_steps = receipt_cockpit.get("operatorSteps") or []
missing_records = receipt_summary.get("missingReceiptRecords") or missing_receipts.get("missingReceipts") or []

def markdown_json(value, limit=900):
    if value is None or value == {} or value == []:
        return "`none`"
    try:
        rendered = json.dumps(value, sort_keys=True)
    except Exception:
        rendered = str(value)
    rendered = rendered.replace("\n", " ")
    if len(rendered) > limit:
        rendered = rendered[: max(0, limit - 3)] + "..."
    return f"`{rendered}`"

def summary_lines(label, value, limit=10):
    lines = [f"## {label}", ""]
    if isinstance(value, dict) and value:
        for key in sorted(value.keys())[:limit]:
            lines.append(f"- {key}: {markdown_json(value.get(key), 360)}")
        if len(value) > limit:
            lines.append(f"- ...and {len(value) - limit} more entries")
    elif isinstance(value, list) and value:
        for index, item in enumerate(value[:limit], start=1):
            lines.append(f"- {index}. {markdown_json(item, 360)}")
        if len(value) > limit:
            lines.append(f"- ...and {len(value) - limit} more entries")
    else:
        lines.append("No summary entries were present.")
    lines.append("")
    return lines

tower_review_lines = [
    f"# Tower publication review: {basename}",
    "",
    "This is the Tower/publication review page for the current vertical-slice handoff.",
    "",
    "It is generated from current app state. It does not upload, schedule, publish, capture receipts, or mark publication complete.",
    "",
    "## Current Tower state",
    "",
    f"- Mission status: `{markdown_value(publication_mission.get('status') or payload.get('status'))}`",
    f"- Publication phase: `{markdown_value(receipt_cockpit.get('publicationPhase') or missing_receipts.get('publicationPhase') or publication_cockpit.get('publicationPhase'))}`",
    f"- Publication complete: `{markdown_value(receipt_cockpit.get('publicationComplete') if 'publicationComplete' in receipt_cockpit else payload.get('publicationComplete'))}`",
    f"- Ready lanes: `{markdown_value(mission_summary.get('readyLaneCount', payload.get('readyLaneCount')))} / {markdown_value(mission_summary.get('laneCount', payload.get('laneCount')))} `",
    f"- Publish ledger records: `{markdown_value(mission_summary.get('publishLedgerRecordCount') or receipt_summary.get('recordCount'))}`",
    f"- Captured receipts: `{markdown_value(receipt_summary.get('capturedCount') or missing_receipts.get('capturedCount') or 0)}`",
    f"- Missing receipts: `{markdown_value(receipt_summary.get('missingCount') or missing_receipts.get('missingCount') or mission_summary.get('missingReceiptCount'))}`",
    f"- Ready for receipt capture: `{markdown_value(receipt_cockpit.get('readyForReceiptCapture'))}`",
    "",
    "## What Tower is saying",
    "",
    one_line(publication_mission.get("nextAction") or receipt_cockpit.get("nextAction") or missing_receipts.get("nextAction") or "Post or schedule the ready artifacts, then capture platform receipts.", 500),
    "",
    "## Next receipt target",
    "",
]
if next_receipt:
    tower_review_lines.extend([
        f"- Target: `{markdown_value(next_receipt.get('displayLabel') or next_receipt.get('platform'))}`",
        f"- Platform: `{markdown_value(next_receipt.get('platform'))}`",
        f"- Lane: `{markdown_value(next_receipt.get('deliveryLaneId'))}`",
        f"- Status: `{markdown_value(next_receipt.get('publishStatus'))}`",
        f"- Artifact ready: `{markdown_value(next_receipt.get('artifactReady'))}`",
        f"- Copy ready: `{markdown_value(next_receipt.get('copyReady'))}`",
        f"- Artifact: `{markdown_value(next_receipt.get('artifactPath'))}`",
        f"- Capture command: `{markdown_value(next_receipt.get('captureCommand'))}`",
        "",
    ])
else:
    tower_review_lines.extend(["No next receipt target was present.", ""])

tower_review_lines.extend([
    "## Publication lanes",
    "",
    f"- 16:9 episode master: `{markdown_value((publication_handoff.get('episode16x9') or {}).get('status') or (publication_handoff.get('episode16x9') or {}).get('readiness'))}`",
    f"- Podcast audio: `{markdown_value((publication_handoff.get('podcastAudio') or {}).get('status') or (publication_handoff.get('podcastAudio') or {}).get('readiness'))}`",
    f"- Social 9:16: `{markdown_value((publication_handoff.get('social9x16') or {}).get('status') or (publication_handoff.get('social9x16') or {}).get('readiness'))}`",
    "",
])
tower_review_lines.extend(summary_lines("Family receipt summary", family_summary))
tower_review_lines.extend(summary_lines("Platform receipt summary", platform_summary))
tower_review_lines.extend([
    "## First missing receipts",
    "",
])
if missing_records:
    for index, record in enumerate(missing_records[:12], start=1):
        tower_review_lines.extend([
            f"### {index}. {one_line(record.get('displayLabel') or record.get('title') or record.get('id') or f'Receipt {index}', 140)}",
            "",
            f"- Platform: `{markdown_value(record.get('platform'))}`",
            f"- Lane: `{markdown_value(record.get('deliveryLaneId'))}`",
            f"- Status: `{markdown_value(record.get('publishStatus'))}`",
            f"- Artifact: `{markdown_value(record.get('artifactPath'))}`",
            f"- Capture: `{markdown_value(record.get('agentCaptureCommand'))}`",
            "",
        ])
    if len(missing_records) > 12:
        tower_review_lines.append(f"...and {len(missing_records) - 12} more missing receipts.")
        tower_review_lines.append("")
else:
    tower_review_lines.extend(["No missing receipt records were present.", ""])

tower_review_lines.extend([
    "## Operator steps",
    "",
])
if operator_steps:
    for step in operator_steps:
        tower_review_lines.append(f"- {one_line(step, 260)}")
else:
    tower_review_lines.extend([
        "- Review the prepared artifact.",
        "- Upload or schedule it on the destination platform.",
        "- Capture the public URL, provider ID, or equivalent receipt.",
        "- Re-run the receipt cockpit until publication truth is complete.",
    ])

tower_review_lines.extend([
    "",
    "## Creative partner and provenance",
    "",
    "Codex and other Quipslys may draft serious platform copy, metadata, post text, title options, captions, schedule suggestions, and receipt checklists. This can be real release work, not filler.",
    "",
    "The Tower safeguard is destination truth: prepared copy and artifacts are not posted until a human/provider action creates a receipt, URL, scheduled post, provider ID, or equivalent proof.",
    "",
    "## Useful proof files",
    "",
    f"- Publication mission control: `{mission_path}`",
    f"- Publication ready handoff: `{handoff_path}`",
    f"- After state: `{after_path}`",
    f"- Manifest JSON: `{manifest_path}`",
    "",
    "## Guardrail",
    "",
    "Ready artifacts are not published artifacts. Tower is complete only when destination receipts, scheduled URLs, public URLs, provider IDs, or equivalent proof has been captured.",
    "",
    "This page is read-only review support. It does not post anything, schedule anything, or invent receipts.",
    "",
])
with open(tower_review_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(tower_review_lines))
shutil.copyfile(tower_review_path, latest_tower_review_path)

episode_title = (
    after.get("episodeTitle")
    or episode_spine.get("projectTitle")
    or after.get("sequenceTitle")
    or delivery_readiness.get("sequenceTitle")
    or "Episode 1"
)
sequence_title = after.get("sequenceTitle") or delivery_readiness.get("sequenceTitle") or episode_spine.get("sequenceTitle") or "Episode 1"
session_name = after.get("sessionName") or delivery_packet.get("sessionName") or studio_spine.get("sessionName") or "current-session"
selected_short_title = selected_short.get("title") or selected_short.get("id") or "a strong short moment"
next_receipt_label = next_receipt.get("displayLabel") or next_receipt.get("platform") or "the next publication destination"
after_nest = after.get("nest") or {}
after_nest_blocks = after_nest.get("blocks") or []
after_selected_block = after_nest.get("selectedBlock") or nest_selected or {}
after_writing_readiness = after_nest.get("writingReadiness") or {}
short_clips = (after.get("shortClipQueue") or {}).get("clips") or []
episode_one_blocks = [
    block for block in after_nest_blocks
    if (block.get("episodeSlug") or "") in ("episode-1", "")
]
source_context_blocks = [
    block for block in episode_one_blocks
    if "source" in (block.get("authorship") or "") or block.get("role") in ("episode-context", "seed-note", "source-summary")
]
authored_blocks = [
    block for block in episode_one_blocks
    if (block.get("authorship") or "") in ("agent-authored", "human-authored", "mixed-authorship")
]

def block_label(block):
    title = block.get("title") or block.get("documentTitle") or block.get("role") or block.get("id") or "block"
    episode = block.get("episodeSlug") or "shared"
    return f"{one_line(title, 90)} / {episode}"

def block_preview(block, limit=420):
    return one_line(block.get("text") or block.get("textPreview") or block.get("preview") or "", limit)

def short_title(clip, index):
    return one_line(clip.get("title") or clip.get("name") or clip.get("id") or f"Short candidate {index}", 120)

def format_seconds(value):
    try:
        return f"{float(value):.2f}s"
    except Exception:
        return "unknown"

selected_block_text = block_preview(after_selected_block, 900)
source_context_lines = []
for index, block in enumerate(source_context_blocks[:5], start=1):
    source_context_lines.extend([
        f"### Source/context {index}: {block_label(block)}",
        "",
        f"- Authorship: `{block.get('authorship', '')}`",
        f"- Role: `{block.get('role', '')}`",
        f"- Review status: `{block.get('reviewStatus', '')}`",
        f"- Tags: `{', '.join(block.get('tags') or [])}`",
        f"- Preview: {block_preview(block, 520)}",
        "",
    ])
if not source_context_lines:
    source_context_lines = ["No source/context snippets were available in current app state.", ""]

authored_context_lines = []
for index, block in enumerate(authored_blocks[:5], start=1):
    authored_context_lines.extend([
        f"### Authored draft {index}: {block_label(block)}",
        "",
        f"- Authorship: `{block.get('authorship', '')}`",
        f"- Review status: `{block.get('reviewStatus', '')}`",
        f"- Provenance: {one_line(block.get('provenanceNote'), 260)}",
        f"- Preview: {block_preview(block, 520)}",
        "",
    ])
if not authored_context_lines:
    authored_context_lines = ["No authored draft snippets were available in current app state.", ""]

short_candidate_lines = []
for index, clip in enumerate(short_clips[:6], start=1):
    short_candidate_lines.extend([
        f"### Short candidate {index}: {short_title(clip, index)}",
        "",
        f"- Range: `{format_seconds(clip.get('startTime'))} -> {format_seconds(clip.get('endTime'))}`",
        f"- Duration: `{format_seconds(clip.get('duration'))}`",
        f"- Review status: `{clip.get('reviewStatus') or clip.get('status') or 'draft'}`",
        f"- Destinations: `{', '.join(clip.get('destinations') or [])}`",
        f"- Caption draft: {one_line(clip.get('captionDraft'), 360)}",
        f"- Expected export: `{clip.get('expectedExportBasename') or ''}`",
        "",
    ])
if not short_candidate_lines:
    short_candidate_lines = ["No short candidates were available in current app state.", ""]

def clean_caption_seed(clip):
    seed = clip.get("captionDraft") or ""
    title = short_title(clip, 0)
    if not seed:
        return f"A short moment from {title}."
    seed = str(seed).strip()
    if seed.lower().startswith("rough transcript:"):
        seed = seed.split(":", 1)[1].strip()
    return one_line(seed, 280)

def hashtags_for_short(clip):
    title = short_title(clip, 0).lower()
    tags = ["#HighGroundOdyssey", "#CreativeSystems"]
    if "farm" in title or "stewardship" in title:
        tags.extend(["#Stewardship", "#WorkEthic"])
    elif "mentor" in title:
        tags.extend(["#Mentorship", "#Leadership"])
    elif "why" in title:
        tags.extend(["#Learning", "#Curiosity"])
    elif "parkinson" in title:
        tags.extend(["#ParkinsonsAwareness", "#Research"])
    elif "record" in title or "anywhere" in title:
        tags.extend(["#Podcasting", "#RemoteWork"])
    else:
        tags.extend(["#SystemsAnxiety", "#KeepBuilding"])
    return tags[:5]

def short_review_status(clip):
    return str(clip.get("reviewStatus") or clip.get("status") or "draft").strip() or "draft"

def short_bucket(clip):
    status = short_review_status(clip).lower()
    title = short_title(clip, 0).lower()
    if "test" in title or status in ("test", "smoke", "debug"):
        return "test"
    if status in ("keep", "kept", "ready", "ready-for-human-review", "ready-for-platform-copy", "publication-ready"):
        return "ready"
    if status in ("refine", "needs-review", "needs-human-review", "draft", "queued"):
        return "refine"
    return "other"

def short_bucket_heading(bucket):
    if bucket == "ready":
        return "Ready / human-review candidates"
    if bucket == "refine":
        return "Needs refinement before posting"
    if bucket == "test":
        return "Test or proof-only candidates"
    return "Other draft candidates"

def short_bucket_guidance(bucket):
    if bucket == "ready":
        return "These are closest to publication review. Copy is still first-pass draft text until a human/agent review and Tower receipt capture."
    if bucket == "refine":
        return "These may be strong moments, but the edit/caption/range still needs review before posting."
    if bucket == "test":
        return "These exist to prove the workflow or tune the system. Do not treat them as publish candidates unless deliberately promoted."
    return "These are visible because they exist in the queue, but their status needs clarification before publication work."

def short_sort_key(item):
    bucket_order = {"ready": 0, "refine": 1, "test": 2, "other": 3}
    index, clip = item
    return (bucket_order.get(short_bucket(clip), 9), index)

short_platform_lines = []
short_platform_items = sorted(list(enumerate(short_clips[:8], start=1)), key=short_sort_key)
current_short_bucket = None
short_bucket_counts = {"ready": 0, "refine": 0, "test": 0, "other": 0}
for _, clip in short_platform_items:
    bucket = short_bucket(clip)
    short_bucket_counts[bucket] = short_bucket_counts.get(bucket, 0) + 1

for index, clip in short_platform_items:
    bucket = short_bucket(clip)
    if bucket != current_short_bucket:
        current_short_bucket = bucket
        short_platform_lines.extend([
            f"### {short_bucket_heading(bucket)}",
            "",
            short_bucket_guidance(bucket),
            "",
        ])
    title = short_title(clip, index)
    caption_seed = clean_caption_seed(clip)
    tags = " ".join(hashtags_for_short(clip))
    status = short_review_status(clip)
    short_platform_lines.extend([
        f"#### Short {index}: {title}",
        "",
        f"- Source range: `{format_seconds(clip.get('startTime'))} -> {format_seconds(clip.get('endTime'))}`",
        f"- Review status: `{status}`",
        f"- Tower readiness: `{short_bucket_heading(bucket)}`",
        f"- Hook idea: {caption_seed}",
        f"- YouTube Shorts title: `{title}`",
        f"- YouTube Shorts caption: {caption_seed} {tags}",
        f"- Instagram caption: {caption_seed} Save this if you are building something hard one small system at a time. {tags}",
        f"- Facebook caption: {caption_seed} This is the kind of High Ground Odyssey moment we are learning to pull from the longer conversations. {tags}",
        f"- LinkedIn caption: {caption_seed} A small reminder that durable work is usually built from repeatable systems, mentorship, and attention. {tags}",
        "- Receipt boundary: draft copy only; do not mark posted until Tower captures the platform URL, scheduled URL, provider ID, or equivalent receipt.",
        "",
    ])
if not short_platform_lines:
    short_platform_lines = ["No short platform copy could be generated because no short candidates were available in current app state.", ""]

shorts_platform_copy_lines = [
    f"# Shorts platform copy: {basename}",
    "",
    "This is the focused Tower handoff for Episode 1 short-form publishing copy.",
    "",
    "It is generated from current QuipslyStudio short recipes and review state. It does not export files, post to platforms, schedule posts, or capture receipts.",
    "",
    "## Readiness summary",
    "",
    f"- Ready / human-review candidates: `{short_bucket_counts.get('ready', 0)}`",
    f"- Needs refinement before posting: `{short_bucket_counts.get('refine', 0)}`",
    f"- Test or proof-only candidates: `{short_bucket_counts.get('test', 0)}`",
    f"- Other draft candidates: `{short_bucket_counts.get('other', 0)}`",
    f"- Total included candidates: `{len(short_platform_items)}`",
    "",
    "## Operator rule",
    "",
    "Use this page to review and copy draft platform text. Do not mark anything posted until Tower has a platform URL, scheduled URL, provider ID, screenshot, or equivalent receipt.",
    "",
    "## Status language",
    "",
    "- Ready / human-review candidates: closest to posting review, still first-pass copy.",
    "- Needs refinement before posting: keep visible, but check range, caption, crop, and export before posting.",
    "- Test or proof-only candidates: workflow proof material, not publish candidates unless deliberately promoted.",
    "- Other draft candidates: visible state with unclear publishing readiness.",
    "",
]
shorts_platform_copy_lines.extend(short_platform_lines)
shorts_platform_copy_lines.extend([
    "",
    "## Provenance",
    "",
    "- Authorship: `agent-authored`",
    "- Review status: `agent-first-pass`",
    f"- Session: `{markdown_value(session_name)}`",
    f"- Sequence: `{markdown_value(sequence_title)}`",
    "- Source: current short queue, caption drafts, review statuses, and Tower receipt policy.",
    "- Boundary: copy draft only; no export, upload, scheduling, publishing, or receipt capture.",
    "",
])
with open(shorts_platform_copy_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(shorts_platform_copy_lines))
shutil.copyfile(shorts_platform_copy_path, latest_shorts_platform_copy_path)

selected_block_section = [
    "## Current selected Nest draft",
    "",
]
if after_selected_block:
    selected_block_section.extend([
        f"- Authorship: `{after_selected_block.get('authorship', '')}`",
        f"- Review status: `{after_selected_block.get('reviewStatus', '')}`",
        f"- Episode: `{after_selected_block.get('episodeSlug', '')}`",
        f"- Provenance: {one_line(after_selected_block.get('provenanceNote'), 360)}",
        "",
        selected_block_text or "Selected block had no text preview.",
        "",
    ])
else:
    selected_block_section.extend(["No selected Nest draft was available in current app state.", ""])

agent_first_pass_lines = [
    f"# Agent creative first pass: {basename}",
    "",
    "This packet is serious reviewable first-pass creative work from Codex/Quipsly for the current Nest -> Studio -> Tower loop.",
    "",
    "It is not placeholder by default. It is also not canon, not posted, and not publication proof. Treat it as `agent-first-pass` material until a human or later agent review promotes, rewrites, rejects, schedules, or publishes it.",
    "",
    "## Provenance",
    "",
    f"- Authorship: `agent-authored`",
    f"- Review status: `agent-first-pass`",
    f"- Session: `{markdown_value(session_name)}`",
    f"- Sequence: `{markdown_value(sequence_title)}`",
    f"- Generated from: current QuipslyStudio state, Nest writing packet, Studio edit readiness, and Tower publication readiness.",
    f"- Boundary: no manuscript canon approval, no media mutation, no platform posting, and no receipt capture.",
    "",
    "## Current state anchors",
    "",
    f"- Nest writing readiness: `{markdown_value(after_writing_readiness.get('status'))}`",
    f"- Authored blocks: `{markdown_value(after_writing_readiness.get('authoredBlockCount'))}`",
    f"- Agent-authored blocks: `{markdown_value(after_writing_readiness.get('agentAuthoredBlockCount'))}`",
    f"- Authored blocks needing review: `{markdown_value(after_writing_readiness.get('authoredNeedsReviewCount'))}`",
    f"- Short candidates available: `{len(short_clips)}`",
    f"- Next receipt target: `{one_line(next_receipt_label, 180)}`",
    "",
]
agent_first_pass_lines.extend(selected_block_section)
agent_first_pass_lines.extend([
    "## Source/context snippets used",
    "",
])
agent_first_pass_lines.extend(source_context_lines)
agent_first_pass_lines.extend([
    "## Authored draft snippets in play",
    "",
])
agent_first_pass_lines.extend(authored_context_lines)
agent_first_pass_lines.extend([
    "## Nest writing seeds",
    "",
    "### Book/manuscript reflection seed",
    "",
    "The Wednesday Rule is not really about Wednesday. It is about the strange mercy of a rule simple enough to survive a tired brain. When life gets noisy, systems do not have to become colder; sometimes the most humane system is the one that gives a person one small handhold and says, start here.",
    "",
    "That is the thread worth carrying into the book: structure is not the enemy of creativity. Structure is what lets a distracted, overwhelmed, hopeful person return to the work without having to rebuild the whole universe every time they sit down.",
    "",
    "Suggested tags: `book, episode-1, agent-first-pass, systems-anxiety, structure, review-needed`",
    "",
    "### Episode page intro seed",
    "",
    f"In `{episode_title}`, Charlie and Homer use the opening movement of High Ground Odyssey to talk about the kind of rule that keeps a life, a project, or a relationship from dissolving into noise. The episode is part reflection, part field note, and part invitation to build systems gentle enough that people can actually keep using them.",
    "",
    "Suggested tags: `episode-page, episode-1, agent-first-pass, review-needed`",
    "",
    "## Studio edit notes",
    "",
    "- Keep the 16:9 master calm and human. Prefer visible attention over frantic switching.",
    "- Use 9:16 shorts for clean single-idea moments, not tiny trailers that require too much context.",
    "- If a speaker shot is dark, tighten framing before assuming the cut itself is wrong.",
    "- Preserve source lanes and proxies. Any cut, crop, caption, or short should remain reversible metadata.",
    f"- Current selected/representative short to inspect: `{one_line(selected_short_title, 140)}`",
    "",
    "## Short candidates from current queue",
    "",
])
agent_first_pass_lines.extend(short_candidate_lines)
agent_first_pass_lines.extend([
    "## Short platform copy first pass",
    "",
])
agent_first_pass_lines.extend(short_platform_lines)
agent_first_pass_lines.extend([
    "## Tower publication copy candidates",
    "",
    "### YouTube title options",
    "",
    "1. The Wednesday Rule: Building a Life That Can Survive Real Wednesdays",
    "2. High Ground Odyssey Episode 1: The Rule That Keeps the Work Moving",
    "3. The Wednesday Rule | High Ground Odyssey",
    "",
    "### YouTube description draft",
    "",
    "In this first High Ground Odyssey conversation, Charlie and Homer begin with a simple idea: the right rule can become a handhold. The Wednesday Rule is a way of talking about systems that help real people keep going when motivation, memory, attention, and life all get messy at once.",
    "",
    "This episode connects the book, the podcast, and the larger High Ground project: how do we build structures that reduce anxiety instead of adding more pressure? How do we create work, relationships, and habits that are strong enough to return to?",
    "",
    "If this resonates, follow the series and join the High Ground Odyssey project as it grows from book notes, conversations, and lived experiments into something more useful than another productivity sermon.",
    "",
    "### Patreon/support post draft",
    "",
    "We are treating High Ground Odyssey as a live workshop, not a polished statue behind glass. Episode 1 starts with The Wednesday Rule: a simple frame for why gentle structure matters when life is loud. Supporters help us keep building the book, the show, and the tools around it in public.",
    "",
    "### Social post seeds",
    "",
    "- A good system does not make you less human. It gives your humanity somewhere safe to land.",
    "- The Wednesday Rule is a handhold, not a cage.",
    "- Structure should reduce systems anxiety, not become another thing to fail at.",
    "- Creativity does not need more pressure. It needs a way back in.",
    "",
    "## Receipt target reminder",
    "",
    f"Next Tower receipt target currently appears to be: `{one_line(next_receipt_label, 180)}`.",
    "",
    "Do not mark any of this as published until Tower has a platform URL, scheduled URL, provider ID, screenshot, or equivalent receipt.",
    "",
    "## Recommended next actions",
    "",
    "1. Paste or append the Nest writing seed as an `agent-authored` / `agent-first-pass` block if it helps the manuscript workflow.",
    "2. Review the Studio edit notes while scrubbing Episode 1 and create/adjust shorts accordingly.",
    "3. Use the Tower copy candidates as platform packet drafts, then capture real receipts after posting or scheduling.",
    "4. If a human rewrites any section, preserve the lineage as `mixed-authorship` or `human-reviewed` instead of flattening truth.",
    "",
])
with open(agent_first_pass_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(agent_first_pass_lines))
shutil.copyfile(agent_first_pass_path, latest_agent_first_pass_path)

with open(start_here_path, "a", encoding="utf-8") as handle:
    handle.write("\n")
    handle.write("## Layer review pages\n\n")
    handle.write("Open these when you need to inspect one part of the loop without re-reading every JSON artifact.\n\n")
    handle.write(f"- Nest writing review: `{latest_nest_review_path}`\n")
    handle.write(f"- Studio edit review: `{latest_studio_review_path}`\n")
    handle.write(f"- Tower publication review: `{latest_tower_review_path}`\n")
    handle.write(f"- Agent creative first pass: `{latest_agent_first_pass_path}`\n")
    handle.write(f"- Shorts platform copy: `{latest_shorts_platform_copy_path}`\n")
    handle.write("\n")
    handle.write("These pages are generated projections over current state. They make truth readable; they do not approve, export, publish, or mutate anything.\n")
    handle.write("\n")
    handle.write("## Agent creative work\n\n")
    handle.write("Codex and other Quipslys may create serious first-pass content for this loop. Do not downgrade it to placeholder just because an agent made it. Instead, preserve authorship, source context, review state, canon state, and publication receipts so the team can inspect, revise, approve, or reject it deliberately.\n")

shutil.copyfile(start_here_path, latest_start_here_path)
shutil.copyfile(manifest_path, latest_manifest_path)
payload["artifacts"]["latestStartHere"] = latest_start_here_path
payload["artifacts"]["latestManifest"] = latest_manifest_path
payload["artifacts"]["nestWritingReview"] = nest_review_path
payload["artifacts"]["latestNestWritingReview"] = latest_nest_review_path
payload["artifacts"]["studioEditReview"] = studio_review_path
payload["artifacts"]["latestStudioEditReview"] = latest_studio_review_path
payload["artifacts"]["towerPublicationReview"] = tower_review_path
payload["artifacts"]["latestTowerPublicationReview"] = latest_tower_review_path
payload["artifacts"]["agentCreativeFirstPass"] = agent_first_pass_path
payload["artifacts"]["latestAgentCreativeFirstPass"] = latest_agent_first_pass_path
payload["artifacts"]["shortsPlatformCopy"] = shorts_platform_copy_path
payload["artifacts"]["latestShortsPlatformCopy"] = latest_shorts_platform_copy_path
with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
shutil.copyfile(manifest_path, latest_manifest_path)

print(json.dumps(payload, indent=2, sort_keys=True))
PY
}

vertical_slice_review() {
  local target="${1:-$ROOT_DIR/.quipsly/vertical-slice-handoffs}"
  local output_format="${2:-text}"
  local manifest_path

  if [[ -d "$target" ]]; then
    manifest_path="$target/latest-vertical-slice-manifest.json"
  else
    manifest_path="$target"
  fi

  if [[ ! -f "$manifest_path" ]]; then
    printf 'No vertical-slice manifest found at %s\n' "$manifest_path" >&2
    printf 'Run: script/agentctl.sh vertical-slice-prepare %s\n' "$(dirname "$manifest_path")" >&2
    return 1
  fi

  python3 - "$manifest_path" "$output_format" <<'PY'
import json
import os
import sys

manifest_path = sys.argv[1]
output_format = sys.argv[2]

with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

if output_format == "--json" or output_format == "json":
    print(json.dumps(manifest, indent=2, sort_keys=True))
    raise SystemExit(0)

artifacts = manifest.get("artifacts") or {}
safe_followups = manifest.get("safeFollowups") or []

def value(key, fallback="unknown"):
    item = manifest.get(key)
    if item is None or item == "":
        return fallback
    return item

print("Quipsly vertical-slice review")
print(f"  manifest: {manifest_path}")
print(f"  status: {value('status')}")
print(f"  nestWriting: {value('nestWritingStatus')}")
print(f"  nestWritingPacket: {value('nestWritingPacketStatus')}")
print(f"  verticalSlicePacket: {value('verticalSlicePacketStatus')}")
print(f"  sourceContext: {value('sourceContextStatus')}")
print(f"  authoredBlocks: {value('authoredBlockCount', 0)}")
print(f"  authoredNeedsReview: {value('authoredNeedsReviewCount', value('reviewQueueCount', 0))}")
print(f"  packetReviewQueue: {value('reviewQueueCount', 0)}")
ready_lanes = manifest.get("readyLaneCount")
lane_count = manifest.get("laneCount")
if ready_lanes is not None and lane_count is not None:
    print(f"  publicationLanesReady: {ready_lanes}/{lane_count}")
else:
    print("  publicationLanesReady: unknown")
print(f"  publicationComplete: {value('publicationComplete')}")
print(f"  shipMapSmoke: {value('shipMapSmokeOk')}")
print("")
print("Next action:")
print(f"  {value('nextAction', 'Inspect the mission-control artifact and choose the next safe step.')}")
print("")
print("Open first:")
print(f"  START-HERE: {artifacts.get('latestStartHere') or artifacts.get('startHere') or '<missing>'}")
print(f"  Nest writing review: {artifacts.get('latestNestWritingReview') or artifacts.get('nestWritingReview') or '<missing>'}")
print(f"  Studio edit review: {artifacts.get('latestStudioEditReview') or artifacts.get('studioEditReview') or '<missing>'}")
print(f"  Tower publication review: {artifacts.get('latestTowerPublicationReview') or artifacts.get('towerPublicationReview') or '<missing>'}")
print(f"  Agent creative first pass: {artifacts.get('latestAgentCreativeFirstPass') or artifacts.get('agentCreativeFirstPass') or '<missing>'}")
print(f"  Shorts platform copy: {artifacts.get('latestShortsPlatformCopy') or artifacts.get('shortsPlatformCopy') or '<missing>'}")
print(f"  latest manifest: {artifacts.get('latestManifest') or manifest_path}")
print("")
release_export = manifest.get("releaseExport") or {}
if release_export:
    print("Optional local release export:")
    print(f"  status: {release_export.get('status') or 'unknown'}")
    print(f"  prepare: {release_export.get('prepareCommand') or '<missing>'}")
    print(f"  smoke: {release_export.get('smokeCommand') or '<missing>'}")
    print("  note: this creates local derivatives only; receipts still prove publication.")
    print("")
print("Core proof files:")
for label, key in [
    ("mission control", "publicationMissionControl"),
    ("ship map smoke", "shipMapSmoke"),
    ("studio edit smoke", "studioEditSmoke"),
    ("delivery artifact smoke", "deliveryArtifactSmoke"),
    ("publication handoff", "publicationReadyHandoff"),
    ("nest writing packet", "nestWritingPacketState"),
    ("vertical-slice packet", "verticalSlicePacketState"),
    ("after state", "afterState"),
]:
    print(f"  {label}: {artifacts.get(key) or '<missing>'}")
print("")
print("Guardrail:")
print("  Ready-for-platform-posting is not published. Capture real platform URLs/provider receipts before claiming publication.")
if safe_followups:
    print("")
    print("Safe follow-ups:")
    for item in safe_followups:
        print(f"  - {item}")
PY
}

vertical_slice_smoke() {
  local target="${1:-$ROOT_DIR/.quipsly/vertical-slice-handoffs}"
  local manifest_path

  if [[ -d "$target" ]]; then
    manifest_path="$target/latest-vertical-slice-manifest.json"
  else
    manifest_path="$target"
  fi

  if [[ ! -f "$manifest_path" ]]; then
    printf 'No vertical-slice manifest found at %s\n' "$manifest_path" >&2
    printf 'Run: script/agentctl.sh vertical-slice-prepare %s\n' "$(dirname "$manifest_path")" >&2
    return 1
  fi

  python3 - "$manifest_path" <<'PY'
import json
import os
import sys

manifest_path = sys.argv[1]
with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

artifacts = manifest.get("artifacts") or {}

def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as error:
        return {"_loadError": str(error), "_path": path}

def exists(path):
    return bool(path) and os.path.exists(path)

ship_smoke = load_json(artifacts.get("shipMapSmoke", ""))
studio_smoke = load_json(artifacts.get("studioEditSmoke", ""))
delivery_smoke = load_json(artifacts.get("deliveryArtifactSmoke", ""))
mission = load_json(artifacts.get("publicationMissionControl", ""))
nest_packet_state = load_json(artifacts.get("nestWritingPacketState", ""))
vertical_packet_state = load_json(artifacts.get("verticalSlicePacketState", ""))
after_state = load_json(artifacts.get("afterState", ""))
after_nest = after_state.get("nest") or {}
after_readiness = after_nest.get("writingReadiness") or {}
after_agent_commands = after_nest.get("agentCommands") or []
after_command_sources = [
    after_agent_commands,
    after_readiness.get("commands") or {},
    after_readiness.get("nextActionQueue") or [],
]
after_command_parts = []
for source in after_command_sources:
    if isinstance(source, dict):
        after_command_parts.extend(str(value) for value in source.values())
    elif isinstance(source, list):
        after_command_parts.extend(str(value) for value in source)
    else:
        after_command_parts.append(str(source))
after_command_text = " ".join(after_command_parts)

required_artifacts = [
    "latestStartHere",
    "latestManifest",
    "nestWritingReview",
    "studioEditReview",
    "towerPublicationReview",
    "agentCreativeFirstPass",
    "shortsPlatformCopy",
    "publicationMissionControl",
    "shipMapSmoke",
    "studioEditSmoke",
    "deliveryArtifactSmoke",
    "publicationReadyHandoff",
    "nestWritingPacketState",
    "verticalSlicePacketState",
    "afterState",
]

checks = []

def check(name, ok, detail, expected=None, actual=None):
    checks.append({
        "name": name,
        "ok": bool(ok),
        "detail": detail,
        "expected": expected,
        "actual": actual,
    })

for key in required_artifacts:
    check(
        f"artifact exists: {key}",
        exists(artifacts.get(key, "")),
        artifacts.get(key, ""),
        expected="existing file path",
        actual=artifacts.get(key, ""),
    )

check(
    "ship map smoke passed",
    manifest.get("shipMapSmokeOk") is True and ship_smoke.get("ok") is True,
    "Tower mission and handoff consistency must be proved inside the handoff.",
    expected=True,
    actual={"manifest": manifest.get("shipMapSmokeOk"), "artifact": ship_smoke.get("ok")},
)
check(
    "studio edit smoke passed",
    manifest.get("studioEditSmokeOk") is True and studio_smoke.get("ok") is True,
    "Studio edit truth should be proved inside the handoff, not assumed from UI memory.",
    expected=True,
    actual={"manifest": manifest.get("studioEditSmokeOk"), "artifact": studio_smoke.get("ok")},
)
check(
    "delivery artifact smoke passed",
    manifest.get("deliveryArtifactSmokeOk") is True and delivery_smoke.get("ok") is True,
    "Delivery artifact truth should be proved inside the handoff, not assumed from export UI memory.",
    expected=True,
    actual={"manifest": manifest.get("deliveryArtifactSmokeOk"), "artifact": delivery_smoke.get("ok")},
)
check(
    "nest writing packet ready",
    manifest.get("nestWritingStatus") == "ready-with-writing-packet",
    "Nest writing/context should travel with this handoff.",
    expected="ready-with-writing-packet",
    actual=manifest.get("nestWritingStatus"),
)
check(
    "captured Nest writing document available",
    after_nest.get("writingDocumentAvailable") is True,
    "The captured after-state should show a real Nest writing document.",
    expected=True,
    actual=after_nest.get("writingDocumentAvailable"),
)
check(
    "captured Nest blocks available",
    (after_nest.get("blockCount") or 0) > 0,
    "The captured Nest state should contain writing/capture blocks.",
    expected=">0",
    actual=after_nest.get("blockCount"),
)
check(
    "captured Nest authored work available",
    (after_readiness.get("authoredBlockCount") or 0) > 0,
    "The captured Nest writing readiness should include real authored work.",
    expected=">0",
    actual=after_readiness.get("authoredBlockCount"),
)
check(
    "captured Nest review state visible",
    "authoredNeedsReviewCount" in after_readiness,
    "Agent-authored work must remain review-state visible instead of silently becoming canon.",
    expected="authoredNeedsReviewCount present",
    actual=sorted(after_readiness.keys()),
)
check(
    "captured Nest next review action visible",
    bool(after_readiness.get("nextActionQueue")) or (after_readiness.get("authoredNeedsReviewCount") or 0) == 0,
    "If captured authored work needs review, the handoff should show a concrete next action.",
    expected="nextActionQueue when review count > 0",
    actual=after_readiness.get("nextActionQueue"),
)
for command_name, endpoint_name in [
    ("nest-append-block", "nest_append_block"),
    ("nest-update-block", "nest_update_block"),
    ("nest-select-block", "nest_select_block"),
    ("nest-mark-block", "nest_mark_block"),
]:
    check(
        f"captured Nest agent command exposed: {command_name}",
        command_name in after_command_text or endpoint_name in after_command_text,
        "The handoff after-state should prove Codex had semantic writing controls.",
        expected=f"{command_name} or {endpoint_name} in captured Nest command surfaces",
        actual=after_command_text[:1000],
    )
check(
    "nest writing packet generated",
    manifest.get("nestWritingPacketStatus") == "generated" and bool(manifest.get("nestWritingPacketPath")),
    "The packet state should point to a generated Nest writing packet.",
    expected="generated + path",
    actual={"status": manifest.get("nestWritingPacketStatus"), "path": manifest.get("nestWritingPacketPath")},
)
check(
    "vertical slice packet generated",
    manifest.get("verticalSlicePacketStatus") == "generated" and bool(manifest.get("verticalSlicePacketPath")),
    "The portable Nest -> Studio -> Tower packet should exist.",
    expected="generated + path",
    actual={"status": manifest.get("verticalSlicePacketStatus"), "path": manifest.get("verticalSlicePacketPath")},
)
check(
    "tower status ready for posting",
    manifest.get("status") == "ready-for-platform-posting",
    "The current Episode 1 vertical slice should be ready for manual/API posting, not secretly published.",
    expected="ready-for-platform-posting",
    actual=manifest.get("status"),
)
check(
    "publication remains receipt-bound",
    manifest.get("publicationComplete") is False,
    "Prepared artifacts are not publication proof.",
    expected=False,
    actual=manifest.get("publicationComplete"),
)
check(
    "mission has deliverables",
    len(mission.get("deliverables") or []) >= 4,
    "Nest writing, 16:9, 9:16, and podcast deliverables should all be visible.",
    expected=">=4",
    actual=len(mission.get("deliverables") or []),
)
check(
    "creative partner truth present",
    bool(manifest.get("creativePartnerTruth")),
    "Agent-created work should be first-class but provenance-bound in the handoff.",
    expected="non-empty creativePartnerTruth",
    actual=manifest.get("creativePartnerTruth"),
)
release_export = manifest.get("releaseExport") or {}
check(
    "release export handoff present but not auto-run",
    release_export.get("status") == "not-run-by-vertical-slice-prepare"
    and bool(release_export.get("prepareCommand"))
    and bool(release_export.get("smokeCommand")),
    "The vertical slice should tell operators how to create local artifacts without silently doing heavy export work.",
    expected="prepare/smoke commands with status not-run-by-vertical-slice-prepare",
    actual=release_export,
)
check(
    "packet states are readable JSON",
    not nest_packet_state.get("_loadError") and not vertical_packet_state.get("_loadError"),
    "Generated packet state artifacts must be machine-readable for handoff continuity.",
    expected="readable JSON",
    actual={
        "nestPacketError": nest_packet_state.get("_loadError", ""),
        "verticalPacketError": vertical_packet_state.get("_loadError", ""),
    },
)

ok = all(item["ok"] for item in checks)
print(json.dumps({
    "model": "quipsly-vertical-slice-smoke",
    "version": "2026-06-20.vertical-slice-smoke.v1",
    "ok": ok,
    "manifestPath": manifest_path,
    "status": manifest.get("status"),
    "nestWritingStatus": manifest.get("nestWritingStatus"),
    "shipMapSmokeOk": manifest.get("shipMapSmokeOk"),
    "studioEditSmokeOk": manifest.get("studioEditSmokeOk"),
    "deliveryArtifactSmokeOk": manifest.get("deliveryArtifactSmokeOk"),
    "publicationComplete": manifest.get("publicationComplete"),
    "checks": checks,
    "truth": "This is a read-only handoff smoke. It proves the generated folder carries Nest, Studio, Tower, agent creative, and receipt-boundary evidence; it does not publish or canonize anything.",
}, indent=2))

raise SystemExit(0 if ok else 1)
PY
}

nest_writing_review() {
  local target="${1:-$ROOT_DIR/.quipsly/vertical-slice-handoffs}"
  local output_format="${2:-text}"

  python3 - "$target" "$output_format" <<'PY'
import json
import os
import sys

target = sys.argv[1]
output_format = sys.argv[2]

def fail(message):
    print(message, file=sys.stderr)
    raise SystemExit(1)

def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as error:
        fail(f"Unable to read JSON at {path}: {error}")

def resolve_packet_path(target_path):
    if os.path.isdir(target_path):
        manifest_path = os.path.join(target_path, "latest-vertical-slice-manifest.json")
        if not os.path.isfile(manifest_path):
            fail(f"No latest-vertical-slice-manifest.json found in {target_path}. Run vertical-slice-prepare first.")
        manifest = load_json(manifest_path)
        packet_path = manifest.get("nestWritingPacketPath") or (manifest.get("artifacts") or {}).get("nestWritingPacket")
        if not packet_path:
            fail(f"Manifest at {manifest_path} does not point to a Nest writing packet.")
        return packet_path, manifest_path

    if not os.path.isfile(target_path):
        fail(f"No proof folder or JSON packet found at {target_path}.")

    payload = load_json(target_path)
    model = payload.get("model") or payload.get("packetType") or ""
    if model == "quipsly-nest-writing-packet":
        return target_path, target_path
    if "vertical-slice-prepare-manifest" in model:
        packet_path = payload.get("nestWritingPacketPath") or (payload.get("artifacts") or {}).get("nestWritingPacket")
        if not packet_path:
            fail(f"Vertical-slice manifest at {target_path} does not point to a Nest writing packet.")
        return packet_path, target_path
    if model == "quipsly-nest-writing-packet-state":
        packet_path = payload.get("outputPath") or ""
        if not packet_path:
            fail(f"Nest writing packet state at {target_path} has no outputPath.")
        return packet_path, target_path

    fail(f"Unsupported review target {target_path}; expected proof folder, vertical-slice manifest, Nest packet state, or Nest writing packet.")

packet_path, source_path = resolve_packet_path(target)
packet = load_json(packet_path)
authored = packet.get("authoredBlocks") or []
review_queue = packet.get("reviewQueue") or []
source_context = packet.get("sourceContextSummaries") or []
readiness = packet.get("writingReadiness") or {}
selected = packet.get("selectedBlock") or {}

summary = {
    "packetType": "quipsly-nest-writing-review",
    "sourcePath": source_path,
    "packetPath": packet_path,
    "status": readiness.get("status") or "unknown",
    "authoredBlockCount": packet.get("authoredBlockCount", len(authored)),
    "agentAuthoredBlockCount": readiness.get("agentAuthoredBlockCount"),
    "authoredNeedsReviewCount": readiness.get("authoredNeedsReviewCount"),
    "reviewQueueCount": packet.get("reviewQueueCount", len(review_queue)),
    "sourceContextSummaryCount": packet.get("sourceContextSummaryCount", len(source_context)),
    "sourceContextStatus": packet.get("sourceContextStatus"),
    "selectedBlock": selected,
    "reviewQueue": review_queue,
    "authoredBlocks": authored,
    "nextDraftSuggestion": readiness.get("nextDraftSuggestion") or {},
    "authorshipPolicy": packet.get("authorshipPolicy") or readiness.get("authorshipVocabulary") or {},
    "reviewVocabulary": readiness.get("reviewVocabulary") or {},
    "nextAction": readiness.get("nextAction") or "Review first-pass writing, then mark reviewed/canon only after deliberate approval.",
    "canonBoundary": "This review is read-only. It does not canonize, approve, or publish manuscript text.",
}

if output_format == "--json" or output_format == "json":
    print(json.dumps(summary, indent=2, sort_keys=True))
    raise SystemExit(0)

print("Quipsly Nest writing review")
print(f"  packet: {packet_path}")
print(f"  status: {summary['status']}")
print(f"  authoredBlocks: {summary['authoredBlockCount']}")
print(f"  agentAuthoredBlocks: {summary.get('agentAuthoredBlockCount') if summary.get('agentAuthoredBlockCount') is not None else 'unknown'}")
print(f"  authoredNeedsReview: {summary.get('authoredNeedsReviewCount') if summary.get('authoredNeedsReviewCount') is not None else 'unknown'}")
print(f"  packetReviewQueue: {summary['reviewQueueCount']}")
print(f"  sourceContext: {summary.get('sourceContextStatus') or 'unknown'} ({summary['sourceContextSummaryCount']} summaries)")
print("")
print("Next serious draft:")
next_draft = summary.get("nextDraftSuggestion") or {}
default_serious_draft_command = 'script/agentctl.sh nest-serious-draft "Title" "Draft text" episode-1'
next_draft_command = next_draft.get("fileCommand") or next_draft.get("shortcutCommand") or next_draft.get("appendCommand") or default_serious_draft_command
print(f"  title: {next_draft.get('title') or 'Episode 1 - Next High Ground Odyssey beat'}")
print(f"  authorship: {next_draft.get('authorship') or 'agent-authored'}")
print(f"  reviewStatus: {next_draft.get('reviewStatus') or 'agent-first-pass'}")
print(f"  shortcut: {next_draft_command}")
print("")
print("Selected work:")
if selected:
    title = (selected.get("textPreview") or "").splitlines()[0][:90] if selected.get("textPreview") else selected.get("id", "<untitled>")
    print(f"  {title}")
    print(f"  role={selected.get('role', '')} authorship={selected.get('authorship', '')} review={selected.get('reviewStatus', '')} episode={selected.get('episodeSlug', '')}")
    if selected.get("selectCommand"):
        print(f"  command: {selected.get('selectCommand')}")
else:
    print("  No selected block in packet.")

print("")
print("Review queue:")
if not review_queue:
    print("  No review queue entries.")
else:
    for index, item in enumerate(review_queue[:10], start=1):
        title = item.get("title") or item.get("id") or f"Review item {index}"
        preview = (item.get("textPreview") or "").replace("\n", " ").strip()
        if len(preview) > 180:
            preview = preview[:177] + "..."
        print(f"  {index}. {title}")
        print(f"     role={item.get('role', '')} authorship={item.get('authorship', '')} review={item.get('reviewStatus', '')} episode={item.get('episodeSlug', '')}")
        if preview:
            print(f"     preview: {preview}")
        if item.get("selectCommand"):
            print(f"     select: {item.get('selectCommand')}")
        if item.get("markHumanReviewedCommand"):
            print(f"     reviewed: {item.get('markHumanReviewedCommand')}")
        if item.get("markCanonCommand"):
            print(f"     canon: {item.get('markCanonCommand')}")

print("")
print("Next action:")
print(f"  {summary['nextAction']}")
print("")
print("Guardrail:")
print("  This is reviewable writing, not canon approval. Mark reviewed/canon only after deliberate human or explicit review-pass approval.")
PY
}

codex_release_act_save() {
  local output_dir="$ROOT_DIR/.quipsly/agent-observations"
  if [[ "${1:-}" == "--output" ]]; then
    if [[ "$#" -lt 3 ]]; then
      usage
      exit 2
    fi
    output_dir="$2"
    shift 2
  fi
  if [[ "$#" -lt 1 ]]; then
    usage
    exit 2
  fi

  case "$1" in
    codex-release-act-save|codex-act-save|codex-release-observe-save|codex-observe-save)
      printf 'Refusing nested %s; run a real release or semantic command instead.\n' "$1" >&2
      exit 2
      ;;
  esac

  mkdir -p "$output_dir"
  local stamp before_path response_path after_path summary_path delay command_status after_status
  stamp="$(date -u +"%Y%m%dT%H%M%SZ")"
  before_path="$output_dir/codex-release-act-$stamp-before.json"
  response_path="$output_dir/codex-release-act-$stamp-response.txt"
  after_path="$output_dir/codex-release-act-$stamp-after.json"
  summary_path="$output_dir/codex-release-act-$stamp-summary.json"
  delay="${QUIPSLY_AGENT_OBSERVE_DELAY:-0.35}"

  codex_release_observe > "$before_path"
  set +e
  "$0" "$@" > "$response_path" 2>&1
  command_status=$?
  python3 - "$delay" <<'PY'
import sys
import time

time.sleep(max(0.0, float(sys.argv[1])))
PY
  codex_release_observe > "$after_path" 2>> "$response_path"
  after_status=$?
  set -e

  python3 - "$summary_path" "$stamp" "$command_status" "$after_status" "$before_path" "$response_path" "$after_path" "$@" <<'PY'
import json
import sys

summary_path, stamp, command_status, after_status, before_path, response_path, after_path, *command = sys.argv[1:]

def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as error:
        return {"_loadError": str(error)}

def load_text(path, limit=1600):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            return handle.read(limit)
    except Exception as error:
        return f"<unable to read response: {error}>"

def flatten_scalars(value, prefix="", depth=0, max_depth=4):
    if depth > max_depth:
        return {}
    if value is None or isinstance(value, (str, int, float, bool)):
        return {prefix or "value": value}
    if isinstance(value, list):
        result = {f"{prefix}.count" if prefix else "count": len(value)}
        for index, item in enumerate(value[:8]):
            child_prefix = f"{prefix}.{index}" if prefix else str(index)
            result.update(flatten_scalars(item, child_prefix, depth + 1, max_depth))
        return result
    if isinstance(value, dict):
        result = {}
        for key in sorted(value.keys()):
            child_prefix = f"{prefix}.{key}" if prefix else str(key)
            result.update(flatten_scalars(value[key], child_prefix, depth + 1, max_depth))
        return result
    return {prefix or "value": str(value)}

before_packet = load_json(before_path)
after_packet = load_json(after_path)
before_flat = flatten_scalars(before_packet)
after_flat = flatten_scalars(after_packet)
all_paths = sorted(set(before_flat.keys()) | set(after_flat.keys()))
changes = [
    {
        "path": path,
        "before": before_flat.get(path),
        "after": after_flat.get(path),
    }
    for path in all_paths
    if before_flat.get(path) != after_flat.get(path)
]
release_keywords = [
    "delivery",
    "publication",
    "publish",
    "receipt",
    "proof",
    "destination",
    "social",
    "podcast",
    "youtube",
    "patreon",
    "instagram",
    "facebook",
    "linkedin",
    "spotify",
    "apple",
    "artifact",
    "ready",
    "handoff",
    "missing",
    "status",
]
release_changes = [
    change for change in changes
    if any(keyword in change["path"].lower() for keyword in release_keywords)
]

payload = {
    "packetType": "quipslystudio-codex-release-act-save",
    "timestampUtc": stamp,
    "truth": "Before and after release packets are the proof surface. Prepared artifacts are not publication proof.",
    "command": command,
    "commandStatus": int(command_status),
    "afterObserveStatus": int(after_status),
    "beforePath": before_path,
    "responsePath": response_path,
    "afterPath": after_path,
    "responsePreview": load_text(response_path),
    "releaseDiff": {
        "changedScalarCount": len(changes),
        "changedReleaseScalarCount": len(release_changes),
        "shownReleaseScalarChanges": release_changes[:60],
        "shownScalarChanges": changes[:100],
    },
    "reviewRule": "Use shownReleaseScalarChanges for quick review, then inspect beforePath and afterPath before claiming release progress.",
}
with open(summary_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
print(json.dumps(payload, indent=2, sort_keys=True))
PY

  if [[ "$command_status" -ne 0 ]]; then
    return "$command_status"
  fi
  return "$after_status"
}

codex_release_act_review() {
  local summary_path="${1:-latest}"
  if [[ "$summary_path" == "latest" ]]; then
    summary_path="$(python3 - "$ROOT_DIR/.quipsly/agent-observations" <<'PY'
import glob
import os
import sys

directory = sys.argv[1]
matches = glob.glob(os.path.join(directory, "codex-release-act-*-summary.json"))
if not matches:
    sys.exit(1)
print(max(matches, key=os.path.getmtime))
PY
)" || {
      printf 'No codex-release-act summary files found. Run codex-release-act-save first.\n' >&2
      exit 1
    }
  fi

  python3 - "$summary_path" <<'PY'
import json
import sys

summary_path = sys.argv[1]
with open(summary_path, "r", encoding="utf-8") as handle:
    summary = json.load(handle)

release_diff = summary.get("releaseDiff") or {}
release_changes = release_diff.get("shownReleaseScalarChanges") or []
all_changes = release_diff.get("shownScalarChanges") or []
command = " ".join(str(part) for part in summary.get("command", []))

print("Codex release action review")
print(f"  summary: {summary_path}")
print(f"  command: {command or '<none>'}")
print(f"  commandStatus: {summary.get('commandStatus')}")
print(f"  afterObserveStatus: {summary.get('afterObserveStatus')}")
print(f"  before: {summary.get('beforePath')}")
print(f"  response: {summary.get('responsePath')}")
print(f"  after: {summary.get('afterPath')}")
print(f"  releaseImportantChanges: {release_diff.get('changedReleaseScalarCount', len(release_changes))}")
print(f"  shallowChanges: {release_diff.get('changedScalarCount', len(all_changes))}")

response_preview = (summary.get("responsePreview") or "").strip()
if response_preview:
    preview = response_preview.replace("\n", " ")[:500]
    print(f"  responsePreview: {preview}")

if release_changes:
    print("\nRelease-important state changes:")
    for change in release_changes[:40]:
        before = json.dumps(change.get("before"), ensure_ascii=False)
        after = json.dumps(change.get("after"), ensure_ascii=False)
        print(f"  - {change.get('path')}: {before} -> {after}")
else:
    print("\nRelease-important state changes: none in the shallow diff")
    if all_changes:
        print("  Shallow changes exist; inspect the summary/full release packets if this command should have changed release state.")
    else:
        print("  No shallow changes detected; inspect response and full release packets before claiming failure.")

print("\nReview rule: prepared artifacts are not publication proof. Receipts/provider proof must appear in the after packet before anyone claims posted or proved.")
PY
}

codex_release_session_review() {
  local output_dir="$ROOT_DIR/.quipsly/agent-observations"
  local output_format="text"
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --json|json)
        output_format="json"
        ;;
      "")
        ;;
      *)
        output_dir="$1"
        ;;
    esac
    shift || true
  done

  python3 - "$output_dir" "$output_format" <<'PY'
import glob
import json
import os
import sys

directory = sys.argv[1]
output_format = sys.argv[2]
paths = sorted(glob.glob(os.path.join(directory, "codex-release-act-*-summary.json")))
if not paths:
    print(f"No codex-release-act summaries found in {directory}", file=sys.stderr)
    sys.exit(1)

records = []
for path in paths:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            summary = json.load(handle)
    except Exception as error:
        records.append({
            "path": path,
            "timestampUtc": os.path.basename(path),
            "command": "<unreadable>",
            "commandStatus": "error",
            "afterObserveStatus": "error",
            "releaseImportantChanges": 0,
            "error": str(error),
        })
        continue

    diff = summary.get("releaseDiff") or {}
    command = " ".join(str(part) for part in summary.get("command", [])) or "<none>"
    records.append({
        "path": path,
        "timestampUtc": summary.get("timestampUtc") or os.path.basename(path),
        "command": command,
        "commandStatus": summary.get("commandStatus"),
        "afterObserveStatus": summary.get("afterObserveStatus"),
        "releaseImportantChanges": diff.get("changedReleaseScalarCount", len(diff.get("shownReleaseScalarChanges") or [])),
        "shallowChanges": diff.get("changedScalarCount", len(diff.get("shownScalarChanges") or [])),
        "beforePath": summary.get("beforePath"),
        "afterPath": summary.get("afterPath"),
    })

failed = [record for record in records if record.get("commandStatus") not in (0, "0") or record.get("afterObserveStatus") not in (0, "0")]
changed = [record for record in records if int(record.get("releaseImportantChanges") or 0) > 0]
payload = {
    "packetType": "quipslystudio-codex-release-session-review",
    "folder": directory,
    "auditedReleaseCommandCount": len(records),
    "commandsWithReleaseImportantChanges": len(changed),
    "commandsNeedingReview": len(failed),
    "records": records,
    "reviewRule": "Review failed commands and full before/after release packets before claiming release progress. Prepared artifacts are not publication proof.",
}

if output_format == "json":
    print(json.dumps(payload, indent=2, sort_keys=True))
    raise SystemExit(0)

print("Codex release session review")
print(f"  folder: {directory}")
print(f"  auditedReleaseCommands: {payload['auditedReleaseCommandCount']}")
print(f"  commandsWithReleaseImportantChanges: {payload['commandsWithReleaseImportantChanges']}")
print(f"  commandsNeedingReview: {payload['commandsNeedingReview']}")
print("")

for index, record in enumerate(records, start=1):
    needs_review = record.get("commandStatus") not in (0, "0") or record.get("afterObserveStatus") not in (0, "0")
    marker = "!" if needs_review else ("*" if int(record.get("releaseImportantChanges") or 0) > 0 else "-")
    print(f"{marker} {index:02d}. {record.get('timestampUtc')} :: {record.get('command')}")
    print(f"      status command={record.get('commandStatus')} after={record.get('afterObserveStatus')} releaseImportant={record.get('releaseImportantChanges')} shallow={record.get('shallowChanges')}")
    print(f"      summary={record.get('path')}")
    if needs_review:
        print("      review=command or after-observe failed; inspect response and full release packets")

print("")
print("Legend: * release-important state changed, ! command/observe needs review, - no release-important shallow change.")
print("Rule: prepared artifacts are not posted/proved. Receipts or provider proof must appear in after packets before public claims.")
PY
}

codex_production_review() {
  local output_dir="$ROOT_DIR/.quipsly/agent-observations"
  local output_format="text"
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --json|json)
        output_format="json"
        ;;
      "")
        ;;
      *)
        output_dir="$1"
        ;;
    esac
    shift || true
  done

  python3 - "$output_dir" "$output_format" <<'PY'
import glob
import json
import os
import sys

directory = sys.argv[1]
output_format = sys.argv[2]

def load_summaries(pattern, diff_key, important_key):
    records = []
    for path in sorted(glob.glob(os.path.join(directory, pattern))):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                summary = json.load(handle)
        except Exception as error:
            records.append({
                "path": path,
                "timestampUtc": os.path.basename(path),
                "command": "<unreadable>",
                "commandStatus": "error",
                "afterObserveStatus": "error",
                "importantChanges": 0,
                "error": str(error),
            })
            continue

        diff = summary.get(diff_key) or {}
        records.append({
            "path": path,
            "timestampUtc": summary.get("timestampUtc") or os.path.basename(path),
            "command": " ".join(str(part) for part in summary.get("command", [])) or "<none>",
            "commandStatus": summary.get("commandStatus"),
            "afterObserveStatus": summary.get("afterObserveStatus"),
            "importantChanges": diff.get(important_key, 0),
            "shallowChanges": diff.get("changedScalarCount", 0),
            "beforePath": summary.get("beforePath"),
            "afterPath": summary.get("afterPath"),
        })
    return records

edit_records = load_summaries("codex-act-*-summary.json", "stateDiff", "changedImportantScalarCount")
release_records = load_summaries("codex-release-act-*-summary.json", "releaseDiff", "changedReleaseScalarCount")

def needs_review(record):
    return record.get("commandStatus") not in (0, "0") or record.get("afterObserveStatus") not in (0, "0")

edit_failed = [record for record in edit_records if needs_review(record)]
release_failed = [record for record in release_records if needs_review(record)]
edit_changed = [record for record in edit_records if int(record.get("importantChanges") or 0) > 0]
release_changed = [record for record in release_records if int(record.get("importantChanges") or 0) > 0]

payload = {
    "packetType": "quipslystudio-codex-production-review",
    "folder": directory,
    "edit": {
        "auditedCommandCount": len(edit_records),
        "commandsWithImportantChanges": len(edit_changed),
        "commandsNeedingReview": len(edit_failed),
        "records": edit_records,
    },
    "release": {
        "auditedCommandCount": len(release_records),
        "commandsWithImportantChanges": len(release_changed),
        "commandsNeedingReview": len(release_failed),
        "records": release_records,
    },
    "reviewRule": "This is a top-level index. Inspect failed records and full before/after packets before trusting a Codex production run.",
}

if output_format == "json":
    print(json.dumps(payload, indent=2, sort_keys=True))
    raise SystemExit(0)

print("Codex production review")
print(f"  folder: {directory}")
print(f"  editCommands: {len(edit_records)}")
print(f"  editImportantChanges: {len(edit_changed)}")
print(f"  editNeedsReview: {len(edit_failed)}")
print(f"  releaseCommands: {len(release_records)}")
print(f"  releaseImportantChanges: {len(release_changed)}")
print(f"  releaseNeedsReview: {len(release_failed)}")
print("")

def print_records(title, records):
    print(title)
    if not records:
        print("  none")
        return
    for index, record in enumerate(records, start=1):
        marker = "!" if needs_review(record) else ("*" if int(record.get("importantChanges") or 0) > 0 else "-")
        print(f"  {marker} {index:02d}. {record.get('timestampUtc')} :: {record.get('command')}")
        print(f"        status command={record.get('commandStatus')} after={record.get('afterObserveStatus')} important={record.get('importantChanges')} shallow={record.get('shallowChanges')}")
        print(f"        summary={record.get('path')}")

print_records("Edit ledger", edit_records)
print("")
print_records("Release ledger", release_records)
print("")
print("Legend: * important state changed, ! command/observe needs review, - no important shallow change.")
print("Rule: this report is an index, not proof. Full before/after packets remain the proof surface.")
PY
}

codex_audit_status() {
  local output_dir="$ROOT_DIR/.quipsly/agent-observations"
  local output_format="text"
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --json|json)
        output_format="json"
        ;;
      "")
        ;;
      *)
        output_dir="$1"
        ;;
    esac
    shift || true
  done

  python3 - "$output_dir" "$output_format" <<'PY'
import glob
import json
import os
import sys

directory = sys.argv[1]
output_format = sys.argv[2]
patterns = {
    "codexObserveSnapshots": "codex-observe-*.json",
    "codexReleaseObserveSnapshots": "codex-release-observe-*.json",
    "editBeforePackets": "codex-act-*-before.json",
    "editResponsePackets": "codex-act-*-response.txt",
    "editAfterPackets": "codex-act-*-after.json",
    "editSummaries": "codex-act-*-summary.json",
    "releaseBeforePackets": "codex-release-act-*-before.json",
    "releaseResponsePackets": "codex-release-act-*-response.txt",
    "releaseAfterPackets": "codex-release-act-*-after.json",
    "releaseSummaries": "codex-release-act-*-summary.json",
}
counts = {}
latest = {}
for label, pattern in patterns.items():
    matches = sorted(glob.glob(os.path.join(directory, pattern)))
    counts[label] = len(matches)
    latest[label] = matches[-1] if matches else ""

edit_complete_sets = min(counts["editBeforePackets"], counts["editResponsePackets"], counts["editAfterPackets"], counts["editSummaries"])
release_complete_sets = min(counts["releaseBeforePackets"], counts["releaseResponsePackets"], counts["releaseAfterPackets"], counts["releaseSummaries"])
issues = []
if len({counts["editBeforePackets"], counts["editResponsePackets"], counts["editAfterPackets"], counts["editSummaries"]}) > 1:
    issues.append("edit audit packet counts do not match")
if len({counts["releaseBeforePackets"], counts["releaseResponsePackets"], counts["releaseAfterPackets"], counts["releaseSummaries"]}) > 1:
    issues.append("release audit packet counts do not match")
if counts["editSummaries"] == 0 and counts["releaseSummaries"] == 0:
    issues.append("no audited edit or release summaries found")

payload = {
    "packetType": "quipslystudio-codex-audit-status",
    "folder": directory,
    "counts": counts,
    "latest": latest,
    "completeAuditSets": {
        "edit": edit_complete_sets,
        "release": release_complete_sets,
    },
    "issues": issues,
    "status": "needs_review" if issues else "ok",
    "reviewRule": "Audit status only proves evidence files exist. Review summaries and full before/after packets before trusting a production run.",
}

if output_format == "json":
    print(json.dumps(payload, indent=2, sort_keys=True))
    raise SystemExit(0)

print("Codex audit status")
print(f"  folder: {directory}")
print(f"  status: {payload['status']}")
print(f"  completeEditAuditSets: {edit_complete_sets}")
print(f"  completeReleaseAuditSets: {release_complete_sets}")
print("")
for label in sorted(counts.keys()):
    print(f"  {label}: {counts[label]}")
    if latest[label]:
        print(f"      latest={latest[label]}")
if issues:
    print("\nIssues:")
    for issue in issues:
        print(f"  - {issue}")
else:
    print("\nIssues: none detected")
print("\nRule: evidence files existing is not success proof. Review summaries and full packets.")
PY
}

codex_production_handoff() {
  local audit_dir="$ROOT_DIR/.quipsly/agent-observations"
  local output_root="$ROOT_DIR/.quipsly/agent-handoffs"
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --audit)
        if [[ "$#" -lt 2 ]]; then
          usage
          exit 2
        fi
        audit_dir="$2"
        shift
        ;;
      --output)
        if [[ "$#" -lt 2 ]]; then
          usage
          exit 2
        fi
        output_root="$2"
        shift
        ;;
      "")
        ;;
      *)
        output_root="$1"
        ;;
    esac
    shift || true
  done

  local stamp bundle_dir manifest_path status_path
  stamp="$(date -u +"%Y%m%dT%H%M%SZ")"
  bundle_dir="$output_root/codex-production-handoff-$stamp"
  mkdir -p "$bundle_dir"
  manifest_path="$bundle_dir/manifest.json"
  status_path="$bundle_dir/capture-status.jsonl"
  : > "$status_path"

  capture_command() {
    local label="$1"
    shift
    local output_path="$bundle_dir/$label"
    local error_path="$bundle_dir/$label.stderr.txt"
    local command_status
    set +e
    "$0" "$@" > "$output_path" 2> "$error_path"
    command_status=$?
    set -e
    python3 - "$status_path" "$label" "$command_status" "$output_path" "$error_path" "$@" <<'PY'
import json
import sys

status_path, label, status, output_path, error_path, *command = sys.argv[1:]
with open(status_path, "a", encoding="utf-8") as handle:
    handle.write(json.dumps({
        "label": label,
        "status": int(status),
        "outputPath": output_path,
        "errorPath": error_path,
        "command": command,
    }, sort_keys=True))
    handle.write("\n")
PY
  }

  capture_command "codex-observe.json" codex-observe
  capture_command "codex-release-observe.json" codex-release-observe
  capture_command "codex-audit-status.json" codex-audit-status --json "$audit_dir"
  capture_command "codex-audit-status.txt" codex-audit-status "$audit_dir"
  capture_command "codex-production-review.json" codex-production-review --json "$audit_dir"
  capture_command "codex-production-review.txt" codex-production-review "$audit_dir"
  capture_command "codex-session-review.txt" codex-session-review "$audit_dir"
  capture_command "codex-release-session-review.txt" codex-release-session-review "$audit_dir"

  cat > "$bundle_dir/README.txt" <<'README'
QuipslyStudio Codex production handoff

This folder is an evidence index for a Codex-assisted editor/release session.

Read first:
1. codex-audit-status.txt
2. codex-production-review.txt
3. capture-status.jsonl

Then inspect full before/after packets referenced by the review files before
claiming an edit, export, release-prep, post, schedule, or receipt-proof step
succeeded.

Rules:
- Command acknowledgements are not proof.
- Prepared artifacts are not posted artifacts.
- Posted/proved requires real receipt/provider proof.
- Whole source lanes stay intact; SHOW/SKIP are metadata overlays.
README

  python3 - "$manifest_path" "$stamp" "$bundle_dir" "$audit_dir" <<'PY'
import json
import os
import sys

manifest_path, stamp, bundle_dir, audit_dir = sys.argv[1:]
payload = {
    "packetType": "quipslystudio-codex-production-handoff",
    "timestampUtc": stamp,
    "bundleDir": bundle_dir,
    "auditDir": audit_dir,
    "activeNativeEditor": "apps/QuipslyStudio",
    "truth": "This bundle is an evidence index, not proof by itself. Inspect referenced before/after packets before trusting a production run.",
    "files": sorted(os.listdir(bundle_dir)),
    "reviewOrder": [
        "codex-audit-status.txt",
        "codex-production-review.txt",
        "capture-status.jsonl",
        "full before/after packets referenced by review files"
    ],
}
with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
print(bundle_dir)
PY
}

codex_act_save() {
  local output_dir="$ROOT_DIR/.quipsly/agent-observations"
  if [[ "${1:-}" == "--output" ]]; then
    if [[ "$#" -lt 3 ]]; then
      usage
      exit 2
    fi
    output_dir="$2"
    shift 2
  fi
  if [[ "$#" -lt 1 ]]; then
    usage
    exit 2
  fi

  case "$1" in
    codex-act-save|codex-observe-save)
      printf 'Refusing nested %s; run a real semantic command instead.\n' "$1" >&2
      exit 2
      ;;
  esac

  mkdir -p "$output_dir"
  local stamp before_path response_path after_path summary_path delay command_status after_status
  stamp="$(date -u +"%Y%m%dT%H%M%SZ")"
  before_path="$output_dir/codex-act-$stamp-before.json"
  response_path="$output_dir/codex-act-$stamp-response.txt"
  after_path="$output_dir/codex-act-$stamp-after.json"
  summary_path="$output_dir/codex-act-$stamp-summary.json"
  delay="${QUIPSLY_AGENT_OBSERVE_DELAY:-0.35}"

  codex_observe > "$before_path"
  set +e
  "$0" "$@" > "$response_path" 2>&1
  command_status=$?
  python3 - "$delay" <<'PY'
import sys
import time

time.sleep(max(0.0, float(sys.argv[1])))
PY
  codex_observe > "$after_path" 2>> "$response_path"
  after_status=$?
  set -e

  python3 - "$summary_path" "$stamp" "$command_status" "$after_status" "$before_path" "$response_path" "$after_path" "$@" <<'PY'
import json
import sys

summary_path, stamp, command_status, after_status, before_path, response_path, after_path, *command = sys.argv[1:]

def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as error:
        return {"_loadError": str(error)}

def load_text(path, limit=1600):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            return handle.read(limit)
    except Exception as error:
        return f"<unable to read response: {error}>"

def flatten_scalars(value, prefix="", depth=0, max_depth=3):
    if depth > max_depth:
        return {}
    if value is None or isinstance(value, (str, int, float, bool)):
        return {prefix or "value": value}
    if isinstance(value, list):
        result = {f"{prefix}.count" if prefix else "count": len(value)}
        for index, item in enumerate(value[:5]):
            child_prefix = f"{prefix}.{index}" if prefix else str(index)
            result.update(flatten_scalars(item, child_prefix, depth + 1, max_depth))
        return result
    if isinstance(value, dict):
        result = {}
        for key in sorted(value.keys()):
            if key in {"frames", "waveform", "thumbnailBytes", "imageData"}:
                continue
            child_prefix = f"{prefix}.{key}" if prefix else str(key)
            result.update(flatten_scalars(value[key], child_prefix, depth + 1, max_depth))
        return result
    return {prefix or "value": str(value)}

before_packet = load_json(before_path)
after_packet = load_json(after_path)
before_state = before_packet.get("state", {}) if isinstance(before_packet, dict) else {}
after_state = after_packet.get("state", {}) if isinstance(after_packet, dict) else {}
before_flat = flatten_scalars(before_state)
after_flat = flatten_scalars(after_state)
all_paths = sorted(set(before_flat.keys()) | set(after_flat.keys()))
changes = [
    {
        "path": path,
        "before": before_flat.get(path),
        "after": after_flat.get(path),
    }
    for path in all_paths
    if before_flat.get(path) != after_flat.get(path)
]
important_keywords = [
    "playhead",
    "selected",
    "selection",
    "timeline",
    "duration",
    "short",
    "receipt",
    "publish",
    "publication",
    "export",
    "format",
    "program",
    "source",
    "lane",
    "tag",
    "decision",
    "proof",
]
important_changes = [
    change for change in changes
    if any(keyword in change["path"].lower() for keyword in important_keywords)
]

payload = {
    "packetType": "quipslystudio-codex-act-save",
    "timestampUtc": stamp,
    "truth": "Before and after packets are the proof surface. The command response is only an acknowledgement or error.",
    "command": command,
    "commandStatus": int(command_status),
    "afterObserveStatus": int(after_status),
    "beforePath": before_path,
    "responsePath": response_path,
    "afterPath": after_path,
    "responsePreview": load_text(response_path),
    "stateDiff": {
        "changedScalarCount": len(changes),
        "changedImportantScalarCount": len(important_changes),
        "shownImportantScalarChanges": important_changes[:40],
        "shownScalarChanges": changes[:80],
        "beforeTopLevelStateKeys": sorted(before_state.keys()) if isinstance(before_state, dict) else [],
        "afterTopLevelStateKeys": sorted(after_state.keys()) if isinstance(after_state, dict) else [],
    },
    "reviewRule": "Use shownImportantScalarChanges for quick review, then compare beforePath and afterPath before claiming an edit succeeded.",
}
with open(summary_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
print(json.dumps(payload, indent=2, sort_keys=True))
PY

  if [[ "$command_status" -ne 0 ]]; then
    return "$command_status"
  fi
  return "$after_status"
}

codex_act_review() {
  local summary_path="${1:-latest}"
  if [[ "$summary_path" == "latest" ]]; then
    summary_path="$(python3 - "$ROOT_DIR/.quipsly/agent-observations" <<'PY'
import glob
import os
import sys

directory = sys.argv[1]
matches = glob.glob(os.path.join(directory, "codex-act-*-summary.json"))
if not matches:
    sys.exit(1)
print(max(matches, key=os.path.getmtime))
PY
)" || {
      printf 'No codex-act summary files found. Run codex-act-save first.\n' >&2
      exit 1
    }
  fi

  python3 - "$summary_path" <<'PY'
import json
import os
import sys

summary_path = sys.argv[1]
with open(summary_path, "r", encoding="utf-8") as handle:
    summary = json.load(handle)

state_diff = summary.get("stateDiff") or {}
important = state_diff.get("shownImportantScalarChanges") or []
all_changes = state_diff.get("shownScalarChanges") or []
command = " ".join(str(part) for part in summary.get("command", []))

print("Codex edit review")
print(f"  summary: {summary_path}")
print(f"  command: {command or '<none>'}")
print(f"  commandStatus: {summary.get('commandStatus')}")
print(f"  afterObserveStatus: {summary.get('afterObserveStatus')}")
print(f"  before: {summary.get('beforePath')}")
print(f"  response: {summary.get('responsePath')}")
print(f"  after: {summary.get('afterPath')}")
print(f"  importantChanges: {state_diff.get('changedImportantScalarCount', len(important))}")
print(f"  shallowChanges: {state_diff.get('changedScalarCount', len(all_changes))}")

response_preview = (summary.get("responsePreview") or "").strip()
if response_preview:
    preview = response_preview.replace("\n", " ")[:500]
    print(f"  responsePreview: {preview}")

if important:
    print("\nImportant state changes:")
    for change in important[:30]:
        before = json.dumps(change.get("before"), ensure_ascii=False)
        after = json.dumps(change.get("after"), ensure_ascii=False)
        print(f"  - {change.get('path')}: {before} -> {after}")
else:
    print("\nImportant state changes: none in the shallow diff")
    if all_changes:
        print("  Shallow changes exist; inspect the summary/full packets if this command should have changed editor state.")
    else:
        print("  No shallow changes detected; inspect response and full packets before claiming failure.")

print("\nReview rule: the command response is not proof. The after packet is the proof surface.")
PY
}

codex_session_review() {
  local output_dir="$ROOT_DIR/.quipsly/agent-observations"
  local output_format="text"
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --json|json)
        output_format="json"
        ;;
      "")
        ;;
      *)
        output_dir="$1"
        ;;
    esac
    shift || true
  done

  python3 - "$output_dir" "$output_format" <<'PY'
import glob
import json
import os
import sys

directory = sys.argv[1]
output_format = sys.argv[2]
paths = sorted(glob.glob(os.path.join(directory, "codex-act-*-summary.json")))
if not paths:
    print(f"No codex-act summaries found in {directory}", file=sys.stderr)
    sys.exit(1)

records = []
for path in paths:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            summary = json.load(handle)
    except Exception as error:
        records.append({
            "path": path,
            "timestampUtc": os.path.basename(path),
            "command": "<unreadable>",
            "commandStatus": "error",
            "afterObserveStatus": "error",
            "importantChanges": 0,
            "error": str(error),
        })
        continue

    diff = summary.get("stateDiff") or {}
    command = " ".join(str(part) for part in summary.get("command", [])) or "<none>"
    records.append({
        "path": path,
        "timestampUtc": summary.get("timestampUtc") or os.path.basename(path),
        "command": command,
        "commandStatus": summary.get("commandStatus"),
        "afterObserveStatus": summary.get("afterObserveStatus"),
        "importantChanges": diff.get("changedImportantScalarCount", len(diff.get("shownImportantScalarChanges") or [])),
        "shallowChanges": diff.get("changedScalarCount", len(diff.get("shownScalarChanges") or [])),
        "beforePath": summary.get("beforePath"),
        "afterPath": summary.get("afterPath"),
    })

failed = [record for record in records if record.get("commandStatus") not in (0, "0") or record.get("afterObserveStatus") not in (0, "0")]
changed = [record for record in records if int(record.get("importantChanges") or 0) > 0]
payload = {
    "packetType": "quipslystudio-codex-session-review",
    "folder": directory,
    "auditedCommandCount": len(records),
    "commandsWithImportantChanges": len(changed),
    "commandsNeedingReview": len(failed),
    "records": records,
    "reviewRule": "Review failed commands and full before/after packets before claiming a multi-step Codex edit session succeeded.",
}

if output_format == "json":
    print(json.dumps(payload, indent=2, sort_keys=True))
    raise SystemExit(0)

print("Codex session review")
print(f"  folder: {directory}")
print(f"  auditedCommands: {payload['auditedCommandCount']}")
print(f"  commandsWithImportantChanges: {payload['commandsWithImportantChanges']}")
print(f"  commandsNeedingReview: {payload['commandsNeedingReview']}")
print("")

for index, record in enumerate(records, start=1):
    needs_review = record.get("commandStatus") not in (0, "0") or record.get("afterObserveStatus") not in (0, "0")
    marker = "!" if needs_review else ("*" if int(record.get("importantChanges") or 0) > 0 else "-")
    print(f"{marker} {index:02d}. {record.get('timestampUtc')} :: {record.get('command')}")
    print(f"      status command={record.get('commandStatus')} after={record.get('afterObserveStatus')} important={record.get('importantChanges')} shallow={record.get('shallowChanges')}")
    print(f"      summary={record.get('path')}")
    if needs_review:
        print("      review=command or after-observe failed; inspect response and full packets")

print("")
print("Legend: * important editor state changed, ! command/observe needs review, - no important shallow change.")
print("Rule: review the full before/after packets before claiming a multi-step edit session succeeded.")
PY
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

emit_export_receipt() {
  local state_path="$1"
  local wait_status="${2:-unknown}"
  python3 - "$state_path" "$wait_status" <<'PY'
import json
import os
import sys

state = json.load(open(sys.argv[1]))
wait_status = sys.argv[2]

def obj(value):
    return value if isinstance(value, dict) else {}

def arr(value):
    return value if isinstance(value, list) else []

export_state = obj(state.get("exportState"))
selected_short = obj(state.get("selectedShortClip"))
selected_proof = obj(state.get("selectedShortProof"))
text_policy = obj(selected_proof.get("textBurnPolicy"))

path_candidates = []
for key in ("outputURLs", "outputUrls", "outputPaths", "paths"):
    path_candidates.extend(arr(export_state.get(key)))
for key in ("outputURL", "outputUrl", "outputPath", "path"):
    value = export_state.get(key)
    if isinstance(value, str) and value:
        path_candidates.append(value)
for key in ("lastExportedPath", "expectedExportPath"):
    value = selected_short.get(key) or selected_proof.get(key)
    if isinstance(value, str) and value:
        path_candidates.append(value)

seen = set()
paths = []
for path in path_candidates:
    if not isinstance(path, str) or not path or path in seen:
        continue
    seen.add(path)
    paths.append({
        "path": path,
        "exists": os.path.exists(path)
    })

receipt = {
    "model": "quipsly-agent-export-receipt",
    "version": "2026-06-19.compact-wait-export.v2",
    "waitStatus": wait_status,
    "exportStatus": export_state.get("status") or state.get("exportStatus") or "",
    "stalled": bool(export_state.get("stalled")),
    "error": export_state.get("error") or state.get("error") or "",
    "lastMediaAction": state.get("lastMediaAction") or "",
    "selectedShort": {
        "id": selected_short.get("id"),
        "title": selected_short.get("title"),
        "reviewStatus": selected_short.get("reviewStatus"),
        "exportStatus": selected_short.get("exportStatus")
    },
    "textBurnPolicy": {
        "status": text_policy.get("status"),
        "pixelTextBurnInEnabled": text_policy.get("pixelTextBurnInEnabled"),
        "primaryOverlayBurnedIn": text_policy.get("primaryOverlayBurnedIn"),
        "captionBurnedIn": text_policy.get("captionBurnedIn")
    },
    "paths": paths,
    "truth": "Compact export receipt only. Use /state for full debugging; use contact sheet and audio sanity before marking review complete."
}
print(json.dumps(receipt, indent=2))
PY
}

wait_export() {
  local timeout="${1:-120}"
  local tmp="${TMPDIR:-/tmp}/quipsly-agent-export-state.$$"
  local deadline=$((SECONDS + timeout))
  local status=""
  local stalled_seen=0
  while (( SECONDS <= deadline )); do
    get "/state" > "$tmp"
    status="$(python3 - "$tmp" <<'PY'
import json
import os
import sys

state = json.load(open(sys.argv[1]))
export_state = state.get("exportState") or {}
selected_short = state.get("selectedShortClip") or {}
paths = []
for key in ("outputPaths", "outputURLs", "outputUrls", "paths"):
    value = export_state.get(key)
    if isinstance(value, list):
        paths.extend([item for item in value if isinstance(item, str) and item])
for key in ("lastExportedPath", "expectedExportPath"):
    value = selected_short.get(key)
    if isinstance(value, str) and value:
        paths.append(value)
all_known_paths_exist = bool(paths) and all(os.path.exists(path) for path in dict.fromkeys(paths))
if (export_state.get("status") == "completed"
    or (selected_short.get("exportStatus") == "exported" and all_known_paths_exist)):
    print("completed")
elif export_state.get("status") in ("failed", "blocked"):
    print(export_state.get("status"))
elif export_state.get("stalled"):
    print("stalled-warning")
else:
    print(export_state.get("status") or state.get("exportStatus") or "")
PY
)"
    case "$status" in
      completed)
        emit_export_receipt "$tmp" "completed"
        rm -f "$tmp"
        return 0
        ;;
      failed|blocked)
        emit_export_receipt "$tmp" "$status"
        rm -f "$tmp"
        return 1
        ;;
      stalled-warning)
        stalled_seen=1
        ;;
    esac
    sleep 1
  done
  if (( stalled_seen )); then
    emit_export_receipt "$tmp" "stalled-timeout"
  else
    emit_export_receipt "$tmp" "timeout"
  fi
  rm -f "$tmp"
  echo "Timed out waiting for export status to complete." >&2
  return 1
}

shorts_overlay_burn_in() {
  local decision="${1:-}"
  local note="${2:-}"
  if [[ -z "$decision" ]]; then
    usage
    exit 2
  fi

  case "$decision" in
    approve|approved|ok|burn-in-ok|request|request-review|request_review)
      decision="request_review"
      ;;
    approve-top-canopy|approve_top_canopy|top-canopy|top_canopy|face-safe-top-canopy|face_safe_top_canopy)
      decision="approve_top_canopy"
      ;;
    hold|metadata|metadata-only|keep-as-metadata)
      decision="hold"
      ;;
    *)
      printf 'Unknown shorts-overlay-burn-in decision: %s\n' "$decision" >&2
      usage
      exit 2
      ;;
  esac

  local tmp selected_title overlay
  tmp="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-short-burn-in.XXXXXX")"
  get "/state" > "$tmp"

  selected_title="$(python3 - "$tmp" <<'PY'
import json
import sys

state = json.load(open(sys.argv[1], encoding="utf-8"))
clip = state.get("selectedShortClip") or {}
print((clip.get("title") or "").strip())
PY
)"
  overlay="$(python3 - "$tmp" <<'PY'
import json
import sys

state = json.load(open(sys.argv[1], encoding="utf-8"))
clip = state.get("selectedShortClip") or {}
print((clip.get("primaryOverlayText") or "").strip())
PY
)"
  rm -f "$tmp"

  if [[ -z "$selected_title" ]]; then
    printf 'No selected short recipe. Select one first with shorts-select or shorts-review-next.\n' >&2
    exit 2
  fi

  if [[ "$decision" == "approve_top_canopy" ]]; then
    if [[ -z "$overlay" ]]; then
      printf 'Selected short has no primary overlay text to approve.\n' >&2
      exit 2
    fi
    if [[ "$note" != *"face"* && "$note" != *"canopy"* && "$note" != *"safe"* ]]; then
      printf 'Top-canopy burn-in approval needs a note explaining the face-safe placement review.\n' >&2
      exit 2
    fi
  fi

  get "/shorts_overlay_burn_in?decision=$(urlencode "$decision")&note=$(urlencode "$note")"
}

shorts_review_navigator() {
  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-short-navigator.XXXXXX")"
  get "/state" > "$tmp"
  python3 - "$tmp" <<'PY'
import json
import sys

state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
next_candidate = nav.get("nextCandidate") or {}
counts = nav.get("counts") or {}
print(f"Short review navigator: {nav.get('status') or 'unknown'}")
print(f"Next: {next_candidate.get('title') or '(none)'}")
print(f"Why: {nav.get('nextReason') or next_candidate.get('reason') or '(no reason reported)'}")
print(f"Action: {nav.get('nextAction') or next_candidate.get('nextAction') or '(no action reported)'}")
print(f"Command: {nav.get('nextCommand') or next_candidate.get('nextCommand') or '(no command reported)'}")
mechanical = nav.get("nextMechanicalCandidate") or {}
mechanical_command = nav.get("nextMechanicalCommand") or mechanical.get("nextCommand") or ""
if mechanical_command:
    print(f"Mechanical next: {mechanical.get('title') or '(none)'}")
    print(f"Mechanical action: {nav.get('nextMechanicalAction') or mechanical.get('nextAction') or '(no action reported)'}")
    print(f"Mechanical command: {mechanical_command}")
audition = nav.get("nextAuditionCandidate") or {}
audition_command = nav.get("nextAuditionCommand") or audition.get("previewCommand") or ""
if audition_command:
    print(f"Audition next: {audition.get('title') or '(none)'}")
    print(f"Audition action: {nav.get('nextAuditionAction') or 'Cue for listen-through without marking it complete.'}")
    print(f"Audition command: {audition_command}")
if counts:
    ordered = [
        "needsExport",
        "needsRefinement",
        "needsVisualReview",
        "needsListenThrough",
        "needsTextReview",
        "needsReviewDecision",
        "readyForSocialQueue",
        "rejectedLearningData",
    ]
    bits = [f"{key}={counts.get(key, 0)}" for key in ordered if key in counts]
    print("Counts: " + ", ".join(bits))
burn = next_candidate.get("textBurnPolicy") or {}
if burn:
    print(
        "Text burn: "
        f"overlay={burn.get('primaryOverlayDirective') or 'unknown'} "
        f"caption={burn.get('captionDirective') or 'unknown'} "
        f"captionBurnedIn={burn.get('captionBurnedIn')}"
    )
print("Truth: " + (nav.get("truth") or "Navigator is routing, not approval."))
PY
  rm -f "$tmp"
}

shorts_review_cue_next() {
  local json_mode="${1:-}"
  if [[ "$json_mode" == "--json" || "$json_mode" == "json" ]]; then
    local json_tmp
    json_tmp="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-short-cue-next-json.XXXXXX")"
    get "/state" > "$json_tmp"
    python3 - "$json_tmp" <<'PY'
import json
import sys

state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
candidate = nav.get("nextAuditionCandidate") or {}
command = (nav.get("nextAuditionCommand") or candidate.get("previewCommand") or "").strip()
safe = bool(
    command.startswith("script/agentctl.sh")
    and "shorts-preview-selected" in command
    and "\n" not in command
    and ";" not in command
    and "|" not in command
    and "`" not in command
    and "$(" not in command
)
print(json.dumps({
    "model": "quipsly-short-cue-next-candidate",
    "version": "2026-06-19.short-cue-next-json.v1",
    "available": bool(command),
    "safeToCue": safe,
    "title": candidate.get("title") or "",
    "reason": nav.get("nextAuditionReason") or candidate.get("reason") or "",
    "previewCommand": command,
    "truth": "JSON mode is non-mutating. It does not cue playback, mark listen-through, or approve publication."
}, indent=2))
PY
    local json_status=$?
    rm -f "$json_tmp"
    return "$json_status"
  fi

  local tmp audition_command audition_title audition_reason
  tmp="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-short-cue-next.XXXXXX")"
  get "/state" > "$tmp"
  audition_title="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
candidate = nav.get("nextAuditionCandidate") or {}
print((candidate.get("title") or "").strip())
PY
)"
  audition_reason="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
candidate = nav.get("nextAuditionCandidate") or {}
print((nav.get("nextAuditionReason") or candidate.get("reason") or "").strip())
PY
)"
  audition_command="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
candidate = nav.get("nextAuditionCandidate") or {}
print((nav.get("nextAuditionCommand") or candidate.get("previewCommand") or "").strip())
PY
)"
  rm -f "$tmp"

  if [[ -z "$audition_command" ]]; then
    printf 'Navigator has no listen-through audition candidate. Current summary:\n' >&2
    shorts_review_navigator
    return 2
  fi
  if [[ "$audition_command" != script/agentctl.sh* || "$audition_command" != *"shorts-preview-selected"* ]]; then
    printf 'Audition command is not a safe selected-short preview; refusing.\nCommand: %s\n' "$audition_command" >&2
    return 2
  fi
  if [[ "$audition_command" == *$'\n'* || "$audition_command" == *';'* || "$audition_command" == *'|'* || "$audition_command" == *'`'* || "$audition_command" == *'$('* ]]; then
    printf 'Audition command contains unsupported shell syntax; refusing.\nCommand: %s\n' "$audition_command" >&2
    return 2
  fi

  printf 'Cueing short for listen-through: %s\n' "${audition_title:-unknown}"
  printf 'Why: %s\n' "${audition_reason:-Needs audio/timing review before approval.}"
  printf 'Command: %s\n' "$audition_command"
  bash -lc "$audition_command"
  printf 'Cue complete. This did not mark listen-through complete; after actually reviewing, run: script/agentctl.sh shorts-listen-through "audio/timing reviewed notes"\n'
}

shorts_review_listen_guide() {
  local json_mode="${1:-}"
  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-listen-guide.XXXXXX")"
  get "/state" > "$tmp"
  if [[ "$json_mode" == "--json" || "$json_mode" == "json" ]]; then
    python3 - "$tmp" <<'PY'
import json
import sys

state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
guide = nav.get("listenThroughGuide") or {}
print(json.dumps({
    "model": "quipsly-short-listen-through-guide",
    "version": "2026-06-19.short-listen-guide-json.v1",
    "available": bool(guide.get("available")),
    "guide": guide,
    "counts": nav.get("counts") or {},
    "truth": "JSON mode is non-mutating. It does not preview, mark listen-through, approve text, or publish."
}, indent=2))
PY
    local json_status=$?
    rm -f "$tmp"
    return "$json_status"
  fi

  python3 - "$tmp" <<'PY'
import json
import sys

state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
guide = nav.get("listenThroughGuide") or {}
if not guide.get("available"):
    print("No short currently needs listen-through review.")
    print("Truth: " + (guide.get("truth") or nav.get("truth") or "No guide available."))
    raise SystemExit(2)

print("Short listen-through guide")
print(f"Title: {guide.get('title') or '(untitled)'}")
print(f"Range: {guide.get('sequenceStartTime', 0):.2f}s -> {guide.get('sequenceEndTime', 0):.2f}s ({guide.get('recipeDuration', 0):.2f}s)")
print(f"Export: {guide.get('exportPath') or '(no export path)'}")
transcript = guide.get("transcriptContext") or {}
if transcript:
    preview = transcript.get("text") or transcript.get("summary") or transcript.get("preview") or ""
    if preview:
        print(f"Transcript/context: {preview[:500]}")
print("")
print("Checklist:")
for item in guide.get("checklist") or []:
    print(f"- {item}")
print("")
print("Commands:")
print(f"Preview: {guide.get('playPreviewCommand')}")
print(f"Mark listened: {guide.get('markListenedCommand')}")
print(f"Refine: {guide.get('refineCommand')}")
print(f"Keep: {guide.get('keepCommand')}")
print(f"Reject: {guide.get('rejectCommand')}")
print("")
print("Guidance: " + (guide.get("operatorGuidance") or "Listen before changing review state."))
print("Truth: " + (guide.get("truth") or "Guide only; no approval by itself."))
PY
  local status=$?
  rm -f "$tmp"
  return "$status"
}

shorts_audio_sanity() {
  local media_path expected_duration
  media_path="${2:-}"
  expected_duration="${3:-}"
  if [[ -z "$media_path" ]]; then
    usage
    exit 2
  fi
  python3 "$ROOT_DIR/script/analyze_short_audio_sanity.py" "$media_path" "$expected_duration"
}

shorts_audio_sanity_next() {
  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-short-audio-sanity-next.XXXXXX")"
  get "/state" > "$tmp"
  python3 - "$tmp" "$ROOT_DIR/script/analyze_short_audio_sanity.py" <<'PY'
import json
import subprocess
import sys

state_path, analyzer = sys.argv[1], sys.argv[2]
state = json.load(open(state_path, encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
guide = nav.get("listenThroughGuide") or {}
export_path = (guide.get("exportPath") or "").strip()
duration = guide.get("recipeDuration") or guide.get("duration") or ""
if not export_path:
    print(json.dumps({
        "model": "quipsly-short-audio-sanity-next",
        "version": "2026-06-19.short-audio-sanity-next.v1",
        "status": "unavailable",
        "safeForListenThrough": False,
        "message": "No listen-through guide export path is available.",
        "truth": "This did not mark listen-through complete or approve publication."
    }, indent=2))
    raise SystemExit(2)
command = ["python3", analyzer, export_path]
if duration != "":
    command.append(str(duration))
completed = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
if completed.stdout:
    print(completed.stdout, end="")
if completed.stderr:
    print(completed.stderr, file=sys.stderr, end="")
raise SystemExit(completed.returncode)
PY
  local status=$?
  rm -f "$tmp"
  return "$status"
}

shorts_listen_review_packet() {
  local output_dir basename tmp
  output_dir="${2:-}"
  basename="${3:-episode-1-shorts-listen-review}"
  if [[ -z "$output_dir" ]]; then
    usage
    exit 2
  fi
  tmp="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-shorts-queue.XXXXXX")"
  get "/shorts_queue" > "$tmp"
  python3 "$ROOT_DIR/script/generate_short_listen_review_packet.py" "$tmp" "$output_dir" "$basename"
  local status=$?
  rm -f "$tmp"
  return "$status"
}

shorts_listen_review_path() {
  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-listen-review-path.XXXXXX")"
  get "/state" > "$tmp"
  python3 - "$tmp" <<'PY'
import json
import sys

state = json.load(open(sys.argv[1], encoding="utf-8"))
packet = ((((state.get("shortReviewCounts") or {}).get("reviewNavigator") or {}).get("listenReviewPacket")) or {})
print(json.dumps(packet, indent=2))
PY
  local status=$?
  rm -f "$tmp"
  return "$status"
}

shorts_listen_review_open() {
  local tmp fields directory basename html_path
  tmp="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-listen-review-open.XXXXXX")"
  get "/state" > "$tmp"
  fields="$(python3 - "$tmp" <<'PY'
import json
import sys

state = json.load(open(sys.argv[1], encoding="utf-8"))
packet = ((((state.get("shortReviewCounts") or {}).get("reviewNavigator") or {}).get("listenReviewPacket")) or {})
print("\t".join([
    packet.get("outputDirectory", ""),
    packet.get("basename", ""),
    packet.get("htmlPath", ""),
]))
PY
)"
  rm -f "$tmp"
  IFS=$'\t' read -r directory basename html_path <<< "$fields"
  if [[ -z "$directory" || -z "$basename" || -z "$html_path" ]]; then
    printf 'No listen-review packet pointer is available from the running app state.\n' >&2
    return 2
  fi
  if [[ ! -s "$html_path" ]]; then
    printf 'Listen-review packet missing; generating it first.\n' >&2
    shorts_listen_review_packet "shorts-listen-review-packet" "$directory" "$basename" >/dev/null
  fi
  if [[ ! -s "$html_path" ]]; then
    printf 'Listen-review packet still missing after generation: %s\n' "$html_path" >&2
    return 2
  fi
  /usr/bin/open "$html_path"
  python3 - "$html_path" <<'PY'
import json
import sys

print(json.dumps({
    "status": "opened",
    "htmlPath": sys.argv[1],
    "truth": "Opening the review packet does not mutate Quipsly state or approve publication.",
}, indent=2))
PY
}

shorts_board_packet() {
  local script_name default_basename mode output_dir basename tmp_queue tmp_state
  script_name="${1:-}"
  default_basename="${2:-}"
  shift 2
  if [[ -z "$script_name" || -z "$default_basename" ]]; then
    printf 'shorts_board_packet requires a script name and default basename.\n' >&2
    return 2
  fi
  mode="--md"
  output_dir="$ROOT_DIR/docs/quipsly/current-state"
  basename="$default_basename"
  while [[ $# -gt 1 ]]; do
    case "${2:-}" in
      --json|--html|--md)
        mode="${2:-}"
        shift
        ;;
      "")
        shift
        ;;
      *)
        if [[ "$output_dir" == "$ROOT_DIR/docs/quipsly/current-state" ]]; then
          output_dir="${2:-}"
        elif [[ "$basename" == "$default_basename" ]]; then
          basename="${2:-}"
        else
          usage
          exit 2
        fi
        shift
      ;;
    esac
  done
  tmp_queue="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-shorts-board-queue.XXXXXX")"
  tmp_state="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-shorts-board-state.XXXXXX")"
  get "/shorts_queue" > "$tmp_queue"
  get "/state" > "$tmp_state"
  python3 "$ROOT_DIR/script/$script_name" "$tmp_queue" "$tmp_state" "$output_dir" "$basename" "$mode"
  local status=$?
  rm -f "$tmp_queue" "$tmp_state"
  if [[ "$status" == "0" && "$mode" == "--html" ]]; then
    /usr/bin/open "$output_dir/$basename.html" >/dev/null 2>&1 || true
  fi
  return "$status"
}

shorts_local_export_board() {
  shorts_board_packet "shorts_local_export_board.py" "episode-1-shorts-local-export-board" "$@"
}

shorts_growth_quality_board() {
  shorts_board_packet "shorts_growth_quality_board.py" "episode-1-shorts-growth-quality-board" "$@"
}

shorts_platform_package_board() {
  shorts_board_packet "shorts_platform_package_board.py" "episode-1-shorts-platform-package-board" "$@"
}

shorts_improvement_plan() {
  shorts_board_packet "shorts_improvement_plan.py" "episode-1-shorts-improvement-plan" "$@"
}

shorts_review_run_next() {
  local tmp status next_command title reason mechanical_status mechanical_command mechanical_title mechanical_reason
  tmp="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-short-run-next.XXXXXX")"
  get "/state" > "$tmp"
  status="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
print((nav.get("status") or "").strip())
PY
)"
  title="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
candidate = nav.get("nextCandidate") or {}
print((candidate.get("title") or "").strip())
PY
)"
  reason="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
candidate = nav.get("nextCandidate") or {}
print((nav.get("nextReason") or candidate.get("reason") or "").strip())
PY
)"
  next_command="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
candidate = nav.get("nextCandidate") or {}
print((nav.get("nextCommand") or candidate.get("nextCommand") or "").strip())
PY
)"
  mechanical_status="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
candidate = nav.get("nextMechanicalCandidate") or {}
print((candidate.get("status") or "").strip())
PY
)"
  mechanical_title="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
candidate = nav.get("nextMechanicalCandidate") or {}
print((candidate.get("title") or "").strip())
PY
)"
  mechanical_reason="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
candidate = nav.get("nextMechanicalCandidate") or {}
print((nav.get("nextMechanicalReason") or candidate.get("reason") or "").strip())
PY
)"
  mechanical_command="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
nav = (((state.get("shortReviewCounts") or {}).get("reviewNavigator")) or {})
candidate = nav.get("nextMechanicalCandidate") or {}
print((nav.get("nextMechanicalCommand") or candidate.get("nextCommand") or "").strip())
PY
)"
  rm -f "$tmp"

  if [[ "$status" != "needs_export" && "$status" != "needs_visual_review" ]]; then
    case "$mechanical_status" in
      needs_export|needs_visual_review)
        printf 'Editorial next step requires judgment; running the safe mechanical evidence-prep step instead.\n' >&2
        status="$mechanical_status"
        title="$mechanical_title"
        reason="$mechanical_reason"
        next_command="$mechanical_command"
        ;;
    esac
  fi

  if [[ -z "$next_command" ]]; then
    printf 'Navigator has no next command. Current summary:\n' >&2
    shorts_review_navigator
    return 2
  fi

  case "$status" in
    needs_export)
      if [[ "$next_command" != *"shorts-export-selected"* ]]; then
        printf 'Navigator status is needs_export but command is not an export; refusing.\nCommand: %s\n' "$next_command" >&2
        return 2
      fi
      ;;
    needs_visual_review)
      if [[ "$next_command" != *"shorts-contact-sheet"* && "$next_command" != *"shorts-preview-selected"* ]]; then
        printf 'Navigator status is needs_visual_review but command is not a review artifact/preview; refusing.\nCommand: %s\n' "$next_command" >&2
        return 2
      fi
      ;;
    *)
      printf 'Navigator next step requires editorial judgment; refusing to auto-run.\n' >&2
      printf 'Short: %s\nStatus: %s\nWhy: %s\nCommand: %s\n' "$title" "$status" "$reason" "$next_command" >&2
      return 3
      ;;
  esac

  if [[ "$next_command" != script/agentctl.sh* ]]; then
    printf 'Navigator command is outside agentctl; refusing.\nCommand: %s\n' "$next_command" >&2
    return 2
  fi
  if [[ "$next_command" == *$'\n'* || "$next_command" == *';'* || "$next_command" == *'|'* || "$next_command" == *'`'* || "$next_command" == *'$('* ]]; then
    printf 'Navigator command contains unsupported shell syntax; refusing.\nCommand: %s\n' "$next_command" >&2
    return 2
  fi

  printf 'Running navigator next step for short: %s\n' "${title:-unknown}"
  printf 'Why: %s\n' "${reason:-not reported}"
  printf 'Command: %s\n' "$next_command"
  eval "$next_command"
  local command_status=$?
  if (( command_status != 0 )); then
    printf 'Navigator command failed before completion wait. Exit status: %s\n' "$command_status" >&2
    return "$command_status"
  fi
  if [[ "$next_command" == *"shorts-export-selected"* ]]; then
    if ! wait_export 180 >/dev/null; then
      local final_status final_health
      tmp="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-short-run-next-after-wait.XXXXXX")"
      for _ in {1..15}; do
        get "/state" > "$tmp"
        final_status="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
export_state = state.get("exportState") or {}
print((export_state.get("status") or state.get("exportStatus") or "").strip())
PY
)"
        final_health="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
export_state = state.get("exportState") or {}
print((export_state.get("healthStatus") or "").strip())
PY
)"
        if [[ "$final_status" == "completed" || "$final_health" == "completed" ]]; then
          break
        fi
        sleep 1
      done
      final_status="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
export_state = state.get("exportState") or {}
print((export_state.get("status") or state.get("exportStatus") or "").strip())
PY
)"
      final_health="$(python3 - "$tmp" <<'PY'
import json, sys
state = json.load(open(sys.argv[1], encoding="utf-8"))
export_state = state.get("exportState") or {}
print((export_state.get("healthStatus") or "").strip())
PY
)"
      rm -f "$tmp"
      if [[ "$final_status" != "completed" && "$final_health" != "completed" ]]; then
        printf 'Export wait did not complete. Final status=%s health=%s\n' "$final_status" "$final_health" >&2
        return 1
      fi
    fi
  fi
  shorts_review_navigator
}

publication_next_receipt_save() {
  local output_dir="${1:-$HOME/Movies/QuipslyExports/Episode1Tower}"
  local basename="${2:-next-tower-receipt}"
  local json_path="$output_dir/$basename-publication-next-receipt.json"
  local markdown_path="$output_dir/$basename-publication-next-receipt.md"
  local latest_json_path="$output_dir/latest-publication-next-receipt.json"
  local latest_markdown_path="$output_dir/NEXT-RECEIPT-LIVE.md"

  mkdir -p "$output_dir"
  get "/publication_next_receipt" > "$json_path"
  cp "$json_path" "$latest_json_path"
  python3 - "$json_path" "$markdown_path" <<'PY'
import json
import shlex
import sys
from datetime import datetime, timezone

json_path, markdown_path = sys.argv[1:3]
with open(json_path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

markdown = data.get("markdown")
if not markdown:
    markdown = "\n".join([
        "# Live Tower next receipt",
        "",
        "The running QuipslyStudio app did not return a Markdown next-receipt card.",
        "",
        f"- Status: `{data.get('status', 'unknown')}`",
        f"- Generated at: `{datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}`",
        "",
        "## Raw JSON",
        "",
        "```json",
        json.dumps(data, indent=2, sort_keys=True),
        "```",
        "",
        "## Boundary",
        "",
        "This file is a handoff from live app state. It does not upload, schedule, publish, verify providers, or mutate receipt truth.",
    ])

with open(markdown_path, "w", encoding="utf-8") as handle:
    handle.write(markdown.rstrip() + "\n")
PY
  cp "$markdown_path" "$latest_markdown_path"
  python3 - "$json_path" "$markdown_path" "$latest_json_path" "$latest_markdown_path" <<'PY'
import json
import sys
from datetime import datetime, timezone

json_path, markdown_path, latest_json_path, latest_markdown_path = sys.argv[1:5]
with open(json_path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

print(json.dumps({
    "status": "saved",
    "packetType": "quipsly-live-tower-next-receipt-handoff",
    "version": "2026-06-20.publication-next-receipt-save.v1",
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "receiptId": data.get("receiptId"),
    "displayLabel": data.get("displayLabel"),
    "platform": data.get("platform"),
    "deliveryLaneId": data.get("deliveryLaneId"),
    "jsonPath": json_path,
    "markdownPath": markdown_path,
    "latestJsonPath": latest_json_path,
    "latestMarkdownPath": latest_markdown_path,
    "truth": "This saves the live next Tower receipt card for handoff. It does not upload, schedule, publish, verify providers, or mutate receipt truth.",
}, indent=2, sort_keys=True))
PY
}

publication_writing_packet() {
  local output_format="${1:-text}"
  local packet_path="$ROOT_DIR/../../docs/quipsly/publication-packets/hgo-episode-1-the-wednesday-rule-writing-publication-packet.md"
  packet_path="$(cd "$(dirname "$packet_path")" && pwd)/$(basename "$packet_path")"

  if [[ ! -f "$packet_path" ]]; then
    printf 'Publication writing packet not found: %s\n' "$packet_path" >&2
    return 1
  fi

  if [[ "$output_format" == "--json" || "$output_format" == "json" ]]; then
    python3 - "$packet_path" <<'PY'
import json
import sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    text = handle.read()
print(json.dumps({
    "packetType": "quipsly-writing-publication-packet-review",
    "episodeSlug": "episode-1",
    "title": "The Wednesday Rule",
    "path": path,
    "status": "review-ready first pass",
    "authorship": "agent-authored packet derived from agent-authored first-pass Nest draft",
    "reviewStatus": "needs-human-review",
    "canonStatus": "not canon-approved",
    "publicationStatus": "not published",
    "receiptStatus": "no external receipts captured",
    "truth": "This is Tower publication preparation. It does not publish, schedule, canonize, or prove external receipts.",
    "markdown": text
}, indent=2, sort_keys=True))
PY
    return
  fi

  cat "$packet_path"
}

vertical_slice_next_save() {
  local output_dir="${1:-$ROOT_DIR/.quipsly/vertical-slice-handoffs}"
  local basename="${2:-one-loop-next}"
  local state_path="$output_dir/$basename-state.json"
  local spine_path="$output_dir/$basename-episode-spine.json"
  local next_receipt_path="$output_dir/$basename-publication-next-receipt.json"
  local summary_path="$output_dir/$basename-one-loop-next.json"
  local markdown_path="$output_dir/$basename-one-loop-next.md"
  local latest_summary_path="$output_dir/latest-one-loop-next.json"
  local latest_markdown_path="$output_dir/START-HERE-ONE-LOOP-NEXT.md"

  mkdir -p "$output_dir"
  get "/state" > "$state_path"
  get "/episode_spine" > "$spine_path"
  get "/publication_next_receipt" > "$next_receipt_path"

  python3 - "$state_path" "$spine_path" "$next_receipt_path" "$summary_path" "$markdown_path" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

state_path, spine_path, next_receipt_path, summary_path, markdown_path = sys.argv[1:6]

def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as error:
        return {"_loadError": str(error), "_path": path}

state = load_json(state_path)
spine = load_json(spine_path)
next_receipt = load_json(next_receipt_path)

nest = state.get("nest") or {}
nest_readiness = nest.get("writingReadiness") or {}
studio = state.get("editorProofSnapshot") or state.get("editorControlPlane") or {}
publication = state.get("publicationMissionControl") or {}
receipt_cockpit = state.get("publicationReceiptCockpit") or {}

nest_next = (
    (nest_readiness.get("nextActionQueue") or [None])[0]
    or nest_readiness.get("nextAction")
    or nest.get("nextAction")
    or "Open the Nest writing surface, capture or review the next book/episode block, and keep authorship/review state visible."
)
studio_next = (
    studio.get("nextAction")
    or spine.get("studioNextAction")
    or "Open the Studio editor, inspect Episode 1 source lanes/decisions, and keep edits metadata-first/proxy-first."
)
tower_next = (
    next_receipt.get("displayLabel")
    or next_receipt.get("nextAction")
    or receipt_cockpit.get("nextAction")
    or publication.get("nextAction")
    or "Prepare or inspect the Tower publication packet, then capture real receipt evidence after external posting."
)

summary = {
    "packetType": "quipsly-one-loop-next-handoff",
    "version": "2026-06-20.one-loop-next.v1",
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "sessionName": state.get("sessionName") or spine.get("sessionName") or "",
    "nest": {
        "status": nest_readiness.get("status") or nest.get("status") or "",
        "documentTitle": nest.get("documentTitle") or nest.get("title") or "",
        "blockCount": nest.get("blockCount"),
        "authoredNeedsReviewCount": nest_readiness.get("authoredNeedsReviewCount"),
        "nextAction": nest_next,
    },
    "studio": {
        "status": studio.get("status") or spine.get("studioStatus") or "",
        "sequenceTitle": state.get("sequenceTitle") or spine.get("sequenceTitle") or "",
        "nextAction": studio_next,
    },
    "tower": {
        "status": receipt_cockpit.get("status") or publication.get("status") or "",
        "nextReceiptId": next_receipt.get("receiptId"),
        "nextReceiptLabel": next_receipt.get("displayLabel"),
        "nextReceiptPlatform": next_receipt.get("platform"),
        "nextAction": tower_next,
        "captureCommand": next_receipt.get("captureCommand"),
        "saveHandoffCommand": "script/agentctl.sh publication-next-receipt-save /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-next-receipt-live",
    },
    "artifacts": {
        "state": state_path,
        "episodeSpine": spine_path,
        "publicationNextReceipt": next_receipt_path,
        "summary": summary_path,
        "markdown": markdown_path,
    },
    "creativePartnerPolicy": next_receipt.get("creativePartnerPolicy") or receipt_cockpit.get("creativePartnerPolicy") or {
        "agentAuthoredWorkAllowed": True,
        "seriousAgentWorkIsNotPlaceholder": True,
        "publicationGate": "artifact review plus platform receipt truth, not authorship purity",
    },
    "truth": "This is a portable current-state handoff for the Nest-Studio-Tower loop. It does not upload, schedule, publish, verify providers, rewrite manuscript canon, or mutate receipt truth.",
}

with open(summary_path, "w", encoding="utf-8") as handle:
    json.dump(summary, handle, indent=2, sort_keys=True)
    handle.write("\n")

lines = [
    "# Start here: Quipsly one-loop next action",
    "",
    "This card keeps the current vertical slice connected: Nest writing/capture, Studio editing/export, and Tower publishing/receipts.",
    "",
    f"- Generated: `{summary['generatedAt']}`",
    f"- Session: `{summary['sessionName']}`",
    "",
    "## 1. Nest next",
    "",
    f"- Status: `{summary['nest']['status']}`",
    f"- Document: `{summary['nest']['documentTitle']}`",
    f"- Blocks: `{summary['nest']['blockCount']}`",
    f"- Authored needs review: `{summary['nest']['authoredNeedsReviewCount']}`",
    f"- Next action: {summary['nest']['nextAction']}",
    "",
    "## 2. Studio next",
    "",
    f"- Status: `{summary['studio']['status']}`",
    f"- Sequence: `{summary['studio']['sequenceTitle']}`",
    f"- Next action: {summary['studio']['nextAction']}",
    "",
    "## 3. Tower next",
    "",
    f"- Status: `{summary['tower']['status']}`",
    f"- Next receipt: `{summary['tower']['nextReceiptLabel']}`",
    f"- Platform: `{summary['tower']['nextReceiptPlatform']}`",
    f"- Next action: {summary['tower']['nextAction']}",
    "",
]

if summary["tower"].get("captureCommand"):
    lines.extend([
        "### Receipt capture command",
        "",
        "```bash",
        summary["tower"]["captureCommand"],
        "```",
        "",
    ])

lines.extend([
    "### Save focused Tower receipt handoff",
    "",
    "```bash",
    summary["tower"]["saveHandoffCommand"],
    "```",
    "",
    "## Files",
    "",
    f"- State: `{state_path}`",
    f"- Episode Spine: `{spine_path}`",
    f"- Publication next receipt: `{next_receipt_path}`",
    f"- Summary JSON: `{summary_path}`",
    "",
    "## Boundary",
    "",
    "Prepared artifacts are not publication proof. Publication exists only after external destination evidence is captured on the exact receipt row.",
    "",
    "Codex/Quipslys may create serious publishable first-pass work. The safeguard is visible provenance, review state, reversibility, and receipt truth, not a ban on agent-written work.",
])

with open(markdown_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines).rstrip() + "\n")

print(json.dumps({
    "status": "saved",
    "packetType": summary["packetType"],
    "summaryPath": summary_path,
    "markdownPath": markdown_path,
    "nextNestAction": nest_next,
    "nextStudioAction": studio_next,
    "nextTowerAction": tower_next,
    "truth": summary["truth"],
}, indent=2, sort_keys=True))
PY

  cp "$summary_path" "$latest_summary_path"
  cp "$markdown_path" "$latest_markdown_path"
}

vertical_slice_next_markdown() {
  local tmp_dir
  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-one-loop-next.XXXXXX")"
  trap 'rm -rf "$tmp_dir"' RETURN
  vertical_slice_next_save "$tmp_dir" "one-loop-next" >/dev/null
  cat "$tmp_dir/START-HERE-ONE-LOOP-NEXT.md"
}

vertical_slice_next_smoke() {
  local target="${1:-$ROOT_DIR/.quipsly/vertical-slice-handoffs}"
  local summary_path

  if [[ -d "$target" ]]; then
    summary_path="$target/latest-one-loop-next.json"
  else
    summary_path="$target"
  fi

  if [[ ! -f "$summary_path" ]]; then
    printf 'No one-loop next handoff found at %s\n' "$summary_path" >&2
    printf 'Run: script/agentctl.sh vertical-slice-next-save %s\n' "$(dirname "$summary_path")" >&2
    return 1
  fi

  python3 - "$summary_path" <<'PY'
import json
import os
import sys

summary_path = sys.argv[1]
with open(summary_path, "r", encoding="utf-8") as handle:
    summary = json.load(handle)

artifacts = summary.get("artifacts") or {}
checks = []

def check(name, ok, detail, expected=None, actual=None):
    checks.append({
        "name": name,
        "ok": bool(ok),
        "detail": detail,
        "expected": expected,
        "actual": actual,
    })

def exists(path):
    return bool(path) and os.path.exists(path)

check(
    "packet type is one-loop handoff",
    summary.get("packetType") == "quipsly-one-loop-next-handoff",
    "This smoke is only for the integrated Nest-Studio-Tower next-action handoff.",
    expected="quipsly-one-loop-next-handoff",
    actual=summary.get("packetType"),
)

for section in ("nest", "studio", "tower"):
    section_payload = summary.get(section) or {}
    check(
        f"{section} next action present",
        bool(str(section_payload.get("nextAction") or "").strip()),
        f"The {section} section should name the next useful operator action.",
        expected="non-empty nextAction",
        actual=section_payload.get("nextAction"),
    )

for key in ("state", "episodeSpine", "publicationNextReceipt", "summary", "markdown"):
    path = artifacts.get(key)
    check(
        f"artifact exists: {key}",
        exists(path),
        path or "",
        expected="existing file",
        actual=path,
    )

truth = str(summary.get("truth") or "")
check(
    "truth boundary prevents fake publishing",
    all(fragment in truth for fragment in ("does not upload", "does not", "mutate receipt truth")),
    "The handoff must say that saving a card is not publishing or receipt proof.",
    expected="truth includes non-publishing boundary",
    actual=truth,
)

policy = summary.get("creativePartnerPolicy") or {}
check(
    "creative partner policy visible",
    policy.get("agentAuthoredWorkAllowed") is True,
    "Agent-authored work is allowed, but provenance/review/receipt truth must stay visible.",
    expected=True,
    actual=policy.get("agentAuthoredWorkAllowed"),
)

ok = all(item["ok"] for item in checks)
print(json.dumps({
    "ok": ok,
    "summaryPath": summary_path,
    "checkCount": len(checks),
    "failed": [item for item in checks if not item["ok"]],
    "checks": checks,
    "truth": "This smoke validates a saved one-loop handoff artifact only. It does not prove live app behavior, exports, publishing, or external receipts.",
}, indent=2, sort_keys=True))
sys.exit(0 if ok else 1)
PY
}

vertical_slice_next_checkpoint() {
  local output_dir="${1:-$ROOT_DIR/.quipsly/vertical-slice-handoffs}"
  local basename="${2:-one-loop-next}"
  local save_path="$output_dir/$basename-checkpoint-save.json"
  local smoke_path="$output_dir/$basename-checkpoint-smoke.json"
  local checkpoint_path="$output_dir/$basename-checkpoint.json"
  local latest_checkpoint_path="$output_dir/latest-one-loop-next-checkpoint.json"
  local checkpoint_markdown_path="$output_dir/$basename-checkpoint.md"
  local latest_checkpoint_markdown_path="$output_dir/START-HERE-ONE-LOOP-CHECKPOINT.md"

  mkdir -p "$output_dir"
  vertical_slice_next_save "$output_dir" "$basename" > "$save_path"
  local smoke_status=0
  vertical_slice_next_smoke "$output_dir" > "$smoke_path" || smoke_status=$?

  python3 - "$save_path" "$smoke_path" "$output_dir" "$basename" "$checkpoint_path" "$latest_checkpoint_path" "$checkpoint_markdown_path" "$latest_checkpoint_markdown_path" "$smoke_status" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

save_path, smoke_path, output_dir, basename, checkpoint_path, latest_checkpoint_path, checkpoint_markdown_path, latest_checkpoint_markdown_path, smoke_status = sys.argv[1:10]

def load(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)

save = load(save_path)
smoke = load(smoke_path)
ok = bool(smoke.get("ok"))

checkpoint = {
    "ok": ok,
    "status": "checkpoint-passed" if ok else "checkpoint-failed",
    "smokeExitCode": int(smoke_status),
    "packetType": "quipsly-one-loop-next-checkpoint",
    "version": "2026-06-20.one-loop-next-checkpoint.v1",
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "outputDir": output_dir,
    "basename": basename,
    "saveResultPath": save_path,
    "smokeResultPath": smoke_path,
    "summaryPath": save.get("summaryPath"),
    "markdownPath": save.get("markdownPath"),
    "checkpointMarkdownPath": checkpoint_markdown_path,
    "latestCheckpointMarkdownPath": latest_checkpoint_markdown_path,
    "nextNestAction": save.get("nextNestAction"),
    "nextStudioAction": save.get("nextStudioAction"),
    "nextTowerAction": save.get("nextTowerAction"),
    "failedChecks": smoke.get("failed") or [],
    "truth": "This checkpoint generates and smoke-checks the portable one-loop handoff. It does not prove live editor playback, exports, publishing, external receipts, or canonical manuscript review.",
}

for path in (checkpoint_path, latest_checkpoint_path):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(checkpoint, handle, indent=2, sort_keys=True)
        handle.write("\n")

failed_checks = checkpoint.get("failedChecks") or []
lines = [
    "# Start here: One-loop checkpoint",
    "",
    "This checkpoint generated the current Nest-Studio-Tower handoff and smoke-checked the saved artifact.",
    "",
    f"- Status: `{checkpoint['status']}`",
    f"- Smoke exit code: `{checkpoint['smokeExitCode']}`",
    f"- Generated: `{checkpoint['generatedAt']}`",
    f"- Output folder: `{output_dir}`",
    "",
    "## Next actions",
    "",
    f"1. Nest: {checkpoint.get('nextNestAction') or 'No Nest next action was captured.'}",
    f"2. Studio: {checkpoint.get('nextStudioAction') or 'No Studio next action was captured.'}",
    f"3. Tower: {checkpoint.get('nextTowerAction') or 'No Tower next action was captured.'}",
    "",
    "## Files",
    "",
    f"- Handoff Markdown: `{checkpoint.get('markdownPath')}`",
    f"- Handoff JSON: `{checkpoint.get('summaryPath')}`",
    f"- Save result: `{save_path}`",
    f"- Smoke result: `{smoke_path}`",
    f"- Checkpoint JSON: `{checkpoint_path}`",
    "",
]

if failed_checks:
    lines.extend([
        "## Failed checks",
        "",
    ])
    for item in failed_checks:
        lines.extend([
            f"- `{item.get('name', 'unnamed check')}`",
            f"  - Detail: {item.get('detail', '')}",
            f"  - Expected: `{item.get('expected')}`",
            f"  - Actual: `{item.get('actual')}`",
        ])
    lines.append("")
else:
    lines.extend([
        "## Failed checks",
        "",
        "- None recorded by the handoff smoke verifier.",
        "",
    ])

lines.extend([
    "## Boundary",
    "",
    "This checkpoint proves only the saved one-loop handoff structure and honesty boundaries.",
    "It does not prove live editor playback, exports, actual publication, external receipt authenticity, or canonical manuscript review.",
])

for path in (checkpoint_markdown_path, latest_checkpoint_markdown_path):
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines).rstrip() + "\n")

checkpoint["checkpointPath"] = checkpoint_path
checkpoint["latestCheckpointPath"] = latest_checkpoint_path
checkpoint["checkpointMarkdownPath"] = checkpoint_markdown_path
checkpoint["latestCheckpointMarkdownPath"] = latest_checkpoint_markdown_path
print(json.dumps(checkpoint, indent=2, sort_keys=True))
sys.exit(0 if ok else 1)
PY
}

vertical_slice_next_checkpoint_markdown() {
  local target="${1:-$ROOT_DIR/.quipsly/vertical-slice-handoffs}"
  local markdown_path

  if [[ -d "$target" ]]; then
    markdown_path="$target/START-HERE-ONE-LOOP-CHECKPOINT.md"
  else
    markdown_path="$target"
  fi

  if [[ ! -f "$markdown_path" ]]; then
    printf 'No one-loop checkpoint Markdown found at %s\n' "$markdown_path" >&2
    printf 'Run: script/agentctl.sh vertical-slice-next-checkpoint %s\n' "$(dirname "$markdown_path")" >&2
    return 1
  fi

  cat "$markdown_path"
}

vertical_slice_next_validation_gate() {
  local output_dir="${1:-$ROOT_DIR/.quipsly/vertical-slice-handoffs}"
  local basename="${2:-one-loop-next}"
  local syntax_path="$output_dir/$basename-validation-shell-syntax.txt"
  local checkpoint_run_path="$output_dir/$basename-validation-checkpoint-run.json"
  local checkpoint_readback_path="$output_dir/$basename-validation-checkpoint-readback.md"
  local gate_path="$output_dir/$basename-validation-gate.json"
  local latest_gate_path="$output_dir/latest-one-loop-next-validation-gate.json"
  local gate_markdown_path="$output_dir/$basename-validation-gate.md"
  local latest_gate_markdown_path="$output_dir/START-HERE-ONE-LOOP-VALIDATION-GATE.md"
  local syntax_status=0
  local checkpoint_status=0
  local readback_status=0

  mkdir -p "$output_dir"

  bash -n "$0" > "$syntax_path" 2>&1 || syntax_status=$?
  vertical_slice_next_checkpoint "$output_dir" "$basename" > "$checkpoint_run_path" 2>&1 || checkpoint_status=$?
  vertical_slice_next_checkpoint_markdown "$output_dir" > "$checkpoint_readback_path" 2>&1 || readback_status=$?

  python3 - "$syntax_path" "$checkpoint_run_path" "$checkpoint_readback_path" "$gate_path" "$latest_gate_path" "$gate_markdown_path" "$latest_gate_markdown_path" "$syntax_status" "$checkpoint_status" "$readback_status" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

(
    syntax_path,
    checkpoint_run_path,
    checkpoint_readback_path,
    gate_path,
    latest_gate_path,
    gate_markdown_path,
    latest_gate_markdown_path,
    syntax_status,
    checkpoint_status,
    readback_status,
) = sys.argv[1:11]

def read_text(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    except Exception as error:
        return f"<read error: {error}>"

def load_json_from_text(path):
    text = read_text(path)
    try:
        return json.loads(text)
    except Exception:
        return {"_parseError": "checkpoint output was not JSON", "_raw": text[-4000:]}

syntax_status = int(syntax_status)
checkpoint_status = int(checkpoint_status)
readback_status = int(readback_status)
checkpoint_output = load_json_from_text(checkpoint_run_path)
checkpoint_ok = bool(checkpoint_output.get("ok")) and checkpoint_status == 0
ok = syntax_status == 0 and checkpoint_ok and readback_status == 0

gate = {
    "ok": ok,
    "status": "validation-gate-passed" if ok else "validation-gate-failed",
    "packetType": "quipsly-one-loop-next-validation-gate",
    "version": "2026-06-20.one-loop-next-validation-gate.v1",
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "checks": [
        {
            "name": "agentctl shell syntax",
            "ok": syntax_status == 0,
            "exitCode": syntax_status,
            "artifact": syntax_path,
        },
        {
            "name": "one-loop checkpoint generation and smoke",
            "ok": checkpoint_ok,
            "exitCode": checkpoint_status,
            "artifact": checkpoint_run_path,
            "checkpointStatus": checkpoint_output.get("status"),
            "failedChecks": checkpoint_output.get("failedChecks") or [],
        },
        {
            "name": "one-loop checkpoint Markdown readback",
            "ok": readback_status == 0 and os.path.getsize(checkpoint_readback_path) > 0,
            "exitCode": readback_status,
            "artifact": checkpoint_readback_path,
        },
    ],
    "artifacts": {
        "shellSyntax": syntax_path,
        "checkpointRun": checkpoint_run_path,
        "checkpointReadback": checkpoint_readback_path,
        "gate": gate_path,
        "gateMarkdown": gate_markdown_path,
    },
    "truth": "This gate validates shell syntax, one-loop checkpoint generation/smoke, and checkpoint Markdown readback. It does not prove live editor playback, exports, actual publication, external receipt authenticity, or manuscript canon.",
}

for path in (gate_path, latest_gate_path):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(gate, handle, indent=2, sort_keys=True)
        handle.write("\n")

lines = [
    "# Start here: One-loop validation gate",
    "",
    f"- Status: `{gate['status']}`",
    f"- Generated: `{gate['generatedAt']}`",
    "",
    "## Checks",
    "",
]
for check in gate["checks"]:
    marker = "PASS" if check["ok"] else "FAIL"
    lines.extend([
        f"- {marker}: {check['name']}",
        f"  - Exit code: `{check['exitCode']}`",
        f"  - Artifact: `{check['artifact']}`",
    ])
    if check.get("failedChecks"):
        lines.append("  - Failed smoke checks:")
        for item in check["failedChecks"]:
            lines.append(f"    - `{item.get('name', 'unnamed')}`: {item.get('detail', '')}")

lines.extend([
    "",
    "## Boundary",
    "",
    gate["truth"],
])

for path in (gate_markdown_path, latest_gate_markdown_path):
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines).rstrip() + "\n")

gate["gatePath"] = gate_path
gate["latestGatePath"] = latest_gate_path
gate["gateMarkdownPath"] = gate_markdown_path
gate["latestGateMarkdownPath"] = latest_gate_markdown_path
print(json.dumps(gate, indent=2, sort_keys=True))
sys.exit(0 if ok else 1)
PY
}

command="${1:-}"
case "$command" in
  agent-url)
    printf '%s\n' "$BASE_URL"
    ;;
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
  codex-handoff)
    get "/codex_editor_handoff"
    ;;
  editor-loop-proof)
    get "/editor_loop_proof"
    ;;
  codex-observe)
    codex_observe
    ;;
  codex-observe-save)
    codex_observe_save "${2:-}"
    ;;
  codex-act-save)
    shift
    codex_act_save "$@"
    ;;
  codex-act-review)
    codex_act_review "${2:-latest}"
    ;;
  codex-session-review)
    shift
    codex_session_review "$@"
    ;;
  codex-release-observe)
    codex_release_observe
    ;;
  codex-release-observe-save)
    codex_release_observe_save "${2:-}"
    ;;
  codex-release-act-save)
    shift
    codex_release_act_save "$@"
    ;;
  codex-release-act-review)
    codex_release_act_review "${2:-latest}"
    ;;
  codex-release-session-review)
    shift
    codex_release_session_review "$@"
    ;;
  codex-production-review)
    shift
    codex_production_review "$@"
    ;;
  codex-audit-status)
    shift
    codex_audit_status "$@"
    ;;
  codex-production-handoff)
    shift
    codex_production_handoff "$@"
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
  publication-operator-runbook|publication-runbook)
    get "/publication_operator_runbook"
    ;;
  missing-publication-receipts)
    get "/missing_publication_receipts"
    ;;
  publication-mission-control|publish-mission-control)
    get "/publication_mission_control"
    ;;
  ship-map-smoke|publication-mission-smoke)
    ship_map_smoke
    ;;
  studio-edit-smoke|studio-smoke|edit-smoke)
    studio_edit_smoke
    ;;
  delivery-artifact-smoke|delivery-smoke|artifact-smoke)
    delivery_artifact_smoke
    ;;
  release-export-prepare|episode-release-export-prepare|make-release-exports)
    release_export_prepare "${2:-}" "${3:-}" "${4:-}" "${5:-}"
    ;;
  release-export-smoke|episode-release-export-smoke)
    release_export_smoke "${2:-}"
    ;;
  release-export-review|episode-release-export-review|tower-release-review)
    release_export_review "${2:-}" "${3:-text}"
    ;;
  release-receipt-ledger-prepare|tower-receipt-ledger-prepare|receipt-ledger-prepare)
    release_receipt_ledger_prepare "${2:-}" "${3:-}"
    ;;
  release-receipt-ledger-update|tower-receipt-ledger-update|receipt-ledger-update)
    release_receipt_ledger_update "${2:-}" "${3:-}" "${4:-}" "${5:-}" "${6:-}" "${7:-}"
    ;;
  release-receipt-ledger-next|tower-receipt-ledger-next|receipt-ledger-next|next-receipt)
    release_receipt_ledger_next "${2:-}"
    ;;
  release-receipt-ledger-smoke|tower-receipt-ledger-smoke|receipt-ledger-smoke)
    release_receipt_ledger_smoke "${2:-}"
    ;;
  release-tower-local-prepare|tower-local-prepare|release-local-tower)
    release_tower_local_prepare "${2:-}" "${3:-}"
    ;;
  episode-spine|spine-loop|nest-studio-tower|vertical-slice|one-loop)
    get "/episode_spine"
    ;;
  vertical-slice-packet|one-loop-packet|nest-studio-tower-packet)
    get "/vertical_slice_packet"
    ;;
  vertical-slice-packet-generate|one-loop-packet-generate|nest-studio-tower-packet-generate)
    directory="${2:-}"
    basename="${3:-quipsly-vertical-slice}"
    get "/vertical_slice_packet_generate?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")"
    ;;
  vertical-slice-prepare|one-loop-prepare|nest-studio-tower-prepare)
    vertical_slice_prepare "${2:-}" "${3:-}"
    ;;
  vertical-slice-next-markdown|one-loop-next-markdown|nest-studio-tower-next-markdown)
    vertical_slice_next_markdown
    ;;
  vertical-slice-next-save|one-loop-next-save|nest-studio-tower-next-save)
    vertical_slice_next_save "${2:-}" "${3:-}"
    ;;
  vertical-slice-next-smoke|one-loop-next-smoke|nest-studio-tower-next-smoke)
    vertical_slice_next_smoke "${2:-}"
    ;;
  vertical-slice-next-checkpoint|one-loop-next-checkpoint|nest-studio-tower-next-checkpoint)
    vertical_slice_next_checkpoint "${2:-}" "${3:-}"
    ;;
  vertical-slice-next-checkpoint-markdown|one-loop-next-checkpoint-markdown|nest-studio-tower-next-checkpoint-markdown)
    vertical_slice_next_checkpoint_markdown "${2:-}"
    ;;
  vertical-slice-next-validation-gate|one-loop-next-validation-gate|nest-studio-tower-next-validation-gate)
    vertical_slice_next_validation_gate "${2:-}" "${3:-}"
    ;;
  vertical-slice-review|one-loop-review|nest-studio-tower-review)
    vertical_slice_review "${2:-}" "${3:-text}"
    ;;
  vertical-slice-smoke|one-loop-smoke|nest-studio-tower-smoke)
    vertical_slice_smoke "${2:-}"
    ;;
  publication-receipt-cockpit|receipt-cockpit|receipts-cockpit)
    get "/publication_receipt_cockpit"
    ;;
  publication-next-receipt|next-publication-receipt|next-tower-receipt)
    get "/publication_next_receipt"
    ;;
  publication-next-receipt-markdown|next-publication-receipt-markdown|next-tower-receipt-markdown)
    get "/publication_next_receipt" | python3 -c 'import json, sys; data = json.load(sys.stdin); print(data.get("markdown") or json.dumps(data, indent=2, sort_keys=True))'
    ;;
  publication-next-receipt-save|next-publication-receipt-save|next-tower-receipt-save)
    publication_next_receipt_save "${2:-}" "${3:-}"
    ;;
  publication-writing-packet|tower-writing-packet|episode1-writing-publication-packet)
    publication_writing_packet "${2:-text}"
    ;;
  publication-writing-packet-v2|tower-writing-packet-v2|episode1-writing-publication-packet-v2)
    packet_path="$ROOT_DIR/../../docs/quipsly/publication-packets/hgo-episode-1-the-wednesday-rule-writing-publication-packet-v2.md"
    packet_path="$(cd "$(dirname "$packet_path")" && pwd)/$(basename "$packet_path")"
    if [[ "${2:-text}" == "--json" || "${2:-text}" == "json" ]]; then
      python3 - "$packet_path" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    markdown = handle.read()

print(json.dumps({
    "packetType": "quipsly-writing-publication-packet-v2",
    "projectSlug": "high-ground-odyssey-manuscript",
    "episodeSlug": "episode-1",
    "title": "High Ground Odyssey Episode 1 Writing Publication Packet - v2",
    "path": path,
    "authorship": "agent-authored",
    "reviewStatus": "needs-human-review",
    "canonStatus": "not-canon-approved",
    "publicationStatus": "not-published",
    "receiptStatus": "no-external-receipts",
    "truth": "This v2 packet prepares publication work from the second-pass draft. It does not publish, schedule, canonize, or claim external proof.",
    "markdown": markdown,
}, indent=2, sort_keys=True))
PY
    else
      cat "$packet_path"
    fi
    ;;
  publication-destination-copy|tower-destination-copy|episode1-writing-destination-copy)
    copy_path="$ROOT_DIR/../../docs/quipsly/publication-packets/hgo-episode-1-the-wednesday-rule-destination-copy-packet.md"
    copy_path="$(cd "$(dirname "$copy_path")" && pwd)/$(basename "$copy_path")"
    if [[ "${2:-text}" == "--json" || "${2:-text}" == "json" ]]; then
      python3 - "$copy_path" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    markdown = handle.read()

print(json.dumps({
    "packetType": "quipsly-destination-copy-packet",
    "projectSlug": "high-ground-odyssey-manuscript",
    "episodeSlug": "episode-1",
    "title": "High Ground Odyssey Episode 1 Destination Copy Packet",
    "path": path,
    "authorship": "agent-authored",
    "reviewStatus": "needs-human-review",
    "canonStatus": "not-canon-approved",
    "publicationStatus": "not-published",
    "receiptStatus": "no-external-receipts",
    "destinations": [
        "HighGroundOdyssey.com",
        "YouTube long-form",
        "Patreon",
        "YouTube Shorts",
        "Instagram",
        "Facebook",
        "LinkedIn"
    ],
    "truth": "This packet prepares destination-specific copy. It does not publish, schedule, approve canon, export media, or capture external receipts.",
    "markdown": markdown,
}, indent=2, sort_keys=True))
PY
    else
      cat "$copy_path"
    fi
    ;;
  episode1-publication-action-queue|publication-action-queue|tower-action-queue)
    action_queue_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-publication-action-queue.json"
    action_queue_path="$(cd "$(dirname "$action_queue_path")" && pwd)/$(basename "$action_queue_path")"
    python3 - "$action_queue_path" "${2:-text}" <<'PY'
import json
import sys

path, mode = sys.argv[1:3]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)
payload["path"] = path

if mode in ("--json", "json"):
    print(json.dumps(payload, indent=2, sort_keys=True))
else:
    print("# Episode 1 publication action queue")
    print("")
    print(payload["truth"])
    print("")
    print(f"- Queue status: `{payload['queueStatus']}`")
    print("")
    print("## Actions")
    for item in payload["actions"]:
        print(f"{item['order']}. `{item['status']}` - {item['label']} ({item['lane']})")
        print(f"   Evidence: {item['requiredEvidence']}")
    print("")
    print("## Ready now")
    for item in payload["readyNow"]:
        print(f"- {item}")
PY
    ;;
  episode1-studio-artifact-proof-requirements|studio-artifact-proof-requirements|episode1-studio-proof-requirements)
    studio_proof_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-artifact-proof-requirements.json"
    studio_proof_path="$(cd "$(dirname "$studio_proof_path")" && pwd)/$(basename "$studio_proof_path")"
    python3 - "$studio_proof_path" "${2:-text}" <<'PY'
import json
import sys

path, mode = sys.argv[1:3]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)
payload["path"] = path

if mode in ("--json", "json"):
    print(json.dumps(payload, indent=2, sort_keys=True))
else:
    print("# Episode 1 Studio artifact proof requirements")
    print("")
    print(payload["truth"])
    print("")
    print(f"- Proof status: `{payload['proofStatus']}`")
    print("")
    print("## Required artifact families")
    for item in payload["requiredArtifactFamilies"]:
        print(f"- `{item['id']}`: {item['label']}")
    print("")
    print("## Minimum proof for Tower artifact-ready")
    for item in payload["minimumProofForTowerArtifactReady"]:
        print(f"- {item}")
PY
    ;;
  episode1-studio-proof-attachment-queue|studio-proof-attachment-queue|episode1-export-proof-queue)
    studio_attach_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    studio_attach_path="$(cd "$(dirname "$studio_attach_path")" && pwd)/$(basename "$studio_attach_path")"
    python3 - "$studio_attach_path" "${2:-text}" <<'PY'
import json
import sys

path, mode = sys.argv[1:3]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)
payload["path"] = path

if mode in ("--json", "json"):
    print(json.dumps(payload, indent=2, sort_keys=True))
else:
    print("# Episode 1 Studio proof attachment queue")
    print("")
    print(payload["truth"])
    print("")
    print(f"- Queue status: `{payload['queueStatus']}`")
    print("")
    print("## Attachment slots")
    for item in payload["attachmentSlots"]:
        print(f"- `{item['id']}`: {item['artifactFamily']} / {item['status']}")
    print("")
    print("## Ready to attach when")
    for item in payload["readyToAttachWhen"]:
        print(f"- {item}")
PY
    ;;
  episode1-studio-proof-attach|studio-proof-attach|episode1-export-proof-attach)
    input_path="${2:-}"
    output_path="${3:-}"
    if [[ -z "$input_path" ]]; then
      printf 'Usage: script/agentctl.sh episode1-studio-proof-attach /absolute/release-manifest-or-folder [/absolute/output.json]\n' >&2
      exit 2
    fi
    studio_attach_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    studio_requirements_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-artifact-proof-requirements.json"
    studio_attach_path="$(cd "$(dirname "$studio_attach_path")" && pwd)/$(basename "$studio_attach_path")"
    studio_requirements_path="$(cd "$(dirname "$studio_requirements_path")" && pwd)/$(basename "$studio_requirements_path")"
    python3 - "$input_path" "$output_path" "$studio_attach_path" "$studio_requirements_path" <<'PY'
import json
import os
import re
import sys
from datetime import datetime, timezone

input_path, output_path, queue_path, requirements_path = sys.argv[1:5]

def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")

with open(queue_path, "r", encoding="utf-8") as handle:
    queue = json.load(handle)
with open(requirements_path, "r", encoding="utf-8") as handle:
    requirements = json.load(handle)

known_exts = {
    ".mp4", ".mov", ".m4v", ".webm", ".mkv",
    ".mp3", ".m4a", ".wav", ".aac", ".flac",
    ".png", ".jpg", ".jpeg", ".webp",
    ".json", ".md", ".txt", ".csv", ".zip",
}
path_pattern = re.compile(r"(/Users/[^\s\"'<>]+|[A-Za-z0-9_.~/-]+\\.(?:mp4|mov|m4v|mp3|m4a|wav|png|jpg|jpeg|json|md|txt|csv|zip))")

def add_candidate(candidates, path, source, kind="file", note=""):
    if not path:
        return
    cleaned = str(path).strip().strip(",;")
    if not cleaned:
        return
    candidates.append({
        "path": cleaned,
        "kind": kind,
        "source": source,
        "existsAtGeneration": os.path.exists(cleaned) if cleaned.startswith("/") else None,
        "note": note,
    })

def flatten_json(value, prefix=""):
    found = []
    if isinstance(value, dict):
        for key, child in value.items():
            found.extend(flatten_json(child, f"{prefix}.{key}" if prefix else str(key)))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(flatten_json(child, f"{prefix}[{index}]"))
    elif isinstance(value, str):
        found.append((prefix, value))
    return found

def collect_from_file(path):
    candidates = []
    lower = path.lower()
    ext = os.path.splitext(lower)[1]
    add_candidate(candidates, path, "input-file", "file", "operator supplied this file directly")
    try:
        if ext == ".json":
            with open(path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
            for key, value in flatten_json(payload):
                if not isinstance(value, str):
                    continue
                if any(token in key.lower() for token in ("path", "file", "artifact", "manifest", "contact", "audio", "video", "export", "zip")):
                    add_candidate(candidates, value, f"json-field:{key}", "manifest-field")
                for match in path_pattern.findall(value):
                    add_candidate(candidates, match, f"json-text:{key}", "manifest-field")
        elif ext in {".md", ".txt", ".csv"}:
            with open(path, "r", encoding="utf-8", errors="replace") as handle:
                text = handle.read()
            for match in path_pattern.findall(text):
                add_candidate(candidates, match, "text-path-reference", "text-reference")
    except Exception as error:
        candidates.append({
            "path": path,
            "kind": "read-error",
            "source": "input-file",
            "existsAtGeneration": os.path.exists(path),
            "note": f"Could not inspect file content: {error}",
        })
    return candidates

def collect_from_directory(path):
    candidates = []
    max_files = 250
    seen = 0
    for root, dirs, files in os.walk(path):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))[:20]
        for name in sorted(files):
            if name.startswith("."):
                continue
            ext = os.path.splitext(name.lower())[1]
            if ext not in known_exts:
                continue
            full = os.path.join(root, name)
            rel = os.path.relpath(full, path)
            add_candidate(candidates, full, f"folder-scan:{rel}", "file")
            seen += 1
            if seen >= max_files:
                candidates.append({
                    "path": path,
                    "kind": "scan-limit",
                    "source": "folder-scan",
                    "existsAtGeneration": True,
                    "note": f"Stopped after {max_files} candidate files to keep proof generation bounded.",
                })
                return candidates
        if root.count(os.sep) - path.count(os.sep) >= 4:
            dirs[:] = []
    return candidates

if not os.path.exists(input_path):
    raw_candidates = []
    input_status = "input-missing"
else:
    input_status = "input-scanned"
    raw_candidates = collect_from_directory(input_path) if os.path.isdir(input_path) else collect_from_file(input_path)

def score_candidate(candidate, slot):
    text = " ".join(str(candidate.get(key, "")) for key in ("path", "source", "note")).lower()
    family = slot.get("artifactFamily", "").lower()
    score = 0
    if family == "episode-16x9-master":
        score += 8 if any(token in text for token in ("16x9", "16-9", "widescreen", "landscape")) else 0
        score += 4 if any(token in text for token in ("master", "episode", "youtube", "long")) else 0
        score += 3 if any(text.endswith(ext) for ext in (".mp4", ".mov", ".m4v")) else 0
        score -= 4 if any(token in text for token in ("9x16", "9-16", "vertical", "short", "reel")) else 0
    elif family == "episode-9x16-master":
        score += 8 if any(token in text for token in ("9x16", "9-16", "vertical", "portrait")) else 0
        score += 3 if any(text.endswith(ext) for ext in (".mp4", ".mov", ".m4v")) else 0
        score -= 3 if "short" in text else 0
    elif family == "social-shorts":
        score += 8 if any(token in text for token in ("short", "reel", "social", "clip")) else 0
        score += 4 if any(token in text for token in ("contact", "sheet", "queue", "reviewed", "social-ready")) else 0
        score += 2 if any(text.endswith(ext) for ext in (".mp4", ".mov", ".png", ".jpg", ".json", ".zip")) else 0
    elif family == "podcast-audio":
        score += 8 if any(token in text for token in ("podcast", "audio", "rss", "listen")) else 0
        score += 5 if any(text.endswith(ext) for ext in (".mp3", ".m4a", ".wav", ".aac", ".flac")) else 0
    elif family == "episode-spine":
        score += 8 if any(token in text for token in ("spine", "receipt", "cockpit", "publication", "handoff", "start-here", "manifest")) else 0
        score += 3 if any(text.endswith(ext) for ext in (".json", ".md", ".csv", ".zip")) else 0
    return score

attachments = []
for slot in queue.get("attachmentSlots", []):
    ranked = []
    for candidate in raw_candidates:
        score = score_candidate(candidate, slot)
        if score > 0:
            enriched = dict(candidate)
            enriched["matchScore"] = score
            ranked.append(enriched)
    ranked.sort(key=lambda item: (-item["matchScore"], str(item.get("path", ""))))
    attachments.append({
        "slotId": slot.get("id"),
        "artifactFamily": slot.get("artifactFamily"),
        "status": "candidate-found" if ranked else "missing-current-evidence",
        "candidateEvidence": ranked[:12],
        "expectedEvidence": slot.get("expectedEvidence", []),
        "stillNeedsHumanOrAgentReview": [
            "Confirm the candidate belongs to the current Episode 1 edit.",
            "Add duration/codec/audio/framing notes where required.",
            "Keep upload/schedule/publication receipts separate from export proof.",
        ],
    })

candidate_count = sum(len(item["candidateEvidence"]) for item in attachments)
packet = {
    "packetType": "quipsly-studio-proof-attachment-packet",
    "version": "2026-06-20.studio-proof-attach.v1",
    "projectSlug": queue.get("projectSlug"),
    "episodeSlug": queue.get("episodeSlug"),
    "title": "Episode 1 - Studio proof attachment candidates",
    "generatedAt": now_iso(),
    "inputPath": input_path,
    "inputStatus": input_status,
    "status": "attachment-candidates-generated" if candidate_count else ("input-missing" if input_status == "input-missing" else "no-candidates-found"),
    "sourceQueue": queue_path,
    "sourceRequirements": requirements_path,
    "requirementsProofStatus": requirements.get("proofStatus"),
    "attachmentCandidateCount": candidate_count,
    "rawCandidateCount": len(raw_candidates),
    "attachments": attachments,
    "blockedClaims": [
        "This packet does not prove publication, upload, schedule, or external receipt capture.",
        "This packet does not mutate the source proof queue.",
        "Candidate-found means a file/path/manifest field matched by name, not that the artifact was watched or approved.",
        "Human or explicitly delegated agent review is still required before Tower artifact-ready claims.",
    ],
    "truth": "This packet converts a supplied Studio export folder or manifest into candidate proof attachments. It is current only for the supplied input at generation time and does not publish, schedule, upload, approve canon, or capture external receipts.",
}

if output_path:
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(packet, handle, indent=2, sort_keys=True)
        handle.write("\n")
    packet["writtenTo"] = output_path

print(json.dumps(packet, indent=2, sort_keys=True))
PY
    ;;
  episode1-studio-proof-attach-latest|studio-proof-attach-latest|episode1-export-proof-attach-latest)
    output_path="${2:-}"
    resolved_input="$(python3 <<'PY'
import os
import plistlib
import subprocess

roots = [
    "/Users/wall-e/Movies/QuipslyExports/Episode1FullRelease",
    "/Users/wall-e/Movies/QuipslyExports/ReleaseProofs/episodes-1-3-full-release-proof-v3/episode-1",
    "/Users/wall-e/Movies/QuipslyExports/Episode1Tower",
]

video_exts = (".mp4", ".mov", ".m4v")
audio_exts = (".m4a", ".mp3", ".wav", ".aac", ".flac")
manifest_names = ("latest-release-export-review.json", "latest-release-export-manifest.json")

def mdls_seconds(path):
    try:
        result = subprocess.run(
            ["/usr/bin/mdls", "-plist", "-", "-name", "kMDItemDurationSeconds", path],
            check=False,
            capture_output=True,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return 0.0
        payload = plistlib.loads(result.stdout)
        value = payload.get("kMDItemDurationSeconds")
        return float(value or 0)
    except Exception:
        return 0.0

def bounded_dirs(root):
    if not os.path.isdir(root):
        return
    for current, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))[:24]
        depth = current.count(os.sep) - root.count(os.sep)
        if depth > 4:
            dirs[:] = []
            continue
        if any(name in files for name in manifest_names) or any(
            name.lower().endswith(video_exts + audio_exts + (".json", ".md", ".zip"))
            for name in files
        ):
            yield current, files

def score_directory(current, files):
    lower_files = [name.lower() for name in files]
    paths = [os.path.join(current, name) for name in files]
    videos = [path for path, lower in zip(paths, lower_files) if lower.endswith(video_exts)]
    audios = [path for path, lower in zip(paths, lower_files) if lower.endswith(audio_exts)]
    wide = [path for path in videos if any(token in os.path.basename(path).lower() for token in ("16x9", "16-9", "wide", "landscape"))]
    vertical = [path for path in videos if any(token in os.path.basename(path).lower() for token in ("9x16", "9-16", "vertical", "portrait"))]
    wide_duration = max([mdls_seconds(path) for path in wide] or [0])
    vertical_duration = max([mdls_seconds(path) for path in vertical] or [0])
    audio_duration = max([mdls_seconds(path) for path in audios] or [0])
    has_manifest = any(name in files for name in manifest_names)
    full_length_hits = sum(duration >= 2700 for duration in (wide_duration, vertical_duration, audio_duration))
    short_penalty = sum(1 for duration in (wide_duration, vertical_duration, audio_duration) if 0 < duration < 600)
    mtime = os.path.getmtime(current)
    score = (full_length_hits * 1000) + (100 if has_manifest else 0) + min(wide_duration, 7200) / 100 + min(vertical_duration, 7200) / 100 + min(audio_duration, 7200) / 120 - (short_penalty * 200)
    if "fullrelease" in current.lower() or "full-release" in current.lower():
        score += 75
    if "tower" in current.lower() and full_length_hits == 0:
        score -= 100
    return score, mtime

candidates = []
for root in roots:
    for current, files in bounded_dirs(root) or []:
        score, mtime = score_directory(current, files)
        if score > 0:
            candidates.append((score, mtime, current))

if candidates:
    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    current = candidates[0][2]
    for name in manifest_names:
        manifest = os.path.join(current, name)
        if os.path.isfile(manifest):
            print(manifest)
            break
    else:
        print(current)
PY
)"
    if [[ -z "$resolved_input" ]]; then
      printf 'No fit Episode 1 Studio export proof input found under the known Quipsly export roots.\n' >&2
      printf 'Run release-export-prepare/review first, or use: script/agentctl.sh episode1-studio-proof-attach /absolute/release-manifest-or-folder [/absolute/output.json]\n' >&2
      exit 3
    fi
    if [[ -n "$output_path" ]]; then
      "$0" episode1-studio-proof-attach "$resolved_input" "$output_path"
    else
      "$0" episode1-studio-proof-attach "$resolved_input"
    fi
    ;;
  episode1-artifact-watch-review|artifact-watch-review|episode1-watch-listen-review)
    output_path="${2:-}"
    review_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-full-release-artifact-proof-review.json"
    default_output="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review.md"
    review_path="$(cd "$(dirname "$review_path")" && pwd)/$(basename "$review_path")"
    default_output="$(cd "$(dirname "$default_output")" && pwd)/$(basename "$default_output")"
    if [[ "$output_path" == "--json" ]]; then
      python3 - "$review_path" <<'PY'
import json
import sys
from datetime import datetime, timezone

review_path = sys.argv[1]
with open(review_path, "r", encoding="utf-8") as handle:
    proof = json.load(handle)

artifacts = []
for item in proof.get("artifacts", []):
    if item.get("artifactId") in {"episode-16x9-master", "episode-9x16-master", "podcast-audio-master"}:
        artifacts.append({
            "artifactId": item.get("artifactId"),
            "path": item.get("path"),
            "durationSeconds": item.get("durationSeconds"),
            "pixelWidth": item.get("pixelWidth"),
            "pixelHeight": item.get("pixelHeight"),
            "exists": item.get("exists"),
            "reviewState": "needs-watch-listen-review",
            "checks": [
                "opens and plays",
                "belongs to Episode 1 - The Wednesday Rule",
                "audio is present and intelligible",
                "framing/crop is acceptable for the intended format",
                "start and ending are intentional",
                "no obvious export corruption, blank stretches, or accidental smoke duration",
            ],
        })

packet = {
    "packetType": "quipsly-artifact-watch-listen-review",
    "projectSlug": proof.get("projectSlug"),
    "episodeSlug": proof.get("episodeSlug"),
    "generatedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
    "sourceProofReview": review_path,
    "status": "review-sheet-generated-not-reviewed",
    "artifacts": artifacts,
    "truth": "This packet lists watch/listen review tasks for existing full-length artifacts. It does not perform the review, approve publication, upload, schedule, or capture receipts.",
}
print(json.dumps(packet, indent=2, sort_keys=True))
PY
    else
      if [[ -z "$output_path" ]]; then
        output_path="$default_output"
      fi
      python3 - "$review_path" "$output_path" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

review_path, output_path = sys.argv[1:3]
with open(review_path, "r", encoding="utf-8") as handle:
    proof = json.load(handle)

def fmt_duration(value):
    if value is None:
        return "unknown"
    seconds = float(value)
    minutes = int(seconds // 60)
    remain = int(round(seconds % 60))
    return f"{minutes}:{remain:02d} ({seconds:.3f}s)"

artifact_labels = {
    "episode-16x9-master": "16:9 episode master",
    "episode-9x16-master": "9:16 vertical master",
    "podcast-audio-master": "Podcast audio master",
}

lines = [
    "# Episode 1 artifact watch/listen review",
    "",
    f"Generated: {datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds')}",
    "",
    "Status: `review-sheet-generated-not-reviewed`",
    "",
    "This worksheet is for a human or explicitly delegated agent review of the full-length Episode 1 artifacts. Metadata proves the files exist and have plausible duration. This worksheet is where quality review starts.",
    "",
    "Truth boundary: checking boxes here does not publish, schedule, upload, canon-approve writing, or capture platform receipts.",
    "",
    f"Source proof review: `{review_path}`",
    "",
    "## Review checklist",
    "",
    "- [ ] The 16:9 master opens and plays.",
    "- [ ] The 16:9 master belongs to Episode 1 - The Wednesday Rule.",
    "- [ ] The 16:9 master has acceptable audio, pacing, framing, and ending.",
    "- [ ] The 9:16 master opens and plays.",
    "- [ ] The 9:16 master has acceptable crop/framing for vertical viewing.",
    "- [ ] The podcast audio opens and plays.",
    "- [ ] The podcast audio is intelligible and has an intentional start/end.",
    "- [ ] Selected shorts are reviewed separately before any social posting claim.",
    "- [ ] Any issue found is linked to a fix or a decision to accept the artifact anyway.",
    "",
    "## Artifact targets",
    "",
]

for item in proof.get("artifacts", []):
    artifact_id = item.get("artifactId")
    if artifact_id not in artifact_labels:
        continue
    dims = "audio-only"
    if item.get("pixelWidth") and item.get("pixelHeight"):
        dims = f"{item.get('pixelWidth')}x{item.get('pixelHeight')}"
    lines.extend([
        f"### {artifact_labels[artifact_id]}",
        "",
        f"- Path: `{item.get('path')}`",
        f"- Exists at metadata proof: `{item.get('exists')}`",
        f"- Duration: `{fmt_duration(item.get('durationSeconds'))}`",
        f"- Dimensions: `{dims}`",
        "",
        "Review notes:",
        "",
        "- Playback:",
        "- Audio:",
        "- Framing/crop:",
        "- Start/end:",
        "- Problems:",
        "- Decision: `needs-review`",
        "",
    ])

lines.extend([
    "## Next state after review",
    "",
    "If all required artifacts pass, update Tower readiness to artifact-review-passed and continue toward platform-specific posting packets.",
    "",
    "If any artifact fails, keep Tower at review-needed and route the issue back to Studio with the exact artifact path and problem.",
    "",
])

os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
with open(output_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines))
    handle.write("\n")

print(json.dumps({
    "packetType": "quipsly-artifact-watch-listen-review-result",
    "status": "review-sheet-written",
    "writtenTo": output_path,
    "sourceProofReview": review_path,
    "truth": "This writes a review worksheet only. It does not approve, publish, upload, schedule, or capture receipts.",
}, indent=2, sort_keys=True))
PY
    fi
    ;;
  episode1-artifact-review-assist|artifact-review-assist|episode1-watch-listen-review-assist)
    output_path="${2:-}"
    review_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-full-release-artifact-proof-review.json"
    assist_json_default="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-assist.json"
    assist_md_default="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-assist.md"
    thumb_dir_default="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-review-thumbnails"
    action_queue_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-publication-action-queue.json"
    studio_queue_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    writing_status_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-writing-loop-status.json"
    review_path="$(cd "$(dirname "$review_path")" && pwd)/$(basename "$review_path")"
    assist_json_default="$(cd "$(dirname "$assist_json_default")" && pwd)/$(basename "$assist_json_default")"
    assist_md_default="$(cd "$(dirname "$assist_md_default")" && pwd)/$(basename "$assist_md_default")"
    thumb_dir_default="$(cd "$(dirname "$thumb_dir_default")" && pwd)/$(basename "$thumb_dir_default")"
    action_queue_path="$(cd "$(dirname "$action_queue_path")" && pwd)/$(basename "$action_queue_path")"
    studio_queue_path="$(cd "$(dirname "$studio_queue_path")" && pwd)/$(basename "$studio_queue_path")"
    writing_status_path="$(cd "$(dirname "$writing_status_path")" && pwd)/$(basename "$writing_status_path")"
    if [[ -z "$output_path" ]]; then
      output_path="$assist_json_default"
    fi
    output_path="$(cd "$(dirname "$output_path")" && pwd)/$(basename "$output_path")"
    python3 - "$review_path" "$output_path" "$assist_md_default" "$thumb_dir_default" "$action_queue_path" "$studio_queue_path" "$writing_status_path" <<'PY'
import json
import os
import plistlib
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

review_path, output_path, markdown_path, thumb_dir, action_queue_path, studio_queue_path, writing_status_path = sys.argv[1:8]

def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")

def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)

def write_json(path, payload):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")

def run_command(args, timeout=45):
    try:
        result = subprocess.run(args, check=False, capture_output=True, text=False, timeout=timeout)
        stdout = result.stdout.decode("utf-8", errors="replace")
        stderr = result.stderr.decode("utf-8", errors="replace")
        return {
            "command": args,
            "exitCode": result.returncode,
            "stdout": stdout[:6000],
            "stderr": stderr[:3000],
            "timedOut": False,
        }
    except subprocess.TimeoutExpired as error:
        return {
            "command": args,
            "exitCode": None,
            "stdout": (error.stdout or b"").decode("utf-8", errors="replace")[:6000] if isinstance(error.stdout, bytes) else str(error.stdout or "")[:6000],
            "stderr": (error.stderr or b"").decode("utf-8", errors="replace")[:3000] if isinstance(error.stderr, bytes) else str(error.stderr or "")[:3000],
            "timedOut": True,
        }
    except Exception as error:
        return {
            "command": args,
            "exitCode": None,
            "stdout": "",
            "stderr": str(error),
            "timedOut": False,
        }

def mdls_plist(path):
    keys = [
        "kMDItemDurationSeconds",
        "kMDItemPixelWidth",
        "kMDItemPixelHeight",
        "kMDItemCodecs",
        "kMDItemAudioBitRate",
        "kMDItemVideoBitRate",
    ]
    args = ["/usr/bin/mdls", "-plist", "-"]
    for key in keys:
        args.extend(["-name", key])
    args.append(path)
    result = subprocess.run(args, check=False, capture_output=True)
    payload = {"available": result.returncode == 0, "stderr": result.stderr.decode("utf-8", errors="replace")[:3000]}
    if result.returncode == 0 and result.stdout.strip():
        try:
            payload["values"] = plistlib.loads(result.stdout)
        except Exception as error:
            payload["parseError"] = str(error)
            payload["raw"] = result.stdout.decode("utf-8", errors="replace")[:6000]
    return payload

def summarize_afinfo(text):
    keep = []
    patterns = (
        "File type ID:",
        "Num Tracks:",
        "Data format:",
        "estimated duration:",
        "audio bytes:",
        "audio packets:",
        "bit rate:",
        "packet size upper bound:",
        "maximum packet size:",
        "audio data file offset:",
        "source bit depth:",
    )
    for raw in text.splitlines():
        line = raw.strip()
        if any(line.startswith(pattern) for pattern in patterns):
            keep.append(line)
    return keep[:40]

def ql_thumbnail(path, artifact_id):
    os.makedirs(thumb_dir, exist_ok=True)
    before = set(os.listdir(thumb_dir))
    result = run_command(["/usr/bin/qlmanage", "-t", "-s", "900", "-o", thumb_dir, path], timeout=60)
    after = set(os.listdir(thumb_dir))
    new_files = sorted(after - before)
    candidate = None
    if new_files:
        candidate = os.path.join(thumb_dir, new_files[-1])
    else:
        stem = Path(path).name + ".png"
        possible = os.path.join(thumb_dir, stem)
        if os.path.exists(possible):
            candidate = possible
    normalized = None
    if candidate and os.path.exists(candidate):
        normalized = os.path.join(thumb_dir, f"{artifact_id}.png")
        if os.path.abspath(candidate) != os.path.abspath(normalized):
            try:
                os.replace(candidate, normalized)
            except Exception:
                normalized = candidate
    return {"thumbnailPath": normalized, "qlmanage": result}

proof = load_json(review_path)
review_artifacts = [
    item for item in proof.get("artifacts", [])
    if item.get("artifactId") in {"episode-16x9-master", "episode-9x16-master", "podcast-audio-master"}
]

artifacts = []
for item in review_artifacts:
    path = item.get("path") or ""
    artifact_id = item.get("artifactId") or "artifact"
    exists = os.path.exists(path)
    mdls = mdls_plist(path) if exists else {"available": False, "reason": "file-missing"}
    afinfo = run_command(["/usr/bin/afinfo", path], timeout=45) if exists else {"exitCode": None, "stdout": "", "stderr": "file missing"}
    thumbnail = None
    if exists and artifact_id != "podcast-audio-master":
        thumbnail = ql_thumbnail(path, artifact_id)
    artifacts.append({
        "artifactId": artifact_id,
        "path": path,
        "exists": exists,
        "openCommand": f"open {path}" if exists else None,
        "durationSecondsFromProof": item.get("durationSeconds"),
        "pixelWidthFromProof": item.get("pixelWidth"),
        "pixelHeightFromProof": item.get("pixelHeight"),
        "mdls": mdls,
        "afinfoSummary": summarize_afinfo(afinfo.get("stdout") or ""),
        "afinfoExitCode": afinfo.get("exitCode"),
        "afinfoTimedOut": afinfo.get("timedOut"),
        "afinfoStderr": afinfo.get("stderr"),
        "thumbnailPath": thumbnail.get("thumbnailPath") if thumbnail else None,
        "thumbnailCommandExitCode": thumbnail.get("qlmanage", {}).get("exitCode") if thumbnail else None,
        "reviewLimits": [
            "This assist packet does not prove the full artifact was watched.",
            "This assist packet does not prove audio is good end-to-end.",
            "QuickLook thumbnails are orientation/openability evidence only.",
        ],
    })

social_contact_sheet = "/Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-17-release-candidate/episode1-the-wednesday-rule-social-publication-queue/episode1-social-publication-contact-sheet.jpg"

packet = {
    "packetType": "quipsly-artifact-review-assist",
    "version": "2026-06-20.artifact-review-assist.v1",
    "projectSlug": proof.get("projectSlug", "high-ground-odyssey-manuscript"),
    "episodeSlug": proof.get("episodeSlug", "episode-1"),
    "generatedAt": now_iso(),
    "sourceProofReview": review_path,
    "status": "review-assist-generated-needs-human-or-delegated-review",
    "artifacts": artifacts,
    "socialShortsVisualEvidence": {
        "contactSheetPath": social_contact_sheet,
        "exists": os.path.exists(social_contact_sheet),
        "observation": "Contact sheet exists for social-short candidates; this supports visual-candidate existence, not posting approval.",
    },
    "reviewDecisionCommand": "script/agentctl.sh episode1-artifact-watch-review-decision pass|needs-review|needs-fix|reject [actor] [note]",
    "truth": "This assist packet gathers metadata, audio/container summaries, thumbnails, and open commands. It does not perform full watch/listen review, approve, publish, upload, schedule, or capture receipts.",
}

write_json(output_path, packet)

lines = [
    "# Episode 1 artifact review assist",
    "",
    f"Generated: {packet['generatedAt']}",
    "",
    "Status: `review-assist-generated-needs-human-or-delegated-review`",
    "",
    "This packet gathers machine-checkable evidence to make the real watch/listen review easier. It is not itself approval.",
    "",
    f"Source proof review: `{review_path}`",
    f"JSON packet: `{output_path}`",
    "",
    "## Artifacts",
    "",
]
for artifact in artifacts:
    lines.extend([
        f"### {artifact['artifactId']}",
        "",
        f"- Path: `{artifact['path']}`",
        f"- Exists: `{artifact['exists']}`",
        f"- Open command: `{artifact['openCommand']}`",
        f"- Duration from proof: `{artifact['durationSecondsFromProof']}`",
        f"- Dimensions from proof: `{artifact['pixelWidthFromProof']}x{artifact['pixelHeightFromProof']}`",
        f"- Thumbnail: `{artifact['thumbnailPath']}`",
        f"- afinfo exit: `{artifact['afinfoExitCode']}`",
        "",
    ])
    if artifact["afinfoSummary"]:
        lines.append("Audio/container summary:")
        lines.append("")
        for summary in artifact["afinfoSummary"]:
            lines.append(f"- {summary}")
        lines.append("")

lines.extend([
    "## Social-short visual evidence",
    "",
    f"- Contact sheet: `{social_contact_sheet}`",
    f"- Exists: `{os.path.exists(social_contact_sheet)}`",
    "- Meaning: visual candidates exist; selected shorts still need audio/visual review before posting.",
    "",
    "## Next action",
    "",
    "Open and review the artifacts, then record a decision:",
    "",
    "`script/agentctl.sh episode1-artifact-watch-review-decision pass|needs-review|needs-fix|reject [actor] [note]`",
    "",
])

os.makedirs(os.path.dirname(markdown_path) or ".", exist_ok=True)
with open(markdown_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines))
    handle.write("\n")

for path in (action_queue_path, studio_queue_path, writing_status_path):
    payload = load_json(path)
    payload["updatedAt"] = packet["generatedAt"]
    if path == action_queue_path:
        payload["currentArtifactReviewAssist"] = output_path
        payload["currentArtifactReviewAssistMarkdown"] = markdown_path
        payload.setdefault("operatorCommands", {})["generateArtifactReviewAssist"] = "script/agentctl.sh episode1-artifact-review-assist"
    elif path == studio_queue_path:
        payload["currentArtifactReviewAssist"] = output_path
        payload["currentArtifactReviewAssistMarkdown"] = markdown_path
        payload.setdefault("operatorCommands", {})["generateArtifactReviewAssist"] = "script/agentctl.sh episode1-artifact-review-assist"
    else:
        payload.setdefault("authoritativeArtifacts", {})["artifactReviewAssist"] = output_path
        payload.setdefault("authoritativeArtifacts", {})["artifactReviewAssistMarkdown"] = markdown_path
        payload.setdefault("operatorCommands", {})["generateArtifactReviewAssist"] = "script/agentctl.sh episode1-artifact-review-assist"
    write_json(path, payload)

    print(json.dumps({
    "packetType": "quipsly-artifact-review-assist-result",
    "status": packet["status"],
    "writtenTo": output_path,
    "markdown": markdown_path,
    "thumbnailDir": thumb_dir,
    "truth": packet["truth"],
}, indent=2, sort_keys=True))
PY
    ;;
  episode1-artifact-sampled-contact-sheets|artifact-sampled-contact-sheets|episode1-sampled-contact-sheets)
    output_dir="${2:-}"
    assist_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-assist.json"
    default_output_dir="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-sampled-contact-sheets"
    result_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-sampled-contact-sheets.json"
    markdown_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-sampled-contact-sheets.md"
    action_queue_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-publication-action-queue.json"
    studio_queue_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    writing_status_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-writing-loop-status.json"
    assist_path="$(cd "$(dirname "$assist_path")" && pwd)/$(basename "$assist_path")"
    default_output_dir="$(cd "$(dirname "$default_output_dir")" && pwd)/$(basename "$default_output_dir")"
    result_path="$(cd "$(dirname "$result_path")" && pwd)/$(basename "$result_path")"
    markdown_path="$(cd "$(dirname "$markdown_path")" && pwd)/$(basename "$markdown_path")"
    action_queue_path="$(cd "$(dirname "$action_queue_path")" && pwd)/$(basename "$action_queue_path")"
    studio_queue_path="$(cd "$(dirname "$studio_queue_path")" && pwd)/$(basename "$studio_queue_path")"
    writing_status_path="$(cd "$(dirname "$writing_status_path")" && pwd)/$(basename "$writing_status_path")"
    if [[ -z "$output_dir" ]]; then
      output_dir="$default_output_dir"
    fi
    mkdir -p "$output_dir"
    output_dir="$(cd "$output_dir" && pwd)"
    swift_file="$(mktemp -t quipsly-contact-sheet.XXXXXX.swift)"
    cat > "$swift_file" <<'SWIFT'
import Foundation
import AVFoundation
import AppKit

func loadJSON(_ path: String) throws -> [String: Any] {
    let data = try Data(contentsOf: URL(fileURLWithPath: path))
    return try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] ?? [:]
}

func savePNG(_ image: NSImage, to path: String) throws {
    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "QuipslyContactSheet", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not encode PNG"])
    }
    try png.write(to: URL(fileURLWithPath: path))
}

func fittedRect(imageSize: CGSize, inside rect: CGRect) -> CGRect {
    if imageSize.width <= 0 || imageSize.height <= 0 { return rect }
    let scale = min(rect.width / imageSize.width, rect.height / imageSize.height)
    let width = imageSize.width * scale
    let height = imageSize.height * scale
    return CGRect(x: rect.midX - width / 2, y: rect.midY - height / 2, width: width, height: height)
}

func timestamp(_ seconds: Double) -> String {
    let safe = max(0, Int(seconds.rounded()))
    return String(format: "%02d:%02d:%02d", safe / 3600, (safe % 3600) / 60, safe % 60)
}

func drawText(_ text: String, in rect: CGRect, fontSize: CGFloat = 18, color: NSColor = .white) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.monospacedSystemFont(ofSize: fontSize, weight: .semibold),
        .foregroundColor: color,
        .paragraphStyle: paragraph
    ]
    text.draw(in: rect, withAttributes: attrs)
}

let args = CommandLine.arguments
guard args.count >= 4 else {
    fputs("usage: swift contact.swift /assist.json /output-dir /result.json\n", stderr)
    exit(2)
}

let assistPath = args[1]
let outputDir = args[2]
let resultPath = args[3]
try FileManager.default.createDirectory(atPath: outputDir, withIntermediateDirectories: true)

let assist = try loadJSON(assistPath)
let artifacts = assist["artifacts"] as? [[String: Any]] ?? []
var outputArtifacts: [[String: Any]] = []

for artifact in artifacts {
    guard let artifactId = artifact["artifactId"] as? String,
          artifactId == "episode-16x9-master" || artifactId == "episode-9x16-master",
          let sourcePath = artifact["path"] as? String else {
        continue
    }
    let sourceURL = URL(fileURLWithPath: sourcePath)
    let exists = FileManager.default.fileExists(atPath: sourcePath)
    let duration = artifact["durationSecondsFromProof"] as? Double ?? 0
    var samples: [[String: Any]] = []
    var errors: [String] = []
    var images: [(Double, NSImage, String)] = []
    if exists && duration > 0 {
        let asset = AVURLAsset(url: sourceURL)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 720, height: 720)
        generator.requestedTimeToleranceBefore = CMTime(seconds: 1.5, preferredTimescale: 600)
        generator.requestedTimeToleranceAfter = CMTime(seconds: 1.5, preferredTimescale: 600)
        let sampleCount = 12
        for index in 0..<sampleCount {
            let seconds = duration * Double(index + 1) / Double(sampleCount + 1)
            let time = CMTime(seconds: seconds, preferredTimescale: 600)
            do {
                let cgImage = try generator.copyCGImage(at: time, actualTime: nil)
                let image = NSImage(cgImage: cgImage, size: NSSize(width: cgImage.width, height: cgImage.height))
                let samplePath = "\(outputDir)/\(artifactId)-sample-\(String(format: "%02d", index + 1)).png"
                try savePNG(image, to: samplePath)
                images.append((seconds, image, samplePath))
                samples.append([
                    "index": index + 1,
                    "requestedSeconds": seconds,
                    "timestamp": timestamp(seconds),
                    "path": samplePath
                ])
            } catch {
                errors.append("sample \(index + 1) at \(timestamp(seconds)): \(error.localizedDescription)")
            }
        }
    }
    let columns = 4
    let rows = 3
    let cellWidth: CGFloat = artifactId == "episode-9x16-master" ? 260 : 360
    let cellHeight: CGFloat = artifactId == "episode-9x16-master" ? 500 : 260
    let labelHeight: CGFloat = 34
    let margin: CGFloat = 24
    let sheetWidth = margin * 2 + CGFloat(columns) * cellWidth
    let sheetHeight = margin * 2 + CGFloat(rows) * (cellHeight + labelHeight) + 52
    let sheet = NSImage(size: NSSize(width: sheetWidth, height: sheetHeight))
    sheet.lockFocus()
    NSColor(calibratedRed: 0.04, green: 0.055, blue: 0.05, alpha: 1).setFill()
    NSBezierPath(rect: CGRect(x: 0, y: 0, width: sheetWidth, height: sheetHeight)).fill()
    drawText("\(artifactId) sampled review sheet", in: CGRect(x: margin, y: sheetHeight - 44, width: sheetWidth - margin * 2, height: 24), fontSize: 20, color: NSColor(calibratedRed: 0.84, green: 0.93, blue: 0.78, alpha: 1))
    for (idx, item) in images.enumerated() {
        let col = idx % columns
        let row = idx / columns
        let x = margin + CGFloat(col) * cellWidth
        let y = sheetHeight - 70 - CGFloat(row + 1) * (cellHeight + labelHeight)
        let frameRect = CGRect(x: x + 8, y: y + labelHeight, width: cellWidth - 16, height: cellHeight)
        NSColor.black.setFill()
        NSBezierPath(roundedRect: frameRect, xRadius: 10, yRadius: 10).fill()
        let imageRect = fittedRect(imageSize: item.1.size, inside: frameRect.insetBy(dx: 6, dy: 6))
        item.1.draw(in: imageRect)
        drawText(item.2.components(separatedBy: "/").last ?? timestamp(item.0), in: CGRect(x: x, y: y + 4, width: cellWidth, height: 18), fontSize: 9, color: NSColor.gray)
        drawText(timestamp(item.0), in: CGRect(x: x, y: y + 20, width: cellWidth, height: 18), fontSize: 14, color: NSColor(calibratedRed: 0.98, green: 0.84, blue: 0.24, alpha: 1))
    }
    sheet.unlockFocus()
    let sheetPath = "\(outputDir)/\(artifactId)-contact-sheet.png"
    if !images.isEmpty {
        try savePNG(sheet, to: sheetPath)
    }
    outputArtifacts.append([
        "artifactId": artifactId,
        "sourcePath": sourcePath,
        "exists": exists,
        "durationSeconds": duration,
        "sampleCountRequested": 12,
        "sampleCountWritten": samples.count,
        "samplePaths": samples,
        "contactSheetPath": images.isEmpty ? NSNull() : sheetPath,
        "errors": errors,
        "reviewLimits": [
            "Sampled contact sheets are visual coverage evidence, not full playback review.",
            "They do not prove audio quality.",
            "They do not approve publication."
        ]
    ])
}

let packet: [String: Any] = [
    "packetType": "quipsly-sampled-contact-sheets",
    "version": "2026-06-20.sampled-contact-sheets.v1",
    "projectSlug": assist["projectSlug"] ?? "high-ground-odyssey-manuscript",
    "episodeSlug": assist["episodeSlug"] ?? "episode-1",
    "generatedAt": ISO8601DateFormatter().string(from: Date()),
    "sourceAssistPacket": assistPath,
    "status": "sampled-contact-sheets-generated-needs-review",
    "outputDir": outputDir,
    "artifacts": outputArtifacts,
    "truth": "This packet samples frames from full-length exported artifacts for review assistance. It does not mutate source media, perform full watch/listen review, approve, publish, upload, schedule, or capture receipts."
]
let data = try JSONSerialization.data(withJSONObject: packet, options: [.prettyPrinted, .sortedKeys])
try data.write(to: URL(fileURLWithPath: resultPath))
print(String(data: data, encoding: .utf8) ?? "{}")
SWIFT
    /usr/bin/swift "$swift_file" "$assist_path" "$output_dir" "$result_path"
    swift_status=$?
    rm -f "$swift_file"
    if [[ $swift_status -ne 0 ]]; then
      exit "$swift_status"
    fi
    python3 - "$result_path" "$markdown_path" "$action_queue_path" "$studio_queue_path" "$writing_status_path" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

result_path, markdown_path, action_queue_path, studio_queue_path, writing_status_path = sys.argv[1:6]

def load(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)

def write(path, payload):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")

packet = load(result_path)
now = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
lines = [
    "# Episode 1 sampled contact sheets",
    "",
    f"Generated: {now}",
    "",
    "Status: `sampled-contact-sheets-generated-needs-review`",
    "",
    "These sheets sample frames across the full-length 16:9 and 9:16 exports. They are stronger visual coverage than a single thumbnail, but still not full playback or audio review.",
    "",
    f"JSON packet: `{result_path}`",
    f"Output folder: `{packet.get('outputDir')}`",
    "",
]
for artifact in packet.get("artifacts", []):
    lines.extend([
        f"## {artifact.get('artifactId')}",
        "",
        f"- Source: `{artifact.get('sourcePath')}`",
        f"- Contact sheet: `{artifact.get('contactSheetPath')}`",
        f"- Samples written: `{artifact.get('sampleCountWritten')}` / `{artifact.get('sampleCountRequested')}`",
        f"- Errors: `{len(artifact.get('errors') or [])}`",
        "",
    ])
    for error in artifact.get("errors") or []:
        lines.append(f"- Error: {error}")
    if artifact.get("errors"):
        lines.append("")
lines.extend([
    "## Review limits",
    "",
    "- These sheets do not prove audio quality.",
    "- These sheets do not prove pacing, ending, or full playback quality.",
    "- These sheets do not approve publication.",
    "",
])
with open(markdown_path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines))
    handle.write("\n")

for path in (action_queue_path, studio_queue_path, writing_status_path):
    payload = load(path)
    payload["updatedAt"] = now
    if path == action_queue_path:
        payload["currentSampledContactSheets"] = result_path
        payload["currentSampledContactSheetsMarkdown"] = markdown_path
        payload.setdefault("operatorCommands", {})["generateSampledContactSheets"] = "script/agentctl.sh episode1-artifact-sampled-contact-sheets"
    elif path == studio_queue_path:
        payload["currentSampledContactSheets"] = result_path
        payload["currentSampledContactSheetsMarkdown"] = markdown_path
        payload.setdefault("operatorCommands", {})["generateSampledContactSheets"] = "script/agentctl.sh episode1-artifact-sampled-contact-sheets"
    else:
        payload.setdefault("authoritativeArtifacts", {})["sampledContactSheets"] = result_path
        payload.setdefault("authoritativeArtifacts", {})["sampledContactSheetsMarkdown"] = markdown_path
        payload.setdefault("operatorCommands", {})["generateSampledContactSheets"] = "script/agentctl.sh episode1-artifact-sampled-contact-sheets"
    write(path, payload)
print(json.dumps({
    "packetType": "quipsly-sampled-contact-sheets-result",
    "status": packet.get("status"),
    "writtenTo": result_path,
    "markdown": markdown_path,
    "outputDir": packet.get("outputDir"),
    "truth": packet.get("truth"),
}, indent=2, sort_keys=True))
PY
    ;;
  episode1-artifact-sanity-review|artifact-sanity-review|episode1-machine-sanity-review)
    output_path="${2:-}"
    review_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-full-release-artifact-proof-review.json"
    default_output="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-machine-sanity-review.json"
    markdown_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-machine-sanity-review.md"
    action_queue_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-publication-action-queue.json"
    studio_queue_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    writing_status_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-writing-loop-status.json"
    worklog_path="$ROOT_DIR/../../docs/quipsly/quipslystudio-worklog.md"
    review_path="$(cd "$(dirname "$review_path")" && pwd)/$(basename "$review_path")"
    default_output="$(cd "$(dirname "$default_output")" && pwd)/$(basename "$default_output")"
    markdown_path="$(cd "$(dirname "$markdown_path")" && pwd)/$(basename "$markdown_path")"
    action_queue_path="$(cd "$(dirname "$action_queue_path")" && pwd)/$(basename "$action_queue_path")"
    studio_queue_path="$(cd "$(dirname "$studio_queue_path")" && pwd)/$(basename "$studio_queue_path")"
    writing_status_path="$(cd "$(dirname "$writing_status_path")" && pwd)/$(basename "$writing_status_path")"
    worklog_path="$(cd "$(dirname "$worklog_path")" && pwd)/$(basename "$worklog_path")"
    if [[ -z "$output_path" ]]; then
      output_path="$default_output"
    fi
    output_path="$(cd "$(dirname "$output_path")" && pwd)/$(basename "$output_path")"
    python3 "$SCRIPT_DIR/episode1_artifact_sanity_review.py" \
      "$review_path" \
      "$output_path" \
      "$markdown_path" \
      "$action_queue_path" \
      "$studio_queue_path" \
      "$writing_status_path" \
      "$worklog_path"
    ;;
  episode1-artifact-review-samples|artifact-review-samples|episode1-review-samples)
    output_dir="${2:-}"
    review_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-full-release-artifact-proof-review.json"
    default_output_dir="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-samples"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-samples.json"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-samples.md"
    action_queue_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-publication-action-queue.json"
    studio_queue_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    writing_status_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-writing-loop-status.json"
    review_path="$(cd "$(dirname "$review_path")" && pwd)/$(basename "$review_path")"
    default_output_dir="$(cd "$(dirname "$default_output_dir")" && pwd)/$(basename "$default_output_dir")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    action_queue_path="$(cd "$(dirname "$action_queue_path")" && pwd)/$(basename "$action_queue_path")"
    studio_queue_path="$(cd "$(dirname "$studio_queue_path")" && pwd)/$(basename "$studio_queue_path")"
    writing_status_path="$(cd "$(dirname "$writing_status_path")" && pwd)/$(basename "$writing_status_path")"
    if [[ -z "$output_dir" ]]; then
      output_dir="$default_output_dir"
    fi
    mkdir -p "$output_dir"
    output_dir="$(cd "$output_dir" && pwd)"
    python3 "$SCRIPT_DIR/episode1_artifact_review_samples.py" \
      "$review_path" \
      "$output_dir" \
      "$output_json" \
      "$output_md" \
      "$action_queue_path" \
      "$studio_queue_path" \
      "$writing_status_path"
    ;;
  episode1-artifact-review-station|artifact-review-station|episode1-review-station)
    output_html="${2:-}"
    samples_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-samples.json"
    sanity_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-machine-sanity-review.json"
    contact_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-sampled-contact-sheets.json"
    default_output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-station.html"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-station.json"
    action_queue_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-publication-action-queue.json"
    studio_queue_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    writing_status_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-writing-loop-status.json"
    worksheet_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review.md"
    samples_path="$(cd "$(dirname "$samples_path")" && pwd)/$(basename "$samples_path")"
    sanity_path="$(cd "$(dirname "$sanity_path")" && pwd)/$(basename "$sanity_path")"
    contact_path="$(cd "$(dirname "$contact_path")" && pwd)/$(basename "$contact_path")"
    default_output_html="$(cd "$(dirname "$default_output_html")" && pwd)/$(basename "$default_output_html")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    action_queue_path="$(cd "$(dirname "$action_queue_path")" && pwd)/$(basename "$action_queue_path")"
    studio_queue_path="$(cd "$(dirname "$studio_queue_path")" && pwd)/$(basename "$studio_queue_path")"
    writing_status_path="$(cd "$(dirname "$writing_status_path")" && pwd)/$(basename "$writing_status_path")"
    worksheet_path="$(cd "$(dirname "$worksheet_path")" && pwd)/$(basename "$worksheet_path")"
    if [[ -z "$output_html" ]]; then
      output_html="$default_output_html"
    fi
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    python3 "$SCRIPT_DIR/episode1_artifact_review_station.py" \
      "$samples_path" \
      "$sanity_path" \
      "$contact_path" \
      "$output_html" \
      "$output_json" \
      "$action_queue_path" \
      "$studio_queue_path" \
      "$writing_status_path" \
      "$worksheet_path"
    ;;
  episode1-tail-trim-candidate|tail-trim-candidate|episode1-tail-fix-candidate)
    output_dir="${2:-}"
    sanity_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-machine-sanity-review.json"
    default_output_dir="/Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-20-tail-trim-candidate"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-candidate.json"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-candidate.md"
    action_queue_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-publication-action-queue.json"
    studio_queue_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    writing_status_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-writing-loop-status.json"
    sanity_path="$(cd "$(dirname "$sanity_path")" && pwd)/$(basename "$sanity_path")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    action_queue_path="$(cd "$(dirname "$action_queue_path")" && pwd)/$(basename "$action_queue_path")"
    studio_queue_path="$(cd "$(dirname "$studio_queue_path")" && pwd)/$(basename "$studio_queue_path")"
    writing_status_path="$(cd "$(dirname "$writing_status_path")" && pwd)/$(basename "$writing_status_path")"
    if [[ -z "$output_dir" ]]; then
      output_dir="$default_output_dir"
    fi
    mkdir -p "$output_dir"
    output_dir="$(cd "$output_dir" && pwd)"
    python3 "$SCRIPT_DIR/episode1_tail_trim_candidate.py" \
      "$sanity_path" \
      "$output_dir" \
      "$output_json" \
      "$output_md" \
      "$action_queue_path" \
      "$studio_queue_path" \
      "$writing_status_path"
    ;;
  episode1-tail-trim-candidate-sanity|tail-trim-candidate-sanity|episode1-tail-sanity)
    candidate_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-candidate.json"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-candidate-sanity.json"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-candidate-sanity.md"
    action_queue_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-publication-action-queue.json"
    studio_queue_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    writing_status_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-writing-loop-status.json"
    candidate_path="$(cd "$(dirname "$candidate_path")" && pwd)/$(basename "$candidate_path")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    action_queue_path="$(cd "$(dirname "$action_queue_path")" && pwd)/$(basename "$action_queue_path")"
    studio_queue_path="$(cd "$(dirname "$studio_queue_path")" && pwd)/$(basename "$studio_queue_path")"
    writing_status_path="$(cd "$(dirname "$writing_status_path")" && pwd)/$(basename "$writing_status_path")"
    python3 "$SCRIPT_DIR/episode1_tail_trim_candidate_sanity.py" \
      "$candidate_path" \
      "$output_json" \
      "$output_md" \
      "$action_queue_path" \
      "$studio_queue_path" \
      "$writing_status_path"
    ;;
  episode1-tail-trim-promote|tail-trim-promote|episode1-tail-trim-promotion)
    decision="${2:-}"
    actor="${3:-Codex}"
    note="${4:-}"
    case "$decision" in
      promote-for-review|reject-candidate) ;;
      *)
        echo "usage: script/agentctl.sh episode1-tail-trim-promote promote-for-review|reject-candidate [actor] [note]" >&2
        exit 2
        ;;
    esac
    candidate_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-candidate.json"
    current_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-promotion-current.json"
    ledger_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-promotion-ledger.jsonl"
    action_queue_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-publication-action-queue.json"
    studio_queue_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    writing_status_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-writing-loop-status.json"
    review_station_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-station.json"
    candidate_path="$(cd "$(dirname "$candidate_path")" && pwd)/$(basename "$candidate_path")"
    current_path="$(cd "$(dirname "$current_path")" && pwd)/$(basename "$current_path")"
    ledger_path="$(cd "$(dirname "$ledger_path")" && pwd)/$(basename "$ledger_path")"
    action_queue_path="$(cd "$(dirname "$action_queue_path")" && pwd)/$(basename "$action_queue_path")"
    studio_queue_path="$(cd "$(dirname "$studio_queue_path")" && pwd)/$(basename "$studio_queue_path")"
    writing_status_path="$(cd "$(dirname "$writing_status_path")" && pwd)/$(basename "$writing_status_path")"
    review_station_path="$(cd "$(dirname "$review_station_path")" && pwd)/$(basename "$review_station_path")"
    python3 "$SCRIPT_DIR/episode1_tail_trim_promote.py" \
      "$candidate_path" \
      "$current_path" \
      "$ledger_path" \
      "$action_queue_path" \
      "$studio_queue_path" \
      "$writing_status_path" \
      "$review_station_path" \
      "$actor" \
      "$note" \
      "$decision"
    ;;
  episode1-artifact-review-status|artifact-review-status|episode1-review-status)
    format="${2:-}"
    review_station_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-station.json"
    tail_candidate_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-candidate.json"
    tail_sanity_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-candidate-sanity.json"
    tail_promotion_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-promotion-current.json"
    current_decision_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review-current.json"
    watch_ledger_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review-ledger.jsonl"
    action_queue_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-publication-action-queue.json"
    studio_queue_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-status.json"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-status.md"
    review_station_path="$(cd "$(dirname "$review_station_path")" && pwd)/$(basename "$review_station_path")"
    tail_candidate_path="$(cd "$(dirname "$tail_candidate_path")" && pwd)/$(basename "$tail_candidate_path")"
    tail_sanity_path="$(cd "$(dirname "$tail_sanity_path")" && pwd)/$(basename "$tail_sanity_path")"
    tail_promotion_path="$(cd "$(dirname "$tail_promotion_path")" && pwd)/$(basename "$tail_promotion_path")"
    current_decision_path="$(cd "$(dirname "$current_decision_path")" && pwd)/$(basename "$current_decision_path")"
    watch_ledger_path="$(cd "$(dirname "$watch_ledger_path")" && pwd)/$(basename "$watch_ledger_path")"
    action_queue_path="$(cd "$(dirname "$action_queue_path")" && pwd)/$(basename "$action_queue_path")"
    studio_queue_path="$(cd "$(dirname "$studio_queue_path")" && pwd)/$(basename "$studio_queue_path")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_artifact_review_status.py" \
        "$review_station_path" \
        "$tail_candidate_path" \
        "$tail_sanity_path" \
        "$tail_promotion_path" \
        "$current_decision_path" \
        "$watch_ledger_path" \
        "$action_queue_path" \
        "$studio_queue_path" \
        "$output_json" \
        "$output_md" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_artifact_review_status.py" \
        "$review_station_path" \
        "$tail_candidate_path" \
        "$tail_sanity_path" \
        "$tail_promotion_path" \
        "$current_decision_path" \
        "$watch_ledger_path" \
        "$action_queue_path" \
        "$studio_queue_path" \
        "$output_json" \
        "$output_md"
    fi
    ;;
  episode1-artifact-review-handoff|artifact-review-handoff|episode1-review-handoff)
    format="${2:-}"
    review_station_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-station.json"
    tail_candidate_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-candidate.json"
    tail_sanity_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-candidate-sanity.json"
    tail_promotion_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-promotion-current.json"
    current_decision_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review-current.json"
    watch_ledger_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review-ledger.jsonl"
    action_queue_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-publication-action-queue.json"
    studio_queue_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    status_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-status.json"
    status_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-status.md"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-handoff.json"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-handoff.md"
    review_station_path="$(cd "$(dirname "$review_station_path")" && pwd)/$(basename "$review_station_path")"
    tail_candidate_path="$(cd "$(dirname "$tail_candidate_path")" && pwd)/$(basename "$tail_candidate_path")"
    tail_sanity_path="$(cd "$(dirname "$tail_sanity_path")" && pwd)/$(basename "$tail_sanity_path")"
    tail_promotion_path="$(cd "$(dirname "$tail_promotion_path")" && pwd)/$(basename "$tail_promotion_path")"
    current_decision_path="$(cd "$(dirname "$current_decision_path")" && pwd)/$(basename "$current_decision_path")"
    watch_ledger_path="$(cd "$(dirname "$watch_ledger_path")" && pwd)/$(basename "$watch_ledger_path")"
    action_queue_path="$(cd "$(dirname "$action_queue_path")" && pwd)/$(basename "$action_queue_path")"
    studio_queue_path="$(cd "$(dirname "$studio_queue_path")" && pwd)/$(basename "$studio_queue_path")"
    status_json="$(cd "$(dirname "$status_json")" && pwd)/$(basename "$status_json")"
    status_md="$(cd "$(dirname "$status_md")" && pwd)/$(basename "$status_md")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    python3 "$SCRIPT_DIR/episode1_artifact_review_status.py" \
      "$review_station_path" \
      "$tail_candidate_path" \
      "$tail_sanity_path" \
      "$tail_promotion_path" \
      "$current_decision_path" \
      "$watch_ledger_path" \
      "$action_queue_path" \
      "$studio_queue_path" \
      "$status_json" \
      "$status_md" >/dev/null
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_artifact_review_handoff.py" \
        "$status_json" \
        "$review_station_path" \
        "$tail_candidate_path" \
        "$tail_sanity_path" \
        "$tail_promotion_path" \
        "$current_decision_path" \
        "$output_json" \
        "$output_md" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_artifact_review_handoff.py" \
        "$status_json" \
        "$review_station_path" \
        "$tail_candidate_path" \
        "$tail_sanity_path" \
        "$tail_promotion_path" \
        "$current_decision_path" \
        "$output_json" \
        "$output_md"
    fi
    ;;
  episode1-artifact-review-launch|artifact-review-launch|episode1-review-launch)
    format="${2:-}"
    case "$format" in
      ""|--json|--open) ;;
      *)
        echo "usage: script/agentctl.sh episode1-artifact-review-launch [--json|--open]" >&2
        exit 2
        ;;
    esac
    review_station_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-station.json"
    tail_candidate_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-candidate.json"
    tail_sanity_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-candidate-sanity.json"
    tail_promotion_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-promotion-current.json"
    current_decision_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review-current.json"
    watch_ledger_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review-ledger.jsonl"
    action_queue_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-publication-action-queue.json"
    studio_queue_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    status_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-status.json"
    status_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-status.md"
    handoff_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-handoff.json"
    handoff_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-handoff.md"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-launch-plan.json"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-launch-plan.md"
    review_station_path="$(cd "$(dirname "$review_station_path")" && pwd)/$(basename "$review_station_path")"
    tail_candidate_path="$(cd "$(dirname "$tail_candidate_path")" && pwd)/$(basename "$tail_candidate_path")"
    tail_sanity_path="$(cd "$(dirname "$tail_sanity_path")" && pwd)/$(basename "$tail_sanity_path")"
    tail_promotion_path="$(cd "$(dirname "$tail_promotion_path")" && pwd)/$(basename "$tail_promotion_path")"
    current_decision_path="$(cd "$(dirname "$current_decision_path")" && pwd)/$(basename "$current_decision_path")"
    watch_ledger_path="$(cd "$(dirname "$watch_ledger_path")" && pwd)/$(basename "$watch_ledger_path")"
    action_queue_path="$(cd "$(dirname "$action_queue_path")" && pwd)/$(basename "$action_queue_path")"
    studio_queue_path="$(cd "$(dirname "$studio_queue_path")" && pwd)/$(basename "$studio_queue_path")"
    status_json="$(cd "$(dirname "$status_json")" && pwd)/$(basename "$status_json")"
    status_md="$(cd "$(dirname "$status_md")" && pwd)/$(basename "$status_md")"
    handoff_json="$(cd "$(dirname "$handoff_json")" && pwd)/$(basename "$handoff_json")"
    handoff_md="$(cd "$(dirname "$handoff_md")" && pwd)/$(basename "$handoff_md")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    python3 "$SCRIPT_DIR/episode1_artifact_review_status.py" \
      "$review_station_path" \
      "$tail_candidate_path" \
      "$tail_sanity_path" \
      "$tail_promotion_path" \
      "$current_decision_path" \
      "$watch_ledger_path" \
      "$action_queue_path" \
      "$studio_queue_path" \
      "$status_json" \
      "$status_md" >/dev/null
    python3 "$SCRIPT_DIR/episode1_artifact_review_handoff.py" \
      "$status_json" \
      "$review_station_path" \
      "$tail_candidate_path" \
      "$tail_sanity_path" \
      "$tail_promotion_path" \
      "$current_decision_path" \
      "$handoff_json" \
      "$handoff_md" >/dev/null
    mode="--plan"
    if [[ "$format" == "--open" ]]; then
      mode="--open"
    fi
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_artifact_review_launcher.py" \
        "$handoff_json" \
        "$output_json" \
        "$output_md" \
        "$mode" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_artifact_review_launcher.py" \
        "$handoff_json" \
        "$output_json" \
        "$output_md" \
        "$mode"
    fi
    ;;
  episode1-tail-trim-ending-review|tail-trim-ending-review|episode1-ending-review-evidence)
    format="${2:-}"
    case "$format" in
      ""|--json) ;;
      *)
        echo "usage: script/agentctl.sh episode1-tail-trim-ending-review [--json]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-artifact-review-handoff --json >/dev/null
    handoff_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-handoff.json"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-ending-review-evidence.json"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-ending-review-evidence.md"
    evidence_dir="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-ending-review-evidence"
    handoff_json="$(cd "$(dirname "$handoff_json")" && pwd)/$(basename "$handoff_json")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    mkdir -p "$evidence_dir"
    evidence_dir="$(cd "$evidence_dir" && pwd)"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_tail_trim_ending_review.py" \
        "$handoff_json" \
        "$output_json" \
        "$output_md" \
        "$evidence_dir" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_tail_trim_ending_review.py" \
        "$handoff_json" \
        "$output_json" \
        "$output_md" \
        "$evidence_dir"
    fi
    ;;
  episode1-selected-artifact-review-station|selected-artifact-review-station|episode1-selected-review-station)
    format="${2:-}"
    case "$format" in
      ""|--json|--open) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-artifact-review-station [--json|--open]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-artifact-review-handoff --json >/dev/null
    "$0" episode1-tail-trim-ending-review --json >/dev/null
    promotion_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-promotion-current.json"
    handoff_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-handoff.json"
    evidence_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-ending-review-evidence.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-artifact-review-station.html"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-artifact-review-station.json"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-artifact-review-station.md"
    promotion_path="$(cd "$(dirname "$promotion_path")" && pwd)/$(basename "$promotion_path")"
    handoff_path="$(cd "$(dirname "$handoff_path")" && pwd)/$(basename "$handoff_path")"
    evidence_path="$(cd "$(dirname "$evidence_path")" && pwd)/$(basename "$evidence_path")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    mode="--plan"
    if [[ "$format" == "--open" ]]; then
      mode="--open"
    fi
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_artifact_review_station.py" \
        "$promotion_path" \
        "$handoff_path" \
        "$evidence_path" \
        "$output_html" \
        "$output_json" \
        "$output_md" \
        "$mode" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_artifact_review_station.py" \
        "$promotion_path" \
        "$handoff_path" \
        "$evidence_path" \
        "$output_html" \
        "$output_json" \
        "$output_md" \
        "$mode"
    fi
    ;;
  episode1-selected-artifact-review-assist|selected-artifact-review-assist|episode1-selected-review-assist)
    format="${2:-}"
    case "$format" in
      ""|--json) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-artifact-review-assist [--json]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-artifact-review-station --json >/dev/null
    station_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-artifact-review-station.json"
    output_dir="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-artifact-review-assist"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-artifact-review-assist.html"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-artifact-review-assist.json"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-artifact-review-assist.md"
    station_json="$(cd "$(dirname "$station_json")" && pwd)/$(basename "$station_json")"
    mkdir -p "$output_dir"
    output_dir="$(cd "$output_dir" && pwd)"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_artifact_review_assist.py" \
        "$station_json" \
        "$output_dir" \
        "$output_html" \
        "$output_json" \
        "$output_md" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_artifact_review_assist.py" \
        "$station_json" \
        "$output_dir" \
        "$output_html" \
        "$output_json" \
        "$output_md"
    fi
    ;;
  episode1-selected-watch-review-progress|selected-watch-review-progress|episode1-watch-review-progress)
    format="${2:-}"
    case "$format" in
      ""|--json|--html) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-watch-review-progress [--json|--html]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-artifact-review-station --json >/dev/null
    "$0" episode1-selected-artifact-review-assist --json >/dev/null
    station_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-artifact-review-station.json"
    assist_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-artifact-review-assist.json"
    current_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.json"
    ledger_jsonl="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress-ledger.jsonl"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.md"
    station_json="$(cd "$(dirname "$station_json")" && pwd)/$(basename "$station_json")"
    assist_json="$(cd "$(dirname "$assist_json")" && pwd)/$(basename "$assist_json")"
    current_json="$(cd "$(dirname "$current_json")" && pwd)/$(basename "$current_json")"
    ledger_jsonl="$(cd "$(dirname "$ledger_jsonl")" && pwd)/$(basename "$ledger_jsonl")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    python3 "$SCRIPT_DIR/episode1_selected_watch_review_progress.py" \
      "$station_json" \
      "$assist_json" \
      "$current_json" \
      "$ledger_jsonl" \
      "$output_html" \
      "$output_md" \
      status \
      Codex >/dev/null
    if [[ "$format" == "--html" ]]; then
      open "$output_html"
      echo "Selected watch/listen progress opened: $output_html"
    elif [[ "$format" == "--json" ]]; then
      cat "$current_json"
    else
      echo "Selected watch/listen progress written: $output_html"
      echo "Progress JSON: $current_json"
      echo "Review boundary: this is progress tracking, not approval."
    fi
    ;;
  episode1-selected-watch-review-mark|selected-watch-review-mark|episode1-watch-review-mark)
    target="${2:-}"
    status="${3:-}"
    actor="${4:-Codex}"
    note="${5:-}"
    if [[ -z "$target" || -z "$status" ]]; then
      echo "usage: script/agentctl.sh episode1-selected-watch-review-mark all:segment-001 pending|reviewed|issue|skip [actor] [note]" >&2
      exit 2
    fi
    case "$status" in
      pending|reviewed|issue|skip) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-watch-review-mark all:segment-001 pending|reviewed|issue|skip [actor] [note]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-watch-review-progress --json >/dev/null
    station_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-artifact-review-station.json"
    assist_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-artifact-review-assist.json"
    current_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.json"
    ledger_jsonl="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress-ledger.jsonl"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.md"
    station_json="$(cd "$(dirname "$station_json")" && pwd)/$(basename "$station_json")"
    assist_json="$(cd "$(dirname "$assist_json")" && pwd)/$(basename "$assist_json")"
    current_json="$(cd "$(dirname "$current_json")" && pwd)/$(basename "$current_json")"
    ledger_jsonl="$(cd "$(dirname "$ledger_jsonl")" && pwd)/$(basename "$ledger_jsonl")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    python3 "$SCRIPT_DIR/episode1_selected_watch_review_progress.py" \
      "$station_json" \
      "$assist_json" \
      "$current_json" \
      "$ledger_jsonl" \
      "$output_html" \
      "$output_md" \
      mark \
      "$actor" \
      "$target" \
      "$status" \
      "$note"
    ;;
  episode1-selected-segment-evidence|selected-segment-evidence|episode1-segment-evidence)
    format="${2:-}"
    case "$format" in
      ""|--json|--html) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-segment-evidence [--json|--html]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-watch-review-progress --json >/dev/null
    progress_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.json"
    output_dir="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-segment-evidence"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-segment-evidence.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-segment-evidence.html"
    progress_json="$(cd "$(dirname "$progress_json")" && pwd)/$(basename "$progress_json")"
    mkdir -p "$output_dir"
    output_dir="$(cd "$output_dir" && pwd)"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_segment_evidence.py" \
        "$progress_json" \
        "$output_dir" \
        "$output_json" \
        "$output_html" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_segment_evidence.py" \
        "$progress_json" \
        "$output_dir" \
        "$output_json" \
        "$output_html"
      if [[ "$format" == "--html" ]]; then
        open "$output_html"
      fi
    fi
    ;;
  episode1-selected-review-console|selected-review-console|episode1-review-console)
    format="${2:-}"
    case "$format" in
      ""|--json|--html) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-review-console [--json|--html]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-watch-review-progress --json >/dev/null
    "$0" episode1-selected-segment-evidence --json >/dev/null
    "$0" episode1-selected-quality-scan --json >/dev/null
    progress_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.json"
    evidence_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-segment-evidence.json"
    quality_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-quality-scan.json"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-console.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-console.html"
    progress_json="$(cd "$(dirname "$progress_json")" && pwd)/$(basename "$progress_json")"
    evidence_json="$(cd "$(dirname "$evidence_json")" && pwd)/$(basename "$evidence_json")"
    quality_json="$(cd "$(dirname "$quality_json")" && pwd)/$(basename "$quality_json")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_review_console.py" \
        "$progress_json" \
        "$evidence_json" \
        "$quality_json" \
        "$output_json" \
        "$output_html" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_review_console.py" \
        "$progress_json" \
        "$evidence_json" \
        "$quality_json" \
        "$output_json" \
        "$output_html"
      if [[ "$format" == "--html" ]]; then
        open "$output_html"
      fi
    fi
    ;;
  episode1-selected-quality-scan|selected-quality-scan|episode1-quality-scan)
    format="${2:-}"
    case "$format" in
      ""|--json|--html) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-quality-scan [--json|--html]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-segment-evidence --json >/dev/null
    evidence_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-segment-evidence.json"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-quality-scan.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-quality-scan.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-quality-scan.md"
    evidence_json="$(cd "$(dirname "$evidence_json")" && pwd)/$(basename "$evidence_json")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_quality_scan.py" \
        "$evidence_json" \
        "$output_json" \
        "$output_html" \
        "$output_md" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_quality_scan.py" \
        "$evidence_json" \
        "$output_json" \
        "$output_html" \
        "$output_md"
      if [[ "$format" == "--html" ]]; then
        open "$output_html"
      fi
    fi
    ;;
  episode1-selected-quality-triage|selected-quality-triage|episode1-quality-triage)
    format="${2:-}"
    case "$format" in
      ""|--json|--html) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-quality-triage [--json|--html]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-quality-scan --json >/dev/null
    scan_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-quality-scan.json"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-quality-triage.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-quality-triage.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-quality-triage.md"
    scan_json="$(cd "$(dirname "$scan_json")" && pwd)/$(basename "$scan_json")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_quality_triage.py" \
        "$scan_json" \
        "$output_json" \
        "$output_html" \
        "$output_md" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_quality_triage.py" \
        "$scan_json" \
        "$output_json" \
        "$output_html" \
        "$output_md"
      if [[ "$format" == "--html" ]]; then
        open "$output_html"
      fi
    fi
    ;;
  episode1-selected-review-next|selected-review-next|episode1-review-next)
    format="${2:-}"
    case "$format" in
      ""|--json|--html) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-review-next [--json|--html]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-review-console --json >/dev/null
    "$0" episode1-selected-quality-triage --json >/dev/null
    progress_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.json"
    triage_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-quality-triage.json"
    console_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-console.json"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-next.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-next.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-next.md"
    progress_json="$(cd "$(dirname "$progress_json")" && pwd)/$(basename "$progress_json")"
    triage_json="$(cd "$(dirname "$triage_json")" && pwd)/$(basename "$triage_json")"
    console_json="$(cd "$(dirname "$console_json")" && pwd)/$(basename "$console_json")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_review_next.py" \
        "$progress_json" \
        "$triage_json" \
        "$console_json" \
        "$output_json" \
        "$output_html" \
        "$output_md" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_review_next.py" \
        "$progress_json" \
        "$triage_json" \
        "$console_json" \
        "$output_json" \
        "$output_html" \
        "$output_md"
      if [[ "$format" == "--html" ]]; then
        open "$output_html"
      fi
    fi
    ;;
  episode1-selected-segment-review-pack|selected-segment-review-pack|episode1-review-pack)
    format=""
    segment_id=""
    shift || true
    while [[ $# -gt 0 ]]; do
      case "${1:-}" in
        --json|--html)
          format="$1"
          ;;
        segment-*)
          segment_id="$1"
          ;;
        *)
          echo "usage: script/agentctl.sh episode1-selected-segment-review-pack [segment-001] [--json|--html]" >&2
          exit 2
          ;;
      esac
      shift || true
    done
    "$0" episode1-selected-review-next --json >/dev/null
    next_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-next.json"
    progress_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.json"
    output_dir="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-segment-review-pack"
    next_json="$(cd "$(dirname "$next_json")" && pwd)/$(basename "$next_json")"
    progress_json="$(cd "$(dirname "$progress_json")" && pwd)/$(basename "$progress_json")"
    mkdir -p "$output_dir"
    output_dir="$(cd "$output_dir" && pwd)"
    if [[ -n "$segment_id" ]]; then
      output_json="$output_dir/${segment_id}-review-pack.json"
      output_html="$output_dir/${segment_id}-review-pack.html"
      output_md="$output_dir/${segment_id}-review-pack.md"
    else
      output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-segment-review-pack.json"
      output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-segment-review-pack.html"
      output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-segment-review-pack.md"
    fi
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_segment_review_pack.py" \
        "$next_json" \
        "$progress_json" \
        "$output_dir" \
        "$output_json" \
        "$output_html" \
        "$output_md" \
        ${segment_id:+"$segment_id"} >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_segment_review_pack.py" \
        "$next_json" \
        "$progress_json" \
        "$output_dir" \
        "$output_json" \
        "$output_html" \
        "$output_md" \
        ${segment_id:+"$segment_id"}
      if [[ "$format" == "--html" ]]; then
        open "$output_html"
      fi
    fi
    ;;
  episode1-selected-all-segment-review-packs|selected-all-segment-review-packs|episode1-all-review-packs)
    format="${2:-}"
    case "$format" in
      ""|--json) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-all-segment-review-packs [--json]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-watch-review-progress --json >/dev/null
    progress_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.json"
    progress_json="$(cd "$(dirname "$progress_json")" && pwd)/$(basename "$progress_json")"
    review_segments=()
    while IFS= read -r review_segment_id; do
      review_segments+=("$review_segment_id")
    done < <(python3 - "$progress_json" <<'PY'
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as handle:
    progress = json.load(handle)
for segment in progress.get("segments") or []:
    segment_id = segment.get("segmentId")
    if segment_id:
        print(segment_id)
PY
)
    generated=()
    for review_segment in "${review_segments[@]}"; do
      echo "Preparing focused review pack for $review_segment..." >&2
      "$0" episode1-selected-segment-review-pack "$review_segment" --json >/dev/null
      generated+=("$review_segment")
    done
    python3 - "${generated[@]}" <<'PY'
import json
import os
import sys
base = "/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-selected-segment-review-pack"
segments = sys.argv[1:]
packets = []
for segment in segments:
    path = os.path.join(base, f"{segment}-review-pack.json")
    packets.append({
        "segmentId": segment,
        "json": path,
        "html": os.path.join(base, f"{segment}-review-pack.html"),
        "exists": os.path.exists(path),
    })
print(json.dumps({
    "packetType": "quipsly-episode1-selected-all-segment-review-packs-result",
    "segmentCount": len(segments),
    "segments": packets,
    "truth": "This command prepares durable focused review trays. It does not review media, approve artifacts, publish, upload, schedule, or capture receipts.",
}, indent=2, sort_keys=True))
PY
    ;;
  episode1-selected-review-index|selected-review-index|episode1-review-index)
    format="${2:-}"
    case "$format" in
      ""|--json|--html) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-review-index [--json|--html]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-review-next --json >/dev/null
    progress_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.json"
    next_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-next.json"
    pack_dir="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-segment-review-pack"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-index.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-index.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-index.md"
    progress_json="$(cd "$(dirname "$progress_json")" && pwd)/$(basename "$progress_json")"
    next_json="$(cd "$(dirname "$next_json")" && pwd)/$(basename "$next_json")"
    mkdir -p "$pack_dir"
    pack_dir="$(cd "$pack_dir" && pwd)"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_review_index.py" \
        "$progress_json" \
        "$pack_dir" \
        "$next_json" \
        "$output_json" \
        "$output_html" \
        "$output_md" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_review_index.py" \
        "$progress_json" \
        "$pack_dir" \
        "$next_json" \
        "$output_json" \
        "$output_html" \
        "$output_md"
      if [[ "$format" == "--html" ]]; then
        open "$output_html"
      fi
    fi
    ;;
  episode1-selected-review-notes|selected-review-notes|episode1-review-notes)
    format="${2:-}"
    case "$format" in
      ""|--json|--html) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-review-notes [--json|--html]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-review-cockpit --json >/dev/null
    cockpit_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-cockpit.json"
    notes_jsonl="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-notes-ledger.jsonl"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-notes.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-notes.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-notes.md"
    cockpit_json="$(cd "$(dirname "$cockpit_json")" && pwd)/$(basename "$cockpit_json")"
    notes_jsonl="$(cd "$(dirname "$notes_jsonl")" && pwd)/$(basename "$notes_jsonl")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_review_notes.py" \
        "$cockpit_json" "$notes_jsonl" "$output_json" "$output_html" "$output_md" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_review_notes.py" \
        "$cockpit_json" "$notes_jsonl" "$output_json" "$output_html" "$output_md"
      if [[ "$format" == "--html" ]]; then
        open "$output_html"
      fi
    fi
    ;;
  episode1-selected-review-note-add|selected-review-note-add|episode1-review-note-add)
    actor="${2:-Codex}"
    scope="${3:-observation}"
    note="${4:-}"
    if [[ -z "$note" ]]; then
      echo "usage: script/agentctl.sh episode1-selected-review-note-add \"Actor\" \"scope\" \"observation\"" >&2
      exit 2
    fi
    "$0" episode1-selected-review-cockpit --json >/dev/null
    cockpit_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-cockpit.json"
    notes_jsonl="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-notes-ledger.jsonl"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-notes.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-notes.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-notes.md"
    cockpit_json="$(cd "$(dirname "$cockpit_json")" && pwd)/$(basename "$cockpit_json")"
    notes_jsonl="$(cd "$(dirname "$notes_jsonl")" && pwd)/$(basename "$notes_jsonl")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    python3 "$SCRIPT_DIR/episode1_selected_review_notes.py" \
      "$cockpit_json" "$notes_jsonl" "$output_json" "$output_html" "$output_md" \
      --add "$actor" "$scope" "$note" >/dev/null
    cat "$output_json"
    ;;

  episode1-selected-review-session|selected-review-session|episode1-review-session)
    format="${2:-}"
    case "$format" in
      ""|--json|--html) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-review-session [--json|--html]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-review-cockpit --json >/dev/null
    "$0" episode1-selected-review-notes --json >/dev/null
    "$0" episode1-selected-machine-review-summary --json >/dev/null
    cockpit_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-cockpit.json"
    notes_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-notes.json"
    summary_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-machine-review-summary.json"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session.md"
    cockpit_json="$(cd "$(dirname "$cockpit_json")" && pwd)/$(basename "$cockpit_json")"
    notes_json="$(cd "$(dirname "$notes_json")" && pwd)/$(basename "$notes_json")"
    summary_json="$(cd "$(dirname "$summary_json")" && pwd)/$(basename "$summary_json")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_review_session.py" \
        "$cockpit_json" "$notes_json" "$summary_json" "$output_json" "$output_html" "$output_md" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_review_session.py" \
        "$cockpit_json" "$notes_json" "$summary_json" "$output_json" "$output_html" "$output_md"
      if [[ "$format" == "--html" ]]; then
        open "$output_html"
      fi
    fi
    ;;

  episode1-selected-review-session-draft|selected-review-session-draft|episode1-review-session-draft)
    format="${2:-}"
    case "$format" in
      ""|--json|--html) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-review-session-draft [--json|--html]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-review-session --json >/dev/null
    session_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session.json"
    ledger_jsonl="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session-draft-ledger.jsonl"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session-draft.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session-draft.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session-draft.md"
    session_json="$(cd "$(dirname "$session_json")" && pwd)/$(basename "$session_json")"
    ledger_jsonl="$(cd "$(dirname "$ledger_jsonl")" && pwd)/$(basename "$ledger_jsonl")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_review_session_draft.py" \
        "$session_json" "$ledger_jsonl" "$output_json" "$output_html" "$output_md" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_review_session_draft.py" \
        "$session_json" "$ledger_jsonl" "$output_json" "$output_html" "$output_md"
      if [[ "$format" == "--html" ]]; then
        open "$output_html"
      fi
    fi
    ;;

  episode1-selected-review-session-draft-add|selected-review-session-draft-add|episode1-review-session-draft-add)
    actor="${2:-}"
    kind="${3:-}"
    target="${4:-}"
    text="${5:-}"
    if [[ -z "$actor" || -z "$kind" || -z "$target" || -z "$text" ]]; then
      echo 'usage: script/agentctl.sh episode1-selected-review-session-draft-add "Actor" check|answer|note|recommendation|issue "target" "response text"' >&2
      exit 2
    fi
    "$0" episode1-selected-review-session --json >/dev/null
    session_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session.json"
    ledger_jsonl="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session-draft-ledger.jsonl"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session-draft.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session-draft.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session-draft.md"
    session_json="$(cd "$(dirname "$session_json")" && pwd)/$(basename "$session_json")"
    ledger_jsonl="$(cd "$(dirname "$ledger_jsonl")" && pwd)/$(basename "$ledger_jsonl")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    python3 "$SCRIPT_DIR/episode1_selected_review_session_draft.py" \
      "$session_json" "$ledger_jsonl" "$output_json" "$output_html" "$output_md" \
      --add "$actor" "$kind" "$target" "$text" >/dev/null
    cat "$output_json"
    ;;

  episode1-selected-review-handoff|selected-review-handoff|episode1-review-handoff)
    format="${2:-}"
    case "$format" in
      ""|--json|--html) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-review-handoff [--json|--html]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-review-session --json >/dev/null
    "$0" episode1-selected-review-session-draft --json >/dev/null
    session_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session.json"
    draft_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session-draft.json"
    progress_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.json"
    brief_json="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-vertical-slice-brief.json"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-handoff.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-handoff.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-handoff.md"
    session_json="$(cd "$(dirname "$session_json")" && pwd)/$(basename "$session_json")"
    draft_json="$(cd "$(dirname "$draft_json")" && pwd)/$(basename "$draft_json")"
    progress_json="$(cd "$(dirname "$progress_json")" && pwd)/$(basename "$progress_json")"
    brief_json="$(cd "$(dirname "$brief_json")" && pwd)/$(basename "$brief_json")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_review_handoff.py" \
        "$session_json" "$draft_json" "$progress_json" "$brief_json" "$output_json" "$output_html" "$output_md" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_review_handoff.py" \
        "$session_json" "$draft_json" "$progress_json" "$brief_json" "$output_json" "$output_html" "$output_md"
      if [[ "$format" == "--html" ]]; then
        open "$output_html"
      fi
    fi
    ;;

  episode1-selected-review-worksheet|selected-review-worksheet|episode1-review-worksheet)
    format="${2:-}"
    case "$format" in
      ""|--json|--html|--md) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-review-worksheet [--json|--html|--md]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-review-handoff --json >/dev/null
    handoff_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-handoff.json"
    session_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session.json"
    draft_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session-draft.json"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-worksheet.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-worksheet.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-worksheet.md"
    handoff_json="$(cd "$(dirname "$handoff_json")" && pwd)/$(basename "$handoff_json")"
    session_json="$(cd "$(dirname "$session_json")" && pwd)/$(basename "$session_json")"
    draft_json="$(cd "$(dirname "$draft_json")" && pwd)/$(basename "$draft_json")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_review_worksheet.py" \
        "$handoff_json" "$session_json" "$draft_json" "$output_json" "$output_html" "$output_md" >/dev/null
      cat "$output_json"
    elif [[ "$format" == "--md" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_review_worksheet.py" \
        "$handoff_json" "$session_json" "$draft_json" "$output_json" "$output_html" "$output_md" >/dev/null
      cat "$output_md"
    else
      python3 "$SCRIPT_DIR/episode1_selected_review_worksheet.py" \
        "$handoff_json" "$session_json" "$draft_json" "$output_json" "$output_html" "$output_md"
      if [[ "$format" == "--html" ]]; then
        open "$output_html"
      fi
    fi
    ;;

  episode1-current-next|episode1-current-next-fast|current-next-fast|episode1-fast-board)
    format="${2:-}"
    case "$format" in
      ""|--json|--html|--md) ;;
      *)
        echo "usage: script/agentctl.sh episode1-current-next [--json|--html|--md]" >&2
        exit 2
        ;;
    esac
    brief_json="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-vertical-slice-brief.json"
    handoff_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-handoff.json"
    draft_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session-draft.json"
    progress_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.json"
    output_json="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-current-next-fast.json"
    output_html="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-current-next-fast.html"
    output_md="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-current-next-fast.md"
    brief_json="$(cd "$(dirname "$brief_json")" && pwd)/$(basename "$brief_json")"
    handoff_json="$(cd "$(dirname "$handoff_json")" && pwd)/$(basename "$handoff_json")"
    draft_json="$(cd "$(dirname "$draft_json")" && pwd)/$(basename "$draft_json")"
    progress_json="$(cd "$(dirname "$progress_json")" && pwd)/$(basename "$progress_json")"
    mkdir -p "$(dirname "$output_json")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" || -z "$format" ]]; then
      python3 "$SCRIPT_DIR/episode1_current_next_fast.py" \
        "$brief_json" "$handoff_json" "$draft_json" "$progress_json" \
        "$output_json" "$output_html" "$output_md" >/dev/null
      cat "$output_json"
    elif [[ "$format" == "--md" ]]; then
      python3 "$SCRIPT_DIR/episode1_current_next_fast.py" \
        "$brief_json" "$handoff_json" "$draft_json" "$progress_json" \
        "$output_json" "$output_html" "$output_md" >/dev/null
      cat "$output_md"
    else
      python3 "$SCRIPT_DIR/episode1_current_next_fast.py" \
        "$brief_json" "$handoff_json" "$draft_json" "$progress_json" \
        "$output_json" "$output_html" "$output_md"
      open "$output_html"
    fi
    ;;

  episode1-mako-review-brief|mako-review-brief|episode1-editor-review-brief)
    format="${2:-}"
    case "$format" in
      ""|--json|--html|--md) ;;
      *)
        echo "usage: script/agentctl.sh episode1-mako-review-brief [--json|--html|--md]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-current-next --json >/dev/null
    "$0" episode1-selected-review-worksheet --json >/dev/null
    current_next_json="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-current-next-fast.json"
    handoff_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-handoff.json"
    worksheet_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-worksheet.json"
    draft_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session-draft.json"
    output_json="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-mako-review-brief.json"
    output_html="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-mako-review-brief.html"
    output_md="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-mako-review-brief.md"
    current_next_json="$(cd "$(dirname "$current_next_json")" && pwd)/$(basename "$current_next_json")"
    handoff_json="$(cd "$(dirname "$handoff_json")" && pwd)/$(basename "$handoff_json")"
    worksheet_json="$(cd "$(dirname "$worksheet_json")" && pwd)/$(basename "$worksheet_json")"
    draft_json="$(cd "$(dirname "$draft_json")" && pwd)/$(basename "$draft_json")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" || -z "$format" ]]; then
      python3 "$SCRIPT_DIR/episode1_mako_review_brief.py" \
        "$current_next_json" "$handoff_json" "$worksheet_json" "$draft_json" \
        "$output_json" "$output_html" "$output_md" >/dev/null
      cat "$output_json"
    elif [[ "$format" == "--md" ]]; then
      python3 "$SCRIPT_DIR/episode1_mako_review_brief.py" \
        "$current_next_json" "$handoff_json" "$worksheet_json" "$draft_json" \
        "$output_json" "$output_html" "$output_md" >/dev/null
      cat "$output_md"
    else
      python3 "$SCRIPT_DIR/episode1_mako_review_brief.py" \
        "$current_next_json" "$handoff_json" "$worksheet_json" "$draft_json" \
        "$output_json" "$output_html" "$output_md"
      open "$output_html"
    fi
    ;;

  episode1-mako-review-note|mako-review-note|episode1-editor-review-note)
    dry_run="false"
    if [[ "${2:-}" == "--dry-run" ]]; then
      dry_run="true"
      shift
    fi
    outcome="${2:-}"
    category="${3:-}"
    target="${4:-}"
    text="${5:-}"
    case "$outcome" in
      looks-good|needs-edit|blocked|note) ;;
      *)
        echo 'usage: script/agentctl.sh episode1-mako-review-note [--dry-run] looks-good|needs-edit|blocked|note overall|cut|crop|audio|caption|pace|media|tool|other target "note text"' >&2
        exit 2
        ;;
    esac
    case "$category" in
      overall|cut|crop|audio|caption|pace|media|tool|other) ;;
      *)
        echo 'usage: script/agentctl.sh episode1-mako-review-note [--dry-run] looks-good|needs-edit|blocked|note overall|cut|crop|audio|caption|pace|media|tool|other target "note text"' >&2
        exit 2
        ;;
    esac
    if [[ -z "$target" || -z "$text" ]]; then
      echo 'usage: script/agentctl.sh episode1-mako-review-note [--dry-run] looks-good|needs-edit|blocked|note overall|cut|crop|audio|caption|pace|media|tool|other target "note text"' >&2
      exit 2
    fi
    mako_target="mako:${outcome}:${category}:${target}"
    if [[ "$dry_run" == "true" ]]; then
      python3 - "$outcome" "$category" "$target" "$text" "$mako_target" <<'PY'
import json
import sys

outcome, category, target, text, mako_target = sys.argv[1:6]
print(json.dumps({
    "packetType": "quipsly-mako-review-note-dry-run",
    "truth": "Dry run only. No draft review ledger row was written.",
    "actor": "Mako",
    "kind": "note",
    "outcome": outcome,
    "category": category,
    "target": target,
    "draftTarget": mako_target,
    "text": text,
    "writeCommand": f'script/agentctl.sh episode1-mako-review-note {outcome} {category} {target} "{text}"',
}, indent=2, sort_keys=True))
PY
      exit 0
    fi
    "$0" episode1-selected-review-session-draft-add "Mako" note "$mako_target" "$text" >/dev/null
    "$0" episode1-mako-review-brief --json
    ;;

  episode1-selected-machine-review-summary|selected-machine-review-summary|episode1-machine-review-summary)
    format="${2:-}"
    case "$format" in
      ""|--json|--html) ;;
      *)
        echo "usage: script/agentctl.sh episode1-selected-machine-review-summary [--json|--html]" >&2
        exit 2
        ;;
    esac
    "$0" episode1-selected-review-cockpit --json >/dev/null
    "$0" episode1-selected-review-notes --json >/dev/null
    cockpit_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-cockpit.json"
    notes_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-notes.json"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-machine-review-summary.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-machine-review-summary.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-machine-review-summary.md"
    cockpit_json="$(cd "$(dirname "$cockpit_json")" && pwd)/$(basename "$cockpit_json")"
    notes_json="$(cd "$(dirname "$notes_json")" && pwd)/$(basename "$notes_json")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_machine_review_summary.py" \
        "$cockpit_json" "$notes_json" "$output_json" "$output_html" "$output_md" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_machine_review_summary.py" \
        "$cockpit_json" "$notes_json" "$output_json" "$output_html" "$output_md"
      if [[ "$format" == "--html" ]]; then
        open "$output_html"
      fi
    fi
    ;;

  episode1-selected-review-cockpit|selected-review-cockpit|episode1-review-cockpit)
    format=""
    refresh="false"
    shift || true
    while [[ $# -gt 0 ]]; do
      case "${1:-}" in
        --json|--html)
          format="$1"
          ;;
        --refresh)
          refresh="true"
          ;;
        *)
          echo "usage: script/agentctl.sh episode1-selected-review-cockpit [--json|--html] [--refresh]" >&2
          exit 2
          ;;
      esac
      shift || true
    done
    gate_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-gate.json"
    next_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-next.json"
    index_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-index.json"
    pack_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-segment-review-pack.json"
    output_json="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-cockpit.json"
    output_html="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-cockpit.html"
    output_md="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-cockpit.md"
    gate_json="$(cd "$(dirname "$gate_json")" && pwd)/$(basename "$gate_json")"
    next_json="$(cd "$(dirname "$next_json")" && pwd)/$(basename "$next_json")"
    index_json="$(cd "$(dirname "$index_json")" && pwd)/$(basename "$index_json")"
    pack_json="$(cd "$(dirname "$pack_json")" && pwd)/$(basename "$pack_json")"
    output_json="$(cd "$(dirname "$output_json")" && pwd)/$(basename "$output_json")"
    output_html="$(cd "$(dirname "$output_html")" && pwd)/$(basename "$output_html")"
    output_md="$(cd "$(dirname "$output_md")" && pwd)/$(basename "$output_md")"
    if [[ "$refresh" == "true" ]]; then
      "$0" episode1-selected-segment-review-pack --json >/dev/null
      "$0" episode1-selected-review-gate --json >/dev/null
    else
      if [[ ! -f "$gate_json" ]]; then
        "$0" episode1-selected-review-gate --json >/dev/null
      fi
      if [[ ! -f "$pack_json" ]]; then
        "$0" episode1-selected-segment-review-pack --json >/dev/null
      fi
      if [[ ! -f "$next_json" ]]; then
        "$0" episode1-selected-review-next --json >/dev/null
      fi
      if [[ ! -f "$index_json" ]]; then
        "$0" episode1-selected-review-index --json >/dev/null
      fi
    fi
    if [[ "$format" == "--json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_review_cockpit.py" \
        "$gate_json" "$next_json" "$index_json" "$pack_json" \
        "$output_json" "$output_html" "$output_md" >/dev/null
      cat "$output_json"
    else
      python3 "$SCRIPT_DIR/episode1_selected_review_cockpit.py" \
        "$gate_json" "$next_json" "$index_json" "$pack_json" \
        "$output_json" "$output_html" "$output_md"
      if [[ "$format" == "--html" ]]; then
        open "$output_html"
      fi
    fi
    ;;

  episode1-artifact-watch-review-decision|artifact-watch-review-decision|episode1-watch-listen-review-decision)
    decision="${2:-}"
    actor="${3:-Codex}"
    note="${4:-}"
    case "$decision" in
      pass|needs-review|needs-fix|reject) ;;
      *)
        echo "usage: script/agentctl.sh episode1-artifact-watch-review-decision pass|needs-review|needs-fix|reject [actor] [note]" >&2
        exit 2
        ;;
    esac
    review_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-full-release-artifact-proof-review.json"
    sheet_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review.md"
    ledger_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review-ledger.jsonl"
    current_decision_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review-current.json"
    selected_artifact_set_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-promotion-current.json"
    tail_sanity_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-candidate-sanity.json"
    action_queue_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-publication-action-queue.json"
    studio_queue_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    writing_status_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-writing-loop-status.json"
    selected_watch_review_progress_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.json"
    "$0" episode1-selected-watch-review-progress --json >/dev/null
    review_path="$(cd "$(dirname "$review_path")" && pwd)/$(basename "$review_path")"
    sheet_path="$(cd "$(dirname "$sheet_path")" && pwd)/$(basename "$sheet_path")"
    ledger_path="$(cd "$(dirname "$ledger_path")" && pwd)/$(basename "$ledger_path")"
    current_decision_path="$(cd "$(dirname "$current_decision_path")" && pwd)/$(basename "$current_decision_path")"
    selected_artifact_set_path="$(cd "$(dirname "$selected_artifact_set_path")" && pwd)/$(basename "$selected_artifact_set_path")"
    tail_sanity_path="$(cd "$(dirname "$tail_sanity_path")" && pwd)/$(basename "$tail_sanity_path")"
    action_queue_path="$(cd "$(dirname "$action_queue_path")" && pwd)/$(basename "$action_queue_path")"
    studio_queue_path="$(cd "$(dirname "$studio_queue_path")" && pwd)/$(basename "$studio_queue_path")"
    writing_status_path="$(cd "$(dirname "$writing_status_path")" && pwd)/$(basename "$writing_status_path")"
    selected_watch_review_progress_path="$(cd "$(dirname "$selected_watch_review_progress_path")" && pwd)/$(basename "$selected_watch_review_progress_path")"
    python3 - "$decision" "$actor" "$note" "$review_path" "$sheet_path" "$ledger_path" "$current_decision_path" "$selected_artifact_set_path" "$tail_sanity_path" "$action_queue_path" "$studio_queue_path" "$writing_status_path" "$selected_watch_review_progress_path" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

decision, actor, note, review_path, sheet_path, ledger_path, current_decision_path, selected_artifact_set_path, tail_sanity_path, action_queue_path, studio_queue_path, writing_status_path, selected_watch_review_progress_path = sys.argv[1:14]

def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")

def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)

def load_optional_json(path):
    if not path or not os.path.exists(path):
        return None
    return load_json(path)

def write_json(path, payload):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")

status_by_decision = {
    "pass": "full-length-artifact-watch-listen-review-passed-not-publication-ready",
    "needs-review": "full-length-artifact-watch-listen-review-needed",
    "needs-fix": "full-length-artifact-watch-listen-review-needs-studio-fix",
    "reject": "full-length-artifact-watch-listen-review-rejected",
}
next_by_decision = {
    "pass": "Review destination copy, writing canon state, selected shorts, and then prepare platform receipt targets.",
    "needs-review": "Complete watch/listen review before Tower artifact-ready claims.",
    "needs-fix": "Route exact issues back to Studio before Tower artifact-ready claims.",
    "reject": "Stop Tower artifact readiness for this artifact set and create a replacement export/review packet.",
}

proof = load_json(review_path)
selected_artifact_set = None
if os.path.exists(selected_artifact_set_path):
    candidate_selection = load_json(selected_artifact_set_path)
    if candidate_selection.get("decision") == "promote-for-review" and candidate_selection.get("selectedArtifactSet"):
        selected_artifact_set = candidate_selection
if selected_artifact_set:
    reviewed_artifacts = [
        {
            "artifactId": item.get("artifactId"),
            "path": item.get("path"),
            "durationSeconds": item.get("durationSeconds"),
            "pixelWidth": item.get("pixelWidth"),
            "pixelHeight": item.get("pixelHeight"),
            "exists": item.get("exists"),
            "sourcePath": item.get("sourcePath"),
            "endingReviewSamplePath": item.get("endingReviewSamplePath"),
        }
        for item in selected_artifact_set.get("selectedArtifactSet", [])
    ]
    source_artifact_set = selected_artifact_set_path
    source_artifact_set_status = selected_artifact_set.get("status")
else:
    tail_sanity = load_json(tail_sanity_path) if os.path.exists(tail_sanity_path) else None
    tail_candidate_is_sane = bool(tail_sanity and tail_sanity.get("status") == "tail-trim-candidate-machine-sanity-ok")
    accept_originals_override = "accept-originals-with-tail-warning" in (note or "").lower()
    if decision == "pass" and tail_candidate_is_sane and not accept_originals_override:
        print(
            json.dumps(
                {
                    "packetType": "quipsly-artifact-watch-listen-review-decision-blocked",
                    "status": "blocked-tail-candidate-awaits-explicit-selection",
                    "decision": decision,
                    "truth": "A sane tail-trim candidate exists but has not been selected or rejected. Select it for review, reject it, or explicitly pass originals with accept-originals-with-tail-warning in the note.",
                    "safeCommands": {
                        "selectCandidateForReview": 'script/agentctl.sh episode1-tail-trim-promote promote-for-review "Reviewer Name" "Tail-trim candidate ending samples reviewed; select candidate artifact set for full watch/listen review."',
                        "rejectCandidate": 'script/agentctl.sh episode1-tail-trim-promote reject-candidate "Reviewer Name" "Tail-trim candidate did not resolve the ending cleanly; regenerate replacement artifacts."',
                        "overrideOriginals": 'script/agentctl.sh episode1-artifact-watch-review-decision pass "Reviewer Name" "accept-originals-with-tail-warning: reviewed original masters and intentionally accept the long-tail behavior."',
                    },
                },
                indent=2,
                sort_keys=True,
            )
        )
        raise SystemExit(3)
    reviewed_artifacts = [
        {
            "artifactId": item.get("artifactId"),
            "path": item.get("path"),
            "durationSeconds": item.get("durationSeconds"),
            "pixelWidth": item.get("pixelWidth"),
            "pixelHeight": item.get("pixelHeight"),
            "exists": item.get("exists"),
        }
        for item in proof.get("artifacts", [])
        if item.get("artifactId") in {"episode-16x9-master", "episode-9x16-master", "podcast-audio-master"}
    ]
    source_artifact_set = review_path
    source_artifact_set_status = "original-artifact-proof-review-accepted-with-tail-warning" if accept_originals_override else "original-artifact-proof-review"
selected_watch_review_progress = load_optional_json(selected_watch_review_progress_path)
if decision == "pass" and selected_watch_review_progress:
    selected_review_summary = selected_watch_review_progress.get("summary") or {}
    if not selected_review_summary.get("readyForFinalDecision"):
        print(
            json.dumps(
                {
                    "packetType": "quipsly-artifact-watch-listen-review-decision-blocked",
                    "status": "blocked-selected-watch-review-incomplete",
                    "decision": decision,
                    "sourceSelectedWatchReviewProgress": selected_watch_review_progress_path,
                    "summary": selected_review_summary,
                    "truth": "The selected artifact set cannot pass final watch/listen review until segmented review items are reviewed or explicitly skipped and no issues remain.",
                    "safeCommands": {
                        "openReviewConsole": "script/agentctl.sh episode1-selected-review-console --html",
                        "openProgressLedger": "script/agentctl.sh episode1-selected-watch-review-progress --html",
                        "markSegmentReviewedAfterRealReview": 'script/agentctl.sh episode1-selected-watch-review-mark all:segment-001 reviewed "Reviewer Name" "Actually watched/listened to this segment across selected artifacts."',
                        "markIssue": 'script/agentctl.sh episode1-selected-watch-review-mark episode-16x9-master:segment-001 issue "Reviewer Name" "Describe exact timestamp and problem."',
                    },
                },
                indent=2,
                sort_keys=True,
            )
        )
        raise SystemExit(4)
status = status_by_decision[decision]
record = {
    "packetType": "quipsly-artifact-watch-listen-review-decision",
    "version": "2026-06-20.artifact-watch-listen-review-decision.v1",
    "projectSlug": proof.get("projectSlug", "high-ground-odyssey-manuscript"),
    "episodeSlug": proof.get("episodeSlug", "episode-1"),
    "createdAt": now_iso(),
    "actor": actor,
    "decision": decision,
    "status": status,
    "note": note,
    "sourceProofReview": review_path,
    "sourceSelectedArtifactSet": source_artifact_set,
    "sourceSelectedArtifactSetStatus": source_artifact_set_status,
    "sourceSelectedWatchReviewProgress": selected_watch_review_progress_path if selected_watch_review_progress else None,
    "selectedWatchReviewSummary": (selected_watch_review_progress or {}).get("summary") if selected_watch_review_progress else None,
    "sourceReviewSheet": sheet_path,
    "reviewedArtifacts": reviewed_artifacts,
    "nextAction": next_by_decision[decision],
    "truth": "This records an artifact watch/listen review decision. It does not publish, upload, schedule, approve writing canon, or capture external receipts.",
}

os.makedirs(os.path.dirname(ledger_path) or ".", exist_ok=True)
with open(ledger_path, "a", encoding="utf-8") as handle:
    handle.write(json.dumps(record, sort_keys=True))
    handle.write("\n")
write_json(current_decision_path, record)

for path in (action_queue_path, studio_queue_path, writing_status_path):
    payload = load_json(path)
    payload["updatedAt"] = record["createdAt"]
    if path == action_queue_path:
        payload["currentArtifactWatchListenReviewDecision"] = current_decision_path
        payload["currentArtifactWatchListenReviewLedger"] = ledger_path
        payload["currentStudioArtifactProofReviewStatus"] = status
        payload["queueStatus"] = "artifact-review-passed-destination-review-needed" if decision == "pass" else status
        payload["readyNow"] = (
            [
                "Review destination-specific copy.",
                "Review the Episode 1 writing/canon decision.",
                "Review selected shorts before social posting.",
                "Prepare platform-specific receipt targets without claiming publication yet.",
            ]
            if decision == "pass"
            else [
                "Complete watch/listen review on the 16:9 master, 9:16 master, podcast audio, and selected shorts when relevant.",
                "Keep Tower blocked until a pass, needs-fix, or reject decision records actual review findings.",
            ]
            if decision == "needs-review"
            else [
                next_by_decision[decision],
                "Keep Tower blocked until a replacement artifact proof or explicit accept-as-is decision exists.",
            ]
        )
        if decision == "pass":
            payload["notReadyYet"] = [
                "Artifact watch/listen review passed, but destination copy still needs review.",
                "Do not publish HGO page until copy/media references are reviewed.",
                "Do not claim social readiness until selected short exports are reviewed.",
                "Do not claim receipt completion until external URLs or provider ids are captured.",
            ]
        elif decision == "needs-review":
            payload["notReadyYet"] = [
                "Full-length Episode 1 artifacts have metadata proof, but real watch/listen review is still needed.",
                "Do not claim publication-ready until artifact review is completed.",
                "Do not claim published until external URLs or provider ids are captured.",
            ]
        else:
            payload["notReadyYet"] = [
                next_by_decision[decision],
                "Do not claim publication-ready until artifact review is passed.",
                "Do not claim published until external URLs or provider ids are captured.",
            ]
        for item in payload.get("actions", []):
            if item.get("id") == "attach-studio-export-proof":
                item["status"] = status
                item["safeNextCommand"] = f"cat {current_decision_path}"
                item["requiredEvidence"] = "Current artifact watch/listen review decision plus ledger row."
                item["why"] = next_by_decision[decision]
            elif decision == "pass" and item.get("id") in {"create-hgo-page", "prepare-youtube-description"}:
                item["status"] = "blocked-until-writing-and-destination-copy-review"
            elif decision != "pass" and item.get("id") in {"create-hgo-page", "prepare-youtube-description", "prepare-short-posts"}:
                item["status"] = "blocked-until-artifact-review-passes"
    elif path == studio_queue_path:
        payload["currentWatchListenReviewDecision"] = current_decision_path
        payload["currentWatchListenReviewLedger"] = ledger_path
        payload["queueStatus"] = status
        for slot in payload.get("attachmentSlots", []):
            if slot.get("artifactFamily") in {"episode-16x9-master", "episode-9x16-master", "podcast-audio", "social-shorts", "episode-spine"}:
                slot["status"] = "review-passed" if decision == "pass" else ("review-needed" if decision == "needs-review" else "review-blocked")
        payload["blockedClaims"] = (
            [
                "Artifact review passed, but this still does not prove upload, schedule, publication, or receipt capture.",
                "Destination copy, selected shorts, and writing/canon state still need their own review before public claims.",
            ]
            if decision == "pass"
            else [
                "Metadata proof is not visual/audio approval.",
                "Do not claim artifact-ready until watch/listen review is completed.",
            ]
            if decision == "needs-review"
            else [
                next_by_decision[decision],
                "Do not claim artifact-ready until review passes or a new export proof replaces this set.",
            ]
        )
    else:
        payload.setdefault("authoritativeArtifacts", {})["artifactWatchListenReviewDecision"] = current_decision_path
        payload.setdefault("authoritativeArtifacts", {})["artifactWatchListenReviewLedger"] = ledger_path
        current = payload.setdefault("currentState", {})
        current["studioProofStatus"] = status
        current["studioProofAttachmentQueueStatus"] = status
        current["publicationActionQueueStatus"] = "artifact-review-passed-destination-review-needed" if decision == "pass" else status
    write_json(path, payload)

print(json.dumps({
    "packetType": "quipsly-artifact-watch-listen-review-decision-result",
    "status": status,
    "decision": decision,
    "actor": actor,
    "currentDecision": current_decision_path,
    "ledger": ledger_path,
    "truth": record["truth"],
}, indent=2, sort_keys=True))
PY
    ;;
  episode1-selected-review-gate|selected-review-gate|episode1-review-gate)
    format="human"
    if [[ "${2:-}" == "--json" ]]; then
      format="json"
    elif [[ "${2:-}" == "--html" ]]; then
      format="html"
    elif [[ -n "${2:-}" ]]; then
      echo "usage: script/agentctl.sh episode1-selected-review-gate [--json|--html]" >&2
      exit 1
    fi
    progress_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.json"
    index_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-index.json"
    next_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-next.json"
    output_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-gate.json"
    html_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-gate.html"
    md_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-gate.md"
    "$0" episode1-selected-review-index --json >/dev/null
    "$0" episode1-selected-review-next --json >/dev/null
    if [[ "$format" == "json" ]]; then
      python3 "$SCRIPT_DIR/episode1_selected_review_gate.py" \
        "$progress_path" "$index_path" "$next_path" \
        "$output_path" "$html_path" "$md_path" >/dev/null
      cat "$output_path"
    else
      python3 "$SCRIPT_DIR/episode1_selected_review_gate.py" \
        "$progress_path" "$index_path" "$next_path" \
        "$output_path" "$html_path" "$md_path"
      if [[ "$format" == "html" ]]; then
        open "$html_path"
      fi
    fi
    ;;

  episode1-vertical-slice-refresh|vertical-slice-refresh|episode1-loop-refresh)
    output_path="${2:-}"
    "$0" episode1-selected-segment-review-pack --json >/dev/null
    "$0" episode1-selected-review-gate --json >/dev/null
    "$0" episode1-selected-review-session-draft --json >/dev/null
    "$0" episode1-selected-review-handoff --json >/dev/null
    "$0" episode1-selected-review-worksheet --json >/dev/null
    brief_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-vertical-slice-brief.json"
    writing_status_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-writing-loop-status.json"
    action_queue_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-publication-action-queue.json"
    studio_attach_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-studio-proof-attachment-queue.json"
    tower_readiness_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-writing-tower-readiness.json"
    artifact_handoff_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-handoff.json"
    artifact_launch_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-artifact-review-launch-plan.json"
    ending_review_evidence_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-tail-trim-ending-review-evidence.json"
    selected_review_station_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-artifact-review-station.html"
    selected_review_assist_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-artifact-review-assist.html"
    selected_watch_review_progress_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.html"
    selected_segment_evidence_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-segment-evidence.html"
    selected_review_console_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-console.html"
    selected_quality_scan_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-quality-scan.html"
    selected_quality_triage_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-quality-triage.html"
    selected_review_next_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-next.html"
    selected_segment_review_pack_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-segment-review-pack.html"
    selected_review_gate_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-gate.html"
    selected_review_cockpit_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-cockpit.html"
    selected_review_notes_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-notes.html"
    selected_machine_review_summary_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-machine-review-summary.html"
    selected_review_session_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session.html"
    selected_review_session_draft_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-session-draft.html"
    selected_review_handoff_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-handoff.html"
    selected_review_worksheet_path="$ROOT_DIR/../../docs/quipsly/studio-proof/episode-1-selected-review-worksheet.html"
    brief_path="$(cd "$(dirname "$brief_path")" && pwd)/$(basename "$brief_path")"
    writing_status_path="$(cd "$(dirname "$writing_status_path")" && pwd)/$(basename "$writing_status_path")"
    action_queue_path="$(cd "$(dirname "$action_queue_path")" && pwd)/$(basename "$action_queue_path")"
    studio_attach_path="$(cd "$(dirname "$studio_attach_path")" && pwd)/$(basename "$studio_attach_path")"
    tower_readiness_path="$(cd "$(dirname "$tower_readiness_path")" && pwd)/$(basename "$tower_readiness_path")"
    artifact_handoff_path="$(cd "$(dirname "$artifact_handoff_path")" && pwd)/$(basename "$artifact_handoff_path")"
    artifact_launch_path="$(cd "$(dirname "$artifact_launch_path")" && pwd)/$(basename "$artifact_launch_path")"
    ending_review_evidence_path="$(cd "$(dirname "$ending_review_evidence_path")" && pwd)/$(basename "$ending_review_evidence_path")"
    selected_review_station_path="$(cd "$(dirname "$selected_review_station_path")" && pwd)/$(basename "$selected_review_station_path")"
    selected_review_assist_path="$(cd "$(dirname "$selected_review_assist_path")" && pwd)/$(basename "$selected_review_assist_path")"
    selected_watch_review_progress_path="$(cd "$(dirname "$selected_watch_review_progress_path")" && pwd)/$(basename "$selected_watch_review_progress_path")"
    selected_segment_evidence_path="$(cd "$(dirname "$selected_segment_evidence_path")" && pwd)/$(basename "$selected_segment_evidence_path")"
    selected_review_console_path="$(cd "$(dirname "$selected_review_console_path")" && pwd)/$(basename "$selected_review_console_path")"
    selected_quality_scan_path="$(cd "$(dirname "$selected_quality_scan_path")" && pwd)/$(basename "$selected_quality_scan_path")"
    selected_quality_triage_path="$(cd "$(dirname "$selected_quality_triage_path")" && pwd)/$(basename "$selected_quality_triage_path")"
    selected_review_next_path="$(cd "$(dirname "$selected_review_next_path")" && pwd)/$(basename "$selected_review_next_path")"
    selected_segment_review_pack_path="$(cd "$(dirname "$selected_segment_review_pack_path")" && pwd)/$(basename "$selected_segment_review_pack_path")"
    selected_review_gate_path="$(cd "$(dirname "$selected_review_gate_path")" && pwd)/$(basename "$selected_review_gate_path")"
    selected_review_cockpit_path="$(cd "$(dirname "$selected_review_cockpit_path")" && pwd)/$(basename "$selected_review_cockpit_path")"
    selected_review_notes_path="$(cd "$(dirname "$selected_review_notes_path")" && pwd)/$(basename "$selected_review_notes_path")"
    selected_machine_review_summary_path="$(cd "$(dirname "$selected_machine_review_summary_path")" && pwd)/$(basename "$selected_machine_review_summary_path")"
    selected_review_session_path="$(cd "$(dirname "$selected_review_session_path")" && pwd)/$(basename "$selected_review_session_path")"
    selected_review_session_draft_path="$(cd "$(dirname "$selected_review_session_draft_path")" && pwd)/$(basename "$selected_review_session_draft_path")"
    selected_review_handoff_path="$(cd "$(dirname "$selected_review_handoff_path")" && pwd)/$(basename "$selected_review_handoff_path")"
    selected_review_worksheet_path="$(cd "$(dirname "$selected_review_worksheet_path")" && pwd)/$(basename "$selected_review_worksheet_path")"
    python3 - "$brief_path" "$writing_status_path" "$action_queue_path" "$studio_attach_path" "$tower_readiness_path" "$artifact_handoff_path" "$artifact_launch_path" "$ending_review_evidence_path" "$selected_review_station_path" "$selected_review_assist_path" "$selected_watch_review_progress_path" "$selected_segment_evidence_path" "$selected_review_console_path" "$selected_quality_scan_path" "$selected_quality_triage_path" "$selected_review_next_path" "$selected_segment_review_pack_path" "$selected_review_gate_path" "$selected_review_cockpit_path" "$selected_review_notes_path" "$selected_machine_review_summary_path" "$selected_review_session_path" "$selected_review_session_draft_path" "$selected_review_handoff_path" "$selected_review_worksheet_path" "$output_path" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

brief_path, writing_status_path, action_queue_path, studio_attach_path, tower_readiness_path, artifact_handoff_path, artifact_launch_path, ending_review_evidence_path, selected_review_station_path, selected_review_assist_path, selected_watch_review_progress_path, selected_segment_evidence_path, selected_review_console_path, selected_quality_scan_path, selected_quality_triage_path, selected_review_next_path, selected_segment_review_pack_path, selected_review_gate_path, selected_review_cockpit_path, selected_review_notes_path, selected_machine_review_summary_path, selected_review_session_path, selected_review_session_draft_path, selected_review_handoff_path, selected_review_worksheet_path, output_path = sys.argv[1:27]
if not output_path:
    output_path = brief_path

def load(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)

def load_optional(path):
    if not path or not os.path.exists(path):
        return {}
    try:
        return load(path)
    except Exception as error:
        return {
            "_loadError": str(error),
            "_path": path,
        }

def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")

writing = load(writing_status_path)
actions = load(action_queue_path)
studio = load(studio_attach_path)
tower = load(tower_readiness_path)
artifact_handoff = load_optional(artifact_handoff_path)
artifact_launch = load_optional(artifact_launch_path)
ending_review_evidence = load_optional(ending_review_evidence_path)

action_by_id = {item.get("id"): item for item in actions.get("actions", [])}
current = writing.get("currentState", {})
writing_commands = writing.get("operatorCommands", {})
action_commands = actions.get("operatorCommands", {})
studio_commands = studio.get("operatorCommands", {})
tower_commands = tower.get("operatorCommands", {})
studio_status = studio.get("queueStatus", current.get("studioProofAttachmentQueueStatus", "unknown"))
studio_has_full_length_metadata = "full-length-artifact-metadata-present" in studio_status
studio_review_needed = "full-length-artifact-watch-listen-review-needed" in studio_status
studio_review_passed = "full-length-artifact-watch-listen-review-passed" in studio_status
studio_review_blocked = (
    "full-length-artifact-watch-listen-review-needs-studio-fix" in studio_status
    or "full-length-artifact-watch-listen-review-rejected" in studio_status
)
artifact_handoff_state = artifact_handoff.get("currentState")
if artifact_handoff_state == "tail-candidate-sane-needs-ending-review":
    studio_next_action = "Use the artifact review launcher, inspect the focused tail-trim ending samples/contact sheets, then explicitly select or reject the candidate before full watch/listen review."
    studio_next_command = "script/agentctl.sh episode1-artifact-review-launch --open"
elif artifact_handoff_state == "tail-candidate-selected-needs-watch-listen-review":
    studio_next_action = "Open the selected review handoff, then use it to enter the guided session, record durable draft responses, and only then consider the official review ledger command."
    studio_next_command = "script/agentctl.sh episode1-selected-review-handoff --html"
elif studio_review_needed:
    review_station = studio.get("currentArtifactReviewStationHtml") or actions.get("currentArtifactReviewStationHtml") or writing.get("authoritativeArtifacts", {}).get("artifactReviewStationHtml")
    review_station_command = studio_commands.get("generateArtifactReviewStation") or action_commands.get("generateArtifactReviewStation")
    if review_station:
        studio_next_action = "Open the Episode 1 review station, sample the start/middle/tail clips, then record the watch/listen decision before Tower artifact-ready claims."
        studio_next_command = review_station
    else:
        studio_next_action = "Generate or open the Episode 1 review station, then complete watch/listen review before Tower artifact-ready claims."
        studio_next_command = review_station_command or studio.get("currentWatchListenReviewSheet") or actions.get("currentArtifactWatchListenReviewSheet") or studio_commands.get("generateArtifactWatchListenReviewSheet") or "script/agentctl.sh episode1-artifact-watch-review"
elif studio_review_passed:
    studio_next_action = "Inspect the artifact review decision, then move Tower toward destination-copy review and receipt-target prep."
    studio_next_command = studio.get("currentWatchListenReviewDecision") or actions.get("currentArtifactWatchListenReviewDecision") or "script/agentctl.sh episode1-publication-action-queue --json"
elif studio_review_blocked:
    studio_next_action = "Inspect the artifact review decision and route exact issues back to Studio before publication readiness."
    studio_next_command = studio.get("currentWatchListenReviewDecision") or actions.get("currentArtifactWatchListenReviewDecision") or "script/agentctl.sh episode1-studio-proof-attachment-queue --json"
else:
    studio_next_action = (
        "Review the full-length Episode 1 artifact proof and record watch/listen notes before Tower artifact-ready claims."
        if studio_has_full_length_metadata
        else "Generate a Studio proof attachment packet from current Episode 1 export evidence, then review candidate artifacts before artifact-ready claims."
    )
    studio_next_command = (
        studio_commands.get("generateArtifactWatchListenReviewSheet")
        or actions.get("operatorCommands", {}).get("generateArtifactWatchListenReviewSheet")
        or actions.get("currentArtifactWatchListenReviewSheet")
        or studio.get("currentWatchListenReviewSheet")
        or actions.get("currentStudioArtifactProofReview")
        or studio.get("currentArtifactProofReview")
        or "cat /Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-full-release-artifact-proof-review.json"
    )
if studio_next_command and str(studio_next_command).endswith(".md"):
    studio_next_command = f"open {studio_next_command}"
elif studio_next_command and str(studio_next_command).endswith(".html"):
    studio_next_command = f"open {studio_next_command}"
elif studio_next_command and str(studio_next_command).endswith(".json"):
    studio_next_command = f"cat {studio_next_command}"
if not (artifact_handoff_state or studio_has_full_length_metadata or studio_review_needed or studio_review_passed or studio_review_blocked):
    studio_next_command = studio_commands.get("generateLatestStudioProofAttachmentPacket", "script/agentctl.sh episode1-studio-proof-attach-latest [/absolute/output.json]")

packet = {
    "packetType": "quipsly-episode-vertical-slice-brief",
    "version": "2026-06-20.vertical-slice-brief.v2",
    "projectSlug": writing.get("projectSlug", "high-ground-odyssey-manuscript"),
    "episodeSlug": writing.get("episodeSlug", "episode-1"),
    "title": "Episode 1 - The Wednesday Rule - Nest Studio Tower vertical slice brief",
    "updatedAt": now_iso(),
    "purpose": "Give humans and agents one honest flight board for the current Episode 1 Nest -> Studio -> Tower dogfood loop without flattening the underlying packets into fake completion.",
    "overallStatus": "active-vertical-slice-not-complete",
    "nearTermDefinitionOfDone": [
        "Nest holds the Episode 1 writing/context candidate with visible authorship, provenance, tags, and review state.",
        "Studio has current Episode 1 export proof attached for 16:9 master, 9:16/shorts, podcast audio or explicit audio decision, and Episode Spine/Receipt Cockpit state.",
        "Tower has reviewed destination copy, artifact-ready proof, and receipt targets ready for platform posting without claiming publication before external receipts.",
        "Codex can inspect the same state through command surfaces instead of relying on hidden memory or chat history.",
    ],
    "lanes": [
        {
            "id": "nest-writing-capture",
            "lens": "Nest",
            "status": current.get("nestQueueStatus", "unknown"),
            "currentEvidence": [
                writing.get("authoritativeArtifacts", {}).get("currentCandidate"),
                writing.get("authoritativeArtifacts", {}).get("nestIntake"),
                writing.get("authoritativeArtifacts", {}).get("nestQueue"),
                writing.get("authoritativeArtifacts", {}).get("humanHandoff"),
            ],
            "nextSafeAction": "Inspect the Nest queue and either approve live ingest or revise the v2 candidate before canon claims.",
            "nextCommand": writing_commands.get("inspectLocalNestQueue", "script/agentctl.sh episode1-writing-nest-queue --json"),
            "humanDecisionNeeded": True,
            "blockedClaims": [
                "Do not claim live Nest ingestion until a live receipt proves it.",
                "Do not claim canon approval until the review ledger records it.",
                "Do not hide that the current candidate is agent-authored.",
            ],
        },
        {
            "id": "studio-edit-export-proof",
            "lens": "Studio",
            "status": artifact_handoff_state or studio_status,
            "currentEvidence": [
                writing.get("authoritativeArtifacts", {}).get("studioProofRequirements"),
                writing.get("authoritativeArtifacts", {}).get("studioProofAttachmentQueue"),
                artifact_handoff_path if artifact_handoff else None,
                artifact_launch_path if artifact_launch else None,
                ending_review_evidence_path if ending_review_evidence else None,
                selected_review_station_path if os.path.exists(selected_review_station_path) else None,
                selected_review_assist_path if os.path.exists(selected_review_assist_path) else None,
                selected_watch_review_progress_path if os.path.exists(selected_watch_review_progress_path) else None,
                selected_segment_evidence_path if os.path.exists(selected_segment_evidence_path) else None,
                selected_review_console_path if os.path.exists(selected_review_console_path) else None,
                selected_quality_scan_path if os.path.exists(selected_quality_scan_path) else None,
                selected_quality_triage_path if os.path.exists(selected_quality_triage_path) else None,
                selected_review_next_path if os.path.exists(selected_review_next_path) else None,
                selected_segment_review_pack_path if os.path.exists(selected_segment_review_pack_path) else None,
                selected_review_gate_path if os.path.exists(selected_review_gate_path) else None,
                selected_review_cockpit_path if os.path.exists(selected_review_cockpit_path) else None,
                selected_review_notes_path if os.path.exists(selected_review_notes_path) else None,
                selected_machine_review_summary_path if os.path.exists(selected_machine_review_summary_path) else None,
                selected_review_session_path if os.path.exists(selected_review_session_path) else None,
                selected_review_session_draft_path if os.path.exists(selected_review_session_draft_path) else None,
                selected_review_handoff_path if os.path.exists(selected_review_handoff_path) else None,
                selected_review_worksheet_path if os.path.exists(selected_review_worksheet_path) else None,
                artifact_handoff.get("reviewStationHtml") if artifact_handoff else None,
            ],
            "nextSafeAction": studio_next_action,
            "nextCommand": studio_next_command,
            "reviewState": {
                "artifactHandoffState": artifact_handoff_state,
                "artifactLaunchMode": artifact_launch.get("mode") if artifact_launch else None,
                "tailTrimCandidateSanity": artifact_handoff.get("tailTrimCandidateSanityStatus") if artifact_handoff else None,
                "tailTrimPromotionDecisionPath": artifact_handoff.get("tailTrimPromotionDecisionPath") if artifact_handoff else None,
                "focusedEndingSampleCount": len(artifact_handoff.get("tailTrimCandidateArtifacts", [])) if artifact_handoff else 0,
                "contactSheetCount": len(artifact_handoff.get("contactSheets", [])) if artifact_handoff else 0,
                "endingReviewEvidenceStatus": ending_review_evidence.get("status") if ending_review_evidence else None,
                "endingReviewEvidenceErrors": ending_review_evidence.get("errorCount") if ending_review_evidence else None,
                "endingReviewEvidenceWarnings": ending_review_evidence.get("warningCount") if ending_review_evidence else None,
                "selectedReviewStation": selected_review_station_path if os.path.exists(selected_review_station_path) else None,
                "selectedReviewAssist": selected_review_assist_path if os.path.exists(selected_review_assist_path) else None,
                "selectedWatchReviewProgress": selected_watch_review_progress_path if os.path.exists(selected_watch_review_progress_path) else None,
                "selectedSegmentEvidence": selected_segment_evidence_path if os.path.exists(selected_segment_evidence_path) else None,
                "selectedReviewConsole": selected_review_console_path if os.path.exists(selected_review_console_path) else None,
                "selectedQualityScan": selected_quality_scan_path if os.path.exists(selected_quality_scan_path) else None,
                "selectedQualityTriage": selected_quality_triage_path if os.path.exists(selected_quality_triage_path) else None,
                "selectedReviewNext": selected_review_next_path if os.path.exists(selected_review_next_path) else None,
                "selectedSegmentReviewPack": selected_segment_review_pack_path if os.path.exists(selected_segment_review_pack_path) else None,
                "selectedReviewGate": selected_review_gate_path if os.path.exists(selected_review_gate_path) else None,
                "selectedReviewCockpit": selected_review_cockpit_path if os.path.exists(selected_review_cockpit_path) else None,
                "selectedReviewNotes": selected_review_notes_path if os.path.exists(selected_review_notes_path) else None,
                "selectedMachineReviewSummary": selected_machine_review_summary_path if os.path.exists(selected_machine_review_summary_path) else None,
                "selectedReviewSession": selected_review_session_path if os.path.exists(selected_review_session_path) else None,
                "selectedReviewSessionDraft": selected_review_session_draft_path if os.path.exists(selected_review_session_draft_path) else None,
                "selectedReviewHandoff": selected_review_handoff_path if os.path.exists(selected_review_handoff_path) else None,
                "selectedReviewWorksheet": selected_review_worksheet_path if os.path.exists(selected_review_worksheet_path) else None,
            },
            "fallbackCommand": studio_commands.get("generateStudioProofAttachmentPacket", "script/agentctl.sh episode1-studio-proof-attach /absolute/release-manifest-or-folder [/absolute/output.json]"),
            "humanDecisionNeeded": False,
            "blockedClaims": (artifact_handoff.get("blockedClaims") if artifact_handoff else None) or studio.get("blockedClaims", [
                "Do not call candidate attachment proof artifact-ready until files are reviewed.",
            ]),
        },
        {
            "id": "tower-publication-readiness",
            "lens": "Tower",
            "status": current.get("destinationCopyStatus", tower.get("overallStatus", "unknown")),
            "currentEvidence": [
                writing.get("authoritativeArtifacts", {}).get("towerPacketV2"),
                writing.get("authoritativeArtifacts", {}).get("destinationCopy"),
                writing.get("authoritativeArtifacts", {}).get("publicationActionQueue"),
                writing.get("authoritativeArtifacts", {}).get("towerReadiness") or tower_readiness_path,
            ],
            "nextSafeAction": action_by_id.get("review-destination-copy", {}).get("label", "Review destination copy while waiting for Studio proof attachments."),
            "nextCommand": action_commands.get("inspectPublicationActionQueue", "script/agentctl.sh episode1-publication-action-queue --json"),
            "humanDecisionNeeded": True,
            "blockedClaims": actions.get("notReadyYet", []),
        },
        {
            "id": "codex-agent-control",
            "lens": "Agent",
            "status": "command-surfaces-growing-needs-runtime-proof",
            "currentEvidence": [
                "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh",
                "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/Sources/SharedUI/AgentServer.swift",
                "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift",
            ],
            "nextSafeAction": "Use this generated brief as the first coordination checkpoint; prove runtime behavior only when validation is intentionally run.",
            "nextCommand": "script/agentctl.sh episode1-vertical-slice-brief --json",
            "refreshCommand": "script/agentctl.sh episode1-vertical-slice-refresh",
            "humanDecisionNeeded": False,
            "blockedClaims": [
                "Do not treat command discoverability as runtime proof.",
                "Do not rely on chat memory when a packet or command can expose current state.",
                "Do not split Nest, Studio, and Tower into disconnected silos.",
            ],
        },
    ],
    "nextOperatorSequence": [
        {"order": 1, "action": "Refresh and inspect this vertical slice brief.", "command": "script/agentctl.sh episode1-vertical-slice-refresh && script/agentctl.sh episode1-vertical-slice-brief --json"},
        {"order": 2, "action": "Append the queued v2 writing candidate to live Nest if needed, then verify live Nest state with the ingest receipt checker.", "command": "script/agentctl.sh episode1-writing-nest-queue --json && script/agentctl.sh episode1-writing-nest-ingest-receipt --json"},
        {"order": 3, "action": studio_next_action, "command": studio_next_command},
        {"order": 4, "action": "Review Nest writing candidate and decide whether it becomes working draft, needs revision, or becomes canon-approved.", "command": writing_commands.get("inspectHumanHandoff", "script/agentctl.sh episode1-writing-review-bundle --json")},
        {"order": 5, "action": "Review destination copy only after separating writing approval from artifact proof.", "command": action_commands.get("inspectDestinationCopy", "script/agentctl.sh publication-destination-copy --json")},
        {"order": 6, "action": "Use Receipt Cockpit only after local artifact and platform action evidence exists.", "command": action_commands.get("inspectReceiptCockpit", "script/agentctl.sh publication-receipt-cockpit")},
    ],
    "sourcePackets": {
        "contentPartnerDoctrine": os.path.abspath(os.path.join(os.path.dirname(brief_path), "..", "quipsly-content-partner-doctrine.md")),
        "writingLoopStatus": writing_status_path,
        "publicationActionQueue": action_queue_path,
        "studioProofAttachmentQueue": studio_attach_path,
        "towerReadiness": tower_readiness_path,
        "artifactReviewHandoff": artifact_handoff_path if artifact_handoff else None,
        "artifactReviewLaunchPlan": artifact_launch_path if artifact_launch else None,
        "selectedArtifactReviewStation": selected_review_station_path if os.path.exists(selected_review_station_path) else None,
        "selectedArtifactReviewAssist": selected_review_assist_path if os.path.exists(selected_review_assist_path) else None,
        "selectedWatchReviewProgress": selected_watch_review_progress_path if os.path.exists(selected_watch_review_progress_path) else None,
        "selectedSegmentEvidence": selected_segment_evidence_path if os.path.exists(selected_segment_evidence_path) else None,
        "selectedReviewConsole": selected_review_console_path if os.path.exists(selected_review_console_path) else None,
        "selectedQualityScan": selected_quality_scan_path if os.path.exists(selected_quality_scan_path) else None,
        "selectedQualityTriage": selected_quality_triage_path if os.path.exists(selected_quality_triage_path) else None,
        "selectedReviewNext": selected_review_next_path if os.path.exists(selected_review_next_path) else None,
        "selectedSegmentReviewPack": selected_segment_review_pack_path if os.path.exists(selected_segment_review_pack_path) else None,
        "selectedReviewGate": selected_review_gate_path if os.path.exists(selected_review_gate_path) else None,
        "selectedReviewCockpit": selected_review_cockpit_path if os.path.exists(selected_review_cockpit_path) else None,
        "selectedReviewNotes": selected_review_notes_path if os.path.exists(selected_review_notes_path) else None,
        "selectedMachineReviewSummary": selected_machine_review_summary_path if os.path.exists(selected_machine_review_summary_path) else None,
        "selectedReviewSession": selected_review_session_path if os.path.exists(selected_review_session_path) else None,
        "selectedReviewSessionDraft": selected_review_session_draft_path if os.path.exists(selected_review_session_draft_path) else None,
        "selectedReviewHandoff": selected_review_handoff_path if os.path.exists(selected_review_handoff_path) else None,
        "selectedReviewWorksheet": selected_review_worksheet_path if os.path.exists(selected_review_worksheet_path) else None,
        "tailTrimEndingReviewEvidence": ending_review_evidence_path if ending_review_evidence else None,
        "previousBrief": brief_path,
    },
    "generationInputs": {
        "writingLoopStatusUpdatedAt": writing.get("updatedAt"),
        "publicationActionQueueUpdatedAt": actions.get("updatedAt"),
        "studioProofAttachmentQueueUpdatedAt": studio.get("updatedAt"),
        "towerReadinessUpdatedAt": tower.get("updatedAt"),
    },
    "truth": "This generated brief is a read-only coordination packet for the Episode 1 vertical slice. It does not ingest into Nest, export Studio media, approve canon, publish, schedule, validate runtime behavior, or capture external receipts.",
}

for lane in packet["lanes"]:
    lane["currentEvidence"] = [item for item in lane.get("currentEvidence", []) if item]

os.makedirs(os.path.dirname(output_path), exist_ok=True)
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(packet, handle, indent=2, sort_keys=True)
    handle.write("\n")

packet["writtenTo"] = output_path
print(json.dumps(packet, indent=2, sort_keys=True))
PY
    ;;
  episode1-vertical-slice-brief|vertical-slice-brief|episode1-loop-brief)
    brief_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-vertical-slice-brief.json"
    brief_path="$(cd "$(dirname "$brief_path")" && pwd)/$(basename "$brief_path")"
    python3 - "$brief_path" "${2:-text}" <<'PY'
import json
import sys

path, mode = sys.argv[1:3]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)
payload["path"] = path

if mode in ("--json", "json"):
    print(json.dumps(payload, indent=2, sort_keys=True))
else:
    print("# Episode 1 vertical slice brief")
    print("")
    print(payload["truth"])
    print("")
    print(f"- Overall status: `{payload['overallStatus']}`")
    print("")
    print("## Lanes")
    for lane in payload["lanes"]:
        print(f"- `{lane['lens']}` / `{lane['status']}`: {lane['nextSafeAction']}")
        print(f"  Command: `{lane['nextCommand']}`")
    print("")
    print("## Next operator sequence")
    for item in payload["nextOperatorSequence"]:
        print(f"{item['order']}. {item['action']}")
        print(f"   `{item['command']}`")
PY
    ;;
  episode1-vertical-slice-next|vertical-slice-next-action|episode1-loop-next-action)
    brief_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-vertical-slice-brief.json"
    brief_path="$(cd "$(dirname "$brief_path")" && pwd)/$(basename "$brief_path")"
    python3 - "$brief_path" "${2:-text}" <<'PY'
import json
import sys

path, mode = sys.argv[1:3]
with open(path, "r", encoding="utf-8") as handle:
    brief = json.load(handle)

lanes = brief.get("lanes", [])
by_id = {lane.get("id"): lane for lane in lanes}

priority_order = [
    "nest-writing-capture",
    "studio-edit-export-proof",
    "tower-publication-readiness",
    "codex-agent-control",
]

def lane_ready(lane):
    status = str(lane.get("status", "")).lower()
    blockedish = ("complete" in status) or ("published" in status and "not" not in status)
    waiting_on_human = bool(lane.get("humanDecisionNeeded")) and any(
        token in status
        for token in ("needs-human", "waiting-human", "human-review", "human-decision")
    )
    return bool(lane.get("nextCommand")) and not blockedish and not waiting_on_human

chosen = None
for lane_id in priority_order:
    lane = by_id.get(lane_id)
    if lane and lane_ready(lane):
        chosen = lane
        break
if not chosen and lanes:
    chosen = lanes[0]

packet = {
    "packetType": "quipsly-episode-vertical-slice-next-action",
    "projectSlug": brief.get("projectSlug"),
    "episodeSlug": brief.get("episodeSlug"),
    "sourceBrief": path,
    "sourceBriefUpdatedAt": brief.get("updatedAt"),
    "overallStatus": brief.get("overallStatus"),
    "chosenLane": {
        "id": chosen.get("id") if chosen else None,
        "lens": chosen.get("lens") if chosen else None,
        "status": chosen.get("status") if chosen else None,
        "nextSafeAction": chosen.get("nextSafeAction") if chosen else "No lane action found in the current vertical slice brief.",
        "nextCommand": chosen.get("nextCommand") if chosen else None,
        "fallbackCommand": chosen.get("fallbackCommand") if chosen else None,
        "humanDecisionNeeded": chosen.get("humanDecisionNeeded") if chosen else None,
    },
    "recommendedImmediateAction": {
        "laneId": chosen.get("id") if chosen else None,
        "lens": chosen.get("lens") if chosen else None,
        "status": chosen.get("status") if chosen else None,
        "action": chosen.get("nextSafeAction") if chosen else "No lane action found in the current vertical slice brief.",
        "command": chosen.get("nextCommand") if chosen else None,
        "fallbackCommand": chosen.get("fallbackCommand") if chosen else None,
        "humanDecisionNeeded": chosen.get("humanDecisionNeeded") if chosen else None,
    },
    "laneActions": [
        {
            "laneId": lane.get("id"),
            "lens": lane.get("lens"),
            "status": lane.get("status"),
            "action": lane.get("nextSafeAction"),
            "command": lane.get("nextCommand"),
            "fallbackCommand": lane.get("fallbackCommand"),
            "humanDecisionNeeded": lane.get("humanDecisionNeeded"),
        }
        for lane in lanes
    ],
    "blockedClaims": sorted({claim for lane in lanes for claim in lane.get("blockedClaims", [])}),
    "refreshFirstCommand": "script/agentctl.sh episode1-vertical-slice-refresh && script/agentctl.sh episode1-vertical-slice-next --json",
    "truth": "This next-action packet reads the current vertical slice brief and recommends a safe operator action. It does not refresh state, ingest into Nest, export media, attach proof, approve canon, publish, schedule, validate runtime behavior, or capture receipts.",
}

if mode in ("--json", "json"):
    print(json.dumps(packet, indent=2, sort_keys=True))
else:
    action = packet["recommendedImmediateAction"]
    print("# Episode 1 vertical slice next action")
    print("")
    print(packet["truth"])
    print("")
    print(f"- Overall status: `{packet['overallStatus']}`")
    print(f"- Recommended lane: `{action['lens']}` / `{action['status']}`")
    print(f"- Action: {action['action']}")
    if action.get("command"):
        print(f"- Command: `{action['command']}`")
    if action.get("fallbackCommand"):
        print(f"- Fallback: `{action['fallbackCommand']}`")
    print("")
    print("## All lane actions")
    for lane in packet["laneActions"]:
        print(f"- `{lane['lens']}` / `{lane['status']}`: {lane['action']}")
        if lane.get("command"):
            print(f"  `{lane['command']}`")
PY
    ;;
  episode1-writing-tower-readiness|writing-tower-readiness|episode1-writing-receipt-targets)
    readiness_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-writing-tower-readiness.json"
    readiness_path="$(cd "$(dirname "$readiness_path")" && pwd)/$(basename "$readiness_path")"
    python3 - "$readiness_path" "${2:-text}" <<'PY'
import json
import sys

path, mode = sys.argv[1:3]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)
payload["path"] = path

if mode in ("--json", "json"):
    print(json.dumps(payload, indent=2, sort_keys=True))
else:
    print("# Episode 1 writing Tower readiness")
    print("")
    print(payload["truth"])
    print("")
    print(f"- Overall status: `{payload['overallStatus']}`")
    print("")
    print("## Why not publication-ready")
    for reason in payload["whyNotPublicationReady"]:
        print(f"- {reason}")
    print("")
    print("## Destinations")
    for destination in payload["destinationReadiness"]:
        print(f"- {destination['destination']}: `{destination['status']}`")
    print("")
    print("## Receipt targets")
    for target in payload["receiptTargets"]:
        print(f"- `{target['id']}`: {target['destination']} requires {target['requiredReceipt']}")
PY
    ;;
  episode1-writing-nest-queue|writing-nest-queue-local|episode1-writing-local-queue)
    queue_path="$ROOT_DIR/../../docs/quipsly/nest-queue/episode-1-writing-v2-queue.json"
    queue_path="$(cd "$(dirname "$queue_path")" && pwd)/$(basename "$queue_path")"
    python3 - "$queue_path" "${2:-text}" <<'PY'
import json
import sys

path, mode = sys.argv[1:3]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)
payload["path"] = path

if mode in ("--json", "json"):
    print(json.dumps(payload, indent=2, sort_keys=True))
else:
    print("# Episode 1 Nest writing queue")
    print("")
    print(payload["truth"])
    print("")
    print(f"- Queue status: `{payload['queueStatus']}`")
    print(f"- Items: {len(payload['items'])}")
    print("")
    for item in payload["items"]:
        print(f"## {item['priority']}. {item['title']}")
        print("")
        print(f"- Status: `{item['status']}`")
        print(f"- Authorship: `{item['authorship']}`")
        print(f"- Review status: `{item['reviewStatus']}`")
        print(f"- Canon status: `{item['canonStatus']}`")
        print(f"- Source: `{item['sourcePath']}`")
        print("")
        print("```bash")
        print(item["safeIngestCommand"])
        print("```")
        print("")
        print(f"Receipt needed: {item['successReceiptNeeded']}")
PY
    ;;
  episode1-writing-nest-ingest-receipt|writing-nest-ingest-receipt|episode1-nest-ingest-receipt)
    mode="${2:-text}"
    queue_path="$ROOT_DIR/../../docs/quipsly/nest-queue/episode-1-writing-v2-queue.json"
    queue_path="$(cd "$(dirname "$queue_path")" && pwd)/$(basename "$queue_path")"
    packet_tmp="$(mktemp)"
    state_tmp="$(mktemp)"
    get "/nest_writing_packet" > "$packet_tmp" 2>/dev/null || true
    get "/state" > "$state_tmp" 2>/dev/null || true
    python3 - "$queue_path" "$mode" "$packet_tmp" "$state_tmp" <<'PY'
import json
import shlex
import sys
from datetime import datetime, timezone

queue_path, mode, packet_path, state_path = sys.argv[1:5]

def read_text(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    except Exception:
        return ""

live_text = read_text(packet_path)
state_text = read_text(state_path)

with open(queue_path, "r", encoding="utf-8") as handle:
    queue = json.load(handle)

item = (queue.get("items") or [{}])[0]
expected_title = item.get("title", "")
expected_authorship = item.get("authorship", "")
expected_review = item.get("reviewStatus", "")
expected_tags = item.get("tags", [])
expected_provenance = item.get("provenance", "")
safe_ingest_command = item.get("safeIngestCommand", "") or (queue.get("operatorCommands") or {}).get("appendQueuedDraftToLiveNest", "")
try:
    command_parts = shlex.split(safe_ingest_command)
except Exception:
    command_parts = []
expected_command_provenance = command_parts[-1] if command_parts else ""
expected_source_path = item.get("sourcePath", "")
source_text = read_text(expected_source_path) if expected_source_path else ""
source_anchor = " ".join(source_text.split())[:220]
provenance_options = [value for value in [expected_provenance, expected_command_provenance] if value]
required_needles = [expected_authorship, expected_review, source_anchor] + expected_tags

parse_error = None
live_payload = None
if live_text.strip():
    try:
        live_payload = json.loads(live_text)
    except Exception as error:
        parse_error = str(error)

state_parse_error = None
state_payload = None
if state_text.strip():
    try:
        state_payload = json.loads(state_text)
    except Exception as error:
        state_parse_error = str(error)

def collect_strings(value):
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        strings = []
        for key, item in value.items():
            strings.extend(collect_strings(key))
            strings.extend(collect_strings(item))
        return strings
    if isinstance(value, list):
        strings = []
        for item in value:
            strings.extend(collect_strings(item))
        return strings
    if value is None:
        return []
    return [str(value)]

packet_haystack = "\n".join(collect_strings(live_payload)) if live_payload is not None else live_text
state_haystack = "\n".join(collect_strings(state_payload)) if state_payload is not None else state_text
search_haystack = "\n".join([packet_haystack, state_haystack])
normalized_haystack = " ".join(search_haystack.split())

def contains_needle(needle):
    return bool(needle and (needle in search_haystack or " ".join(needle.split()) in normalized_haystack))

found = [needle for needle in required_needles if contains_needle(needle)]
missing = [needle for needle in required_needles if needle and not contains_needle(needle)]
matched_provenance = [needle for needle in provenance_options if contains_needle(needle)]
provenance_verified = bool(matched_provenance or not provenance_options)
if not provenance_verified:
    missing.extend(provenance_options)
title_visible = bool(expected_title and contains_needle(expected_title))

verified = bool((live_payload is not None or state_payload is not None) and expected_authorship in found and expected_review in found and source_anchor in found and provenance_verified and not missing)
evidence_sources = []
if live_payload is not None:
    evidence_sources.append("nest_writing_packet")
if state_payload is not None:
    evidence_sources.append("state.nest")

def iter_state_blocks(payload):
    if not isinstance(payload, dict):
        return []
    nest = payload.get("nest") if isinstance(payload.get("nest"), dict) else {}
    blocks = []
    selected = nest.get("selectedBlock")
    if isinstance(selected, dict):
        blocks.append(selected)
    selected_document = nest.get("selectedDocument")
    if isinstance(selected_document, dict):
        for block in selected_document.get("blocks", []) or []:
            if isinstance(block, dict):
                blocks.append(block)
    for block in nest.get("blocks", []) or []:
        if isinstance(block, dict):
            blocks.append(block)
    return blocks

matching_blocks = []
seen_block_ids = set()
for block in iter_state_blocks(state_payload):
    block_id = str(block.get("id", ""))
    if block_id in seen_block_ids:
        continue
    block_tags = block.get("tags") if isinstance(block.get("tags"), list) else []
    block_text = "\n".join(str(block.get(key, "")) for key in ["text", "textPreview", "provenanceNote"])
    block_haystack = " ".join(block_text.split())
    tags_match = all(tag in block_tags for tag in expected_tags)
    text_match = bool(source_anchor and source_anchor in block_haystack)
    if block.get("authorship") == expected_authorship and block.get("reviewStatus") == expected_review and tags_match:
        seen_block_ids.add(block_id)
        matching_blocks.append({
            "id": block_id,
            "role": block.get("role", ""),
            "episodeSlug": block.get("episodeSlug", ""),
            "reviewStatus": block.get("reviewStatus", ""),
            "textIdentityMatched": text_match,
            "selectCommand": f"script/agentctl.sh nest-select-block {block_id}" if block_id else "",
        })
packet = {
    "packetType": "quipsly-nest-ingest-receipt-check",
    "version": "2026-06-20.nest-ingest-receipt.v1",
    "projectSlug": queue.get("projectSlug"),
    "episodeSlug": queue.get("episodeSlug"),
    "generatedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
    "sourceQueue": queue_path,
    "queuedItemId": item.get("id"),
    "expectedTitle": expected_title,
    "titleVisibleInLiveState": title_visible,
    "titleProofPolicy": "Nest blocks currently persist text/provenance/tags/review state but not a separate block title field. Title visibility is useful, but source text identity is stronger proof for this model.",
    "expectedAuthorship": expected_authorship,
    "expectedReviewStatus": expected_review,
    "expectedTags": expected_tags,
    "expectedProvenance": expected_provenance,
    "expectedCommandProvenance": expected_command_provenance,
    "matchedProvenance": matched_provenance,
    "provenanceVerified": provenance_verified,
    "expectedSourcePath": expected_source_path,
    "expectedSourceAnchor": source_anchor,
    "livePacketReceived": bool(live_text.strip()),
    "livePacketParsed": live_payload is not None,
    "parseError": parse_error,
    "liveStateReceived": bool(state_text.strip()),
    "liveStateParsed": state_payload is not None,
    "stateParseError": state_parse_error,
    "evidenceSources": evidence_sources,
    "matchingLiveBlocks": matching_blocks,
    "matchingLiveBlockCount": len(matching_blocks),
    "matchedNeedles": found,
    "missingNeedles": missing,
    "status": "verified-live-nest-ingested" if verified else ("live-state-missing-or-unreadable" if live_payload is None and state_payload is None else "not-yet-proven-ingested"),
    "strongerProofWanted": [
        "Live Nest packet exposes a stable block id for the ingested draft.",
        "Live Nest packet exposes structured tags/authorship/reviewStatus fields per block.",
        "Receipt records the exact append command response and post-ingest packet path.",
    ],
    "blockedClaims": [
        "This receipt check does not canon-approve the draft.",
        "This receipt check does not publish, schedule, export, upload, or capture external receipts.",
        "String-match verification is a bridge until live Nest exposes stable structured block receipts.",
    ],
    "truth": "This receipt check compares the local Episode 1 Nest queue item to live Nest state. It prefers the Nest writing packet and falls back to /state.nest while the app exposes command-applied writing state there. It can prove expected strings are visible in live state, but it does not approve canon, publish, or replace stronger structured receipts.",
}

if mode in ("--json", "json"):
    print(json.dumps(packet, indent=2, sort_keys=True))
else:
    print("# Episode 1 Nest ingest receipt check")
    print("")
    print(packet["truth"])
    print("")
    print(f"- Status: `{packet['status']}`")
    print(f"- Live packet parsed: `{packet['livePacketParsed']}`")
    print(f"- Live state parsed: `{packet['liveStateParsed']}`")
    print(f"- Expected title: `{expected_title}`")
    print(f"- Matched: {len(found)}")
    print(f"- Missing: {len(missing)}")
    if missing:
        print("")
        print("## Missing evidence")
        for needle in missing:
            print(f"- `{needle}`")
    print("")
    print("## Stronger proof wanted")
    for item in packet["strongerProofWanted"]:
        print(f"- {item}")
PY
    rm -f "$packet_tmp" "$state_tmp"
    ;;
  episode1-writing-provenance|writing-provenance|episode1-writing-authorship)
    provenance_path="$ROOT_DIR/../../docs/quipsly/provenance-packets/episode-1-writing-provenance.json"
    provenance_path="$(cd "$(dirname "$provenance_path")" && pwd)/$(basename "$provenance_path")"
    python3 - "$provenance_path" "${2:-text}" <<'PY'
import json
import sys

path, mode = sys.argv[1:3]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)
payload["path"] = path

if mode in ("--json", "json"):
    print(json.dumps(payload, indent=2, sort_keys=True))
else:
    print("# Episode 1 writing provenance")
    print("")
    print(payload["truth"])
    print("")
    print(f"- Project: `{payload['projectSlug']}`")
    print(f"- Episode: `{payload['episodeSlug']}`")
    print(f"- Title: {payload['title']}")
    print(f"- Doctrine: `{payload['doctrinePath']}`")
    print("")
    print("## Artifacts")
    for artifact in payload["artifacts"]:
        print(f"- `{artifact['id']}`: {artifact['kind']} / {artifact['authorship']} / {artifact['intent']} / {artifact['reviewStatus']}")
        print(f"  Path: `{artifact['path']}`")
        print(f"  Truth: {artifact['truth']}")
    print("")
    print("## Blocked claims")
    for claim in payload["blockedClaims"]:
        print(f"- {claim}")
PY
    ;;
  episode1-writing-compare|writing-compare|episode1-writing-v1-v2-comparison)
    compare_path="$ROOT_DIR/../../docs/quipsly/review-packets/episode-1-writing-v1-v2-comparison.md"
    compare_path="$(cd "$(dirname "$compare_path")" && pwd)/$(basename "$compare_path")"
    if [[ "${2:-text}" == "--json" || "${2:-text}" == "json" ]]; then
      python3 - "$compare_path" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    markdown = handle.read()

print(json.dumps({
    "packetType": "quipsly-writing-comparison",
    "projectSlug": "high-ground-odyssey-manuscript",
    "episodeSlug": "episode-1",
    "title": "Episode 1 Writing Review: First Pass vs Second Pass",
    "path": path,
    "authorship": "agent-authored",
    "reviewStatus": "needs-human-review",
    "recommendation": "Use the second-pass draft as the current working draft for Episode 1 review.",
    "suggestedLedgerOutcome": "mixed-authorship-ready",
    "truth": "This comparison packet is a review aid. It does not approve canon, mutate Nest, publish, schedule, or capture external receipts.",
    "markdown": markdown,
}, indent=2, sort_keys=True))
PY
    else
      cat "$compare_path"
    fi
    ;;
  episode1-writing-current|writing-current|episode1-writing-current-candidate)
    current_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-writing-current-candidate.json"
    current_path="$(cd "$(dirname "$current_path")" && pwd)/$(basename "$current_path")"
    python3 - "$current_path" "${2:-text}" <<'PY'
import json
import sys

path, mode = sys.argv[1:3]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)
payload["path"] = path

if mode in ("--json", "json"):
    print(json.dumps(payload, indent=2, sort_keys=True))
else:
    print("# Episode 1 writing current candidate")
    print("")
    print(payload["truth"])
    print("")
    print(f"- Candidate: `{payload['currentCandidateId']}`")
    print(f"- Path: `{payload['currentCandidatePath']}`")
    print(f"- Authorship: `{payload['authorship']}`")
    print(f"- Review status: `{payload['reviewStatus']}`")
    print(f"- Canon status: `{payload['canonStatus']}`")
    print(f"- Publication status: `{payload['publicationStatus']}`")
    print("")
    print("## Why this candidate")
    for reason in payload["whyThisCandidate"]:
        print(f"- {reason}")
    print("")
    print("## Next actions")
    for action in payload["nextActions"]:
        print(f"- {action}")
PY
    ;;
  episode1-writing-loop-status|writing-loop-status|episode1-writing-status-summary)
    status_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-writing-loop-status.json"
    status_path="$(cd "$(dirname "$status_path")" && pwd)/$(basename "$status_path")"
    python3 - "$status_path" "${2:-text}" <<'PY'
import json
import sys

path, mode = sys.argv[1:3]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)
payload["path"] = path

if mode in ("--json", "json"):
    print(json.dumps(payload, indent=2, sort_keys=True))
else:
    print("# Episode 1 writing loop status")
    print("")
    print(payload["summary"])
    print("")
    state = payload["currentState"]
    for key in [
        "currentCandidate",
        "agentReviewOutcome",
        "humanReviewStatus",
        "nestIntakeStatus",
        "canonStatus",
        "towerPacketStatus",
        "publicationStatus",
        "receiptStatus",
    ]:
        print(f"- {key}: `{state[key]}`")
    print("")
    print("## Next human actions")
    for action in payload["nextHumanActions"]:
        print(f"- {action}")
    print("")
    print("## Truth")
    print(payload["truth"])
PY
    ;;
  episode1-writing-nest-intake|writing-nest-intake|episode1-writing-intake)
    intake_path="$ROOT_DIR/../../docs/quipsly/nest-intake/episode-1-writing-v2-nest-intake.json"
    intake_path="$(cd "$(dirname "$intake_path")" && pwd)/$(basename "$intake_path")"
    python3 - "$intake_path" "${2:-text}" <<'PY'
import json
import sys

path, mode = sys.argv[1:3]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)
payload["path"] = path

if mode in ("--json", "json"):
    print(json.dumps(payload, indent=2, sort_keys=True))
else:
    print("# Episode 1 Nest writing intake")
    print("")
    print(payload["truth"])
    print("")
    print(f"- Target Nest/project: `{payload['projectSlug']}`")
    print(f"- Episode: `{payload['episodeSlug']}`")
    print(f"- Source: `{payload['sourcePath']}`")
    print(f"- Authorship: `{payload['nestBlock']['authorship']}`")
    print(f"- Review status: `{payload['nestBlock']['reviewStatus']}`")
    print(f"- Canon status: `{payload['nestBlock']['canonStatus']}`")
    print("")
    print("## Safe ingest command")
    print("")
    print("```bash")
    print(payload["safeIngestCommand"])
    print("```")
    print("")
    print("## Human review prompts")
    for prompt in payload["humanReviewPrompt"]:
        print(f"- {prompt}")
PY
    ;;
  episode1-writing-human-handoff|writing-human-handoff|episode1-writing-human-review)
    handoff_path="$ROOT_DIR/../../docs/quipsly/review-packets/episode-1-human-writing-review-handoff.md"
    handoff_path="$(cd "$(dirname "$handoff_path")" && pwd)/$(basename "$handoff_path")"
    if [[ "${2:-text}" == "--json" || "${2:-text}" == "json" ]]; then
      python3 - "$handoff_path" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    markdown = handle.read()

print(json.dumps({
    "packetType": "quipsly-human-writing-review-handoff",
    "projectSlug": "high-ground-odyssey-manuscript",
    "episodeSlug": "episode-1",
    "title": "Episode 1 Human Writing Review Handoff",
    "path": path,
    "preparedBy": "Codex",
    "currentAgentReviewOutcome": "mixed-authorship-ready",
    "canonStatus": "not-canon-approved",
    "publicationStatus": "not-published",
    "receiptStatus": "no-external-receipts",
    "truth": "This handoff tells a human reviewer what to inspect next. It does not approve canon, mutate Nest, publish, schedule, or capture external receipts.",
    "markdown": markdown,
}, indent=2, sort_keys=True))
PY
    else
      cat "$handoff_path"
    fi
    ;;
  episode1-writing-draft-v2|writing-draft-v2|episode1-writing-second-pass)
    draft_path="$ROOT_DIR/../../docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-second-pass.md"
    draft_path="$(cd "$(dirname "$draft_path")" && pwd)/$(basename "$draft_path")"
    if [[ "${2:-text}" == "--json" || "${2:-text}" == "json" ]]; then
      python3 - "$draft_path" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    markdown = handle.read()

print(json.dumps({
    "packetType": "quipsly-writing-draft",
    "projectSlug": "high-ground-odyssey-manuscript",
    "episodeSlug": "episode-1",
    "title": "Episode 1 - The Wednesday Rule",
    "path": path,
    "authorship": "agent-authored",
    "creator": "Codex",
    "intent": "serious-second-pass",
    "reviewStatus": "needs-human-review",
    "canonStatus": "not-canon-approved",
    "publicationStatus": "not-published",
    "receiptStatus": "no-external-receipts",
    "truth": "This is serious second-pass creative work. It may be reviewed, revised, compared, or promoted later, but it is not canon-approved or published.",
    "markdown": markdown,
}, indent=2, sort_keys=True))
PY
    else
      cat "$draft_path"
    fi
    ;;
  episode1-writing-handoff|writing-vertical-slice-handoff|episode1-writing-vertical-slice-handoff)
    handoff_path="$ROOT_DIR/../../docs/quipsly/episode-1-writing-vertical-slice-handoff.md"
    handoff_path="$(cd "$(dirname "$handoff_path")" && pwd)/$(basename "$handoff_path")"
    if [[ "${2:-text}" == "--json" || "${2:-text}" == "json" ]]; then
      python3 - "$handoff_path" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    markdown = handle.read()

print(json.dumps({
    "packetType": "quipsly-writing-vertical-slice-handoff",
    "episodeSlug": "episode-1",
    "title": "Episode 1 writing vertical slice handoff",
    "path": path,
    "status": "wip-dogfood-map",
    "proofStatus": "not-validation-proof",
    "truth": "This maps the writing dogfood path. It does not validate app behavior, approve canon, publish, schedule, or capture receipts.",
    "nextCommands": [
        "script/agentctl.sh nest-serious-draft-file \"Episode 1 - The Wednesday Rule\" /Users/wall-e/Dev/high-ground-studio/docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-first-pass.md episode-1 \"book,writing,episode-1,agent-first-pass\" \"agent first-pass draft created to dogfood the Nest Studio Tower loop\"",
        "script/agentctl.sh publication-writing-packet --json"
    ],
    "markdown": markdown,
}, indent=2, sort_keys=True))
PY
    else
      cat "$handoff_path"
    fi
    ;;
  episode1-writing-review-checklist|writing-review-checklist|episode1-writing-checklist)
    checklist_path="$ROOT_DIR/../../docs/quipsly/episode-1-writing-review-checklist.md"
    checklist_path="$(cd "$(dirname "$checklist_path")" && pwd)/$(basename "$checklist_path")"
    if [[ "${2:-text}" == "--json" || "${2:-text}" == "json" ]]; then
      python3 - "$checklist_path" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    markdown = handle.read()

print(json.dumps({
    "packetType": "quipsly-writing-review-checklist",
    "episodeSlug": "episode-1",
    "title": "Episode 1 writing review checklist",
    "path": path,
    "status": "review-aid",
    "proofStatus": "not-canon-approval",
    "truth": "This checklist helps review agent-authored writing. It does not approve canon, publish, schedule, or capture receipts.",
    "outcomes": [
        "needs-agent-revision",
        "needs-human-rewrite",
        "mixed-authorship-ready",
        "canon-approved",
        "publication-ready"
    ],
    "markdown": markdown,
}, indent=2, sort_keys=True))
PY
    else
      cat "$checklist_path"
    fi
    ;;
  episode1-writing-review-bundle|writing-review-bundle|episode1-writing-bundle)
    draft_path="$ROOT_DIR/../../docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-first-pass.md"
    draft_v2_path="$ROOT_DIR/../../docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-second-pass.md"
    current_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-writing-current-candidate.json"
    loop_status_path="$ROOT_DIR/../../docs/quipsly/current-state/episode-1-writing-loop-status.json"
    intake_path="$ROOT_DIR/../../docs/quipsly/nest-intake/episode-1-writing-v2-nest-intake.json"
    nest_queue_path="$ROOT_DIR/../../docs/quipsly/nest-queue/episode-1-writing-v2-queue.json"
    tower_readiness_path="$ROOT_DIR/../../docs/quipsly/tower-readiness/episode-1-writing-tower-readiness.json"
    provenance_path="$ROOT_DIR/../../docs/quipsly/provenance-packets/episode-1-writing-provenance.json"
    human_handoff_path="$ROOT_DIR/../../docs/quipsly/review-packets/episode-1-human-writing-review-handoff.md"
    handoff_path="$ROOT_DIR/../../docs/quipsly/episode-1-writing-vertical-slice-handoff.md"
    checklist_path="$ROOT_DIR/../../docs/quipsly/episode-1-writing-review-checklist.md"
    packet_path="$ROOT_DIR/../../docs/quipsly/publication-packets/hgo-episode-1-the-wednesday-rule-writing-publication-packet.md"
    packet_v2_path="$ROOT_DIR/../../docs/quipsly/publication-packets/hgo-episode-1-the-wednesday-rule-writing-publication-packet-v2.md"
    destination_copy_path="$ROOT_DIR/../../docs/quipsly/publication-packets/hgo-episode-1-the-wednesday-rule-destination-copy-packet.md"
    compare_path="$ROOT_DIR/../../docs/quipsly/review-packets/episode-1-writing-v1-v2-comparison.md"
    ledger_path="$ROOT_DIR/../../docs/quipsly/review-ledgers/episode-1-writing-review-ledger.jsonl"
    draft_path="$(cd "$(dirname "$draft_path")" && pwd)/$(basename "$draft_path")"
    draft_v2_path="$(cd "$(dirname "$draft_v2_path")" && pwd)/$(basename "$draft_v2_path")"
    current_path="$(cd "$(dirname "$current_path")" && pwd)/$(basename "$current_path")"
    loop_status_path="$(cd "$(dirname "$loop_status_path")" && pwd)/$(basename "$loop_status_path")"
    intake_path="$(cd "$(dirname "$intake_path")" && pwd)/$(basename "$intake_path")"
    nest_queue_path="$(cd "$(dirname "$nest_queue_path")" && pwd)/$(basename "$nest_queue_path")"
    tower_readiness_path="$(cd "$(dirname "$tower_readiness_path")" && pwd)/$(basename "$tower_readiness_path")"
    provenance_path="$(cd "$(dirname "$provenance_path")" && pwd)/$(basename "$provenance_path")"
    human_handoff_path="$(cd "$(dirname "$human_handoff_path")" && pwd)/$(basename "$human_handoff_path")"
    handoff_path="$(cd "$(dirname "$handoff_path")" && pwd)/$(basename "$handoff_path")"
    checklist_path="$(cd "$(dirname "$checklist_path")" && pwd)/$(basename "$checklist_path")"
    packet_path="$(cd "$(dirname "$packet_path")" && pwd)/$(basename "$packet_path")"
    packet_v2_path="$(cd "$(dirname "$packet_v2_path")" && pwd)/$(basename "$packet_v2_path")"
    destination_copy_path="$(cd "$(dirname "$destination_copy_path")" && pwd)/$(basename "$destination_copy_path")"
    compare_path="$(cd "$(dirname "$compare_path")" && pwd)/$(basename "$compare_path")"
    ledger_path="$(cd "$(dirname "$ledger_path")" && pwd)/$(basename "$ledger_path")"
    python3 - "$draft_path" "$draft_v2_path" "$current_path" "$loop_status_path" "$intake_path" "$nest_queue_path" "$tower_readiness_path" "$provenance_path" "$human_handoff_path" "$handoff_path" "$checklist_path" "$packet_path" "$packet_v2_path" "$destination_copy_path" "$compare_path" "$ledger_path" "${2:-text}" <<'PY'
import json
import sys

draft_path, draft_v2_path, current_path, loop_status_path, intake_path, nest_queue_path, tower_readiness_path, provenance_path, human_handoff_path, handoff_path, checklist_path, packet_path, packet_v2_path, destination_copy_path, compare_path, ledger_path, mode = sys.argv[1:18]

def read(path):
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()

payload = {
    "packetType": "quipsly-writing-review-bundle",
    "episodeSlug": "episode-1",
    "title": "Episode 1 writing review bundle",
    "status": "wip-dogfood-review-package",
    "proofStatus": "not-live-validation-proof",
    "truth": "This bundle collects the writing draft, handoff, checklist, and Tower packet. It does not approve canon, publish, schedule, validate app behavior, or capture receipts.",
    "paths": {
        "draft": draft_path,
        "draftV2": draft_v2_path,
        "currentCandidate": current_path,
        "loopStatus": loop_status_path,
        "nestIntake": intake_path,
        "nestQueue": nest_queue_path,
        "towerReadiness": tower_readiness_path,
        "provenance": provenance_path,
        "humanReviewHandoff": human_handoff_path,
        "handoff": handoff_path,
        "checklist": checklist_path,
        "towerPacket": packet_path,
        "towerPacketV2": packet_v2_path,
        "destinationCopy": destination_copy_path,
        "comparison": compare_path,
        "reviewLedger": ledger_path,
    },
    "commands": {
        "ingestDraftIntoNest": 'script/agentctl.sh nest-serious-draft-file "Episode 1 - The Wednesday Rule" /Users/wall-e/Dev/high-ground-studio/docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-first-pass.md episode-1 "book,writing,episode-1,agent-first-pass" "agent first-pass draft created to dogfood the Nest Studio Tower loop"',
        "ingestSecondPassIntoNest": 'script/agentctl.sh nest-serious-draft-file "Episode 1 - The Wednesday Rule - Second Pass" /Users/wall-e/Dev/high-ground-studio/docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-second-pass.md episode-1 "book,writing,episode-1,agent-second-pass,needs-human-review,current-candidate" "agent second-pass draft created after content partner doctrine clarification"',
        "inspectLocalNestQueue": "script/agentctl.sh episode1-writing-nest-queue --json",
        "inspectLoopStatus": "script/agentctl.sh episode1-writing-loop-status --json",
        "inspectCurrentCandidate": "script/agentctl.sh episode1-writing-current --json",
        "inspectNestIntake": "script/agentctl.sh episode1-writing-nest-intake --json",
        "inspectTowerReadiness": "script/agentctl.sh episode1-writing-tower-readiness --json",
        "inspectHumanReviewHandoff": "script/agentctl.sh episode1-writing-human-handoff --json",
        "inspectSecondPass": "script/agentctl.sh episode1-writing-draft-v2 --json",
        "inspectComparison": "script/agentctl.sh episode1-writing-compare --json",
        "inspectProvenance": "script/agentctl.sh episode1-writing-provenance --json",
        "inspectHandoff": "script/agentctl.sh episode1-writing-handoff --json",
        "inspectChecklist": "script/agentctl.sh episode1-writing-review-checklist --json",
        "inspectTowerPacket": "script/agentctl.sh publication-writing-packet --json",
        "inspectTowerPacketV2": "script/agentctl.sh publication-writing-packet-v2 --json",
        "inspectDestinationCopy": "script/agentctl.sh publication-destination-copy --json",
        "inspectReviewLedger": "script/agentctl.sh episode1-writing-review-ledger --json",
        "inspectReviewStatus": "script/agentctl.sh episode1-writing-review-status --json",
        "recordReviewDecision": "script/agentctl.sh episode1-writing-review-decision needs-agent-revision Codex \"what should change next\"",
    },
    "reviewOutcomes": [
        "needs-agent-revision",
        "needs-human-rewrite",
        "mixed-authorship-ready",
        "canon-approved",
        "publication-ready",
    ],
}

if mode in ("--json", "json"):
    payload["markdown"] = {
        "draft": read(draft_path),
        "draftV2": read(draft_v2_path),
        "currentCandidate": json.loads(read(current_path)),
        "loopStatus": json.loads(read(loop_status_path)),
        "nestIntake": json.loads(read(intake_path)),
        "nestQueue": json.loads(read(nest_queue_path)),
        "towerReadiness": json.loads(read(tower_readiness_path)),
        "provenance": json.loads(read(provenance_path)),
        "humanReviewHandoff": read(human_handoff_path),
        "comparison": read(compare_path),
        "handoff": read(handoff_path),
        "checklist": read(checklist_path),
        "towerPacket": read(packet_path),
        "towerPacketV2": read(packet_v2_path),
        "destinationCopy": read(destination_copy_path),
    }
    payload["reviewLedger"] = read(ledger_path) if ledger_path else ""
    print(json.dumps(payload, indent=2, sort_keys=True))
else:
    print("# Episode 1 writing review bundle")
    print("")
    print(payload["truth"])
    print("")
    print("## Paths")
    for key, value in payload["paths"].items():
        print(f"- {key}: `{value}`")
    print("")
    print("## Commands")
    for key, value in payload["commands"].items():
        print(f"- {key}: `{value}`")
    print("")
    print("## Review outcomes")
    for outcome in payload["reviewOutcomes"]:
        print(f"- `{outcome}`")
PY
    ;;
  episode1-writing-review-ledger|writing-review-ledger|episode1-writing-ledger)
    ledger_path="$ROOT_DIR/../../docs/quipsly/review-ledgers/episode-1-writing-review-ledger.jsonl"
    ledger_path="$(cd "$(dirname "$ledger_path")" && pwd)/$(basename "$ledger_path")"
    python3 - "$ledger_path" "${2:-text}" <<'PY'
import json
import sys

ledger_path, mode = sys.argv[1:3]
records = []
with open(ledger_path, "r", encoding="utf-8") as handle:
    for line_number, line in enumerate(handle, start=1):
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except Exception as exc:
            records.append({
                "type": "invalid-ledger-line",
                "line": line_number,
                "error": str(exc),
                "raw": line,
            })

payload = {
    "packetType": "quipsly-writing-review-ledger",
    "episodeSlug": "episode-1",
    "title": "Episode 1 writing review ledger",
    "path": ledger_path,
    "recordCount": len(records),
    "latest": records[-1] if records else {},
    "records": records,
    "truth": "This ledger records local review decisions. It does not mutate Nest canon, publish, schedule, or capture external platform receipts.",
}

if mode in ("--json", "json"):
    print(json.dumps(payload, indent=2, sort_keys=True))
else:
    print("# Episode 1 writing review ledger")
    print("")
    print(payload["truth"])
    print("")
    print(f"- Path: `{ledger_path}`")
    print(f"- Record count: `{len(records)}`")
    if records:
        latest = records[-1]
        print(f"- Latest outcome: `{latest.get('outcome', 'unknown')}`")
        print(f"- Latest actor: `{latest.get('actor', 'unknown')}`")
        print(f"- Latest note: {latest.get('note', '')}")
PY
    ;;
  episode1-writing-review-status|writing-review-status|episode1-writing-status)
    ledger_path="$ROOT_DIR/../../docs/quipsly/review-ledgers/episode-1-writing-review-ledger.jsonl"
    ledger_path="$(cd "$(dirname "$ledger_path")" && pwd)/$(basename "$ledger_path")"
    python3 - "$ledger_path" "${2:-text}" <<'PY'
import json
import sys

ledger_path, mode = sys.argv[1:3]
records = []
with open(ledger_path, "r", encoding="utf-8") as handle:
    for line_number, line in enumerate(handle, start=1):
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except Exception as exc:
            records.append({
                "outcome": "ledger-parse-error",
                "actor": "system",
                "line": line_number,
                "note": str(exc),
            })

latest = records[-1] if records else {}
latest_outcome = latest.get("outcome", "")
latest_actor = latest.get("actor", "")

status_by_outcome = {
    "needs-agent-revision": "needs-agent-revision",
    "needs-human-rewrite": "needs-human-rewrite",
    "mixed-authorship-ready": "mixed-authorship-ready",
    "canon-approved": "canon-approved-not-publication-ready",
    "publication-ready": "publication-ready-not-published",
    "ledger-parse-error": "ledger-parse-error",
}

next_action_by_status = {
    "needs-review-decision": "Inspect the review bundle, read the draft, then record the first review decision.",
    "needs-agent-revision": "Revise the agent-authored draft, then record another review decision.",
    "needs-human-rewrite": "Route the draft to human rewrite or human-led revision before canon approval.",
    "mixed-authorship-ready": "Review human and agent contributions together, then decide whether it is canon-approved.",
    "canon-approved-not-publication-ready": "Inspect the Tower packet and decide whether the writing packet is publication-ready.",
    "publication-ready-not-published": "Move to Tower posting or scheduling, then capture real external publication receipts after posting.",
    "ledger-parse-error": "Repair the review ledger before using it as a status source.",
}

current_status = status_by_outcome.get(latest_outcome, "needs-review-decision")
payload = {
    "packetType": "quipsly-writing-review-status",
    "projectSlug": "high-ground-odyssey-manuscript",
    "episodeSlug": "episode-1",
    "title": "The Wednesday Rule",
    "ledgerPath": ledger_path,
    "recordCount": len(records),
    "latestOutcome": latest_outcome or None,
    "latestActor": latest_actor or None,
    "currentStatus": current_status,
    "nextAction": next_action_by_status[current_status],
    "truth": [
        "This status is inferred from the local writing review ledger.",
        "It does not mutate Nest canon text.",
        "It does not mark anything published.",
        "It does not create external platform receipts.",
    ],
}

if mode in ("--json", "json"):
    print(json.dumps(payload, indent=2, sort_keys=True))
else:
    print("# Episode 1 writing review status")
    print("")
    print(f"- Current status: `{payload['currentStatus']}`")
    print(f"- Latest outcome: `{payload['latestOutcome'] or 'none'}`")
    print(f"- Latest actor: `{payload['latestActor'] or 'none'}`")
    print(f"- Ledger records: `{payload['recordCount']}`")
    print(f"- Next action: {payload['nextAction']}")
    print(f"- Ledger: `{payload['ledgerPath']}`")
    print("")
    print("Truth: review status only; no canon mutation, publication, or external receipt.")
PY
    ;;
  episode1-writing-review-decision|writing-review-decision|episode1-writing-decision)
    outcome="${2:-}"
    actor="${3:-Codex}"
    note="${4:-}"
    if [[ -z "$outcome" ]]; then
      echo "usage: script/agentctl.sh episode1-writing-review-decision needs-agent-revision|needs-human-rewrite|mixed-authorship-ready|canon-approved|publication-ready [actor] [note]" >&2
      exit 2
    fi
    ledger_path="$ROOT_DIR/../../docs/quipsly/review-ledgers/episode-1-writing-review-ledger.jsonl"
    ledger_path="$(cd "$(dirname "$ledger_path")" && pwd)/$(basename "$ledger_path")"
    mkdir -p "$(dirname "$ledger_path")"
    python3 - "$ledger_path" "$outcome" "$actor" "$note" <<'PY'
import datetime
import json
import sys

ledger_path, outcome, actor, note = sys.argv[1:5]
allowed = {
    "needs-agent-revision",
    "needs-human-rewrite",
    "mixed-authorship-ready",
    "canon-approved",
    "publication-ready",
}
if outcome not in allowed:
    raise SystemExit(f"invalid outcome: {outcome}")

record = {
    "type": "episode-1-writing-review-decision",
    "episodeSlug": "episode-1",
    "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
    "actor": actor,
    "outcome": outcome,
    "note": note,
    "draftPath": "/Users/wall-e/Dev/high-ground-studio/docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-first-pass.md",
    "handoffPath": "/Users/wall-e/Dev/high-ground-studio/docs/quipsly/episode-1-writing-vertical-slice-handoff.md",
    "checklistPath": "/Users/wall-e/Dev/high-ground-studio/docs/quipsly/episode-1-writing-review-checklist.md",
    "towerPacketPath": "/Users/wall-e/Dev/high-ground-studio/docs/quipsly/publication-packets/hgo-episode-1-the-wednesday-rule-writing-publication-packet.md",
    "truth": "This records a review decision receipt. It does not mutate Nest canon, publish, schedule, or capture external platform receipts.",
}
with open(ledger_path, "a", encoding="utf-8") as handle:
    handle.write(json.dumps(record, sort_keys=True) + "\n")

print(json.dumps({
    "status": "recorded",
    "ledgerPath": ledger_path,
    "record": record,
}, indent=2, sort_keys=True))
PY
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
  edit-target|edit-target-recommendation|next-edit-target)
    curl --fail --silent --show-error "$BASE_URL/state" | python3 -c '
import json, sys
payload = json.load(sys.stdin)
recommendation = payload.get("editTargetRecommendation")
if not recommendation:
    print(json.dumps({
        "status": "missing_edit_target_recommendation",
        "hint": "Open QuipslyStudio, load or restore a native session, then run agentctl edit-target again."
    }, indent=2, sort_keys=True))
else:
    print(json.dumps(recommendation, indent=2, sort_keys=True))
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
  apply-edit-plan)
    path="${2:-}"
    save_name="${3:-}"
    backup_name="${4:-}"
    if [[ -z "$path" ]]; then
      usage
      exit 2
    fi
    query="/apply_edit_plan?path=$(urlencode "$path")"
    if [[ -n "$save_name" ]]; then
      query="$query&save_name=$(urlencode "$save_name")"
    fi
    if [[ -n "$backup_name" ]]; then
      query="$query&backup_name=$(urlencode "$backup_name")"
    fi
    get "$query"
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
  nest-seed-context|nest-seed)
    get "/nest_seed_context"
    ;;
  nest-ensure-writing-document|nest-start-writing|nest-writing-layer)
    get "/nest_ensure_writing_document"
    ;;
  nest-writing-queue|nest-next-actions)
    get "/nest_writing_queue"
    ;;
  nest-writing-packet|nest-manuscript-packet)
    get "/nest_writing_packet"
    ;;
  nest-writing-packet-generate|nest-manuscript-packet-generate)
    directory="${2:-}"
    basename="${3:-quipsly-nest-writing}"
    get "/nest_writing_packet_generate?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")"
    ;;
  nest-writing-review|nest-manuscript-review)
    nest_writing_review "${2:-}" "${3:-text}"
    ;;
  nest-writing-smoke|nest-smoke)
    nest_writing_smoke
    ;;
  nest-writing-next-action|nest-do-next|nest-next-action)
    index="${2:-1}"
    kind="${3:-}"
    get "/nest_writing_next_action?index=$(urlencode "$index")&kind=$(urlencode "$kind")"
    ;;
  nest-outline)
    get "/state" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin).get("nest",{}).get("outline",{}), indent=2))'
    ;;
  nest-append-block)
    title="${2:-}"
    text="${3:-}"
    tags="${4:-book,episode-context}"
    role="${5:-writing}"
    episode="${6:-}"
    authorship="${7:-agent-authored}"
    provenance="${8:-Added by Codex through agentctl Nest capture. Review before canon promotion.}"
    review_status="${9:-agent-first-pass}"
    if [[ -z "$text" ]]; then
      usage
      exit 2
    fi
    get "/nest_append_block?title=$(urlencode "$title")&text=$(urlencode "$text")&tags=$(urlencode "$tags")&role=$(urlencode "$role")&episode=$(urlencode "$episode")&authorship=$(urlencode "$authorship")&provenance=$(urlencode "$provenance")&review_status=$(urlencode "$review_status")"
    ;;
  nest-serious-draft|nest-agent-draft|nest-first-pass)
    title="${2:-}"
    text="${3:-}"
    episode="${4:-episode-1}"
    tags="${5:-book,writing,episode-1,agent-first-pass}"
    provenance="${6:-Serious first-pass draft created by Codex/Quipsly to move the Nest Studio Tower loop forward. Review before canon promotion.}"
    review_status="${7:-}"
    if [[ -z "$review_status" ]]; then
      if [[ ",$tags," == *",needs-human-review,"* ]]; then
        review_status="needs-human-review"
      else
        review_status="agent-first-pass"
      fi
    fi
    if [[ -z "$title" || -z "$text" ]]; then
      usage
      exit 2
    fi
    get "/nest_append_block?title=$(urlencode "$title")&text=$(urlencode "$text")&tags=$(urlencode "$tags")&role=writing&episode=$(urlencode "$episode")&authorship=agent-authored&provenance=$(urlencode "$provenance")&review_status=$(urlencode "$review_status")"
    ;;
  nest-serious-draft-file|nest-agent-draft-file|nest-first-pass-file)
    title="${2:-}"
    draft_path="${3:-}"
    episode="${4:-episode-1}"
    tags="${5:-book,writing,episode-1,agent-first-pass}"
    provenance="${6:-Serious first-pass draft loaded from a repo/local file by Codex/Quipsly to move the Nest Studio Tower loop forward. Review before canon promotion.}"
    review_status="${7:-}"
    if [[ -z "$review_status" ]]; then
      if [[ ",$tags," == *",needs-human-review,"* ]]; then
        review_status="needs-human-review"
      else
        review_status="agent-first-pass"
      fi
    fi
    if [[ -z "$title" || -z "$draft_path" || ! -f "$draft_path" ]]; then
      usage
      exit 2
    fi
    text="$(cat "$draft_path")"
    if [[ -z "${text//[[:space:]]/}" ]]; then
      echo "Draft file is empty: $draft_path" >&2
      exit 2
    fi
    get "/nest_append_block?title=$(urlencode "$title")&text=$(urlencode "$text")&tags=$(urlencode "$tags")&role=writing&episode=$(urlencode "$episode")&authorship=agent-authored&provenance=$(urlencode "$provenance")&review_status=$(urlencode "$review_status")"
    ;;
  nest-mark-block)
    status="${2:-needs-human-review}"
    note="${3:-Marked by Codex through agentctl Nest review-state route.}"
    block_id="${4:-}"
    get "/nest_mark_block?status=$(urlencode "$status")&note=$(urlencode "$note")&block_id=$(urlencode "$block_id")"
    ;;
  nest-select-block)
    block_id="${2:-}"
    if [[ -z "$block_id" ]]; then
      usage
      exit 2
    fi
    get "/nest_select_block?block_id=$(urlencode "$block_id")"
    ;;
  nest-update-block)
    block_id="${2:-}"
    role="${3:-}"
    tags="${4:-}"
    episode="${5:-}"
    chapter="${6:-}"
    note="${7:-Structured by Codex through agentctl Nest structure route.}"
    if [[ -z "$block_id" ]]; then
      usage
      exit 2
    fi
    get "/nest_update_block?block_id=$(urlencode "$block_id")&role=$(urlencode "$role")&tags=$(urlencode "$tags")&episode=$(urlencode "$episode")&chapter=$(urlencode "$chapter")&note=$(urlencode "$note")"
    ;;
  nest-replace-block-text)
    block_id="${2:-}"
    text="${3:-}"
    note="${4:-Revised by Codex through agentctl Nest text route.}"
    review_status="${5:-}"
    if [[ -z "$block_id" || -z "$text" ]]; then
      usage
      exit 2
    fi
    get "/nest_replace_block_text?block_id=$(urlencode "$block_id")&text=$(urlencode "$text")&note=$(urlencode "$note")&review_status=$(urlencode "$review_status")"
    ;;
  production-command-center-native)
    mode="${2:-fast}"
    should_open="${3:-false}"
    get "/production_command_center?mode=$(urlencode "$mode")&open=$(urlencode "$should_open")"
    ;;
  production-command-center-open)
    get "/production_command_center_open"
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
  transcript-search)
    query="${2:-}"
    mode="${3:-next}"
    get "/transcript_search?query=$(urlencode "$query")&mode=$(urlencode "$mode")"
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
  transcript-word)
    mode="${2:-current}"
    segment_id="${3:-}"
    index="${4:-}"
    path="/transcript_word?mode=$(urlencode "$mode")"
    if [[ -n "$segment_id" ]]; then
      path="$path&segment_id=$(urlencode "$segment_id")"
    fi
    if [[ -n "$index" ]]; then
      path="$path&index=$(urlencode "$index")"
    fi
    get "$path"
    ;;
  transcript-create-short)
    mode="${2:-current}"
    title="${3:-}"
    padding_before="${4:-1}"
    padding_after="${5:-2}"
    actor="${6:-Codex}"
    actor_type="${7:-agent}"
    get "/transcript_create_short?mode=$(urlencode "$mode")&title=$(urlencode "$title")&padding_before=$(urlencode "$padding_before")&padding_after=$(urlencode "$padding_after")&actor=$(urlencode "$actor")&actor_type=$(urlencode "$actor_type")"
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
  edit-pass)
    label="${2:-Codex editing pass}"
    actor="${3:-Codex}"
    actor_type="${4:-agent}"
    pass_number="${5:-1}"
    goal="${6:-Review and improve the episode edit.}"
    status="${7:-active}"
    note="${8:-Marked editing pass through agentctl.}"
    get "/edit_pass?label=$(urlencode "$label")&actor=$(urlencode "$actor")&actor_type=$(urlencode "$actor_type")&pass_number=$(urlencode "$pass_number")&goal=$(urlencode "$goal")&status=$(urlencode "$status")&note=$(urlencode "$note")"
    ;;
  correction-note)
    note="${2:-Codex correction note.}"
    actor="${3:-Codex}"
    actor_type="${4:-agent}"
    category="${5:-edit-correction}"
    get "/correction_note?note=$(urlencode "$note")&actor=$(urlencode "$actor")&actor_type=$(urlencode "$actor_type")&category=$(urlencode "$category")"
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
  shorts-publication-proof|shorts-proof)
    get "/editor_loop_proof"
    ;;
  shorts-queue-summary)
    shorts_queue_summary
    ;;
  shorts-local-export-board|shorts-export-board)
    shorts_local_export_board "$@"
    ;;
  shorts-growth-quality-board|shorts-growth-board|shorts-quality-board)
    shorts_growth_quality_board "$@"
    ;;
  shorts-platform-package-board|shorts-package-board)
    shorts_platform_package_board "$@"
    ;;
  shorts-improvement-plan|shorts-improve-board)
    shorts_improvement_plan "$@"
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
  shorts-select)
    selector="${2:-}"
    value="${3:-}"
    if [[ -z "$selector" || -z "$value" ]]; then
      usage
      exit 2
    fi
    case "$selector" in
      id)
        get "/shorts_queue_select?id=$(urlencode "$value")"
        ;;
      title)
        get "/shorts_queue_select?title=$(urlencode "$value")"
        ;;
      index|rank)
        get "/shorts_queue_select?index=$(urlencode "$value")"
        ;;
      *)
        usage
        exit 2
        ;;
    esac
    ;;
  ship-short-review)
    selector="${2:-}"
    value="${3:-}"
    if [[ -z "$selector" || -z "$value" ]]; then
      usage
      exit 2
    fi
    case "$selector" in
      id)
        get "/shorts_queue_select?id=$(urlencode "$value")" >/dev/null
        ;;
      title)
        get "/shorts_queue_select?title=$(urlencode "$value")" >/dev/null
        ;;
      index|rank)
        get "/shorts_queue_select?index=$(urlencode "$value")" >/dev/null
        ;;
      *)
        usage
        exit 2
        ;;
    esac
    get "/left_workbench?mode=shorts"
    ;;
  ship-short-cue)
    selector="${2:-}"
    value="${3:-}"
    if [[ -z "$selector" || -z "$value" ]]; then
      usage
      exit 2
    fi
    case "$selector" in
      id)
        get "/shorts_queue_select?id=$(urlencode "$value")" >/dev/null
        ;;
      title)
        get "/shorts_queue_select?title=$(urlencode "$value")" >/dev/null
        ;;
      index|rank)
        get "/shorts_queue_select?index=$(urlencode "$value")" >/dev/null
        ;;
      *)
        usage
        exit 2
        ;;
    esac
    get "/left_workbench?mode=shorts" >/dev/null
    get "/shorts_preview_selected?play=false"
    ;;
  shorts-append-selected-segment)
    get "/shorts_queue_append_selected_segment"
    ;;
  shorts-review-next)
    status="${2:-}"
    get "/shorts_review_next?status=$(urlencode "$status")"
    ;;
  shorts-review-navigator|shorts-navigator)
    shorts_review_navigator
    ;;
  shorts-review-run-next|shorts-navigator-run-next)
    shorts_review_run_next
    ;;
  shorts-review-cue-next|shorts-navigator-cue-next)
    shorts_review_cue_next "${2:-}"
    ;;
  shorts-review-listen-guide|shorts-listen-guide)
    shorts_review_listen_guide "${2:-}"
    ;;
  shorts-audio-sanity)
    shorts_audio_sanity "$@"
    ;;
  shorts-audio-sanity-next)
    shorts_audio_sanity_next
    ;;
  shorts-listen-review-packet|shorts-review-packet)
    shorts_listen_review_packet "$@"
    ;;
  shorts-listen-review-path|shorts-review-path)
    shorts_listen_review_path
    ;;
  shorts-listen-review-open|shorts-review-open)
    shorts_listen_review_open
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
  shorts-quality-action|shorts-polish-action)
    action="${2:-}"
    if [[ -z "$action" ]]; then
      usage
      exit 2
    fi
    get "/shorts_quality_action?action=$(urlencode "$action")"
    ;;
  shorts-platform-pack-index|shorts-pack-index|shorts-sequence-platform-pack)
    action="${2:-save}"
    get "/shorts_platform_pack_index?action=$(urlencode "$action")"
    ;;
  shorts-overlay-burn-in|shorts-text-burn-in)
    shorts_overlay_burn_in "${2:-}" "${3:-}"
    ;;
  shorts-listen-through)
    notes="${2:-}"
    get "/shorts_listen_through?note=$(urlencode "$notes")"
    ;;
  shorts-text-review)
    decision="${2:-}"
    notes="${3:-}"
    if [[ -z "$decision" ]]; then
      usage
      exit 2
    fi
    get "/shorts_text_review?decision=$(urlencode "$decision")&note=$(urlencode "$notes")"
    ;;
  shorts-review-selected)
    status="${2:-}"
    notes="${3:-}"
    if [[ -z "$status" ]]; then
      usage
      exit 2
    fi
    get "/shorts_review_selected?status=$(urlencode "$status")&notes=$(urlencode "$notes")"
    ;;
  shorts-review)
    id="${2:-}"
    status="${3:-}"
    notes="${4:-}"
    if [[ -z "$id" || -z "$status" ]]; then
      usage
      exit 2
    fi
    get "/shorts_review?id=$(urlencode "$id")&status=$(urlencode "$status")&notes=$(urlencode "$notes")"
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
    selector_query="$(selected_short_export_selector_query || true)"
    get "/shorts_export_selected?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")${selector_query}"
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
  shorts-contact-sheet)
    video_path="${2:-}"
    output_path="${3:-}"
    if [[ -z "$video_path" ]]; then
      usage
      exit 2
    fi
    contact_result="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-contact-sheet-result.XXXXXX")"
    if "$ROOT_DIR/script/shorts_contact_sheet.sh" "$video_path" "$output_path" | tee "$contact_result"; then
      contact_output_path="$(python3 - "$contact_result" <<'PY' || true
import json
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        payload = json.load(handle)
    print(payload.get("output", ""))
except Exception:
    print("")
PY
)"
      visual_proof_recorded="false"
      if [[ -n "$contact_output_path" ]]; then
        if ! get "/shorts_visual_review?sheet=$(urlencode "$contact_output_path")&source=$(urlencode "$video_path")&note=$(urlencode "contact sheet generated; visual proof recorded, not publishing approval")" >/dev/null; then
          printf 'Warning: contact sheet generated but visual proof could not be recorded in the running app state.\n' >&2
        else
          visual_proof_recorded="true"
        fi
      else
        printf 'Warning: contact sheet generated but output path could not be parsed for app-state proof.\n' >&2
      fi
      python3 - "$contact_result" "$video_path" "$contact_output_path" "$visual_proof_recorded" <<'PY'
import json
import os
import sys

result_path, source_path, output_path, proof_recorded = sys.argv[1:]
try:
    with open(result_path, encoding="utf-8") as handle:
        payload = json.load(handle)
except Exception as error:
    payload = {"status": "generated_but_unparsed", "parseError": str(error)}

source = payload.get("input") or source_path
image = payload.get("output") or output_path
payload.update({
    "outputPath": image,
    "imagePath": image,
    "sourcePath": source,
    "sourceExists": bool(source) and os.path.exists(source),
    "imageExists": bool(image) and os.path.exists(image),
    "visualProofRecorded": proof_recorded == "true",
    "nextAction": "Inspect the contact sheet and listen to the derivative before marking keep/refine/reject.",
    "truth": "Contact sheet proof is visual-only. It does not mark listen-through complete and does not approve publishing."
})
print(json.dumps(payload, indent=2, sort_keys=True))
PY
      rm -f "$contact_result"
    else
      status=$?
      rm -f "$contact_result"
      exit "$status"
    fi
    ;;
  review-shorts-import)
    decisions_path="${2:-}"
    shift 2 || true
    if [[ -z "$decisions_path" ]]; then
      usage
      exit 2
    fi
    python3 "$ROOT_DIR/script/import_review_short_decisions.py" "$decisions_path" "$@"
    ;;
  short-review-template)
    shift || true
    python3 "$ROOT_DIR/script/export_short_review_decision_template.py" "$@"
    ;;
  production-command-center)
    shift || true
    python3 "$ROOT_DIR/script/generate_episode_command_center.py" "$@"
    ;;
  episodes-social-readiness)
    shift || true
    python3 "$ROOT_DIR/script/audit_episode_social_readiness.py" "$@"
    ;;
  episodes-release-readiness)
    shift || true
    python3 "$ROOT_DIR/script/audit_episode_release_readiness.py" "$@"
    ;;
  reviewed-social-queue)
    shift || true
    python3 "$ROOT_DIR/script/build_reviewed_social_queue.py" "$@"
    ;;
  reviewed-social-queue-generate)
    directory="${2:-}"
    basename="${3:-}"
    if [[ -z "$directory" ]]; then
      usage
      exit 2
    fi
    get "/reviewed_social_queue_generate?directory=$(urlencode "$directory")&basename=$(urlencode "$basename")"
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
  social-master-queue-load-latest)
    get "/social_master_queue_load_latest"
    ;;
  social-master-queue-promote-receipts)
    get "/social_master_queue_promote_receipts"
    ;;
  social-master-copy-receipt-commands)
    get "/social_master_queue_copy_receipt_commands"
    ;;
  social-master-copy-receipt-command)
    get "/social_master_queue_copy_receipt_command"
    ;;
  social-master-copy-posting-session)
    get "/social_master_queue_copy_posting_session"
    ;;
  social-master-posting-run-packet)
    get "/social_master_queue_posting_run_packet"
    ;;
  social-master-open-posting-run-packet)
    get "/social_master_queue_open_posting_run_packet"
    ;;
  social-master-reveal-posting-run-packet)
    get "/social_master_queue_reveal_posting_run_packet"
    ;;
  social-master-select-receipt-platform)
    platform="${2:-}"
    status="${3:-published}"
    if [[ -z "$platform" ]]; then
      usage
      exit 2
    fi
    get "/social_master_queue_select_receipt_platform?platform=$(urlencode "$platform")&status=$(urlencode "$status")"
    ;;
  social-master-select-next-posting-platform)
    get "/social_master_queue_select_next_posting_platform"
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
  social-master-queue-receipt-batch)
    rows="${2:-}"
    if [[ -z "$rows" ]]; then
      usage
      exit 2
    fi
    get "/social_master_queue_receipt_batch?rows=$(urlencode "$rows")"
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
  podcast-copy-receipt-commands|podcast-copy-commands)
    get "/podcast_copy_receipt_commands"
    ;;
  episode-copy-receipt-commands|episode-copy-commands)
    get "/episode_copy_receipt_commands"
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
  lane-ignore)
    lane="${2:-}"
    ignore="${3:-true}"
    if [[ -z "$lane" ]]; then
      usage
      exit 2
    fi
    get "/lane_production_ignore?lane_id=$(urlencode "$lane")&ignore=$(urlencode "$ignore")"
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
  load-session-wait)
    name="${2:-autosave}"
    timeout="${3:-30}"
    get "/load_session?name=$(urlencode "$name")" >/dev/null
    wait_active_session "$name" "$timeout"
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
