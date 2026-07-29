# Quipsly episode audio-to-upload playbook

Last updated: 2026-07-12

This playbook captures the Episode 4 v007 path so it can be reused without
turning every future episode into artifact archaeology.

## Product principle

Quipsly does not treat a podcast episode as one magic render. It treats it as a
source-backed production chain:

1. Source media stays untouched.
2. Sync and cleanup decisions live as metadata, stems, sidecars, manifests, and
   versioned renders.
3. Audio quality is proved before final video, podcast, and shorts branches are
   trusted.
4. Final upload packets must distinguish local readiness from external
   publication receipts.

## Episode 4 v007 proof packet

Current ready folder:

`/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712`

Open this first:

`/Users/wall-e/Desktop/EPISODE_4_UPLOAD_NOW.command`

Recommended uploads:

- YouTube: `High-Ground-Odyssey-Episode-04-main-59m26-video-v007.mp4`
- Spotify / Apple Podcasts: `High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.m4a`
- Podcast fallback: `High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.mp3`
- YouTube captions: `captions-upload-safe-v007/High-Ground-Odyssey-Episode-04-main-59m26-transcript-upload-safe-v007.srt`
- Upload copy: `UPLOAD_METADATA_EP04.md`

Final packet gate:

`EPISODE_4_FINAL_UPLOAD_PACKET_QC_V007.md`

Current result:

- Status: `passed`
- Hard stops: `0`
- Warnings: `0`
- External publication: not performed by Codex
- Original media: not mutated

## Reusable gates

### 1. Audio spine gate

The current-best mastered spine must pass machine checks and either get a human
pass or a scoped repair note.

Evidence should cover:

- Loudness and true peak.
- Speaker survival: Charlie and Homer both remain present.
- Source leakage and echo control.
- Device translation.
- Transcript/source agreement.
- Review-risk windows with exact timestamps.

Episode 4 lesson: v006 was machine-preferred, but Charlie's scoped feedback
proved the need for v007: echo was gone, Homer needed to be warmer/forward.

### 2. Branch render gate

Only render public branches after the audio truth is good enough for the
deadline. Branches should inherit from the same source-aware audio truth.

Expected branches:

- YouTube long-form video.
- Podcast/RSS audio.
- Shorts/social clips.
- Backup/tight/reference versions when useful.

### 3. Upload packet gate

Every upload packet should be independently checkable without reopening the
editor.

Minimum packet contents:

- `START_HERE_UPLOAD_...md`
- Recommended video file.
- Recommended podcast audio file.
- Fallback MP3.
- Upload-safe SRT captions.
- Upload metadata/copy packet.
- Social shorts folder or explicit "not produced yet" note.
- Machine-readable QC JSON.
- Human-readable QC Markdown.
- Truth statement: not published unless an external receipt exists.

## Episode 4 scripts created from the proof path

These scripts are Episode 4 specific but establish the reusable contract.

- `apps/QuipslyStudio/script/episode4_social_shorts_v007.py`
- `apps/QuipslyStudio/script/episode4_upload_caption_qc_v007.py`
- `apps/QuipslyStudio/script/episode4_caption_upload_safe_v007.py`
- `apps/QuipslyStudio/script/episode4_final_upload_packet_qc_v007.py`

Reusable packet verifier:

- `apps/QuipslyStudio/script/quipsly_final_upload_packet_qc.py`
- `apps/QuipslyStudio/script/quipsly_caption_upload_safe.py`
- `apps/QuipslyStudio/script/quipsly_social_shorts.py`

The generic verifier accepts an episode id, ready folder, recommended video,
recommended podcast audio, optional fallback MP3, upload-safe captions, metadata
packet, optional shorts manifest, and optional reviewer docs. Episode 4 now
passes through this generic verifier with `0` hard stops and `0` warnings.

The generic caption tool accepts a config JSON with long-form caption/media
pairs and an optional shorts manifest. It writes derived upload-safe SRTs without
overwriting source captions. Episode 4 now passes through this generic caption
tool with `8` caption checks, `0` hard stops, and `0` warnings.

The generic social-shorts renderer accepts a config JSON with the source
episode video, transcript JSON, branding copy, output names, and short
candidates. Episode 4 now passes through this generic renderer with `6`
vertical shorts and all decode checks passing. The generic-social final upload
packet verifier also passes with `0` hard stops and `0` warnings.

Remaining refactor target:

Create config-building glue for future episodes so the generic caption,
social-shorts, and final-packet tools can be run from one episode manifest
instead of hand-authored config JSON. The core caption normalizer, social-shorts
renderer, and final upload packet verifier are now generic-proven.

## Re-run checklist for Episode 4 v007

From `/Users/wall-e/Dev/high-ground-studio`:

```bash
python3 -m py_compile \
  apps/QuipslyStudio/script/episode4_social_shorts_v007.py \
  apps/QuipslyStudio/script/episode4_upload_caption_qc_v007.py \
  apps/QuipslyStudio/script/episode4_caption_upload_safe_v007.py \
  apps/QuipslyStudio/script/episode4_final_upload_packet_qc_v007.py

python3 apps/QuipslyStudio/script/episode4_social_shorts_v007.py
python3 apps/QuipslyStudio/script/episode4_upload_caption_qc_v007.py
python3 apps/QuipslyStudio/script/episode4_caption_upload_safe_v007.py
python3 apps/QuipslyStudio/script/episode4_final_upload_packet_qc_v007.py
zsh -n /Users/wall-e/Desktop/EPISODE_4_UPLOAD_NOW.command
```

Expected final result:

- Final upload packet QC status `passed`.
- Hard stops `0`.
- Warnings `0`.

## Generic packet verifier proof command

The current Episode 4 packet also proves the reusable verifier:

```bash
python3 apps/QuipslyStudio/script/quipsly_final_upload_packet_qc.py \
  --ready-dir "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712" \
  --episode-id episode-4 \
  --title "High Ground Odyssey Episode 4" \
  --recommendation "Upload the main 59:26 v007 cut for YouTube, Spotify, and Apple; keep the tight 44:36 cut as backup." \
  --youtube-video "High-Ground-Odyssey-Episode-04-main-59m26-video-v007.mp4" \
  --podcast-audio "High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.m4a" \
  --podcast-fallback "High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.mp3" \
  --captions "captions-upload-safe-v007/High-Ground-Odyssey-Episode-04-main-59m26-transcript-upload-safe-v007.srt" \
  --metadata "UPLOAD_METADATA_EP04.md" \
  --social-shorts-start-here "episode-4-v007-social-shorts/START_HERE_EPISODE_4_V007_SHORTS.md" \
  --social-shorts-manifest "episode-4-v007-social-shorts/episode-4-v007-social-shorts-manifest.json" \
  --producer-handoff "PRODUCER_HANDOFF_EP04_V007.md" \
  --upload-qc-json "episode-4-upload-qc-v007.json" \
  --expected-short-count 6 \
  --output-stem "EPISODE_4_GENERIC_FINAL_UPLOAD_PACKET_QC_V007" \
  --start-here-name "START_HERE_UPLOAD_EPISODE_4_GENERIC_NOW.md" \
  --desktop-launcher "/Users/wall-e/Desktop/EPISODE_4_UPLOAD_NOW_GENERIC.command"
```

Expected output:

- `status=passed`
- `hardStopCount=0`
- `warningCount=0`

## Generic caption upload-safe proof command

Episode 4 config:

`/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712/EPISODE_4_CAPTION_UPLOAD_SAFE_CONFIG_V007.json`

Run:

```bash
python3 apps/QuipslyStudio/script/quipsly_caption_upload_safe.py \
  --config "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712/EPISODE_4_CAPTION_UPLOAD_SAFE_CONFIG_V007.json"
```

Expected output:

- `status=passed`
- `checkCount=8`
- `hardStopCount=0`
- `warningCount=0`

## Generic social-shorts proof command

Episode 4 config:

`/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712/EPISODE_4_SOCIAL_SHORTS_CONFIG_V007.json`

Run:

```bash
python3 apps/QuipslyStudio/script/quipsly_social_shorts.py \
  --config "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712/EPISODE_4_SOCIAL_SHORTS_CONFIG_V007.json"
```

Expected output:

- `status=rendered`
- `shortCount=6`
- `allDecodeChecksPassed=true`

Generic-social upload packet QC:

```bash
python3 apps/QuipslyStudio/script/quipsly_final_upload_packet_qc.py \
  --ready-dir "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712" \
  --episode-id episode-4 \
  --title "High Ground Odyssey Episode 4" \
  --recommendation "Upload the main 59:26 v007 cut for YouTube, Spotify, and Apple; keep the tight 44:36 cut as backup." \
  --youtube-video "High-Ground-Odyssey-Episode-04-main-59m26-video-v007.mp4" \
  --podcast-audio "High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.m4a" \
  --podcast-fallback "High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.mp3" \
  --captions "captions-upload-safe-v007/High-Ground-Odyssey-Episode-04-main-59m26-transcript-upload-safe-v007.srt" \
  --metadata "UPLOAD_METADATA_EP04.md" \
  --social-shorts-start-here "episode-4-v007-social-shorts-generic/START_HERE_EPISODE_4_V007_GENERIC_SHORTS.md" \
  --social-shorts-manifest "episode-4-v007-social-shorts-generic/episode-4-v007-generic-social-shorts-manifest.json" \
  --producer-handoff "PRODUCER_HANDOFF_EP04_V007.md" \
  --upload-qc-json "episode-4-upload-qc-v007.json" \
  --expected-short-count 6 \
  --output-stem "EPISODE_4_GENERIC_SOCIAL_FINAL_UPLOAD_PACKET_QC_V007" \
  --start-here-name "START_HERE_UPLOAD_EPISODE_4_GENERIC_SOCIAL_NOW.md" \
  --desktop-launcher "/Users/wall-e/Desktop/EPISODE_4_UPLOAD_NOW_GENERIC_SOCIAL.command"
```

Expected output:

- `status=passed`
- `hardStopCount=0`
- `warningCount=0`

## Generic upload packet config-builder proof command

Episode 4 builder manifest:

`/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712/EPISODE_4_UPLOAD_PACKET_BUILDER_INPUT_V007.json`

Run:

```bash
python3 apps/QuipslyStudio/script/quipsly_upload_packet_config_builder.py \
  --manifest "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712/EPISODE_4_UPLOAD_PACKET_BUILDER_INPUT_V007.json" \
  --force

bash "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712/upload-packet-config-builder-v007/run-caption-upload-safe.sh"
bash "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712/upload-packet-config-builder-v007/run-social-shorts.sh"
bash "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712/upload-packet-config-builder-v007/run-final-packet-qc.sh"
```

Expected output:

- Builder generated config/scripts with `0` failed checks.
- Builder caption upload-safe pass: `status=passed`, `hardStopCount=0`, `warningCount=0`.
- Builder social shorts: `status=rendered`, `shortCount=6`, `allDecodeChecksPassed=true`.
- Builder final upload packet QC: `status=passed`, `hardStopCount=0`, `warningCount=0`.

Remaining refactor target:

Roll this builder input-manifest pattern across Episodes 1-6 so future upload packets can be generated from one compact episode contract instead of hand-built JSON and shell commands.

## Rollout rule for Episodes 1-6

Do not let another episode block Episode 4. Once Episode 4 is published or the
upload is handed to Charlie, roll this playbook episode by episode:

1. Identify current-best sync and audio truth.
2. Create or repair the current-best mastered spine.
3. Keep separate refined stems available where possible.
4. Render branches only after audio is good enough for the target release.
5. Build a clean upload packet.
6. Run packet QC.
7. Record external publication receipts only after real platform upload.

If an episode stalls because media is missing or sync is uncertain, write the
blocker into that episode's packet and continue with the next episode.

## Do not regress these truths

- Never mutate original media.
- Never overwrite previous versions.
- Never claim publication without an external URL or receipt.
- Never treat caption existence as transcript confidence. Validate parse,
  timing, duration alignment, and upload-safe cue boundaries.
- Never treat a single combined master as the only editor truth when separate
  stems are needed for later edits.
## Publication receipt capture proof

Local upload readiness is not the same as publication. Episode 4 now has a local receipt ledger generated by:

```bash
python3 apps/QuipslyStudio/script/quipsly_publication_receipt_ledger.py \
  --ready-dir "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712" \
  --init
```

Generated artifacts:

- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712/PUBLICATION_RECEIPTS_EP04_V007.json`
- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712/PUBLICATION_RECEIPTS_EP04_V007.md`

Current expected pre-upload result:

- `status=ready-for-receipt-capture`
- `receiptCapturedCount=0`
- `hardStopCount=0`

After manual upload, capture receipts with commands like:

```bash
python3 apps/QuipslyStudio/script/quipsly_publication_receipt_ledger.py \
  --ready-dir "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712" \
  --record --platform YouTube --lane long-form-video --status published \
  --public-url "https://youtu.be/..." --notes "manual upload receipt"
```

Rule: Tower/Quipsly should not claim external publication until this ledger or a platform API receipt has the URL or provider receipt id.



## Generic upload integrity certificate proof command

The upload integrity certificate fingerprints the exact artifacts a human is about to upload. Use it after final renders, captions, copy, thumbnails, shorts, and receipt scaffolding exist, and before moving files between drives or uploading to platforms.

Episode 4 proof command:

```bash
python3 apps/QuipslyStudio/script/quipsly_upload_integrity_certificate.py \
  --ready-dir "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712" \
  --episode-id episode-4 \
  --title "Episode 4 v007" \
  --recommendation "Upload main v007 59:26 cut tonight; use tight 44:36 only if runtime matters more than context." \
  --upload-set youtubeVideo="High-Ground-Odyssey-Episode-04-main-59m26-video-v007.mp4" \
  --upload-set podcastAudioPreferred="High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.m4a" \
  --upload-set podcastAudioFallback="High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.mp3" \
  --upload-set youtubeCaptions="captions-upload-safe-v007/High-Ground-Odyssey-Episode-04-main-59m26-transcript-upload-safe-v007.srt" \
  --upload-set metadata="UPLOAD_METADATA_EP04.md" \
  --upload-set receiptLedger="PUBLICATION_RECEIPTS_EP04_V007.md" \
  --qc finalPacketQc=passed \
  --qc hardStops=0 \
  --qc warnings=0 \
  --qc builderShortsStatus=rendered \
  --qc builderShortCount=6 \
  --qc builderShortDecodeChecksPassed=True \
  --qc publicationReceiptsStatus=ready-for-receipt-capture \
  --file "High-Ground-Odyssey-Episode-04-tight-44m36-video-v007.mp4" \
  --file "High-Ground-Odyssey-Episode-04-tight-44m36-podcast-audio-v007.m4a" \
  --file "captions-upload-safe-v007/High-Ground-Odyssey-Episode-04-tight-44m36-transcript-upload-safe-v007.srt" \
  --file "episode-4-v007-social-shorts-builder/clips/01-01-work-hard-enjoy-it-work-hard-and-enjoy-it-9x16-builder-v007.mp4" \
  --file "episode-4-v007-social-shorts-builder/clips/02-02-work-can-be-human-work-can-be-human-9x16-builder-v007.mp4" \
  --file "episode-4-v007-social-shorts-builder/clips/03-03-tech-support-and-military-comms-tech-support-and-military-comms-9x16-builder-v007.mp4" \
  --file "episode-4-v007-social-shorts-builder/clips/04-04-leadership-is-design-leadership-is-design-9x16-builder-v007.mp4" \
  --file "episode-4-v007-social-shorts-builder/clips/05-05-simple-solutions-simple-solutions-count-9x16-builder-v007.mp4" \
  --file "episode-4-v007-social-shorts-builder/clips/06-06-costa-rica-buffet-the-costa-rica-buffet-story-9x16-builder-v007.mp4" \
  --output-stem "EPISODE_4_UPLOAD_INTEGRITY_CERTIFICATE_V007" \
  --sha-name "SHA256SUMS_EP04_V007.txt" \
  --json
```

Expected output:

- `status=passed`
- `missing=[]`
- `EPISODE_4_UPLOAD_INTEGRITY_CERTIFICATE_V007.md` regenerated
- `EPISODE_4_UPLOAD_INTEGRITY_CERTIFICATE_V007.json` regenerated
- `SHA256SUMS_EP04_V007.txt` regenerated

Truth rule: matching checksums prove local artifact identity, not external publication. Publication still requires platform URLs or provider receipts in the receipt ledger.

## Generic final publisher index proof command

The final publisher index is the one-page front door for a completed local upload packet. It should be generated after final QC, platform copy, thumbnail candidates, shorts, checksums, and receipt capture scaffolding exist.

Episode 4 proof command:

```bash
python3 apps/QuipslyStudio/script/quipsly_final_publisher_index.py \
  --ready-dir "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712" \
  --episode-id episode-4 \
  --title "High Ground Odyssey Episode 4" \
  --recommendation "Upload the main v007 59:26 episode tonight. Use the M4A for podcast distribution, upload the SRT captions to YouTube, use the recommended thumbnail, and record receipts after manual upload." \
  --start-here "START_HERE_UPLOAD_EPISODE_4_TONIGHT_20260712.md" \
  --youtube-video "High-Ground-Odyssey-Episode-04-main-59m26-video-v007.mp4" \
  --podcast-audio "High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.m4a" \
  --podcast-fallback "High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.mp3" \
  --captions "captions-upload-safe-v007/High-Ground-Odyssey-Episode-04-main-59m26-transcript-upload-safe-v007.srt" \
  --metadata "UPLOAD_METADATA_EP04.md" \
  --platform-copy "platform-upload-copy-v007/START_HERE_PLATFORM_UPLOAD_COPY_EP04_V007.md" \
  --thumbnail "youtube-thumbnails-v007/EP04-thumbnail-recommended-work-hard-stay-human-v007.jpg" \
  --thumbnail-readme "youtube-thumbnails-v007/START_HERE_EPISODE_4_YOUTUBE_THUMBNAILS_V007.md" \
  --thumbnail-json "youtube-thumbnails-v007/EPISODE_4_YOUTUBE_THUMBNAILS_V007.json" \
  --social-shorts-start-here "episode-4-v007-social-shorts-builder/START_HERE_EPISODE_4_V007_BUILDER_SHORTS.md" \
  --social-shorts-manifest "episode-4-v007-social-shorts-builder/episode-4-v007-builder-social-shorts-manifest.json" \
  --integrity-certificate "EPISODE_4_UPLOAD_INTEGRITY_CERTIFICATE_V007.md" \
  --sha256s "SHA256SUMS_EP04_V007.txt" \
  --final-qc-json "EPISODE_4_BUILDER_FINAL_UPLOAD_PACKET_QC_V007.json" \
  --transcript-confidence "EPISODE_4_TRANSCRIPT_CONFIDENCE_NOTE_V007.md" \
  --receipt-instructions "AFTER_UPLOAD_RECEIPT_CAPTURE_EP04_V007.md" \
  --publication-receipts "PUBLICATION_RECEIPTS_EP04_V007.md" \
  --publication-receipts-json "PUBLICATION_RECEIPTS_EP04_V007.json" \
  --receipt-launcher "/Users/wall-e/Desktop/EPISODE_4_RECORD_UPLOAD_RECEIPTS_INTERACTIVE.command" \
  --output-stem "EPISODE_4_FINAL_PUBLISHER_INDEX_V007" \
  --link-doc "UPLOAD_README.md" \
  --link-doc "START_HERE_UPLOAD_EPISODE_4_TONIGHT_20260712.md" \
  --json
```

Expected output:

- `status=ready-to-upload`
- `missing=[]`
- `EPISODE_4_FINAL_PUBLISHER_INDEX_V007.md` regenerated
- `EPISODE_4_FINAL_PUBLISHER_INDEX_V007.json` regenerated

Truth rule: the final publisher index proves local upload readiness only. It must keep external publication receipt truth in `PUBLICATION_RECEIPTS_...`, never in a local file-exists check.

## Generic upload sanity check

Added: 2026-07-12

Use this after a final upload packet exists and before manual upload. It checks
that the exact files named for publication are present and coherent: YouTube
video, podcast audio, fallback MP3, captions, thumbnail, upload copy, publisher
index, producer lock, receipt helper, media duration/shape, SRT timing,
thumbnail dimensions, and optional loudnorm proof.

Reusable script:

```bash
python3 apps/QuipslyStudio/script/quipsly_upload_sanity_check.py \
  --config "/path/to/EPISODE_UPLOAD_SANITY_CONFIG.json" \
  --json
```

Episode 4 v007 config:

```bash
python3 apps/QuipslyStudio/script/quipsly_upload_sanity_check.py \
  --config "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712/EPISODE_4_UPLOAD_SANITY_CONFIG_V007.json" \
  --json
```

Current Episode 4 v007 result:

- Status: `ready-to-upload`
- Hard stops: `0`
- Warnings: `0`
- Markdown proof: `EPISODE_4_TONIGHT_UPLOAD_SANITY_CHECK_20260712_GENERIC.md`
- JSON proof: `EPISODE_4_TONIGHT_UPLOAD_SANITY_CHECK_20260712_GENERIC.json`

Truth boundary: this proves local upload readiness only. It does not upload,
publish, schedule, mutate source media, or create platform receipts.

## Upload readiness board across episode folders

Added: 2026-07-12

Use this board to see which episode export folders have real upload-packet
proof, which are blocked, and which still need an upload sanity config.

Reusable script:

```bash
python3 apps/QuipslyStudio/script/quipsly_upload_readiness_board.py \
  --root "/Volumes/My Passport/Episode_and_Shorts_Test" \
  --run-sanity \
  --json
```

Current board outputs:

- `/Volumes/My Passport/Episode_and_Shorts_Test/QUIPSLY_UPLOAD_READINESS_BOARD.md`
- `/Volumes/My Passport/Episode_and_Shorts_Test/QUIPSLY_UPLOAD_READINESS_BOARD.json`

Current result:

- Status: `ready-with-gaps`
- Configured packets: `1`
- Ready packets: `1`
- Blocked packets: `0`
- Needs config: `6`

Interpretation: Episode 4 has a real configured upload packet and passes the
sanity gate. Other episode folders exist on the external drive but still need
proper upload packets/configs before anyone should trust them for publishing.

Truth boundary: this board is local readiness evidence only. It does not upload,
publish, schedule, mutate source media, or create publication receipts.

## Episode media/export inventory

Added: 2026-07-12

Use this inventory when the question is not "what can I upload right now?" but
"what do we actually have, and what should happen next?" It scans episode
folders and nearby root-level artifacts for source media, rendered media,
shorts, captions, thumbnails, upload sanity configs, and upload sanity proofs.

Reusable script:

```bash
python3 apps/QuipslyStudio/script/quipsly_episode_media_inventory.py \
  --root "/Volumes/My Passport/Episode_and_Shorts_Test" \
  --json
```

Optional slower proof mode with ffprobe on top media files:

```bash
python3 apps/QuipslyStudio/script/quipsly_episode_media_inventory.py \
  --root "/Volumes/My Passport/Episode_and_Shorts_Test" \
  --probe-media \
  --json
```

Current inventory outputs:

- `/Volumes/My Passport/Episode_and_Shorts_Test/QUIPSLY_EPISODE_MEDIA_INVENTORY.md`
- `/Volumes/My Passport/Episode_and_Shorts_Test/QUIPSLY_EPISODE_MEDIA_INVENTORY.json`

Current fast inventory result:

- Status: `inventory-ready`
- Episodes tracked: `6`
- Upload-ready: `1`
- Needs upload packet/config: `5`
- Source-only: `0`

Interpretation: Episode 4 has upload-ready proof. Episodes 1, 2, 3, 5, and 6
have material or partial outputs in the production root, but they still need a
proper upload packet/config before anyone should trust them for publishing.

Truth boundary: this inventory is local production-routing evidence only. It
does not upload, publish, schedule, mutate source media, or create publication
receipts.
