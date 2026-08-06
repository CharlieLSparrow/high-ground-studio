# Quipsly cross-track audio intelligence

Date: 2026-08-06  
Status: architecture decision and implementation blueprint  
Scope: podcasts, coaching sessions, interviews, browser/iPhone multi-device capture, and dialogue-first video

## Product thesis

Quipsly should not begin by promising a magic final mix. It should first make the entire dialogue program understandable.

The differentiating surface is an evidence-first **Program Sound Map** that answers, on one clock:

- Which retained source is the reviewed program clock?
- Which person and production role does each track represent?
- Where is measured energy present on each track?
- Where do multiple people appear active, where do multiple devices for one person agree, and where is expected dialogue missing?
- Which findings are measurements, detector suggestions, human-reviewed facts, mix proposals, auditioned previews, or approved output?
- What would an automatic mix change, and can the editor hear the exact before/after region before accepting it?

That sequence is the durable product boundary:

`retained source -> measured evidence -> detector suggestion -> human review -> mix proposal -> rendered preview -> approval -> delivery artifact`

No earlier stage silently becomes a later one.

## What mature products establish

### Auphonic

Auphonic's multitrack system establishes the baseline feature family: analyze tracks both individually and together, then support adaptive leveling, gating, crosstalk removal, denoise, ducking, filtering, loudness normalization, and true-peak limiting. Its documentation explicitly uses cross-track knowledge to determine active speakers, avoid amplifying background segments, and remove correlated mic bleed. Its editor plots each input under the output, colors speech/music and processing regions, and shows which speaker is active.

Implication for Quipsly: cross-track processing without cross-track visibility is incomplete. The analysis result must be inspectable before it becomes automation.

Sources:

- https://us1.auphonic.com/help/algorithms/multitrack.html
- https://auphonic.com/help/web/auphoniceditor.html
- https://auphonic.com/help/api/multitrack.html

### DaVinci Resolve / Fairlight

Resolve 20's Audio Assistant establishes a second baseline: organize and color-code tracks, level dialogue, adjust mixer faders, optionally apply voice isolation and de-essing, duck music, write automation, and target a delivery standard. Crucially, the result can be played, adjusted, or completely undone, and users can correct a wrong track category.

Implication for Quipsly: automatic mixing should create a reviewable, versioned automation plan and preview. Track classification must remain explicitly correctable.

Source:

- https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_20_New_Features_Guide.pdf (Fairlight, pp. 96-97)

### EBU loudness practice

EBU R 128 distinguishes momentary (400 ms), short-term (3 s), and integrated loudness, and pairs target normalization with loudness range and true-peak guidance. Those measurements are delivery evidence, not a substitute for voice quality or editorial judgment.

Implication for Quipsly: keep source-clock activity windows, short-term dialogue comfort, integrated program loudness, loudness range, and delivery true peak as different measurements in the UI and data model.

Sources:

- https://tech.ebu.ch/loudness
- https://tech.ebu.ch/docs/r/r128.pdf
- https://tech.ebu.ch/docs/tech/tech3341.pdf
- https://tech.ebu.ch/docs/tech/tech3342.pdf

### WebRTC audio processing

WebRTC's audio-processing interfaces distinguish echo analysis from voice activity detection. Its echo detector consumes render and capture audio and reports echo-likelihood metrics; VAD determines whether voice is present and exposes the sensitivity tradeoff between clipping speech and labeling noise as voice.

Implication for Quipsly: energy, VAD, speaker attribution, echo likelihood, and correlated mic bleed are separate evidence classes. A waveform-energy threshold must never be labeled “speaker detected.”

Source:

- https://webrtc.googlesource.com/src/+/main/modules/audio_processing/include/audio_processing.h

### Silero VAD

Silero's official VAD project is a strong candidate for Quipsly's first explicit speech-activity detector. Its current v6 model family publishes ONNX and JIT variants, supports 8 kHz and 16 kHz input, is designed for streaming as well as whole-file use, and is distributed under the MIT license. The project also publishes its model history, inference utilities, and operational FAQ rather than exposing only a hosted black box.

Implication for Quipsly: prefer a pinned ONNX model artifact and a worker-owned deterministic framing contract. Retain the model SHA-256, upstream model version, runtime version, sample-rate conversion policy, frame/window policy, sensitivity thresholds, source identity, and complete-decode proof in every receipt. Do not infer correctness from the library name or overwrite a VAD receipt when thresholds change.

Sources:

- https://github.com/snakers4/silero-vad
- https://github.com/snakers4/silero-vad/wiki/Version-history-and-Available-Models
- https://github.com/snakers4/silero-vad/wiki/FAQ
- https://github.com/snakers4/silero-vad/blob/master/src/silero_vad/utils_vad.py

## Product architecture

### 1. Canonical program truth

Already implemented in the Mix Map decision ledger:

- participant assignment;
- production role;
- program clock;
- mix disposition;
- append-only withdrawal with reason;
- source hash/generation binding;
- episode source-set fingerprint binding.

This is human-owned truth. It is not recomputed by an analyzer.

### 2. Per-source measurement receipts

Every exact retained source can carry immutable analysis receipts:

- complete-decode RMS and sample-peak windows;
- broad frequency energy;
- clipping, possible dropout, silence, and stereo-balance observations;
- timed transcript words and review receipts;
- integrated/short-term/momentary loudness and true peak;
- source hash, generation, analyzer build, and algorithm version.

The source bytes remain immutable.

### 3. Reviewed alignment truth

Cross-track evidence is meaningful only on a shared clock. A track is eligible when it is:

- the reviewed program clock; or
- bound to that clock by qualified alignment evidence and, for timeline-changing use, a reviewed alignment receipt.

Unaligned tracks remain visible in coverage, but their activity must not be plotted as if synchronized.

### 4. Episode analysis receipts

Derived cross-track analysis should be keyed by:

- episode production ID;
- program fingerprint;
- active decision receipt IDs;
- exact source hashes/generations;
- alignment evidence/review IDs;
- per-source signal-profile job IDs;
- analyzer version and thresholds.

It produces suggestions, never edit or mix authorization.

### 5. Review receipts

Every proposed conflict supports append-only human states:

- confirmed overlap;
- intentional overlap;
- mic bleed;
- expected multi-device redundancy;
- false positive;
- needs comparison;
- fixed in a later mix proposal.

Review binds to the exact evidence receipt and source-clock range.

### 6. Mix-plan and preview receipts

Automation should produce editable envelopes and operations rather than destructive edits:

- per-track gain envelope;
- gate/expander envelope;
- crossgate/bleed attenuation proposal;
- music ducking envelope;
- EQ/de-ess/voice-isolation proposal with bounded strength;
- edit-list proposals for silence, fillers, breaths, coughs, and pauses;
- target delivery profile.

Each proposal renders a new preview derivative. A/B/X listening and an approval receipt are required before promotion.

## UX: Program Sound Map

The map should have four coordinated layers:

1. **Coverage:** source identity, role, participant, release, alignment, signal profile, transcript, and delivery readiness.
2. **Activity lanes:** one aligned lane per source, with measured-energy windows. This first version says “energy active,” never “speaker active.”
3. **Attention lane:** possible multi-person overlap, same-person multi-device redundancy, unassigned active energy, dialogue gaps, clipping/dropouts, and capture boundaries.
4. **Automation lane:** proposed gain, attenuation, ducking, repair, and cuts—hidden until a proposal exists and visually distinct from evidence.

Desktop behavior:

- click a lane region to select the exact retained source and source time;
- solo, compare, or hear all relevant tracks at matched program time;
- filter by evidence, reviewed truth, proposals, or approved changes;
- inspect the calculation and source lineage in a side panel.

iPhone behavior:

- horizontal program scrub with vertically stacked compact lanes;
- tap an attention card to hear a bounded loop;
- swipe between relevant sources at the same program time;
- confirm/decline suggestions without exposing full mixing complexity.

Accessibility:

- color is never the only carrier;
- every lane exposes a textual summary and keyboard-navigable attention queue;
- program and source time are announced together;
- zoom and range presets do not require precision dragging;
- animations respect reduced motion.

## Detection ladder

### Version 1: measured-energy topology

Use existing complete-decode RMS windows. Derive a per-track relative activity threshold from that track's measured distribution. Plot only tracks with a program-clock mapping. Surface:

- concurrent energy from multiple assigned participants (possible overlap; listen);
- concurrent energy from multiple sources assigned to one participant (expected redundancy or possible bleed; compare);
- energy on unassigned sources (identity needed);
- no included-dialogue energy (possible gap; listen);
- missing/failed measurement and alignment coverage.

This version does not claim VAD, diarization, bleed, echo, or audibility.

### Version 2: speech activity and transcript agreement

The first sub-layer uses already-retained provider word timing and exact-source RMS windows. It displays word-presence ticks over measured energy and counts energy-only and word-only cells. This is useful for finding likely noise/music/breath regions, quiet recognized speech, timing drift, or recognition gaps, but it is explicitly **not VAD and not measured transcription accuracy**.

The second sub-layer adds a separate, versioned Silero VAD receipt. Pin the ONNX model by version and SHA-256, use a worker-owned 16 kHz mono conversion/framing contract, preserve threshold and silence-padding parameters, and compare VAD with timed transcript coverage. Threshold changes create new immutable receipts. Surface disagreements as bounded review candidates; never silently convert them to transcript corrections or cuts.

The two sub-layers stay separate in storage and UI:

- measured energy answers whether signal power crossed a source-relative threshold;
- provider word timing answers where a transcription provider placed recognized words;
- VAD answers where a particular pinned detector classified speech under recorded parameters;
- playback review answers what a human heard in the bound source-clock range.

### Version 3: correlated bleed and echo evidence

Analyze aligned PCM windows for lagged correlation and spectral similarity across tracks. The first production contract follows WebRTC's useful separation of concerns: it compares 10 ms power envelopes across a bounded delay search, reports peak correlation, delay, prominence, level difference, waveform correlation at the best delay, and evidence reliability, but does not name the cause.

Each analysis is deliberately bounded to a reviewed 0.5–30 second program-clock range. Both sources retain their exact hash, generation, size, role, participant assignment, source range, and alignment evidence; the active canonical decision receipt IDs and episode program fingerprint are part of the job and result. Positive delay means the observation follows the reference. Thresholds and algorithms are fixed in the v1 contract, and the result proves complete decode of the requested ranges plus before/after source identity checks.

The review surface can then help a human distinguish:

- same participant, multiple devices;
- different participant mics in one room;
- render-to-capture echo;
- duplicated/imported audio;
- actual conversational overlap.

Never attenuate based on correlation alone; create a bounded comparison and proposal.

Correlation is especially vulnerable to false interpretation: two tracks can share timing or power modulation without one causing the other, and room reflections can reduce waveform similarity even when one source bleeds into another. Quipsly therefore preserves both power-envelope and waveform correlation, exposes the lag and level difference, and requires matched protected playback before a human classification receipt. The classification—not the measurement—may use production role context such as reference playback versus microphone capture.

### Version 4: reversible automatic mix

Generate gain/gate/crossgate/ducking envelopes, render a candidate, compute delivery measurements, and require region-based A/B review before promotion.

## Near-term implementation order

1. Ship the measured-energy Program Sound Map using existing source-bound profile receipts and explicit program-clock decisions.
2. Add episode-level analysis/review receipts keyed to the canonical program fingerprint.
3. Add matched multi-source playback at program time.
4. Add VAD and transcript-agreement analysis.
5. Add PCM correlation/echo analysis and a listen-first bleed review desk.
6. Add a reversible gain/gate/ducking plan and preview render.
7. Add dialogue mastering profiles and delivery proof across podcast, coaching, YouTube, and shorts targets.

## Acceptance criteria for the first map

- It does not plot an unaligned source on the shared clock.
- It never labels RMS energy as speech or a speaker identity.
- All input signal profiles validate their source-bound receipt.
- The program clock comes only from an active canonical decision.
- Thresholds and analyzer resolution are visible.
- Every attention region is reachable by keyboard and can select the corresponding source.
- Missing evidence is prominent and actionable.
- Source bytes, timeline placements, and mix automation remain unchanged.
- A real browser+iPhone retained QA episode can be inspected and its limitations are honest.
