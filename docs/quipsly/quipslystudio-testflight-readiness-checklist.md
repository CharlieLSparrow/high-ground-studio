# QuipslyStudio TestFlight Readiness Checklist

Last updated: 2026-06-18

Purpose: make the native production editor safe to hand to Mako, Homer, Melissa, and early beta collaborators without pretending local-dev behavior proves beta readiness.

This checklist is intentionally editor-specific. General policy lives in `docs/quipsly/native-app-testflight-distribution-policy.md`.

## Readiness principle

TestFlight is not just distribution. It is the first serious proof that QuipslyStudio survives real Apple signing, sandboxing, file permissions, helper packaging, and non-developer use.

If the editor works locally but fails in TestFlight, the failure is product evidence.

## Required beta proof loop

A TestFlight build is not ready for collaborators until it can complete this loop on a non-dev install:

1. Launch QuipslyStudio from a TestFlight-installed build.
2. Open or create an episode session.
3. Grant access to a user-selected media folder or external drive folder.
4. Import or relink at least two source videos and one audio source.
5. Generate or locate proxies in a Quipsly-owned cache location.
6. Scrub the Episode Spine and confirm Program Output plus Source Grove stay tied to one playhead.
7. Add or adjust SHOW/SKIP decisions without cutting raw media.
8. Create or review at least one 9:16 short recipe.
9. Export or prepare the 16:9 episode handoff.
10. Export or prepare at least one 9:16 short handoff.
11. Prepare podcast audio handoff metadata.
12. Open Ship and copy the safe checklist, destination matrix, and human approval packet.
13. Confirm Ship does not claim anything is posted without receipt proof.

## Signing and bundle checks

Before upload:

- Bundle identifier is stable.
- Version and build numbers are incremented intentionally.
- Signing team is correct.
- App Sandbox choice is explicit.
- Hardened runtime and entitlements are understood.
- Any helper/local engine binary is signed or explicitly disabled.
- Nested frameworks and helper tools are included intentionally.

Do not ship a TestFlight build that relies on an unsigned helper, a random local server, or a developer-only file path.

## File access and media permission checks

The editor must handle media access like a real Mac app:

- User selects media folders through a normal permission flow.
- External-drive access has a clear grant/recover path.
- Protected originals remain untouched.
- Missing media says what is missing and how to recover it.
- Proxy cache lives in a Quipsly-managed location.
- The app does not silently assume access to Desktop, Downloads, Documents, or iCloud.
- Security-scoped bookmark behavior is designed before broad beta.

## Proxy-first media checks

QuipslyStudio beta builds should prove:

- Raw source files remain source truth.
- Proxies are used for normal editing and scrubbing.
- Proxy status is visible in the Source Grove and Ship readiness surfaces.
- Missing proxies do not disappear; they become recovery work.
- Export/handoff steps can still reference the correct raw/proxy relationship.

## Editor interaction checks

The TestFlight build must make these interactions feel real:

- One shared playhead controls Program Output, Source Grove, and Episode Spine.
- Two-finger scroll and timeline scrub do not desynchronize monitors.
- Pinch/zoom or zoom controls allow fine edit inspection.
- Active SHOW and inactive SKIP decisions are visually obvious.
- Whole source lanes remain intact; decisions are metadata overlays, not chopped clips.
- Keyboard shortcuts are visible where possible.
- Source cards explain what is available now versus what needs recovery.

## Ship/publishing checks

Ship must make the release workflow honest:

- 16:9 episode destination lanes include YouTube and Patreon.
- 9:16 short destination lanes include YouTube Shorts, Instagram, Facebook, and LinkedIn.
- Podcast destination lanes include Spotify and Apple Podcasts.
- Prepared, Approved, Posted, and Proved remain separate states.
- Copy checklist includes safe actions and human/provider boundaries.
- Copy matrix includes per-platform readiness and proof status.
- Human approval packet exists before posting/scheduling.
- No UI copy implies provider posting is complete without receipts.

## Collaborator test script

For Mako or another editor:

1. Install via TestFlight.
2. Open the Episode 1 proof session or a shared test session.
3. Relink/grant media access if asked.
4. Scrub the timeline for two minutes.
5. Switch between source monitors and Program Output.
6. Add a simple SHOW/SKIP decision.
7. Create a short recipe.
8. Copy the Ship checklist and send it back.
9. Report any confusing label, missing file, frozen monitor, or permission prompt.

## Known risk buckets

- External-drive permissions may need stronger security-scoped bookmark handling.
- Local helper/media engine packaging may need a signed-bundled helper strategy.
- Existing local workflows may assume developer-only access to files.
- Recent SwiftUI Ship additions need a build/relaunch checkpoint before beta packaging.
- App Store Connect/TestFlight review may expose privacy/capability wording gaps.

## Current rule

Do not invite collaborators into a native editor TestFlight build until the app can at least complete the required beta proof loop with Episode 1 or another known-good test session.
