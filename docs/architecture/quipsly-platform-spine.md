# Quipsly Platform Spine

Status: current architecture direction as of 2026-08-03

## Product promise

Quipsly is a calm home for people who need to turn evidence and ideas into
useful work without carrying the systems anxiety of a dozen disconnected
tools. The first people we are designing around are researchers, trainers,
coaches, and content creators.

The goal is not to place small copies of Riverside, Descript, Notion, Trello,
Teams, Canvas, Scrivener, Canva, Rise, Hootsuite, and StudioBinder beside each
other. The goal is to remove the reconciliation work those products create.

## One body of truth, many useful projections

Quipsly should preserve a small set of durable facts:

- people, organizations, Nests, roles, and grants;
- sources, annotations, citations, and research provenance;
- documents, blocks, revisions, comments, and decisions;
- projects, goals, tasks, plans, schedules, and explicit progress receipts;
- Sessions, consent, local recordings, uploaded assets, transcripts, and
  immutable time anchors;
- episode and course structures, timelines, review states, and publications;
- messages, notifications, deliveries, and provider-sync receipts.

Capture, Nest, Studio, Calendar, a course builder, a social desk, and public
sites are projections and operating surfaces over those facts. They may adapt
language and interaction density to the job and device. They must not quietly
fork identity, ownership, status, or provenance.

## The shared workflow graph

Most Quipsly journeys should compose the same graph:

```text
source/evidence -> annotation -> decision -> canonical work
                                    |
                                    +-> document / plan / timeline
                                    +-> review receipt
                                    +-> explicit delivery or publication
```

Examples:

- A recording becomes an immutable media source, then a transcript, reviewed
  notes, tasks, goals, clips, an edit timeline, and an episode publication.
- A coaching Session becomes consented media, transcript evidence, a private
  recap, deliberate commitments, editable follow-through, and a next-Session
  continuity brief.
- Research becomes preserved source evidence, annotations, citation-backed
  writing, a course or episode structure, and later an approved publication.

This is the competitive advantage: a transcript sentence, source passage,
task, goal, scene, course lesson, and social excerpt can retain their exact
relationships instead of being copied into unrelated databases.

## Rules for large development swings

Large slices are encouraged when they deepen the platform rather than create a
parallel prototype. A production-quality slice should normally include:

1. A named canonical owner for every fact.
2. An explicit authorization boundary at the mutation point.
3. Stable request identity and idempotent replay for ambiguous delivery.
4. Optimistic concurrency or an equally explicit conflict policy.
5. Protected local intent when a mobile action must survive offline or process
   death.
6. Provenance and append-only receipts for important human decisions.
7. Honest separation between app state and external provider effects.
8. A real operated journey through the compiled or rendered product.
9. Independent readback at the durable boundary.
10. Documentation of the invariant created and the capability unlocked.

Code volume is not the goal. A large change is valuable when it removes
several future one-off implementations by establishing a reusable kernel.

## Schema evolution

The schema is allowed to evolve when the current model prevents a coherent
product. We should not preserve accidental early-agent structure out of fear.
Schema changes must still be professional:

- identify canonical ownership and privacy scope;
- prefer additive changes before destructive cleanup;
- supply migration, backfill, verification, and rollback plans;
- preserve immutable source evidence and stable external identities;
- exercise changes against disposable/local data before production;
- take and verify a recoverable production backup before a destructive step;
- prove old and new clients fail safely during a rolling release.

## Surface responsibilities

### Quipsly Capture

The fastest trustworthy place to capture audio/video, join audio rooms, watch
shared clips, mark moments, add notes/tasks/goals, review follow-through, and
protect intent when connectivity fails. It should stay focused enough to use
under pressure.

### Quipsly Nest

The shared operating home: Today, Inbox, Work, Sessions, Library, Calendar,
projects, tags, writing, research, collaboration, coaching, and learning. Nest
owns team context and cross-workflow navigation.

### Quipsly Studio

The high-density creation surface for transcript, manuscript, timeline,
storyboard, course, asset, and publication work. It preserves source media and
makes machine suggestions reversible and reviewable.

### Provider adapters

Google Calendar, iCalendar, LiveKit, storage, transcription, hosting, social,
email, and publishing providers are adapters. Their receipts are evidence;
they do not become the canonical Quipsly model.

## Near-term sequence

1. Integrate and distribute the accumulated Capture/Nest release with real
   physical-device rehearsal evidence.
2. Complete the media spine: local multitrack capture, durable upload, clip
   co-watching, clock/sync ledger, assembled playback, and editor handoff.
3. Complete the knowledge/work spine: sources, annotations, documents,
   projects, tags, goals, tasks, plans, calendar, and collaboration.
4. Complete the coaching vertical: scheduling, consent, recording,
   transcription, reviewed recap, shared commitments, and continuity.
5. Project the same kernels into courses, storyboards, social campaigns, and
   publication workflows rather than building isolated tools.

Every stage keeps release hardening, cost control, accessibility, security,
and documentation inside the work rather than postponing them to the end.
