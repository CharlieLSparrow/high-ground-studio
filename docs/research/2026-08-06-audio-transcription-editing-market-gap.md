# Audio, transcription, and automated-editing market-gap research

Date: 2026-08-06
Status: first primary-source pass; Quipsly capability audit complete; corpus-backed product qualification open

## Executive finding

Quipsly is not starting from a weak audio prototype. It already has unusually
strong source identity, complete-decode evidence, standards-conformant
loudness measurement, a high-resolution spectral pyramid, shared playback
clock, transcript correction overlays, speaker review, versioned mastering
previews, and source-bound automated-edit proposals.

The market gap is now mainly **product compression and qualified treatment**:

- competing tools make a few valuable actions obvious, but often hide what
  changed or flatten uncertainty;
- Quipsly preserves much richer evidence, but that evidence still feels like
  several expert desks rather than one calm path from sound check to finished
  episode; and
- Quipsly measures many problems better than it can yet propose, audition, and
  safely apply repairs for them.

The most valuable near-term leap is therefore an **Audio Flight Deck**: one
source-bound workspace that explains live capture risk, post-capture health,
transcript risk, proposed repairs, loudness-matched A/B playback, and delivery
readiness without inventing a single opaque “quality score.”

## Primary-source patterns

| Product or standard | Strong pattern | Limitation or opening for Quipsly |
| --- | --- | --- |
| Riverside | Locally recorded high-quality participant tracks, aligned raw tracks, a separate cloud reference recording, and visible per-participant upload progress. | Upload and track status are understandable; Quipsly can exceed this by joining them to exact decode, signal, sync, consent, transcript, and editor evidence. |
| Descript | File-level voice enhancement with adjustable intensity; transcript editing; speaker detection followed by human naming; glossary support; filler-word review with an “avoid harsh cuts” analysis. | Several actions are easy but remain separate tools. Quipsly can make every proposal source-bound, region-previewable, reversible, and measurable. |
| Adobe Audition | Scan-first diagnostics return exact clicks, distortion, or silence regions that a user may repair, delete, mark, or inspect. Mic Check recommends placement, gain, noise, and echo adjustments. | The scan/listen/repair mental model is excellent. Quipsly can connect it to capture, transcript, episode, coaching, and collaboration state. |
| iZotope RX | Deep specialist repair vocabulary: mouth de-click, de-plosive, de-hum, de-clip, breath control, dialogue isolation, spectral repair, and a repair assistant. | It is powerful but separate from recording, transcript, projects, and publication. Quipsly should learn from the treatment depth without cloning a DAW. |
| Auphonic | Speech-aware leveling, loudness normalization, noise/filtering, and multitrack gating, crosstalk removal, ducking, and mixdown. | The automated outcome is valuable; Quipsly can add clearer before/after evidence, per-node authority, and retained review. |
| Apple and EBU | Integrated loudness, loudness range, short-term/momentary views, and true peak are standards-bound facts rather than stylistic judgments. | Quipsly already follows this boundary and should make it the delivery spine for every treatment chain. |
| Deepgram and AssemblyAI | Word confidence, keyterm prompting, diarization, expected-speaker hints, and explicit unknown/short-turn behavior provide useful review signals. | Provider output is not measured accuracy. Quipsly is right to keep provider confidence, playback review, and WER separate and should evaluate provider/version combinations on its own corpus. |
| Premiere and Resolve | Text edits map to timecode; separate sources sync by waveform or timecode; multicam switching remains editable; filler-word and speaker operations can create rough cuts. | Quipsly can combine these mechanics with its immutable-source and proposal ledgers so automation is explainable and recoverable. |
| Riverside Magic Episodes | A complete first cut combines layout, pauses/silences, mute decisions, and captions. | The outcome is approachable, but Quipsly should expose the proposal set and let the creator accept at the episode, category, or exact-range level. |

Primary references:

- <https://support.riverside.fm/hc/en-us/articles/5260131045917-Video-and-audio-file-formats-Overview>
- <https://support.riverside.fm/hc/en-us/articles/5287442440093-Confirm-that-participants-tracks-are-uploading>
- <https://help.descript.com/hc/en-us/articles/10327603613837-Studio-Sound>
- <https://help.descript.com/hc/en-us/articles/10164806394509-Remove-filler-words>
- <https://help.descript.com/hc/en-us/articles/10249424286477-Automatic-transcription>
- <https://helpx.adobe.com/audition/desktop/effects-reference/diagnostics-effects-waveform-editor-only.html>
- <https://www.izotope.com/en/products/rx/features>
- <https://us.auphonic.com/help/algorithms/index.html>
- <https://podcasters.apple.com/support/893-audio-requirements>
- <https://support.apple.com/en-ie/guide/logicpro/lgce12d9d256/mac>
- <https://developers.deepgram.com/docs/confidence>
- <https://developers.deepgram.com/docs/keyterm>
- <https://www.assemblyai.com/docs/pre-recorded-audio/label-speakers>
- <https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/overview-of-text-based-editing.html>
- <https://www.blackmagicdesign.com/products/davinciresolve/media>
- <https://support.riverside.fm/hc/en-us/articles/13989516349213-About-Magic-Episodes>

## Quipsly capability audit

### Strong and real today

- immutable source bytes, generations, hashes, and recovery history;
- separate capture-time, configured-format, decoded-media, and cloud evidence;
- complete-decode waveform, frequency, signal, and silence observations;
- LUFS, true peak, loudness range, momentary and short-term measurements;
- independently remeasured, versioned loudness-only mastery previews;
- loudness-matched source/preview listening and explicit promotion receipts;
- whole-source, minute, and ten-second spectral views on the shared clock;
- provider metadata, timed-word coverage, confidence triage, corrections,
  confirmed-as-is coverage, sampled/full WER scope, and speaker overlays;
- exact-time listening candidates and source-bound edit proposal sets; and
- coaching and episode projections over shared evidence without making a
  coaching source pretend to be an Episode.

### Partial or fragmented

- live sound check observes level and route, but does not yet present a
  consolidated mic-distance/gain/noise/echo coaching loop;
- signal, spectral, mastery, transcript, and edit evidence share a clock, but
  creators still traverse multiple conceptual desks;
- treatment experiments are much narrower than the diagnosis vocabulary;
- audible-event suggestions have a rigorous review/evaluation ledger, but the
  labeled corpus is not yet broad enough to qualify production defaults;
- transcript vocabulary exists canonically, but automatic provider prompting
  and correction-learning need an explicit, reviewable projection;
- automated edits are evidence-bound, but the proposal vocabulary and complete
  first-cut experience remain deliberately small; and
- multi-source sync has clock and alignment evidence, but the calm “these are
  the takes, this is their health, this is the assembled edit” overview is not
  yet as immediate as Riverside's track list.

### Material gaps

- evaluated dialogue treatment for mouth clicks, breaths, plosives, sibilance,
  hum, broadband noise, room echo, rustle, bleed, and speaker-level mismatch;
- region-level before/after difference views and batch review;
- stem-aware leveler, gating, crosstalk removal, and speech/music ducking;
- a measured vocabulary-prompting experiment across podcast and coaching
  terminology;
- cross-provider transcript comparison on identical immutable source bytes;
- transcription correction suggestions that show alternatives and source
  context rather than only a low-confidence flag;
- a complete, explainable first-cut proposal that spans transcript, pauses,
  retakes, camera choice, shared clips, and captions; and
- delivery-readiness projection that names blockers across source, treatment,
  edit, approval, encoding, and publishing without flattening them into one
  deceptive grade.

## Recommended product architecture

### 1. Audio Flight Deck

One workspace, usable in Episode and coaching contexts, with five progressive
layers:

1. **Capture check** — route, channel, processing, headroom, noise/echo hints,
   and a short monitored test bound to the selected device.
2. **Source health** — upload, exact bytes, complete decode, duration, sync,
   signal, spectrum, loudness, and transcript coverage per participant/source.
3. **Attention queue** — exact-time issues grouped by audible class and risk,
   with the protected source context one action away.
4. **Treatment lab** — versioned proposed nodes, parameter disclosure,
   loudness-matched A/B, difference evidence, and accept/reject by range or
   recipe.
5. **Delivery readiness** — explicit source, edit, mix, loudness, encode, proof,
   rights, and publication gates.

The overview may say `Ready`, `Review`, `Blocked`, or `Unknown` for each gate.
It must not emit one universal audio score.

### 2. Treatment graph, not an effect stack mutation

Every proposed treatment node binds:

- exact source generation and SHA-256;
- detector/evaluator configuration and evidence ranges;
- parameterized processor version;
- output bytes and independent complete-decode measurement;
- changed-region and whole-source loudness-matched preview;
- review decision and supersession chain; and
- whether the node is audition-only, selected for the working mix, or promoted
  for delivery.

The first qualified nodes should be conservative and independently measurable:
DC/rumble, narrow hum, de-click/mouth-click, de-plosive, breath gain, and
speaker-level consistency. Dialogue isolation and generative restoration come
later because artifacts are harder to bound and evaluate.

### 3. Transcript Intelligence Lab

Build one corpus runner that submits identical immutable sources to the allowed
provider/model/configuration combinations. It records cost, latency,
timed-word coverage, diarization coverage, vocabulary configuration, and exact
provider output. Playback-backed references score WER, entity error, speaker
error, timing error, and correction burden by microphone and environment.

Canonical Quipsly people, episode manuscript terms, project vocabulary, and
reviewed corrections may generate a bounded provider keyterm proposal. A human
can inspect the exact terms before a request. Later accepted corrections may
suggest vocabulary changes but cannot silently mutate canonical vocabulary.

### 4. Explainable first cut

Generate a proposal set with independently toggleable categories:

- false starts and retakes;
- filler words with harsh-cut safety;
- long-gap shortening rather than mandatory deletion;
- transcript-backed chapter and highlight candidates;
- active-speaker and evidence-backed camera switches;
- shared-clip spans and reaction holds;
- captions and layout proposals; and
- audio treatment/mix candidates.

The creator can preview the full proposal, disable a category, inspect every
range, apply it to a reversible draft, and later save deliberately to the
canonical timeline. No generator writes directly to the source or silently
replaces the canonical edit.

## Ranked implementation experiments

1. **Sound Check Coach** — evaluate mic distance, gain/headroom, noise floor,
   echo/reverb, route, and channel configuration over a 10–15 second test;
   recommend physical changes before processing.
2. **Cross-source health matrix** — collapse existing upload/decode/sync/audio/
   transcript truth into one participant/source overview.
3. **Mouth-click and plosive corpus** — label real HGO and consented coaching
   ranges, compare deterministic and model detectors, and qualify precision,
   recall, false positives/hour, and boundary error.
4. **Region treatment audition** — produce immutable de-click/de-plosive
   derivatives and loudness-matched A/B for exact ranges without promotion.
5. **Vocabulary prompt evaluation** — compare baseline and bounded keyterm
   provider runs on names, Quipsly terms, episode sources, and coaching terms.
6. **Harsh-cut validator** — score filler/pause proposals against neighboring
   phonemes, room tone, video continuity, and cross-source sync.
7. **First-cut review cockpit** — one proposal set spanning transcript cleanup,
   pauses, camera decisions, shared clips, and captions.

## Acceptance principles

- Real podcast and coaching work is the evaluation corpus; synthetic fixtures
  prove contracts but cannot qualify subjective quality.
- Detection, treatment, selection, promotion, export, and publication remain
  distinct decisions.
- No treatment is “better” merely because it is louder.
- Unknown remains unknown; missing evidence is not green.
- Every candidate seeks to its source-clock context.
- Every output preserves the source and is independently decoded and measured.
- Provider confidence is never labeled accuracy.
- A production default requires measured corpus performance and a rollback.
