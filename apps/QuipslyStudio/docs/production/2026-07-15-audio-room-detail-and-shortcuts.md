# Audio Room Detail and Shortcut Checkpoint

Date: 2026-07-15

## Result

Episode 4 now has a native source-aware Audio Room that keeps Charlie, Homer, and source audio on one sequence clock. The heavy static analysis surface no longer rebuilds on every playback tick, and the visible timeline can move from a full-episode view to a two-second inspection window.

## Proven in the running Mac app

- The app launched through `./script/build_and_run.sh --verify` from `apps/QuipslyStudio`.
- The loaded surface identified itself as `Episode 4 Audio Room` with three stems and a `1:53:20` sequence.
- `Space` played and paused the three-stem Together audition.
- `J` and `L` moved the shared playhead backward and forward by ten seconds.
- `0` changed the visible range to the full episode.
- Repeated `+` input changed the visible range to the two-second floor.
- `Shift-O` jumped to a measured Charlie/Homer overlap at about `0:01:32`.
- Charlie and Homer displayed independent sample-level PCM envelopes at that overlap while sharing one playhead.
- Deep-detail playback measured about `18.6%` CPU. The prior coarse Audio Room playback result was about `6.2%`; both are far below the earlier roughly `100%` invalidation failure.

## Visual truth now available

- RMS body for average energy.
- Sample-peak envelope for transient headroom.
- Crest caps where peaks extend beyond the RMS body.
- Voice-activity rail.
- Hot markers above -3 dBFS.
- Clip-risk markers above -1 dBFS.
- A cached per-pixel PCM envelope for visible windows of 30 seconds or less.
- Separate, aligned Charlie and Homer views rather than a single opaque master waveform.

## Architecture

- `AudioRoomLiveClock` isolates moving playhead state from the static analysis hierarchy.
- `AudioDetailAnalysisCache` reads only the visible PCM range on a utility task and keeps a bounded range/resolution cache.
- Native Audio Room commands have one semantic router shared by menus and local key handling.
- Shortcut suppression now applies only while a genuinely editable text view owns the key window.
- Originals and editorial source stems remain untouched.

## Known next work

- Add cached FFT frequency tiles using AVFAudio PCM reads and Accelerate/vDSP. Do not label amplitude summaries as a spectrogram.
- Add loudness history, gain-reduction history, noise-floor bands, and true-peak event lanes when those measurements exist.
- Expose zoom, selection, and analysis commands through the agent server so tests do not depend on synthesized OS keys.
- Continue checking deep-detail CPU while the playhead crosses cache-window boundaries.
- Prove the `T` and `Shift-T` selection shortcuts in the real app after the command bridge checkpoint.
