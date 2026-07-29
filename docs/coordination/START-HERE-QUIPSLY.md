# START HERE: Quipsly runway

Date: 2026-06-14
Status: first-read orientation for Charlie, Codex, and Marginalia agents

## One-line mission

Quipsly helps creators capture source truth, annotate it, make reversible decisions, and turn one body of work into useful outputs without losing the path home.

## Immediate proof target

```text
Episodes 1-3 are the first proof loop.
Episode 4 runs in parallel as the break-aware stress test.
```

Episodes 1-3 prove the end-to-end loop with existing published references and Premiere rescue evidence.

Episode 4 proves the system can survive real-world mess: phone camera segments, recording breaks, missing camera continuity, and rough sync.

## Current forcing function

The MVP is not three separate apps.

It is:

```text
One Nest.
One episode.
One manuscript/session packet.
One source-synced editor.
Two exports.
One published page.
```

If a task does not help this loop, it may still be valuable, but it should not distract the main runway.

## Required reading order

1. `docs/coordination/quipsly-gospel-wip-register.md`
2. `docs/coordination/native-video-editor-control-room.md`
3. `docs/coordination/quipsly-editor-architecture-correction.md`
4. `docs/coordination/quipsly-ai-native-delivery-and-ai-news-priority.md`
5. `docs/coordination/quipsly-github-hygiene-runway.md`

## Active product truths

- Quipsly is not a Premiere clone.
- Whole source media stays whole.
- Edit logic is stored as decisions, annotations, sync, and output transforms over source media.
- `Play Through` plays sequence/source time.
- `Play Edit` plays program time and skips inactive/skipped decisions.
- The requested "sidebar" is a Synced Source Monitor Wall, not a lane label strip.
- The monitor wall shows synced source tiles at the same master playhead.
- Program output is separate and prominent.
- Proxies are normal editing media; huge originals are not normal monitor-wall playback media.
- Transcript/text is a primary editing handle, not the only source of truth.
- AI may draft, write, rewrite, suggest, and organize, but Quipsly should preserve provenance and user agency.
- Codex and other Quipslys count as creative partners in Quipsly's own dogfooding loop, not merely test-data generators.
- Agent-authored work may be serious publishable first-pass work when it helps prove the Nest -> Studio -> Tower workflow.
- Do not call agent-created material "placeholder" unless it is intentionally disposable test material.
- Do not let the product stall because a human has not supplied enough content. Codex and other Quipslys may create the first-pass content needed to prove the workflow.
- The safety line is not "AI must not write." The safety line is visible authorship, provenance, review state, reversibility, canon boundaries, and publication receipts.
- Approval and receipt systems are guardrails, not the product. Do not spend
  most of a sprint building approval ceremonies while the editor, writing
  surface, capture flow, audio tools, photo tools, or publishing UX still feel
  unfinished. Use the lightest visible safety layer that protects irreversible
  work, external publication, account mutation, or source-truth loss, then get
  back to making the tool excellent.

## Creative partner operating rule

Do not wait for Charlie, Homer, Melissa, Mako, or another human to supply every usable paragraph, article, storyboard beat, caption, short idea, or research packet before Quipsly can prove the workflow.

If the loop needs content, Codex and other Quipslys may create serious first-pass material intended for review or publication. That work should not be dismissed as placeholder by default.

The required behavior is:

- label authorship honestly: `agent-authored`, `human-authored`, or `mixed-authorship`;
- label intent honestly: disposable fixture, exploratory draft, serious first pass, review-ready, approved, canonical, scheduled, or published;
- preserve source context, prompts, notes, and uncertainty when claims matter;
- keep changes inspectable, revisable, rejectable, and recoverable;
- move real work through Nest, Studio, and Tower instead of blocking on empty inputs.

Quipsly is not anti-AI-writing. Quipsly is anti-invisible-mutation, anti-fake-provenance, and anti-lost-thread.

## Content partner rule

For Quipsly dogfooding, Codex is a working creative partner.

That means Codex may create serious first-pass chapters, articles, scripts,
show notes, social packets, storyboard beats, research packets, teaching
materials, publication pages, captions, and metadata when the workflow needs
real content to move.

Do not wait for Charlie, Homer, Melissa, Mako, or another human to supply every
input before proceeding. Do not treat Codex-created material as lesser by
default. Preserve authorship, intent, context, review state, canon state, and
publication state so the team can inspect and change it later.

The product needs this rule because a creative operating system cannot prove
itself with empty rooms and pretend examples. It has to carry real work.

## Current repo reality

The repo has a large amount of WIP across web, native Mac, local engine, QuipLore, HGO public site, mobile capture, publishing, and coordination reports.

Do not "clean" by deleting work.

Current cleanup posture:

- preserve all user/agent work;
- classify before moving;
- ignore obvious generated artifacts;
- slice commits by product lane;
- prove real app paths before declaring success.

## Native editor decision gate

There are multiple native editor roots:

- `apps/quipsly-video`: smaller standalone Swift editor experiment with QuipslyVideoCore package layout.
- `apps/QuipslyStudio`: recovery fork with SharedUI, AgentServer, AudioSyncer, ExportEngine, and overlapping core files.
- `apps/quipsly-mac`: older Quipsly desktop shell with Nest/auth/local-engine/Premiere panels and valuable reference work.

Do not blindly build on any of these until the active survivor is intentionally chosen for the next implementation pass.

Suggested decision criteria:

- Which app currently opens the closest visible source-lane editor?
- Which app has the cleanest source/decision/time model?
- Which app can prove import, monitor wall, `Play Through`, `Play Edit`, and export fastest?
- Which app has the least wrong architecture to remove?
- Which app can become Mac/iPad/iPhone native without dragging web-shell baggage?

## Morning execution runway

1. Pick or reconcile the native editor survivor.
2. Create a one-page Product Intent Brief for the next coding burst.
3. Build the smallest visible source-lane proof:
   - editor shell;
   - monitor wall placeholder;
   - program monitor;
   - full source lanes;
   - active/inactive decisions;
   - explicit `Play Through` and `Play Edit`.
4. Prove with tiny placeholder media before huge originals.
5. Then load Episode 1 packet.
6. Repeat for Episodes 2 and 3.
7. Keep Episode 4 ingest running in parallel as the break-aware stress test.

## Process rule

If the same class of failure repeats three times, stop patching and treat it as architecture/process failure.

This is active guidance, not unchangeable dogma.

## Morale clause

We are not slowing down.

We are adding rails so the rocket does not achieve touchdown in a swamp through the power of negative synergy and unlicensed vertical integration.

Mission, vision, laser, sticktuitiveness. Proceed.
