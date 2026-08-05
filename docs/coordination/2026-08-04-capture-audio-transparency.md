# Capture audio transparency

Date: 2026-08-04

Status: implemented capture-edge evidence; physical hardware acceptance remains open

## Outcome

Quipsly no longer presents an unexplained microphone percentage as audio
quality. Browser and iPhone now name the signal they actually measured, the
unit, the path being observed, and the analysis they did not perform.

### Browser call path

`Test selected setup` observes the selected browser call stream with Web Audio
time-domain samples and shows:

- frame RMS in dBFS;
- sample peak and peak hold in dBFS;
- clipped-sample observations;
- AudioContext sample rate and source-reported channel count;
- the browser-reported echo-cancellation, noise-suppression, and automatic-gain
  settings;
- explicit no-signal, low, healthy-speech, hot, and clipping-risk states.

This is call-path confidence evidence. It is not evidence about a separately
retained source and is explicitly not integrated loudness or true peak.

### Browser retained source

The independent retained-source recorder observes its unprocessed selected
audio stream while MediaRecorder writes durable OPFS chunks. Its preferred path
is a versioned AudioWorklet running on the Web Audio rendering path. The worklet
analyzes every delivered channel and sends bounded aggregate packets rather
than PCM to the control thread. Each packet includes a monotonic sequence,
render-quantum count, channel count, sample count, sum of squares, sample peak,
and observed saturated-sample count. This avoids making capture evidence depend
on `requestAnimationFrame` cadence or page paint load.

Browsers without AudioWorklet retain an explicitly named
`analyser-animation-frame-fallback`. The fallback is useful evidence but is not
silently treated as equivalent. On clean stop Quipsly adds a versioned
`quipsly-browser-source-meter-v2` summary to the source profile before the
immutable upload manifest is reserved. The receipt preserves which measurement
path ran, sample rate, reported source channels, observed analysis channels,
render quanta or frames, observed samples, message count, sequence gaps,
highest aggregate RMS, sample peak, saturated-sample observations, and exact
observation times.

The UI retains an explicit meter-v1 compatibility reader so older protected
test takes remain inspectable and recoverable; absent v1 fields are described
as unrecorded rather than synthesized.

The receipt marks itself `realtime-observation-not-complete-decode` and freezes
three false claims: no complete decode, no integrated-loudness measurement, and
no true-peak measurement. The source UI exposes those limitations. Verified
post-capture signal, waveform, spectral, loudness, and mastery receipts remain
the authority for editorial and delivery decisions.

### Quipsly Capture

The active native recorder now presents AVAudioRecorder/LiveKit-local-input
average and peak power separately in dBFS. Its accessible value includes
the signal state and both measurements. The former normalized percentage has
been removed. The UI states that these measurements are not LUFS or true peak
and that preserved-source analysis follows after capture.

## Ownership and safety

- Metering never starts a recording, grants consent, joins a room, uploads, or
  mutates canonical work.
- Browser call-path processing and retained-source processing are shown
  separately.
- Capture-time observations travel only with the exact source profile; they do
  not replace exact-byte verification or complete-decode analysis.
- Existing immutable media, consent receipts, source identity, and upload
  recovery remain unchanged.

## Standards and implementation decisions

- The W3C Web Audio specification requires distinct control and rendering
  threads. Quipsly therefore uses AudioWorklet render-quantum aggregates for a
  retained browser source and reserves AnalyserNode sampling for live visual
  confidence or a named compatibility fallback:
  https://www.w3.org/TR/webaudio-1.1/#control-thread-and-rendering-thread
- Apple documents `AVAudioRecorder.updateMeters()` as refreshing average and
  peak power, with `averagePower(forChannel:)` and `peakPower(forChannel:)`
  reported in dBFS. Native Capture uses those exact names rather than claiming
  raw sample-peak analysis:
  https://developer.apple.com/documentation/avfaudio/avaudiorecorder/updatemeters()
- ITU-R BS.1770-5 defines programme loudness and true-peak algorithms. Those
  results must come from complete-source analysis, not a capture confidence
  meter: https://www.itu.int/rec/R-REC-BS.1770-5-202311-I/en
- EBU Tech 3341 defines Momentary (400 ms), Short-term (3 s), and Integrated
  EBU Mode loudness meters. Quipsly will use the published EBU test set when the
  post-capture loudness implementation is promoted to authoritative evidence:
  https://tech.ebu.ch/publications/tech3341 and
  https://tech.ebu.ch/publications/ebu_loudness_test_set

### Evidence tiers

1. **Live confidence:** responsive level, routing, channel, processing, and
   no-signal/clipping-risk guidance for setup. Never mastering authority.
2. **Capture-time receipt:** versioned observation method, coverage counters,
   message gaps, settings, and explicit limitations bound to the exact take.
3. **Verified-source analysis:** complete decode after exact-byte verification;
   waveform pyramid, channel mapping, sample peak, BS.1770 true peak and
   loudness, spectral/noise evidence, clock drift, and processing provenance.
4. **Delivery/master receipt:** target-specific policy, proposed processing,
   before/after measurements, audible comparison, explicit acceptance, and a
   reversible output lineage. Capture never overwrites the original.

## Remaining acceptance

1. Operate browser preflight and a retained source with the physical Shure MV7i,
   verifying the exact input and headphone route and comparing the capture-time
   summary to the complete-decode receipt.
2. Operate an iPhone speech take and verify live average/peak readback, route
   change behavior, final source playback, and post-capture signal evidence.
3. Add a deliberately explicit short confidence recording with immediate local
   playback; it must require a visible action and delete only that acknowledged
   disposable diagnostic after review.
4. Add calibrated channel mapping, device clock/drift visibility, and BS.1770
   true-peak plus integrated-loudness analysis to the verified post-capture
   pipeline—not to the lightweight real-time meter. Validate the implementation
   against the EBU loudness test set before calling it authoritative.
