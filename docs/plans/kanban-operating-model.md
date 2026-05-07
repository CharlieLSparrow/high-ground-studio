# Kanban Operating Model

Date: 2026-05-07

This model makes progress visible without turning the board into a second job.

The current app already has a lightweight internal kanban surface at `/team/kanban`, with source data at `apps/web/content/internal/kanban/board.json`. This document defines the operating model around that board. It does not change product code.

## Priority Order

The board exists to keep the real project moving, not to reward tidy infrastructure.

Priority order:
1. Book writing and podcast episode prep are highest priority. If books are not being written, episodes are not being prepared, and recording/publishing is not moving, the project is stuck.
2. Revenue from the website is second priority. This includes coaching, merch, donation-supported sessions, memberships, Patreon-like subscriptions, paid content, or other monetization paths.
3. The content engine is third priority. It matters deeply, but it exists to serve writing, episode prep, publishing, recording, and revenue.
4. Infrastructure and repo health support the first three priorities.
5. Parked experiments stay visible without stealing the week.

Weekly rule:
- Every week should show visible movement in Book & Episodes unless a true emergency blocks it.

Content-engine rule:
- Content-engine work must say how it helps writing, episode prep, publishing, recording, or revenue. If it cannot answer that, park it.

## Workstreams

Use workstreams as lanes across the board. They answer "what kind of progress is this?"

- Book & Episodes: book writing, manuscript shaping, episode prep, recording prep, publishing readiness, story decisions, guest/research prep.
- Revenue: coaching, merch, donation-supported sessions, memberships, subscriptions, paid content, offers, checkout/payment decisions.
- Content Engine: content tooling, packet/public sync, metadata, manuscript cockpit, publishing workflow support.
- Infrastructure / Repo Health: builds, auth, Prisma, deployment, cleanup, docs safety, validation, backup artifacts.
- Parked Experiments: good ideas not yet allowed to consume weekly focus.

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
- Workstream:
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
- `workstream:book-episodes`
- `workstream:revenue`
- `workstream:content-engine`
- `workstream:infra`
- `workstream:parked-experiment`
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

Priority check:
- Before pulling a Codex card, ask whether Book & Episodes moved this week.
- If the card is content-engine work, write the sentence: "This helps writing, episode prep, publishing, recording, or revenue by..."
- If that sentence is weak, clarify or park the card.

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

The update should lead in this order:
- Book / Episode Progress
- Revenue Progress
- Content Engine Progress
- Decisions Needed From Homer
- What Shipped
- What Remains Manual
- Next Week's Focus

Keep it readable in five minutes.

## Avoiding Admin Hell

Rules:
- if a card has not changed in two weeks, park it or rewrite it
- no card without a next step
- no weekly update longer than the work itself deserves
- no duplicate board and docs truth
- shipped cards need proof, not poetry
- important decisions go in docs, not only in card comments
- Book & Episodes should not disappear behind infrastructure unless there is a real emergency
- content-engine cards must name the production or revenue outcome they serve

The board should be a trail of breadcrumbs, not a second mountain.

## Sample Board

| Workstream | Column | Card | Owner | Current truth | Next step |
| --- | --- | --- | --- | --- | --- |
| Book & Episodes | Ready | Next book/episode production slice | Charlie/Homer | This must stay first; recent repo work has focused more on coaching/docs than direct episode production. | Pick the next writing or episode-prep artifact and move it this week. |
| Revenue | Shipped | Coaching workflow current-state sync | Codex | Docs now match the Prisma-backed request, conversion, email, donation-link, and calendar-link reality. | Use as source of truth for next coaching integration. |
| Revenue | Shipped | Donation/payment links | Codex | Pay-what-you-can support is an external URL via `HGO_COACHING_DONATION_URL`; no Stripe Checkout. | Keep link flow until payment reconciliation is worth building. |
| Revenue | Ready | Email logging | Codex | Resend email is best-effort with no persisted delivery status. | Add a narrow delivery log plan before implementation. |
| Revenue | Clarify | Calendar integration | Charlie/Homer | Google Calendar is link-generation only. | Decide whether staff-authenticated API sync is worth the account and consent setup. |
| Revenue | Parked | SMS/Twilio | Charlie/Homer | Twilio helper exists but coaching actions do not call it. | Revisit after consent, STOP/HELP handling, and operational need are clear. |
| Content Engine | Clarify | Manuscript cockpit | Charlie | Living manuscript docs exist; public routing is separate. | Define how this directly helps writing or episode prep before touching manuscript files. |
| Revenue | Ready | Public docs / field guide | Charlie | Draft public docs now live under `docs/public/`; not wired to the site. | Review voice and decide which draft should become the first public page. |
| Parked Experiments | Parked | GCP migration | Charlie | No active migration task in repo docs. | Create a discovery card only when a deployment target decision is active. |
| Infrastructure / Repo Health | Inbox | Repo hygiene | Codex | Backup files, `.DS_Store`, and generated artifacts exist. | Audit cleanup candidates only after Book & Episodes and Revenue are not being starved. |
