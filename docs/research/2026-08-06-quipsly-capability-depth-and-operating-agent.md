# Quipsly capability depth and operating-agent research

Date: 2026-08-06

Status: product and architecture decision record

Companions:

- `2026-08-05-quipsly-product-expansion-opportunity-audit.md`
- `2026-08-05-quipsly-feature-depth-program.md`

## Decision in one sentence

Quipsly should deepen six connected product systems and add one shared,
permission-aware operating-agent runtime; it should not add another chatbot,
another generic board, or a collection of shallow competitor clones.

## Why this research pass exists

Quipsly now has broad product coverage and several unusually mature trust
boundaries, but breadth alone does not make a feature feel powerful. A feature
feels rich when it understands the user's whole job, exposes the evidence and
consequence of every important operation, handles failure, and carries the
result into the next workflow without copy/paste.

The research question is therefore not, "What pages do Riverside, Descript,
Notion, Trello, NotebookLM, and Auphonic have?" It is:

> Where can Quipsly combine recording truth, source evidence, creative
> structure, canonical work, and governed automation in a way that is
> obviously more useful than moving among those products?

## Current market signals

The strongest current products are moving in four directions at once.

1. **Recording certainty is becoming a control plane.** Riverside separates
   producer authority from recorded participation, treats shared media as a
   source, exposes participant upload completion, and supports a phone as a
   separate camera endpoint. Its mobile camera still cannot switch front and
   rear cameras during a recording, leaving meaningful room for Quipsly's
   segmented, source-clock-safe companion-camera workflow.
2. **Creative automation is becoming editable rather than magical.** Descript
   Underlord and Automatic Multicam can create substantial edits, but the
   result remains normal editable project state. Descript also exposes an MCP
   and API surface for import, transcription, Underlord jobs, project creation,
   composition targeting, and web publishing.
3. **Knowledge products are becoming operating agents.** Notion Custom Agents
   have independent permissions, explicit configuration, administrative
   visibility, and security checks. Research Mode selects workspace,
   connected-app, and web sources rather than treating all context as one
   unbounded prompt.
4. **Professional speech tools are becoming analysis families.** Auphonic's
   multitrack workflow coordinates leveling, gating, bleed removal, noise and
   reverb reduction, ducking, filtering, loudness, true peak, and cutting.
   Studio Voice additionally reconstructs damaged speech. This supports
   Quipsly's decision to build one evidence/review kernel for many detectors and
   treatments instead of multiplying unrelated Enhance buttons.

Other useful signals reinforce the same architecture:

- NotebookLM makes sources selectable, keeps answers navigable to citations,
  and derives many artifacts from the same evidence set.
- Zotero stores annotations independently from source files so collaboration
  and syncing do not rewrite originals.
- Trello mirror cards preserve one work item across contexts, while Planner
  distinguishes a task due date from calendar focus time.
- Linear makes project and initiative updates structured work rather than
  ephemeral status prose.

Quipsly does not need to imitate each surface. It needs the shared substrate
that makes all of these workflows coherent.

## What the repository already proves

Quipsly's existing architecture is not a blank slate.

- Immutable media sources, source generations, hashes, capture clocks,
  provider attempts, transcript evidence, and append-only review receipts
  already support serious recording and post-production work.
- The document kernel has stable blocks, operations, assistant proposals,
  source excerpts, stale-source refusal, advisory transaction locks, explicit
  apply and undo operations, and durable status ledgers.
- Sessions, coaching engagements, episodes, goals, tasks, calendar events,
  tags, chats, notes, and outputs already exist as domain concepts.
- Audio Studio now has one source-bound detector-analysis and human-truth
  system shared by podcast and coaching workflows.

There are also three legacy automation concepts that must not become three
future platforms:

1. `AgentNode` and `AgentTask` represent machine workers and a generic queue.
2. `QuipslyAgent` is an unscoped designation/status record with no durable
   authority or consequence model.
3. `StudioAssistantSession`, `StudioAssistantAction`, and
   `StudioAssistantLedger` implement a real project-scoped proposal and
   reversible writing workflow.

The generic `/agents` prototype is correctly retired at its API boundary. The
writing assistant path is the valuable seed. It should become a domain-neutral
action runtime while worker scheduling remains a separate infrastructure
concern.

## Four platform primitives to deepen once

### 1. Source and evidence graph

This graph answers: what is the source, which exact version or time span
supports this claim, who may see it, and what interpretation has a human
accepted?

It should unify:

- media, transcript, document, web, book, image, and imported-file sources;
- stable media ranges and document anchors;
- human annotations, corrections, classifications, and contradictions;
- citation navigation and portable evidence packets;
- provider outputs as attributed attempts rather than truth; and
- visibility inherited from the exact source and relationship.

### 2. Session and endpoint graph

This graph answers: who is participating, which devices perform which roles,
what is being retained, what remains at risk, and when is it safe to leave?

It should distinguish:

- person from browser, iPhone, camera, microphone, and backup endpoint;
- realtime conversation tracks from local production masters;
- Shared Watch sources from screen-share pixels;
- live readiness from retained-source and upload completeness; and
- episode, coaching, interview, and working-session projections over one
  Session kernel.

### 3. Canonical work and outcome graph

This graph answers: what needs to happen, why, for whom, by when, where it is
being focused, and what evidence shows progress or completion?

It should keep one identity across:

- Today, inbox, list, board, project, Session, episode, coaching, goal, and
  calendar projections;
- due dates, focus blocks, dependencies, commitments, and reminders;
- private, shared, client-visible, team, and public visibility; and
- source-backed decisions, accepted action items, goal evidence, and delivered
  outputs.

### 4. Governed action runtime

This runtime answers: what is Quipsly trying to do, under whose authority, with
which inputs, cost, consequence, evidence, progress, and recovery path?

It should be the one execution substrate for assistants, workflow automation,
external API clients, future MCP tools, and scheduled agents. Media workers and
provider jobs can continue using specialized queues, but every user-visible
operation should project into this runtime.

## The six product systems to make obviously deeper

### 1. Session Control Plane

**Promise:** Quipsly prevents bad recordings, preserves the best available
sources, and makes a hybrid laptop/phone/camera Session calm.

Depth additions:

- private record-and-playback sound check with exact input/output readback;
- one person with multiple labeled endpoints and explicit responsibilities;
- producer mode without accidental recorded participation;
- iPhone companion-camera mode with camera-switch segments, thermal/storage
  budgets, and laptop-visible retention state;
- Shared Watch transport, access, observed playback state, reaction markers,
  and independent source-clock alignment;
- Session Guardian interventions for clipping, silence, route loss, storage,
  pressure, clock health, and stalled retention;
- post-session source inventory with failed, local-only, uploading, retained,
  transcript-ready, and editor-ready states; and
- `safe to leave` based on finalization evidence, not call disconnection.

Smallest serious proof: one real High Ground Odyssey episode with browser/MV7i,
browser conversation for Homer, iPhone 4K companion capture, Shared Watch,
deliberate network loss, resumed upload, and complete editor inventory.

Primary metrics: prevented-loss incidents, retained-source completeness,
time-to-record-ready, false Guardian interventions, upload recovery rate, and
time from Session end to editor readiness.

### 2. Audio Intelligence and Mastery Graph

**Promise:** Quipsly shows what is audible, what is wrong, why a treatment is
proposed, what it changes, and whether the delivery file is actually good.

Depth additions:

- one searchable sound map for speech, laughter, music, silence, clipping,
  plosives, mouth events, hum, noise, reverb, bleed, overlap, and dropouts;
- retained detector corpus and per-class qualification scorecards;
- multitrack relationships, active-speaker evidence, bleed and overlap maps,
  ducking, leveling, and speaker/setup profiles;
- conservative and stronger repair variants with matched-level A/B;
- adaptive voice-chain proposals learned from reviewed sessions without silent
  automatic application;
- delivery profiles, complete-decode verification, loudness/true-peak checks,
  and proof-listen coverage; and
- plain-language status with expert wave, spectral, detector, treatment, and
  receipt detail available on demand.

Smallest serious proof: one real two-person episode with a reviewed defect
corpus, complete multitrack proposal, independent QC, human A/B decisions, and
a destination-ready master.

Primary metrics: detector precision/recall and false positives per hour,
boundary error, human preference, correction effort, loudness compliance,
artifact hold rate, and proof-listen coverage.

### 3. Transcript and Explainable Assembly Director

**Promise:** Correct what was said, edit what should remain, and assemble a
strong first cut without confusing transcript truth with media mutation.

Depth additions:

- one attention queue for low confidence, speaker ambiguity, overlap, gaps,
  named entities, provider disagreement, timing anomalies, and cut candidates;
- explicit verbs for correction, speaker change, timing repair, text hiding,
  duration-preserving deactivation, ripple removal, and restoration;
- provider evaluation by retained podcast and coaching reference windows;
- editable multicam operations explained by active speaker, reaction hold,
  overlap, Shared Watch, manuscript cue, source quality, or human rule;
- harsh-cut risk and audible-boundary review before edit acceptance;
- chapters, clips, shorts, show notes, titles, and social candidates as linked
  outputs over one source clock; and
- a style profile that is inspectable and versioned rather than a hidden model
  memory.

Smallest serious proof: recreate a substantial Episode 9 section as reversible
transcript and camera operations, then measure human changes against a manual
baseline.

Primary metrics: word and speaker error, timestamp error, uncertainty recall,
bad-cut rate, missed-reaction rate, first-cut acceptance, and time to final.

### 4. Evidence Lens and Research Studio

**Promise:** Collect anything, understand why it matters, navigate every claim
to exact evidence, and turn research into structured writing without losing
source identity.

Depth additions:

- browser/share/file intake with immutable snapshots and source-version
  history;
- split source reader with exact annotations for web, PDF, book, transcript,
  image, and media ranges;
- claim/evidence/contradiction packets with permission-aware retrieval;
- citation coverage and one-click navigation to the supporting span;
- selectable research scope rather than invisible retrieval;
- saved research questions, comparison tables, evidence gaps, and review
  status; and
- portable research packets plus binder, outliner, corkboard, and compile
  projections over the existing document kernel.

Smallest serious proof: research and write one High Ground Odyssey segment
inside Quipsly from mixed web, book, transcript, and note sources, then export a
portable cited packet.

Primary metrics: citation coverage, unsupported-claim rate, retrieval recall,
permission-filter correctness, contradiction discovery, and research-to-draft
time.

### 5. Conversation Memory and Coaching OS

**Promise:** A Session becomes the correct kind of useful memory and
follow-through without flattening private coaching, editorial collaboration,
and ordinary meetings into one generic summary.

Depth additions:

- recap templates as projections over one transcript and evidence graph;
- explicit coach-private, client-private, shared, team, and public material;
- decisions, commitments, insights, risks, questions, and task candidates with
  source spans;
- fast acceptance into canonical tasks, goals, calendar focus, episode
  production, or writing;
- recurring engagement memory that carries open loops and progress forward;
- editable shared recap and client portal with clear visibility previews; and
- comparison of generated recaps against reviewed human reference sessions.

Smallest serious proof: one consented coaching Session where private notes stay
private, shared commitments are jointly edited, accepted work appears in Today
and Calendar, and the next Session opens with source-backed continuity.

Primary metrics: privacy violations, accepted-action precision/recall,
duplicate-work rate, commitment completion, recap correction effort, and
continuity usefulness.

### 6. Outcome Compiler and Distribution

**Promise:** Reviewed knowledge and creative structure can become many outputs
without becoming many drifting copies.

Depth additions:

- versioned output definitions and capability manifests;
- explicit impact sets when a source decision changes;
- episode, article, coaching packet, course lesson, short, social package, and
  archive projections from reviewed structure;
- destination preview, approval, delivery, retry, reconciliation, withdrawal,
  and analytics receipts;
- accessibility and rights checks tied to the exact output version; and
- format-specific editing surfaces instead of lowest-common-denominator
  universal templates.

Smallest serious proof: generate two meaningfully different outputs from one
reviewed source graph, change one source decision, and present a correct
reviewable impact set before either output updates.

Primary metrics: output reuse, drift incidents, correction effort, delivery
success, accessibility holds, rights holds, and time from reviewed source to
published artifact.

## Quipsly Operating Agent

### Product behavior

The operating agent is not a persona floating above the product. It is a
visible, bounded operator working through Quipsly's domain actions.

It may:

- research and assemble cited evidence;
- prepare Session rooms and diagnose readiness;
- propose transcript, audio, camera, writing, work, and output operations;
- execute reversible low-consequence actions within delegated policy;
- monitor long operations and recover or reconcile expected failures;
- schedule follow-up work and report what remains blocked; and
- expose the same governed operations through Quipsly UI, API, and MCP.

It may not silently:

- change reference transcript truth;
- mutate immutable sources;
- expand its own access;
- expose private source content through a less restrictive output;
- consent for another person;
- make a client-visible commitment outside delegated policy;
- publish publicly, spend beyond budget, or destroy canonical work without the
  configured authority and consequence gate.

Those are consequence boundaries, not a rule that a human must click every
step. A user can delegate classes of reversible actions and retain complete
visibility and rollback.

### Canonical runtime concepts

The implementation should converge on these concepts rather than preserving
the current prototype model names as the public contract.

| Concept | Required meaning |
| --- | --- |
| Agent principal | Separate identity for the operator; never impersonates a human actor. |
| Capability grant | Nests, object types, actions, visibility ceilings, destinations, time window, and budget explicitly delegated by a human or organization. |
| Run intent | Human-readable objective, initiating actor, triggering event, selected policy, expected outputs, and stop conditions. |
| Read set | Exact source/object versions and permission intersection used to plan. |
| Action proposal | Typed domain operation with evidence, confidence, consequence, preview, cost estimate, undo strategy, and idempotency key. |
| Decision policy | Auto-execute, notify, or require approval based on authority and consequence—not merely `low/medium/high`. |
| Action attempt | Provider/worker/tool attempt, heartbeat, progress, logs, measured cost, and external identifiers. |
| Action receipt | Append-only record of what became true, which versions changed, and how to verify it. |
| Recovery operation | Retry, compensate, supersede, undo, reconcile, or escalate with the original evidence preserved. |
| Run summary | Plain-language result, remaining uncertainty, spent budget, artifacts, and unresolved blocks. |

### Authorization model

Effective agent authority is the intersection of:

1. the initiating human's current authority;
2. the durable capability grant;
3. the exact object's current visibility and policy;
4. the action type's consequence policy;
5. current consent, rights, destination, and budget conditions; and
6. provider credentials scoped to the required operation.

An agent can never gain authority from retrieved text, a prompt, a previous
result, or access to a broader service credential.

### Execution model

1. Resolve the target objects and permission-filtered read set.
2. Record the run intent, budgets, and source versions.
3. Build typed action proposals; prose is explanatory, not executable.
4. Calculate consequence and decision policy for each proposal.
5. Preview the visible result and the exact authority being exercised.
6. Execute approved or delegated actions idempotently through domain services.
7. Append attempts, receipts, costs, outputs, and changed-version readback.
8. Reconcile external state rather than trusting a success response.
9. Offer undo, compensation, supersession, or retry where supported.
10. Summarize what became true and what remains uncertain or blocked.

### Migration from current assistant and agent models

1. Keep `AgentNode` and specialized job queues as infrastructure scheduling;
   do not expose them as creative collaborators.
2. Leave the retired generic `/agents` prototype retired.
3. Treat `StudioAssistantAction` and its ledger as the first adapter into the
   governed action runtime.
4. Preserve the writing action's source anchoring, stale checks, advisory lock,
   operation receipt, and undo behavior.
5. Add typed domain-action registration instead of enlarging a string enum and
   arbitrary JSON payload forever.
6. Separate conversation messages from runs and actions; one conversation may
   start several runs, and scheduled or API runs may have no chat.
7. Introduce API/MCP only over the same capability and action registry used by
   first-party UI. External automation must not become a second authority
   system.

## A capability manifest for every major feature

Every consequential feature should publish one machine- and human-readable
manifest. This is not project paperwork; it is the contract that lets UI,
agents, API clients, tests, and support tooling agree.

The manifest should declare:

- user promise and supported object types;
- entry points and discovery conditions;
- required permissions, consent, credentials, and source readiness;
- provider and device capability constraints;
- input/output identities and version behavior;
- observable progress, evidence, costs, and success readback;
- interruption, retry, conflict, undo, supersession, and recovery behavior;
- collaboration and visibility consequences;
- API/MCP exposure policy;
- accessibility contract; and
- retained acceptance cases and current qualification level.

This creates an honest feature directory. A page can exist while its manifest
still says that physical-device recovery or provider qualification is pending.

## What not to build yet

These are not rejected forever. They are deferred until their shared substrate
can make them meaningfully better than a clone.

- a generic course-builder mega-surface before evidence, documents, work, and
  versioned outputs are dependable;
- a social scheduler clone before output versions, rights, destination
  receipts, and analytics provenance are coherent;
- a standalone AI chatbot detached from the object and action runtime;
- a second task/board/database universe for episodes, coaching, or agents;
- an autonomous video renderer whose decisions are not ordinary reversible
  source-clock operations;
- a universal template engine that flattens the important differences among
  episode, coaching, research, writing, course, and publishing workflows; or
- broad third-party API/MCP mutation before capability grants and action
  receipts protect the same boundaries as first-party UI.

## Recommended sequence

### Now: finish the confidence loop around real recording

Advance the Session lobby/sound-check, person-device topology, Shared Watch,
Guardian, source inventory, and safe-to-leave workflow. This is the shortest
path to protecting real work and supplies the person, endpoint, source, clock,
and action evidence required by later automation.

### In parallel: deepen the shared audio/transcript corpus

Continue labeling real podcast and coaching windows, qualify detectors and
transcription providers, and make every repair or edit proposal measurable.
This creates the evidence base for automated assembly and adaptive voice
chains.

### Next platform slice: action-runtime foundation

Extract the proven writing-assistant action lifecycle into a typed,
project-scoped runtime. The first non-writing operation should be a Session
preflight action because it is reversible, observable, immediately useful, and
crosses device/provider boundaries without mutating source truth.

Implementation checkpoint, 2026-08-06: the first slice now exists. A shared
capability manifest, `GovernedActionRun`, typed actions, numbered attempts, and
immutable receipts adapt the current writing lifecycle and Session preflight.
The retained local writing and two-collaborator Session operations pass. This
does not yet qualify delegated/scheduled principals, a central action console,
portable action export, physical iPhone operation, or production execution.
Evidence and current limitations are in
`docs/coordination/2026-08-06-governed-action-runtime-foundation.md`.

### Then: Evidence Lens and conversation-to-work

Build selectable, permission-safe research scope and accepted source-backed
work. These unlock the user's researcher, trainer, coach, and creator vision
without multiplying truth.

Implementation checkpoint, 2026-08-06: the first conversation-to-work adapter
now exists. Direct and reviewed-packet ACCEPT paths for transcript-derived Goals
and Tasks commit the canonical object and one typed governed action receipt
atomically. Exact source evidence, current authority, target ID, consequence
boundaries, and replay identity stay connected; historical work receives no
fabricated runtime history. MERGE, Notes, and client-visible follow-up remain
the next adapters. Evidence and current limitations are in
`docs/coordination/2026-08-06-governed-conversation-to-work.md`.

### Then: explainable assembly and Outcome Compiler

Once source clocks, transcripts, proposals, and reviewed work are dependable,
generate large editable assemblies and versioned output families. This is
where Quipsly can take the most ambitious creative swings without creating an
opaque or unrecoverable product.

## Sources

- [Riverside producer role](https://support.riverside.fm/hc/en-us/articles/5252621451805-The-producer-role-Details)
- [Riverside mobile device as a second camera](https://support.riverside.fm/hc/en-us/articles/5767459419549-Use-mobile-device-as-second-camera-multicam-mode)
- [Riverside mobile camera switching](https://support.riverside.fm/hc/en-us/articles/5592788169373-Can-I-use-the-front-facing-or-rear-facing-camera-on-my-mobile-device)
- [Riverside 4K overview](https://support.riverside.fm/hc/en-us/articles/5588601739165-Recording-4K-Overview)
- [Riverside upload completion](https://support.riverside.fm/hc/en-us/articles/5287442440093-Confirm-that-participants-tracks-are-uploading)
- [Descript Underlord](https://help.descript.com/hc/en-us/articles/36803785502221-Underlord-beta-Your-AI-co-editor-in-Descript)
- [Descript Automatic Multicam](https://help.descript.com/hc/en-us/articles/28736507904525-Automatic-multicam)
- [Descript MCP](https://help.descript.com/hc/en-us/articles/46056322186509-Descript-MCP-overview)
- [Notion Research Mode](https://www.notion.com/help/research-mode)
- [Notion AI Meeting Notes](https://www.notion.com/help/ai-meeting-notes)
- [Notion Custom Agents](https://www.notion.com/help/custom-agents)
- [Notion Custom Agent security](https://www.notion.com/help/custom-agents-security-features)
- [Auphonic multitrack algorithms](https://us1.auphonic.com/help/algorithms/multitrack.html)
- [Auphonic multitrack workflow](https://us1.auphonic.com/help/web/multitrack.html)
- [NotebookLM answers and citations](https://support.google.com/notebooklm/answer/16164461?hl=en)
- [NotebookLM source selection](https://support.google.com/notebooklm/answer/16179559?hl=en)
- [NotebookLM artifact generation](https://support.google.com/notebooklm/answer/16206563?hl=en)
- [Zotero annotation storage](https://www.zotero.org/support/kb/annotations_in_database)
- [Trello mirror cards](https://support.atlassian.com/trello/docs/mirroring-cards/)
- [Trello Planner](https://support.atlassian.com/trello/docs/trello-planner/)
- [Linear project and initiative updates](https://linear.app/docs/initiative-and-project-updates)
