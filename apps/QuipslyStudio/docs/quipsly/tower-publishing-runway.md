# Tower publishing runway

Last updated: 2026-06-24

Tower is Quipsly's publishing runway. It joins review packets, platform
metadata, draft calendar items, and receipt slots without pretending that local
readiness is external publication.

## Command

```bash
./script/agentctl.sh tower-runway
```

Latest observed output:

```text
/Volumes/My Passport/Episode_and_Shorts_Test/tower-runway/20260624-095403-tower-runway/index.html
```

Generated artifacts:

- `tower-runway.json`: full local publishing runway state.
- `review-action-cards.json`: exact safe local review and receipt commands.
- `START-HERE-Tower-runway.md`: human-readable review/publishing guide.
- `index.html`: reviewer-facing Tower runway board.
- `platform-queue.csv`: one row per episode/platform publication packet.
- `receipt-slots.csv`: empty receipt slots for real URLs/provider IDs.
- `social-calendar-draft.json`: draft queue only; no external schedules created.
- `social-calendar-draft.csv`: spreadsheet-friendly draft queue.
- `latest-tower-runway.json`: pointer to the latest versioned runway session.

## Latest counts

- 6 episodes tracked.
- 0 blocked local packages.
- 2 warning episodes.
- 23 pending review artifacts.
- 48 platform/calendar draft items.
- 0 captured external receipts.
- 6 episodes with generated safe action cards.

Latest review-command proof:

```bash
./script/agentctl.sh tower-review-decision 6 shorts hold codex "Tower command smoke: hold shorts for human review; no external publishing."
```

Observed result:

- Episode 6 shorts were marked `hold` in the local human-review ledger.
- The ledger was snapshotted before mutation.
- `tower-ledger-events.jsonl` received a before/after review event.
- The refreshed Tower runway now marks Episode 6 as `review-needs-work`.
- No media, upload, schedule, account, or external publication state was touched.

Latest action-card proof:

- `review-action-cards.json` exists in the latest runway session.
- Each episode has local review commands for `approve`, `refine`, `reject`,
  `hold`, and `pending`.
- Each platform has a receipt template that requires a real URL/provider ID.
- Episode 6 still surfaces as `review-needs-work` because the Codex smoke hold
  remains intentionally visible.

Receipt-command guardrail proof:

```bash
./script/agentctl.sh tower-receipt 6 YouTube ""
```

Observed result: the command refused to create receipt truth from an empty URL or
provider ID. Empty receipt slots remain `not_published`.

## Product rules

- Local readiness, human approval, schedule intent, and publication receipts are
  separate states.
- Empty receipt slots mean not published.
- Calendar draft items are not external schedules.
- Platform metadata packets are manual-publishing prep, not upload jobs that have
  already run.
- Tower does not publish, upload, schedule, approve, send, delete, or mutate
  accounts.

## Current interpretation

Episodes 1-6 are locally packetized enough to enter human review, but every
episode still needs review decisions before publication. Warning episodes 1 and
4 need explicit human decisions around their long-form audio/video duration
spread before any real publishing claim.

## Next best improvements

- Add safe commands to record human artifact decisions into the review ledger.
- Use the safe receipt command to paste real receipt URLs/provider IDs after
  manual publication.
- Add a reviewer UI that can filter by episode status, platform, and warning.
- Add analytics placeholders that stay empty until real platform metrics exist.

## 2026-06-24 - OS board Tower action cards

The Quipsly OS board now surfaces Tower publishing/social next actions directly instead of only linking to the Tower runway packet.

Latest Tower runway:

- HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/tower-runway/20260624-111655-tower-runway/index.html`
- JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/tower-runway/20260624-111655-tower-runway/tower-runway.json`

Latest OS board:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-111700-quipsly-os/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-111700-quipsly-os/quipsly-os-board.json`

Tower card behavior:

- One card is generated per episode from the latest Tower runway.
- Cards show the current local episode state: human review needed, review needs work, warning decision needed, or receipt-stage readiness.
- Cards include review-pending counts, receipt counts, shorts readiness, first receipt command template, and the exact latest runway paths.
- Cards are local operator guidance only. They do not publish, upload, schedule, mutate accounts, or create fake receipt truth.

Current board evidence:

- 6 Tower cards total.
- 5 review cards.
- 1 attention card.
- 0 captured receipts.
- 48 draft calendar items, all local draft-only.

## 2026-06-24 - Diagnostic holds are visible but not content defects

Episode 6's shorts hold was created by a Codex Tower command smoke test. The runway now treats this as `diagnostic-review-hold` instead of `review-needs-work` when the blocking decision is clearly an agent/test marker. This keeps safety intact while making the next action more honest: clear the diagnostic hold to pending if it was only a smoke flag, or replace it with a normal refine/hold decision if review confirms a real issue.

Current proof artifacts:

- Review blocker report: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/blocker-reports/20260624-131653-review-blockers/index.html`
- Tower runway: `/Volumes/My Passport/Episode_and_Shorts_Test/tower-runway/20260624-131658-tower-runway/index.html`
- OS board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-131658-quipsly-os/index.html`

No publication, upload, approval, receipt capture, external account mutation, source mutation, or old-version overwrite happened.


## 2026-06-24 14:23 MDT - Shorts/Tower boards refreshed with durable evidence commands

- Refreshed Episodes 1-3 shorts boards after fixing `audioSanity` command output redirection.
- Current boards:
  - Local export board: `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episodes-1-3-shorts-local-export-board.html`
  - Growth quality board: `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episodes-1-3-shorts-growth-quality-board.html`
  - Platform package board: `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episodes-1-3-shorts-platform-package-board.html`
  - Mission control: `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episodes-1-3-shorts-mission-control.html`
  - Readiness: `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episodes-1-3-shorts-readiness.html`
- Current readiness evidence: `27` shorts, `27` local exported files, `27` platform packaged candidates, `27/27` contact sheets, and `27/27` audio sanity files.
- Boundary remains strict: these are local review/publishing-prep packets only. No external upload, schedule, publish, or receipt capture happened.


## 2026-06-24 15:15 MDT - Tower social command center

Added a Hootsuite-like local command-center layer on top of the Tower runway. This is a derived operator view, not a new source of truth and not an external scheduler.

Latest generated packet:
- HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/tower-social-command-center/20260624-151542-tower-social-command-center/index.html`
- JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/tower-social-command-center/20260624-151542-tower-social-command-center/tower-social-command-center.json`
- Markdown: `/Volumes/My Passport/Episode_and_Shorts_Test/tower-social-command-center/20260624-151542-tower-social-command-center/START-HERE-Tower-social-command-center.md`
- CSV: `/Volumes/My Passport/Episode_and_Shorts_Test/tower-social-command-center/20260624-151542-tower-social-command-center/tower-social-queue.csv`

Current truth: 48 platform rows across 6 episodes and 8 platforms, 0 captured receipts, 48 draft-only schedule rows, and 0 rows ready for approval because every row is still behind local review/warning/diagnostic-hold truth. This is correct: Quipsly should not let platform prep impersonate approval or publication.

Command:

```bash
./script/agentctl.sh tower-social-command-center
```

Boundary: no external publish, upload, schedule, account mutation, approval, or fake receipt happens. The packet only tells reviewers what is ready, what is blocked by review, and what receipt command to run after a real manual publication produces a URL/provider ID.

