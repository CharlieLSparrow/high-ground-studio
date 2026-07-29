# Quipsly Active Source Map

Last updated: 2026-07-03

Purpose: stop agents from following stale paths or resurrecting old editor architectures. This file is a map, not a prison. We can move code aggressively when the move is intentional, documented, and validated.

## Purposeful change rule

Quipsly is still young enough that we should change structure whenever the product truth demands it. The rule is not "stick to the current folder forever." The rule is: do not drift by accident.

Healthy change:

1. Names the active truth before changing it.
2. Names the proposed truth after the change.
3. Explains why the new shape helps users, agents, validation, publishing, or source safety.
4. Moves, archives, or deletes old code deliberately instead of leaving mystery duplicates.
5. Updates this map and any affected runbooks before another agent has to guess.
6. Proves the new path through the narrowest useful running-app, endpoint, or script evidence.

Rabbit-hole warning signs:

- A prompt, old doc, or memory references a path that no current map confirms.
- Code is added beside a legacy system because the agent is unsure which one is live.
- A UI or workflow is rebuilt to match a stale architecture instead of the current product invariant.
- A compatibility layer exists only because no one wanted to make a decision.
- The app "works" in one script but the visible product surface, source map, and agent endpoint disagree.

When in doubt, pause long enough to name the decision, then move boldly.

## Product surfaces

### Quipsly Studio native editor

Current active surface for podcast/video/shorts editing:

- `apps/QuipslyStudio`

Current Swift source roots:

- `apps/QuipslyStudio/Sources/SharedUI`
- `apps/QuipslyStudio/Sources/QuipslyVideoCore`
- `apps/QuipslyStudio/Sources/QuipslyMac`
- `apps/QuipslyStudio/Sources/QuipslyiOS`

Important current UI files:

- `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift`
- `apps/QuipslyStudio/Sources/SharedUI/TimelineEditorView.swift`
- `apps/QuipslyStudio/Sources/SharedUI/RightSidebarView.swift`
- `apps/QuipslyStudio/Sources/SharedUI/InspectorSidebarView.swift`
- `apps/QuipslyStudio/Sources/SharedUI/ShortsReviewBriefPanel.swift`
- `apps/QuipslyStudio/Sources/SharedUI/ShortsRefinementQueuePanel.swift`
- `apps/QuipslyStudio/Sources/SharedUI/NativeTransportControls.swift`
- `apps/QuipslyStudio/Sources/SharedUI/AgentServer.swift`
- `apps/QuipslyStudio/Sources/SharedUI/Episode4CutIntelligenceBoardView.swift`

Important current core files:

- `apps/QuipslyStudio/Sources/QuipslyVideoCore/CoreModels.swift`
- `apps/QuipslyStudio/Sources/QuipslyVideoCore/ProjectStore.swift`
- `apps/QuipslyStudio/Sources/QuipslyVideoCore/PlaybackEngine.swift`
- `apps/QuipslyStudio/Sources/QuipslyVideoCore/CutIntelligence.swift`
- `apps/QuipslyStudio/Sources/QuipslyVideoCore/AVCompositionBuilder.swift`
- `apps/QuipslyStudio/Sources/QuipslyVideoCore/AVExportRenderer.swift`
- `apps/QuipslyStudio/Sources/QuipslyVideoCore/ProxyEngine.swift`

Validation ladder:

```bash
cd /Users/wall-e/Dev/high-ground-studio
apps/QuipslyStudio/script/build_and_run.sh --verify
apps/QuipslyStudio/script/agentctl.sh state
```

Use narrower `agentctl.sh` commands for the changed feature when practical.

Current build truth: Quipsly Studio is an Xcode-project app at `apps/QuipslyStudio/QuipslyStudio.xcodeproj`, built by `apps/QuipslyStudio/script/build_and_run.sh`. Do not assume `apps/QuipslyStudio/Package.swift` exists unless the source map has been intentionally updated and validated.

Agent/source-map orientation is also exposed by the running editor:

```bash
apps/QuipslyStudio/script/agentctl.sh active-source-map
```

Equivalent HTTP endpoints:

- `GET /active_source_map`
- `GET /studio_source_map`
- `GET /goal_contract`

This is intentionally a live contract, not only a document. Agents should read it before changing editor architecture or interpreting old prompts.

Current goal-shaped package/review board:

```bash
apps/QuipslyStudio/script/agentctl.sh studio-goal-review-board --markdown
apps/QuipslyStudio/script/agentctl.sh studio-goal-review-board --json
```

Backing script:

- `apps/QuipslyStudio/script/studio_goal_review_board.py`

Backing doc:

- `apps/QuipslyStudio/docs/production/studio-goal-review-board.md`

Use this when checking Episodes 1-6 package readiness, especially while Episode 4 watched/source clips are pending.

Current selected-short review brief:

```bash
apps/QuipslyStudio/script/agentctl.sh shorts-review-brief --markdown
apps/QuipslyStudio/script/agentctl.sh shorts-review-brief --json
apps/QuipslyStudio/script/agentctl.sh shorts-select-wait index 2 10
apps/QuipslyStudio/script/agentctl.sh shorts-queue-quality-board --markdown
apps/QuipslyStudio/script/agentctl.sh shorts-review-queue-packet --save --markdown
apps/QuipslyStudio/script/agentctl.sh shorts-review-decision-packet refine "needs a tighter hook/cadence pass" --save --markdown
apps/QuipslyStudio/script/agentctl.sh shorts-transcript-confidence-board --save --markdown
apps/QuipslyStudio/script/agentctl.sh selected-short-platform-packet --all
apps/QuipslyStudio/script/agentctl.sh shorts-platform-packet-batch --start-index 1 --limit 3
```

Backing script:

- `apps/QuipslyStudio/script/shorts_review_brief.py`
- `apps/QuipslyStudio/script/shorts_select_wait.py`
- `apps/QuipslyStudio/script/shorts_queue_quality_board.py`
- `apps/QuipslyStudio/script/shorts_review_queue_packet.py`
- `apps/QuipslyStudio/script/shorts_review_decision_packet.py`
- `apps/QuipslyStudio/script/shorts_transcript_confidence_board.py`
- `apps/QuipslyStudio/script/selected_short_platform_packet.py`
- `apps/QuipslyStudio/script/shorts_platform_packet_batch.py`

Use `shorts-select-wait` before review commands when an agent needs to change the selected short. It treats the HTTP receipt as scheduling evidence only and waits for `/selected_short_quality` proof before reporting success. Use `shorts-review-brief` as the first calm readback when refining a selected short. It condenses live `/state`, `/selected_short_quality`, and the local refinement queue into current-session truth, selected-short blockers, queue scope, and safe commands. Use `shorts-queue-quality-board` when choosing what to review next across the active queue without changing selected-short state; it carries hook/caption, transcript excerpt, speaker, segment count, export proof, and cut-risk evidence so review is guided by meaning instead of timestamps alone. Use `shorts-transcript-confidence-board --save --markdown` to flag transcript excerpts that are missing, duplicated, speaker-uncertain, or too rough for caption/quote/cadence confidence. Use `shorts-review-queue-packet --save --markdown` when a human/agent needs a stable "watch first / refine next / needs export proof" handoff packet. Use `shorts-review-decision-packet keep|refine|reject|hold "notes" --save --markdown` to preserve a proposed review decision before applying the separate `shorts-review-selected` command. `ShortsReviewBriefPanel.swift` renders the selected-short quality endpoint in the native Shorts workbench. Use `selected-short-platform-packet --all` when the selected short needs platform-native metadata drafts. Use `shorts-platform-packet-batch` for queue-wide sidecar platform prep from live `/shorts_queue` rows; use `shorts-select-wait` separately when interactive selected-short proof matters. These are read-only or local sidecar artifacts: no edit, export approval, upload, publication, receipt, or source-media mutation.

### Quipsly web and Nest

Current active deployed web app for `quipsly.com` and `nest.quipsly.com`:

- `apps/quipsly`

Current deploy script:

- `scripts/quipsly-web-deploy.sh`

This deploy stages `apps/quipsly`, required packages, Prisma, and selected web content into a Cloud Build context, then deploys Cloud Run service `studio` while preserving existing env/secrets.

Validation ladder:

```bash
cd /Users/wall-e/Dev/high-ground-studio
CI=true pnpm --filter quipsly exec tsc --noEmit --incremental false
CI=true pnpm --filter quipsly build
LOCAL_VALIDATE=0 scripts/quipsly-web-deploy.sh <tag>
```

## Legacy or caution surfaces

These may contain useful archaeology, but they are not the default active editor surface:

- `apps/quipsly-mac`
- `apps/quipsly-video`
- older `apps/studio` or `apps/web` editor patterns
- paths like `apps/QuipslyStudio/Sources/QuipslyStudio/...`

If a task references one of these, verify whether it is an explicit archaeology request or a stale pointer before editing.

## Migration rule

Moving code is allowed. Replacing architecture is allowed. Deleting abandoned paths is allowed when the decision is deliberate.

Before a substantial move:

1. Name the current active path and the proposed new path.
2. State why the move improves product truth or developer/agent usability.
3. Preserve or intentionally archive any useful code before deletion.
4. Update this source map and any runbooks that mention the old path.
5. Run the narrowest validation that proves the new path is active.

## Product invariants

- Whole source media stays intact.
- Edits are transparent metadata, not chopped source clips.
- Proxies and sidecars are preferred over mutating originals.
- Local readiness, human approval, and external publication receipts are separate states.
- Agent controls should use stable app state and command endpoints instead of fragile OS mouse rituals whenever possible.
- Episode 4 missing watched/source clips should stay visible but must not stall broader progress on Episodes 1-3, 5, and 6.

## Agent warning

Do not blindly follow stale paths from memory, old chat, old docs, or old prompts. Use this map first, then inspect the current filesystem before editing.

## Current deploy bottleneck note

On 2026-07-01, a Quipsly.com marketing deploy passed local typecheck and local `next build`, then Cloud Build failed with exit `137` during the remote Next TypeScript phase. The remote config already supports `QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS=1`, but the deploy script had not been forwarding that substitution.

Preferred contract for web deploys:

1. Run local typecheck/build when making code-risky changes.
2. For remote Docker deploys after local validation, allow the Docker build to skip repeated Next typechecking with `REMOTE_IGNORE_TYPE_ERRORS=1`.
3. Do not use remote type-skip as a substitute for local validation when the change could affect TypeScript behavior.
4. Pass `QUIPSLY_BUILD_ID` from the image tag into Docker so the Next app build layer is refreshed deliberately on every deploy, while dependency cache can still help.
5. After Cloud Run deploy, explicitly route 100% service traffic to `status.latestCreatedRevisionName`. Existing tagged revisions can remain available at 0%, but the service URL and custom domains must move to the new image.
6. Continue slimming the Cloud Build context and dependency layer. The current 261 MB staged context and uncached install/build path are too slow for routine marketing iteration.

## 2026-07-02 - Shorts lineage surfaces

Current intentional shorts lineage surfaces:
- Audit command: `script/agentctl.sh studio-shorts-lineage-audit --all`
- Backfill command: `script/agentctl.sh studio-shorts-lineage-backfill --all`
- Start Here command: `script/agentctl.sh studio-shorts-review-start-here --all`
- Audit artifact: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/lineage-audit/quipsly-studio-shorts-lineage-audit.json`
- Backfill artifact: `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/lineage-backfill/quipsly-studio-shorts-lineage-backfill.json`
- Saved session source: `/Users/wall-e/Library/Application Support/Quipsly/MediaVault/sessions/*.quipsly-session.json`

Operating rule: these paths are a current source map, not permanent law. Change them when a better architecture is deliberate, documented, and proven. Do not follow stale paths just because older reports mention them, and do not treat rendered short MP4s as canonical edit truth when saved session recipes exist.

## 2026-07-02 - Source-lane inference truth boundary

Shorts lineage inference is now an intentional sidecar recovery layer:
- It reads saved session recipes and lane decisions.
- It applies source-lane offsets before comparing lane tags to short sequence ranges.
- It writes review artifacts only.
- It does not mutate sessions, media, timelines, exports, publication state, or receipt truth.

Current source-lane lineage contract:
- Explicit `sourceLaneId` / `sourceTagId` is canonical authorship when present.
- Inferred source lane is reviewer evidence when explicit fields are missing.
- Future export paths should write explicit lane/tag lineage at recipe creation time so inference becomes a fallback, not the normal path.

This is a deliberate architectural seam: purpose over rigidity. Keep it if it reduces systems anxiety and improves review truth; replace it when the native export path records lineage directly.

## 2026-07-02 - Selected-short export lineage contract

The active selected-short export bridge is:
- Swift request creation: `Sources/SharedUI/AgentServer.swift`
- Proxy renderer: `script/shorts_proxy_export.py`

Current rule:
- Export requests must send sequence-time ranges.
- Export manifests must preserve authored `sourceLaneId` / `sourceTagId` when present.
- If the renderer chooses a video lane because authored lineage is missing, that belongs in `renderedVideoLaneId`, not `sourceLaneId`.
- `rendered-video-lane-fallback` is evidence for review, not canonical recipe authorship.

Current follow-up: the app's `load-session-wait` control path timed out on `episode-2-native-proof` even though the agent server was healthy. Do not mistake the controlled proxy-export smoke for proof that the visible app command path is healthy.

## 2026-07-04 - QuipslyStudio selected-short platform metadata truth

For QuipslyStudio shorts, the canonical editable platform draft metadata is `ShortClipCandidate.destinationPresets` in `Sources/QuipslyVideoCore/CoreModels.swift`. `Sources/SharedUI/WorkspaceView.swift` exposes those presets as `platformVariants` for agent compatibility, but `platformVariants` is a projection, not a second store. Use `platformDraftSummary` for "has platform copy been drafted?" and `platformTargetSummary` for "is this ready for Tower/publication handoff?" A short marked `refine` can have `platformDraftSummary` complete while `platformTargetSummary` remains blocked. That is intentional.

Proof commands:

- `script/agentctl.sh shorts-quality-action draft-platform-pack`
- `script/agentctl.sh selected-short-quality`
- `script/agentctl.sh selected-short-production-brief --markdown`
- `script/agentctl.sh selected-short-state-contract-check --markdown`

Do not create another shorts platform packet store without an explicit architecture decision. If the UI or CLI disagrees, repair the projection/readback layer before adding a new model.

## 2026-07-04 - Purposeful structure changes over stale-path obedience

Source maps and coordination docs describe the current intended route through the repo; they are not permanent law. If live code, product direction, or validation evidence proves a path/model should move, change it deliberately and update the map in the same pass.

For structural changes, record:
- the old path/model being retired or bypassed,
- the new source of truth,
- why the change is product-correct now,
- which scripts/endpoints prove it,
- any known blast radius or follow-up cleanup.

Current QuipslyStudio selected-short truth:
- `/shorts_queue_select` may project selection from the cached short queue, but it must also update the agent-visible selected-short read model.
- `/selected_short_quality` is the proof endpoint for selected-short state.
- Command receipts are scheduling/projection evidence, not final proof by themselves.
- `platformDraftSummary` means platform copy exists. `platformTargetSummary` means Tower/publication handoff is ready. Keep these separate.
- Cut Intelligence with zero overlapping warnings should read as `clear`, not `unknown`.

## 2026-07-04 - Selected-short reviewer packet surfaces

Current selected-short review surfaces in `apps/QuipslyStudio`:
- Proof endpoint: `/selected_short_quality`.
- Next-action endpoint: `/selected_short_production_brief`.
- Human proof-watch guidance: `/selected_short_human_review_guidance`.
- CLI one-page reviewer packet: `script/agentctl.sh selected-short-review-brief --markdown`.
- CLI contract check: `script/agentctl.sh selected-short-state-contract-check --markdown`.

Field contract notes:
- Production brief actions use `recommendedAction.nextCommand`.
- Platform draft readiness and platform/Tower handoff readiness are intentionally separate.
- Review packets are read-only. They do not Keep, Refine, Reject, export, publish, schedule, upload, mutate media, or change edit decisions.

## 2026-07-04 - Queue-level shorts review runway

Current Episode shorts queue review surface:
- Generate markdown/html/json board: `script/agentctl.sh shorts-review-priority-board docs/quipsly/current-state episode-1-shorts-review-priority-board --md`.
- Current generated markdown proof: `docs/quipsly/current-state/episode-1-shorts-review-priority-board.md`.
- Per-card detailed review command shape: `script/agentctl.sh shorts-select id <short-id> && script/agentctl.sh selected-short-review-brief --markdown`.
- Per-card contract proof command shape: `script/agentctl.sh shorts-select id <short-id> && script/agentctl.sh selected-short-state-contract-check --markdown`.

The queue board is a triage surface. The selected-short review brief is the detailed proof packet. Neither surface approves, publishes, uploads, exports, overwrites, mutates original media, or changes edit decisions by itself.

## 2026-07-04 - Selected-short story repair suggestions

Read-only story repair surface:
- CLI: `script/agentctl.sh selected-short-story-repair --markdown`.
- Aliases: `short-story-repair`, `selected-short-story-repair-suggestions`, `short-story-suggestions`.
- Script: `script/selected_short_story_repair_suggestions.py`.
- Queue-board route: each card in `script/agentctl.sh shorts-review-priority-board ...` now includes `script/agentctl.sh shorts-select id <short-id> && script/agentctl.sh selected-short-story-repair --markdown`.

Use this when a selected short has a weak hook-turn-payoff contract, missing caption/overlay metadata, or a generic candidate title. It should be proof-watched before applying any suggestion. Suggestions are metadata-only and should not be treated as publication approval.

## 2026-07-04 - Source maps are maps, not cages

- Current map truth: `apps/QuipslyStudio` is the active Studio product surface, while selected-short transcript context may currently live in sibling local session files under `~/Library/Application Support/Quipsly/MediaVault/sessions/`.
- Directional rule: paths and structures should be documented so agents know the current terrain, but they are allowed to change when the reason, current truth, migration/cleanup path, and validation evidence are explicit.
- Anti-rabbit-hole rule: do not blindly follow stale paths or old prompt language. First locate the current live surface, then change it on purpose.

## 2026-07-04 - File-backed shorts story board

- New read-only board command: `apps/QuipslyStudio/script/agentctl.sh shorts-story-repair-board`.
- Default proof lane inputs:
  - session: `~/Library/Application Support/Quipsly/MediaVault/sessions/episode-1-codex-real-edit-v1-youtube-wordtimed.quipsly-session.json`
  - transcript: `~/Library/Application Support/Quipsly/MediaVault/sessions/episode-1-codex-real-edit-v1-youtube-transcript.quipsly-session.json`
- Current board artifact: `apps/QuipslyStudio/docs/quipsly/current-state/episode-1-shorts-story-repair-board.md`.
- Use this before trusting transcript-generated hooks/captions for Episode 1 shorts; many current ranges need transcript alignment review.

## 2026-07-04 - Transcript alignment audit command

- New read-only audit command: `apps/QuipslyStudio/script/agentctl.sh shorts-transcript-alignment-audit`.
- Current artifact: `apps/QuipslyStudio/docs/quipsly/current-state/episode-1-shorts-transcript-alignment-audit.md`.
- Current Episode 1 conclusion: no safe global transcript offset. The shorts look mixed or stale at the recipe/range level.
