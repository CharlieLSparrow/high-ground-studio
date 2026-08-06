# Quipsly obvious-depth feature portfolio

Date: 2026-08-06

Status: current-market research synthesis and implementation recommendation

Companions:

- `2026-08-05-quipsly-feature-depth-program.md`
- `2026-08-05-quipsly-product-expansion-opportunity-audit.md`
- `2026-08-06-quipsly-capability-depth-and-operating-agent.md`

## Executive decision

Quipsly should make one large product swing next: an **Episode and Session
Finishing Cockpit** that carries a retained recording from source recovery
through transcript truth, audio repair, explainable assembly, reviewed outcomes,
and versioned delivery.

This is bigger than a video editor page and narrower than cloning every creator
suite. It joins the strongest systems already in the repository:

- the person, endpoint, capture-group, recording, and upload graph;
- immutable media sources, checksums, clocks, and alignment evidence;
- provider-attributed transcript attempts and corrections;
- audible-event analysis, treatment experiments, mastery review, and delivery
  candidates;
- non-destructive timeline operations and automated edit proposals;
- Session/Episode chat, annotations, decisions, and review history;
- canonical Notes, Goals, Tasks, Calendar work, and tags; and
- the governed action runtime that can explain authority, consequence, result,
  cost, and recovery.

The market is converging on isolated portions of this workflow. Quipsly's
opportunity is to make the transitions disappear while retaining more evidence
and user control than the individual products.

### Operated checkpoint: the first exact-source Episode mix

The Audio Studio now builds an immutable Episode mix proposal from canonical
track-role, participant, mix-use, program-clock, alignment, analysis, and human
review receipts. Only a human-confirmed `mic-bleed` or
`same-participant-redundancy` event with one unambiguous primary may produce
automatic gain automation. Correlation, filenames, confidence, and role guesses
cannot authorize a move.

The first retained dogfood run used a real 4:14.6 iPhone camera recording in the
explicit QA Episode. Two tiny synthetic handoff artifacts and one unqualified
reference source remained preserved but were explicitly excluded. The local
worker rendered a 48 kHz stereo 24-bit WAV, reverified every source before and
after rendering, completely decoded the output, independently measured
`-16.07 LUFS` and `-1.48 dBTP`, registered the exact output hash, and left the
preview unpromoted for deliberate playback.

That operation also exposed a real recoverability defect: PostgreSQL JSONB
reordered safety-boundary keys, while the shared parser incorrectly treated
object insertion order as integrity. The worker failed closed, retained the
failed job receipt, and did not render media. The parser now compares the exact
key/value set independent of serialization order, the regression is covered,
and the next queued proposal completed through the live UI. This advances the
mixing slice to observable and recoverable local operation without claiming a
human listening approval.

## Research question

The question was not, "What other navigation item can Quipsly add?" It was:

> Which large or dramatically deeper capabilities would make a podcast creator,
> coach, researcher, or trainer immediately understand why Quipsly replaces a
> pile of tools?

Each recommendation below is scored against five tests:

1. **Visible value** — does a user understand the improvement in one operated
   journey or demo?
2. **Existing leverage** — does it reuse proven Quipsly source, Session,
   document, work, and action primitives?
3. **Defensibility** — does it become better through retained evidence and
   reviewed decisions rather than through a generic model call?
4. **Workflow compression** — does it remove handoffs, duplicate records, or
   copy/paste drift?
5. **Production path** — can the first serious version preserve truth, recover
   failure, and produce a useful artifact?

## Current market findings

### Retention certainty is part of the recording product

Riverside's recording status deliberately distinguishes Recording, Uploading,
Processing, Ready, and Error. Hosts and producers can see participant upload
progress while recording; a participant can resume an incomplete upload; and a
cloud recording remains available as an immediate reference while local
high-quality tracks finish. That is a user-facing source-recovery protocol, not
just infrastructure.

Quipsly should retain its stronger distinction between realtime conversation,
provider witness, and local production masters, but make the complete source
inventory the first post-session surface. A person should never need to infer
whether closing a laptop or phone is safe.

Primary source:
[Riverside recording status guide](https://support.riverside.com/hc/en-us/articles/5457425335965-Recordings-status-guide).

### Audio automation becomes professional when it reasons across tracks

Auphonic's multitrack system coordinates per-track and whole-program analysis:
leveling, compression, gating, bleed removal, noise/reverb reduction, ducking,
filtering, loudness range, true peak, and several cut modes. Its editor keeps
automatic cut regions adjustable and can apply cuts, fade them to silence, or
export an uncut source plus cut list.

The lesson is not to copy Auphonic settings. Quipsly should make one versioned
speech-production graph where every proposed treatment has an exact source
range, reason, strength, audible comparison, interaction with other tracks,
measured result, and delivery impact.

Primary sources:
[Auphonic multitrack algorithms](https://us1.auphonic.com/help/algorithms/multitrack.html)
and [Auphonic multitrack workflow](https://auphonic.com/help/web/multitrack.html).

### Confidence is evidence, not a universal quality score

Deepgram documents calibrated word confidence while warning that provider
confidence distributions cannot be compared directly and that models can be
confidently wrong on mismatched domains. It recommends evaluating error
detection thresholds on the user's own data. Separate channels and diarization
also answer different questions: channels identify captured signals;
diarization estimates speaker identity within them.

Quipsly's provider lab should therefore measure provider output against retained
reference windows. It should calibrate attention thresholds per provider,
source class, and critical entity type rather than rendering an arbitrary
cross-provider red/yellow/green score.

Primary sources:
[Deepgram word confidence](https://developers.deepgram.com/docs/confidence) and
[Deepgram multichannel versus diarization](https://developers.deepgram.com/docs/multichannel-vs-diarization).

### The strongest editing automation leaves normal editable project state

Premiere's text-based editing keeps transcript timecode synchronized with the
timeline and explicitly expects precise refinement on that timeline. Its 2026
AI Assistant organizes footage and builds an initial assembly inside the normal
project. Generative media arrives as editable clips with prompt/reference
history, regeneration, model and credit visibility, and Content Credentials;
the original source remains unchanged. Premiere's local media intelligence can
return exact visual ranges and cache analysis beside media, although the index
is currently vendor-specific.

This validates Quipsly's append-only edit-operation architecture. Automated
editing should produce an inspectable operation set and optional generated
source artifact, never replace the canonical timeline with an opaque render.

Primary sources:
[Premiere text-based editing](https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/overview-of-text-based-editing.html),
[Premiere AI Assistant](https://helpx.adobe.com/premiere/desktop/premiere-ai-assistant/overview.html),
[Premiere generative media FAQ](https://helpx.adobe.com/premiere/desktop/edit-projects/edit-with-generative-ai/generative-media-tool-faq.html),
and [Premiere media intelligence](https://helpx.adobe.com/premiere/desktop/organize-media/file-organization/media-intelligence-and-search-panel.html).

### Research products win by exposing scope, citations, and reusable artifacts

NotebookLM accepts heterogeneous sources, answers from selected evidence with
inline citations, and derives guides, briefings, maps, and audio artifacts from
the same source set. Notion Research Mode lets the user select workspace,
connected-app, and web scope and exposes the sources used for its report. Zotero
stores annotations separately from source PDFs for conflict-free collaboration
while supporting portable annotated export.

Quipsly should not build another unscoped chat. Its research unit should be a
versioned source set plus exact annotations, claims, contradictions, questions,
and outputs. The same packet should remain navigable from manuscript, Episode,
course, coaching material, and published artifact.

Primary sources:
[NotebookLM overview](https://support.google.com/notebooklm/answer/16164461),
[Notion Research Mode](https://www.notion.com/help/research-mode), and
[Zotero annotation storage](https://www.zotero.org/support/kb/annotations_in_database).

### Work becomes calm when one object appears in many contexts

Trello mirror cards keep one card editable across boards, and permission to the
source card remains authoritative. Trello Planner also distinguishes a task's
due date from scheduled focus time. These are small but important semantics:
projection is not duplication, and deadline is not allocation.

Quipsly already has stronger canonical work and planning models. Its product
opportunity is a first-class **Lens** system: saved, shareable projections of
the same Notes, Tasks, Goals, projects, evidence, Sessions, Episodes, and
outputs—list, board, calendar, timeline, manuscript, client portal, and review
queue—without copying objects.

Primary sources:
[Trello card mirroring](https://support.atlassian.com/trello/docs/mirroring-cards/)
and [Trello Planner](https://support.atlassian.com/trello/docs/trello-planner/).

### Meeting intelligence must preserve context and consent

Notion's meeting notes combine prior agenda/context, explicit consent,
transcription, summary, and action items. The feature requires system-audio and
screen-recording permissions when capturing other applications through the
desktop client. Quipsly can go further because its Session knows participants,
consent, separate local tracks, shared sources, visibility classes, and
canonical follow-through directly.

Primary source:
[Notion AI Meeting Notes](https://www.notion.com/help/ai-meeting-notes).

### Multi-device participation is still an open market gap

Riverside treats uploaded media as a separately recorded track and supports an
iPhone as a second camera, while Descript Rooms explicitly does not support
mobile recording. Riverside also separates a producer's authority from whether
that person becomes a normal recorded participant. The opportunity is not just
feature parity: Quipsly should represent one person, several endpoints, and
several source responsibilities without collapsing them into one misleading
participant tile.

The production contract should support browser conversation through an external
mic and headphones, iPhone local 4K video, a separate camera or backup recorder,
Shared Watch media, and a non-recorded producer/controller. Each endpoint needs
its own requested/actual route, clock, retention, upload, verification, and
`Safe to leave` state while the person remains one collaborator.

Primary sources:
[Riverside Media Board and screen sharing](https://support.riverside.com/hc/en-us/articles/12562433954461-Media-Board-and-screen-sharing-Overview),
[Riverside mobile and Mac capabilities](https://support.riverside.com/hc/en-us/articles/8937011936029-Riverside-mobile-and-Mac-apps-Functions-capabilities),
[Riverside producer role](https://support.riverside.fm/hc/en-us/articles/5252621451805-The-producer-role-Details),
and [Descript Rooms](https://help.descript.com/hc/en-us/articles/28800967976205-Get-Started-with-Descript-Rooms).

### Conversation products are judged by what survives the conversation

Teams keeps agenda, collaborative notes, tasks, transcript, recording, shared
files, and recap together. Granola begins from calendar context, preserves the
user's rough notes, applies reusable output templates, and supports questions
across selected meeting folders. Coaching platforms emphasize action plans,
measures, worksheets, private/shared notes, recurring appointments, and
follow-through reporting—not summaries alone.

Quipsly should make the Session the source of continuity: preparation enters the
conversation; notes and markers remain editable during it; AI creates cited
candidates afterward; coach and client or collaborators explicitly accept what
becomes shared truth; and the same task, goal, measure, or open question appears
in the next Session without being copied.

Primary sources:
[Teams meeting notes](https://support.microsoft.com/en-us/teams/meetings/take-meeting-notes-in-microsoft-teams),
[Teams recap](https://support.microsoft.com/en-US/teams/meetings/recap-in-microsoft-teams),
[Granola 101](https://docs.granola.ai/help-center/getting-started/granola-101),
and [CoachAccountable](https://www.coachaccountable.com/enterprise).

### Later category depth should reuse reviewed structure

Zotero's annotations retain exact return to source context; Trello projects one
work object into several views; StudioBinder derives schedules and call sheets
from script breakdowns; Rise reuses responsive content blocks and separates
authoring from stakeholder review; and Hootsuite couples a content calendar to
approval and publishing state. These products reinforce the same architecture:
courses, storyboards, social campaigns, and research packets should be
projections of reviewed Quipsly sources, structure, work, rights, and outputs,
not parallel stores with fresh copy/paste drift.

Primary sources:
[Zotero PDF annotations](https://www.zotero.org/support/pdf_reader),
[Trello workspace views](https://support.atlassian.com/trello/docs/workspace-views/),
[StudioBinder scheduling](https://www.studiobinder.com/film-scheduling-software/),
[Rise 360 features](https://www.articulate.com/360/rise/all/),
and [Hootsuite publishing](https://www.hootsuite.com/platform/publishing).

## Ranked portfolio

Scores are out of 5. The total is a sequencing aid, not a promise of effort.

| Rank | Capability | Value | Leverage | Defensibility | Compression | Production path | Total |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Episode and Session Finishing Cockpit | 5 | 5 | 5 | 5 | 4 | 24 |
| 2 | Audio Intelligence and Dialogue Master | 5 | 5 | 5 | 4 | 4 | 23 |
| 3 | Transcript Truth and Assembly Director | 5 | 5 | 5 | 4 | 4 | 23 |
| 4 | Multi-device Session Guardian | 5 | 5 | 4 | 5 | 4 | 23 |
| 5 | Evidence Lens and Research Studio | 5 | 4 | 5 | 5 | 4 | 23 |
| 6 | Coaching Continuity and Shared Commitments | 5 | 5 | 4 | 5 | 4 | 23 |
| 7 | Semantic Media Memory | 5 | 4 | 5 | 4 | 3 | 21 |
| 8 | Outcome Compiler and Delivery Graph | 5 | 4 | 4 | 5 | 3 | 21 |
| 9 | Lens Builder for work, knowledge, and production | 4 | 5 | 4 | 5 | 3 | 21 |
| 10 | Course and learning projection | 4 | 4 | 4 | 4 | 3 | 19 |
| 11 | Social package and performance learning | 4 | 3 | 3 | 4 | 2 | 16 |
| 12 | General-purpose automation canvas | 3 | 3 | 2 | 3 | 2 | 13 |

The low ranking for a generic automation canvas does not mean automation is
unimportant. It means the governed action runtime should first execute mature,
named workflows. A blank node graph before those verbs are trustworthy would
make Quipsly harder to understand and support.

## The recommended large swing

### Episode and Session Finishing Cockpit

The cockpit is a workflow state machine projected over existing canonical
objects, not a new super-record. It has five modes with one shared source clock
and one durable activity history.

#### 1. Recover

- Show every expected person and endpoint.
- Distinguish realtime witness, local audio master, local video master, Shared
  Watch source, imported backup, and external camera.
- Show local-only, finalizing, uploading, verifying, ready, superseded, partial,
  failed, and intentionally absent states.
- Expose exact bytes/checksum/generation and a plain-language **Safe to leave**
  decision.
- Resume, replace, or import without changing the identity of prior evidence.

#### 2. Understand

- Align sources and expose opening/later evidence plus uncertainty.
- Project waveform, loudness, spectral, audible-event, silence, overlap,
  speaker, and transcript-confidence layers on one clock.
- Search spoken text, visual concepts, manuscript cues, chat markers, and human
  annotations and return exact ranges.
- Keep provider outputs as attempts and human corrections as separate truth.

#### 3. Repair

- Group issues by cause and interaction rather than presenting a flat plugin
  list.
- Offer conservative and stronger versioned treatment experiments.
- Provide level-matched A/B and short-context/long-context audition.
- Explain which track/range changes, what measurement improves, what may be
  damaged, cost, and recovery.
- Promote only a verified treatment stack or delivery candidate; never mutate
  the immutable source.

#### 4. Assemble

- Present transcript truth edits separately from media decisions.
- Generate a first-cut operation set: keeps, duration-preserving deactivations,
  ripple removals, reaction holds, camera/layout changes, Shared Watch focus,
  chapters, and clip candidates.
- Explain every proposed edit by evidence and show harsh-boundary risk.
- Support approve, adjust, reject, batch policy, compare versions, and
  supersede.
- Keep the dense timeline available without requiring it for every review.

#### 5. Finish

- Review show notes, citations, chapters, titles, captions, accessibility,
  rights, and episode text against exact sources.
- Compile audio, 16:9, 9:16, transcript, coaching recap, and other outputs from
  one reviewed structure.
- Run complete-decode QC and proof-listen coverage.
- Preview destinations, approve delivery, retry/reconcile, withdraw, and retain
  immutable destination receipts.
- Carry accepted Notes, Tasks, Goals, calendar commitments, and open questions
  forward without copying them.

### Why this is a user-visible leap

The striking demo is not "AI edited this." It is:

1. Homer and Charlie stop a hybrid recording.
2. Quipsly explains which high-quality sources are safe and which phone still
   needs to upload.
3. The whole episode opens on one clock with audible defects, transcript
   uncertainty, Shared Watch events, reactions, and manuscript cues visible.
4. Quipsly proposes a mastered dialogue chain and rough cut with reasons.
5. A reviewer auditions or changes only the uncertain/high-impact moments.
6. The accepted result becomes a versioned master, video assembly, show notes,
   clips, tasks, and publishing candidate with source return and receipts.

That journey demonstrates Riverside, Descript, Auphonic, project management,
and collaboration value without asking the user to understand five products.

## Two companion big bets

### Semantic Media Memory

This should index transcript, visual ranges, audio events, manuscript cues,
chat markers, annotations, people/endpoint roles, locations when reviewed, and
publication history. Search results must be exact ranges with source/version
identity, permission-aware snippets, analysis-provider/version provenance, and
the ability to save a query as a dynamic Lens.

Important architecture boundaries:

- embeddings are indexes, never canonical truth;
- a source version invalidates or supersedes its derived index explicitly;
- permission filtering happens before retrieval and again before rendering;
- face/person naming requires reviewed identity, not silent recognition;
- portable annotations and source packets remain useful without the model; and
- a result can become an annotation, claim, edit proposal, clip, or task without
  losing its range.

The first serious proof is: "Find every moment in Season One where Homer reacts
to a clip before speaking, and show the manuscript cue, video range, transcript,
and whether that reaction survived the published cut."

### Evidence Lens and Research Studio

The Research Studio should support saved questions and explicitly selected
source sets; a split reader for web, PDF, book, image, transcript, audio, and
video; annotations outside immutable sources; claim/evidence/contradiction
packets; citation coverage; permission-safe retrieval; and outputs that remain
linked after insertion into a manuscript, course, episode, or coaching packet.

The first serious proof is one High Ground Odyssey segment researched from the
book manuscript, prior episode transcripts, uploaded clips, cited web sources,
and Charlie/Homer annotations. Quipsly should produce a navigable evidence map,
surface unsupported claims and contradictions, and compile a writing packet
without flattening everything into pasted prose.

## Robustness multipliers for every feature

These additions are not paperwork. They are shared product capabilities that
make large swings safer and more supportable.

### Attention budget

Every analysis should report how many minutes or decisions it asks a person to
review. Rank by expected harm, uncertainty, and leverage. "AI found 412 things"
is a failure if it creates four hours of undifferentiated clicking.

### Consequence preview

Before a high-impact action, show exact targets, audience, destinations,
estimated cost, affected outputs, and recovery. Low-impact reversible actions
can proceed under delegated policy and remain visible afterward.

### One activity and recovery view

The governed runtime should project a readable activity stream across provider
jobs, media processing, transcript decisions, edits, work materialization, and
delivery. A support-minded user should be able to answer:

- what did Quipsly try;
- under whose authority;
- against which exact inputs;
- what became true;
- what remains incomplete or held;
- what it cost; and
- how to retry, compensate, supersede, or return to the source.

### Retained challenge journeys

Each flagship system needs at least one podcast, coaching, and failure-oriented
retained journey. Automated metrics do not substitute for operating the actual
UI against real media and separate accounts.

### Progressive disclosure

Every system needs a calm answer first and expert evidence on demand. Audio can
say "mouth-click risk at 12:43; audition" while retaining waveform, spectrum,
detector version, confidence, source range, treatment measurements, and receipt.

## Sequencing recommendation

### Now: make the finishing spine operable

1. Build the post-session source-recovery inventory and Safe to leave contract
   as the cockpit entry.
2. Project the existing transcript, audible-event, mastery, alignment, and edit
   ledgers onto one episode/session clock.
3. Add a single attention queue that sorts transcript, audio, source, and edit
   holds by consequence and review time.
4. Operate Episode 9 from retained sources through a reviewed audio master and
   reversible rough-cut operation set.

### Next: make it obviously intelligent

1. Add multitrack relationship analysis: overlap, bleed, active speaker,
   relative loudness, and ducking proposals.
2. Add calibrated transcript-provider comparison and critical-entity review.
3. Add explainable camera/layout proposals and Shared Watch reaction-aware cuts.
4. Add semantic media search returning exact ranges and saved Lenses.

### Then: turn the same source graph into businesses

1. Complete coaching continuity, jointly reviewed commitments, next-session
   briefing, and separately governed client delivery.
2. Complete Evidence Lens and Research Studio.
3. Compile course lessons, worksheets, assessments, storyboards, social
   packages, and destination variants from reviewed source/output definitions.
4. Add performance receipts so later planning can learn from published outcomes
   without rewriting historical creative decisions.

## Things not to build yet

- another generic chatbot disconnected from exact sources and actions;
- another duplicated board/task model;
- a universal block editor that erases the different semantics of timeline,
  manuscript, research reader, course, and coaching views;
- one-click destructive audio enhancement with no A/B or measurement;
- opaque auto-edit renders with no operation history;
- a general automation canvas before named workflows and governed verbs are
  mature; or
- broad social/LMS navigation whose underlying output, rights, delivery, and
  review contracts are still shallow.

## Acceptance definition for the next research-to-build transition

Research is complete enough to build when one retained Episode can answer all
of these in the rendered product:

- Which expected sources exist, where are the authoritative bytes, and is it
  safe for every endpoint to leave?
- Are sources aligned, and what evidence and uncertainty support placement?
- Which transcript, audio, and edit moments deserve attention first, and why?
- What does each proposed repair or edit change, and can it be auditioned,
  adjusted, rejected, or superseded?
- Which exact version is the current audio/video/output candidate?
- What was accepted into Notes, Tasks, Goals, Calendar, or delivery, by whom,
  for which audience, and from which source?
- Can a collaborator or support operator reopen the exact source, action,
  receipt, failure, cost, and recovery path?

That is the boundary between impressive scaffolding and an obviously premium
product.
