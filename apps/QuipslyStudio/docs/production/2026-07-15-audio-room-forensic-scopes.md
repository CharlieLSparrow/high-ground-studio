# Audio Room forensic scopes

Date: 2026-07-15

## Product decision

Audio zoom must reveal new evidence, not merely make the same coarse bars wider. The source-aware Audio Room now keeps its calm whole-episode overview while progressively revealing sample-envelope and spectral evidence below 30 seconds, down to a 50 millisecond window.

The canonical editor truth remains separate equal-clock Charlie, Homer, and watched-source stems. Analysis is read-only and does not alter source or refined media.

## Added evidence

- Separate waveform and log-frequency spectrogram zones.
- Adaptive FFT size and spectral density based on visible duration.
- RMS body and sample-peak envelope.
- dBFS guides at -6, -12, -24, and -48.
- Frequency guides at 100 Hz, 1 kHz, and 10 kHz.
- Hot and clipping evidence.
- Window RMS, peak, crest factor, channel count, sample rate, stereo correlation, DC offset analysis, and clipped-sample count.
- Accessibility readback exposes the same engineering measurements to agents.
- Audio Room view presets for 100 ms, 1 second, 5 seconds, 30 seconds, 2 minutes, and whole-episode fit.

## Validation

`./script/build_and_run.sh --verify` passed and relaunched the active app at:

`apps/QuipslyStudio/DerivedData/Build/Products/Debug/QuipslyMac.app`

Live Episode 4 checks:

- One-second Charlie voice window: RMS -40.0 dBFS, peak -18.5 dBFS, crest 21.5 dB, stereo correlation 1.00, zero clipped samples.
- 100 ms Charlie transient after `V` next-voice navigation: RMS -30.5 dBFS, peak -18.5 dBFS, crest 12.0 dB, stereo correlation 1.00, zero clipped samples.
- Homer remained silent at that shared-clock position, proving independent stem analysis rather than a combined-master visualization.
- The live app rendered the detailed waveform and spectrogram at both resolutions without freezing or leaving the shared sequence clock.

## Next sound-engineering targets

- Per-channel L/R waveform mode rather than mono analysis only.
- Phase vectorscope and correlation history.
- Short-term LUFS and loudness-range lane overlays.
- Noise-floor and spectral-balance references.
- Transient, sibilance, plosive, hum, and dropout markers that remain inspectable metadata.
- Region comparison between raw, cleaned, contribution-gated, restored, presence, and delivery stages.
