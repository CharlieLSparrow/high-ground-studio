# Quipsly Native App Distribution Policy

Last updated: 2026-06-18

## Decision

Quipsly native macOS, iPadOS, and iOS apps should standardize on **TestFlight as the beta distribution lane**.

This does not replace local development. It gives collaborators and beta testers one sane Apple-native way to install and update Quipsly apps while we keep the inner development loop fast.

## Distribution lanes

### 1. Local development builds

Use for active implementation, debugging, and fast iteration.

- Built locally from the current workspace.
- May use developer-only shortcuts, local fixtures, and direct logs.
- Does not prove beta readiness.
- Should remain the fastest loop for Codex and Charlie.

### 2. Signed local/internal builds

Use for emergency hands-on testing or device-specific debugging before TestFlight.

- Useful when a tester is physically present or we need one urgent signed build.
- Should not become the normal collaborator workflow.
- Must not hide sandbox/file-access problems that TestFlight would reveal.

### 3. TestFlight beta builds

Use as the standard lane for Mako, Homer, Melissa, invited beta testers, and any collaborator outside the dev machine.

- One Apple-native install/update flow.
- Covers macOS, iOS, and iPadOS beta testing.
- Gives us crash and tester feedback through App Store Connect.
- Forces real signing, entitlement, sandbox, permission, and packaging discipline.
- Builds expire, so release cadence matters.
- External builds may require beta review.

### 4. App Store release

Use after a product surface is stable enough for public distribution.

- Requires polished onboarding, support, privacy, entitlements, and review readiness.
- Should inherit the same bundle/signing habits proven in TestFlight.

## Quipsly-specific policy

### Local editor loop stays local-first

The native video editor is a heavy local-media tool. It must keep a fast local loop for:

- proxy generation
- external-drive workflows
- media import and matching
- timeline scrubbing
- source monitor wall behavior
- export experiments
- Codex-driven UI testing

TestFlight should not slow down every small editor iteration.

### Beta collaborator loop uses TestFlight

Anyone outside the main dev machine should use TestFlight unless there is a clear exception.

Priority beta collaborators:

- Mako for real editing workflow feedback
- Homer for creator/coaching/podcast workflows
- Melissa for fiction/creative workflows
- early Patreon/beta supporters when invited

### Sandbox truth is product truth

If a feature works locally but fails under TestFlight because of sandboxing, bookmarks, file permissions, helper processes, or external-drive access, that is not a TestFlight nuisance. It is product evidence.

The editor must handle:

- user-selected media folders
- persistent security-scoped bookmarks where needed
- clear missing-permission recovery
- proxy cache locations owned by Quipsly
- no silent access to protected files

### Helper/local engine packaging must be explicit

If Quipsly ships a helper process, local engine, or media processor with a native app, it needs a real packaging/signing strategy.

Acceptable paths:

- bundle helper tools inside the app if compatible with signing/sandbox needs
- use a separately signed helper with a clear install/update path
- keep advanced local-engine workflows developer-only until packaged honestly

Unacceptable paths:

- hidden unsigned helper dependencies
- assuming a random local server exists
- TestFlight build that says "ready" while core media processing cannot run

## Standard readiness checklist for each native app

Before putting a Quipsly native app into TestFlight:

- App opens cleanly from a signed archive.
- Bundle identifier is stable and owned.
- Version/build number increments intentionally.
- Signing team and entitlements are explicit.
- Required local file access flows are tested.
- App explains missing permissions in calm language.
- Crash logs are actionable.
- Beta tester role and expected workflow are written down.
- Any local engine/helper dependency is packaged or clearly disabled.

## Current editor implications

For the native production editor, TestFlight readiness means:

- Mako can install the app without developer tooling.
- Episode source/proxy/edit sessions open predictably.
- The app can explain how to grant/recover media folder access.
- The Source Grove, Episode Spine, and Ship workbench are usable under signed-app constraints.
- Exports and handoff packets land in user-visible, permission-safe locations.
- The editor does not claim provider publication without receipt proof.

The editor-specific readiness checklist lives in `docs/quipsly/quipslystudio-testflight-readiness-checklist.md`.

## Working rule

Use **local builds for speed** and **TestFlight for truth outside the dev machine**.

If a feature cannot survive TestFlight, it is not ready for beta collaborators.
