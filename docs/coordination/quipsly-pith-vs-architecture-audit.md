# Quipsly pith vs architecture audit

Date: 2026-06-14
Owner: Codex / Product Owner lane
Status: Active correction to agent/product planning behavior

## Purpose

Quipsly benefits from memorable language. Pith is useful for handles, morale, teaching, and shared orientation.

But pith must not become architecture.

This document audits recent places where compressed phrasing, tidy platform maps, or catchy labels risked becoming false product structure.

## Core rule

A phrase can name an idea, but it cannot define the system by itself.

Before a catchy concept becomes implementation guidance, expand it into:

- user job;
- owned truth;
- affected data model;
- workflow states;
- surfaces;
- permissions;
- failure modes;
- undo/recovery;
- proof path.

If we cannot expand it, it is a slogan, not a design.

## Pattern 1: One app per platform

Compressed framing:

- Web app
- Mac app
- iPad app
- iPhone app

Why it was dangerous:

This implied one product surface per platform and risked locking features to a device category.

Correct framing:

Quipsly is a shared creative operating system with many surfaces. Multiple Mac apps, iPhone apps, iPad apps, web apps, extensions, menu bar tools, and local engines are allowed if the user jobs justify them.

Robust expansion:

- Capability first.
- Platform second.
- Native depth based on device strengths.
- Nest remains shared truth.
- No artificial lockouts.

Related doc:

- `docs/coordination/quipsly-app-surface-doctrine.md`

## Pattern 2: Sidebar

Compressed framing:

- sidebar

Why it was dangerous:

"Sidebar" got interpreted as a lane list, inspector, media bin, or generic side panel. That obscured the actual product need.

Correct framing:

The feature is a synced source monitor wall.

Robust expansion:

- one monitor tile per synced source lane;
- master-playhead locked;
- offset-aware;
- proxy-first;
- visible while scrubbing;
- separate from program output;
- connected to edit decisions.

## Pattern 3: Play mode

Compressed framing:

- mode picker;
- play mode;
- review/edit/sync mode.

Why it was dangerous:

It turned two explicit user actions into a sticky state. That hides the user's intent and increases confusion.

Correct framing:

Use explicit transport actions:

- `Play Through`: full synced source timeline, including inactive/skipped material.
- `Play Edit`: current program output, skipping inactive/skipped material.

Robust expansion:

- transport action;
- timeline traversal behavior;
- visible current time mapping;
- proof path for skipped gaps;
- disabled state if not implemented.

## Pattern 4: Clip

Compressed framing:

- clips;
- timeline clips;
- clip count.

Why it was dangerous:

It pulled Quipsly back toward Premiere-shaped fragment truth, which is exactly what the editor was meant to escape.

Correct framing:

Use source media plus edit decisions.

Robust expansion:

- `Source`: whole media object.
- `SourceLane`: source mapped onto episode time.
- `EditDecision`: range over source/episode time.
- `OutputTransform`: output-specific framing/effects.
- Decision counts matter more than clip counts.

## Pattern 5: Quality gates / confidence status

Compressed framing:

- quality gates;
- red/yellow/green readiness;
- confidence.

Why it was dangerous:

It risked turning transparency into judgment, bureaucracy, or legalistic status theater.

Correct framing:

Show availability and linked state without making moral/productivity judgments.

Robust expansion:

- what source exists;
- what is linked;
- what is missing;
- what can be previewed;
- what can be published;
- what can be synced;
- what has warnings;
- what the user can do next.

No gatekeeping unless the operation would truly fail or cause harm.

## Pattern 6: No ghostwriting

Compressed framing:

- no ghostwriting;
- Quipsly will not write for you.

Why it was dangerous:

It turned a healthy anti-black-box instinct into a restrictive, moralizing product rule.

Correct framing:

Quipsly is more than a black box.

Robust expansion:

- AI may draft, rewrite, suggest, compare, summarize, organize, and experiment.
- The product should preserve provenance, context, source links, action ledgers, versioning, and user control.
- Users are allowed to use AI heavily.
- Quipsly's differentiator is transparency and workflow, not scolding.

## Pattern 7: Flock / Marginalia / Quipsly names

Compressed framing:

- flock;
- marginalia;
- Quipsly lanes.

Why it was dangerous:

Cute group nouns can accidentally obscure real ownership, scope, or reporting lines.

Correct framing:

Names are morale handles. Each lane still needs:

- responsibility;
- report file;
- allowed scope;
- handoff format;
- integration risk level;
- proof requirements.

## Pattern 8: Beta-ready

Compressed framing:

- beta-ready;
- grown-up app;
- production-grade.

Why it was dangerous:

These are emotionally useful but technically vague. Agents may interpret them as polish, more features, visual cleanup, or deployment.

Correct framing:

Define readiness by workflow.

Robust expansion:

- target user;
- task they can complete;
- data they create;
- failure/recovery behavior;
- auth/access path;
- validation path;
- known limitations;
- support expectation.

## Pattern 9: Capture app

Compressed framing:

- note app;
- capture app;
- prosthetic attention span.

Why it was dangerous:

It could become "a notes app," which is too small.

Correct framing:

Capture is the intake valve for the whole Quipsly learning system.

Robust expansion:

- text;
- voice;
- photo;
- video;
- link;
- quote;
- screenshot;
- file;
- recording;
- field observation;
- default Home Nest landing;
- later classification/attachment;
- provenance and timestamps.

## Pattern 10: Content hubs / subdomains

Compressed framing:

- write.quipsly.com;
- pod.quipsly.com;
- coaching.quipsly.com;
- marketing.quipsly.com.

Why it was dangerous:

The subdomain name can distract from the real workbench/content strategy.

Correct framing:

Hubs are audience/workflow proof loops. Subdomains are optional routing/distribution choices.

Robust expansion:

- audience;
- painful job;
- useful free content;
- Quipsly packet;
- workflow demo;
- reusable template;
- published outputs;
- analytics loop.

## Pattern 11: Coaching

Compressed framing:

- coaching hub;
- creator coaching;
- leadership skills.

Why it was dangerous:

It could become a generic vertical label instead of a concrete workflow.

Correct framing:

Coaching is session capture, preparation, facilitation, transcript, follow-up, resource creation, and content repurposing.

Robust expansion:

- client/session records;
- pre-session notes;
- live capture;
- transcript;
- action plan;
- follow-up packet;
- reusable exercises;
- ethics/boundaries;
- creator service/productization;
- leadership learning.

## Pattern 12: Marketing

Compressed framing:

- marketing hub.

Why it was dangerous:

It could become generic growth-hacker sludge or a "we should do social" bucket.

Correct framing:

Marketing is the publishing, repurposing, analytics, and learning loop for useful content.

Robust expansion:

- source idea;
- audience;
- long-form piece;
- short-form variants;
- video/social assets;
- scheduling;
- platform integrations;
- analytics;
- lessons learned;
- next iteration.

## Pattern 13: Native

Compressed framing:

- full native.

Why it was dangerous:

"Native" can become either too broad or too dogmatic: rewrite everything immediately, or wrap web forever and call it native.

Correct framing:

Serious macOS/iOS surfaces should use native platform capabilities for the workflows where that matters.

Robust expansion:

- Swift/SwiftUI/AppKit/UIKit where appropriate;
- native menus/shortcuts;
- file access;
- AVFoundation/media APIs;
- camera/mic/background behavior;
- share extensions;
- local storage/sync;
- web bridges allowed only where they are honest transitional or web-owned surfaces.

## Pattern 14: Care

Compressed framing:

- we care;
- love the user;
- legacy.

Why it was dangerous:

If surfaced poorly, it can become fake intimacy or sentimental copy.

Correct framing:

Care is product behavior.

Robust expansion:

- clear state;
- undo;
- recovery;
- no hidden traps;
- no shaming;
- generous education;
- preserved work;
- respectful defaults;
- user agency.

## Pattern 15: Product Owner / Skippy / Gandalf

Compressed framing:

- Codex is Product Owner;
- Grand Skippy;
- UX Gandalf.

Why it was dangerous:

The role nickname can become permission to overassert instead of reason carefully.

Correct framing:

Codex should exercise product judgment, but every architectural choice still needs:

- explicit assumptions;
- real user workflow;
- data model implication;
- tradeoff;
- proof path;
- revisability.

## Agent operating instruction

When a phrase sounds good, pause and expand it before building.

Use this checklist:

1. What human job does this phrase actually refer to?
2. What object or data model would it create?
3. What state transitions exist?
4. What surfaces need it?
5. What is the undo/recovery path?
6. What failure modes matter?
7. What proof would show it works?
8. What should this phrase explicitly not mean?

If the answer is unclear, document the phrase as WIP, not gospel.

