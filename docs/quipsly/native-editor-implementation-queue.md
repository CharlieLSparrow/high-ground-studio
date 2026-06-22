# Quipsly Native Editor Implementation Queue

Last updated: 2026-06-18

This queue turns the complete publishing contract into build packets. It is meant for Codex, Antigravity agents, and future Quipsly helpers working on the native editor.

Do not treat this as a static roadmap. Treat it as the current best implementation queue toward the real goal: a complete human-and-Codex editor that can edit 16:9 episodes, pull 9:16 shorts, prepare podcast audio, publish/handoff to platforms, and capture proof.

## Operating rule

Each packet must improve one of these loops:

1. Human edit loop.
2. Codex edit loop.
3. 16:9 episode output loop.
4. 9:16 short output loop.
5. Podcast audio output loop.
6. Publishing and receipt loop.

If a task does not strengthen one of those loops, it is probably decoration or drift.

## Packet 0: Stabilize recent redesign

Goal:

Make sure the redesigned native editor actually builds, launches, and still opens the Episode 1 proof lane.

Scope:

- Fix compile errors from recent UI refactors.
- Verify `Tool Bay`, `Program Hearth`, `Source Grove`, `Episode Trail Map`, and `Ship` are visible.
- Verify the Ship `Delivery Path` primer appears.
- Verify `Copy path JSON` works or fails with a clear reason.

Acceptance evidence:

- App launches from the real QuipslyStudio build/run path.
- Episode 1 opens without falling back to a wrong demo/editor surface.
- Screenshot or live observation shows the new major regions.
- Delivery path JSON contains four output families.

Do not:

- Rewrite media architecture during this packet.
- Add new publishing integrations.
- Claim any export/publish loop is complete merely because the UI loads.

## Packet 1: Human edit loop proof

Goal:

Make Episode 1 genuinely editable by a human in the native editor.

Scope:

- Confirm one shared playhead drives Program Hearth, Source Grove, and Episode Trail Map.
- Make timeline scrub and pinch zoom reliable enough for fine cuts.
- Make camera switching visibly affect Program Hearth.
- Make Play Edit skip quiet gaps and Play Through inspect source time.
- Make selected decision trim/nudge/delete obvious.
- Make shortcut hints visible near the relevant controls.

Acceptance evidence:

- Human can scrub Episode 1 and all visible monitors stay synchronized.
- Human can select a SHOW or SKIP decision and adjust its start/end.
- Human can switch Charlie/Homer/Both/Skip and see the Program Hearth reflect the decision.
- Human can zoom to a dense area and still understand active vs quiet regions.

Do not:

- Convert whole lanes into chopped clips.
- Hide source monitors as an optimization unless there is a user-visible replacement.
- Treat a static screenshot as proof of edit behavior.

## Packet 2: Codex edit loop proof

Goal:

Make Codex able to inspect and operate the editor safely.

Scope:

- Ensure structured state exposes active sequence, playhead, selected lane, selected decision, media readiness, output format, and delivery path.
- Add or verify safe agent actions for focusing monitors, selecting timeline, opening Ship, copying delivery JSON, and reporting missing receipts.
- Add diagnostics for current Program Hearth truth and source readiness.
- Keep unsafe operations explicit and blocked unless user-approved.

Acceptance evidence:

- Codex can report what the Program Hearth is showing at the playhead.
- Codex can report which sources are playable/proxy-ready/protected/missing.
- Codex can copy delivery path JSON and explain next safe publishing action.
- Codex cannot truthfully mark something published without receipt proof.

Do not:

- Add magical mutation endpoints without clear payloads and safe labels.
- Let Codex infer publication from artifact existence.
- Make Codex depend on screen scraping for core state.

## Packet 3: 9:16 short loop

Goal:

Make short creation and review practical enough to pull real social clips from Episode 1.

Scope:

- Make creating a new short obvious from Shorts mode.
- Support one continuous segment and multiple ordered segments.
- Show selected short recipe rails clearly on the Episode Trail Map.
- Let a human set in/out points from the shared playhead.
- Let a human preview or inspect the short recipe without losing the episode context.
- Generate or update social shorts packet with platform-specific copy/status fields.

Acceptance evidence:

- At least one Episode 1 short recipe can be created, selected, represented on timeline, and prepared for handoff.
- A selected short clearly shows whether it is one segment or multiple segments.
- Ship mode can report whether shorts packet/artifact/receipts are ready or missing.

Do not:

- Create duplicate mini projects as the primary model.
- Chop or duplicate source media just to represent a short.
- Hide the relationship between short recipe and episode spine.

## Packet 4: 16:9 episode output loop

Goal:

Make the wide episode master output path real enough for manual publishing to YouTube and Patreon.

Scope:

- Confirm wide output respects SHOW/SKIP, source switching, both-speaker layout, reference clips, and crop metadata.
- Generate or prepare a wide master artifact or explicit handoff packet.
- Separate proxy-preview readiness from final/original-quality render readiness.
- Generate upload guidance for YouTube, Patreon, and episode pages.
- Track missing receipts after manual upload/scheduling.

Acceptance evidence:

- Episode 1 can generate a wide-master artifact or a clear blocked state explaining what is missing.
- Ship mode reports the wide episode state accurately.
- Delivery JSON reports next action and missing proof accurately.

Do not:

- Call a proxy preview final unless explicitly labeled as proxy/draft.
- Claim YouTube or Patreon publishing without a captured URL/provider receipt.

## Packet 5: Podcast audio loop

Goal:

Make podcast audio a first-class output, not an afterthought.

Scope:

- Identify or generate the audio artifact tied to the episode spine.
- Generate podcast metadata packet: title, description, show notes, source episode, artifact path, destination platforms.
- Track Spotify and Apple Podcasts receipt targets separately.
- Surface audio readiness in Ship mode.

Acceptance evidence:

- Episode 1 can generate a podcast-ready packet or a clear blocker.
- Ship mode reports podcast audio separately from video outputs.
- Delivery JSON includes podcast state and next action.

Do not:

- Mix podcast receipt targets into generic social receipts.
- Treat transcript/show-note existence as audio artifact readiness.

## Packet 6: Publishing and receipt loop

Goal:

Make manual publishing safe, trackable, and proof-driven before direct API publishing is complete.

Scope:

- Keep a publish ledger of expected destinations.
- Capture platform, public or scheduled URL, provider ID, status, notes, and artifact path.
- Show missing receipts by platform family.
- Copy missing receipt checklist.
- Keep direct upload automation clearly disabled or dry-run-only unless implemented and authenticated.

Acceptance evidence:

- A human can see what still needs to be uploaded/scheduled.
- A human can capture a receipt after publishing/scheduling.
- Codex can report receipt gaps without overclaiming.

Do not:

- Collapse artifact readiness into publication status.
- Mark receipts captured without URL/provider/status evidence.

## Packet 7: Design and anxiety reduction pass

Goal:

Make the editor feel warm, professional, nature-y, and calm without hiding power.

Scope:

- Improve Tool Bay layout and copy.
- Improve Source Grove card density and preview clarity.
- Improve Episode Trail Map readability in dense edits.
- Make selected state visually obvious.
- Make empty/blocked states calming and actionable.
- Keep shortcuts visible without clutter.

Acceptance evidence:

- A human can explain what the four major regions do after 30 seconds.
- The app feels like a professional editor, not a debug dashboard.
- Dense Episode 1 or Episode 3 sessions are legible enough to edit.

Do not:

- Replace clarity with theme language.
- Make nature metaphors cute at the expense of timing/source truth.

## Recommended immediate order

1. Packet 0: Stabilize recent redesign.
2. Packet 1: Human edit loop proof.
3. Packet 2: Codex edit loop proof.
4. Packet 3: 9:16 short loop.
5. Packet 4: 16:9 episode output loop.
6. Packet 5: Podcast audio loop.
7. Packet 6: Publishing and receipt loop.
8. Packet 7: Design/anxiety pass as a recurring pass after each functional improvement.

## Handoff note to agents

The product is not a clone of Premiere. Do not default back to chopped clips, hidden source monitors, or one-output thinking.

Quipsly's native editor is built around:

- One shared episode spine.
- Whole synced source lanes.
- Proxy-first playback.
- Metadata decisions.
- Reversible SHOW/SKIP/crop/shorts recipes.
- Human and Codex access to the same truth.
- Publication proof through receipts.

When in doubt, preserve the source, expose the truth, and reduce the user's anxiety.

## Codex operation contract addendum

Codex should operate the native editor through explicit state and explicit actions, not through guesses.

### Safe Codex actions

These actions are safe because they inspect state, prepare artifacts, or copy handoff material without claiming external publication or mutating source media:

- Report active sequence, playhead, output format, playback mode, selected lane, and selected decision.
- Report source readiness: playable proxy, protected original, missing source, missing proxy, or recovery lane.
- Report Program Hearth truth at playhead: SHOW source, quiet gap, no SHOW decision, or out-of-range source.
- Open or focus Tool Bay modes: Frame, Shorts, Script, Ship.
- Copy delivery path JSON.
- Copy missing publication receipts checklist.
- Generate handoff packets for release, social shorts, or podcast audio when prerequisites are met.
- Propose edit actions in plain language before applying them.

### Codex actions requiring explicit human approval

These actions change the episode edit or publication ledger and should be visible, reversible where possible, and clearly described:

- Add SHOW/SKIP decisions.
- Move, trim, or delete SHOW/SKIP metadata.
- Change baseline or keyframed crop metadata.
- Create or edit short recipes.
- Mark a receipt captured after the user provides URL/provider/status proof.
- Relink media or attach proxies.
- Start a long export/proxy operation.

### Codex actions forbidden without evidence

These actions are not allowed from inference or vibes:

- Claim an output is published without captured receipt proof.
- Delete or overwrite source media.
- Replace a whole-lane model with chopped clip fragments.
- Mark final-quality render readiness when only proxy-preview readiness is proven.
- Mutate publishing state because an artifact exists.
- Hide missing/protected media problems by pretending the source is playable.

### Next implementation checklist

Before adding more Codex actions, wire or verify these structured fields in the agent state payload:

- `activeSequence.title`
- `activeSequence.durationSeconds`
- `playheadSeconds`
- `playbackMode`
- `playbackFormat`
- `selectedLaneId`
- `selectedDecisionId`
- `programTruthAtPlayhead`
- `sourceReadiness[]`
- `shortRecipeSelection`
- `deliveryPath[]`
- `missingReceiptSummary`

Each field should have a human-facing equivalent in the UI. Humans and Codex should share truth, not maintain parallel stories.

## Build/relaunch gate before deeper Swift mutation

The recent redesign touched shell layout, Source Grove, Timeline Map, Ship mode, and delivery payloads. Before deeper Swift changes, run the real app build/relaunch path and fix compiler/runtime breakage first.

Recommended gate:

1. Build and relaunch QuipslyStudio from the canonical native app path.
2. Open Episode 1 proof lane.
3. Confirm Tool Bay, Program Hearth, Source Grove, Episode Trail Map, and Ship mode appear.
4. Copy Delivery Path JSON and confirm it contains four output families.
5. Only then continue deeper behavior work on timeline editing, short recipes, export artifacts, and agent actions.
