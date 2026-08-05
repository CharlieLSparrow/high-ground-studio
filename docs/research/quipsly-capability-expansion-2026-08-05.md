# Quipsly capability expansion research

Date: 2026-08-05

Status: architecture and prioritization input, not a promise that every named
feature is shipping

## Executive decision

Quipsly should not compete by placing smaller copies of Riverside, Descript,
Notion, Teams, Trello, Canvas, Scrivener, Canva, Hootsuite, and StudioBinder in
one sidebar. Those products already demonstrate that each category can grow
into a dense specialist application. Reproducing their surface area would
create the same reconciliation problem Quipsly is meant to remove.

The product opportunity is **evidence-connected work memory**:

```text
capture -> source -> transcript/annotation -> reviewed decision
        -> document / edit / commitment / task / lesson / publication
        -> delivery receipt -> measured outcome -> next-session context
```

One spoken sentence or source passage should be able to become an edit,
coaching commitment, task, citation, lesson, clip, or social draft without
losing its origin, audience, revision, authorization, or place in time. Every
surface can be excellent at its job, but it must project the same durable work
graph.

## What the market teaches us

### Recording and media production

Riverside separates high-quality local participant tracks from lower-quality
cloud reference recordings, aligns late-starting tracks with padding, records
shared media as its own track, and lets collaborators review or download
recordings. That validates Quipsly's local-master plus reference/sync-ledger
direction. The important product lesson is not merely “record 4K”; it is that
every retained source must say what captured it, how it aligns, whether it is
complete, and whether it is a master or reference.

Descript treats a synchronized group of tracks as a sequence, lets ordinary
edits act on the sequence as a whole, and reserves a dedicated track editor for
offsets, visibility, and effects. Its script editing is non-destructive: text
operations change the composition while original media remains recoverable.
Adobe Premiere similarly binds timecoded transcript text to timeline edits.

Implication for Quipsly:

- a Capture Group is the durable recording event;
- a synchronized Source Sequence is the editable multitrack object;
- a transcript is a timed projection, not the media owner;
- script edits create reversible timeline decisions rather than rewriting
  sources;
- aligned playback must expose clock confidence, drift, gaps, and manual
  overrides before it claims “synced.”

Official evidence:

- [Riverside file and track model](https://support.riverside.fm/hc/en-us/articles/5260131045917-Video-and-audio-file-formats-Overview)
- [Riverside raw versus aligned tracks](https://support.riverside.fm/hc/en-us/articles/6518046195613-What-is-the-difference-between-an-aligned-track-and-a-raw-track)
- [Descript synchronized sequences](https://help.descript.com/hc/en-us/articles/16049556759693-Sync-multiple-audio-and-video-files-from-a-recording-session)
- [Descript text-based editing](https://help.descript.com/hc/en-us/articles/15726742913933-Edit-like-a-doc)
- [Premiere text-based editing](https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/overview-of-text-based-editing.html)

### Audio repair and mastering

The mature audio products distinguish analysis, repair, mixing, and delivery.
Auphonic analyzes tracks individually and together for leveling, gating,
cross-talk, noise, reverb, ducking, loudness range, integrated loudness, and
true peak. iZotope RX exposes targeted repair tools for mouth clicks, plosives,
breaths, clipping, hum, rustle, reverb, and dialogue isolation, plus numerical
and spectral evidence. Descript and Premiere expose a simple enhancement mix
control, but both preserve a route back to the unprocessed recording.

Implication for Quipsly: **Audio Mastery must be an inspectable proposal
system, not a magic enhance toggle.** A professional mastering pass needs:

1. immutable input identity and complete-decode proof;
2. waveform, spectrogram, loudness, true-peak, clipping, noise-floor, silence,
   bleed, and channel evidence with measurement method;
3. issue candidates attached to exact time ranges;
4. a proposed ordered processing chain with reason and confidence;
5. instant A/B audition at the same gain and playhead;
6. per-module intensity and bypass;
7. versioned renders, never source replacement;
8. output-target profiles for podcast, YouTube, short-form, audiobook, and
   archive;
9. final probe and listening receipts.

Mouth noise is a good design test. The system should show detected events,
let the editor audition before/after around each event, offer conservative and
stronger passes, and preserve false-positive decisions for later tuning. It
must not silently erase breaths or expression.

Official evidence:

- [Auphonic multitrack processing](https://us1.auphonic.com/help/algorithms/multitrack.html)
- [Auphonic loudness and true-peak controls](https://auphonic.com/help/web/multitrack.html)
- [iZotope RX repair and measurement features](https://www.izotope.com/en/products/rx/features)
- [Descript Studio Sound](https://help.descript.com/hc/en-us/articles/10327603613837-Studio-Sound)
- [Premiere Enhance Speech](https://helpx.adobe.com/premiere/desktop/add-audio-effects/adjust-volume-and-levels/enhance-speech.html)

### Transcript trust

Current speech providers expose distinct evidence that Quipsly should retain
rather than flatten: channel identity, diarized speaker identity, per-word
timing, per-word confidence, speaker confidence, utterance boundaries, model
version, and vocabulary prompting. Multichannel and diarization solve
different problems; a separate local microphone is stronger identity evidence
than asking one mixed track to infer speakers.

Implication for Quipsly:

- prefer known source/channel ownership before inferred diarization;
- keep provider attempts append-only and comparable;
- store raw word timing/confidence and normalized canonical segments;
- maintain a show/client vocabulary with reviewed names and terms;
- show low-confidence words in playback context;
- correction must update canonical text without destroying provider evidence;
- measure word error, speaker error, timing error, and human correction effort
  on real podcast and coaching windows;
- summaries, tasks, and edits must point to reviewed transcript/source ranges,
  not a detached blob of generated prose.

Official evidence:

- [Deepgram multichannel versus diarization](https://developers.deepgram.com/docs/multichannel-vs-diarization)
- [Deepgram versioned diarization and confidence](https://developers.deepgram.com/docs/diarization)
- [Deepgram utterance and word evidence](https://developers.deepgram.com/docs/utterances)
- [Google Speech recognition configuration](https://docs.cloud.google.com/speech-to-text/docs/reference/rest/v1/RecognitionConfig)

### Meetings, collaboration, and coaching

Notion's meeting notes connect calendar context, consent, transcript, summary,
action items, sharing policy, and a searchable meeting collection. Teams recap
co-locates recording, transcript, files, agenda, notes, and follow-up tasks;
its collaborative notes are editable before, during, and after the call.
CoachAccountable adds the longer arc that general meeting tools miss: client
actions, metrics, worksheets, session notes, comments, reminders, reports, and
privacy controls across individual and group work.

Implication for Quipsly: Podcast Episodes and Coaching Engagements should be
different **workflow projections over one Session kernel**, not unrelated
products.

Every Session needs a persistent workspace with:

- before: purpose, participants, agenda/manuscript, sources, clip queue,
  previous commitments, preparation, consent policy, devices, and readiness;
- during: call dock, local capture status, consent state, shared watch,
  manuscript/agenda, moment markers, live notes, and take chat;
- after: source upload/recovery, sync, playback, transcript review, decisions,
  notes, tasks/goals, edit handoff, approvals, and delivery;
- later: follow-through, measured outcomes, publication performance, and the
  next Session brief.

The podcast projection emphasizes takes, clips, manuscript, editor decisions,
assets, review, and publication. The coaching projection emphasizes private
versus client-safe notes, commitments, evidence check-ins, worksheets,
measures, recap approval, and next-session continuity. Their call, consent,
source, transcript, comment, task, calendar, and receipt mechanics stay shared.

Official evidence:

- [Notion AI Meeting Notes](https://www.notion.com/help/ai-meeting-notes)
- [Teams meeting recap](https://support.microsoft.com/en-us/teams/meetings/recap-in-microsoft-teams)
- [Teams collaborative meeting notes](https://support.microsoft.com/en-us/teams/meetings/take-meeting-notes-in-microsoft-teams)
- [CoachAccountable client stream](https://www.coachaccountable.com/knowledgeBase/coaching/stream)
- [CoachAccountable actions](https://www.coachaccountable.com/knowledgeBase/coaching/actions)
- [CoachAccountable worksheets](https://www.coachaccountable.com/knowledgeBase/coaching/worksheets)

### Knowledge, research, and writing

Zotero demonstrates two durable principles: annotations should be database
objects rather than destructive file mutations, and every extracted note
should retain a route to the exact source page and citation. NotebookLM shows
the value of source-scoped questions with inline citations and deliberate
source inclusion. Scrivener shows how one manuscript benefits from projections
such as binder, corkboard, outliner, metadata, saved collections, targets,
history, and compile profiles.

Implication for Quipsly:

- Source Reader, annotations, research notes, writing, and citations share
  stable anchors;
- every generated research statement opens its supporting passages;
- users can include/exclude sources before an AI operation;
- saved lenses project the same manuscript by structure, status, tag, person,
  claim, evidence gap, episode, course, or publication target;
- corkboard/outliner movement updates canonical structure through reversible
  operations rather than copying text;
- compile/export is a versioned publication projection.

Official evidence:

- [Zotero reader and source-linked notes](https://www.zotero.org/support/pdf_reader)
- [Zotero annotation storage and portability](https://www.zotero.org/support/kb/annotations_in_database)
- [NotebookLM source-grounded chat](https://support.google.com/notebooklm/answer/16179559)
- [Scrivener overview](https://www.literatureandlatte.com/scrivener/overview)

### Work management and calm automation

Microsoft Planner's useful distinction is “My Day” as a deliberate daily
projection over tasks that remain owned by their original plans. Notion and
Trello demonstrate multiple views, stable task IDs, forms, buttons, triggers,
and automatic actions. Their weakness for Quipsly's audience is that flexible
automation can become a second programming job.

Implication for Quipsly:

- Today is a focus projection, never a second task store;
- tasks, goals, projects, calendar events, and session commitments retain one
  identity across views;
- “when this, do that” recipes are templates over typed domain events;
- preview shows the exact records and external effects before activation;
- every run is idempotent and receipt-backed;
- ambiguous or destructive effects enter a review queue;
- useful defaults are purpose-aware: podcast release, coaching follow-up,
  research review, writing sprint, and course cohort.

Official evidence:

- [Microsoft Planner My Tasks and My Day](https://support.microsoft.com/en-US/Planner/training/manage-your-tasks-with-my-tasks-and-my-day)
- [Notion task databases and sprints](https://www.notion.com/help/sprints)
- [Notion database buttons](https://www.notion.com/help/guides/make-work-more-efficient-database-button-property)
- [Notion forms](https://www.notion.com/help/forms)
- [Trello automation actions](https://support.atlassian.com/trello/docs/trigger-actions-with-automation/)

### Courses, production, and publishing

Rise validates responsive reusable content blocks, interactions, knowledge
checks, collaborative review, and LMS-standard export. Canvas adds outcomes,
rubrics, prerequisites, conditional learning paths, submissions, and mastery
reporting. StudioBinder connects script elements to shots, storyboards,
schedules, locations, contacts, call sheets, distribution, and confirmation.
Canva and Hootsuite connect brand-controlled templates to approval, calendar,
publishing, and analytics.

These should be later projections of Quipsly's existing graph:

- source annotation -> lesson evidence;
- document structure -> course outline or script scenes;
- tagged script range -> shot, prop, person, location, or storyboard frame;
- approved episode moment -> clip and platform variants;
- project milestone -> production calendar and call sheet;
- published artifact -> performance receipt and research signal.

Do not build an LMS, design suite, or social scheduler before the shared
document/source/review/publication kernels can carry those projections.

Official evidence:

- [Rise responsive course authoring](https://www.articulate.com/360/rise/)
- [Canvas mastery paths](https://community.canvaslms.com/t5/Instructor-Guide/How-do-I-use-Mastery-Paths-in-course-modules/ta-p/906)
- [StudioBinder connected production planning](https://www.studiobinder.com/storyboarding-tool/)
- [StudioBinder script breakdown](https://www.studiobinder.com/script-breakdown-software/)
- [Canva approval workflow](https://www.canva.com/learn/approval-process-workflow/)
- [Hootsuite publishing and intelligence platform](https://www.hootsuite.com/platform)

## Priority portfolio

### P0: Trustworthy Session-to-Outcome spine

This is the product, not preliminary plumbing. Complete one real Episode and
one real Coaching Engagement through preparation, call/capture, source
recovery, synchronized playback, transcript correction, reviewed outcomes,
tasks/goals, and next-step readback.

Robustness gates:

- cross-device identity and room entry;
- explicit consent and permission recovery;
- local recording survival through interruption and process death;
- resumable, hash-bound upload;
- transparent alignment and drift correction;
- exact-source transcript correction;
- audience-aware note and commitment release;
- delivery receipts and next-session continuity.

### P0: Audio Mastery Lab

Quipsly already has a mature foundation here: immutable generation-bound
sources, complete-decode signal and loudness evidence, broad-band spectral
evidence, source-clock maps, loudness-matched A/B audition, versioned treatment
experiments, explicit promotion, delivery artifacts, and append-only review
receipts. Do not rebuild that foundation as a new mastering screen.

Advance it into a **Dialogue Repair Review**. The first impressive journey is
a podcast voice track with exact mouth-click, plosive, sibilance, breath,
clipping, and noise candidates; transcript and spectrogram context; matched A/B
audition; conservative and stronger versioned treatments; final probes; and a
human listening receipt. Detection qualification permits listening triage only.
It never silently applies a repair or mutates the retained source.

### P0: Transcript Truth Desk

Unify provider comparisons, channel/speaker evidence, terminology, timed
confidence, playback correction, immutable revision history, and downstream
impact review. A correction should disclose which notes, tasks, goals, clips,
or edits were derived from the prior text and offer deliberate reconciliation.

### P1: Source-linked rough cut

Turn reviewed transcript selections into non-destructive timeline decisions;
support keep/remove/ignore, filler and gap proposals, source-sequence sync,
camera selection, rollback, and export to a dense timeline. Never make the AI
proposal itself the published edit.

### P1: Coaching continuity system

Add reusable preparation/recap templates, client check-ins, measures,
worksheets, commitment evidence, reminder policy, private/client-safe lanes,
and a next-session briefing. Reuse canonical documents, forms, tasks, goals,
calendar, comments, and receipts.

### P1: Research and citation workbench

Deliver a reader with stable annotations, source-scoped ask/research,
citation-backed claim cards, evidence-gap review, and one-click insertion into
the manuscript as an anchored reference rather than pasted text.

### P2: Calm workflow recipes

Ship a small library of deeply useful, previewable workflows before a generic
automation builder: release an episode, prepare a coaching session, close a
session, review a research inbox, run a writing sprint, and publish a clip.

### P2: Course and production projections

Project documents, sources, projects, reviews, and publications into course
outlines, assessments, outcomes, storyboards, shot lists, production calendars,
and call sheets. These become much cheaper after P0/P1 kernels are complete.

### P3: Social publishing and intelligence

Add platform variants, brand controls, approval, scheduling, provider delivery,
analytics, and source-linked performance learning. External network adapters
must remain replaceable and receipt-backed.

## Current capability audit

The existing implementation changes what "next" means. Audio is not starting
from a waveform mockup or a generic enhancement button. The repository already
contains:

- source-generation and SHA-bound measurement, diagnosis, spectral evidence,
  treatment, mastering, promotion, and delivery contracts;
- complete-decode FFmpeg workers and independent output verification;
- whole-program, one-minute, and detail views on a shared source clock;
- transcript words, capture boundaries, selected playback, and processing
  evidence in related review surfaces;
- explicit source/candidate switching with loudness matching;
- retained Episode operations and append-only review evidence.

The current treatment engine is intentionally narrow: it qualifies and renders
DC/rumble correction while excluding denoise, compression, de-essing, and
editorial cuts. The diagnosis-evaluation contract names plosive and sibilance,
but there is not yet a product-qualified event detector, high-resolution repair
view, or treatment family for the mouth noises the user observed in real work.
That is a meaningful capability gap, not missing polish.

## Highest-leverage next production slice

The next major feature slice should be **Session Truth Console + Dialogue Repair
Review**, first against a real High Ground Odyssey source and then a retained
coaching source. It should compose the existing Audio Mastery evidence instead
of introducing a parallel mastering subsystem.

It should put one truthful post-session path in front of the user:

1. confirm retained sources and upload/recovery state;
2. inspect alignment, drift, gaps, channel ownership, and source quality;
3. play the assembled sequence with transcript following;
4. inspect low-confidence transcript and audio-attention ranges together;
5. inspect qualified dialogue-event candidates and audition versioned repair
   proposals without modifying sources;
6. accept transcript corrections and selected processing into a new revision;
7. derive reviewed notes/tasks/goals or edit decisions with exact anchors;
8. hand the same sequence to Studio and preserve every decision receipt.

Why this wins the next slot:

- it directly serves the next podcast recording and coaching session;
- it joins the user's three stated best-in-market priorities: audio,
  transcription, and automated editing;
- it exercises Capture, Nest, Studio, source identity, document anchors,
  collaboration, and tasks together;
- it produces observable value before broader LMS/social/design expansion;
- every later course, clip, article, or coaching workflow benefits from the
  same trusted source and review substrate.

## Product research cadence

This document should become a living evidence process, not an annual strategy
exercise:

1. operate one real Quipsly workflow weekly;
2. record friction, abandonment, repair, and time-to-outcome;
3. compare a bounded competitor journey using official current documentation;
4. identify the missing kernel or projection rather than copying a screen;
5. build a complete vertical slice with instrumentation and rollback;
6. re-operate the real work and preserve the acceptance receipt;
7. update priorities from evidence.

Feature count is not the scoreboard. The useful measures are time from intent
to trusted source, source to reviewed outcome, outcome to delivery, correction
effort, recovery success, cross-surface continuity, and whether a person can
understand what happened without becoming their own systems administrator.
