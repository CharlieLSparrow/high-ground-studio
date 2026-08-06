# Audible-event map research and production architecture

Date: 2026-08-05

Status: web evidence/review foundation operated locally; detector qualification
and physical-device operation pending

## Executive decision

Quipsly should treat sound classification as one evidence producer, not as the
audible-event product. The product is a source-clock review system that can
combine:

- deterministic complete-decode signal observations;
- exact capture and route boundaries;
- human source-clock marks;
- versioned built-in or custom-model suggestions;
- transcript and speaker context;
- append-only listening decisions; and
- separately authorized repair, edit, note, or highlight operations.

That distinction lets Quipsly search laughter, applause, pauses, mouth events,
environmental disruptions, clipping risk, and capture failures without calling
a classifier score truth or silently treating a useful content moment as a
defect.

## Current official capability findings

Apple provides two production-relevant analysis paths:

1. `SNAudioFileAnalyzer` analyzes a retained audio file and emits results for
   active requests. This is the preferred deterministic on-device lane after a
   local take is safely finalized.
2. `SNAudioStreamAnalyzer` accepts PCM buffers from a live audio stream. Apple
   recommends running analysis on a dedicated queue, and the analyzer must be
   recreated if the input format changes. This makes live hints feasible, but
   they must never interfere with the recorder or survive a route change under
   a stale format assumption.

`SNClassifySoundRequest` can use Apple's built-in classifier or a custom Core ML
model. It exposes known classifications, supported window durations, an exact
window duration, and overlap. Smaller windows improve temporal resolution but
can reduce classification context; more overlap increases inference work.
Those settings must be part of detector identity and evaluation receipts.

Create ML's sound-classifier guidance explicitly calls for a negative class.
For Quipsly, negatives must include ordinary speech, breaths that should remain,
chair movement, keyboard sounds, laughter that is editorially valuable, music,
room tone, and device-specific noise. A mouth-event model trained only on
positive examples would create an unusable attention queue.

Official sources:

- [Classifying sounds in an audio file](https://developer.apple.com/documentation/soundanalysis/classifying-sounds-in-an-audio-file)
- [Classifying sounds in an audio stream](https://developer.apple.com/documentation/soundanalysis/classifying-sounds-in-an-audio-stream)
- [`SNAudioFileAnalyzer`](https://developer.apple.com/documentation/soundanalysis/snaudiofileanalyzer)
- [`SNClassifySoundRequest`](https://developer.apple.com/documentation/soundanalysis/snclassifysoundrequest)
- [`windowDuration`](https://developer.apple.com/documentation/soundanalysis/snclassifysoundrequest/windowduration)
- [`MLSoundClassifier`](https://developer.apple.com/documentation/createml/mlsoundclassifier)

## Evidence taxonomy

One event may have several interpretations. The canonical map therefore keeps
family, label, origin, and review consequence separate.

| Family | Initial examples | Default consequence |
| --- | --- | --- |
| Signal | near silence, near full scale, invalid samples, channel imbalance | listening attention only |
| Dialogue | mouth click, plosive, sibilance, breath, clipping candidate | listening candidate; confirmed mouth click may authorize a separate experiment |
| Content | laughter, applause, emphasis, music, reaction | navigation/highlight candidate, never repair by default |
| Environment | dog bark, siren, door, keyboard, chair, impact | listening candidate; context decides whether it is disruption or texture |
| Capture | route change, interruption, mute, clock discontinuity | operational/recovery evidence |

Review state is orthogonal:

- measured but needs listening;
- unreviewed candidate;
- confirmed audible event;
- false positive; or
- needs comparison.

A confirmed sound is still not automatically a defect. Treatment, removal,
highlighting, task creation, or publication each remain their own explicit,
reversible operation.

## Shared production flow

```text
immutable retained source
  -> complete-decode signal and capture evidence
  -> versioned detector attempt over exact source bytes
  -> bounded source-clock suggestions
  -> audible-event projection
  -> protected-context listening receipt
  -> optional separately authorized experiment or editorial operation
```

Detector identity must include model identifier and digest, runtime/framework
version, supported/selected window duration, overlap, input format, label set,
threshold policy, source SHA-256, and attempt identity. A suggestion must retain
its raw label and score even when Quipsly maps it to a friendlier family.

The projection remains disposable. Immutable sources, analysis receipts,
dialogue candidates, and review receipts stay authoritative. This prevents a
new event-map table from disagreeing with Dialogue Repair or signal evidence.

## UX requirements

The map must answer five questions immediately:

1. Where did something happen on the exact source clock?
2. Was it measured, human-marked, or model-suggested?
3. Has anyone listened, and what did they decide?
4. What context will play before and after the event?
5. What separate action—if any—has been authorized?

Whole-source, sixty-second, and fifteen-second views are required. Family and
review-state filters must preserve false positives rather than hiding them.
Previous/next navigation must audition bounded protected context, not play the
remainder of the source. Color and stroke state cannot be the only accessible
signal; the review queue and SVG descriptions carry equivalent text.

## Qualification program

Built-in labels should first be measured against a retained High Ground Odyssey
and coaching corpus. A custom model is justified only where the built-in model
cannot meet a useful listening-triage threshold.

For every label and setup, retain:

- event-level precision, recall, and F1 at one or more temporal tolerances;
- false positives per recorded hour;
- median and tail boundary error;
- confusion by speaker, microphone, room, gain, and processing history;
- battery, thermal, memory, and real-time factor on supported iPhones;
- user time saved or added during review; and
- the review decisions that become new positive and negative corpus examples.

The first useful gate is not maximum recall. It is an attention queue that
reduces total proof-listening effort without causing reviewers to distrust the
map. Mouth-event repair requires a substantially stricter per-label gate than
laughter or applause navigation.

## 2026-08-05 implementation and operation checkpoint

- Audio Studio and the episode editor now pass the exact complete-decode signal
  evidence into Dialogue Repair's new audible-event map.
- The map projects measured signal observations and append-only dialogue
  candidates onto one source clock. It exposes whole/minute/detail zoom,
  family/review filters, previous/next navigation, origin, detector score,
  review state, waveform availability, and a textual review queue.
- Human marks, unqualified suggestions, qualified detectors, confirmed events,
  false positives, and measured-needs-listening observations remain visibly
  distinct. The existing candidate and review records remain authoritative.
- A signed-in local Audio Studio operation used
  `quipsly-audio-treatment-ui-acceptance.wav`, created a deliberate noise-event
  marker at 1.500–1.550 seconds, navigated from the map, and exposed a UX defect
  where playback continued beyond the event. The implementation was corrected
  to audition bounded pre-roll/event/post-roll context. The operated playback
  stopped at about 3.07 seconds, enabled the complete-context review controls,
  saved a false-positive receipt with an explicit test note, and correctly
  projected `1 mapped / 0 needs listening / 1 false positive` through the map
  and filter.
- Capture now performs an Apple `SNAudioFileAnalyzer` pass with
  `SNClassifierIdentifierVersion1` while its deterministic complete PCM scan is
  in flight. The native versioned receipt preserves analysis/supersession ID,
  source SHA-256, duration and byte count, requested/effective 1.5-second
  window, 50% overlap, the hash and count of known labels, raw result-window
  count, bounded merged suggestions, score, and explicit review-only
  boundaries. Nest rejects a completed receipt whose source hash or byte count
  disagrees with the canonical upload manifest. A classifier failure is
  retained but cannot fail source integrity, playback, or upload.
- The first label policy deliberately excludes ordinary `speech` and `silence`
  to avoid flooding the proof queue. It maps selected dialogue, content,
  environment, and capture labels into unqualified source-clock suggestions.
  Apple's general classifier does not claim Quipsly mouth-click, plosive, or
  sibilance repair detection.
- Nest has a fail-closed TypeScript receipt parser. Capture-linked sources in
  Audio Studio and the episode editor project valid receipts into the shared
  event map. Native and browser event buttons audition bounded context.
- A read-only macOS operation analyzed a 0.400-second beep fixture in about
  0.087 seconds: the framework completed with zero windows because the source
  was shorter than the configured window. A 2.508-second speech fixture
  completed in about 0.088 seconds with two classifier windows and zero Quipsly
  suggestions, as intended because ordinary speech is excluded. Both receipts
  carry the exact read-only source SHA-256. These are API wiring checks, not
  corpus accuracy or iPhone performance evidence.
- The native reducer harness, four focused Nest suites (14 tests), the full
  generic iOS Simulator application build, and the operated Source Evidence UI
  test pass. The UI test opens Library, enters the read-only evidence surface,
  verifies the detector suggestion and no-receipt preview boundary, and passes
  the app's hit-region, description, and text-clipping accessibility audit.
  Physical-iPhone real-time,
  energy, thermal, memory, long-take finalization latency, false-positive, and
  retained-corpus qualification remain required before the detector is called
  qualified. Stream analysis is still a later lane and must not compete with
  realtime capture safety.
