# QuipslyStudio local control

This app has more than one historical Mac surface in the repo. Agents must not
guess by visible app name alone.

## Canonical editor

- Current native editor: `apps/QuipslyStudio`
- Canonical bundle path after build: `DerivedData/Build/Products/Debug/QuipslyMac.app`
- Canonical bundle id: `com.highground.QuipslyMac`
- Legacy prototype to avoid for editor proof: `apps/quipsly-mac/dist/QuipslyMac.app`

## Required proof loop

Use the local control harness:

```bash
script/studioctl.sh launch
script/studioctl.sh load-episode1
script/studioctl.sh prove-editor-control
script/agentctl.sh control-plane
script/agentctl.sh delivery-readiness
```

For lower-level commands, use `script/agentctl.sh`. The expected loop is:

1. Observe `/state`.
2. Choose a semantic action, not a screen coordinate.
3. Execute through `/scrub`, `/timeline_zoom`, `/select_decision`, `/nudge_selected`, or another named endpoint.
4. Re-observe `/state`.
5. Only use mouse/scroll automation for visual confirmation when an agent endpoint cannot prove the behavior.

## Editor control plane

The durable interface is `GET /control_plane`, not window coordinates. The
control plane names each editor surface and lists the state fields, semantic
commands, proof endpoints, and physical proof tools for that surface.

Required surfaces:

- `program-monitor`: shared-playhead Program Output, blank gaps, Play Edit vs Play Through.
- `source-monitor-wall`: every synced source visible for camera choice.
- `decision-timeline`: whole lanes plus SHOW/SKIP metadata overlays, zoom, selection, trim/nudge.
- `inspector`: output format and selected-decision controls.
- `production-readiness`: proxy-safe state, blocked media, export readiness.

## Program crop and framing

Position/zoom has two layers. Keep them separate:

- `baseline`: fixes the whole selected source lane for one output format. Use it
  when a camera was framed too high, low, wide, tight, or off-center for the
  whole recording.
- `keyframe`: writes a timed position/zoom override at the shared playhead. Use
  it for punch-ins, emphasis, reactions, and short-form motion.

The app exposes the same crop model to humans and agents:

```bash
script/agentctl.sh select-lane "Charlie Camera"
script/agentctl.sh format 9:16
script/agentctl.sh program-crop-mode baseline
script/agentctl.sh program-crop-preset "Charlie Camera" 9:16 vertical-solo baseline
script/agentctl.sh program-crop-mode keyframe
script/agentctl.sh program-crop-preset "Charlie Camera" 9:16 vertical-punch keyframe 42.0
script/agentctl.sh state
```

`GET /state` exposes `programCropEditMode`, `programCropGestureTarget`, and
`selectedProgramCrop.baseline` / `selectedProgramCrop.atPlayhead`. This is the
agent-safe proof that Codex is about to adjust the intended layer. Do not infer
crop intent from screenshots alone.

Run the control-plane smoke before trusting new automation:

```bash
script/smoke_editor_control_plane.sh --no-build
```

State-mutating editor smokes share one live app session. Run them serially unless
the test explicitly launches an isolated app instance. Parallel smoke runs can
create false failures by loading sessions, changing selection, or removing queue
items underneath each other.

If a future feature only works by pixel clicking, it is not done. Add the state
field, add the semantic command, add the proof path, then use pixels only to
verify that the human-facing UI is wired to the same command.

## Delivery readiness

`GET /delivery_readiness` is the truth layer between editing and publishing.
It intentionally separates:

- `episode-16x9-master`: proxy-backed episode render for YouTube/Patreon.
- `episode-9x16-master`: proxy-backed vertical render foundation.
- `social-short-clips`: planned short clip queue for YouTube Shorts, Instagram, Facebook, and LinkedIn.
- `podcast-audio-master`: audio-only M4A master proof plus future podcast metadata/feed package.
- `channel-publishing`: planned authenticated upload/schedule integrations.

Run:

```bash
script/smoke_episode1_delivery_readiness.sh --no-build
```

The contract must not claim direct publishing is ready just because a file can
render. Rendering, short clipping, podcast mastering, and platform publishing
are separate proof lanes.

## Short clip queue

Shorts are queued as output metadata over sequence time. They are not chopped
source media.

Use:

```bash
script/agentctl.sh select-decision first_video
script/agentctl.sh shorts-add-selected "Good quote for Shorts"
script/agentctl.sh shorts-add-range 3000 3045 "Identity Changes Behavior"
script/agentctl.sh shorts-update-selected hook "Lead with the surprising idea"
script/agentctl.sh shorts-update-selected overlay "The Wednesday Rule"
script/agentctl.sh shorts-update-selected caption "A first-pass caption line"
script/agentctl.sh shorts-preview-selected play
script/agentctl.sh shorts-range-selected start delta -0.1
script/agentctl.sh shorts-range-selected end delta 0.1
script/agentctl.sh shorts-export-selected /tmp/quipsly-shorts wednesday-rule-test
script/agentctl.sh shorts-export-all /tmp/quipsly-shorts episode1-candidates
script/agentctl.sh social-shorts-packet-generate /tmp/quipsly-shorts episode1-candidates
script/agentctl.sh social-shorts-packet
script/agentctl.sh shorts-queue
script/agentctl.sh left-workbench shorts
script/smoke_episode1_short_clip_queue.sh --no-build
```

Today this proves clip-range capture for social output planning, bounded short
preview, selected 9:16 short export, queued batch 9:16 export, and first-pass
burned-in overlay/caption text. It does not yet prove polished caption timing,
platform templates, or platform upload/scheduling.

Target workflow:

- The main episode stays the spine.
- A left-sidebar `Shorts` mode lists queued short edit packets.
- `Add short` creates a packet from the selected SHOW decision or current playhead range.
- `Add range` creates a packet from explicit episode sequence seconds. Prefer it
  for Codex/social discovery work because the episode spine is the coordinate
  system of record.
- Selecting a short switches the workbench into that short packet without duplicating or clipping originals.
- The selected packet has Cue, bounded Preview, Set In, Set Out, and fine nudge controls so shorts can be tuned without mutating the episode edit.
- Each short packet owns its own 9:16 framing direction, caption draft, text overlay, hook/title notes, destination presets, AI suggestions, review status, and export/publishing status.
- `GET /shorts_preview_selected?play=true|false` cues or previews the selected short in 9:16 Play Edit mode. A play-preview stops at the short packet out point and clears `shortPreviewStopAt`.
- `GET /shorts_range_selected?boundary=start|end&time=<sequence-seconds>|delta=<seconds>` updates the selected short packet's output range only.
- `GET /shorts_export_selected?directory=<absolute-output-folder>&basename=<name>` exports the selected short packet as a 9:16 MP4 from proxy-backed Play Edit metadata. If the packet has primary overlay text or caption draft text, the export burns those into the MP4 as a first-pass social proof layer.
- `GET /shorts_export_all?directory=<absolute-output-folder>&basename=<name>` exports every queued short packet as ordered 9:16 MP4 files from proxy-backed Play Edit metadata.
- `GET /social_shorts_packet_generate?directory=<absolute-output-folder>&basename=<name>` writes a JSON handoff packet for every queued short with artifact paths, platform copy, hashtags, timing, and destination guidance.
- `GET /social_shorts_packet` returns the last social shorts packet state.

This matters because a short is not merely a section of the episode. It is a
publishable derivative recipe over the same synced source lanes.

Agents can create range-based packets with
`GET /shorts_queue_add_range?start=<sequence-seconds>&end=<sequence-seconds>&title=<optional-title>`.
Use this for generated candidate lists; it stores sequence time directly instead
of tying the packet to a source-local SHOW tag.

Agents can open the workbench with `GET /left_workbench?mode=shorts` and verify
`leftWorkbenchMode`, `leftWorkbenchOpen`, `selectedShortClipId`, and
`selectedShortClip` in `/state`. Agents can update the selected packet with
`GET /shorts_queue_update_selected?field=hook|caption|overlay|notes|review_status|export_status&value=<text>`.
Agents can export the selected packet with `GET /shorts_export_selected`, batch
export the whole queue with `GET /shorts_export_all`, and then poll `/state` or
use `script/agentctl.sh wait-export` to verify the output path and status.
Agents can then generate `GET /social_shorts_packet_generate` to produce the
manual publishing handoff for YouTube Shorts, Instagram, Facebook, and LinkedIn.
Agents can then generate `GET /social_publication_queue_generate` to copy the
exported derivative shorts into a manual-upload queue with platform copy,
captions, CSV, JSON, and README files.

Batch export:

- Output filenames include the basename, queue order, and short title slug.
- The app marks each packet as `queued-for-export`, then `exporting`, then
  `exported` or `export-failed`.
- Batch export uses the same proxy-backed Play Edit metadata as selected export;
  it does not mutate source media or create chopped source clips.

Social shorts packet:

- The packet is JSON-first so humans, Codex, and future platform upload workers
  can read the same artifact.
- Each short includes sequence timing, artifact status, exported file path when
  available, caption draft, overlay text, hook text, notes, and per-platform
  destination presets.
- The packet may be generated before every clip is exported; those rows are
  marked `artifactStatus=needs-export`.
- `directPublishingReady` remains false until platform OAuth/upload/scheduling
  and receipt capture are proven.

## Social publication queue

After a release folder has exported 9:16 shorts and a publish ledger, build the
human/Codex publication queue from the running app:

```bash
script/agentctl.sh social-publication-queue-generate /absolute/output/folder optional-basename
```

This is the first-class editor path. It uses the loaded session's publish
ledger, copies only rendered derivative short MP4s, and exposes status in
`/state.socialPublicationQueue`.

In the app, the Publish ledger panel includes a **Social publication queue**
card after the Release checklist. It shows how many exported 9:16 derivative
short files are ready, the top-ranked clip candidates, and actions to generate
the queue or copy a human review checklist.

Codex/editor agents should read these `/state.socialPublicationQueue` fields
before trying to publish:

- `manualQueueReady`: true only when at least one exported derivative short is
  present.
- `readyShortArtifactCount`: deduplicated count of actual short MP4 files.
- `socialReceiptCount`: platform receipt rows associated with social shorts.
- `topCandidateTitles`: ranked short titles for review/upload order.
- `outputPath`: generated queue folder after queue creation.

After a human uploads or schedules a short, capture the platform receipt before
moving on. In the app, select the social publish record, paste the public or
scheduled URL into the Social publication queue card, choose uploaded,
scheduled, or published, then save the receipt.

Agents can write the same receipt through:

```bash
script/agentctl.sh social-receipt-capture RECEIPT_ID published https://example.com provider-id "notes"
```

This writes the URL, status, provider id when present, upload-job status, and a
structured receipt JSON onto the exact publish receipt. If an agent cannot
address exactly one social receipt, it should stop and request/provide the
receipt id instead of guessing.

The Publish ledger panel also includes a release-wide **Receipt capture** card.
It applies to every destination: YouTube 16:9 episode, Patreon, YouTube Shorts,
Instagram, Facebook, LinkedIn, Spotify, and Apple Podcasts. It reports captured,
missing, and ready-for-receipt counts, lists records that are ready for URL
capture, and can copy a missing-receipts checklist. Select any publish record to
use the quick-capture strip directly in this card: choose uploaded, scheduled,
or published, paste the public/scheduled URL, optionally add a provider id, and
save the receipt back to the selected record.

Agents should use `/state.publishReceiptCapture` as the canonical receipt view:

- `capturedCount`: records with a public URL, provider receipt id, receipt JSON,
  or published status.
- `missingCount`: records that still need a receipt.
- `readyForReceiptCaptureRecords`: artifacts/copy are ready; after upload or
  scheduling, capture the URL here.
- `missingReceiptRecords`: every record still missing a receipt.

For any platform record, agents can use the generic receipt command:

```bash
script/agentctl.sh publish-receipt-update RECEIPT_ID published https://example.com provider-id "manual receipt"
```

Each publish record also exposes a complete upload packet for the human/Codex
operator. In the app, click **Packet** on a publish card or **Copy upload
packet** in the receipt editor. Agents can read the same JSON at
`/state.publishReleaseChecklist.records[].uploadPacket` or copy one by id:

```bash
script/agentctl.sh publish-upload-packet RECEIPT_ID
```

The upload packet includes the rendered artifact path, platform title and
description, destination guidance, parsed metadata, parsed upload job shape,
manual upload checklist, and the receipt-capture command. It is the handoff
contract for manual upload today and future direct platform connectors later.

For a full release handoff, generate the upload packet bundle:

```bash
script/agentctl.sh publish-upload-packet-bundle /absolute/output/folder optional-basename
```

The bundle writes `upload-packets/*.json`, a machine-readable manifest, a CSV
index, and a README. Use this when a whole episode is ready to publish across
YouTube, Patreon, social platforms, and podcast destinations. Agents can track
the generated folder at `/state.publishUploadBundle`.

Each bundle row includes a receipt-capture command. The publication loop is not
considered closed when the artifact merely exists or is uploaded manually; it is
closed when the public or scheduled URL is written back to the exact receipt id
in the publish ledger.

For offline/enriched release-folder work, use:

```bash
script/build_publish_upload_packet_bundle.py \
  /Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-17-release-candidate \
  --basename episode1-the-wednesday-rule \
  --zip
```

The upload bundle writes one JSON packet per platform record plus a manifest,
CSV index, README, and optional ZIP. Use it when the app is not running but a
release folder already exists and you need a whole-release handoff across
YouTube, Patreon, social platforms, Spotify, and Apple Podcasts.

### Offline social expansion harvest

The first-class path for planned shorts is still the running editor's short
packet queue. Use it when the editor/session is the source of truth and the
short should remain attached to the episode timeline.

There is also a derivative-only harvest helper for fast social discovery after a
safe 9:16 master already exists:

```bash
script/agentctl.sh social-expansion-harvest \
  /absolute/path/to/episode-9x16-master.mp4 \
  /absolute/path/to/social-candidates.json \
  /absolute/path/to/social-expansion-pack \
  "Episode 1 - The Wednesday Rule" \
  "High Ground Odyssey Episode 1: The Wednesday Rule" \
  --zip
```

The underlying script can also be called directly:

```bash
script/harvest_social_expansion_pack.py \
  --source-master /absolute/path/to/episode-9x16-master.mp4 \
  --candidates /absolute/path/to/social-candidates.json \
  --output /absolute/path/to/social-expansion-pack \
  --episode-title "Episode 1 - The Wednesday Rule" \
  --episode-label "High Ground Odyssey Episode 1: The Wednesday Rule" \
  --zip
```

Candidate JSON may be either a list, an object with a `candidates` list, or a
previous `social-expansion-pack.json` with a `clips` list:

```json
[
  {
    "rank": 10,
    "start": 1500,
    "duration": 55,
    "title": "Try Is Not The Same As Do",
    "hook": "Trying can turn into sorting forever. Doing is a different mode.",
    "overlay": "Trying is not doing",
    "transcript": "Scout transcript or reviewed caption text.",
    "tags": ["#CreativeProcess", "#WednesdayRule"]
  }
]
```

The command writes:

- `clips/`: clean 1080x1920 derivative MP4 candidates.
- `thumbnails/`: review stills.
- `captions/`: simple SRT sidecars.
- `platform-copy/`: YouTube Shorts, Instagram Reels, and Facebook Reels copy.
- `social-expansion-pack.json`: machine-readable handoff.
- `social-expansion-pack.csv`: spreadsheet-friendly review queue.
- `README.md`: human posting order.
- optional `.zip`: shareable candidate bundle.

Rules:

- This helper cuts only from the rendered 9:16 master.
- It does not inspect, relink, or mutate original media.
- It does not mutate Quipsly edit decisions or source lanes.
- It does not upload or schedule anything.
- Scout transcripts must be quote-checked before posting.

Use this when Codex or a human wants to harvest more interesting social moments
quickly from an already-rendered episode. Promote the keepers back into the
editor's short packet queue later if they need deeper reframing, captions,
layout decisions, or durable publication receipts.

To combine the release-candidate social queue and one or more expansion packs
into a single posting-order dashboard:

```bash
script/agentctl.sh social-master-queue \
  /absolute/path/to/social-master-queue \
  --episode-title "Episode 1 - The Wednesday Rule" \
  /absolute/path/to/episode1-social-publication-queue.json \
  /absolute/path/to/social-expansion-pack.json
```

The underlying script can also be called directly:

```bash
script/build_social_master_queue.py \
  --episode-title "Episode 1 - The Wednesday Rule" \
  --output /absolute/path/to/social-master-queue \
  /absolute/path/to/episode1-social-publication-queue.json \
  /absolute/path/to/social-expansion-pack.json
```

The master queue writes `SOCIAL-MASTER-QUEUE.md`,
`social-master-queue.json`, `social-master-queue.csv`, and a contact sheet
when thumbnails are available. Use it when an editor or Codex agent needs one
calm place to decide which short to review, upload, or schedule next.

To turn a social queue into an actual upload handoff folder, build a
publication-ready packet:

```bash
script/agentctl.sh social-ready-packet \
  /absolute/path/to/social-master-queue.json \
  /absolute/path/to/social-clips-ready \
  episode1-all-social-clips-ready \
  12 \
  --zip
```

The underlying script is:

```bash
script/build_social_ready_packet.py \
  /absolute/path/to/social-master-queue.json \
  --output /absolute/path/to/social-clips-ready \
  --basename episode1-all-social-clips-ready \
  --top-count 12 \
  --zip
```

When Quipsly Studio is running, agents can use the app control plane instead:

```bash
script/agentctl.sh observe-after social-ready-packet-generate \
  /absolute/path/to/social-master-queue.json \
  /absolute/path/to/social-clips-ready \
  episode1-all-social-clips-ready \
  12 \
  --zip
```

That calls
`GET /social_ready_packet_generate?queue_path=<queue>&output=<folder>&basename=<name>&top_count=12&zip=1`.
The app marks the social queue state as `generating`, runs the builder off the
main UI path, then loads the generated `<basename>.json` back into
`socialMasterQueue` so humans and Codex are reviewing the same ready packet.

The ready packet copies derivative MP4s into `clips/`, thumbnails into
`thumbnails/`, caption sidecars into `captions/`, and platform copy into
`platform-copy/`. It also writes a JSON manifest, CSV tracker, README, contact
sheet when `ffmpeg` is available, a `top-12-first-posting-batch` folder, and an
optional zip archive. This is the repeatable replacement for one-off filesystem
sorting after a good short-harvest pass.

Each ready-packet clip row includes:

- `readyToPost`: true when the derivative MP4 and platform copy are present.
- `operatorNextStep`: the plain-English next action for a human or Codex editor.
- `receiptCaptureCommands`: per-platform commands for saving the public or
  scheduled post URL back into Quipsly after manual posting.
- `youtubeShortsReceiptCaptureCommand`, `instagramReceiptCaptureCommand`,
  `facebookReceiptCaptureCommand`, and `linkedinReceiptCaptureCommand`: CSV-safe
  command columns for spreadsheet-style posting.

This makes the ready packet the default social publication handoff artifact.
The master queue is where editors decide what should be posted; the ready
packet is where operators post, track, and capture receipts.

The merge preserves publication metadata from the source queues, including
`sourceSequenceStartSeconds`, `sourceSequenceEndSeconds`,
`sourcePublishReceiptIds`, and per-platform `platformReceiptIds` when they
exist. That means the release-candidate shorts can be posted manually and then
recorded back into Quipsly without losing the receipt trail. Expansion-pack
shorts remain scout candidates until a human promotes or posts them.

Current Episode 1 proof output:

```bash
script/agentctl.sh social-master-queue-load \
  /Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-episode1-social-master-queue/social-master-queue.json
```

Current Episode 1 publication-ready handoff output:

```bash
script/agentctl.sh observe-after social-master-queue-load \
  /Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-episode1-final-social-posting-packet/episode1-the-wednesday-rule-final-social-posting-packet.json
```

That final posting packet contains 31 derivative 9:16 MP4 clips, 31 thumbnails,
31 caption sidecars, 31 platform-copy files, a contact sheet, a start-here
posting guide, a platform posting tracker, and a zip archive:

- `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-episode1-final-social-posting-packet/START-HERE-EPISODE1-SOCIAL-PUBLISHING.md`
- `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-episode1-final-social-posting-packet/episode1-the-wednesday-rule-platform-posting-tracker.csv`
- `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-episode1-final-social-posting-packet.zip`

Use this when the goal is to review and publish actual Episode 1 shorts now,
not to rebuild the source queue. The packet is still manual-posting truth: it
proves upload-ready local artifacts exist, but it does not mean anything has
been posted until a platform URL or receipt is captured. The older
`2026-06-17-all-social-clips-ready` folder is source material for this final
handoff, not the preferred operator packet.

In the app, the Ready-to-publish handoff panel includes an Episode 1 final
social packet strip with actions to load the packet into review state, open the
start-here guide, reveal the posting tracker, reveal the folder, and reveal the
zip. Use that strip before hand-navigating old export folders.

That queue currently contains 31 derivative 9:16 candidates from:

- `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-ready-to-publish-social-queue/episode1-social-publication-queue.json`
- `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-expansion-pack/episode1-social-expansion-pack.json`
- `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-deep-harvest-pack/social-expansion-pack.json`

The master contact sheet lives at
`/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-episode1-social-master-queue/episode1-social-master-contact-sheet.jpg`.

Inside Quipsly Studio, open the publish/social queue panel and use the
`Social master queue` card to load the generated `social-master-queue.json`.
The app shows clip count, source-pack counts, and top candidate titles without
uploading anything or mutating the episode timeline. The same state is exposed
to the local agent state payload as `socialMasterQueue`, including a compact
`candidatePreview` list with rank, title, hook, duration, derivative clip path,
thumbnail path, caption path, platform-copy path, and intended platforms.

Codex can load the same queue without screen-scraping:

```bash
script/agentctl.sh observe-after social-master-queue-load \
  /absolute/path/to/social-master-queue.json
```

That command calls `GET /social_master_queue_load?path=<absolute-json-path>`,
then the app imports the JSON through the same parser as the human file picker.
After loading, agents should read the direct queue state:

```bash
script/agentctl.sh social-master-queue-state
```

That command calls `GET /social_master_queue` and returns the same
`socialMasterQueue` payload that is also present under `/state`. Agents should
inspect `nextAction` and `candidatePreview[0]`, then:

1. Watch the derivative candidate clip.
2. Check the SRT/caption sidecar if captions will be uploaded.
3. Open the platform-copy file for title, caption, and hashtags.
4. Upload or schedule manually until direct platform APIs are wired.

After selecting a rank, agents can inspect the exact active posting target:

```bash
script/agentctl.sh selected-social-candidate
script/agentctl.sh selected-social-receipts
script/agentctl.sh selected-social-posting-packet
```

That command calls `GET /social_master_queue_selected` and returns the selected
candidate, artifact readiness, receipt target, and safe next action without
requiring the agent to parse the full queue again. Use it before opening files
or capturing receipts so the human UI selection and Codex operation stay locked
to the same clip. `selected-social-receipts` calls
`GET /social_master_queue_selected_receipts` and returns every platform receipt
ID, whether that platform is ready for receipt capture, and the exact
`social-master-queue-receipt` command to run after a real public/scheduled URL
or provider receipt exists. `selected-social-posting-packet` calls
`GET /social_master_queue_selected_posting_packet` and returns the selected
derivative clip path, thumbnail path, caption path, loaded platform copy text,
artifact readiness, receipt checklist, safe commands, and proof rule as one
posting-safe packet. It does not upload, schedule, publish, or touch source
media.

For the two most common selected-candidate actions, use the direct commands:

```bash
script/agentctl.sh social-master-open-selected-clip
script/agentctl.sh social-master-copy-selected-platform-copy
```

Those call `GET /social_master_queue_open_selected_clip` and
`GET /social_master_queue_copy_selected_platform_copy`. They are wrappers around
the generic artifact command, but they keep the posting loop readable and reduce
the chance that an agent opens or copies the wrong artifact key.
5. Capture the platform URL or receipt back into Quipsly.

This is deliberately an observe/act/re-observe loop. Command acknowledgements
are not proof of publishing.

To focus a specific candidate from the loaded queue:

```bash
script/agentctl.sh observe-after social-master-queue-select 3
```

That command calls `GET /social_master_queue_select?rank=3`. The selected
candidate is then exposed as `socialMasterQueue.selectedCandidate`, and the
same selected item drives the in-app `Open clip`, `Reveal clip`, and
`Copy handoff` controls.

Before posting a selected candidate, inspect
`socialMasterQueue.selectedArtifactReadiness`. It reports whether the derivative
clip, thumbnail, captions, and platform-copy files exist. Agents can drive the
same review controls through:

```bash
script/agentctl.sh observe-after social-master-queue-artifact open clipPath
script/agentctl.sh observe-after social-master-queue-artifact reveal captionSrtPath
script/agentctl.sh observe-after social-master-queue-artifact copy_handoff
script/agentctl.sh observe-after social-master-queue-artifact copy_platform_copy
```

When a selected candidate came from a release-candidate social queue, the master
queue also exposes `selectedReceiptTarget`. If
`selectedReceiptTarget.readyForCapture` is `true`, the candidate has a durable
publish receipt id and a manual upload/schedule URL can be saved back into the
existing publish ledger:

```bash
script/agentctl.sh social-master-queue-receipt \
  3 \
  "YouTube Shorts" \
  published \
  https://platform.example/published-url \
  provider-or-post-id \
  "manual receipt"
```

That command calls `GET /social_master_queue_receipt?...` and updates the same
publish receipt record used by the release-wide receipt capture UI. Expansion
pack candidates usually report `selectedReceiptTarget.status = no-receipt-id`;
that is intentional. Watch them, promote them, or post with an explicit manual
note, but do not claim Quipsly captured a platform receipt until a durable
receipt id exists.

These commands only open, reveal, or copy derivative artifact information. They
do not upload, schedule, mutate receipts, or touch source media.

To create the human/Codex publication cockpit for the same release folder:

```bash
script/agentctl.sh publication-cockpit-generate \
  /Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-17-release-candidate \
  episode1-the-wednesday-rule
```

If the app is not running, use the offline builder:

```bash
script/build_publication_cockpit.py \
  /Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-17-release-candidate \
  --basename episode1-the-wednesday-rule
```

The cockpit writes `PUBLICATION-COCKPIT.md`, `publication-cockpit.json`, and
`publication-receipt-log.csv`. Open the markdown file when a release is ready
for manual publishing. It gathers the best 9:16 clips, platform upload packet
counts, core artifacts, and exact receipt-capture commands in one place. Use the
receipt log as the human-friendly place to paste public/scheduled URLs and
provider IDs after upload.

After editing `publication-receipt-log.csv`, dry-run the reconciliation:

```bash
script/apply_publication_receipt_log.py \
  /Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-17-release-candidate
```

When the dry-run report looks right, write the receipts back to the publish
ledger and refresh the derived handoff artifacts:

```bash
script/apply_publication_receipt_log.py \
  /Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-17-release-candidate \
  --write \
  --refresh-handoff
```

This is intentionally not an uploader: the closed-loop rule is still that every
platform post is unfinished until its public or scheduled URL is captured back
into the matching Quipsly receipt. The publish ledger is the source of truth;
`--refresh-handoff` rebuilds the upload packet bundle, publication cockpit, and
release verification from that updated ledger so humans and agents do not read a
stale projection.

Release verification uses two different green-ish states on purpose:

- `ready-for-human-review`: rendered files, upload packets, cockpit, receipt log,
  and verification artifacts are ready for review/upload, but at least one
  platform receipt is still missing.
- `publication-complete`: every upload packet has a captured public or scheduled
  URL/provider receipt and the refreshed handoff artifacts agree with the
  ledger.

For social-short-specific queue work, use:

```bash
script/build_social_publication_queue.py \
  /Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-17-release-candidate \
  --zip
```

For later episodes, pass the human-facing labels explicitly:

```bash
script/build_social_publication_queue.py /path/to/release-folder \
  --episode-title "Episode 4 - Working Title" \
  --caption-episode-label "High Ground Odyssey Episode 4: Working Title" \
  --zip
```

The queue writes:

- `clips/`: copied 9:16 derivative MP4s ready for human review and manual upload.
- `platform-copy/`: YouTube Shorts, Instagram, Facebook, and LinkedIn copy drafts.
- `captions/`: simple SRT sidecars for review/upload support.
- `thumbnails/`: review stills.
- `episode1-social-publication-contact-sheet.jpg`: quick visual review sheet.
- `episode1-social-publication-queue.json`: machine-readable queue for future UI/connectors.
- `episode1-social-publication-queue.csv`: spreadsheet-friendly queue.
- `*.zip`: optional portable handoff archive when `--zip` is passed.

This queue is a publication handoff, not an auto-publisher. It uses rendered
derivative shorts only, leaves original source media untouched, and marks the
state as `ready-for-human-review-and-upload` until platform receipts are captured
back into Quipsly.

## Podcast audio master export

Podcast audio is a proxy-backed M4A render of the edited episode audio spine.
It uses audio-only source lanes and Play Edit valid ranges, so skipped gaps are
removed without cutting source files or accidentally mixing camera scratch audio.

Agent-safe command:

```bash
script/agentctl.sh audio-master-export /tmp/quipsly-audio episode-1-proof 8
script/agentctl.sh wait-export 120
script/agentctl.sh podcast-packet-generate /tmp/quipsly-audio episode-1-proof
script/agentctl.sh podcast-packet
```

Endpoint:

`GET /audio_master_export?directory=<absolute-output-folder>&basename=<name>&proof_seconds=<seconds>`

The output path is `<basename>-podcast-audio.m4a`. This proves the local audio
artifact lane for Spotify/Apple Podcasts. Loudness normalization, metadata,
RSS/podcast-host upload, scheduling, and publish receipts remain separate
publishing integrations.

Podcast handoff packet:

- `GET /podcast_packet`
- `GET /podcast_packet_generate?directory=<absolute-output-folder>&basename=<name>`
- `GET /podcast_ready_packet_generate?manifest_path=<absolute-podcast-manifest-json>&output=<absolute-output-folder>&basename=<name>&zip=1`

The podcast packet writes a JSON manifest with the episode title, audio artifact
path/status, Spotify and Apple Podcasts destination guidance, and receipt-capture
instructions. It is intentionally an RSS/podcast-host handoff first. It does not
claim direct Spotify or Apple Podcasts API publishing is wired.

To turn a generated podcast manifest into a clean operator handoff folder:

```bash
script/agentctl.sh podcast-ready-packet \
  /absolute/path/to/podcast-manifest.json \
  /absolute/path/to/podcast-ready \
  episode1-podcast-ready \
  --zip
```

To ask the running app to generate the same ready packet and update app/agent
state, use:

```bash
script/agentctl.sh podcast-ready-packet-generate \
  /absolute/path/to/podcast-manifest.json \
  /absolute/path/to/podcast-ready \
  episode1-podcast-ready \
  --zip
```

The underlying script is:

```bash
script/build_podcast_ready_packet.py \
  /absolute/path/to/podcast-manifest.json \
  --output /absolute/path/to/podcast-ready \
  --basename episode1-podcast-ready \
  --zip
```

The ready packet copies the exported podcast audio into `audio/`, probes it
with `ffprobe` when available, and writes a JSON manifest, CSV tracker, and
README with Spotify and Apple Podcasts receipt-capture commands. Treat this as
the default podcast publication handoff artifact. The podcast manifest proves
metadata/readiness; the podcast ready packet is what an operator uses to
listen-check, upload through the podcast host/RSS workflow, and capture public
episode URLs back into Quipsly.

After uploading or scheduling through the podcast host/RSS workflow, capture the
platform URL back into the same publish ledger used by the rest of the release:

```bash
script/agentctl.sh podcast-receipt-capture \
  Spotify \
  published \
  https://platform.example/episode-url \
  provider-or-host-id \
  "manual podcast receipt"

script/agentctl.sh podcast-receipt-capture \
  "Apple Podcasts" \
  published \
  https://platform.example/episode-url \
  provider-or-host-id \
  "manual podcast receipt"
```

That command calls `GET /podcast_receipt_capture?...`, which updates the
`podcast-audio-master` publish receipt for the requested platform. The
`podcastPacket.receiptTargets` state lists the current Spotify and Apple
receipt ids, public URLs, and whether each receipt has been captured.

## Delivery packet

A delivery packet is the bridge between local exports and real publishing. It
is a JSON handoff record that says which artifacts exist, which platforms they
target, what still needs export, and which direct publishing integrations are
not ready yet.

Use:

```bash
script/agentctl.sh delivery-packet
script/agentctl.sh delivery-packet-generate /tmp/quipsly-delivery episode-1-proof
script/smoke_episode1_delivery_packet.sh --no-build
```

Endpoint:

`GET /delivery_packet_generate?directory=<absolute-output-folder>&basename=<name>`

The output path is `<basename>-delivery-packet.json`. The packet intentionally
does not upload anything. It maps exported files to destinations such as
YouTube, Patreon, YouTube Shorts, Instagram, Facebook, LinkedIn, Spotify, and
Apple Podcasts, then marks their publish status as `needs-export`, `blocked`,
or `artifact-ready-integration-needed`.

This is the boring grown-up layer that keeps the editor honest: an exported file
is not a published episode, and a planned platform integration is not a receipt.

## Release prepare

Release prepare is the one-command local packaging flow. It sequentially exports:

- `16:9` episode MP4 for YouTube/Patreon.
- `9:16` vertical episode MP4 for review/shorts source.
- every queued short MP4 when short packets exist.
- podcast audio M4A for Spotify/Apple Podcasts integration work.
- delivery packet JSON mapping artifacts to destinations and receipt gaps.

Use:

```bash
script/agentctl.sh release-prepare /tmp/quipsly-release episode-1-proof 8
script/agentctl.sh wait-export 180
script/agentctl.sh delivery-packet
```

Endpoint:

`GET /release_prepare?directory=<absolute-output-folder>&basename=<name>&proof_seconds=<seconds>`

The `proof_seconds` argument is optional. It is useful for fast proof runs; omit
it when preparing full publishable artifacts. This flow is still proxy-first and
non-destructive: it renders from whole synced lanes plus metadata decisions.

## Full release prep

Full release prep is the operator-friendly version of release prepare. It runs
the release exports, then immediately generates the delivery packet, publish
ledger, release checklist, portable publish packet, upload packet bundle,
social shorts packet, social publication queue when queued shorts exist,
social-ready packet, podcast packet, podcast-ready packet, and publication
cockpit. The ready packets are the final operator handoff folders checked by
the stricter release verifier.

Use:

```bash
script/agentctl.sh full-release-prepare /tmp/quipsly-release episode-1-proof 8
script/agentctl.sh wait-export 180
script/agentctl.sh full-release
script/agentctl.sh publish-release-checklist
script/agentctl.sh publish-connector-readiness
script/agentctl.sh publish-connector-preflight
script/agentctl.sh publish-connector-worker-dry-run "YouTube Shorts" social-short-clips "$(pwd)/script/publish_workers/youtube_upload_worker.py"
script/agentctl.sh publish-connector-worker-dry-run "Patreon" episode-16x9-master "$(pwd)/script/publish_workers/patreon_upload_worker.py"
script/agentctl.sh publish-connector-worker-dry-run "Instagram" social-short-clips "$(pwd)/script/publish_workers/social_upload_worker.py"
script/agentctl.sh publish-connector-worker-dry-run "Facebook" social-short-clips "$(pwd)/script/publish_workers/social_upload_worker.py"
script/agentctl.sh publish-connector-worker-dry-run "LinkedIn" social-short-clips "$(pwd)/script/publish_workers/social_upload_worker.py"
script/agentctl.sh publish-connector-worker-dry-run "Spotify" podcast-audio-master "$(pwd)/script/publish_workers/podcast_upload_worker.py"
script/agentctl.sh publish-connector-worker-dry-run "Apple Podcasts" podcast-audio-master "$(pwd)/script/publish_workers/podcast_upload_worker.py"
script/agentctl.sh publish-connector-workers-dry-run-all
script/agentctl.sh publish-connector-workers-dry-run-all Patreon episode-16x9-master
script/agentctl.sh publish-connector-worker
script/agentctl.sh publish-packet
script/agentctl.sh publish-upload-packet-bundle /tmp/quipsly-release episode-1-proof
script/agentctl.sh publication-cockpit-generate /tmp/quipsly-release episode-1-proof
script/verify_release_folder.py /tmp/quipsly-release --write /tmp/quipsly-release/release-verification.json
```

`verify_release_folder.py` is the local release gate for a finished handoff
folder. It now checks the 16:9 episode master, full 9:16 master, podcast audio,
delivery packet, publish packet, upload packet bundle, social publication
queue, social-ready packet, podcast packet, podcast-ready packet, publication
cockpit, receipt log, and exported shorts. A release is
`ready-for-human-review` only when every required handoff artifact is present
and probeable/valid, and the social/podcast ready packets are semantically
ready for manual posting handoff.

For live app/agent review, prefer `GET /state` and inspect
`publicationReadyHandoff` first. It summarizes the three operator lanes:
`episode16x9` for YouTube/Patreon, `social9x16` for shorts/reels platforms, and
`podcastAudio` for Spotify/Apple handoff. Lower-level packet state is still
available, but `publicationReadyHandoff` is the quickest answer to “what can we
publish, where is it, and what is the next human/Codex action?”
The direct agent command is:

```bash
script/agentctl.sh publication-ready-handoff
script/agentctl.sh publication-operator-brief
script/agentctl.sh publication-mission-control
script/agentctl.sh episode1-socials-load
script/agentctl.sh episode1-socials-first-wave
script/agentctl.sh publication-reveal-release
script/agentctl.sh publication-copy-mission
script/agentctl.sh publication-copy-missing-receipts
```

`publication-mission-control` calls `GET /publication_mission_control`. Use it
when the task is the whole release, not just one packet. It aggregates the
16:9 episode master for YouTube/Patreon, 9:16 social shorts for
YouTube/Instagram/Facebook/LinkedIn, podcast audio for Spotify/Apple, selected
social posting packet state, and missing receipt proof into one read-only
operator/Codex view. It also returns the next safest action and the commands for
handoff, receipt review, selected social posting, full release prep, and cockpit
generation.

`publication-operator-brief` calls `GET /publication_operator_brief`. Use it
when the operator needs the shortest safe answer to: what can I publish next,
what commands or files do I use, and what proof still needs a public/scheduled
URL? It bundles episode, social, podcast, and receipt-proof state into one
read-only handoff and includes the safe order for manual publication work.

`episode1-socials-load` is the safe shortcut for the current Episode 1 proof
packet. It calls the existing social master queue loader with:

`/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-episode1-final-social-posting-packet/episode1-the-wednesday-rule-final-social-posting-packet.json`

Use it before publishing Episode 1 shorts so Mission Control and the Social
master queue panel point at the 31-clip final posting packet, not an older
intermediate queue. It loads review state only; it does not upload, schedule, or
mutate source media.

`episode1-socials-first-wave` calls `GET /social_master_queue_first_wave` after
the packet is loaded. It returns the concise posting-readiness object: the ranks
and handoff paths for first-wave clips, review-last clips, and clips that need
quote-check or promotion before publication. Use it when the question is “what
can we watch once and post first?” instead of “show me the entire queue.” Each
first-wave preview includes shellable commands to select/open the clip, copy the
platform text, copy a handoff, and capture YouTube Shorts, Instagram Reels,
Facebook Reels, or LinkedIn receipts after the post is public or scheduled.

After loading, `socialMasterQueue.postingReadiness` and
`publicationMissionControl.deliverables[id=social-9x16-shorts].postingReadiness`
separate the queue into operator-safe buckets:

- `firstWavePostCandidateCount`: derivative clips with durable platform receipt
  ids and no quote-check/test-only flag. These are the first clips to watch once
  and post or schedule.
- `reviewLastCandidateCount`: receipt-ready clips that are intentionally marked
  test/review-last.
- `quoteCheckOrPromotionNeededCount`: expansion/scout clips that have derivative
  artifacts but still need human quote-check, promotion, or durable receipt ids
  before they should be called publication-ready.

This distinction matters: artifact-ready means the MP4/copy/captions exist;
publication-ready means the clip has survived the human review rules for the
posting wave and has a receipt capture path.

The three `publication-*` action commands mirror the Mission Control UI buttons.
They are safe operator actions: reveal the best available release folder, copy
the mission-control JSON, or copy the missing-receipt checklist. They do not
upload, schedule, publish, or mutate receipt truth.

Each lane exposes `operatorArtifacts` so humans, Codex, and future upload
workers can use the same paths without folder guessing:

- `episode16x9.operatorArtifacts`: the 16:9 master, publish packet, upload
  packet bundle, and publication cockpit.
- `social9x16.operatorArtifacts`: the loaded social manifest, final Episode 1
  social posting manifest, final packet folder, start-here guide, posting
  tracker, zip, and handoff JSON.
- `podcastAudio.operatorArtifacts`: the podcast ready manifest, ready packet
  folder, and source podcast/RSS manifest.

The Ready-to-publish handoff panel mirrors those same three lanes in the Mac
app with buttons for the common operator actions. Treat that panel as the
starting point when the task is “publish this episode” rather than hand
navigating export folders.
When the Episode 1 final social packet is loaded, the Social master queue card
acts as a posting cockpit: it shows ranked candidates, artifact readiness for
the derivative MP4, thumbnail, captions, and platform copy, lets the operator
select a rank, and keeps the selected clip/copy/receipt controls bound to that
same rank. Do not treat the first three candidates as the whole packet; the
current Episode 1 packet is a 31-clip posting queue.
The panel also includes a publication proof strip. That strip counts publish
ledger receipts, shows how many remain unproven, and links to the receipt log,
publish packet/checklist, and publication cockpit. A release is not truly
published just because the masters and packets exist; it becomes operationally
true when every relevant platform upload or schedule has a captured public URL
or provider receipt in this proof layer.
Use **Copy missing** in that strip to copy a plain-English checklist of the
remaining unproven receipts, including the exact `publish-receipt-update`
commands. This is the quickest handoff when a human, Codex, or another agent is
finishing platform posting and needs to know what is still open.
For Codex/editor-agent work, the publication proof check is explicit:

```bash
script/agentctl.sh state
script/agentctl.sh missing-publication-receipts
```

Then inspect `publicationReadyHandoff.receiptProof` before claiming a release is
published. `missing-publication-receipts` returns the same missing-proof truth
without requiring a UI clipboard action: status, total/captured/missing counts,
the missing receipt records, and the exact `publish-receipt-update` commands.
The agent action catalog also exposes `review-publication-proof` with endpoint
`GET /state then inspect publicationReadyHandoff.receiptProof`.
Generated publication cockpits include this same summary in
`publication-cockpit.json` and `PUBLICATION-COCKPIT.md` so the release dashboard
survives outside the running app.
For podcast work, treat `podcastPacket` as the preliminary RSS/metadata
manifest and `podcastReadyPacket` as the operator-ready handoff folder with
copied audio, probe data, CSV, README, and optional zip.

Endpoints:

- `GET /full_release`
- `GET /full_release_prepare?directory=<absolute-output-folder>&basename=<name>&proof_seconds=<seconds>`
- `GET /publish_upload_packet_bundle_generate?directory=<absolute-output-folder>&basename=<name>`
- `GET /publication_cockpit_generate?directory=<absolute-output-folder>&basename=<name>`
- `GET /social_shorts_packet`
- `GET /social_shorts_packet_generate?directory=<absolute-output-folder>&basename=<name>`
- `GET /social_publication_queue_generate?directory=<absolute-output-folder>&basename=<name>`
- `GET /social_ready_packet_generate?queue_path=<absolute-social-queue-json>&output=<absolute-output-folder>&basename=<name>&top_count=12&zip=1`
- `GET /social_master_queue`
- `GET /social_master_queue_first_wave`
- `GET /social_master_queue_selected`
- `GET /social_master_queue_selected_receipts`
- `GET /social_master_queue_selected_posting_packet`
- `GET /social_master_queue_open_selected_clip`
- `GET /social_master_queue_copy_selected_platform_copy`
- `GET /social_master_queue_load?path=<absolute-social-master-queue-json>`
- `GET /social_master_queue_select?rank=<candidate-rank>`
- `GET /social_master_queue_artifact?action=open|reveal|copy_handoff|copy_platform_copy&key=clipPath|thumbnailPath|captionSrtPath|platformCopyPath`
- `GET /publication_mission_control`
- `GET /publication_reveal_release_folder`
- `GET /publication_copy_mission_control`
- `GET /publication_copy_missing_receipts`
- `GET /podcast_packet`
- `GET /podcast_packet_generate?directory=<absolute-output-folder>&basename=<name>`
- `GET /publish_connector_readiness`
- `GET /publish_connector_preflight`
- `GET /publish_connector_worker`
- `GET /publish_connector_worker_dry_run?platform=YouTube%20Shorts&lane_id=social-short-clips&worker_path=<absolute-executable-worker-path>`
- `GET /publish_connector_workers_dry_run_all?platform=<optional>&lane_id=<optional>`
- `GET /publish_connector_worker_dry_run?platform=Patreon&lane_id=episode-16x9-master&worker_path=<absolute-executable-worker-path>`
- `GET /publish_connector_worker_dry_run?platform=Instagram&lane_id=social-short-clips&worker_path=<absolute-executable-worker-path>`
- `GET /publish_connector_worker_dry_run?platform=Facebook&lane_id=social-short-clips&worker_path=<absolute-executable-worker-path>`
- `GET /publish_connector_worker_dry_run?platform=LinkedIn&lane_id=social-short-clips&worker_path=<absolute-executable-worker-path>`

Offline release verification:

`script/verify_release_folder.py <release-folder> [--write <json-output-path>]`

The verifier does not need the QuipslyStudio app or local agent server to be
running. It checks the release folder for the expected 16:9 master, 9:16 master,
podcast audio, social shorts, delivery packet, publish packet, upload packet
bundle, social publication queue, social-ready packet, podcast packet,
podcast-ready packet, publication cockpit, and the publication receipt log.
Media artifacts are checked with `ffprobe`; JSON artifacts are parsed as JSON.
The social-ready packet must contain ready clips whose clip, thumbnail, SRT, and
platform-copy paths exist. The podcast-ready packet must contain copied audio,
manual publishing readiness, and Spotify/Apple platform rows. The receipt log is
parsed as CSV and must line up with the upload packet bundle receipt IDs: same
row count, no duplicate receipt ids, no missing packet ids, and no unknown ids.
This is the safe fallback when a long export produced files but the app or
control server is no longer responding. The verifier reports
`publication-complete` only after every upload packet receipt has been captured;
otherwise a valid release remains `ready-for-human-review`.

New full release runs also write `<basename>-release-finalization-receipt.json`
inside the release folder. That receipt records the last completed phase
(`started`, `exports-completed`, `delivery-packet`, `publish-ledger`,
`publish-packet`, `upload-packet-bundle`, `social-shorts-packet`,
`social-publication-queue`, `social-ready-packet`, `podcast-packet`,
`podcast-ready-packet`, `publication-cockpit`, `completed`, or `failed`). The
verifier reports this receipt when present, but older release folders without it
can still verify as ready when the required media and handoff artifacts are
present.
- `GET /publish_connector_worker_dry_run?platform=Spotify&lane_id=podcast-audio-master&worker_path=<absolute-executable-worker-path>`
- `GET /publish_connector_worker_dry_run?platform=Apple%20Podcasts&lane_id=podcast-audio-master&worker_path=<absolute-executable-worker-path>`

This still does not upload to YouTube, Patreon, Instagram, Facebook, LinkedIn,
Spotify, or Apple Podcasts. It creates the local release folder and handoff
files that make manual publishing and future API publishing inspectable.

`publish-connector-readiness` is the truth layer for direct upload work. It
shows, per platform, whether the artifact exists, copy is ready, a receipt has
been captured, which API integration is still missing, and whether an upload
worker is allowed to run. Until a connector has auth, executable upload code,
and receipt-write proof, Quipsly must report direct upload as not ready.

`publish-connector-preflight` is the stricter upload-worker gate. It reports
artifact readiness, title/description readiness, required auth environment key
names, required upload worker environment key names, and whether a worker is
executable. It never prints secret values. A future upload worker can run only
when preflight reports `ready-for-upload-worker`, and the worker must write a
provider receipt or public URL back into the publish ledger.

Preflight also reports bundled dry-run worker availability:

- `bundledDryRunWorkerFilename`
- `bundledDryRunWorkerPath`
- `bundledDryRunWorkerExists`
- `bundledDryRunWorkerExecutableReady`
- `bundledDryRunCommand`
- top-level `bundledDryRunWorkerReadyCount`

These fields are for proof and operator guidance only. A bundled dry-run worker
does not make direct publishing ready; real upload still needs platform auth,
an auth-backed production worker, and receipt capture.

`publish-connector-worker-dry-run` invokes an executable worker with a local
JSON payload path. Dry-run workers validate the artifact, platform copy,
metadata, and receipt contract. They may update `uploadJobStatus` to
`dry-run-passed`; they must not mark a real upload, schedule, publish status,
provider receipt, or public URL. Bundled dry-run workers are:

```bash
script/publish_workers/youtube_upload_worker.py
script/publish_workers/patreon_upload_worker.py
script/publish_workers/social_upload_worker.py
script/publish_workers/podcast_upload_worker.py
```

`publish-connector-workers-dry-run-all` is the in-app agent command for running
all bundled dry-run workers against the current publish ledger. Optional
`platform` and `lane_id` filters let Codex rerun just one destination. It writes
a summarized JSON result into `publishConnectorWorker.resultJson` and updates
successful records to `uploadJobStatus=dry-run-passed`.

Use the shell smoke for broad regression proof. Use the in-app all-worker command
when the editor is already open and a human or Codex operator wants one semantic
release proof action from the live app.

Current bundled worker coverage:

- `youtube_upload_worker.py`: YouTube and YouTube Shorts.
- `patreon_upload_worker.py`: Patreon post + attachment dry-run.
- `social_upload_worker.py`: Instagram, Facebook, and LinkedIn short-video dry-run.
- `podcast_upload_worker.py`: Spotify and Apple Podcasts via the future podcast-host/RSS publishing lane.

Podcast publishing is intentionally modeled as an app-owned podcast host/RSS
handoff first. Spotify and Apple Podcasts are directory destinations for that
audio/feed truth, not random disconnected audio uploads.

Worker proof scripts:

```bash
script/smoke_episode1_all_publish_workers_dry_run.sh --no-build
script/smoke_episode1_youtube_worker_dry_run.sh --no-build
script/smoke_episode1_patreon_worker_dry_run.sh --no-build
script/smoke_episode1_social_worker_dry_run.sh --no-build
script/smoke_episode1_podcast_worker_dry_run.sh --no-build
```

Each smoke prepares an Episode 1 release packet, invokes the relevant dry-run
worker, and checks that the ledger updates `uploadJobStatus` / `uploadJobJson`
without marking `publishStatus` uploaded, scheduled, or published. The
`all-publish-workers` smoke runs the whole bundled worker family and writes a
single summary JSON plus one log per worker group.

## Publish ledger

The publish ledger turns exported artifacts into platform-specific work records.
It is the durable handoff between “a file exists” and “this was uploaded,
scheduled, or published somewhere.”

Use:

```bash
script/agentctl.sh publish-ledger
script/agentctl.sh publish-ledger-generate
script/agentctl.sh publish-release-checklist
script/agentctl.sh publish-connector-readiness
script/agentctl.sh publish-connector-preflight
script/agentctl.sh publish-packet-generate /absolute/output/folder episode-1
script/agentctl.sh publish-receipt-update RECEIPT_ID published https://youtube.example/watch provider-id "published proof" '{"title":"Custom title"}' integration-needed
script/agentctl.sh publish-receipt-update-platform YouTube episode-16x9-master published https://youtube.example/watch provider-id "published proof" "Episode title" "Episode description"
script/smoke_episode1_publish_ledger.sh --no-build
```

Endpoints:

- `GET /publish_ledger`
- `GET /publish_release_checklist`
- `GET /publish_connector_readiness`
- `GET /publish_connector_preflight`
- `GET /publish_connector_worker`
- `GET /publish_connector_worker_dry_run?platform=YouTube%20Shorts&lane_id=social-short-clips&worker_path=<absolute-executable-worker-path>`
- `GET /publish_connector_workers_dry_run_all?platform=<optional>&lane_id=<optional>`
- `GET /publish_connector_worker_dry_run?platform=Patreon&lane_id=episode-16x9-master&worker_path=<absolute-executable-worker-path>`
- `GET /publish_connector_worker_dry_run?platform=Instagram&lane_id=social-short-clips&worker_path=<absolute-executable-worker-path>`
- `GET /publish_connector_worker_dry_run?platform=Facebook&lane_id=social-short-clips&worker_path=<absolute-executable-worker-path>`
- `GET /publish_connector_worker_dry_run?platform=LinkedIn&lane_id=social-short-clips&worker_path=<absolute-executable-worker-path>`
- `GET /publish_connector_worker_dry_run?platform=Spotify&lane_id=podcast-audio-master&worker_path=<absolute-executable-worker-path>`
- `GET /publish_connector_worker_dry_run?platform=Apple%20Podcasts&lane_id=podcast-audio-master&worker_path=<absolute-executable-worker-path>`
- `GET /publish_ledger_generate`
- `GET /publish_packet_generate?directory=<absolute-output-folder>&basename=<name>`
- `GET /publish_receipt_update?id=<receipt-id>&status=<status>&public_url=<url>&provider_receipt_id=<id>&metadata_json=<json>&upload_job_status=<status>&notes=<text>`
- `GET /publish_receipt_update_by_platform?platform=YouTube&lane_id=episode-16x9-master&status=published&public_url=<url>&provider_receipt_id=<id>&title=<text>&description=<text>&notes=<text>`
- `GET /episode_receipt_capture?platform=YouTube&status=published&public_url=<url>&provider_receipt_id=<id>&notes=<text>`

The ledger currently creates records for YouTube, Patreon, Spotify, and Apple
Podcasts at the episode/audio artifact level. When queued shorts exist, it
creates one record per short per social platform using delivery lane IDs like
`social-short-clips/<short-id>` for YouTube Shorts, Instagram, Facebook, and
LinkedIn. It does not upload to those services yet. A record marked
`ready-to-upload` means the artifact is ready and platform integration work can
take over. A record marked `published` must carry a provider receipt or public
URL once real integrations exist.

Human and Codex release operators can update title and description on the
receipt record before upload. Those fields also synchronize into `metadataJson`
so the copied platform handoff packet matches the visible release draft. This
prevents the old “three versions of truth” failure mode where visible UI copy,
metadata JSON, and platform receipts drift apart.

For social shorts, `lane_id=social-short-clips` acts as a parent filter and
matches every `social-short-clips/<short-id>` record for readiness and dry-run
commands. For receipt updates, prefer the full child lane ID when marking a
specific short uploaded, scheduled, or published; the parent lane only picks the
highest-priority matching record.

`publish-release-checklist` turns the ledger into an operator-ready checklist.
It reports artifact readiness, copy readiness, receipt capture, blocked records,
direct API gaps, and ranked next actions. It is deliberately descriptive, not
judgmental: it says what is linked and available, not whether the release is
“good.” Human operators and Codex editors should use it before uploading,
scheduling, or marking receipts complete.

`publish-packet-generate` writes a portable handoff folder. It includes:

- `*-publish-ledger.json`: full publish ledger state.
- `*-publish-release-checklist.json`: release-level counts and next actions.
- `*-publish-manifest.json`: packet manifest and receipt summary.
- one `*-metadata.json` per platform record.
- one `*-upload-job.json` per platform record.
- one `*-checklist.md` per platform record for manual upload/schedule work.

This is the bridge between proxy-rendered artifacts and real platform
integrations. Human operators can use it today for manual publishing; future
OAuth/API workers should consume the same files or equivalent ledger records.

The manifest and per-platform markdown checklists also include bundled dry-run
worker guidance:

- worker filename/path
- executable readiness
- `script/agentctl.sh publish-connector-worker-dry-run ...` command
- dry-run safety language

That makes the exported release folder useful even when it is handed to another
human editor or Codex thread. Dry-run commands prove packet shape and ledger
safety; they still do not publish.

Each record also carries:

- `metadataJson`: platform-specific draft title, description, tags, visibility,
  category, audience, and source policy.
- `metadataStatus`: usually `draft` until a human or agent reviews it.
- `uploadJobKind`: the future integration shape, such as
  `youtube-video-upload`, `patreon-post-draft`, or
  `podcast-feed-or-hosting-publish`.
- `uploadJobStatus`: `integration-needed` until real OAuth/API publishing is
  wired.
- `uploadJobJson`: the inspectable future upload job stub.

Regenerating the ledger may refresh empty drafts and non-terminal work, but it
must not erase records already marked `uploaded`, `scheduled`, or `published`.

## Physical UI event proof

`script/agentctl.sh` is the source of truth for semantic editing. When we need
to prove the real macOS event path, use the repo-owned event helper instead of
assuming Python UI packages are installed:

```bash
script/studioctl.sh ui-tools
script/studioctl.sh ui-request-access
script/studioctl.sh ui-activate
script/studioctl.sh ui-move 900 500
script/studioctl.sh ui-click 900 500
script/studioctl.sh ui-drag 900 500 1200 500
script/studioctl.sh ui-scroll 900 500 0 -500 3
script/studioctl.sh ui-key 49
```

The helper lives at `script/mac_eventctl.swift` and posts real Quartz events.
If macOS blocks it, grant Accessibility permission to the terminal/Codex host
rather than weakening the editor architecture. Semantic proof still comes from
`/state`; physical UI proof catches human-feel bugs like scroll or hover drift.

`cliclick` is available as an optional fallback for click/key/drag style UI
actions. Check or install the toolbox with:

```bash
script/studioctl.sh ui-tools --install
script/studioctl.sh ui-cliclick m:900,500 c:900,500 kp:space
```

Do not use `cliclick` as the primary editor API. It is a proof tool. If a
workflow matters, give it a matching `script/agentctl.sh` semantic command and
verify the result through `/state`.

## Why this matters

The product requirement is not just that the app works for a human once. Codex
also needs a stable, low-anxiety editing surface. That means every serious human
affordance needs a matching agent affordance: state echo, semantic command,
and a focused smoke or proof script.

## Transcript spine commands

Transcript is now a first-class sequence artifact. It should be treated as timed episode metadata, not as detached caption text. Captions, overlay text, hook text, quote pulls, summaries, and future ASR suggestions should derive from `MediaSequence.transcriptSegments` when possible.

Agent-safe transcript commands:

- `script/agentctl.sh transcript-seed-demo` creates a small timed demo transcript from Play Edit ranges for workflow proof.
- `script/agentctl.sh transcript-select first|at_playhead|next|previous [segment-id]` selects a segment and seeks the shared playhead.
- `script/agentctl.sh transcript-apply-to-short caption|overlay|hook` applies selected transcript text to the selected short packet.
- `script/agentctl.sh transcript-clear` clears the active sequence transcript.

Proof path:

- `script/smoke_episode1_transcript_foundation.sh --no-build` loads Episode 1, proves transcript state, applies transcript text to a temporary short caption, and removes its temporary short.

### Transcript import

Use `script/agentctl.sh transcript-import /absolute/path/to/file.srt auto` to import SRT or WebVTT sidecars into the active sequence transcript spine. Import replaces the active sequence transcript segments with parsed timed segments and opens the Transcript workbench.

Supported first-pass formats:

- `.srt` with `00:00:00,000 --> 00:00:01,000` timing.
- `.vtt` / WebVTT with `00:00:00.000 --> 00:00:01.000` timing.
- Speaker prefixes like `Charlie: text` are parsed into `speaker` plus clean transcript text.

Proof path:

- `script/smoke_episode1_transcript_import.sh --no-build` creates a small SRT fixture, imports it into Episode 1, applies one imported segment to a temporary short caption, and removes its temporary test data.

## Program layout rules

The program output uses layout metadata over whole synced source lanes. A single active visual lane defaults to `single_fill` with aspect-fill center crop. Multiple active visual lanes default to format-aware layouts:

- `16:9`: `side_by_side` using equal side-by-side crop slots for Charlie/Homer two-shots.
- `9:16`: `stacked_vertical` using equal stacked crop slots for Charlie/Homer two-shots.

This is intentionally render metadata. It must not split, duplicate, or destructively crop source media. Future per-speaker crop controls should adjust lane/layout metadata and remain reversible.

Proof path:

- `script/smoke_episode1_program_layout.sh --no-build` scans Episode 1 for an existing simultaneous SHOW moment and verifies `/state.programLayout` reports side-by-side for 16:9 and stacked vertical for 9:16.

## Program crop baseline and keyframes

Program crop is selected-lane render metadata. It tunes how a whole source lane is placed inside the current Program Output slot without trimming, duplicating, or modifying the original media.

Default layout rules still apply first:

- One active visual lane fills the active output frame.
- Multiple active visual lanes in `16:9` are side-by-side crop slots.
- Multiple active visual lanes in `9:16` are stacked crop slots.

Then lane crop metadata adjusts the result:

- Baseline crop is stored per lane and per format as `programCrop16x9` or `programCrop9x16`.
- Timed crop keyframes are stored per lane and per format as `programCropKeyframes16x9` or `programCropKeyframes9x16`.
- `panX` and `panY` range from `-1...1` over the available crop overflow.
- `zoom` ranges from `1...4`; `1` means the default aspect-fill crop.
- The Inspector exposes the same model as two explicit editing jobs: `Fix whole camera` / `Baseline` for the overall camera position, and `Animate moment` / `Keyframe` for timed moves at the shared playhead.
- The Inspector also exposes fast framing presets for common human edits: center, tighter, looser, headroom, nudge left, and nudge right. These are convenience controls over the same baseline/keyframe crop metadata.
- The Inspector also exposes podcast-specific framing presets. In `16:9`, these focus on episode-safe talking-head framing such as solo safe, hiding desk, and left/right weighting. In `9:16`, these focus on shorts framing such as vertical solo, punch in, stack top, and stack bottom.
- Quick nudge supports fine, normal, and bold step sizes so sloppy capture framing and creative reframes can both be fixed without turning every adjustment into slider surgery.
- Wide episode framing and vertical shorts framing are intentionally separate recipes. Set `16:9` baseline/keyframes for the episode master, then switch to `9:16` and set the shorts crop without touching the source lane.
- `/state.selectedProgramCrop` always reflects the current selected lane and output format. If a keyframe seems missing, first confirm both `selectedLaneName` and `playbackFormat`.

Agent-safe commands:

```bash
script/agentctl.sh program-crop-presets
script/agentctl.sh program-crop "Charlie Camera" 9:16 0.10 -0.05 1.25
script/agentctl.sh program-crop-preset "Charlie Camera" 9:16 tighter baseline
script/agentctl.sh program-crop-preset "Charlie Camera" 9:16 headroom keyframe 28.5
script/agentctl.sh program-crop-preset "Charlie Camera" 16:9 solo-safe baseline
script/agentctl.sh program-crop-preset "Homer Camera" 16:9 weight-right baseline
script/agentctl.sh program-crop-preset "Charlie Camera" 9:16 vertical-solo baseline
script/agentctl.sh program-crop-preset "Homer Camera" 9:16 stack-bottom keyframe 42.0
script/agentctl.sh program-crop-delta "Charlie Camera" 9:16 0.05 0 0.10
script/agentctl.sh program-crop-keyframe "Charlie Camera" 9:16 28.5 0.10 -0.05 1.25
script/agentctl.sh program-crop-keyframe-delta "Charlie Camera" 9:16 28.5 -0.03 0 0.08
script/agentctl.sh program-crop-clear-keyframes "Charlie Camera" 9:16
```

Agent-recognized preset names include:

- Core: `centered`, `tighter`, `looser`, `headroom`, `left`, `right`.
- Episode framing: `solo-safe`, `hide-desk`, `weight-left`, `weight-right`.
- Shorts framing: `vertical-solo`, `vertical-punch`, `stack-top`, `stack-bottom`.

These are operator labels over the same crop metadata. If the UI and agent command use the same label, they should produce the same kind of edit recipe.

The machine-readable catalog lives at `docs/quipslystudio-program-crop-presets.json` and can be printed with `script/agentctl.sh program-crop-presets` even when the app server is not running. Use that catalog before inventing new preset names.

Proof path:

```bash
script/smoke_episode1_program_crop.sh --no-build
```

This smoke proves baseline crop, crop keyframe state, `/state.selectedProgramCrop`, and cleanup. It should remain separate from source relinking/proxy smokes because crop is an edit recipe over already-synced media.

### Transcript generation bridge

The native editor can now run a provider-neutral transcription bridge for the selected source lane. The bridge keeps Quipsly as the owner of transcript truth: providers produce SRT/VTT text, then Quipsly parses it into `MediaSequence.transcriptSegments` and records a `TranscriptJobRecord` in `MediaSequence.transcriptJobs`.

Current provider contract:

- If a `.srt` or `.vtt` sidecar exists next to the selected readable media/proxy, Quipsly imports that sidecar.
- Otherwise, a local executable command may be supplied. The command receives one argument: the readable media path. It must print SRT or WebVTT text to stdout.
- Generated segments are reviewable transcript metadata. They can feed captions, overlays, hooks, quotes, search, and shorts, but they do not mutate source media.

Agent-safe commands:

```bash
script/agentctl.sh transcript-generate "Charlie Audio" /absolute/path/to/transcriber-command
script/agentctl.sh transcript-generate-selected /absolute/path/to/transcriber-command
script/agentctl.sh transcript-clear-jobs
```

Proof path:

```bash
script/smoke_episode1_transcript_generate.sh --no-build
```

This smoke uses a fixture command that prints SRT to stdout. It proves the app-owned generation loop and job state without pretending a production ASR provider is installed.
