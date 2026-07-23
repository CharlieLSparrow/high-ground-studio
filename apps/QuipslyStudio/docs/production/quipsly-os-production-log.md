
## 2026-06-27 16:41 UTC - Studio360 operator workbench promoted

- Added `script/build_studio360_operator_workbench.py` as a read-only 360 control-plane front door.
- Registered `agentctl studio360-operator-workbench` aliases.
- Promoted the 360 operator workbench into the Quipsly return brief open targets and production conveyor.
- Added pointer-contract validation for the 360 operator workbench.
- Generated current workbench: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/OperatorWorkbenches/20260627-164017-472758-studio360-operator-workbench/index.html`.
- Current 360 truth: repair-first, 220 assets, 100 asset groups, 152 ready recipes/candidate rows, 16 proof outputs present, 3 repair tickets, 1 source recopy ticket, 7 damaged assets.
- Safety truth: no proxy, repair, render, export, upload, publish, schedule, delete, overwrite, source mutation, or receipt truth was created.
- Validation: pointer contracts passed `112/112`; OS validation passed `411/411`; return brief refreshed with `43` open targets.

## 2026-06-27 16:43 UTC - Return brief workspace labels and path truth tightened

- Promoted current workspace labels now match promoted front doors: Nest author desk, Photo Grove operator workbench, Studio360 operator workbench, and Tower operator workbench.
- Added `pathExists` to current workspace rows so humans/agents can tell whether the front door is physically present.
- Validation after the change: pointer contracts passed `112/112`; OS validation passed `411/411`; all five current workspace paths exist.

## 2026-06-27 16:45 UTC - Studio current workspace promoted to package quality desk

- Promoted the Studio podcast/video current workspace from the single next-review card to the Studio Package Quality Desk.
- Return brief now exposes the Studio Package Quality Desk, Studio Top Review Companion, and Episode Sync Decision Aid as explicit open targets.
- Current workspace front doors now line up across lanes: Studio package desk, Nest author desk, Photo Grove operator workbench, Studio360 operator workbench, and Tower operator workbench.
- Validation: pointer contracts passed `123/123`; OS validation passed `411/411`; all five current workspace paths exist.
- Safety truth preserved: no approval, promotion, repair, export, publish, upload, schedule, account mutation, receipt capture, source mutation, delete, or overwrite occurred.

## 2026-06-27 17:02 UTC - Studio review theater added

- Added `script/build_studio_review_theater.py` as a local, read-only screening surface for Episodes 1-6.
- Registered `agentctl studio-review-theater` aliases.
- Generated current theater: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/studio-review-theater/20260627-170006-531022-studio-review-theater/index.html`.
- Theater truth: 6 episodes, 12 video rows, 6 podcast-audio rows, 37 discovered shorts, 2 attention episodes, 4 watch/listen episodes, 0 missing primary artifacts, 0 captured receipts.
- Wired the theater into the return brief and pointer contracts, then added it to the Desktop blocker sheet as the best first reviewer surface.
- Fixed `build_current_production_blocker_doc.py` to load the return-brief target JSON, not only the lightweight pointer shell.
- Validation: pointer contracts passed `134/134`; OS validation passed `411/411`.
- Safety truth preserved: no approval, review ledger write, promotion, repair, export, publish, upload, schedule, account mutation, source mutation, delete, overwrite, or receipt truth occurred.

## 2026-06-27 17:22 UTC - Photo Grove cull theater promoted

- Added `script/build_photo_grove_cull_theater.py` as a broad, read-only Photo Grove review surface for Aftershoot-like culling without metadata writes, proof selection, copy/export/delivery, uploads, publishing, receipt truth, or original mutation.
- Wired `script/agentctl.sh photo-grove-cull-theater` aliases and promoted the cull theater into the Quipsly return brief as the Photo Grove front door while preserving the smaller operator workbench.
- Added pointer-contract validation for the cull theater: ready status, broad review rows, thumbnails, source evidence, dry-run actions, and read-only truth.
- Generated current cull theater: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/CullTheaters/20260627-171918-353980-photo-grove-cull-theater/index.html`.
- Evidence: 160 source photos, 39 theater rows, 16 group rows, 39 thumbnails, 39 source-evidence rows, 66 dry-run actions, 0 claimed mutations.
- Validation: pointer contracts passed 145/145; Quipsly OS validation passed 411/411.

## 2026-06-27 17:36 UTC - Nest writing review desk promoted

- Promoted the existing Nest writing review desk into the Quipsly return brief and production conveyor as the primary Nest writing/research workspace.
- Preserved the author desk as the smaller daily-writing surface while making the review desk the broader book/article draft review front door.
- Added pointer-contract validation for review rows, platform packet visibility, review note templates, human-review need, and read-only canon/publication truth.
- Generated current review desk: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/WritingReviewDesks/20260627-173448-762580-writing-review-desk/index.html`.
- Evidence: 17 review rows, 17 review note templates, 85 platform packets, 3 human-review rows, 12 review-ready rows, 0 source mutations, 0 canon replacement, 0 external publication, 0 receipt truth.
- Validation: pointer contracts passed 156/156; Quipsly OS validation passed 411/411.

## 2026-06-27 17:51 UTC - Studio360 repair preflight promoted

- Generated and promoted the existing Studio360 repair preflight as the primary 360 front door when the operator workbench is in repair-first mode.
- Wired the actual latest pointer name, `latest-360-repair-preflight.json`, into the Quipsly return brief and pointer contracts.
- Added pointer-contract validation for visible repair tickets, human decision need, ready-work-can-continue lane boundary, and no repair/render/export/publishing/source-mutation claims.
- Generated current repair preflight: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/repair-preflight/20260627-174916-753730-360-repair-preflight/index.html`.
- Evidence: 3 repair tickets, 3 human decisions required, 2 repair requests present, 1 repair evidence packet present, 1 source recopy/redownload candidate, 0 decisions written, 0 originals mutated, 0 exports created.
- Validation: pointer contracts passed 167/167; Quipsly OS validation passed 411/411.

## 2026-06-27 18:03 UTC - Tower social command center promoted as publishing front door

- Promoted Tower's current workspace from the operator workbench to the Hootsuite-like social command center in the Quipsly return brief and production conveyor.
- Kept the Tower publication control room and operator workbench linked as secondary/deeper evidence surfaces.
- Added pointer-contract coverage for the social command center: platform rows, draft schedule intent, shorts/action-card visibility, approval/receipt boundary, and read-only truth.
- Validation after the change: pointer contracts passed 179/179; OS validation passed 411/411.
- Safety boundary unchanged: no external publishing, upload, scheduling, approval, account mutation, receipt capture, source mutation, deletion, or overwrite.

## 2026-06-27 18:19 UTC - Tower shorts cards made locally review-operable

- Promoted existing shorts-review cockpit commands into Tower social command center shorts action cards.
- Each front-door short card now exposes open, reveal, keep, refine, and reject local review commands while keeping external approval/publication/receipt truth empty.
- Added `shortsPublishingCardsWithLocalReviewCommands` to Tower social command counts and pointer-contract validation.
- Refreshed Tower social command center, return brief, pointer-contract validation, OS validation, and current production blockers.
- Validation: pointer contract passed 180/180 checks; OS validation passed 411/411 checks.
- Safety boundary: local review metadata only. No media mutation, upload, scheduling, external publishing, account mutation, approval, overwrite, or receipt creation.

## 2026-06-27 18:35 UTC - Nest daily writing packet promoted as writing front door

- Generated the Nest writing session cockpit and daily writing packet from existing source-backed writing queues.
- Promoted `latest-nest-writing-daily-packet.json` to the Nest writing/research current workspace in the Quipsly return brief.
- Kept author desk and review desk linked as related surfaces, but made the daily packet the primary do-work entrypoint.
- Added pointer-contract coverage for the daily writing packet: ready status, selected source-backed tasks, no source mutation, no canon replacement, and no publication claims.
- Refreshed return brief, pointer-contract validation, OS validation, and current production blockers.
- Validation: pointer contract passed 191/191 checks; OS validation passed 411/411 checks.
- Safety boundary: local daily writing guidance and draft-packet launch only. No source mutation, canon replacement, upload, publication, schedule, account mutation, overwrite, delete, or receipt creation.

## 2026-06-27 18:44 UTC - Studio360 source desk promoted as primary 360 front door

- Generated `latest-360-source-desk.json` and promoted it to the 360 workflow current workspace in the Quipsly return brief.
- Kept repair preflight visible, but stopped making the whole 360 lane feel globally blocked by damaged assets.
- Source Desk now surfaces 100 groups, 220 assets, 152 renderer dry-run-ready rows, 76 reframe-ready groups, 16 proof outputs, 3 repair tickets, and 0 original mutations/exports/publications.
- Added pointer-contract coverage for Source Desk readiness, source shape, ready work visibility, repair visibility, and no repair/render/export/publication/source-mutation claims.
- Refreshed return brief, pointer-contract validation, OS validation, and current production blockers.
- Validation: pointer contract passed 203/203 checks; OS validation passed 411/411 checks.
- Safety boundary: local source/proxy/reframe/repair evidence only. No proxy generation, repair, render, export, upload, publication, schedule, metadata write, source mutation, overwrite, delete, or receipt truth.

## 2026-06-27 18:53 UTC - Photo Grove proof desk promoted as primary photo front door

- Generated `latest-photo-grove-proof-desk.json` and promoted it to the Photo Grove current workspace in the Quipsly return brief.
- Kept cull theater, operator workbench, control room, rehearsal, and contact sheet visible as related/open targets.
- Proof Desk now surfaces 160 source photos, 24 candidate starter photos, 24 metadata-only command rows, 8 cull suggestion groups, 0 selected client proof items, and 0 original mutations/delivery/publication claims.
- Added pointer-contract coverage for Proof Desk readiness, candidate starter visibility, metadata-only decision command visibility, no premature client-proof set, and read-only truth.
- Refreshed Photo Grove proof desk, return brief, pointer-contract validation, OS validation, and current production blockers.
- Validation: pointer contract passed 215/215 checks; OS validation passed 411/411 checks.
- Safety boundary: local cull/proof evidence only. No metadata write, proof selection, copy, export, delivery, upload, publication, schedule, account mutation, receipt capture, source mutation, delete, or overwrite.

## 2026-06-27 18:57 UTC - Return brief pointer made agent-ready

- Added `topQueue` and `firstActionsByLane` directly to `latest-quipsly-return-brief.json`, not only the target return-brief JSON.
- Added pointer-contract checks so the latest return-brief pointer must expose queue/action context without requiring agents to chase the target JSON first.
- Refreshed return brief, pointer-contract validation, OS validation, and current production blockers.
- Validation: pointer contract passed 217/217 checks; OS validation passed 411/411 checks.
- Safety boundary unchanged: local review/readiness context only. No source mutation, approval, publish, upload, schedule, account mutation, delete, overwrite, or receipt truth.

## 2026-06-27 19:02 UTC - Return brief front-door actions added

- Added `frontDoorActionsByLane` to the return brief target and latest pointer so agents and humans can see the current promoted entrypoint for each lane without relying on older inherited first-action pointers.
- Front-door actions now point to: Studio package quality desk, Nest daily writing packet, Photo Grove proof desk, Studio360 source desk, and Tower social command center.
- Added pointer-contract coverage requiring all five lane front doors to be present in `latest-quipsly-return-brief.json`.
- Refreshed return brief, pointer-contract validation, OS validation, and current production blockers.
- Validation: pointer contract passed 218/218 checks; OS validation passed 411/411 checks.
- Safety boundary unchanged: front-door routing only. No source mutation, metadata write, approval, publish, upload, schedule, account mutation, delete, overwrite, or receipt truth.

## 2026-06-27 19:05 UTC - Nest writing publication runway repaired and surfaced

- Fixed `build_writing_publication_runway.py` discovery so it accepts the DraftPackets root, a specific draft-packet session directory, or a direct `draft-packet.json` file.
- Generated a fresh writing publication runway from Nest draft packets: 15 current drafts, 363 total preserved draft versions, 75 platform draft items, 60 receipt slots, 0 captured receipts, and 0 unsafe packets.
- Surfaced the writing publication runway in the Quipsly return brief and latest pointer as a Nest open target and Tower bridge.
- Added pointer-contract coverage for runway generation, draft visibility, platform/receipt visibility, and no fake publication/source mutation claims.
- Refreshed Nest author/review/daily surfaces, return brief, pointer-contract validation, OS validation, and current production blockers.
- Validation: Python compile passed for the touched scripts; pointer contract passed 229/229 checks; OS validation passed 411/411 checks.
- Safety boundary: local writing review/publication-prep only. No canonical manuscript replacement, source mutation, external publishing, upload, scheduling, approval, account mutation, delete, overwrite, or receipt truth.

## 2026-06-27 19:11 UTC - Studio watch/listen review room surfaced

- Generated the Studio watch/listen review room for current Studio review blockers: Episode 1 v004 duration candidate and Episode 4 sync/duration investigation.
- Surfaced the room in the Quipsly return brief and latest pointer as a Studio open target alongside package quality and review surfaces.
- Review room carries 2 review items, 16 embeddable media rows, 25 evidence rows, 2 local decision note templates, and explicit non-claims for publication/approval/source mutation.
- Added pointer-contract coverage for watch/listen readiness, review-item/media visibility, note templates, and read-only truth.
- Refreshed return brief, pointer-contract validation, OS validation, and current production blockers.
- Validation: Python compile passed for touched scripts; pointer contract passed 240/240 checks; OS validation passed 411/411 checks.
- Safety boundary: local watch/listen evidence only. No approval, promotion, source mutation, export, upload, publication, schedule, account mutation, delete, overwrite, or receipt truth.

- 2026-06-27 19:22 UTC - Studio watch/listen review room gained safe local decision command rows. Latest room exposes dry-run and local-ledger commands for each review item; pointer contract now requires this operator surface so the room cannot regress into passive documentation. No source media, package versions, publication state, schedules, accounts, or receipt truth were mutated.

- 2026-06-27 19:29 UTC - Photo Grove Proof Desk now opens with one next cull card. Latest desk exposes 160 source photos, 24 starter candidates, 8 cull groups, and a first next-cull row with 6 dry-run command rows. Pointer contract now requires next-cull visibility from the proof desk. No original photo files, metadata ledger writes, proof selections, copy plans, deliveries, uploads, publications, schedules, account state, or receipt truth were mutated.

- 2026-06-27 19:36 UTC - Nest daily writing packet now carries the current next writing card. Latest daily packet exposes 3 selected source-backed tasks plus a next-writing-card action for manuscript/learning-to-lead.living.mdx; pointer contract now requires the current next-card path to exist. No source files, canonical manuscript text, publications, uploads, schedules, approvals, account state, overwrites, or receipt truth were mutated.

- 2026-06-27 19:41 UTC - Studio360 Source Desk now opens with one next source inspection card. Latest desk exposes 220 assets, 100 groups, 76 reframe-ready groups, 16 proof outputs, 3 repair tickets, and a rank-zero next-source card with 5 source paths. Pointer contract now requires next-source visibility from the source desk. No proxy generation, repair, render, export, upload, publication, schedule, metadata write, source mutation, delete, overwrite, account state, or receipt truth occurred.

2026-06-27 19:55 UTC - Quipsly return brief now carries one bite-sized safe next action per lane in JSON, markdown, HTML, and pointer payload. Pointer contract validates the five-lane action layer so Charlie, reviewers, and agents can start from one reversible local move instead of re-solving the OS board. Latest validation: pointer contract and OS validation both passed; no external publication/upload/schedule/account/receipt/source mutation occurred.

2026-06-27 20:00 UTC - Added read-only quipsly-next-action agentctl command. It prints the latest return brief bite-sized next actions for all lanes or a filtered lane, with JSON output for agents. Validated py_compile, agentctl syntax, human output, JSON lane filter, pointer contract, return brief regeneration, and OS validation. No commands from the printed actions were executed; no source/publish/upload/schedule/account/receipt mutation occurred.

2026-06-27 20:06 UTC - Current production blocker doc now writes a stable QuipslyOS latest-current-production-blockers.json pointer plus the Desktop Markdown handoff. The blocker payload carries five bite-sized next actions so stalled lanes do not stop the conveyor. Validated script compile, current-production-blockers generation, OS pointer status, Desktop markdown path, and OS validation. No source/export/publish/upload/schedule/account/receipt mutation occurred.

2026-06-27 20:10 UTC - Quipsly OS validation now checks the current production blocker OS pointer and confirms the blocker payload carries five bite-sized fallback actions. Validation passed after the contract update. This keeps blockers discoverable from QuipslyOS instead of only from Desktop/release-root side effects.

2026-06-27 20:12 UTC - Quipsly OS validation now checks the current production blocker OS pointer and confirms the blocker payload carries five bite-sized fallback actions. Validation passed 413/413 after the contract update. This keeps blockers discoverable from QuipslyOS instead of only from Desktop/release-root side effects.

2026-06-27 20:18 UTC - Ran the Nest writing next action for book-section-manuscript-learning-to-lead-living-mdx and created a new versioned local draft packet. Hardened the draft-packet CLI summary to expose status, counts, firstSafeAction, nextSafestAction, and truth without JSON chasing. Refreshed daily packet, return brief, and OS validation. No canonical manuscript replacement, source mutation, publication, upload, schedule, account mutation, overwrite, or receipt truth occurred.

2026-06-27 20:26 UTC - Photo Grove next-cull flow now carries exact safe dry-run commands through the next-cull card, Proof Desk, return brief, and `quipsly-next-action photo`. Validated Python compile, regenerated next-cull/proof-desk/return-brief/current-blocker artifacts, pointer contract passed 248/248, and Quipsly OS validation passed 413/413. No live metadata write, source mutation, export, delivery, upload, publication, schedule, approval, account mutation, or receipt truth occurred.

2026-06-27 20:34 UTC - Tower next-publishing card now promotes a concrete local review dry-run command from the source action card into the card pointer, return brief, and `quipsly-next-action tower`. The generated command uses conservative `pending` review state and reviewer `Codex` so it previews the ledger path without approval, upload, publication, scheduling, account mutation, or receipt truth. Validated Python compile, regenerated Tower next card, return brief, current blockers, pointer contract passed 250/250, and Quipsly OS validation passed 413/413.

2026-06-27 20:43 UTC - Studio360 next-source and Source Desk now carry the first local proof command from renderer preflight evidence, labeled as a local proof command rather than a dry-run because running it would create a 10-second proof file. `quipsly-next-action 360` exposes the command with aspect/safety while the card/desk do not execute it. Validated Python compile, regenerated Studio360 next source card, Source Desk, return brief, current blockers, pointer contract passed 253/253, and Quipsly OS validation passed 413/413. No proxy, render, export, repair, upload, publication, schedule, metadata write, source mutation, delete, overwrite, approval, account mutation, or receipt truth occurred.

2026-06-27 20:52 UTC - Nest writing next-action now exposes safe draft-preview command
- Added safeDraftPacketCommand/safeDraftPacketSafety to the operator-facing next-writing-card summary, latest next-card pointer, daily-packet pointer, return brief, and quipsly-next-action writing output.
- The command is explicitly source-backed preview work only: it creates a local draft packet and does not replace canonical manuscript text, mutate source files, publish, upload, schedule, approve, overwrite, mutate accounts, or create receipt truth.
- Validation: pointer contract passed 255/255; Quipsly OS validation passed 413/413; current production blockers regenerated with 6 reviewable packages, 38 ready shorts, and 5 bite-sized next actions.

2026-06-27 20:59 UTC - Nest writing draft packets now separate MDX/source structure from human-facing prose
- Fixed draft packet generation so YAML frontmatter and ManuscriptBlock component attributes stay in source/provenance truth instead of leaking into the draft copy.
- Regenerated the safe Learning to Lead draft packet at /Volumes/My Passport/Quipsly Media Workspace/NestWriting/DraftPackets/20260627-145952-115360-book-section-manuscript-learning-to-lead-living-mdx/index.html.
- Packet remains draft-preview only: sourceFilesMutated=false, canonicalManuscriptReplaced=false, externalPublishing=false, receiptTruthCreated=false.
- Validation: pointer contract passed 255/255; Quipsly OS validation passed 413/413.

2026-06-27 21:03 UTC - Studio360 local proof command executed and validated
- Ran the first safe local 360 proof command from quipsly-next-action for group 20250613-143420.
- Created /Volumes/My Passport/Quipsly Media Workspace/Studio360/PreparedExports/20250613-143420/v006/16x9/studio360-20250613-143420-16x9-v006-proof10s.mp4 without mutating originals or publishing externally.
- ffprobe validation: 10.01s, H.264, 1920x1080, AAC audio.
- Regenerated Studio360 source desk and next-source card; source desk now reports proofOutputsPresent=16 and proofOutputsMissing=0.
- Validation: pointer contract passed 255/255; Quipsly OS validation passed 413/413.

2026-06-27 21:04 UTC - Safe local dry-runs proven across Studio, Photo Grove, and Tower
- Photo Grove dry-run previewed routing _MG_5232.CR3 from pending to review with tag needs-human-cull; ledgerMutated=false and originalsMutated=false.
- Studio review dry-run previewed Episode 1 v004 duration candidate review evidence with beginning/middle/ending snippets; ledgerMutated=false, eventAppended=false, packagePromotionsCreated=false, receiptTruthCreated=false.
- Tower review dry-run previewed Episode 6 longForm16x9 pending review for YouTube; ledgerMutated=false, externalActionTaken=false, mediaMutated=false, eventAppended=false.
- This keeps review readiness, approval, and publication receipt truth separate while giving humans/agents exact safe next actions.

2026-06-27 21:10 UTC - Studio360 proof actions are now state-aware
- Updated Studio360 next-source card, source desk, return brief, next-action CLI, and pointer contract validation so local proof actions switch from render-command to review-command after a proof output exists.
- Current next 360 action now opens /Volumes/My Passport/Quipsly Media Workspace/Studio360/PreparedExports/20250613-143420/v006/16x9/studio360-20250613-143420-16x9-v006-proof10s.mp4 instead of rerunning ffmpeg -n against an existing output.
- Validation: next source card reports firstLocalProofOutputExists=true, firstLocalProofReviewCommand present, firstLocalProofCommand empty; pointer contract passed 255/255; Quipsly OS validation passed 413/413.

2026-06-27 21:16 UTC - Photo Grove next-cull card now prefers viewable evidence
- Replaced first-card-wins selection with source-aware scoring that prefers source-present, thumbnail-present, non-blank review candidates unless a specific photo id is requested.
- Latest next cull card now selects _MG_5233.CR3 instead of the previous blank-preview _MG_5232.CR3, and reports selectionDiagnostics showing 4 blank/suspect preview candidates skipped.
- The skipped candidates remain visible in diagnostics instead of being hidden or deleted.
- Validation: next cull card ready, selected qualityFlags exclude preview-all-white/blank-preview-candidate, pointer contract passed 255/255, Quipsly OS validation passed 413/413.

2026-06-27 21:23 UTC - Tower next-publishing card now labels review-only packets honestly
- Added publishReady/readinessLabel/reviewOnlyReason to Tower next-publishing payload, pointer, rendered card, and summary output.
- Current Tower next action now reads "Review Episode 6 -> YouTube packet (not publish-ready)" with publishReady=false and next action limited to local review/repair/pending decisions.
- This reduces the risk of confusing local packet prep with external publishing approval.
- Validation: pointer contract passed 255/255; Quipsly OS validation passed 413/413.

2026-06-27 21:31 UTC - Studio next action now opens review evidence before decision dry-run
- Updated the return-brief bite-sized Studio action so the primary command opens the watch/listen review room.
- Moved studio-review-decision-dry-run into the secondary firstDryRunCommand slot, matching the intended human flow: inspect evidence first, rehearse/record decisions second.
- Validation: Studio next action openCommand is an open command and firstDryRunCommand is the local decision dry-run; pointer contract passed 255/255; Quipsly OS validation passed 413/413.

2026-06-27 21:39 UTC - Studio duration warnings are now first-class next actions
- Added a direct `agentctl` front door for duration warning review packets: `./script/agentctl.sh studio-duration-warning-review-packet [/release-root] [--no-derivatives]`.
- Current production blockers now carry `durationWarningReview`, `firstWarningAction`, and per-warning-card review commands that point to the latest local duration evidence packet.
- Return brief bite-sized Studio action now prioritizes the duration warning packet when warning episodes exist, while keeping the Studio review dry-run as a secondary safe command.
- Fixed warning-card enrichment so only true warning episodes receive duration-warning actions; aligned `0:00` episodes stay unflagged.
- Current warning episodes: Episode 1 (`2:09` spread) and Episode 4 (`33:44` spread). The next action is evidence review, not repair, approval, promotion, Tower handoff, upload, schedule, publication, or receipt truth.
- Validation: Python compile passed; `zsh -n script/agentctl.sh` passed; `quipsly-next-action --json` shows Studio `Review duration warning packet (2 episodes)`; pointer contract passed 255/255; Quipsly OS validation passed 413/413.
- Safety boundary: local review routing only. No original media, packages, manuscripts, source files, external accounts, schedules, uploads, publication state, approvals, overwrites, deletes, or receipt truth were mutated.

2026-06-27 21:43 UTC - Duration warning routing is now contract-protected
- Added pointer-contract checks for the duration warning review packet and current production blocker warning action.
- Contract now requires the latest duration packet to expose a safe open action, review-only truth, and at least two warning episodes.
- Contract now requires current production blockers to expose duration warning counts, a first warning action, and warning-card enrichment only for true warning episodes. This protects against the aligned `0:00` cards being flagged again.
- Validation: pointer contract passed 269/269; Quipsly OS validation passed 413/413.
- Safety boundary: validation and pointer checks only. No media, manuscript, source, external account, schedule, upload, publication, approval, overwrite, delete, or receipt truth was mutated.

2026-06-27 21:59 UTC - Photo Grove gained a compact next-cull batch runway
- Added `script/build_photo_grove_next_cull_batch.py` and `./script/agentctl.sh photo-grove-next-cull-batch [/photo-root] [--limit N]`.
- The new batch surface reads the latest cull theater, selects one coherent source-backed group, and writes a versioned local packet under `PhotoGrove/NextCullBatches` with HTML, Markdown, CSV, JSON, dry-run commands, and a latest pointer.
- Latest batch: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/NextCullBatches/20260627-215801-304236-photo-grove-next-cull-batch/index.html`.
- Latest batch status: `photo-grove-next-cull-batch-ready`; group `sequence-001`; mode `mixed-source-check`; 12 rows; 12 source rows; 12 thumbnail rows; 5 thumbnail-suspect rows; 10 dry-run command rows.
- Updated the return brief and `quipsly-next-action` so Photo Grove now starts from `Review next Photo Grove cull batch (12 photos)` instead of only a one-photo card.
- Added pointer-contract coverage for the next-cull batch: ready status, useful row/dry-run counts, safe open action, first dry-run command, and read-only truth.
- Validation: Python compile passed; `zsh -n script/agentctl.sh` passed; pointer contract passed 280/280; Quipsly OS validation passed 413/413.
- Safety boundary: local batch review and dry-run commands only. No original photos, sidecars, metadata, proof selections, copies, exports, deliveries, uploads, publications, schedules, approvals, account state, overwrites, deletes, or receipt truth were mutated.

2026-06-27 22:23 UTC - Nest writing gained a compact next-revision batch runway
- Added `script/build_nest_writing_next_revision_batch.py` and `./script/agentctl.sh nest-writing-next-revision-batch [/nest-root] [--limit N]`.
- The new batch reads the latest Nest writing review desk plus writing publication runway, then writes a versioned local packet under `NestWriting/NextRevisionBatches` with HTML, Markdown, CSV, JSON, source-check/revision/review rows, and safe open commands only.
- Latest batch: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/NextRevisionBatches/20260627-221612-631742-nest-writing-next-revision-batch/index.html`.
- Latest batch status: `nest-writing-next-revision-batch-ready`; 5 rows; 1 source-check row; 3 revision rows; 1 review row; 5 openable/source-linked rows; 25 platform draft items; 20 receipt slots.
- Updated the return brief and `quipsly-next-action` so Nest writing now has a compact first move: `Review next writing revision batch (5 drafts)` before deeper daily packet/author desk work.
- Added pointer-contract coverage for the revision batch: ready status, useful rows, source/revision queue presence, read-only truth, return-brief open target, and conveyor routing.
- Updated OS refresh sequencing so `refresh_quipsly_os_runway.py` regenerates the revision batch alongside other Nest writing surfaces.
- Validation: Python compile passed; `zsh -n script/agentctl.sh` passed; pointer contract passed 291/291; Quipsly OS validation passed 413/413; blocker sheet now reports pointer contract passed with 291 checks.
- Safety boundary: local writing review/revision routing only. No source files, canonical manuscripts, publications, uploads, schedules, approvals, previous versions, accounts, deletes, or receipt truth were mutated.

2026-06-27 22:43 UTC - Tower gained a compact next-publishing batch runway
- Added `script/build_tower_next_publishing_batch.py` and `./script/agentctl.sh tower-next-publishing-batch [/release-root] [--limit N]`.
- The new batch reads the latest Tower social command center and writes a versioned local packet under `tower-next-publishing-batch` with HTML, Markdown, CSV, JSON, manual packet review rows, shorts review rows, dry-run commands, local short review commands, and a latest pointer.
- Latest batch: `/Volumes/My Passport/Episode_and_Shorts_Test/tower-next-publishing-batch/20260627-224157-892153-tower-next-publishing-batch/index.html`.
- Latest batch status: `tower-next-publishing-batch-ready`; 8 rows; 3 manual long-form packet rows; 5 short review rows; 3 dry-run review rows; 5 local short-review command rows; 8 empty receipt slots; 0 captured receipts; 0 publish-ready rows.
- Updated the return brief so Tower starts from `Tower next publishing batch` as a compact local review tray while keeping the larger social command center and operator workbench available.
- Added pointer-contract coverage for the batch: ready status, useful manual/short rows, visible dry-run/local-review actions, empty receipt boundary, read-only truth, and return-brief open target.
- Validation: Python compile passed; `zsh -n script/agentctl.sh` passed; pointer contract passed 303/303; Quipsly OS validation passed 413/413; return brief regenerated with pointerContractValidationFailures=0 and openTargets=58.
- Safety boundary: local review and publishing-prep routing only. No upload, external publication, scheduling, approval, account mutation, source mutation, overwrite, delete, or receipt truth was created.

2026-06-27 22:58 UTC - Studio review theater now reconstructs long-form package media
- Fixed `script/build_studio_review_theater.py` so the review theater no longer depends only on rich `mediaReviewChecklist.artifactRows` evidence. When artifact rows are absent, it now infers the primary 16:9 video, 9:16 video, and podcast audio from each episode version folder without mutating media.
- Latest review theater: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/studio-review-theater/20260627-225705-209653-studio-review-theater/index.html`.
- Latest review theater counts: 6 episodes; 12 video rows; 6 audio rows; 37 linked short rows; 0 missing artifacts; 0 captured receipts.
- Validation: Python compile passed; `zsh -n script/agentctl.sh` passed; pointer contract passed 303/303; Quipsly OS validation passed 413/413.
- Safety boundary: local review indexing only. No original media, package media, manifests, manuscripts, source files, publication state, approvals, external uploads, schedules, account state, overwrites, deletes, or receipt truth were mutated.

2026-06-27 23:05 UTC - Current blocker sheet now reads stable validation pointers directly
- Fixed `script/build_current_production_blocker_doc.py` so `/Users/wall-e/Desktop/Quipsly_Episode_Export_Blockers.md` reads the stable latest pointer-contract validation and Studio review-theater pointers directly instead of relying only on the return brief snapshot.
- This prevents a refreshed validation run from being hidden behind stale return-brief evidence.
- Validation: Python compile passed; `zsh -n script/agentctl.sh` passed; pointer contract passed 303/303; current production blocker sheet reports pointer contract passed 303/303; Quipsly OS validation passed 413/413.
- Safety boundary: local blocker/report truth only. No original media, package media, manifests, manuscripts, source files, publication state, approvals, external uploads, schedules, account state, overwrites, deletes, or receipt truth were mutated.

2026-06-27 23:12 UTC - Canonical release board now agrees with duration and artifact truth
- Fixed `script/build_release_review_board.py` so the canonical release review board enriches warning rows from the duration-warning packet and normalizes artifact discovery across both manifest shapes: legacy `artifacts` and newer `video`/`audio` arrays.
- Added safe version-folder fallback for package media when a manifest is thin, including Episode 5 top-level full-release files and discovered shorts. Originals and package media are only read, never mutated.
- Latest release board now reports Episodes 1 and 4 as warning episodes, not Episode 1 only. Episode 5 no longer falsely reports missing long-form media.
- Fixed `script/build_current_production_blocker_doc.py` so ready/package/short counts prefer the current Studio package-quality desk over older review-work-session snapshots.
- Current review truth: 6 current-best packages; 6 reviewable packages; 43 ready/reviewable shorts; 2 warning episodes; 48 receipt slots; 0 captured receipts.
- Validation: Python compile passed; pointer contract passed 303/303; current production blocker sheet reports pointer contract passed and 43 ready shorts; Quipsly OS validation passed 413/413.
- Safety boundary: local review/report normalization only. No original media, package media, manifests, manuscripts, source files, publication state, approvals, external uploads, schedules, account state, overwrites, deletes, or receipt truth were mutated.

2026-06-27 23:29 UTC - Studio gained a compact next-shorts review batch
- Added `script/build_studio_next_shorts_review_batch.py` and `./script/agentctl.sh studio-next-shorts-review-batch [/release-root] [--limit N] [--include-warnings]`.
- The new batch reads the canonical release review board and writes a versioned local packet under `review-board/shorts-review-batches` with HTML, Markdown, CSV, JSON, embedded local video players, open/reveal commands, note templates, and local dry-run review commands.
- Latest default batch: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-batches/20260627-232837-482731-shorts-review-batch/index.html`.
- Latest default batch status: `studio-next-shorts-review-batch-ready`; 43 source shorts; 12 batch rows; 12 playable rows; 12 audio rows; 12 dry-run rows; 0 warning-episode rows; 0 captured receipts.
- Default sorting routes around Episode 1 and Episode 4 warning episodes so reviewers can start with safer shorts from aligned packages. `--include-warnings` remains available for explicit warning review.
- Added the batch to `refresh_quipsly_os_runway.py` so it is regenerated with the broader OS runway refresh.
- Validation: Python compile passed; `zsh -n script/agentctl.sh` passed; direct generator and agentctl command passed; Quipsly OS validation passed 413/413.
- Safety boundary: local shorts watch/listen review only. No source media mutation, approval, upload, publication, scheduling, account mutation, overwrite, delete, or receipt truth occurred.

## 2026-06-27 23:45 UTC - Shorts review batch promoted into blocker front door

- Added `studioNextShortsReviewBatch` to the current production blocker payload so the Desktop blocker sheet no longer hides shorts review behind generic ready-short counts.
- Regenerated `/Users/wall-e/Desktop/Quipsly_Episode_Export_Blockers.md` with a new **Best first shorts review surface** section pointing at `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-batches/20260627-232837-482731-shorts-review-batch/index.html`.
- Current shorts batch evidence: 43 source shorts, 12 batch rows, 12 playable rows, 12 dry-run rows, 0 warning-episode rows, 12 receipt slots, 0 captured receipts.
- Safety boundary stayed intact: no publication, upload, schedule, approval, receipt truth, source mutation, version overwrite, or file deletion.
- Validation run: `python3 -m py_compile script/build_current_production_blocker_doc.py`, `zsh -n script/agentctl.sh`, `./script/agentctl.sh current-production-blockers`, and `./script/agentctl.sh quipsly-pointer-contract-validation` with pointer contract result 315/315 and 0 failures.

2026-06-28 00:06 UTC - Return brief and blocker front doors reconciled after shorts batch refresh
- Refreshed the Quipsly return brief after the latest Studio next-shorts review batch so the global open-target list exposes `Studio next shorts review batch` again.
- Re-ran pointer contract validation; result is passed with 315/315 checks and 0 failures.
- Regenerated `/Users/wall-e/Desktop/Quipsly_Episode_Export_Blockers.md`; blocker sheet now reports pointer contract passed, 6 current-best packages, 6 reviewable packages, 43 ready shorts, 2 warning episodes, 48 receipt slots, and 0 captured receipts.
- Latest return brief: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ReturnBriefs/20260628-000627-192726-quipsly-return-brief/index.html`.
- Latest pointer validation: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/PointerContractValidation/20260628-000627-588882-pointer-contract-validation/index.html`.
- Safety boundary: local review/runway artifact refresh only. No original media, manuscripts, source files, external uploads, schedules, approvals, publications, account state, overwrites, deletes, or receipt truth were mutated.

2026-06-28 00:13 UTC - Episode duration experiment matrix created
- Added `script/build_episode_duration_experiment_matrix.py` to generate a review-only duration experiment matrix from current package evidence.
- Generated `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-experiment-matrix/20260628-001314-007130-duration-experiment-matrix/index.html` and companion Markdown/JSON.
- Current measured package durations: Episode 1 36:20 video vs 34:12 podcast audio, Episode 2 43:45 aligned, Episode 3 45:18 aligned, Episode 4 1:19:29 video vs 1:53:13 podcast audio, Episode 5 1:45:58 aligned, Episode 6 1:14:14 aligned.
- The matrix proposes multiple target durations per episode and explains the tradeoff for podcast-tight, standard, full conversation, salvage, digest, and repair cuts where appropriate.
- Safety boundary: review-only planning artifact. No original media, existing exports, external uploads, schedules, approvals, publications, accounts, overwrites, deletes, or receipt truth were mutated.
- Validation: `python3 -m py_compile script/build_episode_duration_experiment_matrix.py`.

## 2026-06-28 00:29 UTC - Episode duration experiment matrix promoted into Studio runway
- Built the Episode 1-6 duration experiment matrix as a review-only artifact under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-experiment-matrix/`.
- Added the matrix to `agentctl` as `studio-duration-experiment-matrix` so humans and agents can refresh it directly.
- Added the matrix to the Quipsly return brief open targets and the current production blocker sheet.
- Added pointer-contract coverage so the matrix must expose a safe first action, cover Episodes 1-6, stay read-only, and appear in the return brief.
- Validation: Python compile and shell syntax passed; matrix, return brief, pointer validation, and current blocker refresh all passed.
- Safety boundary: duration experiments are planning/review artifacts only. They do not render, approve, publish, overwrite, mutate source media, or create receipt truth.

## 2026-06-28 00:40 UTC - Episode duration version work orders added to Studio runway
- Added `script/build_episode_duration_version_workorders.py` to turn the duration experiment matrix into 18 named review-only work orders across Episodes 1-6.
- Each work order carries target duration, intended use, editorial tradeoff, platform focus, current evidence links, caution notes, and safe next action toward edit-recipe creation.
- Wired `studio-duration-version-workorders` into `agentctl`, the Quipsly OS refresh conveyor, the return brief open targets, the Desktop/current blocker sheet, and pointer-contract validation.
- Current output: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-version-workorders/20260628-003935-507614-duration-version-workorders/index.html`.
- Validation: Python compile passed, `agentctl` syntax passed, duration matrix regenerated, work orders generated, return brief regenerated, current production blockers regenerated, and pointer contract passed 335/335.
- Safety boundary: work orders are local planning artifacts only. No edit recipes, renders, approvals, uploads, publications, schedules, overwrites, source mutations, deletes, or receipt truth were created.

## 2026-06-28 00:49 UTC - Duration edit-recipe skeletons added to Studio runway
- Added `script/build_episode_duration_edit_recipe_skeletons.py` to convert the 18 duration work orders into review-only edit-recipe skeletons.
- Each skeleton carries target duration, intended use, editorial tradeoff, pacing strategy, decision passes, source principle, cautions, and a safe next action toward boundary/transcript/story/timeline decision work.
- Wired `studio-duration-edit-recipe-skeletons` into `agentctl`, the Quipsly OS refresh conveyor, the return brief open targets, the Desktop/current blocker sheet, and pointer-contract validation.
- Current output: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-edit-recipes/20260628-004835-075269-duration-edit-recipes/index.html`.
- Validation: Python compile passed, `agentctl` syntax passed, work orders regenerated, recipe skeletons generated, return brief regenerated, current production blockers regenerated, and pointer contract passed 345/345.
- Safety boundary: recipe skeletons are local planning artifacts only. No timeline decisions, renders, approvals, uploads, publications, schedules, overwrites, source mutations, deletes, or receipt truth were created.

## 2026-06-28 01:10 UTC - Transcript source work orders added to Studio runway
- Added `script/build_episode_transcript_source_workorders.py` to inventory audio-bearing episode sources before automatic transcription.
- The board ranks high-quality external audio, call recordings, exported podcast/video audio, video scratch audio, and derivative/social outputs so future ASR can compare candidates instead of guessing transcript truth from one file.
- Wired `studio-transcript-source-workorders` into `agentctl`, the Quipsly OS refresh conveyor, the return brief open targets, the Desktop/current blocker sheet, and pointer-contract validation.
- Current output: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-source-workorders/20260628-010828-440439-transcript-source-workorders/index.html`.
- Inventory counts: 958 audio-bearing sources, 139 high-priority sources, 139 audio-only sources, 819 video-audio sources, 32 high-quality external audio sources, 8 call recordings, 66 podcast masters, 171 derivative/social sources, and 28 probe failures.
- Validation: Python compile passed, `agentctl` syntax passed, transcript work orders generated, return brief regenerated, current production blockers regenerated, pointer contract passed 354/354, and Quipsly OS validation passed 413/413.
- Safety boundary: transcript source work orders are inventory/planning artifacts only. No ASR, transcript sidecars, imports, timeline decisions, renders, approvals, uploads, publications, schedules, overwrites, source mutations, deletes, or receipt truth are created.

## 2026-06-28 01:32 UTC - Daily Writing Desk readiness added to Nest runway
- Added `script/build_daily_writing_desk_readiness.py` to create a local readiness board for the book-writing surface decision: web/Nest first, native local-first in parallel, one document model underneath both.
- Current board: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/DailyWritingReadiness/20260628-013213-083457-daily-writing-readiness/index.html`.
- Current recommendation: start serious daily book writing in the web/Nest surface first; do not move daily writing into native until autosave, manual snapshots, panic export, rollback, and kernel/sidecar persistence are explicit.
- Counts: 12 readiness requirements, 9 web-ready/partial items, 1 native-ready/partial/natural-fit item, 5 existing Nest pointers, and 4 existing surface paths.
- Wired `daily-writing-desk-readiness` into `agentctl`, the Quipsly OS refresh conveyor, the return brief, the Desktop/current blocker sheet, and pointer-contract validation.
- Validation: Python compile passed, `agentctl` syntax passed, Daily Writing Desk readiness generated, return brief regenerated, current production blockers regenerated, pointer contract passed 365/365, and Quipsly OS validation passed 413/413.
- Safety boundary: readiness/planning artifact only. No manuscript mutation, canonical replacement, source mutation, publication, upload, schedule, approval, overwrite, delete, or receipt truth occurred.

## 2026-06-28 01:45 UTC - Transcript execution readiness added to Studio runway
- Added `script/build_episode_transcript_execution_readiness.py` to turn transcript source work orders into a deliberate ASR execution queue.
- Current board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-execution-readiness/20260628-014535-493288-transcript-execution-readiness/index.html`.
- The board selects first-pass sources per episode from the 958-source transcript inventory and writes deterministic planned paths for raw provider output, normalized transcript JSON, and reconciled transcript spines.
- Current counts: 7 episode buckets, 39 selected first-pass sources, 39 ASR commands ready, 139 high-priority candidate sources, 958 inventoried audio-bearing sources, 0 ASR runs, 0 raw provider outputs, 0 normalized transcripts, and 0 reconciled transcript spines.
- Provider doctor currently reports provider availability, so the next safe move is to run one high-priority ASR command into a planned raw sidecar, then normalize/review before importing anything as transcript truth.
- Wired `studio-transcript-execution-readiness` into `agentctl`, the Quipsly OS refresh conveyor, the return brief open targets, the Desktop/current blocker sheet, and pointer-contract validation.
- Validation: Python compile passed, `agentctl` syntax passed, transcript execution readiness generated, return brief regenerated, current production blockers regenerated, pointer contract passed 375/375, and Quipsly OS validation passed 413/413.
- Safety boundary: execution-readiness planning only. No ASR, sidecar writes, transcript imports, timeline decisions, renders, approvals, uploads, publications, schedules, overwrites, source mutations, deletes, or receipt truth occurred.

## 2026-07-01 Episode 4 duration recipes gained transcript-pilot evidence
- Updated `script/episode4_clip_weave_duration_plan.py` so Episode 4 duration choices now produce machine-readable edit variant recipes over one synced spine: full review, YouTube standard, tight feature, clip-weave proof, and shorts family.
- The plan now reads the focused Episode 4 transcript workorder pointer and the focused transcript pilot pointer, showing ASR pilot evidence separately from full transcript truth.
- Live validation against Quipsly Studio reported Episode 4 as synced/editable with 19 lanes, 6 production video lanes, 5 duration choices, and 5 edit variant recipes.
- Current truth: Episode 4 still has 0 addressable source/reference clip lanes, so clip-weave remains a proof target, not a proven edit. The transcript pilot is excerpt-only: 14 segments and 208 timed words from a managed 120s excerpt.
- Safety boundary: planning and recipe metadata only. No source media mutation, transcript import, timeline edit, export, upload, publication, schedule, approval, overwrite, delete, or receipt truth occurred.

## 2026-07-01 Episode 4 source-clip candidate workbench added
- Added `script/experimental/build_episode4_source_clip_workbench.py` and wired `./script/agentctl.sh episode4-source-clip-workbench` as a read-only source/reference clip discovery surface.
- The workbench scans likely Episode 4/source media roots, excludes already attached live session paths, probes video candidates with ffprobe, ranks candidates, and writes JSON/Markdown/HTML plus safe attach commands.
- Latest run produced 40 candidate rows at `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-candidates/20260701-080446-594419-source-clip-candidates/index.html`.
- Top candidate was `/Volumes/My Passport/Podcast_Episodes/Episode_4_Apr_2026/VID_20260411_070647_00_060.insv` (17.52s, 3840x3840, hevc, audio present), but it is candidate evidence only and still needs preview/confirmation before import.
- Safety boundary: discovery only. No import, sync decision, timeline edit, source media mutation, export, upload, publication, schedule, overwrite, delete, approval, or receipt truth occurred.

## 2026-07-01 Episode 4 source-clip workbench gained preview frames
- Extended `script/experimental/build_episode4_source_clip_workbench.py` to generate local preview thumbnails for top source/reference candidates when ffmpeg is available.
- Latest preview-enabled board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-candidates/20260701-080733-456772-source-clip-candidates/index.html`.
- Latest counts: 223 scanned files, 213 filtered candidate files, 40 displayed candidate rows, 16 preview images attempted for top rows.
- Top preview frame is `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-candidates/20260701-080733-456772-source-clip-candidates/previews/01-VID_20260411_070647_00_060.jpg`.
- Safety boundary remains discovery/review only. No import, sync decision, timeline edit, source mutation, export, upload, publication, schedule, overwrite, delete, approval, or receipt truth occurred.

## 2026-07-01 Episode 4 watched-clip intake clarified
- User confirmed the actual clips watched during Episode 4 may not be in the Episode 4 folder yet.
- Updated `script/experimental/build_episode4_source_clip_workbench.py` so candidates now expose `confirmationStatus` values such as `nearby-episode-media-unconfirmed` instead of implying found media is confirmed watched/source material.
- Created drop folders for future confirmed material: `/Volumes/My Passport/Episode 4/Watched Clips`, `/Volumes/My Passport/Episode 4/Source Clips`, and `/Volumes/My Passport/Episode 4/Reference Clips`.
- Regenerated the workbench with early/middle/late preview frames. Latest board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-candidates/20260701-081559-839573-source-clip-candidates/index.html`.
- Current truth: 40 candidates are reviewable, but the top nearby files are unconfirmed. Real watched clips should be placed in the drop folders, then the workbench rerun before any import/reference-lane weave decisions.
- Safety boundary: no import, sync decision, timeline edit, source mutation, export, upload, publication, schedule, overwrite, delete, approval, or receipt truth occurred.

## 2026-07-01 08:28 UTC - Episode 4 resumable transcript chunks added

- Added `script/experimental/run_episode4_transcript_chunks.py` as a resumable full-source ASR chunk runner for Episode 4.
- Registered `agentctl episode4-transcript-chunks` aliases: `episode4-full-transcript` and `transcript-chunks`.
- The runner reads Episode 4 transcript execution readiness when available, falls back to known local Episode 4 audio candidates, creates managed WAV chunks, runs one or more ASR chunks per invocation, normalizes output into Quipsly transcript JSON, and writes a review-board manifest/HTML surface.
- Current safety boundary: no transcript import, no reconciled transcript spine write, no timeline edit, no export, no external upload/publish/schedule, no source media mutation, no overwrite of prior sessions, and no deletion.
- Product reason: watched/source clips are currently unconfirmed, so transcript readiness can keep Episode 4 moving while Charlie locates the clips actually watched during recording.

## 2026-07-01 08:44 UTC - Episode 4 transcript cue finder added

- Added `script/experimental/build_episode4_transcript_cue_finder.py` and `agentctl episode4-transcript-cues`.
- The cue finder scans completed Episode 4 transcript chunks for likely watched/source clip moments and creates a review board with cue windows and explicit drop-folder instructions.
- Current drop folders remain the source-of-truth seam for confirmed clip intake: `/Volumes/My Passport/Episode 4/Watched Clips`, `/Volumes/My Passport/Episode 4/Source Clips`, and `/Volumes/My Passport/Episode 4/Reference Clips`.
- Tightened cue matching to prefer actual media language like clip/video/footage/watch/platform terms and explicit phrases like "show some clips" instead of broad conversational words like see/show alone.
- Safety boundary: no clip import, no timeline decision write, no transcript import, no source mutation, no export, and no publication.

## 2026-07-01 08:52 UTC - Episode 4 full ASR draft spine completed

- Ran `agentctl episode4-transcript-chunks` to completion against `/Volumes/My Passport/Episode 4/Charlie Ep4.wav` using managed 180-second chunks.
- Current transcript chunk board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-full-asr/episode-04/20260701-083030-062500-transcript-chunks/index.html`.
- Current transcript chunk JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-full-asr/episode-04/20260701-083030-062500-transcript-chunks/episode-04-transcript-chunks.json`.
- Result: 38/38 chunks normalized, 0 failed, 1,297 transcript segments, and 13,013 timed words.
- Rebuilt Episode 4 transcript cue board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-transcript-cues/20260701-085130-641395-transcript-cues/index.html`.
- Cue board result: 25 cue hits grouped into 14 review windows, including 7 high-confidence groups. Strongest likely watched/source clip anchors include roughly 00:12:47, 00:26:11, 00:31:24, 00:43:32, 01:07:06, and 01:26:34.
- Truth boundary: ASR is draft transcript evidence only. No transcript was imported, no clip was confirmed/imported, no timeline decisions were written, no source media was mutated, no export was rendered, and no external publishing occurred.

## 2026-07-01 08:57 UTC - Episode 4 draft transcript spine generated

- Added `script/experimental/build_episode4_transcript_spine.py` and `agentctl episode4-transcript-spine`.
- Generated current draft transcript spine from the completed Episode 4 ASR chunks.
- Current spine board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-spines/episode-04/20260701-085632-859778-transcript-spine/index.html`.
- Current spine JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-spines/episode-04/20260701-085632-859778-transcript-spine/episode-04.transcript-spine.draft.json`.
- Current spine plaintext: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-spines/episode-04/20260701-085632-859778-transcript-spine/episode-04.transcript-spine.draft.txt`.
- Result: 1,276 de-overlapped transcript segments, 12,897 timed words, 38 source chunks, 0 missing chunks, 01:53:12 duration.
- Overlap strategy: deterministic chunk-range midpoint ownership. This removes overlap duplicates while keeping source chunk lineage for every segment.
- Truth boundary: ASR draft only. Speaker labels and timing are not reviewed; not ready for captions/quotes; not imported into the editor; no timeline decisions, exports, source mutation, upload, publishing, or receipt truth occurred.

## 2026-07-01 09:08 UTC - Episode 4 transcript-aware edit intelligence board added

- Added `script/experimental/build_episode4_edit_intelligence_board.py` and `agentctl episode4-edit-intelligence`.
- The board reads the Episode 4 draft transcript spine and transcript cue board, then proposes non-destructive edit intelligence work orders: clip-weave anchors, shorts candidates, cadence-gap candidates, and reaction-cover candidates.
- Proposal metadata includes intent, explanation, confidence, tradeoff, suggested action, revision-history placeholders, and human/agent notes so review feedback can train the process instead of disappearing.
- Safety boundary: proposals only. No clip import, no timeline decision writes, no shorts created, no transcript import, no source mutation, no export, and no external publishing.

## 2026-07-01 09:10 UTC - Episode 4 edit intelligence board validated

- Ran `agentctl episode4-edit-intelligence` against the current Episode 4 draft transcript spine and cue board.
- Current board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-edit-intelligence/20260701-090912-844830-edit-intelligence/index.html`.
- Current JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-edit-intelligence/20260701-090912-844830-edit-intelligence/episode4-edit-intelligence.json`.
- Result: 1,276 transcript segments scanned, 12 clip-weave work orders, 12 shorts candidates, 18 cadence-gap candidates, and 12 reaction-cover candidates.
- Tightened shorts scoring after first run so clip/source/editing chatter is more likely to remain in clip-weave context instead of being treated as standalone social-short material.
- Remaining quality truth: transcript-only scoring can still surface imperfect short candidates, so the next layer should connect these proposals to the visual editor for accept/refine/reject feedback and learning.
- Safety boundary held: proposals only; no clip import, no timeline decisions, no transcript import, no source mutation, no export, no upload, and no external publishing.

## 2026-07-01 09:24 UTC - Episode 4 edit-intelligence review bridge added

- Added `script/experimental/build_episode4_edit_review_ledger.py` and `agentctl episode4-edit-review-ledger`.
- Added decision commands: `episode4-edit-review-decision-dry-run` and `episode4-edit-review-decision`.
- The review bridge turns Episode 4 edit-intelligence proposals into sidecar review decisions: keep, refine, reject, hold, needs-source, needs-listen, or needs-visual-review.
- Review rows preserve proposal id, proposal group, decision, reviewer, notes, audio/visual/cadence/source notes, next action, and history.
- Architecture boundary: proposals are not edits; review decisions are not timeline applies. A future apply-preview packet should be generated only after a proposal is reviewed.
- Safety boundary: sidecar review metadata only. No clip import, no transcript import, no timeline decisions, no shorts created, no source mutation, no export, no upload, and no external publishing.

## 2026-07-01 - Episode 4 source-clip truth boundary and shopping list

- Validated the Episode 4 edit review ledger command path and dry-run/record flow for proposal decisions.
- Recorded `ep4-clip-weave-001` as `needs-source` because watched/source clip media is not confirmed yet.
- Created a transcript-derived source clip shopping list so Charlie can recover watched/reference clips without re-watching blind.
- Created external-drive drop folders for likely, confirmed, and parked/ambiguous Episode 4 source clips.
- Current review ledger: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-edit-intelligence-review/20260701-091908-976527-edit-review/index.html`
- Source clip shopping list: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-shopping-list/20260701-092321-source-clip-shopping-list/episode4-source-clip-shopping-list.md`
- Source clip dropbox: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox`
- Truth boundary: no timeline decisions written, no clips imported, no shorts created, no exports rendered, no originals mutated, no external publishing.

## 2026-07-01 09:33 UTC - Episode 4 source clip intake scanner added

- Added `script/experimental/build_episode4_source_clip_intake.py` and `agentctl episode4-source-clip-intake`.
- The intake scanner reads the Episode 4 watched/source clip drop folders, probes media with ffprobe when present, detects cue IDs such as `ep4-cue-013` in filenames, and creates a review board/manifest before any timeline apply.
- Validated normal empty-state scan against the real dropbox: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox`.
- Validated cue matching with a temporary no-probe smoke file named `ep4-cue-013-smoke-placeholder.mp4`, then reran the real dropbox scan so the latest pointer reflects real current state.
- Current real intake board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-intake/20260701-093213-189166-source-clip-intake/index.html`.
- Current real intake manifest: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-intake/20260701-093213-189166-source-clip-intake/episode4-source-clip-intake.json`.
- Current truth: zero dropped clips found. Episode 4 clip-weave proposals remain `needs-source` until Charlie/Mako drops confirmed or likely watched clips into the intake folders.
- Safety boundary: read-only sidecar metadata. No source mutation, no import, no timeline decisions, no shorts, no exports, no publishing, no overwrites.

## 2026-07-01 09:42 UTC - Episode 4 start-here control board added

- Added `script/experimental/build_episode4_start_here_board.py` and `agentctl episode4-start-here`.
- The start-here board aggregates the current Episode 4 transcript chunks, draft transcript spine, transcript cue board, edit intelligence proposals, edit review ledger, source clip shopping list, and source clip intake into one reviewer/agent control surface.
- Added fallback discovery for transcript chunks because the transcript runner produced a timestamped chunk artifact but no latest pointer.
- Validated the board against current external-drive state.
- Current board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-start-here/20260701-094134-450594-start-here/index.html`.
- Current manifest: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-start-here/20260701-094134-450594-start-here/episode4-start-here.json`.
- Current state summarized by the board: ASR transcript chunks ready, draft transcript spine ready, cue board ready, edit intelligence ready, edit review ledger has 53 unreviewed proposals, source clip intake has 0 files.
- Next safest action: drop likely watched/source clips into `Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification`, preferably named with cue IDs such as `ep4-cue-013-description.mp4`.
- Safety boundary: read-only aggregation only. No source mutation, no import, no timeline decisions, no shorts, no exports, no publishing, no overwrites.

## 2026-07-01 09:49 UTC - Episode 4 apply-preview packet added

- Added `script/experimental/build_episode4_apply_preview_packet.py` and `agentctl episode4-apply-preview`.
- The apply-preview packet translates reviewed edit-intelligence proposals into proposed operations, blocked operations, or no-ops before any timeline/session metadata write exists.
- Current packet: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-apply-preview/20260701-094811-345529-apply-preview/index.html`.
- Current JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-apply-preview/20260701-094811-345529-apply-preview/episode4-apply-preview.json`.
- Current result: 1 reviewed operation, 0 ready operations, 1 blocked operation, 0 no-ops.
- The only reviewed proposal is `ep4-clip-weave-001`, and it is correctly blocked as `source-required` because no confirmed watched/source clip has been dropped or matched yet.
- Next safest action: drop or confirm cue-matched source clips, rerun `agentctl episode4-source-clip-intake`, then rebuild `agentctl episode4-apply-preview`.
- Safety boundary: preview-only artifact. No source mutation, no import, no timeline decisions, no shorts, no exports, no publishing, no overwrites.

## 2026-07-01 - Episode 4 cut intelligence surfaced in Studio

- Added a native Episode 4 Control Room panel to the Quipsly Studio Cuts workbench.
- The panel reads existing sidecar truth surfaces only: Start Here, apply preview, source clip intake/dropbox, proposal status, and artifact cards.
- Safety boundary remains explicit: no timeline writes, no source mutation, no import/export/publish, and no overwrite behavior.
- Current Episode 4 apply-preview truth: one reviewed clip-weave operation is blocked as `source-required`; watched/source clip intake is empty.
- Validation: `./script/build_and_run.sh --verify` completed successfully after integration.
- Human next action: drop likely watched/source clips into `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification`, preferably named with cue IDs such as `ep4-cue-013-description.mp4`.

## 2026-07-01 - Episode 4 watched-clip recovery queue added to Studio

- Added native watched/source clip recovery cards to the Episode 4 Control Room panel in the Cuts workbench.
- The panel now reads the source clip shopping-list Markdown through the existing Start Here card, parses cue IDs, confidence, review windows, hit counts, and evidence snippets, then exposes them as copyable recovery actions.
- This keeps the current truth boundary intact: Episode 4 clip-weave operations remain blocked until files are actually dropped into the source clip dropbox and intake confirms them.
- Current human-friendly first recovery targets include `ep4-cue-013` at `01:26:34 -> 01:27:43`, then `ep4-cue-002`, `ep4-cue-003`, `ep4-cue-001`, `ep4-cue-006`, `ep4-cue-007`, and `ep4-cue-010`.
- Validation: `./script/build_and_run.sh --verify` completed successfully after the native recovery queue patch. Existing warnings remain in older Workspace/AgentServer code and were not introduced by this panel.

## 2026-07-01 - Episode 4 cut-intelligence state made agent-queryable

- Added `GET /episode4_cut_intelligence_state` as a live app bridge for canonical Episode 4 control-room paths.
- Kept the live endpoint bridge-only so the HTTP server does not synchronously read external-drive artifacts and risk macOS permission stalls.
- Added `script/build_episode4_cut_intelligence_state.py` and `script/agentctl.sh episode4-cut-intelligence-state` for CLI-side filesystem-enriched state.
- Current proof from `script/agentctl.sh episode4-cut-intelligence-state`: 9 recovery cue(s), 0 watched/source clip files in the dropbox, next cue `ep4-cue-013`, and 1 blocked apply-preview operation.
- Validation: `./script/build_and_run.sh --verify` passed, `curl http://127.0.0.1:8080/episode4_cut_intelligence_state` returned the bridge payload, and `script/agentctl.sh episode4-cut-intelligence-state` returned enriched state.

## 2026-07-01 - Episode 4 source intake now reports actionable missing-cue state

- Improved `script/experimental/build_episode4_source_clip_intake.py` so empty intake is not a dead end.
- The intake manifest now includes `nextActions` and `cueRecoveryChecklist` with cue IDs, confidence, review windows, evidence, and suggested filenames.
- Updated `script/build_episode4_cut_intelligence_state.py` so `script/agentctl.sh episode4-cut-intelligence-state` includes latest source-intake status and next action.
- Current proof: source dropbox has 0 files; intake is `episode4-source-clip-intake-empty`; first next action is to find/drop `ep4-cue-013-short-description.mp4` for `01:26:34 -> 01:27:47`; apply preview still has 1 blocked source-required operation.
- Validation: `python3 -m py_compile script/build_episode4_cut_intelligence_state.py script/experimental/build_episode4_source_clip_intake.py` passed; `script/agentctl.sh episode4-source-clip-intake --json` and `script/agentctl.sh episode4-cut-intelligence-state` returned the expected structured action state.

## 2026-07-01 - Episode 4 Control Room reads source-intake truth directly

- Updated the native Episode 4 Control Room panel to read the latest source-clip-intake pointer directly instead of relying only on Start Here and Markdown-derived recovery cards.
- Added a current blocker card that shows source-intake status, dropbox file count, cue-matched count, blocked apply-preview count, and the highest-priority missing cue.
- The first visible recovery target is now driven by structured intake JSON when available, including cue ID, confidence, review window, transcript evidence, and suggested filename such as `ep4-cue-013-short-description.mp4`.
- Safety boundary remains unchanged: read-only sidecar metadata only. No source mutation, no import, no timeline decisions, no shorts, no exports, no publishing, no overwrites.

## 2026-07-01 - Episode 4 cut-intelligence handoff packet added

- Added `--markdown`, explicit `--json`, and `--save-markdown` modes to `script/build_episode4_cut_intelligence_state.py` through `script/agentctl.sh episode4-cut-intelligence-state`.
- The handoff packet renders the same source-intake/apply-preview truth as the JSON state: current status, dropbox file count, recovery cue count, blocked operation count, next missing cue, transcript evidence, safe commands, artifact paths, and safety boundary.
- Current saved handoff: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-control-room-state/latest-episode4-cut-intelligence-handoff.md`.
- Current proof: `episode4-source-clip-intake-empty`; dropbox files `0`; first missing cue `ep4-cue-013`; blocked apply-preview operations `1`.
- Validation: `python3 -m py_compile script/build_episode4_cut_intelligence_state.py` passed; `script/agentctl.sh episode4-cut-intelligence-state --json --compact` returned valid JSON; `script/agentctl.sh episode4-cut-intelligence-state --save-markdown` wrote the current handoff Markdown.
- Safety boundary remains unchanged: no source mutation, no import, no timeline decisions, no shorts, no exports, no publishing, no overwrites.

## 2026-07-01 - Episode 4 watched/source clip recovery board added

- Extended `script/experimental/build_episode4_source_clip_intake.py` to generate a dedicated watched/source clip recovery board alongside the intake manifest.
- New outputs per intake run: `recovery-board.html` and `episode4-watched-source-clip-recovery-board.md`.
- The recovery board shows missing cue tasks, matched cue tasks, confidence, review windows, suggested filenames, transcript evidence, dropbox path, after-drop commands, and safety boundaries.
- Updated the latest intake pointer with `recoveryHtmlPath` and `recoveryMarkdownPath` so other tools can find the board without path guessing.
- Updated `script/build_episode4_cut_intelligence_state.py` so the Episode 4 handoff includes the recovery board paths.
- Updated the native Episode 4 Control Room button to open the recovery board when available, falling back to the intake board for older artifacts.
- Current proof: `episode4-source-clip-intake-empty`, 0 dropped files, 9 missing cue tasks, first cue `ep4-cue-013`, recovery board generated under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-intake/`.
- Validation: `python3 -m py_compile script/experimental/build_episode4_source_clip_intake.py script/build_episode4_cut_intelligence_state.py` passed; `script/agentctl.sh episode4-source-clip-intake --json` emitted recovery paths; `script/agentctl.sh episode4-cut-intelligence-state --json --compact` included the recovery board; `./script/build_and_run.sh --verify` passed with existing warnings only.
- Safety boundary remains unchanged: no source mutation, no import, no timeline decisions, no shorts, no exports, no publishing, no overwrites.

## 2026-07-01 - Episode 4 source-clip intake smoke proof added

- Added `script/smoke_episode4_source_clip_intake.py` and exposed it through `script/agentctl.sh episode4-source-clip-intake-smoke`.
- The smoke creates a cue-named fixture file under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-intake-smoke/`, scans it with `--no-probe`, writes intake outputs under a smoke-only output root, and updates only a smoke pointer.
- The smoke asserts all of these are true: command exits zero, status is ready, one fixture file is seen, `ep4-cue-013` is matched, cue-matched count is 1, smoke pointer is written, real dropbox listing is unchanged, and the real latest intake pointer is unchanged.
- Current proof: `script/agentctl.sh episode4-source-clip-intake-smoke` returned `ok: true`; fixture `ep4-cue-013-smoke-source.mp4` matched as `cue-id-matched`; real Episode 4 dropbox still has 0 files; real cut-intelligence state remains `episode4-source-clip-intake-empty` with next cue `ep4-cue-013` and 1 blocked apply-preview operation.
- Safety boundary remains unchanged: no source mutation, no production pointer contamination, no import, no timeline decisions, no shorts, no exports, no publishing, no overwrites.

## 2026-07-01 - Episode 4 watched/source clip cue review packet added

- Added `script/experimental/build_episode4_source_clip_review_packet.py` and exposed it through `script/agentctl.sh episode4-source-clip-review [--extract-audio] [--json|--markdown]`.
- The packet converts missing watched/source clip cues into reviewable cue windows with transcript context, source audio references, suggested filenames, and drop instructions.
- With `--extract-audio`, the packet writes sidecar `.m4a` review snippets under the timestamped review-board folder. It reads the high-quality source audio but does not mutate it.
- Current proof: `script/agentctl.sh episode4-source-clip-review --extract-audio --json` produced 9 review items and 9 audio review snippets. First item is `ep4-cue-013`, window `01:26:34 -> 01:27:47`, audio snippet `ep4-cue-013-01-26-34-01-27-47.m4a`.
- Current board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-cue-review/20260701-115202-884442-source-clip-cue-review/index.html`.
- Current Markdown: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-cue-review/20260701-115202-884442-source-clip-cue-review/episode4-source-clip-cue-review.md`.
- Production truth after generation remains unchanged: source intake is still empty, dropbox file count is 0, next cue is still `ep4-cue-013`, and apply preview still has 1 blocked source-required operation.
- Safety boundary: read-only transcript/source-audio use plus sidecar review artifacts only. No source mutation, no clip import, no timeline decision writes, no shorts, no final exports, no publishing, no overwrites.

## 2026-07-01 - Episode 4 cue review linked into Control Room

- Updated `script/build_episode4_cut_intelligence_state.py` to include the latest source-clip cue review packet under `sourceClipCueReview`.
- The state packet now exposes cue-review status, HTML path, Markdown path, JSON path, review item count, audio extraction flag, and safe action text.
- Updated the native Episode 4 Control Room to read the cue-review pointer directly and show a `Hear cue windows` action beside the recovery board action.
- Updated the native refresh-command copy to regenerate cue review with `--extract-audio` before source intake, apply preview, and start-here boards.
- Current proof: `script/agentctl.sh episode4-cut-intelligence-state --json --compact` reports `sourceClipCueReview.status = episode4-source-clip-cue-review-ready`, `reviewItemCount = 9`, and points to the audio/text review board generated from high-quality Episode 4 audio.
- Validation: `python3 -m py_compile script/build_episode4_cut_intelligence_state.py script/experimental/build_episode4_source_clip_review_packet.py` passed; `./script/build_and_run.sh --verify` passed with existing warnings only.
- Safety boundary remains unchanged: cue review is evidence-only sidecar output. No source mutation, no import, no timeline decisions, no shorts, no final exports, no publishing, no overwrites.

## 2026-07-01 - Episode 4 apply-preview source-unlock smoke added

- Updated `script/experimental/build_episode4_apply_preview_packet.py` so a reviewed `needs-source` clip-weave proposal remains blocked only while no cue-matched source clip exists. Once source intake contains a matching clip, the proposal can become a `ready-for-apply-preview-review` `clip-weave-branch` preview operation.
- Added `script/smoke_episode4_apply_preview_source_unlock.py` and exposed it through `script/agentctl.sh episode4-apply-preview-source-unlock-smoke`.
- The smoke creates `ep4-cue-013-smoke-source.mp4` under a smoke-only fixture root, runs source intake with smoke-only output and pointer paths, then builds apply-preview from that smoke pointer.
- Current proof: `script/agentctl.sh episode4-apply-preview-source-unlock-smoke` returned `ok: true`; the smoke operation unlocked as `ep4-clip-weave-001 · clip-weave-branch · ready-for-apply-preview-review` with 1 source match.
- The smoke also proved the real watched/source clip dropbox, real source-intake latest pointer, and real apply-preview latest pointer remained unchanged.
- Production truth remains honest: real Episode 4 source intake is still empty, real dropbox file count is 0, next missing cue remains `ep4-cue-013`, and the real apply-preview operation remains blocked as `source-required` until an actual watched/source clip is dropped and matched.
- Human workflow: use the cue-review board/audio snippets to identify the watched clip, then drop it into `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification` with a cue-friendly name such as `ep4-cue-013-short-description.mp4`.
- Safety boundary remains unchanged: smoke-only artifacts, no source mutation, no production pointer contamination, no timeline decision writes, no shorts, no final exports, no publishing, no overwrites.

## 2026-07-01 - Episode 4 source placeholders unblock main edit progress

- Changed `script/experimental/build_episode4_apply_preview_packet.py` so reviewed clip-weave proposals with missing watched/source media become explicit `source-placeholder` preview operations instead of hard `blocked` operations.
- The new operation kind is `clip-weave-source-placeholder`. It carries source recovery metadata, the cue ID, suggested filename, dropbox path, and explicit safety flags: `canContinueMainEpisodeEdit: true` and `canWriteRealClipInsert: false`.
- This keeps the Episode 4 edit moving while preserving the truth that no real watched/source clip can be woven until the media is recovered and cue-matched.
- Updated the native Episode 4 Control Room apply-preview card to show a separate `placeholders` metric and honey status color instead of collapsing placeholders into generic blocked/error state.
- Updated `script/build_episode4_cut_intelligence_state.py` to expose `sourcePlaceholderOperationCount`, `sourcePlaceholderOperations`, and a consistent `reviewWindowLabel` for the next missing cue.
- Current proof: real apply preview now reports 1 reviewed operation, 1 source placeholder, 0 hard blockers, and 0 ready real apply operations; next recovery target remains `ep4-cue-013-short-description.mp4` for `01:26:34 -> 01:27:43`.
- The source-unlock smoke still passes: when a cue-named smoke file exists, the same proposal becomes `ready-for-apply-preview-review` as a real `clip-weave-branch`, while real dropbox and real latest pointers remain unchanged.
- Validation: `python3 -m py_compile script/experimental/build_episode4_apply_preview_packet.py script/build_episode4_cut_intelligence_state.py script/smoke_episode4_apply_preview_source_unlock.py` passed; `script/agentctl.sh episode4-apply-preview --json` returned the source-placeholder packet; `script/agentctl.sh episode4-apply-preview-source-unlock-smoke` returned `ok: true`; `script/agentctl.sh episode4-cut-intelligence-state --json --compact` reported 0 blockers and 1 source placeholder; `./script/build_and_run.sh --verify` passed with existing warnings only.
- Safety boundary remains unchanged: preview artifacts and UI state only. No source mutation, no real clip insert, no timeline decision write, no shorts, no final exports, no publishing, no overwrites.

## 2026-07-01 - Episode 4 source-placeholder workbench added

- Added `script/experimental/build_episode4_source_placeholder_workbench.py` and exposed it through `script/agentctl.sh episode4-source-placeholder-workbench [--json|--markdown]`.
- The workbench turns source-missing clip-weave intent into a focused review surface: cue ID, sequence span, intent, explanation, tradeoff, J-cut/L-cut hints, cue-review audio, transcript evidence, suggested filename, dropbox path, safe-now actions, and not-allowed-yet actions.
- Current proof: the real Episode 4 workbench is `episode4-source-placeholder-workbench-ready` with 1 placeholder, 1 cue-audio clip, 1 item that can continue main episode editing, and 0 real clip inserts allowed.
- Current target remains `ep4-cue-013` at `01:26:34 -> 01:27:47`; suggested recovered source filename is `ep4-cue-013-short-description.mp4`.
- Generated board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-placeholder-workbench/20260701-124738-157577-source-placeholder-workbench/index.html`.
- Updated `script/build_episode4_cut_intelligence_state.py` to expose `sourcePlaceholderWorkbench` with status, paths, counts, item count, and next safe action.
- Updated the native Episode 4 Control Room to include an `Open placeholders` action and to include the workbench generation in the copied refresh command.
- The source-unlock smoke still passes: cue-named source media unlocks the same proposal into a real `clip-weave-branch` preview while real dropbox/intake/apply pointers stay unchanged.
- Validation: `python3 -m py_compile script/experimental/build_episode4_source_placeholder_workbench.py script/build_episode4_cut_intelligence_state.py` passed; `script/agentctl.sh episode4-source-placeholder-workbench --json` generated the real workbench; `script/agentctl.sh episode4-cut-intelligence-state --json --compact` exposed the workbench; `script/agentctl.sh episode4-apply-preview-source-unlock-smoke` returned `ok: true`; `./script/build_and_run.sh --verify` passed with existing warnings only.
- Safety boundary remains unchanged: sidecar review artifacts and native UI links only. No source mutation, no clip import, no timeline decision write, no shorts, no final exports, no publishing, no overwrites.

## 2026-07-01 - Episode 4 host-spine duration workbench added

- Added `script/experimental/build_episode4_host_spine_duration_workbench.py` and exposed it through `script/agentctl.sh episode4-host-spine-duration-workbench [--json|--markdown]`.
- The workbench builds duration recipes from file pointers instead of requiring the live app to have an active sequence loaded: transcript spine, edit intelligence, and source-placeholder workbench.
- Current proof: Episode 4 host spine is `01:53:12` with `1276` transcript segments, `12897` words, and `1` visible watched/source placeholder.
- Generated duration variants: Full review `75-90 min`, YouTube standard `35-45 min`, Tight feature `22-30 min`, Clip-weave proof `8-12 min`, and Shorts family `30/45/60/90 sec`.
- Updated `script/build_episode4_cut_intelligence_state.py` so the Episode 4 control-room state exposes `hostSpineDurationWorkbench` with status, paths, variant count, spine summary, and next safe action.
- Corrected handoff language so an empty watched/source clip dropbox blocks real clip insertion, not main host-spine edit planning.
- Current state proof: `script/agentctl.sh episode4-cut-intelligence-state --json --compact` reports `hostSpineDurationWorkbench.status = episode4-host-spine-duration-workbench-ready`, `variantCount = 5`, `applyPreview.blockedOperationCount = 0`, and `applyPreview.sourcePlaceholderOperationCount = 1`.
- Validation: `python3 -m py_compile script/experimental/build_episode4_host_spine_duration_workbench.py script/build_episode4_cut_intelligence_state.py` passed; `script/agentctl.sh episode4-host-spine-duration-workbench --json` generated the real workbench; `script/agentctl.sh episode4-cut-intelligence-state --json --compact` exposed it.
- Safety boundary remains unchanged: sidecar duration planning only. No source mutation, no imports, no timeline decision writes, no shorts, no final exports, no publishing, no overwrites.

## 2026-07-01 - Episode 4 YouTube-standard metadata recipe added

- Added `script/experimental/build_episode4_youtube_standard_recipe.py` and exposed it through `script/agentctl.sh episode4-youtube-standard-recipe [--json|--markdown]`.
- The recipe creates a metadata-only branch named `episode-4-youtube-standard-v001` with parent `episode-4-host-spine-sync-baseline`.
- It reads the transcript spine, edit-intelligence candidates, host-spine duration workbench, and source-placeholder workbench from external-drive pointers.
- Current proof: source spine is `01:53:12`; target is `35-45 min`; estimated keep is `00:43:56`; estimated removal is `01:09:16`; `inTargetWindow = true`.
- Current operation counts: `14` SHOW review islands, `12` SKIP review gaps, `21` specialist reviews, and `1` source placeholder.
- The generator was tightened after the first run produced a too-generous `00:51:27` keep estimate. It now selects strongest evidence islands first instead of preserving every plausible candidate.
- Updated `script/build_episode4_cut_intelligence_state.py` so the Episode 4 control-room state exposes `youtubeStandardRecipe` with status, branch, duration plan, operation counts, paths, and next safe action.
- Current state proof: `script/agentctl.sh episode4-cut-intelligence-state --json --compact` reports `youtubeStandardRecipe.status = episode4-youtube-standard-recipe-ready`, branch `episode-4-youtube-standard-v001`, and `durationPlan.inTargetWindow = true`.
- Validation: `python3 -m py_compile script/experimental/build_episode4_youtube_standard_recipe.py script/build_episode4_cut_intelligence_state.py` passed; `script/agentctl.sh episode4-youtube-standard-recipe --json` generated the real recipe; `script/agentctl.sh episode4-cut-intelligence-state --json --compact` exposed it.
- Safety boundary remains unchanged: metadata-only recipe artifacts. No source mutation, no app timeline writes, no imports, no shorts, no final exports, no publishing, no overwrites.

## 2026-07-01 - Episode 4 YouTube recipe surfaced in native Control Room

- Updated `Sources/SharedUI/Episode4CutIntelligenceBoardView.swift` so the native Episode 4 Control Room reads the latest `episode4-youtube-standard-recipe` pointer directly.
- Added a visible YouTube-standard recipe card with branch, target duration, estimated keep/remove, SHOW island count, SKIP gap count, specialist review count, source-placeholder count, next safe action, and buttons to open the recipe board or Markdown notes.
- Updated the refresh command copied from the Control Room so it regenerates cue review, source intake, apply preview, source-placeholder workbench, host-spine duration workbench, YouTube-standard recipe, and Start Here board.
- Current proof: the data layer reports recipe `episode4-youtube-standard-recipe-ready`, branch `episode-4-youtube-standard-v001`, estimated keep `00:43:56`, target `35-45 min`, `14` SHOW islands, `12` SKIP gaps, `21` specialist reviews, and `1` source placeholder.
- Validation: `python3 -m py_compile script/experimental/build_episode4_youtube_standard_recipe.py script/build_episode4_cut_intelligence_state.py` passed; `script/agentctl.sh episode4-youtube-standard-recipe --json` returned the current recipe; `script/agentctl.sh episode4-cut-intelligence-state --json --compact` exposed it; `./script/build_and_run.sh --verify` passed with existing warnings only.
- Safety boundary remains unchanged: the Control Room reads sidecar artifacts only. It does not mutate media, write app timeline state, apply recipe decisions, render exports, publish, delete, or overwrite anything.

## 2026-07-01 - Episode 4 YouTube recipe review ledger

- Added a sidecar review ledger for the Episode 4 YouTube-standard recipe so generated SHOW/SKIP/cadence/reaction/source-placeholder operations can be reviewed before any branch metadata or timeline writes.
- New safe commands:
  - `./script/agentctl.sh episode4-youtube-recipe-review-ledger --json`
  - `./script/agentctl.sh episode4-youtube-recipe-review-decision-dry-run ep4-ys-show-island-001 needs-listen Codex "Proof-listen opening before keep."`
- Current ledger evidence: 47 recipe operations, 21 review-needed items, 26 unreviewed items, 0 mutation events.
- Safety proof: dry-run review event reports `sidecarReviewMetadataOnly=true`, `ledgerMutated=false`, `timelineDecisionsWritten=false`, `sourceFilesMutated=false`, `exportsRendered=false`, and `externalPublishing=false`.
- Control Room state now exposes `youtubeRecipeReviewLedger` and the native Episode 4 Control Room shows a Recipe review ledger card.
- Known blocker remains unchanged: watched/source clips for Episode 4 are not in the dropbox yet. Main host-spine/duration/recipe work can continue; source-placeholder clip weaving must wait for real clips.
- Validation: `python3 -m py_compile script/experimental/build_episode4_youtube_recipe_review_ledger.py script/build_episode4_cut_intelligence_state.py`; `episode4-youtube-recipe-review-ledger --json`; dry-run decision; `episode4-cut-intelligence-state --json --compact`; `./script/build_and_run.sh --verify` passed with existing Swift warnings only.

## 2026-07-01 - Episode 4 watched/source clip recovery packet

- Added a consolidated Episode 4 watched/source recovery packet so missing source clips can be recovered from transcript evidence without blocking host-spine editing.
- New command: `./script/agentctl.sh episode4-watched-source-recovery-packet --markdown`.
- Current packet evidence: 9 cue windows, 7 high-confidence cues, 9 extracted audio review clips, 1 primary placeholder (`ep4-cue-013`), and 0 files currently in the watched/source dropbox.
- Highest-priority cue: `ep4-cue-013`, review window `01:26:34 -> 01:27:47`, suggested filename `ep4-cue-013-short-description.mp4`.
- Dropbox: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification`.
- State wiring: `episode4-cut-intelligence-state` now exposes `watchedSourceRecoveryPacket` with counts, paths, dropbox, and next safest action.
- Safety proof: packet generation is read-only and reports no clip import, timeline decision write, source mutation, export render, external publishing, deletion, or overwrite.
- Validation: `python3 -m py_compile script/experimental/build_episode4_watched_source_recovery_packet.py script/build_episode4_cut_intelligence_state.py`; `episode4-watched-source-recovery-packet --json`; `episode4-watched-source-recovery-packet --markdown`; `episode4-cut-intelligence-state --json --compact`.

## 2026-07-01 - Episode 4 watched/source clip recovery handoff

- Confirmed Episode 4 source recovery state has 9 suspected watched/source cues, 7 high-confidence cues, 9 audio review clips, and an empty watched/source clip dropbox.
- Copied the source-clip shopping list to `/Users/wall-e/Desktop/Episode4_Watched_Source_Clip_Shopping_List.md` for human clip hunting.
- Created a dropbox README at `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification/README_DROP_CONFIRMED_CLIPS_HERE.md`.
- Highest-priority confirmed blocker remains `ep4-cue-013` around 01:26:34 -> 01:27:43/47. Main episode edit can continue while watched/source clips are recovered.


## 2026-07-01 - Episode 4 source dropbox media-count correction

- Fixed a readiness-language bug where the Episode 4 recovery packet and Control Room state counted any non-hidden dropbox file, including README/instruction files, as a dropbox file.
- The watched/source recovery packet and cut-intelligence state now count only usable media candidates by suffix, matching the source-clip intake scanner's meaning of files.
- Evidence after regeneration: recovery packet reports 9 cues, 7 high-confidence cues, 9 audio review clips, 0 dropbox media files, and `readyForIntake=false`.
- Control Room state now agrees: `sourceClipRecovery.dropboxFileCount=0`, `watchedSourceRecoveryPacket.counts.dropboxFiles=0`, and `sourceClipIntake.counts.files=0`.
- Validation: `python3 -m py_compile script/build_episode4_cut_intelligence_state.py script/experimental/build_episode4_watched_source_recovery_packet.py`; `./script/agentctl.sh episode4-watched-source-recovery-packet --json`; `./script/agentctl.sh episode4-cut-intelligence-state --json --compact`; `./script/build_and_run.sh --verify`.


## 2026-07-01 - Episode 4 watched-source cue cards in Control Room

- Upgraded the Episode 4 Control Room to read the dedicated watched/source recovery packet directly, rather than relying only on source-intake fallback or Markdown parsing.
- Watched clip recovery now surfaces richer cue-card evidence in the app: high-confidence count, audio review window count, primary source gaps, media-dropped count, next safest action, and the top 7 cue cards.
- Cue cards now carry structured review context from the packet, including human action text, extracted audio review clip path, J-cut hint, L-cut hint, evidence preview, cue-safe filename copy, cue-time copy, and a `Hear cue` action.
- This keeps missing watched/source clips visible as source-recovery work without pretending the media exists or writing real clip-weave timeline metadata.
- Evidence surfaces used: `./script/agentctl.sh episode4-watched-source-recovery-packet --json`; `./script/agentctl.sh episode4-cut-intelligence-state --json --compact`.
- Current truth: 9 suspected watched/source cues, 7 high-confidence cues, 9 audio review windows, 1 primary placeholder gap, 0 usable media files in the clip dropbox, `readyForIntake=false`.
- Validation: `./script/build_and_run.sh --verify` passed. Existing unrelated Swift warnings remain in `WorkspaceView.swift`, including a duplicate dictionary key warning for `lanes` in diagnostic payload construction.


## 2026-07-01 - Agent diagnostic payload cleanup checkpoint

- Tightened agent-observable truth in `WorkspaceView.swift` by removing the full-state duplicate `lanes` dictionary key. The full agent payload now keeps canonical `lanes` for the later `lanesInfo` payload and exposes the whole-source inventory as `wholeSyncedLanes` / `sourceLaneInventory`.
- Preserved mounted/lean status payload lane keys because those are separate payloads, not duplicate keys inside one dictionary.
- Repaired a failed broad cleanup attempt that corrupted one collaborator-proof string interpolation; app build is healthy again.
- Validation: `./script/build_and_run.sh --verify` passed and launched `QuipslyMac`.
- Residual warnings remain around Swift optional coercion inside `[String: Any]` diagnostic dictionaries, deprecated `onChange(of:perform:)`, and an immutable `values` warning in `AgentServer.swift`. These should be handled as a deliberate diagnostic-builder refactor, not another broad replacement pass.


## 2026-07-01 - Agent diagnostic payload helper cleanup

- Restored the Quipsly Studio Mac build after the agent-facing diagnostic JSON cleanup introduced a Swift helper-name collision.
- Kept the existing `jsonString(from:)` payload serializer intact and moved optional scalar coercion to distinct helpers: `qStudioOptionalString`, `qStudioOptionalDouble`, and `qStudioOptionalInt`.
- Preserved the selected-decision intent-note endpoint as mutable only where confidence can be appended; kept the status endpoint immutable.
- Episode 4 watched/source clip intake remains truth-labeled: cue list exists, dropbox is empty except README/system files, and source clips still require human identification before metadata-only weave work.
- Validation: `./script/build_and_run.sh --verify` passed and launched `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/DerivedData/Build/Products/Debug/QuipslyMac.app/Contents/MacOS/QuipslyMac`.
- Residual warnings: SwiftUI `onChange(of:perform:)` deprecations remain in `WorkspaceView.swift`, `TimelineEditorView.swift`, and `InspectorSidebarView.swift`; no compiler errors remain in this pass.

## 2026-07-01 - Episode 4 source clip intake path clarified

- Fixed `script/experimental/build_episode4_source_clip_intake.py` so generated cue-recovery checklist actions point to the current dropbox path instead of preserving stale legacy `/Volumes/My Passport/Episode 4/...` prose from upstream cue data.
- Current likely dropbox is now emitted from one constant: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification`.
- Validation: `script/agentctl.sh episode4-source-clip-intake` regenerated the board successfully with status `episode4-source-clip-intake-empty` and next action `Drop likely Episode 4 watched/source clips into /Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification, preferably with cue IDs from the shopping list.`
- Validation: `script/agentctl.sh episode4-cut-intelligence-state` still reports `dropboxFiles: 0`, next missing cue `ep4-cue-013`, and source intake empty. This blocks real watched/source clip insertion only; host-spine edit planning can continue.

## 2026-07-01 - Episode 4 watched/source recovery packet path clarified

- Fixed `script/experimental/build_episode4_watched_source_recovery_packet.py` so each cue card's human action is generated from the current dropbox path instead of preserving stale legacy Episode 4 folder instructions.
- Validation: `script/agentctl.sh episode4-watched-source-recovery-packet` regenerated the packet with first cue `ep4-cue-013` and matching `humanAction`/`dropInstruction` pointing to `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification`.
- Copied the refreshed Markdown packet to `/Users/wall-e/Desktop/Episode4_Watched_Source_Clip_Recovery_Packet.md`.

## 2026-07-01 - Episode 4 proof-listen runway added

- Added a proof runway to `script/experimental/build_episode4_recipe_proof_listen_queue.py` so the Episode 4 YouTube-standard recipe no longer presents 47 review tasks as a flat pile.
- The queue now includes `proofRunway` with the first 8 prioritized tasks, each carrying why-first rationale, proof question, first listen checks, first visual checks, dry-run command, and record command.
- Added a `decisionCheatSheet` for `keep`, `refine`, `reject`, `needs-listen`, `needs-visual-review`, and `needs-source` so reviewer language stays consistent without requiring NLE internals.
- Regenerated the queue and copied the Markdown surface to `/Users/wall-e/Desktop/Episode4_Recipe_Proof_Listen_Runway.md`.
- Validation: `python3 -m py_compile script/experimental/build_episode4_recipe_proof_listen_queue.py` passed.
- Validation: `script/agentctl.sh episode4-recipe-proof-listen-queue` produced status `episode4-recipe-proof-listen-queue-ready` with 47 tasks, 8 runway cards, and 6 decision definitions.
- Validation: dry-run review commands succeeded for `ep4-ys-source-placeholder-ep4-cue-013` (`needs-source`) and `ep4-ys-cadence-review-ep4-cadence-045` (`needs-listen`) with `ledgerMutated: false`, `timelineDecisionsWritten: false`, and `sourceFilesMutated: false`.

## 2026-07-01 - Episode 4 watched-source recovery cue packet

- Confirmed the Episode 4 watched/source clip dropbox still needs human source identification; the first blocker is `ep4-ys-source-placeholder-ep4-cue-013` at `01:26:34 -> 01:27:47`.
- Added proof-listen sidecar audio extraction to `script/experimental/build_episode4_recipe_proof_listen_queue.py` so review windows are generated from `/Volumes/My Passport/Episode 4/Charlie Ep4.wav` without mutating source media.
- Fixed clock-label fallback parsing so source-placeholder rows with labels like `01:26:34 -> 01:27:47` produce the correct review window instead of a useless start-of-file clip.
- Generated 8 `.m4a` proof-listen windows under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-recipe-proof-listen-queue/20260701-162149-173958-recipe-proof-listen/proof-listen-audio` with 0 skips and 0 errors.
- Copied the updated human-facing packet to `/Users/wall-e/Desktop/Episode4_Recipe_Proof_Listen_Runway.md`.

## 2026-07-01 - Episode 4 cue review packet uses current dropbox truth

- Updated `script/experimental/build_episode4_source_clip_review_packet.py` so cue review packets generate current drop instructions from `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification` instead of preserving stale legacy Episode 4 folder prose.
- Added cue-level search hints and review prompts; when transcript evidence is too vague, the packet now says to listen for the exact clip title/topic instead of inventing noisy hints.
- Regenerated `./script/agentctl.sh episode4-source-clip-review --extract-audio --json` with 9 cue review items and 9 nonzero `.m4a` audio review windows.
- Copied the current human-facing packet to `/Users/wall-e/Desktop/Episode4_Source_Clip_Cue_Review.md`.
- Safety truth: sidecar review artifacts only; no source media, timeline metadata, export, upload, publication, delete, or overwrite occurred.

## 2026-07-01 - Episode 4 cut-intelligence state exposes cue review prompts

- Updated `script/build_episode4_cut_intelligence_state.py` so `sourceClipCueReview` now includes current dropbox truth, audio-review clip count, first cue prompt, and a compact `reviewItems` slice with cue IDs, windows, prompts, filenames, audio paths, and transcript evidence.
- Updated the Markdown handoff to include a dedicated `Cue audio/text review packet` section and the direct `./script/agentctl.sh episode4-source-clip-review --extract-audio` command.
- Validation: `python3 -m py_compile script/build_episode4_cut_intelligence_state.py`; `script/agentctl.sh episode4-cut-intelligence-state --json --compact`; `script/agentctl.sh episode4-cut-intelligence-state --save-markdown`.
- Current truth remains: 9 cue review items, 9 audio review clips, 0 source clip intake files, and no source media/timeline/export/publication mutation.

## 2026-07-01 - Episode 4 cue-review UI surfaced in Control Room

- Updated the Episode 4 Control Room source recovery card to show cue-audio count instead of generic review clips.
- Surfaced the first cue-review prompt and audio review clip path directly in the app so Charlie can identify watched/source clips without digging through artifacts.
- Routed copy/reveal dropbox actions through the cue-review packet's current `needs-human-identification` folder when available.
- Intent: keep source-required clip weaving honest. Missing watched clips stay visible as recovery work; the timeline should not pretend source clips exist until real media is dropped and matched.
- Validation: not run in this pass; UI code changed only and no build/test was requested.

## 2026-07-01 - Episode 4 watched/source clips treated as recovery queue

- Confirmed Episode 4 watched/source clips are not currently in the intake dropbox; the correct state is recovery-needed, not timeline failure.
- Added clearer Control Room language for the empty source-clip dropbox: listen to cue audio, identify watched/source media, and drop real files with cue IDs in the filename.
- Added direct UI support for cue-review audio count, first cue prompt, first cue audio path, and current dropbox folder.
- Created `/Users/wall-e/Desktop/Episode4_Watched_Clip_Recovery_Checklist.md` as a compact human recovery surface for identifying the clips Charlie/Homer watched during Episode 4.
- Product rule reinforced: source-required clip weaving must stay blocked until real source media exists; Quipsly may suggest and explain, but must not fake watched clips.
- Validation: no build/test run in this pass. Current work is SwiftUI/data plumbing plus a generated human checklist.

## 2026-07-01 - Episode 4 edit intelligence gained human-feeling cut style metadata

- Updated `script/experimental/build_episode4_edit_intelligence_board.py` so generated Episode 4 edit-intelligence packets include an operational cut style guide.
- The guide makes J-cuts, L-cuts, reaction covers, cadence tightening, source weaving, and not-allowed-yet boundaries inspectable instead of implied.
- Added per-proposal `cutTechnique` and `reviewChecklist` metadata to shorts, cadence, clip-weave, and reaction-cover candidates.
- Updated Markdown/HTML rendering so humans can see the editing principle, risk, technique default, and review question beside the proposals.
- Updated `script/build_episode4_cut_intelligence_state.py` so the agent/control-room state can expose the edit-intelligence board, counts, and a compact cut-style summary.
- Product reason: Quipsly should explain its editing taste and tradeoffs before applying metadata. This is the path toward Codex/Mako/Charlie review loops that train better edits without hiding decisions.
- Validation: not run in this pass; no build/test was explicitly requested.

## 2026-07-01 - Episode 4 native Control Room surfaces cut style guide

- Updated `Sources/SharedUI/Episode4CutIntelligenceBoardView.swift` so the native Episode 4 Control Room can read the latest edit-intelligence pointer directly.
- Added a visible `Human-feeling cut style` card with operational principles, technique defaults, not-allowed-yet boundaries, and copy/open actions.
- Regenerated the Episode 4 edit-intelligence board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-edit-intelligence/20260701-172622-117565-edit-intelligence/index.html`.
- Regenerated the cut-intelligence handoff so agent/human state now exposes `draft-operational-style-guide`, 5 principles, and 5 techniques.
- Current proposal counts remain: 12 clip-weave anchors, 12 shorts candidates, 18 cadence candidates, and 12 reaction-cover candidates.
- Product reason: reviewers should see the rules of taste next to the generated edit moves. This makes J-cuts, L-cuts, reaction covers, cadence tightening, and source weaving explainable before metadata is applied.
- Safety: generated metadata/review artifacts only; no source media mutation, no timeline write, no export overwrite, no external publishing.

## 2026-07-01 - Episode 4 shorts candidates gained hook/caption/platform metadata

- Updated `script/experimental/build_episode4_edit_intelligence_board.py` so Episode 4 short candidates now include `hookType`, `captionPlan`, `platformVariants`, and `pacingRisk`.
- Caption metadata includes density, estimated words, words-per-second, first caption draft, guidance, and a manual-review flag.
- Platform variants currently cover YouTube Shorts, Instagram Reels, Facebook Reels, and LinkedIn with target shape, duration fit, caption style, and trim notes.
- Markdown and HTML review boards now render the new shorts recipe metadata beside reasons, cautions, technique, and review checklist.
- Regenerated Episode 4 edit intelligence: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-edit-intelligence/20260701-173423-682889-edit-intelligence/index.html`.
- Current generated counts remain 12 clip-weave anchors, 12 shorts candidates, 18 cadence candidates, and 12 reaction-cover candidates.
- Sample top short now reports `question-hook`, `normal-review-needed`, comfortable caption density, and per-platform fit instead of only a transcript score.
- Safety: generated metadata/review artifacts only; no source mutation, no timeline write, no export overwrite, and no external publishing.

## 2026-07-01 - Episode 4 top short candidate surfaced in Control Room state and native UI

- Updated `script/build_episode4_cut_intelligence_state.py` so the control-room state exposes a compact `editIntelligence.topShortCandidate` with hook type, caption plan, pacing risk, platform variants, reasons, cautions, and review checklist.
- Updated `Sources/SharedUI/Episode4CutIntelligenceBoardView.swift` so the native Episode 4 Control Room shows the top short candidate inside the Human-feeling cut style card.
- The native card now summarizes time window, transcript summary, hook type, caption density, pacing risk, platform-fit counts, and caption guidance.
- Regenerated the cut-intelligence handoff and confirmed top candidate `ep4-short-candidate-001` at `00:34:30 -> 00:35:42` with `question-hook`, comfortable captions, `normal-review-needed`, and platform fit of 3 strong / 1 needs-trim.
- Product reason: short candidates should be reviewable from the app without requiring humans to dig through generated JSON/HTML first.
- Safety: metadata/review state only; no source mutation, no timeline write, no export overwrite, and no external publishing.

## 2026-07-01 - Episode 4 shorts review ledger gained targeted note lanes

- Updated `script/experimental/build_episode4_edit_review_ledger.py` so proposal reviews now preserve `hookNote`, `captionNote`, `platformNote`, and `framingNote` alongside audio/visual/cadence/source notes.
- Short candidate rows in Markdown/HTML now show hook type, hook draft, caption density/guidance, platform fit summary, and the dedicated review lanes.
- Updated `script/agentctl.sh` so `episode4-edit-review-decision` and dry-run variants pass optional flags through after the positional notes argument.
- Example future dry run: `./script/agentctl.sh episode4-edit-review-decision-dry-run ep4-short-candidate-001 refine Codex "promising but too long for Shorts" --caption-note "starts too mid-sentence" --platform-note "IG/Facebook stronger than YouTube Shorts" --framing-note "needs 9:16 face-safe crop"`.
- Product reason: shorts feedback should preserve the exact reason a candidate is kept/refined/rejected, especially hook, caption, platform, and framing concerns. This keeps review data useful for future human/agent taste learning.
- Safety: review ledger metadata only; no source mutation, no timeline write, no export overwrite, and no external publishing.

## 2026-07-01 - Episode 4 top-short review feedback loop wired into state

- Updated `script/build_episode4_cut_intelligence_state.py` so control-room state now exposes `editIntelligence.topShortReview` beside `topShortCandidate`.
- The summary reports review status, decision, reviewer, notes, hook/caption/platform/framing notes, next action, and missing targeted short-note lanes.
- Updated `script/experimental/build_episode4_edit_review_ledger.py` so ledger counts now include `shortNoteLaneCounts` for hook, caption, platform, framing, and any targeted short note.
- Review ledger Markdown/HTML now shows short-note lane counts so reviewers can tell whether feedback is becoming useful training data or staying generic.
- Product reason: a short candidate should not only be generated; it should accumulate precise feedback about hook, captions, platform fit, and framing so future human/agent edits improve.
- Safety: metadata/review state only; no source mutation, no timeline write, no export overwrite, and no external publishing.
- Validation: not run in this pass; no build/test/verification was explicitly requested.

## 2026-07-01 - Episode 4 native Control Room shows top-short review lanes

- Updated `Sources/SharedUI/Episode4CutIntelligenceBoardView.swift` so the native Human-feeling cut style card joins the top short candidate with its review-ledger state.
- Added visible review status, decision, reviewer, missing hook/caption/platform/framing note lanes, and targeted note summaries.
- Added the edit-review ledger pointer to the native Episode 4 snapshot loader so candidate and review truth stay adjacent in the app without merging their source artifacts.
- Confirmed the watched/source-clip situation remains safe: missing clips stay in the recovery/dropbox workflow, clip-weave proposals remain metadata-only, and no watched clip is guessed into the edit.
- Product reason: shorts should improve through precise feedback, not vague “looks good” notes. The app now shows whether a candidate has useful training data for hook, captions, platform fit, and framing.
- Safety: native UI/data plumbing only; no source mutation, no timeline write, no export overwrite, and no external publishing.
- Validation: not run in this pass; no build/test/verification was explicitly requested.

## 2026-07-01 - Episode 4 watched/source clip dropbox made self-explaining

- Added `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification/README.md` so the recovery workflow is visible at the point where files are dropped.
- The README points to `/Users/wall-e/Desktop/Episode4_Watched_Clip_Recovery_Checklist.md`, preserves the cue-ID filename rule, and explicitly supports uncertain `maybe` candidates without guessing.
- Product reason: Episode 4 can keep moving while watched clips are missing, but source-weave edits must not silently promote guessed media. The folder now carries the safety rule with the assets.
- Safety: workflow documentation only; no source mutation, no timeline write, no export overwrite, and no external publishing.
- Validation: not run in this pass; no build/test/verification was explicitly requested.

## 2026-07-01 - Episode 4 edit intelligence gained cadence/no-cut guardrails

- Updated `script/experimental/build_episode4_edit_intelligence_board.py` with a structured `cadenceProfile` for shorts and cadence-gap candidates.
- New metadata classifies rhythm risk as `technical-pause-risk`, `protect-human-beat`, `protect-reaction`, `long-short-trim-carefully`, or `normal-review`.
- Each cadence profile now carries preserve signals, technical signals, recommended minimum breath, no-cut rationale, review question, and audio/visual review flags.
- Short candidate cards and Markdown now expose cadence classification and no-cut rationale beside hook, caption, platform, and pacing metadata.
- Cadence review rows now explain the guardrail instead of only saying a gap may be tightened.
- Regenerated Episode 4 edit intelligence: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-edit-intelligence/20260701-182000-923015-edit-intelligence/index.html`.
- Current generated counts remain: 12 clip-weave anchors, 12 shorts candidates, 18 cadence candidates, and 12 reaction-cover candidates.
- Product reason: better podcast/shorts edits require knowing when not to cut. This turns “tighten silence” into a reviewable human-cadence decision instead of a robotic cleanup reflex.
- Safety: metadata/review artifacts only; no source mutation, no timeline write, no export overwrite, and no external publishing.
- Validation: no build/test/app verification was run; artifact generation only.

## 2026-07-01 - Episode 4 edit rehearsal packet added

- Added `script/experimental/build_episode4_edit_rehearsal_packet.py` as a pre-apply rehearsal layer between edit-intelligence proposals and review/apply-preview operations.
- Added `./script/agentctl.sh episode4-edit-rehearsal` alias plus help text.
- The rehearsal packet turns top proposals into concrete reversible moves: short recipe rehearsal, cadence decision rehearsal, source-weave placeholder rehearsal, and reaction-cover rehearsal.
- Each move includes the proposed program move, why, tradeoff, cadence guardrail, review question, rehearsal checklist, and a dry-run review command.
- Generated current rehearsal board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-edit-rehearsal/20260701-182738-759369-edit-rehearsal/index.html`.
- Current generated counts: 16 rehearsal moves, 16 unreviewed moves, and 4 source-required placeholder moves.
- Product reason: Quipsly needs a concrete “try this safely” surface before any timeline metadata write. This makes Codex/human review more actionable without bypassing the review ledger or apply-preview safety seam.
- Safety: rehearsal metadata only; no source mutation, no timeline write, no export overwrite, and no external publishing.
- Validation: no build/test/app verification was run; artifact generation only.

## 2026-07-01 - Episode 4 native Control Room surfaces edit rehearsal

- Updated `Sources/SharedUI/Episode4CutIntelligenceBoardView.swift` so the native Episode 4 Control Room reads the latest edit-rehearsal pointer.
- Added a visible `Edit rehearsal` card between cut style and apply-preview state.
- The card shows rehearsal move counts, unreviewed count, source-required placeholder count, top rehearsal move, program move, cadence guardrail, review question, and copyable dry-run/review commands.
- Added `Episode4RehearsalMove` as a compact native model so the UI can distinguish short recipe, cadence, source-placeholder, and reaction-cover rehearsals without raw JSON spelunking.
- Product reason: edit-intelligence proposals are now more actionable inside the app. Humans/agents can see the next safe move before review ledger/apply-preview promotion, keeping whole-source metadata editing calm and reversible.
- Safety: native read-only UI/data plumbing only; no source mutation, no timeline write, no export overwrite, and no external publishing.
- Validation: not run in this pass; no build/test/app verification was explicitly requested.

## 2026-07-01 - Episode 4 edit rehearsal surfaced in CLI handoff and Start Here board

- Updated `script/build_episode4_cut_intelligence_state.py` so the cut-intelligence handoff now reads the latest edit-rehearsal pointer.
- The handoff now reports rehearsal status, move counts, unreviewed move count, source-required move count, top rehearsal move, program move, cadence guardrail, review question, and dry-run review command.
- Updated `script/experimental/build_episode4_start_here_board.py` so Start Here includes an `Edit rehearsal moves` card and a priority action to rehearse one move before apply-preview.
- Regenerated cut-intelligence handoff: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-control-room-state/latest-episode4-cut-intelligence-handoff.md`.
- Regenerated Start Here board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-start-here/20260701-184540-951919-start-here/index.html`.
- Current rehearsal evidence: 16 moves, 16 unreviewed moves, 4 source-required moves, top move `ep4-short-candidate-001` at `00:34:30 -> 00:35:42`.
- Product reason: Episode 4 now has one clearer path from proposal -> rehearsal -> review ledger -> apply-preview without forcing humans or agents to dig through disconnected artifacts.
- Safety: artifact/control-surface plumbing only; no source mutation, no timeline write, no export overwrite, and no external publishing.
- Validation: artifact generation and readback only; no build/test/app verification was run.

## 2026-07-01 - Episode 4 rehearsal moves gained reviewer-ready note lanes

- Updated `script/experimental/build_episode4_edit_rehearsal_packet.py` so each rehearsal move now includes a structured `reviewBrief`.
- Review briefs include a five-second context scrub window, move-specific note lanes, human review questions, agent evidence prompts, and dry-run/record command examples.
- Short recipe rehearsals now prompt hook, caption, platform, framing, and cadence notes instead of a generic `notes` field.
- Cadence rehearsals now ask for audio/cadence/visual evidence before tightening a gap.
- Source-weave placeholder rehearsals now preserve source truth by prompting source/audio/visual notes and defaulting uncertain clip work to `needs-source`.
- Reaction-cover rehearsals now require visual/audio/cadence evidence so generic reaction wallpaper is easier to reject.
- Regenerated edit rehearsal board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-edit-rehearsal/20260701-185412-874570-edit-rehearsal/index.html`.
- Regenerated downstream Start Here board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-start-here/20260701-185412-994917-start-here/index.html`.
- Readback confirmed top move `ep4-short-candidate-001` now carries scrub window `00:34:25 -> 00:35:47`, note lanes `hook/caption/platform/framing/cadence`, and keep/refine decision command examples.
- Product reason: this turns rehearsal from “proposal exists” into “review this exact way and capture useful taste data,” which helps humans and agents improve cuts without NLE expertise.
- Safety: rehearsal/review metadata only; no source mutation, no timeline write, no export overwrite, and no external publishing.
- Validation: artifact generation and JSON readback only; no build/test/app verification was run.

## 2026-07-01 - Episode 4 cut-intelligence handoff now carries rehearsal review prompts

- Updated `script/build_episode4_cut_intelligence_state.py` so `editRehearsal.topMove` now preserves the top move's structured `reviewBrief`.
- The high-level cut-intelligence handoff now shows the top rehearsal scrub window, why that context window matters, note lanes, and concrete decision dry-run examples.
- Current top rehearsal move remains `ep4-short-candidate-001` at `00:34:30 -> 00:35:42`, with review context window `00:34:25 -> 00:35:47`.
- The handoff now exposes hook, caption, platform, framing, and cadence note prompts for the top short candidate instead of leaving reviewers with a generic `notes` placeholder.
- Regenerated cut-intelligence handoff: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-control-room-state/latest-episode4-cut-intelligence-handoff.md`.
- Regenerated Start Here board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-start-here/20260701-185913-096066-start-here/index.html`.
- Product reason: the single control-room handoff should be enough to start useful review work. Reviewers should not have to spelunk raw JSON to capture taste data.
- Safety: handoff/control metadata only; no source mutation, no timeline write, no export overwrite, and no external publishing.
- Validation: artifact generation and command output readback only; no build/test/app verification was run.

## 2026-07-01 - Episode 4 next rehearsal resolver added

- Added `--next` support to `script/experimental/build_episode4_edit_rehearsal_packet.py` so the rehearsal system can answer the practical question: what should be reviewed next?
- Added `./script/agentctl.sh episode4-edit-rehearsal-next` with aliases `episode4-rehearsal-next` and `episode4-next-rehearsal`.
- The resolver returns the next unreviewed rehearsal move, scrub window, note lanes, review questions, agent evidence prompts, and dry-run/record decision command examples.
- Readback confirmed the current next move is `ep4-short-candidate-001`, a `short-recipe-rehearsal` at `00:34:30 -> 00:35:42`, with scrub window `00:34:25 -> 00:35:47`.
- Readback confirmed the top move exposes hook, caption, platform, framing, and cadence note lanes with keep/refine command examples.
- Product reason: humans and agents need a stable next-action resolver, not a scavenger hunt through generated artifacts. This makes review more repeatable and less scary without writing edit metadata.
- Safety: next-action resolver metadata only; no source mutation, no timeline write, no review-ledger mutation, no export overwrite, and no external publishing.
- Validation: CLI generation/readback only via `episode4-edit-rehearsal-next --markdown` and `--json`; no build/test/app verification was run.

## 2026-07-01 - Episode 4 next rehearsal decision shortcuts added

- Updated `script/experimental/build_episode4_edit_rehearsal_packet.py` so the next rehearsal resolver can run a selected decision option from the current top move.
- Added safe-default dry-run behavior: `--next --decision keep` runs the dry-run command unless `--record-decision` is explicitly set.
- Added `./script/agentctl.sh episode4-edit-rehearsal-next-decision-dry-run <decision>` and `./script/agentctl.sh episode4-edit-rehearsal-next-decision <decision>` aliases.
- Dry-run readback confirmed `keep` for `ep4-short-candidate-001` preserves hook, caption, platform, framing, and cadence notes without mutating the review ledger.
- Markdown dry-run confirmed `refine` for `ep4-short-candidate-001` carries specific improvement notes and a next-action hint for revised short recipe work.
- Product reason: reviewers should not hand-copy long command strings to preserve useful taste data. The correct structured review path is now easier to run than a generic `notes` decision.
- Safety: dry-run validation only; no source mutation, no timeline write, no review-ledger mutation, no export overwrite, and no external publishing.
- Validation: CLI dry-run readback only; no build/test/app verification was run.

## 2026-07-01 - Episode 4 handoff refreshed around missing watched/source clips

- Regenerated the Episode 4 cut-intelligence handoff so the top rehearsal move now exposes compact dry-run/record shortcut commands beside the full review examples.
- Regenerated the Episode 4 Start Here board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-start-here/20260701-192347-009791-start-here/index.html`.
- Confirmed current clip-weave truth: Episode 4 has usable main host/camera/audio sources, but no watched/source clip files are currently present in the intake dropbox, so real clip insertion remains intentionally blocked.
- Current highest-priority missing cue is `ep4-cue-013` around `01:26:34 -> 01:27:47`; likely files should be dropped into `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification` with the cue ID in the filename.
- Product reason: missing watched/source clips should be a clear human recovery task, not a reason for Quipsly to invent media or stall the whole Episode 4 edit.
- Safety: metadata/handoff artifacts only; no source media mutation, no timeline write, no export overwrite, no review-ledger mutation, and no external publishing.
- Evidence generated: cut-intelligence handoff and Start Here board artifact generation only; no build/test/app validation was run.

## 2026-07-01 - Episode 4 watched/source next-cue recovery command

- Added `--next` and `--cue-id` support to `script/experimental/build_episode4_watched_source_recovery_packet.py` so Episode 4 watched/source recovery can be handled one cue at a time.
- Added `./script/agentctl.sh episode4-watched-source-next [--cue-id ep4-cue-013] [--json|--markdown]` aliases for the focused recovery workflow.
- Default next cue is currently `ep4-cue-013` at `01:26:34 -> 01:27:47`, with audio-review clip and dropbox instructions included in the command output.
- Cue-specific lookup was checked with `ep4-cue-002` and returned `00:26:11 -> 00:28:14`.
- Product reason: the missing watched-clip problem should become a small repeatable cue-finding loop, not a blocker for the whole episode edit or a temptation to invent source media.
- Safety: recovery packet generation only; no source media mutation, no timeline write, no export overwrite, no review-ledger mutation, and no external publishing.
- Evidence generated: `episode4-watched-source-next --markdown`, `episode4-watched-source-recovery-packet --json`, and cue-specific next lookup; no build/test/app validation was run.

## 2026-07-01 - Episode 4 watched/source recovery board gained inline audio review

- Improved `script/experimental/build_episode4_watched_source_recovery_packet.py` so the HTML recovery board now has a focused next-cue card and playable audio controls for cue review windows.
- Regenerated board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-watched-source-recovery-packet/20260701-193653-770832-watched-source-recovery/index.html`.
- Current default next cue remains `ep4-cue-013` at `01:26:34 -> 01:27:47` with suggested filename `ep4-cue-013-short-description.mp4`.
- Product reason: while Charlie is re-watching/listening, the artifact should support memory recovery directly instead of making him bounce between a Markdown list and Finder.
- Safety: recovery artifact generation only; no source media mutation, no timeline write, no export overwrite, no review-ledger mutation, and no external publishing.
- Evidence generated: artifact readback found the next-cue card, 10 audio controls, local file URLs, and `sourceFilesMutated=False`; no build/test/app validation was run.

## 2026-07-01 - Episode 4 YouTube recipe next-review command

- Added next-review selection and guidance to `script/experimental/build_episode4_youtube_recipe_review_ledger.py`.
- Added `./script/agentctl.sh episode4-youtube-recipe-next-review [--operation-id ID] [--json|--markdown]`.
- The command prioritizes human-feeling review work such as `needs-listen`, cadence, and reaction-cover decisions before source-placeholder work, so missing watched clips do not stall host-spine editing.
- Current next review selects `ep4-ys-reaction-cover-ep4-reaction-cover-001` at `00:03:30 -> 00:03:36` with watch/listen guidance, reason, tradeoff, do-not-automate language, and dry-run/record commands.
- Product reason: Quipsly should present one explainable edit decision at a time, including why it was suggested and what tradeoff it makes, before any branch metadata is promoted.
- Safety: review handoff/sidecar surfaces only; no source media mutation, no timeline write, no branch metadata write, no export overwrite, no review-ledger mutation during next-review, and no external publishing.
- Evidence generated: `episode4-youtube-recipe-next-review --markdown` and `--json` readback; no build/test/app validation was run.

## 2026-07-01 - Episode 4 recipe review board gained next-review focus

- Embedded `nextReview` into the Episode 4 YouTube-standard recipe review ledger payload so the board and CLI share the same selected review operation.
- Updated the Markdown and HTML review ledger surfaces to show a focused next-review card with operation ID, kind, window, review mode, edit intent, listen-for checks, visual checks, tradeoff, do-not-automate language, and dry-run commands.
- Regenerated current ledger surfaces at `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-youtube-standard-recipe-review/20260701-134630-099069-youtube-recipe-review/index.html`.
- Current focused review remains `ep4-ys-reaction-cover-ep4-reaction-cover-001` at `00:03:30 -> 00:03:36`.
- Product reason: reviewers should see the next meaningful edit decision directly on the board, not have to know a separate command exists.
- Safety: sidecar review surface only; no source media mutation, no timeline write, no branch metadata write, no export overwrite, no review-ledger mutation from next-review, and no external publishing.
- Evidence generated: `episode4-youtube-recipe-review-ledger --json` readback confirmed `nextReview`, HTML focus, Markdown focus, and `timelineDecisionsWritten=False`; no build/test/app validation was run.

## 2026-07-01 - Episode 4 recipe review decisions preserve rich note lanes

- Updated `script/agentctl.sh` so `episode4-youtube-recipe-review-decision-dry-run` and `episode4-youtube-recipe-review-decision` forward optional note flags instead of dropping them.
- Updated `script/experimental/build_episode4_youtube_recipe_review_ledger.py` so next-review suggested commands include mode-aware note lanes such as `--audio-note`, `--visual-note`, `--cadence-note`, and `--source-note`.
- Product reason: `keep/refine/reject` is not enough training or review signal. The useful editing memory is why the audio, visual reaction, cadence, or source context did or did not work.
- Safety: command/readback work only; dry-run review did not mutate the ledger, write timeline metadata, mutate source media, render exports, overwrite versions, or publish externally.
- Evidence generated: next-review readback found note flags in generated dry-run commands; dry-run decision preserved audio, visual, and cadence notes with `ledgerMutated=False`; no build/test/app validation was run.

## 2026-07-01 - Episode 4 recipe review board surfaces note prompts and review notes

- Added mode-aware review note prompts to the Episode 4 YouTube-standard next-review payload.
- Updated the next-review Markdown output and the review-ledger HTML/Markdown surfaces to show prompts for `audioNote`, `visualNote`, `cadenceNote`, and `sourceNote`.
- Updated operation cards so recorded audio/visual/cadence/source notes and history counts are visible instead of buried only in JSON.
- Product reason: edit-learning data depends on specific notes about audio flow, visual reaction, cadence, and source context, not just broad decisions like `keep` or `refine`.
- Safety: sidecar review artifact generation and dry-run checks only; no source media mutation, no timeline write, no branch metadata write, no export overwrite, no ledger mutation from dry-run, and no external publishing.
- Evidence generated: review-ledger readback confirmed HTML note prompts, Markdown note prompts, command note flags, and `timelineDecisionsWritten=False`; dry-run decision preserved rich note lanes with `ledgerMutated=False`; no build/test/app validation was run.

## 2026-07-01 - Episode 4 recipe review ledger exports edit-learning JSONL evidence

- Added a machine-friendly edit-learning dataset export to `script/experimental/build_episode4_youtube_recipe_review_ledger.py`.
- Each record captures operation ID, operation kind, sequence window, branch target, edit intent, review mode, reason, tradeoff, do-not-automate guidance, decision/status, rich note lanes, history count, promotion readiness, and safety truth.
- The ledger now writes `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-youtube-standard-recipe-review/20260701-134630-099069-youtube-recipe-review/episode4-youtube-standard-recipe-review-learning.jsonl` and advertises it from the stable latest pointer.
- The current dataset contains 47 records. This is labeled review evidence only; it does not train a model, write timeline metadata, promote branch metadata, render exports, or publish externally.
- Product reason: future Codex/Mako review cycles need structured examples of why a cut worked or failed, not just final decisions.
- Safety: artifact generation only; no source media mutation, no timeline write, no branch metadata write, no export overwrite, no review-ledger mutation, and no external publishing.
- Evidence generated: ledger readback confirmed 47 JSONL records with edit-intent/tradeoff/decision/notes/safety fields, board links to the dataset, latest pointer advertises the dataset path, and `timelineDecisionsWritten=False`; no build/test/app validation was run.

## 2026-07-01 - Episode 4 watched/source recovery gained a clip identification scratchpad

- Improved `script/experimental/build_episode4_watched_source_recovery_packet.py` so every watched/source cue now carries a focused capture prompt and structured memory fields: clip title/description, source URL or file path, source in/out, why it belongs, confidence, and notes.
- The recovery packet now writes a versioned scratchpad beside the JSON/Markdown/HTML packet: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-watched-source-recovery-packet/20260701-203352-318177-watched-source-recovery/episode4-watched-source-clip-identification-scratchpad.md`.
- Current readback: 9 watched/source cues, 0 dropbox media files, first cue `ep4-cue-013`, scratchpad exists, capture prompt exists, and pointer advertises the scratchpad path.
- Product reason: Charlie can re-watch Episode 4 and jot rough clip memory without blocking the main host-spine edit or tempting Quipsly to invent missing source media.
- Safety: recovery artifacts only; no source media mutation, no timeline write, no branch metadata write, no export overwrite, no clip import, and no external publishing.
- Evidence generated: `episode4-watched-source-recovery-packet --json` readback confirmed scratchpad path, structured memory fields, `timelineDecisionsWritten=False`, and `sourceFilesMutated=False`; no build/test/app validation was run.

## 2026-07-01 - Episode 4 edit-learning dataset coverage pointer confirmed

- Confirmed the stable Episode 4 YouTube-standard recipe review pointer now exposes the edit-learning dataset summary, not just the dataset path.
- Current pointer readback: 47 learning records, 0.0% review coverage, 0.0% rich-note coverage, 8 next learning gaps, and `timelineDecisionsWritten=False`.
- Product reason: future review and training-adjacent work needs to know whether edit examples have real human/agent review notes or are still generated suggestions awaiting evidence.
- Safety: readback/logging only; no source media mutation, no timeline write, no branch metadata write, no export overwrite, no review-ledger mutation, and no external publishing.
- Evidence generated: latest pointer JSON readback only; no build/test/app validation was run.

## 2026-07-01 - Episode 4 watched/source recovery gained a found-clip manifest template

- Improved `script/experimental/build_episode4_watched_source_recovery_packet.py` so the recovery packet now emits an editable found-clip manifest template beside the scratchpad, Markdown, HTML, and JSON packet.
- Current manifest template: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-watched-source-recovery-packet/20260701-204809-186747-watched-source-recovery/episode4-watched-source-found-clip-manifest.template.json`.
- Current readback: 9 cue candidates, first candidate `ep4-cue-013`, pointer advertises the manifest template path, `promotionAllowed=False`, `timelineDecisionsWritten=False`, and `sourceFilesMutated=False`.
- Product reason: when Charlie identifies watched/source clips, the system now has a clean cue-to-file candidate shape before source intake or clip-weave metadata promotion. Missing clips remain structured recovery work, not hidden timeline state.
- Safety: artifact generation/readback only; no source media mutation, no clip import, no timeline write, no branch metadata write, no export overwrite, and no external publishing.
- Evidence generated: `episode4-watched-source-recovery-packet --json` readback confirmed manifest existence, cue count, candidate count, pointer path, promotion safety, and truth flags; no build/test/app validation was run.

## 2026-07-01 - Episode 4 found-clip manifest validation added

- Added `script/experimental/build_episode4_found_clip_manifest_validation.py` and exposed it through `./script/agentctl.sh episode4-found-clip-validation`.
- The validator reads the latest Episode 4 watched/source found-clip manifest template, checks cue candidates for real file paths, confidence, and promotion safety, then writes a versioned validation packet and latest pointer.
- Current readback: status `episode4-found-clip-validation-ready`, manifest exists, 9 candidates, 0 ready for source-intake review, 9 waiting for files, first cue `ep4-cue-013`, and pointer status is current.
- Product reason: once watched/source clips are identified, Quipsly can preflight candidate files before source intake or clip-weave promotion. This keeps missing clips structured and visible without inventing media or writing timeline state.
- Safety: validation artifacts/readback only; no source media mutation, no clip import, no timeline write, no branch metadata write, no export overwrite, and no external publishing.
- Evidence generated: `episode4-found-clip-validation --json` readback confirmed candidate counts, waiting-file state, pointer status, `timelineDecisionsWritten=False`, `sourceFilesMutated=False`, and `clipsImported=False`; no build/test/app validation was run.

## 2026-07-01 - Episode 4 Start Here now surfaces watched/source recovery validation

- Updated `script/experimental/build_episode4_start_here_board.py` so the Episode 4 Start Here board includes both the watched/source recovery packet and the found-clip manifest validation surface.
- The first next action now routes to `episode4-watched-source-next --markdown` plus `episode4-found-clip-validation --markdown` when watched/source files are still missing or unvalidated.
- Current board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-start-here/20260701-210452-970094-start-here/index.html`.
- Current readback: board status `episode4-start-here-ready`, watched/source recovery card present, found-clip validation card present, 9 validation candidates, 9 waiting for files, 0 ready for source-intake review, 9 audio review clips, 0 dropbox files.
- Product reason: Episode 4 can keep advancing on the host-spine edit while watched/source clips are recovered through a visible cue -> manifest -> validation -> intake path instead of hidden uncertainty.
- Safety: read-only aggregation/artifact generation only; no source media mutation, no clip import, no timeline write, no branch metadata write, no export overwrite, and no external publishing.
- Evidence generated: `episode4-start-here` regeneration and latest pointer readback confirmed card presence, next action command, validation/recovery counts, `timelineDecisionsWritten=False`, and `sourceFilesMutated=False`; no build/test/app validation was run.

## 2026-07-01 - Episode 4 proof-listen queue now separates host-spine review from source recovery

- Updated `script/experimental/build_episode4_recipe_proof_listen_queue.py` so the main proof runway excludes watched/source placeholders and starts with reviewable host-spine work while keeping source recovery in a separate runway.
- Updated `script/experimental/build_episode4_start_here_board.py` so Episode 4 Start Here includes the host-spine proof-listen queue and a direct next action for proof-listening while source clips are missing.
- Current proof-listen queue: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-recipe-proof-listen-queue/20260701-211845-516266-recipe-proof-listen/index.html`.
- Current Start Here board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-start-here/20260701-211847-724896-start-here/index.html`.
- Current readback: 47 total recipe tasks, 46 host-spine reviewable now, 1 blocked by watched/source media, 8 proof-runway items, first proof item `cadence-tighten-review`, 1 source-recovery runway item, and 8 sidecar proof-listen audio windows generated from `/Volumes/My Passport/Episode 4/Charlie Ep4.wav`.
- Start Here now lists both `Recover the watched/source clips without blocking the host-spine edit` and `Proof-listen host-spine cuts while source clips are missing`.
- Product reason: watched/source clip recovery should stay visible, but it should not teach the user or agent that Episode 4 editing is frozen. Host-spine cadence, reaction, show/skip, and duration review can continue now.
- Safety: sidecar queue/audio-window generation and read-only aggregation only; no source media mutation, no clip import, no timeline write, no branch metadata write, no export overwrite, and no external publishing.
- Evidence generated: proof-listen queue and Start Here readback confirmed host-spine/source separation, generated review-window count, next action visibility, `timelineDecisionsWritten=False`, and `sourceFilesMutated=False`; no build/test/app validation was run.

## 2026-07-01 - Episode 4 host-spine proof-listen gained a one-card next-review command

- Updated `script/experimental/build_episode4_recipe_proof_listen_queue.py` with focused next-item output via `--next` / `--operation-id`.
- Exposed the focused command through `./script/agentctl.sh episode4-recipe-proof-listen-next [--operation-id id] [--json|--markdown]`.
- Updated `script/experimental/build_episode4_start_here_board.py` so the host-spine review next action opens the focused next-card command instead of the full 47-task queue.
- Current next host-spine item: `ep4-ys-cadence-review-ep4-cadence-045`, kind `cadence-tighten-review`, mode `listen-first`, suggested decision `needs-listen`.
- Current proof question: `If this cut were made, would the hosts still sound like humans thinking together?`
- Current audio review clip: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-recipe-proof-listen-queue/20260701-213036-664629-recipe-proof-listen/proof-listen-audio/01-ep4-ys-cadence-review-ep4-cadence-045.m4a`.
- The next-card payload includes dry-run and record command templates with audio/visual/cadence note lanes, so one review can produce useful edit-learning evidence instead of a vague keep/refine decision.
- Product reason: reviewers should be able to complete one real host-spine review loop while watched/source clips remain missing. One proof question plus one audio clip plus one rich-note command is less scary than a giant queue.
- Safety: sidecar queue/audio-window generation and read-only board aggregation only; no source media mutation, no clip import, no timeline write, no branch metadata write, no export overwrite, and no external publishing.
- Evidence generated: `episode4-recipe-proof-listen-next --json` readback confirmed focused operation, audio clip, rich-note command templates, `timelineDecisionsWritten=False`, `sourceFilesMutated=False`, and `clipsImported=False`; Start Here readback confirmed the host-spine action now uses `episode4-recipe-proof-listen-next --markdown`; no build/test/app validation was run.

## 2026-07-01 - Episode 4 proof-listen next decision dry-run wraps the recipe review ledger

- Updated `script/experimental/build_episode4_recipe_proof_listen_queue.py` so the focused host-spine proof card can dry-run or record a review decision for the selected operation while delegating to the existing YouTube recipe review ledger.
- Added `./script/agentctl.sh episode4-recipe-proof-listen-next-decision-dry-run decision [reviewer] [notes] ...` and `./script/agentctl.sh episode4-recipe-proof-listen-next-decision decision [reviewer] [notes] ...`.
- Current dry-run target: `ep4-ys-cadence-review-ep4-cadence-045`, decision `needs-listen`.
- Dry-run preserved rich notes: audio `Need to hear whether this is dead air or thinking breath.`, visual `Check whether a same-face jump would need reaction cover.`, cadence `Avoid tightening into robotic certainty.`
- Product reason: the one-card proof-listen workflow now has a low-friction way to create useful sidecar review evidence without copying operation IDs by hand or bypassing the ledger source of truth.
- Safety: dry-run readback only; no source media mutation, no clip import, no timeline write, no branch metadata write, no export overwrite, no external publishing, and no review-ledger mutation.
- Evidence generated: `episode4-recipe-proof-listen-next-decision-dry-run --json/--markdown` readback confirmed delegate status `dry-run-ready`, event `dryRun=True`, rich note fields preserved, `reviewDecisionsRecorded=False`, `ledgerMutated=False`, `timelineDecisionsWritten=False`, `sourceFilesMutated=False`, and `clipsImported=False`; no build/test/app validation was run.

## 2026-07-01 - Episode 4 next host-spine proof item gained HTML/Markdown/JSON review surfaces

- Updated `script/experimental/build_episode4_recipe_proof_listen_queue.py` so `episode4-recipe-proof-listen-next` now writes versioned JSON, Markdown, and HTML surfaces plus `latest-episode4-recipe-proof-listen-next.json`.
- Updated `script/experimental/build_episode4_start_here_board.py` so Start Here links the `Next host-spine proof card` surface beside the full proof-listen queue.
- Current next proof card: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-recipe-proof-listen-queue/20260701-214721-048665-recipe-proof-listen/next.html`.
- Current operation: `ep4-ys-cadence-review-ep4-cadence-045`, with playable sidecar audio `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-recipe-proof-listen-queue/20260701-214721-048665-recipe-proof-listen/proof-listen-audio/01-ep4-ys-cadence-review-ep4-cadence-045.m4a`.
- Current readback: next card status `episode4-recipe-proof-listen-next-ready`, HTML exists, audio ok, latest next pointer advertises the HTML path, and Start Here includes `recipeProofListenNext`.
- Product reason: Cut Intelligence should not be a giant JSON queue. The reviewer now gets one proof question, one audio window, listen/visual checks, and rich-note commands as a calm review artifact.
- Safety: sidecar queue/audio-window/artifact generation and read-only Start Here aggregation only; no source media mutation, no clip import, no timeline write, no branch metadata write, no export overwrite, and no external publishing.
- Evidence generated: `episode4-recipe-proof-listen-next --json` and `episode4-start-here` readback confirmed surface paths, audio evidence, pointer status, `timelineDecisionsWritten=False`, `sourceFilesMutated=False`, and `clipsImported=False`; no build/test/app validation was run.

## 2026-07-01 - Episode 4 next proof card gained a Cut Intelligence UI contract

- Updated `script/experimental/build_episode4_recipe_proof_listen_queue.py` so the focused next host-spine proof payload now includes a `uiContract` for a future/native `CutIntelligenceNextProofCard`.
- The contract defines primary and secondary actions, intended writes, risk labels, forbidden actions, and safety flags for timeline writes, source mutation, clip import, and external publishing.
- Updated the next proof Markdown/HTML card to show safe UI actions, what they write, and what is forbidden from the card.
- Current next proof card: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-recipe-proof-listen-queue/20260701-215539-115893-recipe-proof-listen/next.html`.
- Current readback: component `CutIntelligenceNextProofCard`, state `review-ready`, primary action `Dry-run review note`, 5 secondary actions, `timelineWriteAllowed=False`, `sourceMutationAllowed=False`, HTML contains `Safe UI actions`, and the selected operation remains `ep4-ys-cadence-review-ep4-cadence-045`.
- Product reason: Cut Intelligence should move from scripts toward a safe app panel. The artifact now tells the native UI what actions are safe, what they write, and which actions are forbidden, instead of relying on hardcoded tribal knowledge.
- Safety: sidecar artifact generation/readback only; no source media mutation, no clip import, no timeline write, no branch metadata write, no export overwrite, and no external publishing.
- Evidence generated: `episode4-recipe-proof-listen-next --json` readback confirmed UI contract fields, HTML safe-action rendering, `timelineDecisionsWritten=False`, and `sourceFilesMutated=False`; no build/test/app validation was run.

## 2026-07-01 - Episode 4 next proof-listen native card

- Added native Quipsly Studio UI wiring for the latest Episode 4 recipe proof-listen next pointer inside `Episode4CutIntelligenceBoardView`.
- The card reads `latest-episode4-recipe-proof-listen-next.json`, shows the selected operation, sequence range, proof question, audio review window path, listen/visual checks, primary safe dry-run action, secondary safe actions, and safety boundary flags.
- This is read-only proof/review surfacing: it does not import watched clips, write timeline metadata, mutate source media, export, publish, or record a decision from the card itself.
- The refresh command copy now includes `episode4-recipe-proof-listen-next --markdown` so Start Here, queue, and the focused next-card stay aligned.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen gained visual-review briefs

- Added a native `Copy visual-review brief` affordance to the Episode 4 proof-listen sidecar composer for `needs-visual-review` decisions.
- The packet asks reviewers to check reaction cover, eye-line/body continuity, source wall/program frame proof, and same-speaker jump-cut handling before any apply-preview or metadata promotion.
- Added `visualReviewBrief` and `canCreateVisualReviewBrief` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- Added `safeCommands.copyVisualReviewBrief` to the proof-listen next endpoint.
- Added direct CLI commands `episode4-proof-listen-visual-review-brief` and `episode4-proof-listen-visual-review-brief-preview` with aliases for default and custom visual-review packets.
- Added visual-review commands to AgentServer `/commands` discovery.
- Product reason: audio-plausible cuts still need picture proof. `needs-visual-review` should become a concrete source-wall/program-frame review task instead of a vague pause state.
- Safety boundary: packet generation/readback only. It inspects no media by itself, records no review decisions, executes no record command, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 next proof-listen agent endpoint

- Added read-only AgentServer endpoint `GET /episode4_proof_listen_next` with alias `GET /episode4_next_proof`.
- The endpoint reads the latest focused proof-listen pointer at `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-recipe-proof-listen-queue/latest-episode4-recipe-proof-listen-next.json` and exposes the operation, proof question, sequence range, proof audio file status, UI contract, safe commands, and truth boundaries.
- Added the endpoint to `/commands` so Codex and other agents can discover it without scraping the native UI or external HTML board.
- Safety boundary: endpoint is read-only and records no review decision; it does not import clips, write timeline metadata, mutate source files, export, publish, or overwrite anything.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen native agentctl command

- Added `script/agentctl.sh episode4-proof-listen-next-native` with aliases `episode4-next-proof-native` and `episode4-native-proof-next`.
- This command calls the running native app's read-only `GET /episode4_proof_listen_next` endpoint, separate from `episode4-recipe-proof-listen-next`, which regenerates the sidecar next-card artifact.
- Purpose: keep human UI, HTTP agent UI, and shell agent UI aligned around the same focused Episode 4 proof-listen target.
- Safety boundary: command reads app-visible proof-listen state only; it does not record decisions, import clips, write timeline metadata, mutate source media, export, publish, or overwrite versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen safety language tightening

- Tightened the native Episode 4 next proof-listen card action labels so command actions say `Copy ...` instead of implying the button records a decision directly.
- Updated secondary action help text to clarify that clicking command actions only copies deliberate review commands; it does not record anything by itself.
- Added `script/agentctl.sh episode4-proof-listen-next-state` as a clearer read-only alias for the running app endpoint `GET /episode4_proof_listen_next`.
- Safety boundary remains unchanged: this pass does not import clips, write timeline metadata, mutate source files, export, publish, overwrite versions, or record review decisions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen reviewer prompt bridge

- Added a copyable plain-English reviewer prompt to the native Episode 4 next proof-listen card.
- Added the same `reviewerPrompt` text to the read-only `GET /episode4_proof_listen_next` endpoint and exposed it under `safeCommands.copyReviewerPrompt`.
- The prompt asks reviewers to answer what the audio/cadence proved, what the picture/reaction proved, and whether the operation should be keep/refine/reject/needs-listen.
- Purpose: make proof-listen review usable by Charlie/Mako/Homer and agents without requiring anyone to interpret sidecar JSON, command syntax, or NLE internals.
- Safety boundary: prompt copy is review-only; it does not import clips, write timeline metadata, mutate source files, export, publish, overwrite versions, or record review decisions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen review-note composer

- Added a native sidecar review-note composer to the Episode 4 next proof-listen card.
- The composer captures reviewer, decision, short note, audio/cadence evidence, visual/reaction evidence, and preserve/tighten guidance.
- Native buttons copy either a safe dry-run command or a deliberate record command; clicking the buttons does not execute either command.
- Added `reviewNoteComposer` guidance to `GET /episode4_proof_listen_next`, including allowed decisions, dry-run/record command templates, field meanings, and write boundaries.
- This moves the Episode 4 proof loop toward real human/agent review: listen, explain tradeoff, record sidecar evidence intentionally, then only later promote metadata when warranted.
- Safety boundary: this pass does not import clips, write timeline metadata, mutate source files, export, publish, overwrite versions, or execute review commands.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen command preview endpoint

- Added read-only AgentServer endpoint `GET /episode4_proof_listen_command_preview` with alias `GET /episode4_next_proof_command_preview`.
- The endpoint accepts decision, reviewer, notes, audio note, visual note, and cadence note query values, then returns shell-safe dry-run and record commands for the current Episode 4 proof-listen next item.
- Added `script/agentctl.sh episode4-proof-listen-command-preview [decision] [reviewer] [notes] [audio-note] [visual-note] [cadence-note]` as the CLI wrapper.
- Purpose: agents and humans can compose review commands through the app control plane instead of hand-building brittle quoted shell strings.
- Safety boundary: preview endpoint executes no commands and records no decisions. Dry-run remains no-write; record command remains sidecar-review-ledger-only if intentionally run later.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen review coverage

- Added review coverage to the native Episode 4 next proof-listen card: reviewed count, needs-review count, sidecar event count, percent label, and plain-English guidance.
- Added `reviewCoverage` to `GET /episode4_proof_listen_next`, including task counts, host-spine reviewable counts, pending/needs-listen/needs-source counts, and agent guidance.
- Purpose: reviewers and agents can see whether Episode 4 proof-listen work is accumulating evidence instead of becoming disconnected notes.
- Safety boundary: coverage is read-only sidecar state. This pass does not import clips, write timeline metadata, mutate source files, export, publish, overwrite versions, or record decisions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen composer now primes from the current operation

- Updated the native Episode 4 proof-listen sidecar review composer so it initializes from the currently selected next proof-listen operation.
- The composer now remembers the operation id it was primed from, which lets a newly loaded proof target get useful defaults without overwriting reviewer notes while the same target is still active.
- Default review fields now pull the suggested decision, sequence range, risk label, first listen check, first visual check, and proof question from the focused next-card payload.
- Product reason: proof-listen review should create useful evidence by default. Reviewers and agents should start from the actual cadence/reaction question, not a generic blank-note box.
- Safety boundary: this only changes native UI state defaults. It does not execute review commands, record sidecar events, import clips, write timeline metadata, mutate source files, export, publish, or overwrite versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen composer language points back to Episodes 1-6 proof lanes

- Tightened the native proof-listen composer guidance so it frames Episode 4 as the current active proof target, not a one-off hardcoded destination.
- The composer now explicitly describes the review habit intended across Episodes 1-6: listen, explain the tradeoff, dry-run first, then record only on purpose.
- Product reason: Episode 4 is the pressure test, but the cut-intelligence loop needs to become reusable proof-lane infrastructure for all podcast episodes and shorts.
- Safety boundary: copy-only UI language change. No review commands executed, no sidecar events recorded, no timeline metadata written, no source files mutated, no export, no publishing, and no version overwrite.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen evidence is visible in native UI and agent readback

- Added explicit recipe-review decision counts to the native Episode 4 Cut Intelligence snapshot: pending, needs-listen, and needs-source.
- Added a `Proof evidence` strip to the next proof-listen card so reviewers can see whether sidecar review decisions actually exist before trusting or promoting edit metadata.
- The strip now distinguishes no recorded review events from real progress and gives plain-English guidance for pending, needs-listen, and needs-source cases.
- Added `reviewEvidence` to `GET /episode4_proof_listen_next`, including ledger path, operations, reviewed, review-needed, events, pending, needs-listen, needs-source, and agent guidance.
- Product reason: the editor needs to show the difference between generated suggestions and reviewed evidence. This helps humans and agents keep cadence/reaction decisions honest instead of treating unreviewed cut ideas as truth.
- Safety boundary: read-only UI and endpoint surfacing only. No review commands executed, no sidecar events recorded, no clips imported, no timeline metadata written, no source files mutated, no export, no publishing, and no version overwrite.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen evidence got a direct agent command alias

- Added `script/agentctl.sh episode4-proof-listen-evidence` as a direct alias for the running app's read-only `GET /episode4_proof_listen_next` endpoint.
- Added companion aliases `episode4-proof-evidence` and `episode4-next-proof-evidence` to reduce agent/operator command-name ambiguity.
- Updated AgentServer `/commands` discovery so agents see the proof-listen evidence command and the safe command-preview workflow together.
- Product reason: Codex and human reviewers should be able to ask for current proof evidence without remembering that it is hidden inside the "next proof" state endpoint. One command, one truth surface, fewer stale-note mistakes.
- Safety boundary: alias/discovery only. It reads current app-visible proof state; it does not execute review commands, record sidecar events, import clips, write timeline metadata, mutate source files, export, publish, or overwrite versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen review packet added for humans and agents

- Added a native `Copy review packet` action beside the Episode 4 proof-listen reviewer prompt.
- The packet includes operation id, sequence range, operation kind, review mode, suggested/current decision, risk, review evidence counts, proof audio path, proof question, listen checks, visual checks, and blank fields for decision/audio/visual/cadence notes.
- Added the same `reviewPacket` text to `GET /episode4_proof_listen_next` and exposed it under `safeCommands.copyReviewPacket`.
- Product reason: review packets turn generated edit suggestions into structured review tasks. Charlie, Mako, Homer, or Codex can carry one self-contained artifact into proof-listening instead of stitching together counters, prompts, and sidecar paths by hand.
- Safety boundary: packet copy/readback only. It records no review decisions, executes no commands, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen endpoint now exposes review defaults

- Added `reviewDefaults` to `GET /episode4_proof_listen_next` so agents can read the same prefilled decision, reviewer, summary note, audio note, visual note, and cadence note that the native composer primes from the focused proof-listen item.
- Added prebuilt safe commands under `reviewDefaults.commands`: dry-run and deliberate record, both shell-quoted through the existing proof-listen command builder.
- Added `safeCommands.dryRunReviewWithDefaults` and `safeCommands.recordReviewWithDefaults` for agents that want one direct command string after inspecting the packet and proof evidence.
- Added `script/agentctl.sh episode4-proof-listen-defaults` with aliases that read the same safe app endpoint; this is a naming affordance, not a new write path.
- Product reason: Codex and human reviewers should not have to invent review notes from scratch. Good defaults turn proof-listening into a repeatable labeling workflow while keeping the recording step deliberate and review-ledger-only.
- Safety boundary: readback/default-command generation only. The endpoint and alias execute no commands, record no sidecar events, import no clips, write no timeline metadata, mutate no source files, export nothing, publish nothing, and overwrite no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen gained cut-craft rubric guidance

- Added native `Cut craft checks` guidance to the Episode 4 next proof-listen card.
- The rubric reminds reviewers when to use reaction covers, J-cuts, L-cuts, jump-cut repair, pause preservation, and needs-source routing while proof-listening a generated edit idea.
- Added the same `cutCraftRubric` to `GET /episode4_proof_listen_next`, included it in `reviewDefaults`, and embedded it in the copyable review packet.
- The rubric is operation-aware: reaction-related items surface reaction-cover guidance first, while cadence/tightening/pause items surface cadence preservation first.
- Product reason: Quipsly should not merely ask reviewers to pick keep/refine/reject. It should teach the proof-listen habit that preserves human rhythm and produces useful training/review metadata for better future cuts.
- Safety boundary: guidance/readback only. It records no review decisions, executes no commands, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen decisions gained plain-English guidance

- Added decision-specific guidance to the native Episode 4 proof-listen sidecar composer so the selected review decision explains itself before anyone copies a dry-run or record command.
- Embedded decision meanings in the native copyable review packet for keep, refine, reject, hold, needs-listen, needs-source, and needs-visual-review.
- Added matching `decisionGuidance` to `GET /episode4_proof_listen_next`, included it in `reviewDefaults`, and added selected-decision guidance to `GET /episode4_proof_listen_command_preview`.
- Product reason: reviewers and agents should not treat the decision dropdown as a mood ring. Each decision now has a practical editing meaning tied to proof-listening, human cadence, source confidence, and safe metadata promotion.
- Safety boundary: guidance/readback only. It records no review decisions, executes no commands, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen decisions gained evidence requirements

- Added decision-specific evidence requirements to the native Episode 4 proof-listen sidecar composer.
- The composer now explains what a reviewer should prove before recording keep, refine, reject, hold, needs-listen, needs-source, or needs-visual-review.
- Embedded the same requirements in the copyable review packet so the artifact stays self-contained outside the app.
- Added `evidenceRequirements` to `GET /episode4_proof_listen_next`, included the map plus selected defaults in `reviewDefaults`, and added selected-decision requirements to `GET /episode4_proof_listen_command_preview`.
- Product reason: Quipsly should help reviewers choose decisions based on evidence, not vibes. This makes proof-listen notes more useful for future edit refinement and training while keeping the workflow non-destructive.
- Safety boundary: guidance/readback only. It records no review decisions, executes no commands, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen notes gained completeness warnings

- Added native missing/weak evidence warnings to the Episode 4 proof-listen sidecar review composer so reviewers see when summary, audio, visual, or cadence fields still look blank, prompt-like, or decision-incomplete.
- Added matching `missingEvidenceWarnings` and `reviewCompleteness` fields to the `GET /episode4_proof_listen_next` review defaults.
- Added matching `missingEvidenceWarnings` and `reviewCompleteness` fields to the `GET /episode4_proof_listen_command_preview` response so agents can detect weak notes before copying dry-run or record commands.
- Product reason: proof-listen review should produce useful evidence, not vague command-shaped paperwork. This helps humans and agents make cut decisions based on what the ear and picture actually proved.
- Safety boundary: guidance/readback only. It records no review decisions, executes no commands, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen record path now respects evidence quality

- Updated the native Episode 4 proof-listen review composer so the sidecar record button is disabled while missing/weak evidence warnings are present.
- Added plain-English record guidance beside the composer: dry-run remains safe because it writes nothing; record is reserved for evidence-ready notes.
- Added `recordCommandRecommended` and `recordingRecommendation` to `GET /episode4_proof_listen_next` review defaults.
- Added matching `recordCommandRecommended` and `recordingRecommendation` fields to `GET /episode4_proof_listen_command_preview` so agents can avoid recording prompt-like or incomplete proof-listen notes.
- Product reason: proof-listen review should produce useful labeling data for human-feeling cuts. The system should make the safe/no-write path easy and make weak-evidence ledger writes visibly inappropriate.
- Safety boundary: UI/API guidance and copy-button gating only. It records no review decisions, executes no commands, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen evidence strength is visible to humans and agents

- Added a native evidence-strength summary to the Episode 4 proof-listen sidecar review composer.
- The composer now shows whether the current note is evidence-ready or still needs work, including started field count and unresolved warning count.
- Added structured `evidenceStrength` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- The readback uses simple levels (`weak`, `partial`, `ready`) plus usable field count and warning count, so agents can reason from structured state instead of scraping UI prose.
- Product reason: cut-intelligence review data should be useful for better future edits. A tiny evidence-strength readout helps prevent command-shaped but low-value notes from becoming training/review debris.
- Safety boundary: UI/API guidance only. It records no review decisions, executes no commands, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen review gained next-safe-action guidance

- Added native next-safe-action guidance to the Episode 4 proof-listen sidecar composer.
- The guidance changes with the selected decision and current evidence state: weak notes route to proof-listen/dry-run only; keep routes to apply-preview review; refine routes to one intentional tuning target; needs-source routes to source recovery instead of invented confidence.
- Added matching `nextSafeAction` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- Product reason: reviewers and agents should always know the next reversible move after choosing a decision. This keeps Cut Intelligence focused on human-feeling edits instead of accumulating ambiguous sidecar notes.
- Safety boundary: UI/API guidance only. It records no review decisions, executes no commands, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen gained promotion-readiness boundaries

- Added native promotion-readiness guidance to the Episode 4 proof-listen sidecar composer.
- The UI now separates evidence-ready review notes from edit promotion: `keep` means ready for apply-preview review, not timeline truth; `refine` means tune one metadata choice; `reject` and `hold` do not promote; `needs-source` and `needs-visual-review` route to recovery/review first.
- Added structured `promotionReadiness` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- The readback includes status, `canCreateApplyPreview`, `canPromoteMetadata`, source/visual requirements, and plain guidance.
- Product reason: Quipsly needs a visible bridge from review evidence to edit action without collapsing the boundary between sidecar notes, apply-preview candidates, and real timeline metadata.
- Safety boundary: UI/API guidance only. It records no review decisions, executes no commands, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen gained copyable apply-preview briefs

- Added a native `Copy apply-preview brief` affordance to the Episode 4 proof-listen sidecar composer.
- The brief is enabled only when review evidence is strong enough and the selected decision can reasonably move into an apply-preview lane (`keep` or `refine`).
- The copied packet includes the decision, evidence strength, next safe action, promotion readiness, review notes, unresolved warnings if any, and explicit no-write boundaries.
- Added matching `applyPreviewBrief` and `canCreateApplyPreviewBrief` fields to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- Added `safeCommands.copyApplyPreviewBrief` to the proof-listen next endpoint so agents can carry the same packet without scraping native UI text.
- Product reason: Quipsly needs a visible, reversible bridge from proof-listen evidence to apply-preview work. This makes the next edit candidate concrete without pretending sidecar review has already modified the timeline.
- Safety boundary: packet generation/readback only. It records no review decisions, executes no commands, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 apply-preview brief became a direct agent command

- Added `script/agentctl.sh episode4-proof-listen-apply-preview-brief` with aliases `episode4-proof-apply-preview-brief` and `episode4-next-proof-apply-preview-brief`.
- The command reads the running app's `GET /episode4_proof_listen_next` endpoint and prints only the copyable apply-preview brief instead of requiring agents to dig through the full JSON payload.
- Added the command to AgentServer `/commands` discovery so Codex and other agents can find the apply-preview bridge from the app control plane.
- Product reason: the proof-listen to apply-preview bridge should be operationally obvious. A first-class command makes the next reversible edit-review packet easy to fetch without creating a hidden write path.
- Safety boundary: command/discovery only. It reads current app-visible proof-listen state and prints a packet. It records no review decisions, executes no record command, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen gained structured apply-preview candidate state

- Added a native apply-preview candidate summary to the Episode 4 proof-listen sidecar composer.
- The summary distinguishes reversible preview candidates from weak-evidence notes, source-recovery needs, visual-review needs, rejected learning evidence, and parked context.
- Added structured `applyPreviewCandidate` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- The candidate readback includes `isCandidate`, decision, promotion status, blockers, recommended preview kind, and explicit false flags for timeline metadata writes and source mutation.
- Product reason: proof-listen evidence should lead toward reversible edit-preview work only when the decision and evidence support it. Agents need this as structured state, not just copy text.
- Safety boundary: UI/API guidance only. It records no review decisions, executes no commands, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 apply-preview brief supports custom dry-run inputs

- Added `script/agentctl.sh episode4-proof-listen-apply-preview-brief-preview` with aliases `episode4-proof-apply-preview-brief-preview` and `episode4-next-proof-apply-preview-brief-preview`.
- The command accepts decision, reviewer, summary note, audio evidence, visual evidence, and cadence guidance, calls the read-only `GET /episode4_proof_listen_command_preview` endpoint, and prints only the resulting apply-preview brief.
- Added the custom preview command to AgentServer `/commands` discovery with an example `refine` review packet.
- Product reason: agents and humans should be able to test how a proposed proof-listen decision would flow into an apply-preview packet before any ledger record or timeline promotion exists.
- Safety boundary: command/discovery only. It reads a command-preview endpoint and prints a packet. It records no review decisions, executes no record command, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen gained source-recovery briefs

- Added a native `Copy source-recovery brief` affordance to the Episode 4 proof-listen sidecar composer for `needs-source` decisions.
- The packet asks what watched clip, b-roll, reference media, camera context, or transcript/source context would make the edit honest, while keeping import/timeline/export/publish boundaries explicit.
- Added `sourceRecoveryBrief` and `canCreateSourceRecoveryBrief` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- Added `safeCommands.copySourceRecoveryBrief` to the proof-listen next endpoint.
- Added direct CLI commands `episode4-proof-listen-source-recovery-brief` and `episode4-proof-listen-source-recovery-brief-preview` with aliases for default and custom source-recovery packets.
- Added source-recovery commands to AgentServer `/commands` discovery.
- Product reason: Episode 4 has real watched/source clip uncertainty. `needs-source` should become a concrete recovery packet, not a vague blocked state or fake-confidence edit.
- Safety boundary: packet generation/readback only. It imports no media, records no review decisions, executes no record command, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen gained decision-outcome briefs

- Added a native `Copy outcome brief` affordance to the Episode 4 proof-listen sidecar composer for non-promoting decisions: `reject`, `hold`, and `needs-listen`.
- The packet preserves why an operation was rejected, parked, or still needs audio proof without turning that outcome into timeline truth.
- Added `decisionOutcomeBrief` and `canCreateDecisionOutcomeBrief` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- Added `safeCommands.copyDecisionOutcomeBrief` plus direct CLI commands `episode4-proof-listen-decision-outcome-brief` and `episode4-proof-listen-decision-outcome-brief-preview` with aliases.
- Added the decision-outcome commands to AgentServer `/commands` discovery.
- Product reason: `reject`, `hold`, and `needs-listen` should not become vague dead states. They should become useful learning/review packets while preserving the no-write boundary.
- Safety boundary: packet generation/readback only. It records no review decisions, executes no record command, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen gained queue triage readback

- Added native queue-triage guidance to the Episode 4 proof-listen sidecar composer so the current decision explains which lane it belongs in before anyone records or previews it.
- Added structured `queueTriage` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- The triage readback includes lane, status, next action, why, whether review recording is appropriate, and whether an apply-preview can be created.
- Added `script/agentctl.sh episode4-proof-listen-triage` with aliases so agents can fetch the next proof-listen lane without manually parsing the full endpoint.
- Product reason: Episode 4 proof-listen uncertainty should route to proof-listen, apply-preview, source-recovery, visual-review, learning evidence, or parked review explicitly. This makes the editor calmer and prevents confident-looking dead ends.
- Safety boundary: guidance/readback only. It records no review decisions, executes no record command, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen triage gained preview commands

- Added `script/agentctl.sh episode4-proof-listen-triage-preview` with aliases so agents can preview how a proposed proof-listen decision would route before writing any review event.
- The preview command calls the read-only `GET /episode4_proof_listen_command_preview` endpoint and prints lane, status, next action, why, record suitability, and apply-preview suitability.
- Added the triage-preview command to AgentServer `/commands` discovery with a `hold` example.
- Product reason: agents should be able to test whether a proposed decision belongs in apply-preview, source-recovery, visual-review, proof-listen, learning evidence, or parked review before creating ledger noise.
- Safety boundary: command/discovery only. It reads a command-preview endpoint and prints routing guidance. It records no review decisions, executes no record command, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen gained cut-craft intent readback

- Added native cut-craft intent guidance to the Episode 4 proof-listen sidecar composer so notes can name the likely edit craft problem before any timeline change.
- Added structured `cutCraftIntent` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- The classifier surfaces intents such as reaction cover, J-cut, L-cut, jump-cut handling, source/b-roll insertion, cadence preservation, avoid-bad-cut, and listen-first.
- The readback includes tags, listen-for prompts, watch-for prompts, weak-evidence state, and explicit false flags for timeline writes/source mutation.
- Added `script/agentctl.sh episode4-proof-listen-cut-craft-intent` and `episode4-proof-listen-cut-craft-intent-preview` with aliases, plus command discovery examples.
- Product reason: Quipsly should not merely say keep/refine/reject. It should explain the editing craft problem in human terms so reviewers and agents can improve cuts without needing NLE internals.
- Safety boundary: guidance/readback only. It records no review decisions, executes no record command, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 cut-craft intent became a review brief

- Added a native `Copy craft review brief` affordance to the Episode 4 proof-listen sidecar composer.
- The packet turns the detected craft intent into listen-for prompts, watch-for prompts, and one next reversible adjustment without writing timeline truth.
- Added `cutCraftReviewBrief` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- Added `safeCommands.copyCutCraftReviewBrief` to the proof-listen next endpoint.
- Added direct CLI commands `episode4-proof-listen-cut-craft-review-brief` and `episode4-proof-listen-cut-craft-review-brief-preview` with aliases and command discovery examples.
- Product reason: cut-craft classification should become usable review work, not just a label. This gives humans and agents a concrete next adjustment while preserving the distinction between review packets and edit metadata.
- Safety boundary: packet generation/readback only. It records no review decisions, executes no record command, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 proof-listen gained apply-preview work orders

- Added a native `Copy apply-preview work order` affordance to the Episode 4 proof-listen sidecar composer.
- The work order is gated by the existing evidence-ready `keep`/`refine` apply-preview condition and describes the next reversible preview task without writing timeline truth.
- Added `applyPreviewWorkOrder` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- Added `safeCommands.copyApplyPreviewWorkOrder` to the proof-listen next endpoint.
- Added direct CLI commands `episode4-proof-listen-apply-preview-work-order` and `episode4-proof-listen-apply-preview-work-order-preview` with aliases and command discovery examples.
- Product reason: proof-listen evidence now has a concrete bridge from craft review into a reversible preview task while keeping sidecar review, preview planning, and real timeline metadata separate.
- Safety boundary: packet generation/readback only. It records no review decisions, executes no record command, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 apply-preview gained structured candidate payloads

- Added a native `Copy preview JSON` affordance to the Episode 4 proof-listen sidecar composer for evidence-ready `keep`/`refine` apply-preview candidates.
- Added structured `applyPreviewCandidatePayload` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- The payload includes operation/range identity, decision, preview kind, craft intent/tags, evidence level, queue lane/status, blocker list, input notes, constraints, and explicit no-write truth flags.
- Added direct CLI commands `episode4-proof-listen-apply-preview-candidate-json` and `episode4-proof-listen-apply-preview-candidate-json-preview` with aliases and command discovery examples.
- Product reason: human-readable work orders are not enough for agent editing. A structured candidate payload gives future reversible preview builders a safe, inspectable contract without parsing prose or mutating the timeline.
- Safety boundary: payload generation/readback only. It records no review decisions, executes no record command, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 apply-preview gained no-write patch plans

- Added a native `Copy patch plan JSON` affordance to the Episode 4 proof-listen sidecar composer for evidence-ready apply-preview candidates.
- Added structured `applyPreviewPatchPlan` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- The patch plan derives a preview patch kind, proposed adjustment, tradeoff, inputs, constraints, requirements, and explicit no-write truth flags from the existing candidate payload, queue triage, craft intent, and promotion readiness.
- Added direct CLI commands `episode4-proof-listen-apply-preview-patch-plan-json` and `episode4-proof-listen-apply-preview-patch-plan-json-preview` with aliases and command discovery examples.
- Product reason: the editor now has a safer bridge from candidate evidence to a concrete reversible metadata patch plan. Candidate payload answers whether a preview is appropriate; patch plan answers what would be tried next without actually writing timeline state.
- Safety boundary: payload generation/readback only. It records no review decisions, executes no record command, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 apply-preview gained approval checklists

- Added a native `Copy approval checklist` affordance to the Episode 4 proof-listen sidecar composer for evidence-ready apply-preview candidates.
- Added structured `applyPreviewApprovalChecklist` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- The checklist names what must pass before metadata promotion, including proof-listen specificity, visual/source support, whole-source preservation, smallest reversible adjustment, and explicit human/agent approval.
- Added direct CLI commands `episode4-proof-listen-apply-preview-approval-checklist-json` and `episode4-proof-listen-apply-preview-approval-checklist-json-preview` with aliases and command discovery examples.
- Product reason: candidate payloads and patch plans need an explicit review boundary before they become timeline metadata. This makes future agent-editing faster because promotion requirements are inspectable instead of implicit.
- Safety boundary: checklist generation/readback only. It records no review decisions, executes no record command, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 apply-preview gained approval receipt templates

- Added a native `Copy receipt template` affordance to the Episode 4 proof-listen sidecar composer for evidence-ready apply-preview candidates.
- Added structured `applyPreviewApprovalReceiptTemplate` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- The receipt template defines allowed reviewer outcomes, required receipt fields, review questions, receipt truth flags, and source context linking the candidate, patch plan, and checklist.
- Added direct CLI commands `episode4-proof-listen-apply-preview-approval-receipt-template-json` and `episode4-proof-listen-apply-preview-approval-receipt-template-json-preview` with aliases and command discovery examples.
- Product reason: future preview approval needs a consistent receipt shape before timeline metadata promotion. This prevents preview suggestions from becoming invisible tribal knowledge and keeps human/agent feedback useful for later cut intelligence.
- Safety boundary: receipt-template generation/readback only. It records no approval, records no review decision, executes no record command, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 apply-preview gained promotion proposals

- Added a native `Copy promotion proposal` affordance to the Episode 4 proof-listen sidecar composer for evidence-ready apply-preview candidates.
- Added structured `applyPreviewPromotionProposal` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- The proposal names the metadata promotion target, required `approve-preview` receipt outcome, fields that could be promoted later, and conditions that must block promotion.
- Added direct CLI commands `episode4-proof-listen-apply-preview-promotion-proposal-json` and `episode4-proof-listen-apply-preview-promotion-proposal-json-preview` with aliases and command discovery examples.
- Product reason: candidate payloads, patch plans, checklists, and receipt templates now have a final no-write bridge describing what could become timeline metadata only after approval exists.
- Safety boundary: proposal generation/readback only. It records no approval, records no review decision, executes no record command, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Episode 4 apply-preview gained promotion readiness boards

- Added a native `Copy readiness board` affordance to the Episode 4 proof-listen sidecar composer for evidence-ready apply-preview candidates.
- Added structured `applyPreviewPromotionReadinessBoard` to `GET /episode4_proof_listen_next` review defaults and `GET /episode4_proof_listen_command_preview` responses.
- The board lists explicit promotion gates for candidate payload, patch plan, approval checklist, approval receipt, promotion proposal, and timeline write boundary.
- Added direct CLI commands `episode4-proof-listen-apply-preview-promotion-readiness-board-json` and `episode4-proof-listen-apply-preview-promotion-readiness-board-json-preview` with aliases and command discovery examples.
- Product reason: reviewers and agents should be able to see exactly why a preview candidate still cannot become timeline metadata until an `approve-preview` receipt exists.
- Safety boundary: readiness-board generation/readback only. It records no approval, records no review decision, executes no record command, imports no clips, writes no timeline metadata, mutates no source files, exports nothing, publishes nothing, and overwrites no versions.
- No build/test/app validation was run in this pass.

## 2026-07-01 - Quipsly Studio gained a proof-lane board utility

- Added `script/proof_lane_board.py`, a read-only local package scanner for Episodes 1-6.
- Added `docs/production/proof-lane-board.md` with command usage and truth boundaries.
- The utility reports current version folder, blockers, warnings, media counts, receipt evidence status, and next safest action for each proof lane.
- Product reason: while Episode 4 waits for missing watched/source clips, Episodes 1-3, 5, and 6 still need a calm surface that tells humans and agents what can be reviewed, refined, or prepared next.
- Safety boundary: scanner/report generation only. It mutates no source files, overwrites no exports, records no receipts, changes no timeline metadata, exports nothing, publishes nothing, and does not claim human approval.
- No build/test/app validation was run in this pass.
