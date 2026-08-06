# Quipsly product research

This directory is the working evidence base for large Quipsly product bets.
Start here before proposing a new top-level feature, competitor clone, or broad
architecture change.

The current product decision is:

> Quipsly is a source-to-outcome operating system for creators, coaches,
> researchers, and trainers. Its advantage is not that it places many small
> apps in one sidebar. Its advantage is that one protected source can become a
> reviewed transcript, edit, note, decision, task, goal, lesson, publication,
> and next-session input without losing identity, evidence, permission, or
> history.

## Read in this order

1. [`2026-08-06-quipsly-obvious-depth-feature-portfolio.md`](./2026-08-06-quipsly-obvious-depth-feature-portfolio.md)
   ranks the visible product bets and recommends the Episode and Session
   Finishing Cockpit.
   The first retained implementation checkpoint is documented in
   [`../coordination/quipsly-session-episode-assembly-truth-2026-08-06.md`](../coordination/quipsly-session-episode-assembly-truth-2026-08-06.md).
2. [`2026-08-06-quipsly-capability-depth-and-operating-agent.md`](./2026-08-06-quipsly-capability-depth-and-operating-agent.md)
   defines the shared platform primitives, capability manifests, and governed
   action runtime.
3. [`2026-08-05-quipsly-feature-depth-program.md`](./2026-08-05-quipsly-feature-depth-program.md)
   defines the eight-level maturity ladder and the ongoing evidence program.
4. [`2026-08-05-quipsly-product-expansion-opportunity-audit.md`](./2026-08-05-quipsly-product-expansion-opportunity-audit.md)
   inventories the repository and maps the strongest existing foundations to
   market opportunities.
5. [`quipsly-capability-expansion-2026-08-05.md`](./quipsly-capability-expansion-2026-08-05.md)
   contains the broader category research across recording, audio,
   transcription, meetings, research, writing, work, courses, production, and
   distribution.

Specialized research belongs beside these documents. For example,
[`2026-08-05-audible-event-map-architecture.md`](./2026-08-05-audible-event-map-architecture.md)
defines the current audio-event evidence and human-review boundary.

## Current capability frontier

The maturity level below uses the ladder from the feature-depth program:
Exists, Reachable, Operable, Observable, Recoverable, Collaborative, Assisted,
and Extensible. It is deliberately conservative. A route or passing component
test does not advance a capability past Operable, and simulator/local operation
does not satisfy a physical-device or production acceptance gate.

| System | Strongest proven foundation | Current frontier | Highest-value gap |
| --- | --- | --- | --- |
| Session Control Plane | Private record/playback sound check, endpoint-aware room, browser local master, capture-group clocks, resumable verified handoff, Guardian receipts | Observable locally; parts recoverable and collaborative | One calm lobby-to-`Safe to leave` journey operated with browser, physical iPhone, external mic/camera, Shared Watch, interruption, and resumed upload |
| Audio Intelligence | Source-bound waveform, spectrum, loudness, audible-event map, repair experiments, mastery review, delivery evidence, append-only human labels, and immutable evidence-linked Episode mix proposals with exact-source rendering | Observable and partially recoverable; one retained real-source baseline mix is independently verified | Loudness-matched baseline/proposal A/B, append-only approval and promotion, a representative two-person podcast/coaching corpus, qualified bleed/overlap/ducking automation, and destination-ready proof listening |
| Transcript Truth | Versioned provider attempts, immutable segments, corrections, source-clock return, WER/speaker/timing/correction/cost evaluation board, frozen project-term evidence, and byte-matched terminology experiments | Observable evaluation infrastructure; terminology impact is measurable but has no genuine retained pair yet | Retained podcast/coaching reference windows, calibrated provider routing, reviewed speaker profiles, critical-entity attention, and downstream regeneration after accepted corrections |
| Explainable Editor | Multitrack sync evidence, reversible timeline operations, transcript review, audio treatment, automated-edit evidence, delivery candidates | Broadly operable; evidence is distributed | One finishing cockpit and attention queue that turns a retained take into a reviewed master and rough cut without navigating several specialist desks |
| Evidence and Research | Canonical sources, exact annotations, tags, citations, evidence-to-draft handoff, portable export/restore, source return | Operable locally and partly collaborative | Selectable research scopes, claims/contradictions, source-set versions, real-account privacy proof, and citation-aware compilation |
| Coaching Continuity | Session workspace, private/shared visibility, transcript-derived reviewed work, goals, tasks, planning, follow-up projections | Operable in bounded slices | Two real coaching loops from preparation and consent through reviewed recap, shared commitments, longitudinal outcome evidence, and next-session briefing |
| Work and Calendar | Canonical tasks/goals, Today ranking, focus blocks distinct from deadlines, Schedule projections, Calendar connection management | Operable locally | Real provider reconciliation, recurrence/dependency depth, shared planning, notification policy, and cross-device same-ID dogfood |
| Production, publishing, courses, and social | Storyboards, publishing receipts, calendar projections, document blocks, outputs, review concepts | Exists to early Operable depending on surface | Build these as projections of reviewed sources and outputs after the finishing spine is dependable; do not create parallel truth stores |

## The three immediate product bets

### 1. Recording Confidence and Recovery Console

Make the existing recording systems feel like one premium control plane:

- identify each person and every endpoint role;
- show requested versus actual input, output, format, channel, frame-rate,
  storage, thermal, network, and clock state;
- run a private record-and-playback sound check with peak, RMS, noise-floor,
  clipping, echo, and route guidance;
- distinguish conversation witness, local audio master, local video master,
  Shared Watch source, and backup;
- show retention, upload, verification, gaps, and recovery per source; and
- calculate `Safe to leave` from durable evidence rather than call state.

The retained call track may help conversation and synchronization, but it is
not allowed to silently replace a higher-quality local master.

### 2. Transcript Quality Lab

Turn the existing evaluation board into a complete improvement loop:

- retain provider, model, adapter, request configuration, vocabulary, channel,
  and diarization policy for every attempt;
- maintain show, client, guest, and domain term sets plus reviewed speaker
  profiles;
- compare exact providers against the same approved source windows;
- measure word, speaker, critical-entity, utterance, timestamp, correction-time,
  latency, failure, and cost outcomes;
- route low-confidence or high-consequence evidence into one correction queue;
  and
- preview and explicitly run regeneration of summaries, tasks, edits, captions,
  or drafts that depended on corrected evidence.

### 3. Episode and Session Finishing Cockpit

Unify the strongest existing desks around one source clock and one attention
queue:

1. **Recover** every expected source and explain uncertainty.
2. **Understand** transcript, waveform, spectrum, loudness, overlap, audible
   events, chat marks, manuscript cues, and human annotations.
3. **Repair** through versioned, level-matched treatment experiments.
4. **Assemble** with reversible transcript, pacing, camera, layout, Shared
   Watch, chapter, and clip proposals.
5. **Finish** audio/video variants, captions, notes, tasks, publishing material,
   delivery receipts, and next-session continuity.

## Research lanes

Research should continue in parallel with implementation, but it must answer a
decision rather than accumulate feature trivia.

| Lane | Current question | Required evidence |
| --- | --- | --- |
| Recording | How do we make a hybrid browser/iPhone/external-camera Session calmer and safer than Riverside? | Official platform/provider behavior, retained failure journeys, physical-device operation, and post-session source readback |
| Audio | Which detector and treatment families measurably improve Charlie/Homer and coaching dialogue without erasing expression? | Human-labeled positive and absent windows, matched A/B, per-class metrics, complete-decode QC, and proof listening |
| Transcription | Which configurations are best for HGO names, overlap, coaching language, and noisy/mobile sources? | Protected reference windows, provider/config receipts, WER/DER/entity/timing metrics, correction effort, latency, and cost |
| Automated editing | Which edit proposals save the most time while remaining easy to understand and undo? | Normal editable operation sets, explanation quality, harsh-boundary review, human acceptance, time saved, and final proof watch/listen |
| Coaching | Which outputs improve follow-through without leaking private notes or fabricating commitments? | Real session consent, evidence-linked review, client/coach visibility tests, next-session reuse, and measured completion |
| Research and writing | Which source-set, citation, claim, and compilation tools eliminate copy/paste drift? | Exact-source return, scope disclosure, portable citations, version comparison, privacy, and real manuscript/course use |
| Work and collaboration | Which shared projections reduce systems anxiety without becoming another configuration job? | Same-ID cross-surface operation, clear authority, conflict/recovery behavior, attention cost, and real weekly use |
| Courses and distribution | Which later projections can reuse reviewed evidence, structure, outputs, rights, and performance receipts? | A complete underlying source-to-output loop before adding broad navigation or parallel models |

## Admission rule for a large feature

A feature enters the build sequence only when its proposal states:

- the consequential user job and the anxiety it removes;
- the canonical records and stable identities it reuses or introduces;
- source, permission, consent, privacy, and retention behavior;
- what becomes real, what remains a proposal, and who has authority;
- progress, cost, failure, retry, conflict, undo, and supersession behavior;
- the calm default UX and expert evidence available on demand;
- accessibility and offline/device implications;
- one retained real-work acceptance journey; and
- which current feature will be simplified, superseded, or removed.

This is not an approval bureaucracy. It is the minimum information needed to
take a large swing without creating another disconnected prototype.

## Current build order

1. Finish the real recording confidence and recovery loop.
2. Expand the shared audio/transcript truth corpus while operating real sources.
3. Project source recovery, transcript, audio, and edit attention into the
   Episode and Session Finishing Cockpit.
4. Produce a reviewed Episode master and reversible rough cut end to end.
5. Reuse the same source and work graph for coaching continuity and Evidence
   Lens.
6. Add course, social, storyboard, and distribution depth as output projections,
   not separate miniature products.

## How the broad feature research will run

Broad research is a continuous product lane, not a pause before implementation.
Each wave uses current primary documentation, operates Quipsly's corresponding
workflow, and ends in one of four outcomes: deepen an existing capability,
admit a new vertical slice, record a dependency, or explicitly reject the idea.

The first waves are:

1. **Session and capture certainty** — Riverside, Descript Rooms, professional
   field recorders, browser media APIs, iPhone capture, Shared Watch, and local
   upload recovery.
2. **Speech finishing** — Auphonic, Resolve/Fairlight, iZotope, Adobe Podcast,
   transcript editors, source separation, audible-event review, mixing, and
   automated assembly.
3. **Conversation to continuity** — Teams recap, Granola, coaching platforms,
   editable notes, jointly accepted commitments, goals, measures, and next
   Session preparation.
4. **Evidence to output** — Zotero, NotebookLM, Scrivener, StudioBinder, Rise,
   Canva, and social publishing systems, with exact sources and shared objects
   remaining canonical.

The operating question is always: *what can a person now complete confidently
inside Quipsly that previously required changing tools or reconstructing
context?* Feature count and competitor parity are supporting evidence, not the
score.

The order can change when real use exposes a stronger dependency. The evidence
and object boundaries should survive that change.

## Research cadence

Maintain two parallel horizons:

- a weekly depth pass on the capabilities currently being operated, ending in
  a measurable build, a rejected idea, or an explicit dependency; and
- a monthly expansion pass across adjacent creator, coaching, research,
  writing, learning, collaboration, and distribution categories.

Every pass updates the capability frontier above. A competitor feature is not
automatically a Quipsly feature request: the research must identify the user
outcome, the shared objects it deepens, and the real-work acceptance journey.
This cadence is intentionally lightweight enough that it does not slow large
implementation swings.
