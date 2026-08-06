# Quipsly feature-depth research program

Date: 2026-08-05

Status: current-market validation and implementation program

Companion: `2026-08-05-quipsly-product-expansion-opportunity-audit.md`

## 2026-08-06 implementation checkpoint

The first reusable Audio Studio qualification loop now exists across Capture
and Nest: a real Apple classifier produces an immutable source-bound suggestion
receipt; the Audible Event Map opens bounded protected playback; and Nest
stores confirmed, false-positive, or needs-comparison decisions in a separate
append-only ledger. A review cannot create a repair candidate or authorize an
edit. The retained eight-second beep source proved native analysis, canonical
episode attachment, authenticated web projection, and complete-context UI
playback. A human audibility decision was deliberately not fabricated during
agent operation.

This advances Epic 2 from visualization toward corpus-building, but it does not
qualify the detector. The next research wave should label independent positive
and negative windows from real High Ground Odyssey and coaching material, then
compare Apple and candidate custom detectors by per-label precision, recall,
false positives per hour, boundary error, runtime, battery, thermal behavior,
and reviewer effort. Physical-iPhone long-take operation remains the release
gate.

### Independent detector truth checkpoint

Audio Studio now goes beyond confirmation of surfaced suggestions. A reviewer
can label an arbitrary protected-source window as containing one exact class or
as explicitly absent for that class, including a detector miss that never
appeared in the review queue. The label is source/configuration bound,
append-only, correctable by supersession, workload-aware, and isolated into
calibration, validation, and retained-challenge splits. Only complete protected
playback enables persistence.

The resulting project scorecard measures per-class precision, recall, F1,
false positives per labeled hour, boundary error, and podcast/coaching source
coverage while excluding unlabeled time and calibration evidence from
qualification. The first retained HGO beep source was opened in the real
authenticated Audio Studio and its complete eight-second label window passed
the playback gate. No listening verdict was saved by the agent. The next human
operation can create the first genuine positive or absent receipt without a
schema or UI retrofit.

## Executive decision

Quipsly should not measure progress by how many categories appear in the
navigation. It should measure whether a person can complete a consequential
workflow without changing tools, losing source truth, or wondering what became
real.

The current market review reinforces three product wedges:

1. **Session certainty** — the easiest place to prepare, talk, preserve local
   masters, watch material together, recover uploads, and land in useful work.
2. **Speech intelligence with professional evidence** — transcript, waveform,
   signal, repair, mix, edit, and delivery on one source clock, with much more
   transparency than creator-first competitors.
3. **Evidence to follow-through** — accepted moments become cited notes,
   decisions, tasks, goals, calendar commitments, writing, and publishable
   outputs without duplicate records.

Large additions remain welcome, but each should deepen those systems or reuse
their primitives. A course builder, social suite, storyboard, or research graph
becomes dramatically more valuable after it can consume reviewed sources,
stable structure, canonical actions, and versioned outputs.

## The feature-depth ladder

A feature is not mature merely because its route and happy path exist. Quipsly
will use this ladder for architecture, UX review, and release claims.

| Level | Question the product must answer |
| --- | --- |
| 1. Exists | Is there one canonical object or operation instead of a mock panel? |
| 2. Reachable | Can a new user find and understand it from the workflow they are in? |
| 3. Operable | Can the real task complete against real devices, media, people, and providers? |
| 4. Observable | Can the user see readiness, progress, evidence, cost, and what changed? |
| 5. Recoverable | Do interruption, retry, conflict, undo, supersession, and partial success work? |
| 6. Collaborative | Are authority, privacy, presence, comments, assignment, and handoff explicit? |
| 7. Assisted | Can automation propose or perform bounded work with previews and receipts? |
| 8. Extensible | Can providers, views, formats, policies, and workflows evolve without duplicating truth? |

This ladder avoids two recurring errors: mistaking scaffolding for product, and
mistaking more approval prompts for safety. Good safety is observable authority,
consequence, provenance, and rollback at the moment they matter.

## What current professional products teach us

### Recording products sell certainty, not just bitrate

Riverside's producer role can monitor and control a Session without becoming a
normal recorded participant; producer-shared media is still captured as its
own track. Its lobby asks for headphones and exact mic, camera, and output
selection. That makes readiness and role topology part of recording, not a
settings afterthought.

Quipsly should go further by making one person with several devices explicit:
browser conversation, iPhone 4K camera, local audio master, Shared Watch source,
and backup recorder. A participant tile should never collapse those endpoints
into one misleading `connected` state.

Sources:

- [Riverside producer role](https://support.riverside.fm/hc/en-us/articles/5252621451805-The-producer-role-Details)
- [Riverside producer lobby and device flow](https://support.riverside.fm/hc/en-us/articles/12999448781469-Join-studio-as-a-producer)
- [LiveKit participant and track egress](https://docs.livekit.io/transport/media/ingress-egress/egress/participant/)

### Text editing must preserve different meanings

Descript separates transcript correction from media removal and offers several
filler-word consequences: delete media, preserve a timing gap, retain a visible
ignored word, or remove text only. Its `Avoid harsh cuts` check is important
because a correct word boundary can still be a bad audible edit. Premiere also
keeps transcript timecode synchronized with the sequence and expects final cut
refinement on the timeline.

Quipsly's transcript editor therefore needs explicit verbs:

- correct what was said;
- change speaker or word timing;
- hide text while retaining media;
- deactivate the source range but preserve its duration;
- ripple-close the range;
- accept or reject a proposed pacing edit; and
- restore or supersede any edit operation.

Sources:

- [Descript edit like a doc](https://help.descript.com/hc/en-us/articles/15726742913933-Edit-like-a-doc)
- [Descript transcript correction](https://help.descript.com/hc/en-us/articles/10119613609229-Correct-your-transcript)
- [Descript filler-word review](https://help.descript.com/hc/en-us/articles/10164806394509-Remove-filler-words)
- [Adobe Premiere Text-Based Editing](https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/overview-of-text-based-editing.html)

### Professional audio depth is a family of decisions

Auphonic's multitrack system reasons across separate tracks for leveling,
gating, bleed removal, noise/reverb reduction, ducking, filtering, loudness,
and true peak. RX exposes separate repair families for clicks, mouth noise,
clipping, hum, plosives, rustle, wind, reverb, bleed, and spectral damage.

The implication is architectural: Quipsly needs a shared evidence and review
system for many detectors and treatments, not a growing set of unrelated
`Enhance` buttons. Each family needs candidate ranges, confidence/evidence,
listening context, conservative and stronger variants, impact measurement,
accept/reject reasons, and independent delivery QC.

Sources:

- [Auphonic multitrack algorithms](https://us1.auphonic.com/help/algorithms/multitrack.html)
- [Auphonic multitrack workflow and controls](https://us1.auphonic.com/help/web/multitrack.html)
- [iZotope RX feature families](https://www.izotope.com/en/products/rx/features)

### Automated video editing should create editable proposals

Riverside Smart Layouts and Descript Automatic Multicam use speaker/activity
evidence to create scenes and camera switches, while preserving timeline edits
and undo. Adobe's newer assistant similarly keeps generated organization and
assemblies in normal project history.

Quipsly can make this more trustworthy by showing why each camera decision was
proposed: active speaker, reaction hold, overlap, Shared Watch focus, source
quality, face availability, or manual intent. The unit of automation should be
an editable camera/layout operation on the canonical source clock, not an
opaque rendered video.

Sources:

- [Riverside Smart layouts](https://support.riverside.fm/hc/en-us/articles/5500983027101-Apply-Smart-layouts-to-your-video)
- [Descript Automatic Multicam](https://help.descript.com/hc/en-us/articles/28736507904525-Automatic-multicam)
- [Adobe Auto Reframe](https://helpx.adobe.com/premiere/desktop/add-video-effects/commonly-used-effects/auto-reframe-overview.html)
- [Adobe Premiere AI Assistant](https://helpx.adobe.com/premiere/desktop/premiere-ai-assistant/overview.html)

### Meeting notes win when the meeting remains attached to work

Notion links agenda/context, consent, transcription, summary, action items,
calendar, permissions, and retention. Teams recap keeps recording, transcript,
shared content, notes, agenda, and follow-up tasks together. Both expose an
important limitation: generated summaries can be incomplete or wrong, and
access to transcript/recording is not identical to access to the summary.

Quipsly should make a Session recap an evidence review surface. A suggested
task becomes canonical only when accepted, but acceptance should be one quick
action that carries owner, source span, due-language interpretation, Nest,
visibility, and a reversible receipt. Coaching adds stronger visibility classes
for coach-private, client-private, and shared material.

Sources:

- [Notion AI Meeting Notes](https://www.notion.com/help/ai-meeting-notes)
- [Microsoft Teams recap](https://support.microsoft.com/en-us/teams/meetings/recap-in-microsoft-teams)
- [Microsoft Teams collaborative meeting notes](https://support.microsoft.com/en-us/teams/meetings/take-meeting-notes-in-microsoft-teams)

### Transcript accuracy is a measured system, not a provider badge

Modern providers expose word timestamps, confidence, diarization, vocabulary
or formatting controls, and post-processing. Their own documentation also
describes failure modes: short utterances, overlap, early-session instability,
noise, and limited speech per speaker.

Quipsly should use separate participant masters as the strongest speaker hint,
retain provider evidence, preserve unknown/overlap states, and route providers
using a reviewed High Ground Odyssey and coaching corpus. Named speaker and
glossary improvements must be measured against reference windows rather than
accepted because a vendor claims higher accuracy.

Sources:

- [AssemblyAI speaker diarization](https://www.assemblyai.com/docs/pre-recorded-audio/label-speakers)
- [AssemblyAI streaming diarization limitations](https://www.assemblyai.com/docs/streaming/label-speakers-and-separate-channels)
- [AssemblyAI meeting-notetaker practices](https://www.assemblyai.com/docs/meeting-notetaker-best-practices)
- [AssemblyAI timestamp-preserving formatting](https://www.assemblyai.com/docs/speech-understanding/custom-formatting)

### iPhone capture quality is a resource budget

Apple exposes device formats and frame-rate ranges, multicamera hardware and
system-pressure costs, and runtime pressure states. Multicam inputs can be
dynamically disabled without interrupting the remaining inputs, but thermal,
power, and hardware budgets remain real. Apple's current AVCam architecture
also keeps blocking capture configuration away from the main UI actor.

The Quipsly UX should promise the best sustainable format, not always the
largest number. A 4K/24 single-camera master can be the preferred default for a
long episode; camera switching and multicam should emit explicit segments or a
proven continuous graph, monitor pressure/storage, and degrade through a
visible policy before the OS forces shutdown.

Sources:

- [Apple AVCam architecture](https://developer.apple.com/documentation/avfoundation/avcam-building-a-camera-app)
- [Apple AVCaptureMultiCamSession](https://developer.apple.com/documentation/avfoundation/avcapturemulticamsession)
- [Apple capture format capabilities](https://developer.apple.com/documentation/avfoundation/avcapturedevice/format)
- [Apple system pressure state](https://developer.apple.com/documentation/avfoundation/avcapturedevice/systempressurestate-swift.property)

### Browser output routing requires an honest fallback

Browser output selection is permission- and browser-dependent. `setSinkId()`
requires a secure context and may require explicit output-device permission;
the related Web Audio support is not universal. Quipsly should attempt exact
headphone routing, read it back when possible, and otherwise instruct the user
to select the output in system settings. It must not say that MV7i monitoring is
active merely because the device appeared in enumeration.

Sources:

- [MDN HTMLMediaElement setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId)
- [MDN AudioContext setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/setSinkId)

## Depth assessment of Quipsly's major systems

These levels are directional architecture assessments, not release claims.
They identify the next missing rung rather than rewarding route count.

| System | Current strongest level | Next depth gate |
| --- | --- | --- |
| Session and Capture | 4 Observable | recovery/readiness across person-device topology and real iPhone/browser operation |
| Audio and Dialogue Repair | 4 Observable | human-confirmed treatment quality, then multitrack collaboration and reusable profiles |
| Transcript and text-based edit | 4 Observable | attention inbox, reference corpus, distinct correction/edit verbs, harsh-cut protection |
| Episode collaboration | 4 Observable | one post-session landing with complete source/upload/edit inventory |
| Work, goals, tags, calendar | 4 Observable | canonical cross-view editing, dependencies, conflict/recovery, external projection reconciliation |
| Coaching | 3 Operable | explicit privacy classes, accepted shared commitments, recurring continuity and client portal |
| Research | 3 Operable | first-class reader/annotation anchors, source versioning, citation navigation and portable export |
| Writing | 3 Operable | stable binder/outliner/corkboard operations, snapshots, collaboration and compile profiles |
| Publishing | 3 Operable | versioned multi-destination preview, approval, retry/reconcile, and analytics provenance |
| Course/learning | 1 Exists | wait for stable source, document, work, and release primitives before broad UI expansion |

## Ranked production epics

### Epic 1: Session readiness and source topology

Build a producer-readable graph of people, endpoints, call tracks, retained
masters, Shared Watch, backup sources, and uploads. Each endpoint reports exact
device, tested state, local-recording state, storage/thermal/network warnings,
last receipt, and recovery action. The lobby sound check is the first shipped
slice of this epic.

Acceptance work: one High Ground Odyssey episode with Charlie on browser/MV7i,
Homer on browser for the call and iPhone for 4K local capture, one Shared Watch
clip, a deliberate network interruption, resumed upload, and complete editor
inventory.

### Epic 2: Audio and transcript command center

Make the first-class Audio Studio the shared workspace for source identity,
waveform, spectrogram, signal map, loudness, transcript, uncertainty, repair,
mix, edit, A/B, and delivery. Complete the human Dialogue Repair acceptance,
then add multitrack leveling, bleed/overlap evidence, ducking, and delivery
profiles through the same proposal/review/verification kernel.

Acceptance work: one real retained podcast defect and one complete two-speaker
episode mix with matched A/B, delivery target, decode/loudness/true-peak checks,
and proof-listen coverage.

### Epic 3: Transcript attention and edit safety

Create one queue for low-confidence entities, speaker uncertainty, provider
disagreement, gaps, timing anomalies, filler/pause candidates, and proposed
cuts. Every item opens protected context and supports the exact intended verb.
Build the retained evaluation corpus alongside the UI so provider routing and
automation quality improve from reviewed evidence.

Acceptance work: reviewed windows across Homer, Charlie, Shared Watch, overlap,
mouth noise, and noisy coaching audio; publish WER, speaker error, timestamp
error, edit hold rate, human correction effort, latency, and cost by provider.

### Epic 4: Automated episode assembly

Generate a reversible initial edit from active-speaker evidence, reaction
holds, Shared Watch spans, manuscript structure, and explicit editorial rules.
Add shorts/chapters/title/show-note candidates as linked outputs, not detached
AI text. All edits remain normal source-clock operations with reasons, preview,
undo, and history.

Acceptance work: recreate a substantial Episode 9 rough cut and compare human
time, cut quality, missed moments, false cuts, and final adjustments against a
manual baseline.

### Epic 5: Session evidence to action

Give episode and coaching recap different projections over one Session kernel.
Candidate decisions, notes, tasks, goals, and calendar commitments retain
source spans and visibility. Acceptance creates or links canonical work; it
does not copy text into a separate task universe.

Acceptance work: a consented coaching Session where coach-private notes remain
private, shared recap is edited together, accepted tasks appear in Work/Today,
a goal receives evidence, and scheduled focus appears in Quipsly plus one
external calendar without changing the task's due date.

### Epic 6: Research-to-writing workbench

Add browser/share/file intake, a split source reader, exact annotations,
citation navigation, claim/evidence packets, snapshots, binder/outliner/
corkboard projections, and compile profiles. Reuse the current document kernel
and source models; do not create a parallel canonical manuscript.

Acceptance work: research and write one High Ground Odyssey segment entirely
inside Quipsly, then compile podcast text, cited article, and research packet
from the same reviewed structure.

## Shared architecture Quipsly should build once

The epics above need common product primitives:

- immutable source and generation identity;
- one capture/source clock with explicit alignment revisions;
- person, endpoint, track, and retained-source topology;
- provider-neutral job intent, attempt, heartbeat, output, and reconciliation;
- proposal, review, consequence preview, acceptance, supersession, and undo;
- source-range anchors that survive transcript correction and document views;
- one attention-item projection over domain-owned facts;
- one canonical work item projected into list, board, calendar, Session, goal,
  episode, coaching, and Today;
- visibility and authority policies that distinguish private, shared, client,
  team, producer, reviewer, and public; and
- versioned artifact delivery with destination receipts.

Those primitives are not bureaucracy. They are how Quipsly can take enormous
development swings without making enormous amounts of contradictory state.

## Research cadence

For each epic:

1. tear down current official workflows and technical limits;
2. inspect Quipsly's real schema, route, UI, worker, and native boundaries;
3. define the anxiety chain and novice/power-user journeys;
4. define one retained acceptance case and its failure/recovery matrix;
5. implement a vertical slice through real authority and storage;
6. operate it on real work, including a deliberate failure;
7. measure quality, latency, cost, and human correction effort;
8. refactor ownership exposed by the operation; and
9. checkpoint the architecture, evidence, and next depth gate.

This program preserves Quipsly's speed. It replaces small disconnected feature
claims with large, testable product systems.

## Frontier research queue

This is the next research queue, not a promise to add eight new navigation
destinations. Each investigation must end in a retained comparison, a product
decision, and either a bounded vertical slice or an explicit rejection.

| Investigation | Product hypothesis | Smallest convincing proof | Principal risk |
| --- | --- | --- | --- |
| Session Guardian | Quipsly can prevent more bad recordings than a post-production repair tool can rescue by watching level, clipping, silence, route changes, storage, thermal pressure, clock health, track retention, and upload continuity during a Session. | Run one real hybrid episode with deliberate clipping, route loss, network loss, and low-storage simulations; show timely plain-language interventions and prove that warnings never claim more than measured evidence. | Too many alerts create more systems anxiety than they remove. |
| On-device transcript assist | Capability-gated Apple Speech analysis can provide private live navigation, named-moment markers, and a recovery transcript while cloud or workstation transcription remains the measured reference lane. | On a supported physical iPhone, compare live and prerecorded Apple transcription against the retained Quipsly reference windows for latency, named entities, word timing, and battery/thermal cost. | OS and language support vary; a convenient draft can be mistaken for canonical transcript truth. |
| Audible-event map | Sound classification plus Quipsly's deterministic signal evidence can make laughter, applause, silence, likely mouth events, and environmental disruptions searchable without pretending classification is repair approval. | Evaluate built-in and custom classifiers against human-labeled podcast/coaching windows, preserving false positives and exact source spans. | General sound labels are not precise enough for dialogue-repair decisions. |
| Explainable assembly director | Speaker activity, reaction holds, Shared Watch state, manuscript cues, source quality, and explicit editorial style can generate a better first multicam cut than speaker switching alone. | Rebuild a substantial Episode 9 section as reversible edit operations; compare edit time, false cuts, missed reactions, and human changes against the manual baseline. | An opaque auto-cut can be fast but tonally awful. |
| Conversation memory | One evidence-linked recap can serve coaching, episode, research, and working Sessions when templates are projections over the same transcript, decisions, and work records. | Regenerate the same retained Session as podcast production recap, coaching follow-up, and neutral meeting recap without duplicating tasks or losing source links. | Generic summaries flatten domain-specific privacy and meaning. |
| Adaptive voice chain | Reviewed speaker, microphone, and room evidence can seed conservative leveling and repair proposals that improve over time without silently applying a personal preset. | Compare three episodes from the same setup with and without the learned proposal seed, using matched A/B, delivery QC, and human preference. | Overfitting one room or voice can damage a different recording. |
| Evidence Lens | Permission-aware semantic retrieval over sources, transcripts, annotations, decisions, and documents can become Quipsly's research advantage if every answer navigates to exact evidence. | Answer a real High Ground Odyssey research question from mixed web, book, transcript, and note sources; require citation coverage, permission filtering, contradiction surfacing, and a portable research packet. | Embeddings can leak inaccessible context or create persuasive unsupported synthesis. |
| Outcome compiler | The same reviewed structure can compile an episode, article, coaching packet, course lesson, short, social package, and archive bundle as versioned outputs rather than copied drafts. | Produce two meaningfully different outputs from one reviewed source graph, then change one source decision and show an explicit, reviewable impact set rather than silent drift. | A universal compiler can become lowest-common-denominator templating. |

### Immediate ordering

1. Session Guardian extends the readiness/source-topology work already shipping.
2. Audible-event mapping and adaptive voice chains extend the Audio and
   Dialogue Repair evidence kernel.
3. On-device transcript assist feeds the transcript attention system, but only
   after physical-device capability and accuracy measurement.
4. Explainable assembly follows source-set and transcript-clock acceptance.
5. Conversation memory and Evidence Lens reuse the same source anchors,
   visibility policy, review receipts, and canonical work graph.
6. Outcome compiler follows versioned writing, edit, and delivery operations;
   it should not create another detached content generator.

### Session Guardian implementation checkpoint

The first browser and native vertical slices are now implemented over existing
evidence. They rank call-path setup, camera measurement, conversation state,
page/app visibility, recorder state, local byte or duration growth, storage
headroom, track delivery, recovery, and verified handoff without creating
another canonical readiness store. The browser recorder safely stops on
persistent mute, ended source, encoder error, stalled chunks, or exhausted
storage reserve while allowing the independent master to continue through call
loss. The iPhone Guardian distinguishes conversation presence from retained
audio/video, ranks consent and Session holds, protects preparing/finalizing and
failed-source states, measures microphone silence/hot/clipping conditions, and
surfaces camera profile, thermal/capacity, background, and provider evidence.

A signed-in disposable local user selected the exact canonical Episode 8
Session in the iPhone 17 Pro simulator and operated Record, consent, Session
Truth, Guardian, local start, and subordinate Live Room surfaces. The retained
UI test passed with no runtime warnings. Static contract coverage and native
build-for-testing also pass. The next gate is deliberate clipping, route loss,
network loss, background, and low-storage operation on real browser and iPhone
hardware, followed by shared clock/upload-continuity evidence.

### Audible-event map implementation checkpoint

The shared source-clock review foundation is now implemented in Audio Studio
and the episode editor. It projects complete-decode signal observations and
append-only Dialogue Repair candidates without adding a competing event store.
Whole/minute/detail zoom, family and review filters, prior/next navigation,
origin, detector score, human decision, waveform availability, and false
positives remain visible. Event navigation auditions bounded protected context;
it does not play the rest of the source or authorize treatment.

A signed-in local operation created a deliberate noise-event mark on an
immutable audio test source, navigated to it, caught and repaired an unbounded-
playback defect, recorded a false-positive receipt, and verified that the map
and review filter reconciled to the append-only decision. See
`2026-08-05-audible-event-map-architecture.md` for the official Sound Analysis
research, evidence taxonomy, detector receipt requirements, and qualification
program. The next gate is a versioned native file-analysis attempt measured on
retained podcast/coaching audio, followed by physical-device cost and accuracy
evaluation before any detector can be described as qualified.

### Current official capability signals

- Apple's [Speech framework](https://developer.apple.com/documentation/speech/)
  exposes live and prerecorded transcription, alternative interpretations,
  confidence, asset-managed modules, and voice-activity detection. Quipsly must
  capability-gate the newer APIs and measure them on its own corpus.
- Apple's [Sound Analysis framework](https://developer.apple.com/documentation/soundanalysis/)
  supports stream and file classification with built-in or custom models. Its
  output is candidate evidence, not an edit or repair decision.
- [Microsoft Teams intelligent recap](https://learn.microsoft.com/en-us/microsoftteams/intelligent-recap-calls-meetings)
  connects speaker/topic/mention timelines, chapters, notes, and suggested tasks
  to a meeting. Quipsly should preserve the stronger exact-source and acceptance
  boundaries it already has.
- [Zoom meeting-summary templates](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0080366)
  validate domain-specific recap projections over one transcript rather than
  separate meeting systems.
- [Adobe Enhance Speech](https://podcast.adobe.com/en/enhancespeech) demonstrates
  the appeal of one-click rescue and adjustable speech, music, and ambience.
  Quipsly's differentiator should remain visible evidence, matched A/B, defect-
  specific treatment, and versioned delivery rather than a mysterious global
  enhancement switch.
- [Notion AI](https://www.notion.com/help/notion-ai-faqs) connects meeting notes,
  research, search, documents, databases, and connected applications. Quipsly's
  opportunity is to make the cited source, media clock, editorial consequence,
  and canonical follow-through substantially more exact.
