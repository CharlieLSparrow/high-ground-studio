# Quipsly feature-depth radar

Date: 2026-08-06

Status: current research and build-priority input

Related foundation: `docs/research/quipsly-capability-expansion-2026-08-05.md`

## Decision

The next research program should optimize for **depth of outcome**, not breadth
of menus. A Quipsly feature is mature only when a person can enter with real
work, survive failure, understand the evidence, make or revise a decision,
carry the result into the next surface, and recover or export it later.

The product should keep making large implementation swings. The restraint is
architectural rather than quantitative: a large slice should deepen a shared
kernel or project the same durable object into a new job. It should not create
another source of truth that later needs reconciliation.

## Research method

The radar combines:

- current official product documentation from Riverside, Descript, Notion,
  Microsoft Teams, CoachAccountable, NotebookLM, Zotero, Scrivener, Auphonic,
  iZotope RX, and Adobe Premiere;
- repository and retained-data audit of Quipsly Capture, Sessions, Episode
  Room, Audio Studio, transcript review, coaching continuity, writing,
  research, tasks, calendar, tags, editor, and delivery contracts;
- real Quipsly operating evidence, including the retained browser/iPhone
  capture, the Episode matched A/B mix, exact-source transcript review, and
  coaching follow-up fixtures.

Marketing claims are not acceptance evidence. Competitor documentation is used
to identify interaction patterns and user expectations. Quipsly capability is
counted only when its own contract, persistence, UI, tests, and real-work
readback agree.

## The maturity test

Score every major capability from zero through five on each dimension:

1. **Entry:** Can a new or returning user reach the job from the context they
   already occupy?
2. **Control:** Can the user choose sources, devices, scope, audience, and
   automation strength without learning internal architecture?
3. **Evidence:** Can the user inspect what happened and what the system knows
   versus inferred?
4. **Recovery:** Can interrupted, partial, stale, or incorrect work be resumed,
   replaced, compared, or rolled back?
5. **Continuity:** Does the accepted result appear in the next relevant
   document, task, goal, timeline, calendar event, session, or output without
   copy-and-paste?
6. **Portability:** Can the person export both useful content and enough
   provenance to leave safely?
7. **Real-work proof:** Has the complete journey been operated with a real
   podcast, coaching, research, or writing outcome?

A polished screen with no recovery or continuity is not a four-out-of-five
feature. It is an attractive prototype.

## Depth bets

### 1. Session Command Center

**Job:** Prepare, call, locally capture, recover, review, and close one podcast,
coaching, research, or team Session from the same durable workspace.

Professional depth includes:

- calendar-linked preparation and a single join path;
- explicit microphone, output, and camera selection with a short setup test;
- one call-audio owner per participant and clearly separate high-quality local
  sources, cloud references, phone cameras, and external-camera backups;
- a phone acting as an aligned second camera without also owning call audio;
- visible consent, presence, endpoint, capture, upload, and retained-source
  states without collapsing one into another;
- participant-by-participant progressive-upload and recovery status;
- shared Watch with revisioned play, pause, seek, and source-track receipts;
- live manuscript or agenda, moment marks, private notes, shared notes, and
  Session chat;
- one post-session path into source recovery, sync, transcript, outcomes, edit,
  and next-session continuity.

Riverside validates local high-quality tracks, separate cloud references,
participant upload visibility, 4K capture, and a phone as a video-only second
camera. Descript Rooms validates double-ended tracks, progressive upload,
backup-first availability, and replacement of stalled primary recordings.
Quipsly should exceed both by making the source topology and recovery authority
explicit before the user reaches an editor.

### 2. Audio Evidence and Mastery

**Job:** Turn inconsistent multitrack speech into a trustworthy delivery master
without hiding damage or taste decisions behind one Enhance button.

Professional depth includes:

- complete-decode waveform, sample peak, clipping, loudness, loudness range,
  short-term loudness, frequency, channel, noise-floor, and activity evidence;
- aligned multitrack energy and speaker-activity lanes;
- mic-bleed, inactive-track noise, level, dynamics, and ducking proposals;
- event-level mouth-click, plosive, breath, sibilance, rustle, hum, clipping,
  reverb, and dropout review;
- conservative, balanced, and stronger versioned treatments where the
  treatment family is qualified;
- same-clock, loudness-matched A/B with transcript, actions, checkpoints,
  spectrogram detail, and an always-visible playhead;
- per-module bypass and intensity, an ordered processing chain, and exact
  reasons for every automatic proposal;
- output profiles for podcast, video, shorts, audiobook, archive, and future
  broadcaster needs;
- immutable sources, separately promoted candidates, final byte probes, and
  proof-listen receipts.

Auphonic validates individual-plus-combined multitrack analysis, activity-aware
gating, bleed removal, adaptive leveling, loudness range, short-term and
momentary targets, and true-peak delivery. RX 12 validates the repair taxonomy
and the need for assist-first plus surgical control. Premiere validates a low-
anxiety enhancement path with adjustable original/processed mix. Quipsly's
advantage is making those layers visible on one evidence clock.

Current proof advanced today: the retained Episode mix now has canonical
derivative attachments and a synchronized two-lane complete-decode signal view
with automation ranges, review checkpoints, playhead seeking, and bit-exact
profile reuse. The Session shared-clock queue can also append exact-source
audible-event detector decisions only after the complete required context has
traversed protected playback; the server re-verifies immutable source and
detector identity, and the receipt authorizes no treatment or edit. It does not
substitute decorative waveform bars or collapse distinct review authorities.

### 3. Transcript Truth and Terminology Memory

**Job:** Produce text people can safely use for edits, notes, tasks, goals,
research, and publication—and make correction cheaper over time.

Professional depth includes:

- known microphone/channel ownership before inferred diarization;
- provider attempt comparison with model, language, timing, confidence, and
  source identity preserved;
- show, client, person, brand, and discipline vocabularies with pronunciations,
  aliases, capitalization, and reviewed examples;
- fast correction mode for words, punctuation, speakers, utterance boundaries,
  and timing;
- selected playback, signal evidence, and provider words on the same clock;
- human-confirmed, human-corrected, and provider-only states that remain
  distinct;
- measured word, speaker, timing, and correction-effort evaluation against a
  retained podcast and coaching corpus;
- an impact graph showing which notes, tasks, goals, clips, chapters, or edits
  were derived from text that later changed;
- deliberate downstream reconciliation rather than silent regeneration.

Descript validates a glossary, selectable models, bulk correction mode,
re-alignment, and the operational danger of editing from a bad transcript.
Teams validates speaker, topic, chapter, mention, and follow-up projections.
Quipsly should make the underlying evidence and correction consequences more
inspectable than either.

### 4. Source-linked Rough Cut and Automated Edit Review

**Job:** Let a writer or producer shape a synchronized sequence through words
and review queues while retaining access to a dense timeline.

Professional depth includes:

- text selection creating reversible keep, remove, ignore, gap, and reorder
  decisions;
- filler, silence, repetition, tangent, false-start, and edit-point candidates
  reviewed individually or in meaningful groups;
- automatic refusal when surrounding audio predicts a harsh cut;
- selectable gap policy so timing can collapse, preserve, or use room tone;
- transcript, waveform, speaker activity, camera choice, and edit decisions on
  the same program clock;
- edit-point healing as a versioned candidate, never silent synthetic speech;
- speaker-aware camera suggestions with shot-stability and reaction context;
- one-click before/after playback, undo history, and handoff to the dense
  editor without flattening decisions.

Descript's per-instance filler review and surrounding-audio safety check are a
strong minimum interaction floor. Its own sequence and regenerated-audio
limitations are also useful warnings: Quipsly must keep multitrack identity and
synthetic repair provenance intact instead of making transcript convenience
erase the source model.

### 5. Coaching Continuity

**Job:** Make the value of coaching persist between calls without turning the
coach or client into a project administrator.

Professional depth includes:

- reusable preparation, session-note, recap, worksheet, and check-in
  templates;
- coach-private, team-private, client-safe, and explicitly shared lanes;
- transcript-derived notes, decisions, goals, and actions with source anchors;
- review before release, with language that can be edited naturally;
- meaningful actions with owner, due date, evidence of completion, comments,
  and adjustable reminder policy;
- metrics with history and optional worksheet-derived measurements;
- free-response and structured worksheets with save/resume/review;
- a client stream that connects Sessions, actions, measures, worksheets,
  comments, files, and wins;
- next-session brief generated from reviewed history and current follow-through;
- clear deletion, retention, export, and access policy.

CoachAccountable demonstrates that actions become valuable through reminders,
comments, completion, metrics, worksheets, and long-term follow-through—not
because an AI extracted a checkbox. Notion and Teams demonstrate calendar-
linked meeting entry, consent, recap, tasks, searchable meeting history, and
audience-aware sharing. Quipsly should unite those patterns with exact source
and transcript review.

### 6. Research and Citation Studio

**Job:** Move from a question to trustworthy, reusable writing or teaching
material while keeping every claim connected to inspectable evidence.

Professional depth includes:

- web, PDF, document, image, audio, video, transcript, and user-note sources;
- stable source versions and access state;
- reader annotations stored separately from source files and syncable without
  rewriting whole PDFs;
- exact passage, page, timestamp, region, and media anchors;
- deliberate source inclusion/exclusion before asking or generating;
- source-scoped answers with citations that open the exact context;
- claim cards with supporting, conflicting, and missing evidence;
- research queries, search decisions, rejected sources, and report versions;
- generated briefs, tables, maps, timelines, study materials, scripts, and
  manuscript insertions that preserve source lineage;
- collaborative source review and portable exports.

NotebookLM now sets a high breadth bar: source discovery, Drive sync, audio and
YouTube transcript import, source-scoped chat, inline citations, reports,
tables, mind maps, flashcards, quizzes, slide decks, infographics, audio/video
overviews, and visible prompts. Zotero sets the durability bar for database-
backed annotations and portable source files. Quipsly's opportunity is to make
research outputs native to the same episodes, lessons, coaching programs,
tasks, and publications rather than exported dead ends.

### 7. Writing Memory and Structural Lenses

**Job:** Make capture and retrieval as calm as OneNote while making a large body
of work more understandable than a folder tree.

Professional depth includes:

- one obvious notebook/page entry path, fast search, quick capture, rename,
  move, branch, and export;
- binder, corkboard, outliner, whole-document, focus, and saved-collection
  views over one canonical structure;
- tags, custom fields, statuses, people, claims, sources, and publication
  readiness as optional lenses rather than required filing bureaucracy;
- named snapshots, compare, block-range restore, and writing history;
- comments and suggestions with accept/reject and durable anchors;
- focused mobile writing and offline state that is explicit but unobtrusive;
- compile profiles for episode script, show notes, article, book, course,
  reviewer packet, and publication target.

Scrivener validates synchronized binder/corkboard/outliner movement,
collections, metadata, snapshots, compare, writing history, and compile. The
Quipsly difference is that source passages, Session speech, research claims,
tasks, edit decisions, and publications can remain live neighbors of the same
writing—not pasted supporting material.

### 8. Outcome and Publication Learning

**Job:** Turn one reviewed production into many platform-appropriate outputs,
prove delivery, and learn what helped without letting analytics rewrite truth.

Professional depth includes:

- versioned output recipes and brand profiles;
- long-form, short-form, audio, article, email, course, and social variants;
- captions, reframing, hook, title, description, CTA, thumbnail, and safe-zone
  review;
- approval and scheduling separated from generation;
- replaceable provider adapters and idempotent delivery receipts;
- destination URL/provider identity readback;
- performance attached to exact output, source range, treatment, and packaging
  version;
- useful comparison of hypotheses without pretending engagement proves truth;
- next-production recommendations that remain proposals.

## Ranked portfolio

| Rank | Bet | Why now | Shared leverage | Required real-work proof |
| --- | --- | --- | --- | --- |
| P0 | Session Command Center | Capture, browser calls, recovery, and post-session work still feel like separate journeys. | Session, person, endpoint, consent, source, upload, chat, calendar. | One hybrid HGO recording and one coaching call recovered through reviewed outcomes. |
| P0 | Audio Evidence and Mastery | This is a stated best-in-market ambition and already has the deepest kernel. | Media, alignment, transcript, edit, delivery, evaluation corpus. | Two real voice sources; event repair, multitrack proposal, matched review, approved delivery. |
| P0 | Transcript Truth | Every automated note, edit, task, and claim inherits transcript errors. | Sources, people, annotations, notes, tasks, clips, writing. | Podcast and coaching benchmarks plus correction-impact reconciliation. |
| P1 | Source-linked Rough Cut | Turns the strongest audio/transcript work into visible editing speed. | Program clock, decisions, Studio timeline, exports. | One full Episode rough cut with playback-reviewed edit receipts. |
| P1 | Coaching Continuity | Direct path to recurring product value beyond recording. | Sessions, tasks, goals, calendar, forms, comments, reminders. | Two-session client arc with reviewed recap and completed commitment. |
| P1 | Research and Citation Studio | Central to the product audience and unusually weak as a unified market category. | Sources, annotations, documents, AI proposals, courses, episodes. | One research question through cited manuscript/episode use and portable export. |
| P2 | Writing Memory and Lenses | Required daily-use floor, but should reuse the now-existing document kernel. | Documents, tags, anchors, revisions, search, outputs. | A week of real capture, retrieval, drafting, compare, and compile. |
| P2 | Outcome and Publication Learning | Valuable after the source-to-approved-output path is reliable. | Outputs, publication, calendar, receipts, analytics. | One long episode plus three reviewed variants and destination receipts. |

## Adjustments to the build plan

1. Keep the current P0/P1 ordering. The 2026-08-05 capability-expansion
   research remains sound.
2. Add the seven-dimension maturity score to vertical-slice planning and
   handoffs. It replaces “screen exists” as the implied completion test.
3. Treat recovery and cross-surface continuity as product features, not final
   hardening chores.
4. Build the shared source-clock review shell once, then plug audio events,
   transcript words, sync drift, edit decisions, clips, and outcomes into it.
5. Make vocabulary and correction impact first-class Transcript Truth work;
   repeated proper-noun repair is one of the clearest ways a product should get
   better through use.
6. Add a video-only phone endpoint mode to the Session Command Center rather
   than asking one device to own both call audio and 4K capture.
7. Do not wait for every provider integration before proving workflows. Use
   explicit packets and receipts where necessary, but never imply provider
   completion without readback.
8. Continue large implementation swings where one kernel supports several
   surfaces. The matched A/B waveform slice is the current example: one
   canonical attachment repair unlocked profiling, review, editor reuse, and
   future search/transcript compatibility.

## Next bounded research experiments

1. Run the same five-minute dialogue source through Quipsly, Auphonic, RX 12,
   Descript Studio Sound, and Premiere Enhance Speech. Measure levels, peaks,
   processing difference, correction effort, artifacts, and blind preference.
2. Build a 50-100 event reviewed dialogue corpus spanning mouth clicks,
   plosives, breaths, sibilance, rustle, bleed, clipping, hum, reverb, and
   intentional expression. Qualify detectors for review ordering before any
   automatic application.
3. Transcribe matched podcast and coaching windows through at least two
   qualified providers plus the local model. Measure word, speaker, timing,
   proper-noun, and human-correction performance.
4. Operate one hybrid browser-plus-iPhone Session with the phone explicitly in
   video-only second-camera mode, including interruption and unfinished-upload
   recovery.
5. Take one real transcript through filler/gap proposals, camera suggestions,
   rough cut, dense editor handoff, export, and proof-watch.
6. Take one coaching Session through private notes, client-safe recap, one
   worksheet, one measurable commitment, reminder, completion evidence, and
   next-session brief.
7. Take one HGO research question through source discovery, source selection,
   passage annotations, claim cards, conflicting evidence, manuscript insert,
   episode use, and portable export.
8. Record time-to-entry, time-to-trusted-source, time-to-reviewed-outcome,
   correction effort, recovery success, and cross-surface handoff failures for
   every experiment. These measures should reorder the roadmap when evidence
   disagrees with intuition.

## Current official references

- Riverside 4K recording and second-camera workflows:
  <https://support.riverside.fm/hc/en-us/articles/5588601739165-Recording-4K-Overview>
  and
  <https://support.riverside.fm/hc/en-us/articles/5767459419549-Use-mobile-device-as-second-camera-multicam-mode>
- Riverside local, aligned, cloud-reference, and upload-status model:
  <https://support.riverside.fm/hc/en-us/articles/5260131045917-Video-and-audio-file-formats-Overview>,
  <https://support.riverside.fm/hc/en-us/articles/5260156003485-About-cloud-recording-files>,
  and
  <https://support.riverside.fm/hc/en-us/articles/5287442440093-Confirm-that-participants-tracks-are-uploading>
- Descript Rooms recovery and product integration:
  <https://help.descript.com/hc/en-us/articles/30299949206541-Frequently-Asked-Questions-About-Descript-Rooms>
  and
  <https://help.descript.com/hc/en-us/articles/30176966037005-Recover-and-replace-stalled-Rooms-recordings>
- Descript transcript correction, glossary, filler review, and edit healing:
  <https://help.descript.com/hc/en-us/articles/10249424286477-Automatic-transcription>,
  <https://help.descript.com/hc/en-us/articles/10119613609229-Correct-your-transcript>,
  <https://help.descript.com/hc/en-us/articles/10164806394509-Remove-filler-words>,
  and
  <https://help.descript.com/hc/en-us/articles/17676714027533-Use-Regenerate-to-fix-or-smooth-out-any-jumpy-abrupt-or-awkward-audio>
- Notion AI Meeting Notes and AI workspace capabilities:
  <https://www.notion.com/help/ai-meeting-notes>
  and <https://www.notion.com/help/notion-ai-faqs>
- Microsoft Teams recap and collaborative notes:
  <https://support.microsoft.com/en-US/teams/meetings/recap-in-microsoft-teams>
  and
  <https://support.microsoft.com/en-us/teams/chat-channels/use-collaborative-notes-in-microsoft-teams-chats>
- CoachAccountable actions, worksheets, and coaching system:
  <https://www.coachaccountable.com/knowledgeBase/coaching/actions>,
  <https://www.coachaccountable.com/knowledgeBase/coaching/worksheets>,
  and <https://www.coachaccountable.com/knowledgeBase/coaching>
- NotebookLM notebooks, source discovery, and cited chat:
  <https://support.google.com/notebooklm/answer/16206563>,
  <https://support.google.com/notebooklm/answer/16215270>,
  and <https://support.google.com/notebooklm/answer/16179559>
- Zotero database-backed annotations:
  <https://www.zotero.org/support/kb/annotations_in_database>
- Scrivener writing and structural projections:
  <https://www.literatureandlatte.com/scrivener/overview>
- Auphonic multitrack analysis and delivery controls:
  <https://auphonic.com/help/web/multitrack.html>
  and <https://us1.auphonic.com/help/algorithms/multitrack.html>
- iZotope RX 12 repair taxonomy and assist/manual model:
  <https://www.izotope.com/en/products/rx/features>
- Adobe Premiere Enhance Speech and text-based editing:
  <https://helpx.adobe.com/premiere/desktop/add-audio-effects/adjust-volume-and-levels/enhance-speech.html>
  and
  <https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/overview-of-text-based-editing.html>
