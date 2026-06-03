# Quipsly priority map - 2026-06-02

This is the current product map for the all-night build. It is intentionally opinionated so future agents do not drag the app back into the old file-preservation swamp.

## North star

Quipsly is a living creative workspace. The base unit is not a file tree, a page, or a clip bin. The base unit is a durable document with tagged ranges, linked media, and event trails that can project into writing, show planning, recording, editing, publishing, and study views.

Default behavior should show the whole living document. Lenses are subtractive unless there is a very strong reason otherwise.

## Priority stack

1. Keep the living manuscript usable.
   - `/create` is the active manuscript surface.
   - Everything Mode is the default.
   - Book Mode hides production scaffolding.
   - Episode/chapter boundaries should behave like "this section continues until the next boundary."
   - Speaker, show note, quote, media, and workflow tags can overlap and survive edits.

2. Make recording flow out of the manuscript.
   - The recording room should show the script, show notes, clip cues, and local track state together.
   - Audio is the first-class recording spine.
   - Browser recording is the quick cockpit.
   - iPhone/native local audio capture is the reliability path.
   - Every clip play, retake, keeper line, and edit marker should become a timestamped event.

3. Make the video editor consume recording intent.
   - The video editor should ingest audio tracks, transcript segments, YouTube/video clip cues, and session events.
   - The first rough cut should be generated from the recording ledger instead of reconstructed from memory.
   - Existing `/editor` timeline and segment tooling is useful, but it should be pulled toward the manuscript/recording spine.

4. Preserve true collaboration as a real lane, not a fake promise.
   - `/create` currently uses optimistic saves and database persistence.
   - `/manuscript/collab/latest` is the Yjs/Hocuspocus true simultaneous editing lane.
   - Do not claim true simultaneous editing inside `/create` until the kernel/editor shell is actually fused with the collab runtime.

5. Keep publishing connected but not in the way.
   - HighGroundOdyssey.com and Quiplore.com can be content sites.
   - `nest.quipsly.com` should be the app home.
   - `quipsly.com` should explain the product.
   - Publisher Mode can expose export/publish controls without polluting normal writing.

## Current sprint decision

Build `/recorder` into an audio-first Quipsly Recording Room:

- Local mic arm/start/stop.
- Local browser audio download.
- Script stand and producer notes.
- File attachment manifest for iPhone/back-up recordings.
- YouTube clip stack with multiple segments.
- Timestamped event ledger.
- JSON session export as the contract for backend persistence and video-editor ingestion.

This intentionally avoids new schema dependency during the sprint while still creating the shape of the durable production model.

## Next backend model

When ready, persist the JSON session contract as first-class records:

- `RecordingSession`
- `RecordingTrack`
- `RecordingCueEvent`
- `RecordingMarker`
- `TranscriptSegment`

Those should link back to `StudioProject`, `StudioDocument`, `StudioDocumentBlock`, `StudioTaggedSpan`, `StudioVideoSource`, and `StudioVideoSegment` rather than replacing them.

## Episode production room model

An episode should be a production room projected from a manuscript boundary, not a copied file.

When a manuscript contains an episode boundary, Quipsly should be able to open:

- the manuscript range for that episode,
- the recording room for that episode,
- the video/audio timeline for that episode,
- the clip stack and show notes for that episode,
- the transcript and word-level timing for that episode,
- the publish packet for that episode.

The durable relationship should be:

```txt
StudioDocument boundary/range
  -> EpisodeProduction
  -> RecordingSession
  -> Timeline
  -> TranscriptWord timings
  -> Publishing outputs
```

Word-level transcript highlighting should be driven by timeline time:

```ts
currentWord = transcriptWords.find(
  (word) => word.startMs <= timelineTimeMs && timelineTimeMs < word.endMs
);
```

The first UI proof lives in `/editor`: it carries `project` and `episode` URL params, shows an Episode Production Room panel, and highlights transcript words against the editor timeline clock.

The first persistent proof is now `StudioEpisodeProduction`:

- `/api/episode-production` ensures a production room for `projectSlug + episodeSlug`.
- `/editor` displays DB-backed production status and can save timeline/transcript JSON.
- `/recorder` displays DB-backed production status and can save the recording-room package.
- The API self-heals missing dev/starter project shells so editor and recorder routes do not depend on `/create` being visited first.

## Product instincts to preserve

- No "Add paragraph" editor chrome as a primary mental model.
- No additive Show Mode as the center of the product.
- No fake collaboration claims.
- No overfitting to one episode number.
- No heroic preservation of stale messy imports when fresh paste-and-retag is faster.
- The app should be useful for books, talks, articles, study notes, shows, and ridiculous side projects.
