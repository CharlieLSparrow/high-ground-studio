# Kanban Operating Model

Date: 2026-05-07

This model makes progress visible without turning the board into a second job.

The current app already has a lightweight internal kanban surface at `/team/kanban`, with source data at `apps/web/content/internal/kanban/board.json`. This document defines the operating model around that board. It does not change product code.

## Board Columns

### Inbox

Raw capture. Use for ideas, requests, and "we should probably..." thoughts.

Exit rule:
- someone can name the problem and the likely owner

### Clarify

Shape the work before committing to it.

Use when:
- the ask is real but fuzzy
- the repo area is unclear
- a decision is needed from Charlie, Homer, or another stakeholder

Exit rule:
- the card has a clear next action and a small enough first slice

### Ready

Ready to pull.

Use when:
- scope is clear
- files or docs to inspect are listed
- validation path is known
- blockers are gone

Exit rule:
- someone starts the work

### Doing

Active work.

Rule:
- keep this column small
- if everything is Doing, nothing is doing

Exit rule:
- implementation or docs changes are ready for validation

### Validate

Proof step.

Use when:
- code or docs changed and needs checks
- a stakeholder needs to review wording
- a manual production check is pending

Exit rule:
- validation result is recorded

### Shipped

Done enough to show.

Required:
- commit hash or link
- short result note
- known limitations
- next action if relevant

### Parked

Not now, on purpose.

Use when:
- the idea is good but not worth carrying every week
- the work depends on a later product decision
- the cost is higher than the current benefit

Exit rule:
- a new decision or deadline revives it

### Blocked

Cannot move without something external.

Use when:
- credentials, account access, stakeholder wording, production data, or a technical decision is missing

Exit rule:
- blocker is removed or the card is parked

## Current In-App Status Mapping

The current `/team/kanban` board is simpler than this operating model. Until the product UI changes, map statuses like this:

- `backlog`: Inbox, Clarify, or Parked
- `todo`: Ready
- `doing`: Doing or Validate
- `done`: Shipped

Do not change `board.json` during a docs-only pass unless explicitly asked.

## Card Template

```md
## Card Title

- Status:
- Owner:
- Area:
- Priority:
- Type:
- Links:
- Current truth:
- Desired outcome:
- Smallest useful next step:
- Validation:
- Blockers:
- Shipped proof:
- Notes for Homer:
```

## Labels And Tags

Recommended tags:
- `area:coaching`
- `area:calendar`
- `area:payments`
- `area:notifications`
- `area:public-docs`
- `area:manuscript`
- `area:infra`
- `area:repo-hygiene`
- `type:decision`
- `type:docs`
- `type:feature`
- `type:runbook`
- `type:research`
- `risk:product-code`
- `risk:schema`
- `risk:content`
- `risk:secrets`
- `owner:charlie`
- `owner:homer`
- `owner:codex`

Use tags to help filtering, not to decorate the card.

## Mapping Codex Tasks Into Cards

Every Codex-sized task should become one card or one checklist item on an existing card.

Good Codex card:
- "Document current coaching workflow and push docs sync."

Too large:
- "Fix coaching."

Good acceptance:
- docs updated
- validation commands recorded
- commit pushed
- known limitations captured

If a Codex task discovers three new tasks, finish the current task and add the new tasks as cards. Do not secretly start the next refactor.

## Keeping Cards Small Without Trapping Architecture

Small cards are useful only when they preserve the bigger shape.

Use this split:
- Card: one visible improvement or decision.
- Linked doc: architecture context, tradeoffs, or plan.
- Session note: what actually happened.

If a card needs more than one screen of explanation, move the explanation to `docs/plans/`, `docs/architecture/`, or `docs/sessions/` and link it.

## Bulldozer Mode Refactors

Sometimes the right move is a bulldozer pass: clearing old structure, renaming concepts, or consolidating a workflow.

Rules:
- name the blast radius before starting
- create a plan doc or session plan
- list files not to touch
- set a rollback boundary
- validate before and after
- ship in the smallest coherent layer

Bulldozer mode is not "wander until it feels better." It is controlled demolition with a broom nearby.

## Marking Shipped Work

Every shipped card should include:
- commit hash or GitHub commit link
- short result summary
- validation performed
- known limitations
- next action or "none"

Commit link format:

```md
https://github.com/CharlieLSparrow/high-ground-studio/commit/<commit-hash>
```

## Weekly Update For Homer

Each week, copy the shipped and validated cards into `docs/project-context/weekly-ship-log.md`.

The update should answer:
- What shipped?
- What changed for users or the team?
- What is safer now?
- What remains manual?
- What is blocked?
- What decision or help is needed from Homer?
- What is next week's focus?

Keep it readable in five minutes.

## Avoiding Admin Hell

Rules:
- if a card has not changed in two weeks, park it or rewrite it
- no card without a next step
- no weekly update longer than the work itself deserves
- no duplicate board and docs truth
- shipped cards need proof, not poetry
- important decisions go in docs, not only in card comments

The board should be a trail of breadcrumbs, not a second mountain.

## Sample Board

| Column | Card | Owner | Current truth | Next step |
| --- | --- | --- | --- | --- |
| Shipped | Coaching workflow current-state sync | Codex | Docs now match the Prisma-backed request, conversion, email, donation-link, and calendar-link reality. | Use as source of truth for next coaching integration. |
| Shipped | Donation/payment links | Codex | Pay-what-you-can support is an external URL via `HGO_COACHING_DONATION_URL`; no Stripe Checkout. | Keep link flow until payment reconciliation is worth building. |
| Ready | Email logging | Codex | Resend email is best-effort with no persisted delivery status. | Add a narrow delivery log plan before implementation. |
| Clarify | Calendar integration | Charlie/Homer | Google Calendar is link-generation only. | Decide whether staff-authenticated API sync is worth the account and consent setup. |
| Parked | SMS/Twilio | Charlie/Homer | Twilio helper exists but coaching actions do not call it. | Revisit after consent, STOP/HELP handling, and operational need are clear. |
| Clarify | Manuscript cockpit | Charlie | Living manuscript docs exist; public routing is separate. | Define the next non-publish internal editing surface before touching manuscript files. |
| Ready | Public docs / field guide | Charlie | Draft public docs now live under `docs/public/`; not wired to the site. | Review voice and decide which draft should become the first public page. |
| Parked | GCP migration | Charlie | No active migration task in repo docs. | Create a discovery card only when a deployment target decision is active. |
| Inbox | Repo hygiene | Codex | Backup files, `.DS_Store`, and generated artifacts exist. | Audit cleanup candidates in a dedicated no-product-change pass. |
