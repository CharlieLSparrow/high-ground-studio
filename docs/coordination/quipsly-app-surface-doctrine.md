# Quipsly app surface doctrine

Date: 2026-06-14
Owner: Codex / Product Owner lane
Status: Product architecture correction

## Purpose

This document corrects an overly narrow framing:

Quipsly is not "the web app plus the Mac app plus the iPhone app plus the iPad app."

Quipsly is a shared creative operating system with many surfaces.

Those surfaces may include multiple Mac apps, multiple iPhone apps, multiple iPad apps, web apps, browser extensions, local engines, menu bar tools, and future app-specific companions.

The product should be organized around user jobs and capability surfaces, not a rigid one-app-per-platform map.

## Gospel

1. macOS and iOS experiences should be full native when we build them seriously.
2. "Full native" means real native Apple UX, system integration, local files, media APIs, background behavior, keyboard/touch gestures, and platform-appropriate performance.
3. "Full native" does not mean every screen must be rewritten at once before we ship anything.
4. Web views are acceptable as transitional bridges or for web-owned admin/account/publishing views, but they are not the long-term answer for serious native workbenches.
5. Multiple apps per platform are allowed.
6. Features should not be artificially withheld from a platform because of an old app map.
7. A capability can appear in many apps at different depth levels: capture, review, edit, produce, publish, administer.
8. Nest/web remains the shared truth layer, but native apps can own deep workflows and sync back to that truth.

## Better question

Do not ask first:

- Is this web, Mac, iPad, or phone?

Ask first:

- What job is the human trying to do?
- What truth does this workflow create or modify?
- What device capabilities make it easier?
- What is the minimum useful version on each surface?
- What is the full-power version?
- What must sync back to Nest?
- What must work offline or locally?
- What must be keyboard-first, touch-first, camera-first, or file-system-first?

## Capability surfaces

### Capture

Job:

Get thoughts, voice, photos, videos, links, quotes, screenshots, files, and observations into Quipsly before they disappear.

Possible surfaces:

- iPhone quick capture app
- iPhone share extension
- iPhone lock screen/widget/shortcut
- Mac menu bar capture
- Mac global hotkey
- Browser extension
- Web capture button
- Nest chat drop
- Email-to-Quipsly

Depth by surface:

- iPhone: fastest capture, voice/photo/video first.
- Mac: keyboard capture, file drop, screenshot/link capture.
- Web: capture into current Nest/document.
- Browser extension: source-aware research capture.

### Writing and study

Job:

Create, read, annotate, tag, structure, and revise text while preserving source context and authorship.

This includes human-authored, agent-authored, and mixed-authorship work. Quipsly should not bottleneck the workflow by requiring a human to supply every usable paragraph before the system can be tested or used. The surface must instead preserve provenance, review state, canon state, and source context so serious agent-created drafts can be inspected and revised like any other creative material.

Agent-authored work should be treated as real creative material when it is created with publishable intent. It may be replaced, rejected, or rewritten later, but it should not be architecturally downgraded to filler. The writing/study surface must support visible authorship, source context, review notes, and canon state for human, agent, and mixed work.

Possible surfaces:

- Nest web editor
- Native Mac writing/study app
- Native iPad reading/annotation app
- iPhone review/capture companion

Depth by surface:

- Web: collaboration, account truth, accessible editor.
- Mac: serious writing, local files, keyboard power, multiple windows.
- iPad: reading, Pencil annotation, visual organization.
- iPhone: quick notes, reading/review, capture, comments.

### Media ingestion and tagging

Job:

Bring in media, generate proxies, tag useful moments, attach assets to Nests, and prepare them for production.

Possible surfaces:

- Mac Studio
- iPhone field tagging app
- iPad media review app
- Nest media vault
- Local engine/helper

Depth by surface:

- Mac: heavy file import, proxy generation, external drives, batch processing.
- iPhone: capture and quick tagging.
- iPad: visual review and tagging.
- Web: asset truth, sharing, readiness, metadata.

### Video and audio production

Job:

Edit episodes, sync audio/video, choose cameras, apply edit decisions, create 16:9 and 9:16 outputs, export.

Possible surfaces:

- Native Mac Quipsly Studio
- Native iPad review/light-edit companion
- Nest web review/publishing handoff
- Local engine/export worker

Depth by surface:

- Mac: full professional editor.
- iPad: review, selects, annotations, rough decisions, touch editing where useful.
- Web: review, collaboration, publishing state, lightweight preview.
- iPhone: capture and notes, not heavy editing by default.

### Recording and calls

Job:

Make recording a call/session as easy as making a phone call while producing high-quality usable tracks and transcripts.

Possible surfaces:

- iPhone call/record app
- Mac call/record app
- Web room fallback
- iPad session app

Depth by surface:

- iPhone: must be bulletproof for participant recording.
- Mac: host/producer mode, local backup, monitoring.
- Web: lowest-friction invite/fallback.
- iPad: coaching/session review and facilitation.

### Coaching

Job:

Prepare, run, capture, summarize, follow up, and repurpose coaching sessions.

Possible surfaces:

- Nest coaching workspace
- iPad coaching/facilitation app
- iPhone session capture
- Mac session management
- Web client portal

Depth by surface:

- Web: client/session records, shared resources, follow-ups.
- iPad: live session notes, exercises, visual facilitation.
- iPhone: quick capture and mobile session notes.
- Mac: deep prep, transcript review, content repurposing.

### Marketing and publishing

Job:

Turn one source idea into platform-specific outputs, publish them, and learn what worked.

Quipsly agents may help produce drafts, metadata, captions, episode notes, social copy, article copy, and publication packets as real first-pass creative operators. Publishing surfaces must distinguish draft, reviewed, scheduled, published, and receipt-proved states rather than relying on who wrote the first version.

The publishing surface should welcome agent-created packets as serious candidates while blocking fake finality. A packet written by Codex can be ready for review; it is not published until a destination workflow creates a receipt. A post drafted by a Quipsly can be useful; it is not canon unless accepted into the project state.

Possible surfaces:

- Nest publishing desk
- Mac production/export tools
- iPad campaign review
- iPhone approval/quick post companion

Depth by surface:

- Web: truth, schedule, integrations, approvals, analytics.
- Mac: asset production/export.
- iPad: review and campaign planning.
- iPhone: approve, capture, quick reactions.

### Research / ML / annotation

Job:

Ingest datasets, annotate examples, preserve provenance, review uncertainty, and prepare model-ready data.

Possible surfaces:

- Mac Vision Lab
- Nest research workspace
- iPad annotation/review app
- iPhone field capture/tagging app

Depth by surface:

- Mac: local datasets, heavy image/video processing, model management.
- Web: collaboration, dataset records, permissions.
- iPad: visual annotation and review.
- iPhone: field capture and quick labels.

## Native Apple commitment

When a Mac, iPhone, or iPad Quipsly app becomes a real product surface, it should be native.

Native means:

- Swift / SwiftUI / AppKit / UIKit as appropriate;
- real keyboard shortcuts and menus on Mac;
- real touch/Pencil gestures on iPad;
- real camera/mic/file/background integration on iPhone;
- system share sheets and extensions where useful;
- local storage and sync designed intentionally;
- platform-specific affordances instead of stretched web layouts.

Native does not mean:

- rebuilding every Nest admin page immediately;
- refusing a web bridge during transition;
- copying the same layout to every device;
- one monolithic app that contains every tool;
- cutting off a user from a workflow because "that belongs to another app."

## App family candidates

These names are WIP.

### Quipsly Nest

Shared web workspace and truth layer.

Core jobs:

- Nests/projects
- documents
- users/access
- chat
- media vault truth
- publishing truth
- assistant action ledgers
- analytics

### Quipsly Studio

Native Mac/iPad production suite.

Core jobs:

- video editor
- audio sync
- local import/proxy/export
- source monitor wall
- episode production
- media-heavy workflows

### Quipsly Capture

Native iPhone/Mac menu bar capture family.

Core jobs:

- quick notes
- voice memos
- photo/video capture
- link/share capture
- Home Nest inbox
- field tagging

### Quipsly Coach

Potential dedicated coaching/session surface if the workflow grows enough.

Core jobs:

- session prep
- live notes
- recording
- transcript
- follow-up packet
- resources
- client-facing review

This may start inside Nest and Capture before becoming standalone.

### Quipsly Research / Vision Lab

Potential dedicated research/MLE/annotation app family.

Core jobs:

- image/video annotation
- dataset review
- label taxonomy
- uncertainty review
- local model/dashboard workflows

This may start inside Mac Studio before becoming standalone.

### Quipsly Publish

Potential dedicated publishing/marketing control room.

Core jobs:

- campaign packets
- platform variants
- schedule
- integrations
- analytics
- repurposing

This likely starts inside Nest.

## Avoid artificial lockouts

Bad:

- "Video belongs on Mac, so iPad cannot annotate video."
- "Writing belongs on web, so Mac cannot have a native writing app."
- "Capture belongs on iPhone, so Mac cannot have quick capture."
- "Publishing belongs on web, so iPhone cannot approve a post."

Better:

- Full video editing belongs on Mac first, but iPad can review/select/annotate.
- Shared document truth belongs in Nest, but native Mac/iPad editors can exist.
- Quick capture belongs everywhere, optimized per device.
- Publishing truth belongs in Nest, but approvals and reminders can happen anywhere.

## Design rule

For every major capability, define:

- `Truth owner`: where canonical records live.
- `Full-power surface`: where the deepest workflow happens.
- `Fastest capture surface`: where the user grabs the raw material.
- `Review surface`: where collaborators can inspect/comment/approve.
- `Offline/local requirement`: what must work without cloud round trips.
- `Sync-back contract`: what gets written back to Nest.

This prevents platform silos and prevents feature sprawl.
