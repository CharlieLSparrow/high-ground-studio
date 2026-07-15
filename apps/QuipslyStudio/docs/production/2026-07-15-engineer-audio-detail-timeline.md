# Engineer audio detail timeline

## Product decision

Audio Room uses one shared sequence-time viewport for Charlie, Homer, and source audio. The same lanes progressively reveal engineering evidence as the viewport narrows. There is no separate pro editor and no second audio truth.

## Implemented

- Added direct 30 second, 5 second, 1 second, and 100 millisecond viewport presets.
- Added adaptive `EPISODE`, `CONTEXT`, `PHRASE`, `TRANSIENT`, `MICRO`, and `SAMPLE` scale labels.
- Added an honest time-per-division readout and per-render-point resolution readout.
- Added absolute timeline labels that reach millisecond precision at fine zoom.
- Increased dialogue-lane height as the viewport narrows.
- Kept L/R RMS, sample peaks, clipping/hot flags, stereo correlation, phase scope, and FFT spectrogram aligned to the same visible stem interval.
- Expanded spectrogram frequency references to 80 Hz, 250 Hz, 1 kHz, 4 kHz, and 12 kHz.

## Validation

`./script/build_and_run.sh --verify` completed successfully on 2026-07-15 and launched the active Quipsly Studio bundle. Only existing AVFoundation deprecation warnings were emitted.

Computer Use could not perform the final visible-window inspection because the Mac was locked. Repeat the visual pass after unlock; do not present compile success as final visual QA.

## Next depth targets

1. Standards-correct EBU R128 momentary, short-term, integrated loudness, LRA, and true-peak history.
2. Cached waveform pyramids for instant hour-to-sample zoom.
3. Selectable linear/log frequency scales and configurable spectrogram ranges.
4. Clickable clipping, silence, overlap, plosive, sibilance, hum, and bleed markers.
5. Agent-readable viewport telemetry for every visible scope.
