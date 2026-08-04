# Studio-source automated edit evidence

Date: 2026-08-04
Worktree: `/Users/wall-e/Dev/high-ground-studio-product`
Priority: best-in-market audio visibility, transcription trust, and reversible automated editing

## Outcome

Quipsly automated edit analysis now resolves decoded audio evidence from either an immutable Capture recording or an immutable Studio media source. The editor sends the selected episode-spine asset when one is known; the server otherwise proceeds only when one released source is unambiguous. This repairs an ownership defect that previously made canonical imported podcast/video media invisible to automated edit evidence even after it had a complete transcript and complete-decode signal profile.

The durable proposal contract is now v2. It carries a unified media identity:

- `mediaAssetKind`: `capture-recording` or `studio-media`;
- `mediaAssetId`;
- immutable source SHA-256 and storage generation;
- complete-decode signal-profile SHA-256;
- protected playback source identity when available.

The database migration renames the prior proposal-set `recordingAssetId` column to `mediaAssetId`, adds `mediaAssetKind`, and backfills prior rows as `capture-recording`. Existing v1 proposal JSON remains readable through a narrow legacy identity adapter; new writes use v2.

## Trust boundary

For Studio media, the server:

1. requires the asset to be attached to the authorized project and episode;
2. requires a completed `audio-signal-profile` job for that exact non-proxy asset;
3. parses the complete-decode job and result contracts;
4. re-inspects and hashes the current immutable source;
5. compares current generation, SHA-256, size, asset, and source coordinates with the job receipt;
6. exposes only the canonical protected `/api/ingest/media/:sourceId` player.

If the source receipt no longer matches, the evidence is held. If multiple distinct released sources remain and no exact source was selected, analysis is ambiguous. Quipsly does not guess which waveform owns the transcript.

Complete-decode observations such as possible dropouts, clipping, near-digital silence, and stereo imbalance now become `signal-attention` review candidates. They retain the exact source/profile/range/detail and require listening. They never authorize a cut, repair, replacement, render, or publication. A zero-length observation at the exact media endpoint is clamped into the final millisecond without exceeding source duration.

Audio mastery intentionally remains downstream of editing. A mastered preview is not used to decide source cuts because that would mix delivery processing into editorial truth. Master approval and later delivery promotion remain separate, source-bound operations.

## Product research applied

- Adobe Premiere's text-based editing maps transcript operations to timeline edits and provides bulk pause/filler workflows while preserving timeline refinement as a distinct stage: <https://helpx.adobe.com/uk/premiere/desktop/edit-projects/edit-video-using-text-based-editing/overview-of-text-based-editing.html> and <https://helpx.adobe.com/in/premiere/desktop/edit-projects/edit-video-using-text-based-editing/detect-and-delete-pauses-in-transcripts.html>.
- Descript exposes per-instance filler review and an explicit surrounding-audio analysis option to avoid harsh cuts: <https://help.descript.com/hc/en-us/articles/10164806394509-Remove-filler-words>.
- FFmpeg documents silence detection, silence removal, and BS.1770 loudness normalization as separate filters. Detection output is evidence, not an editorial decision: <https://www.ffmpeg.org/ffmpeg-filters.html>.

Quipsly's differentiator is the shared source clock and evidence lineage: waveform, transcript, signal warnings, proposed ranges, protected playback, review receipts, draft actions, and canonical timeline saves remain inspectable as distinct events.

## Genuine HGO retained operation

The local retained operation used the actual Episode 8 “Be Curious” source:

- episode: `episode-8-i-wasnt-born-a-leader`;
- asset: `cmsek11ae0005q8xl59k1zucr`;
- protected source: `cmsek11a50004q8xl5vjb1756`;
- immutable SHA-256: `acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`;
- source size: 19,100,059 bytes;
- canonical transcript: 84 segments and 597 provider-timed words;
- complete-decode signal job: `audio_signal_4923f4c834aa4573ad81120dd668594e`;
- displayed waveform: 172 bounded points;
- protected video range playback: HTTP 206;
- automated result: zero cut proposals and 19 review candidates.

The result is correct for this source: Quipsly found review evidence but did not invent a cut. One v2 proposal set was appended to the review ledger with the Studio media identity. It was not applied.

The same operation proved:

- signed-out analysis: HTTP 401;
- ungranted retained account: HTTP 403;
- current source hash and size unchanged;
- episode production JSON unchanged;
- canonical timeline JSON unchanged;
- no render or publication.

## Verification

- Prisma format, client generation, 57-migration local deployment, and migration-status readback: pass;
- focused proposal contract, deterministic evidence, Capture/Studio resolver, ledger, API, timeline-state, evidence-map, and editor tests: 53 pass;
- retained-operation contract tests: pass;
- genuine HGO retained Studio automated-edit operation: pass.

- full Nest Jest: 277 suites and 1,466 runnable tests pass, with 38 suites / 110 tests intentionally skipped;
- strict shared-domain and Nest TypeScript: pass;
- optimized 170-page production build: pass with the established 8 GB Node build heap.
