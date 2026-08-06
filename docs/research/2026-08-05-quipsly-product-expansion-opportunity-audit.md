# Quipsly product expansion opportunity audit

Date: 2026-08-05

Status: first research synthesis; implementation sequencing recommended

Architecture continuation:
`2026-08-06-quipsly-capability-depth-and-operating-agent.md`

## Executive verdict

Quipsly already has enough breadth to become an unusually capable product. The
repo contains 106 web pages, 196 API routes, 197 route or UI test files, 288
server-library files, 231 Prisma models, and about 68,000 lines of non-generated
Swift across 75 Capture source files. It already has durable concepts for
Nests, sessions, participant access, consent, local recording, resumable upload,
LiveKit rooms, transcripts, corrections, speaker attribution, notes, tasks,
goals, calendars, tags, chat, media, episode production, review receipts,
publishing, and audio evidence.

The highest-leverage move is therefore not a broad feature land grab. It is to
make the existing capabilities feel like three coherent systems:

1. **Quipsly Sessions**: prepare, join, record, collaborate, recover, and recap
   any podcast, coaching session, interview, or working meeting.
2. **Quipsly Audio and Transcript Studio**: understand, repair, edit, mix,
   verify, and deliver source-bound speech better than any creator tool.
3. **Quipsly Evidence and Follow-through**: turn sources and conversations into
   cited notes, decisions, tasks, goals, calendar commitments, writing, and
   publishable outputs without duplicate records or copy/paste drift.

Those are large development swings. They are also one architecture: immutable
sources, stable clocks and anchors, append-only decisions, canonical work
objects, provider-neutral jobs, and many task-appropriate projections.

## What the market evidence says

The strongest products do not win merely by having a long menu. They remove a
specific chain of anxiety.

- Riverside preserves locally recorded participant tracks, exposes upload
  completion, records shared media separately, and makes producer control a
  first-class role. The cloud recording is useful reference evidence; local
  high-quality tracks remain the post-production source.
- Descript makes transcript text an edit surface, but distinguishes transcript
  correction from media mutation. Its better automated-edit tools include
  per-instance review, preview, timing controls, and an option to avoid harsh
  cuts.
- Auphonic treats dialogue delivery as a multitrack system: per-track leveling,
  gating, bleed removal, ducking, noise/hum reduction, a final mix, and
  standards-based loudness/true-peak verification.
- iZotope RX exposes many repair families, measurements, before/after
  comparison, spectral context, and different algorithms for different defect
  types. A single global "enhance" switch is not the professional ceiling.
- Notion and Teams connect calendar context, agenda, live notes, transcript,
  recap, and tasks. The important interaction is that the meeting is not an
  orphan file after it ends.
- Scrivener renders the same writing project as binder, corkboard, outliner,
  editor, research split, snapshot history, and compile output. Moving a card
  changes manuscript structure because the views share one source.
- Zotero stores annotations separately from source PDFs so collaborative edits
  sync without rewriting the source file, while retaining portable exports.
- NotebookLM makes sources selectable, answers with navigable citations, and
  transforms the same evidence into reports, guides, maps, quizzes, audio, and
  other artifacts.
- Trello's useful abstraction is not the board itself. One work item can appear
  in board, table, calendar, planner, and mirrored contexts without becoming
  five independent tasks.

Quipsly's existing architecture already points in this direction. The work now
is to complete the loops and make the projections feel intentional.

## Product principles for expansion

### One truth, many work surfaces

A transcript word, task, goal, source annotation, media range, episode, or
session must have one canonical identity. Calendar, board, inbox, manuscript,
episode room, coaching portal, and mobile Capture are projections, not copies.

### A person is not a device and a call is not a master recording

One participant may join from a browser for conversation, an iPhone for 4K
video, and another recorder for backup. Quipsly must show one person with
multiple device endpoints and multiple retained sources. Realtime transport is
the conversation path; local source tracks are the production masters.

### Automation proposes; receipts explain what became true

Automation can make large, useful drafts. Source mutation, transcript reference
truth, edit acceptance, publication, participant consent, and client-visible
commitments still require the relevant explicit authority. This is not
paperwork: every review surface should make the evidence, consequence, and undo
path obvious enough that approval is quick.

### Calm default, deep reveal

Homer should see the next useful action. Charlie or an editor should be able to
open clocks, waveforms, provider evidence, comparison states, and receipts.
Power must be present without making every user operate an aircraft cockpit.

### Operate features on real work before multiplying them

Each major feature family needs a retained source, a real user journey, an
observable failure path, a recovery path, and a durable result. A route, model,
or attractive panel is not product completion.

## Ranked expansion portfolio

Scores are 1-5 for direct user leverage, Quipsly differentiation, leverage of
existing foundations, and near-term operability. The total is directional, not
financial forecasting.

| Rank | Product swing | User | Difference | Foundation | Operability | Total |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Reliable Session and Capture Control Room | 5 | 5 | 5 | 5 | 20 |
| 2 | First-class Audio Mastery and Dialogue Repair | 5 | 5 | 5 | 5 | 20 |
| 3 | Transcript-to-Edit Intelligence | 5 | 5 | 5 | 4 | 19 |
| 4 | Universal Work and Follow-through | 5 | 4 | 5 | 4 | 18 |
| 5 | Source-grounded Research Workbench | 4 | 5 | 5 | 4 | 18 |
| 6 | Coaching Operating System | 5 | 4 | 5 | 3 | 17 |
| 7 | Long-form Writing Studio | 4 | 4 | 5 | 3 | 16 |
| 8 | Publishing and Content Atom Studio | 4 | 4 | 4 | 3 | 15 |
| 9 | Visual Pre-production System | 3 | 3 | 4 | 3 | 13 |
| 10 | Course and Learning Experience Builder | 3 | 3 | 3 | 3 | 12 |

The rank does not mean "finish one entire category before touching another."
The first three share clocks, sources, transcripts, workers, and review UI and
should advance as one coordinated media program.

## 1. Reliable Session and Capture Control Room

### User promise

Open one episode or coaching session, see who and what is ready, talk through
the best available path, preserve independent high-quality sources, watch
shared material together, and know that every usable track reached the project.

### Existing Quipsly foundation

- `CallRoom`, participant, invitation, access, consent, and provider receipts;
- LiveKit browser and Swift SDK integration;
- CallKit-owned iPhone audio activation;
- local LiveKit-input PCM master recording;
- local camera recording and source evidence;
- resumable upload/finalization and media-vault promotion;
- capture-group clocks and sync evidence;
- episode/coaching bindings, Session chat, and recap surfaces.

### Make it obviously more robust

1. **Session lobby and sound check**
   - enumerate actual cameras, microphones, and output routes after permission;
   - show live input meter, monitored route, channel count, sample rate, camera
     format, available storage, network quality, and thermal risk;
   - record a ten-second private sample and play it back through the selected
     output before joining;
   - preserve the sample as disposable diagnostic evidence only when the user
     chooses to attach it.
2. **Person/device topology**
   - group browser, iPhone, camera-only, and backup-recorder endpoints under the
     same participant;
   - clearly label `conversation`, `local audio master`, `local video master`,
     `shared media`, and `backup/reference` tracks;
   - never imply that a connected device is already retained.
3. **Producer view**
   - readiness and upload progress for every participant source;
   - mute, hand raise, shared-watch transport, clock health, reconnect state,
     local-recording state, storage remaining, and last source checkpoint;
   - a producer can help without becoming an unwanted recorded participant.
4. **Local-track continuity**
   - start local masters independently of provider egress;
   - keep recording through network degradation where the device permits;
   - checkpoint manifests, resumable chunks, and exact finalization receipts;
   - make `safe to leave` depend on local finalization and upload state.
5. **Shared Watch as a source track**
   - host-controlled and participant-accessible play/pause/seek;
   - source time, session time, and each participant's observed playback state;
   - downloadable/licensed files as retained sources; URL-only material as
     reference evidence with honest availability;
   - visible markers and transcript anchors for reaction moments.
6. **Multi-device companion mode**
   - let the laptop carry the call while the iPhone records 4K;
   - allow front/back camera switching only through a capture graph that either
     preserves one continuous timeline or emits explicit source segments;
   - show the laptop that the phone is recording and uploading without routing
     duplicate audible call audio through both devices.
7. **Post-session landing**
   - recording inventory, upload completeness, transcript progress, failed
     sources, chat, notes, and next actions in one recap;
   - episode sessions land in the episode room; coaching sessions land in the
     engagement while still using the same Session kernel.

### Architecture decision

Keep LiveKit as realtime transport and optional provider evidence. Preserve
Quipsly as the authority for session identity, consent, source manifests,
capture-group time, local recordings, uploads, and downstream use. LiveKit's
participant/track egress can provide a backup or reference recording, but it
must not be required to align separately captured masters.

Apple's current AVFoundation supports multi-camera sessions on eligible devices
and permits dynamically enabling/disabling camera inputs while other inputs
continue. Quipsly should still default to one 4K camera master when that yields
better thermal and quality headroom, and expose multi-camera only after device
capability and pressure budgets are measured.

## 2. First-class Audio Mastery and Dialogue Repair

### User promise

Quipsly shows what is wrong, where it is, how sure it is, what a treatment would
change, and whether the final file meets the destination—while the original
always remains recoverable.

### Existing Quipsly foundation

- exact source identity, SHA-256, generation, size, and protected playback;
- complete-decode waveform, signal, spectral, loudness, and true-peak evidence;
- versioned audio mastery proposals and independently verified derivatives;
- A/B listening, review, promotion, delivery, and append-only receipts;
- treatment experiments and the new exact-range Dialogue Repair desk;
- local and cloud worker contracts with retry/reconciliation boundaries.

### Make it best on the market

1. **A dedicated Audio Mastery workspace**
   - overview, waveform, spectrogram, loudness, phase/channel, transcript, and
     candidate lanes on one shared source clock;
   - compact status remains in media cards, but detailed work moves out of the
     cramped imported-media scroller;
   - keyboard-first previous/next issue, loop, source/treatment toggle, accept,
     reject, and compare.
2. **Sound-check coach**
   - input level and true-peak risk, room noise, hum, stereo balance, clipping,
     likely plosive proximity, route/sample-rate drift, and headphone feedback;
   - plain guidance such as move the mic, lower gain, close a noisy source, or
     switch input—without pretending one meter can prove sound quality;
   - preserve preflight and recording evidence separately.
3. **Multitrack speech mixer**
   - per-speaker leveling and controlled dynamics;
   - cross-gating/bleed reduction, ducking for music and Shared Watch, ambience
     continuity, and crosstalk-aware overlap handling;
   - a final mix stage with target-specific loudness and true peak;
   - per-track and mix-level measurements, bypass, solo, and matched A/B.
4. **Repair families**
   - mouth click/de-click, plosive, sibilance, clipping, hum, broadband noise,
     reverb, rustle/wind, bleed, and spectral interpolation;
   - each family has its own detector evaluation, conservative/strong profiles,
     review reasons, and damage tests;
   - no universal enhance control that hides speech damage.
5. **Audible impact map**
   - rank where a derivative differs from source;
   - show exact before/after spectral and waveform context;
   - separate measurable impact from a claim of audible improvement;
   - let the reviewer inspect the strongest changes first.
6. **Delivery profiles and quality control**
   - podcast stereo/mono, video platform, broadcast, audiobook, coaching
     archive, and transcript-optimized derivatives;
   - decode, duration, channel, loudness, true peak, codec, sample rate, chapter,
     artwork, and metadata verification;
   - versioned delivery artifacts and proof-listen coverage.
7. **Reusable sound signatures**
   - microphone/room/participant profiles based on reviewed evidence;
   - presets can seed proposals, never silently rewrite a new source;
   - compare results across episodes to learn whether setup changes helped.

### Competitive wedge

RX offers extraordinary tools but is specialist software. Auphonic offers
excellent automation but less source-linked editorial context. Riverside and
Descript simplify creator workflows but expose less technical evidence.
Quipsly can combine professional transparency with a calmer creator journey:
the exact transcript word, source sound, repair, edit consequence, and final
delivery all remain on one clock.

## 3. Transcript-to-Edit Intelligence

### User promise

The transcript is accurate enough to trust, easy to correct, and useful for
editing—without confusing corrected words with changed audio.

### Existing Quipsly foundation

- provider/version ledgers, timed segments and words, corrections, revisions,
  verification, speaker attribution, evaluation windows, and policy receipts;
- local Whisper worker and provider adapters;
- provider confidence separated from measured WER and human review coverage;
- exact source playback and signal/spectral overlays;
- reversible camera-cut and protected-edit proposals.

### Make it obviously more robust

1. **Provider shootout and routing policy**
   - run selected retained windows through local Whisper, OpenAI, Google Chirp,
     Deepgram, or other approved adapters;
   - compare normalized word error, named entities, timestamps, speaker error,
     overlap handling, latency, and cost;
   - route by source type and measured corpus results, not reputation.
2. **Nest vocabulary**
   - derive names, products, guests, books, recurring phrases, and glossary
     terms from the Nest;
   - pass provider-supported keyterms/adaptation with an exact vocabulary
     snapshot and evaluate whether recall improved;
   - never rewrite a provider result invisibly.
3. **Alignment and speaker identity**
   - VAD plus forced alignment for more stable long-form word timing;
   - prefer separate participant tracks over diarization where available;
   - map anonymous clusters to named people through review receipts and optional
     consented voice references;
   - surface overlaps and low-confidence identity boundaries.
4. **Transcript attention inbox**
   - prioritize low-confidence critical entities, cross-provider disagreement,
     audio/transcript gaps, speaker uncertainty, and timing anomalies;
   - one keystroke plays protected context and accepts, corrects, or defers;
   - measured WER grows only from reviewed reference text.
5. **Text-based edit with edit safety**
   - distinguish correct transcript, remove from transcript, deactivate media,
     replace with a gap, and close the gap;
   - filler-word and pause candidates are individually previewable;
   - an `avoid harsh cuts` analysis holds changes that clip phonemes, breaths,
     room tone, overlaps, or reaction timing;
   - every accepted edit remains an operation over source time.
6. **Automated assembly**
   - speaker-aware multicam drafts with reaction holds and overlap policy;
   - source-backed B-roll and Shared Watch cue suggestions;
   - chapter, cold-open, short, title, quote, and show-note candidates;
   - proposals grouped into a review queue rather than silently publishing.
7. **Transcript-derived outputs**
   - episode recap, coaching notes, decisions, open questions, tasks, goals,
     citations, chapters, captions, clips, and articles;
   - every derived item links to exact source words and retains its acceptance
     state.

### Accuracy architecture

No raw provider confidence number should choose truth across providers.
Deepgram documents its word confidence as calibrated for its own model, but
also warns that provider confidence scales are not directly comparable. Google
Chirp 3 supports diarization, language detection, vocabulary adaptation, and a
denoiser. OpenAI exposes a diarized transcription response. WhisperX research
shows the value of VAD and forced alignment for long-form timing. Quipsly should
store all of those as provider evidence and decide routing using its own
podcast/coaching corpus with WER, diarization error, timestamp error, and human
correction effort.

## 4. Universal Work and Follow-through

### User promise

Anything that becomes a commitment appears once, in the right places, with the
source and people attached.

### Existing Quipsly foundation

Tasks/action items, goals, task-goal links, evidence receipts, reminders,
recurrence series and occurrences, calendar projections, tags, Today, Inbox,
Work, Nests, sessions, and coaching follow-up already exist.

### Product depth to add

- one canonical action item with board, list, calendar, Today, goal, session,
  episode, and client projections;
- start/due/scheduled/blocked/completed are different concepts;
- subtasks, dependencies, milestones, assignees, watchers, estimates, and
  recurrence without copying records;
- editable views: list, board, calendar, timeline, table, person, goal, and Nest;
- saved filters and explicit tag inheritance/provenance;
- meeting-derived work arrives as candidates, then acceptance creates canonical
  actions and preserves the source span;
- time-block a task into Google Calendar without changing its due date;
- mirror a task across contexts while showing its source identity;
- a daily review that asks what changed, what is blocked, and what needs a
  decision instead of generating a vanity dashboard.

The first UX target is not a full Trello clone. It is a trustworthy daily loop:
capture -> inbox -> clarify/tag -> schedule or relate -> do -> review.

## 5. Source-grounded Research Workbench

### User promise

Collect a source once, annotate exact passages or times, understand why it is
relevant, and reuse it in writing, coaching, episodes, courses, and publication
without losing provenance.

### Existing Quipsly foundation

Source units, personal filing, source annotations and revisions, annotation
tags and uses, knowledge nodes, QuipLore sources/quotes/citations, visual
research packets, research Nests, portable export, and a document kernel.

### Product depth to add

1. Browser extension, share extension, file drop, DOI/URL/YouTube/audio/PDF
   intake, with exact fetch/import date and source version.
2. Split reader and notebook with PDF/page, web selector, image region, audio
   time, video time, and transcript-word anchors.
3. Database-backed annotations separate from original files, with portable
   annotated exports and conflict-safe collaboration.
4. Source cards with creator, publication, date, claim, evidence type, rights,
   credibility notes, tags, collections, relationships, and citation metadata.
5. Source-grounded assistant answers whose citations navigate to exact context;
   source-selection controls must be visible.
6. Claim/evidence/contradiction maps and research questions; graph views remain
   projections, not the canonical source.
7. Evidence packets for an episode, coaching plan, book chapter, course lesson,
   or social claim, including unused and dissenting evidence.
8. Transformation studio: briefing, study guide, outline, quiz, flashcards,
   script, audio overview, annotated bibliography, or visual map—all retaining
   source receipts.
9. Research freshness and drift: re-fetchable sources, changed-page detection,
   retracted/missing status, and citations bound to the version actually used.

Quipsly's differentiator should be research that can become real creative work,
not a chat that forgets where the answer came from.

## 6. Coaching Operating System

### User promise

The coach and client can prepare, meet, remember, agree, follow through, and see
progress without turning a human conversation into an automated bureaucracy.

### Feature family

- engagement home with people, outcomes, boundaries, shared/private resources,
  recurring schedule, and history;
- pre-session check-in, agenda, prior commitments, relevant notes, and consent;
- Session Control Room with live notes, timers, exercises, chat, attachments,
  and optional recording/transcription;
- recap with transcript, decisions, insights, open questions, resources, and
  candidate tasks/goals;
- coach-private notes, shared notes, and client-private reflection as explicit
  visibility classes;
- editable shared action plan and goal evidence rather than AI-generated final
  truth;
- weekly check-ins, reminders, progress receipts, rescheduling, cancellation,
  and calendar reconciliation;
- client portal optimized for `next commitment`, `why it matters`, `due`, and
  `ask for help`, not the internal database;
- reusable coaching programs and exercise templates;
- quality and outcome review using agreed measures, never surveillance theater.

Podcast episode and coaching session should share the Session kernel, capture,
transcript, chat, and source layers. Their profile, privacy, participants,
follow-up templates, and output destinations differ.

## 7. Long-form Writing Studio

### User promise

Write continuously, reorganize safely, keep research beside the draft, and
compile the same manuscript for different destinations.

### Product depth to add

- binder, outline, corkboard, continuous manuscript, and focus lenses over the
  same kernel document;
- stable structure IDs so rearranging chapters/scenes preserves annotations,
  episode bindings, comments, and publish history;
- synopses, labels, status, custom metadata, word targets, and saved collections;
- split editor and source/reference pane;
- snapshots and compare/restore at document or structural-unit scope;
- comments, suggested edits, author/provenance display, and canon state;
- compile profiles for book, PDF, Word, web article, podcast manuscript,
  teleprompter, handout, and course source;
- citations/footnotes connected to Research sources;
- writing progress based on meaningful work sessions and milestones, not just
  word count.

Do not create a second canonical manuscript to enable corkboard or outline UI.
Those views must issue kernel operations against stable structure.

## 8. Publishing and Content Atom Studio

### User promise

One reviewed source can become a coordinated release without copying metadata
into five tools or losing which version was published.

### Product depth to add

- content atoms: quote, clip, chapter, image, title, description, CTA, source,
  rights, and audience;
- episode/video/article/course/social packages that reuse those atoms;
- platform-specific preview and constraint validation;
- review, approval, scheduled, attempted, published, failed, superseded, and
  deleted states with destination receipts;
- campaign calendar linked to tasks and production milestones;
- asset variants and brand presets without overwriting masters;
- comments and approvals on exact artifact versions;
- analytics ingestion tied to the published artifact and creative hypothesis;
- learning loop that proposes next experiments without rewriting history.

## 9. Visual Pre-production System

Build storyboards, shot lists, breakdowns, stripboards, schedules, and call
sheets as linked projections over script/episode structure. Scene or segment
identity must remain stable when the script changes. A shot should know its
script range, purpose, subject, framing, camera, audio need, location, props,
people, status, and captured media. The call sheet should be generated from the
schedule and participant truth, reviewed, then distributed as a versioned
artifact.

This becomes valuable for YouTube and courses after the episode manuscript,
Session, calendar, and media identities are dependable. It should not outrank
recording and editing reliability.

## 10. Course and Learning Experience Builder

Build later from reviewed source, document, media, goal, and assessment
primitives:

- learning objectives and outcomes;
- modules, lessons, examples, practice, quizzes, assignments, discussions, and
  rubrics;
- accessible responsive blocks and media alternatives;
- prerequisite and mastery-path rules;
- learner progress and evidence;
- coach/facilitator feedback;
- SCORM/xAPI/LTI exports or adapters after the internal learning model works;
- versioned course releases and learner migration policy.

The differentiator is traceability from source evidence and real coaching or
creator material into a learning experience, not generic slide generation.

## Architectural recommendations

### Keep the monorepo; reduce coupling and accidental scope

The repo's size is not the central problem. Its current coupling is. Do not
split into repositories merely to make directory counts smaller. Keep atomic
changes across native contracts, web APIs, workers, schema, and documentation,
but enforce capability boundaries:

- `session-control-plane`
- `capture-contracts`
- `media-processing`
- `transcript-evidence`
- `document-kernel`
- `work-and-calendar`
- `research-evidence`
- `publishing-artifacts`

Feature packages should own contracts and deterministic projections. Provider
adapters should implement those contracts. Apps compose them.

### Decompose the largest UI surfaces

The 12,071-line editor page, 9,342-line manuscript client, 2,886-line recorder,
2,336-line session review client, and 2,242-line coaching page are now product
velocity and UX risks. Refactor by workflow and state ownership, not arbitrary
file size:

- route shell and access boundary;
- data/read-model loader;
- source inventory;
- session/capture control;
- transcript review;
- audio mastery;
- sync and edit review;
- output/publish handoff.

Each module needs a typed view model and a narrow operation API. Avoid passing
the entire editor state graph through components.

### Prefer projections over more canonical tables

With 231 models, a new table should represent a new invariant, authority, or
append-only receipt—not merely a new screen. Board cards, calendar items,
episode tasks, coaching commitments, and Today items should normally project
the same action record.

### Separate control plane, data plane, and evidence

- Control plane: sessions, participants, consent, jobs, source manifests,
  permissions, decisions, and desired operations.
- Data plane: realtime LiveKit tracks, local media files, resumable chunks,
  object-store media, proxies, and delivery artifacts.
- Evidence: immutable source bindings, provider events, measurements, reviews,
  reconciliations, and publication receipts.

The UI can explain failures much more clearly when these are not collapsed into
one `status` string.

### Standardize durable operations

Every slow or external operation should follow the same shape:

1. validated intent with actor and idempotency key;
2. immutable input/source binding;
3. durable queued job or outbox command;
4. lease, attempt, heartbeat, and bounded retry;
5. create-once output;
6. independent verification;
7. reconciliation against current authority;
8. result registration;
9. optional human review/promotion;
10. rollback or supersession receipt.

### Build one attention system

Audio defects, transcript uncertainty, failed uploads, calendar conflicts,
blocked tasks, access problems, and publication failures should share an
attention-item contract with severity, owner, source, next action, and resolved
receipt. Their domain facts remain in their owning systems. The attention queue
is a projection, not a second workflow database.

## UX architecture

Every major surface should answer, in order:

1. Where am I and what am I making?
2. What is ready, working, waiting, or at risk?
3. What is the best next action?
4. What will that action change?
5. How do I hear/see the evidence?
6. Can I undo or recover it?
7. Where will the result appear next?

Recommended shared patterns:

- one project/session header and one participant identity system;
- status language shared across phone, browser, Mac, and workers;
- compact summary with progressive disclosure into evidence;
- direct `play here`, `open source`, `show on calendar`, `open task`, and
  `show receipt` links;
- review queues with keyboard shortcuts and precise context;
- drafts and proposals that are useful without masquerading as final;
- an always-visible recovery path for recording, upload, edit, and publishing;
- empty states that lead into real creation instead of marketing copy.

## Recommended massive development swings

### Swing A: Session certainty

Ship a single browser/iPhone/Mac-compatible Session lobby and control room that
proves device selection, consent, LiveKit conversation, independent local
masters, multi-device identity, Shared Watch, upload completion, and recap on
one real episode and one coaching session.

### Swing B: Audio and transcript command center

Extract Audio Mastery from embedded media cards into a first-class shared-clock
workspace. Add transcript uncertainty, exact repair candidates, multitrack
mixing evidence, matched A/B, delivery QC, and source-linked edit proposals.
Operate it on High Ground Odyssey material and a consented coaching recording.

### Swing C: Evidence-to-action operating loop

Unify source capture, annotations, Session-derived candidates, tasks, goals,
calendar projections, and Today/Inbox. Prove that one accepted commitment is
editable from each relevant view without duplicates and always opens its source
conversation or document context.

### Swing D: Writing and research depth

Put binder, outliner, corkboard, reader/annotation, citations, split research,
snapshots, and compile projections over the kernel and source model. Use a real
episode manuscript and a research packet as acceptance work.

### Swing E: Publish and learn

Turn an accepted episode into versioned audio/video, show notes, chapters,
clips, posts, and a scheduled campaign. Preserve approval and destination
receipts, then bring performance data back to the exact published artifacts.

## Sequence recommendation

### Now

- keep Quipsly Capture/TestFlight reliability and physical operation at the top;
- finish the human-confirmed retained Dialogue Repair A/B;
- create the first-class Audio Mastery workspace shell;
- consolidate the Session lobby/readiness/upload journey;
- operate one full episode path from preparation through editor inventory;
- stop adding unrelated top-level routes until navigation and ownership are
  clear.

### Next

- multi-device participant topology and Shared Watch control;
- provider/corpus transcript comparison and Nest vocabulary;
- transcript attention inbox and protected text-edit operations;
- multitrack speech mixing and delivery profiles;
- universal task projections across Today, Work, Calendar, Nest, Session, goal,
  and coaching engagement;
- browser/share capture and source-grounded Research reader.

### Later

- long-form binder/corkboard/compile maturity;
- full coaching client portal and program templates;
- content atom and campaign analytics loop;
- script-linked visual pre-production;
- course authoring and LMS interoperability.

## What not to do next

- Do not add another generic AI chat destination.
- Do not build video calling before local-source reliability, device topology,
  and audio-call UX are proven.
- Do not hide professional audio decisions behind one unqualified Enhance
  button.
- Do not duplicate tasks for every view or workspace.
- Do not make generated summaries the only record of a session.
- Do not treat provider recording as the synchronization authority for local
  masters.
- Do not build a full Canva, LMS, or social suite before the source-to-output
  spine can complete one episode reliably.
- Do not split repositories until capability boundaries and release artifacts
  are explicit; repo splitting cannot repair ownership ambiguity.

## Research and validation program

Each major swing should maintain:

- a competitor workflow teardown using current primary documentation;
- a Quipsly capability and data-flow audit;
- a retained real-work acceptance case;
- a failure/recovery matrix;
- latency, cost, storage, and provider-dependency estimates;
- accessibility and novice/power-user journeys;
- a source and decision provenance review;
- a release boundary and rollback plan;
- a post-operation UX critique.

The ongoing research backlog should next deepen:

1. creator multitrack mixing and dialogue-restoration evaluation;
2. long-form transcript accuracy, speaker identity, and alignment benchmarks;
3. multi-device Session UX and iPhone thermal/storage constraints;
4. source annotation portability and citation formats;
5. coaching privacy/visibility and shared commitment UX;
6. task recurrence, time blocking, and multi-view projection semantics;
7. collaborative manuscript operations and compile/export fidelity;
8. platform publishing APIs, review requirements, and analytics provenance;
9. SCORM 2004, xAPI, LTI 1.3, and accessible learning-content requirements.

## Primary research sources

Recording and session architecture:

- [Riverside product overview](https://riverside.fm/product)
- [Riverside recording file types](https://support.riverside.fm/hc/en-us/articles/5260131045917-Video-and-audio-file-formats-Overview)
- [Riverside producer role](https://support.riverside.fm/hc/en-us/articles/5252621451805-The-producer-role-Details)
- [Riverside upload completion](https://support.riverside.fm/hc/en-us/articles/5287442440093-Confirm-that-participants-tracks-are-uploading)
- [LiveKit participant and track egress](https://docs.livekit.io/transport/media/ingress-egress/egress/participant/)
- [LiveKit composite recording](https://docs.livekit.io/transport/media/ingress-egress/egress/composite-recording/)
- [Apple AVCaptureMultiCamSession](https://developer.apple.com/documentation/avfoundation/avcapturemulticamsession/)
- [MDN media device enumeration](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices)
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN display capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)

Audio and editing:

- [iZotope RX](https://www.izotope.com/en/products/rx.html)
- [Auphonic multitrack algorithms](https://us1.auphonic.com/help/algorithms/multitrack.html)
- [Auphonic multitrack workflow](https://us1.auphonic.com/help/web/multitrack.html)
- [Descript edit like a doc](https://help.descript.com/hc/en-us/articles/15726742913933-Edit-like-a-doc)
- [Descript filler-word review](https://help.descript.com/hc/en-us/articles/10164806394509-Remove-filler-words)
- [Descript word-gap editing](https://help.descript.com/hc/en-us/articles/17460915431053-Edit-word-gaps-in-your-script)
- [Descript Regenerate review](https://help.descript.com/hc/en-us/articles/17676714027533-Use-Regenerate-to-fix-or-smooth-out-any-jumpy-abrupt-or-awkward-audio)

Transcription:

- [OpenAI audio API](https://platform.openai.com/docs/api-reference/audio)
- [Google Speech-to-Text release notes](https://docs.cloud.google.com/speech-to-text/docs/release-notes)
- [Deepgram keyterm prompting](https://developers.deepgram.com/docs/keyterm)
- [Deepgram word confidence](https://developers.deepgram.com/docs/confidence)
- [Deepgram multichannel and diarization](https://developers.deepgram.com/docs/multichannel-vs-diarization)
- [WhisperX paper](https://arxiv.org/abs/2303.00747)

Knowledge, work, and collaboration:

- [Notion AI Meeting Notes](https://www.notion.com/help/ai-meeting-notes)
- [Microsoft Teams meeting notes](https://support.microsoft.com/en-us/teams/meetings/take-meeting-notes-in-microsoft-teams)
- [Microsoft Teams recap](https://support.microsoft.com/en-us/teams/meetings/recap-in-microsoft-teams)
- [Microsoft Loop components](https://support.microsoft.com/en-us/loop/get-to-know-loop-components)
- [Trello workspace views](https://support.atlassian.com/trello/docs/workspace-views/)
- [Trello card mirroring](https://support.atlassian.com/trello/docs/mirroring-cards/)
- [Trello automation](https://support.atlassian.com/trello/docs/automation-overview/)

Writing and research:

- [Scrivener overview](https://www.literatureandlatte.com/scrivener/overview)
- [Scrivener inspector, metadata, and snapshots](https://www.literatureandlatte.com/blog/get-to-know-the-scrivener-inspector)
- [Zotero database-backed annotations](https://www.zotero.org/support/kb/annotations_in_database)
- [Zotero word processor integration](https://www.zotero.org/support/word_processor_plugin_usage)
- [NotebookLM source-grounded chat](https://support.google.com/notebooklm/answer/16179559)
- [NotebookLM source import and research](https://support.google.com/notebooklm/answer/16215270)
- [NotebookLM mind maps](https://support.google.com/notebooklm/answer/16212283)

Learning and production planning:

- [Canvas Mastery Paths](https://community.canvaslms.com/t5/Instructor-Guide/How-do-I-use-Mastery-Paths-in-course-modules/ta-p/906)
- [StudioBinder call sheets](https://www.studiobinder.com/blog/what-is-a-call-sheet/)
- [StudioBinder script revision continuity](https://www.studiobinder.com/blog/script-changes/)
- [StudioBinder shot lists](https://www.studiobinder.com/blog/how-to-make-a-shot-list-software/)
