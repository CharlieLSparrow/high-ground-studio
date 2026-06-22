# QuipslyStudio Codex Production Runbook

Status: active workflow draft for `apps/QuipslyStudio`.

Purpose: give human editors and Codex the same safe production loop for editing, exporting, release prep, and publication proof.

This runbook is an operating guide, not proof that the app is complete. The running app, saved packets, generated artifacts, and platform receipts are the proof.

## Canonical app

Use:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
```

Do not treat these as active editor surfaces unless explicitly revived:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/quipsly-mac
/Users/wall-e/Dev/high-ground-studio/apps/quipsly-video
```

### Naming sanity check

The active project folder is **QuipslyStudio**.

The running macOS app may still display **Quipsly Mac**, **Quipsly Studio**, or
another product-facing name in older chrome. Product-facing app names can evolve;
the build/edit source of truth does not move unless this runbook and the
canonical implementation registry are updated together.

Use this map when briefing humans or agents:

- **QuipslyStudio**: canonical native editor implementation.
- **Nest / apps/quipsly**: web collaboration, project, document, and account surface.
- **quipsly-mac**: legacy cockpit/reference tree, not the editor target.
- **quipsly-video**: scratch/reference tree, not the editor target.

If a proposed task says "Mac app" or "video editor" without naming
`apps/QuipslyStudio`, stop and clarify before editing files. This is not
bureaucracy; it is how we avoid building the right feature in the wrong app.

Canonical registry:

```text
/Users/wall-e/Dev/high-ground-studio/docs/coordination/canonical-implementation-registry.md
```

Legacy quarantine note:

```text
/Users/wall-e/Dev/high-ground-studio/docs/quipsly/legacy-editor-quarantine.md
```

## Core invariants

- One shared playhead drives Program Output, Source Grove, and Episode Spine.
- Whole synced source lanes stay intact.
- SHOW and SKIP are reversible metadata overlays.
- Proxies are the editing path; originals are protected source truth.
- Prepared artifacts are not posted artifacts.
- Posted/proved requires real receipt or provider proof.
- Codex command acknowledgements are not proof.
- Before/after state packets are the proof surface for agent-assisted edits.

## Codex as a creative operator

Codex and other Quipslys count as creative participants in this production
system. They are not limited to test fixtures, fake placeholder content, or
background automation.

When a Nest, Studio, or Tower workflow needs real material to move forward,
Codex may create serious first-pass work:

- book passages, reflections, article drafts, show notes, and episode copy
- research packets, annotations, tags, outlines, and source summaries
- storyboard beats, comic panels, lesson material, and scroll-story drafts
- edit decisions, shorts recipes, captions, titles, thumbnails notes, and
  publication packets
- platform-specific metadata, social copy, Patreon copy, and release checklists

Do not call all agent-created work "placeholder" by default. Placeholder work is
valid when it is intentionally disposable proof material. Serious agent-authored
work is also valid when it is intended to become a reviewable or publishable
part of the project.

The boundary is not authorship. The boundary is hidden mutation.

Agent-created work should remain inspectable:

- label authorship truth, such as `agent-authored`, `agent-first-pass`,
  `mixed-authorship`, `human-reviewed`, `canon-approved`, or
  `publication-ready`
- preserve source context, prompts, prior artifacts, or uncertainty when they
  matter
- keep canon and publication transitions explicit
- make meaningful changes reviewable, reversible, or ledgered
- distinguish disposable test material from serious production material

The product must not bottleneck itself waiting for Charlie, Homer, Melissa,
Mako, or another human to provide every paragraph, caption, storyboard beat, or
publication packet. Humans can revise, reject, bless, or canonize later. The
system's job is to keep the trail visible enough that the team can trust and
improve the work.

## Output readiness ladder

QuipslyStudio supports the full production arc, but each rung means something
different. Keep these words strict:

1. **Editable**: the sequence can be opened, scrubbed, reviewed, and adjusted.
2. **Proxy-ready**: preview/export can use safe proxy media without touching raw originals.
3. **Artifact-ready**: the editor has rendered or prepared a concrete file or packet.
4. **Upload-ready**: the artifact has destination-specific metadata, captions, copy,
   thumbnail/asset notes, and operator instructions.
5. **Posted or scheduled**: a human or provider action has put the artifact on a platform.
6. **Proved**: Quipsly has a receipt, URL, provider ID, screenshot, or equivalent proof.

Codex may help aggressively through artifact-ready and upload-ready. Codex may
prepare receipt commands. Codex must not claim posted, scheduled, or proved
unless the current app state contains the external proof.

Target output families:

- **16:9 episode**: YouTube and Patreon episode/master output.
- **9:16 social clips**: YouTube Shorts, Instagram, Facebook, and LinkedIn.
- **Podcast audio**: Spotify and Apple Podcasts handoff.
- **Proof ledger**: receipts and provider evidence after the files leave the editor.

The product goal is not "one export button someday." The goal is a calm,
inspectable path from whole-source editing to platform-specific release proof.

## Apple distribution stance

For collaborators like Mako, TestFlight should be the default beta-distribution
channel for signed macOS/iOS/iPadOS builds once the app is ready to leave the
developer machine.

Use the split deliberately:

- **Local developer builds**: fastest loop for Codex/human implementation, proxy
  experiments, local media access, and debugging.
- **TestFlight builds**: collaborator installs, beta feedback, install proof,
  sandbox permission behavior, and real-device app behavior.
- **App Store release**: later public distribution once entitlements, support,
  privacy copy, onboarding, and provider integrations are mature.

Do not make TestFlight the only development path. It is a distribution gate, not
the inner coding loop. Conversely, do not treat a local build as collaborator
ready. Mako-ready means signed archive, upload, install proof, login/session
proof, media permission proof, and at least one successful shared editing
workflow against real or representative episode media.

## Validation policy

Use judgment. Do not avoid validation out of token anxiety, and do not run
validation as a ritual when it does not buy useful confidence.

Default policy:

- Run the canonical QuipslyStudio build/launch path after Swift source changes
  that can affect launch, editor UI, export, AgentServer, or production packets.
- Skip build work for docs-only changes unless the docs change includes a script,
  generated artifact, or operator command that needs proof.
- Prefer narrow semantic checks for agent/editor behavior before broad manual
  testing.
- Prefer real app state, `agentctl` packets, exported files, and receipts over
  screenshots alone.
- Offload long-running deploy/build observation to a deploy captain or AG agent
  when Codex should keep implementing, but Codex remains responsible for judging
  whether their report is enough to trust.

Canonical local build/launch path:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/build_and_run.sh
```

Useful semantic checks once the app is running:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-observe
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-audit-status
```

## Production log

Keep a lightweight ship's log for meaningful work blocks:

```text
/Users/wall-e/Dev/high-ground-studio/docs/quipsly/quipslystudio-production-log.md
```

Use it to record start/finish time when convenient, what changed, what proved
true, what stayed risky, and the next target. This is not a timesheet and not a
replacement for tests, build proof, artifact proof, or publication receipts. It
is a memory aid for humans and agents working across long production days.

## Start a Codex-assisted editing session

Use the combined observe packet first:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-observe
```

If the session will matter, save the initial observation:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-observe-save
```

Use this to check existing evidence before editing:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-audit-status
```

## Make audited timeline edits

Wrap meaningful semantic edit commands with `codex-act-save`.

Examples:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-act-save scrub 123.45
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-act-save source-window "Charlie Camera" show 10
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-act-save trim-selected -0.05 0.10
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-act-save format 9:16
```

Review the latest audited edit:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-act-review latest
```

Review the whole edit session:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-session-review
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-session-review --json
```

Only claim success after the after-state packet proves the intended editor state changed.

## Start release or publishing work

Use release observe before any output or publication work:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-release-observe
```

Save the release observation before a meaningful release session:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-release-observe-save
```

This gathers editor handoff, current state, delivery readiness, publication handoff, missing receipts, mission control, destination matrix, social queue, and podcast packet state.

## Make audited release-prep actions

Wrap release-prep commands with `codex-release-act-save`.

Examples:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-release-act-save full-release
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-release-act-save publish-ledger-generate
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-release-act-save social-shorts-packet
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-release-act-save podcast-packet
```

Review the latest audited release action:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-release-act-review latest
```

Review the whole release session:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-release-session-review
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-release-session-review --json
```

Prepared files, packets, ledgers, captions, and copy are useful progress. They are not publication proof.

## Capture publication receipts

Use receipt commands only after a real human/provider event.

Examples:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh episode-receipt-capture YouTube published https://example.com provider-id "notes"
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh podcast-receipt-capture Spotify published https://example.com provider-id "notes"
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh publish-receipt-update-platform "YouTube Shorts" social-short-clips published https://example.com provider-id "notes" "Title" "Description"
```

Never capture a receipt without a real URL, scheduled URL, provider ID, or equivalent platform proof.

## Review a full Codex production run

Use the top-level report:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-production-review
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-production-review --json
```

Use the evidence-health check:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-audit-status
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-audit-status --json
```

If audit packet counts do not match, stop and inspect before continuing.

## Package a handoff bundle

For a human, future Codex run, collaborator, or training-data review:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh codex-production-handoff
```

The bundle includes observe packets, release observe packets, audit status, production review, edit/release session reviews, capture statuses, manifest, and README.

The bundle is an index. It is not proof by itself.

## Recommended production loop

1. `codex-observe`
2. `codex-observe-save`
3. `codex-act-save <semantic edit command>`
4. `codex-act-review latest`
5. repeat edit loop until the timeline is ready
6. `codex-release-observe`
7. `codex-release-act-save <release-prep command>`
8. `codex-release-act-review latest`
9. capture real receipts only after human/provider events
10. `codex-production-review`
11. `codex-audit-status`
12. `codex-production-handoff`

## Validation note

These commands depend on the running QuipslyStudio AgentServer at `127.0.0.1:8080`. If the app is not running or the endpoint is stale, commands should fail loudly or record the failure in the handoff bundle.

Do not report that a Codex edit or release step succeeded until current app state, saved after-packets, generated artifacts, or platform receipts prove it.
