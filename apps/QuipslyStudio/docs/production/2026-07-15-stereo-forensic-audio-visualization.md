# Stereo forensic audio visualization

## Product outcome

Quipsly Studio's Episode 4 Audio Room now exposes the same sample window as four aligned views:

- Separate left and right RMS and sample-peak envelopes.
- A frequency-over-time spectrogram.
- A time-over-time stereo correlation trace with negative-correlation flags.
- A compact phase vectorscope for stereo sources.

The source files remain unchanged. Analysis is read-only, cached by source path and visible time window, and remains attached to the shared episode playhead.

## Measurements exposed to humans and agents

- Sample rate and channel count.
- Left and right RMS and peak in dBFS.
- Left/right balance in dB.
- Crest factor.
- DC offset.
- Stereo correlation.
- Clipped sample count.

These values are also in the native accessibility tree. Agent review does not need to infer measurements from pixels.

## Real-app proof

Built and launched with:

```bash
./script/build_and_run.sh --verify
```

The active app loaded `Episode 4 Audio Room`, duration `1:53:20`, with three canonical stems.

At an 18.750 second view near `00:05:41`:

- Charlie: -42.0 dBFS RMS, -18.4 dBFS peak, no clipped samples.
- Homer: -46.3 dBFS RMS, -23.5 dBFS peak, no clipped samples.

At a 1.172 second view on the same clock:

- Charlie: effectively silent.
- Homer: -50.3 dBFS RMS, -33.4 dBFS peak, no clipped samples.

This proves the Audio Room can move from episode scale to syllable scale without separating the stems onto different clocks.

## Next professional scope targets

1. EBU R128 momentary, short-term, and integrated loudness history using a standards-correct K-weighted implementation.
2. Loudness range and true-peak history, not only window summaries.
3. Detectable event lanes for plosives, sibilance, hum, clipping, dropouts, and suspicious denoiser/gate boundaries.
4. Raw, cleaned, contribution, restored, presence, and delivery stage comparison on the same selected range.
5. Phase/correlation history that can be expanded into a dedicated stereo-analysis panel when a source is not dual mono.

The interface should continue to prefer aligned visuals and direct listening over explanatory forms.
