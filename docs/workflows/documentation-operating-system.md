# Documentation Operating System

Date: 2026-05-07

This repo treats documentation as product infrastructure. Docs should help a person understand what is real, help a teammate operate the system, and help a future Codex run avoid stepping on the garden hose.

The rule is simple: if a conclusion will matter next turn, it belongs somewhere under `docs/`.

## Operating Priority

Documentation should keep the project pointed at production, not paperwork.

Priority order:
1. Book writing and podcast episode prep.
2. Revenue from the website.
3. Content engine work that serves writing, episode prep, publishing, recording, or revenue.
4. Infrastructure and repo health.
5. Parked experiments.

Docs should make it obvious when a week has moved the books and episodes forward. If content-engine work cannot say how it helps production or revenue, it belongs in Parked until that connection is clear.

## Audiences

### Public Docs

Where they live:
- Drafts: `docs/public/`
- Future website surface: not wired yet

What belongs here:
- public-facing explanations of High Ground Odyssey, coaching, learning paths, field guides, help pages, and plain-language how-it-works material
- humane explanations of current product behavior
- "what this means for you" sections
- caveats that protect trust without sounding like legal boilerplate

What does not belong here:
- internal queue details
- role names, env vars, implementation secrets, or deployment instructions
- unsupported claims about payment, taxes, legal status, credentials, automation, or health outcomes
- product promises that the current app cannot keep

Tone:
- warm, witty, wise, and in love with learning
- plain teaching structure with light metaphor
- human, but not cute for the sake of being cute
- never corporate hype

Update cadence:
- update when public-facing product behavior changes
- update before wiring a draft into the website
- review after any flow that changes coaching, donation, scheduling, or account expectations

Examples:
- "What happens after you request coaching"
- "How donation-supported coaching works"
- "What High Ground Odyssey is building"

### Team Docs

Where they live:
- `docs/project-context/`
- `docs/runbooks/`
- `docs/deploy/`
- relevant `docs/workflows/`

What belongs here:
- current state
- support-team workflows
- runbooks and checklists
- escalation paths
- known limitations
- what to check first
- what changed recently

What does not belong here:
- speculative redesigns without labels
- vague "should eventually" statements that are not tied to a decision
- secrets or real environment values
- long chat transcripts

Tone:
- practical, calm, and operational
- write like a support/product teammate who expects to be on call for the result

Update cadence:
- update when behavior changes
- update after production setup changes
- update after a repeated support process emerges

Examples:
- `docs/project-context/current-state.md`
- `docs/runbooks/local-dev.md`
- `docs/deploy/email-notifications.md`

### Agent Docs

Where they live:
- `AGENTS.md`
- `docs/agents/`
- task-specific `docs/workflows/`

What belongs here:
- exact scope
- files to inspect first
- files not to touch
- validation commands
- git behavior
- final report shape
- dangerous assumptions to avoid

What does not belong here:
- public copy drafts
- general encouragement
- broad architecture ideas with no file anchors
- instructions that contradict the current repo state

Tone:
- precise, scoped, and safe
- enough context for a future agent to move quickly without inventing product reality

Update cadence:
- update when safe working rules change
- update when a repeated agent workflow becomes stable
- update after an agent makes a mistake worth preventing next time

Examples:
- `docs/agents/codex-handoff.md`
- `docs/workflows/new-feature-workflow.md`
- `docs/workflows/repo-analysis-workflow.md`

### Session Notes

Where they live:
- `docs/sessions/`

What belongs here:
- short result records from meaningful passes
- validation performed
- files changed
- what stayed intentionally unchanged
- known limitations
- recommended next action

What does not belong here:
- evergreen architecture unless it has already been promoted to `architecture/`
- plans that are no longer accurate
- raw terminal logs unless the exact error matters

Tone:
- factual and brief
- "what happened, what is true now, what remains"

Update cadence:
- create after meaningful implementation, stabilization, audit, or docs passes
- promote stable conclusions into durable docs when they stop being session-specific

### Architecture Docs

Where they live:
- `docs/architecture/`

What belongs here:
- stable system shape
- domain model
- boundaries
- source-of-truth explanations
- current integration posture
- architecture decisions that affect future work

What does not belong here:
- one-off task logs
- unverified future designs
- "would be nice" ideas without a decision

Tone:
- grounded and file-backed
- explicit about what is working, transitional, or intentionally not active

Update cadence:
- update when product behavior or ownership boundaries change
- update after schema or routing changes
- update when a temporary workaround becomes a stable rule

### Runbooks

Where they live:
- `docs/runbooks/`
- sometimes `docs/deploy/` for environment-specific operations

What belongs here:
- repeatable operational steps
- setup, validation, deployment, and recovery procedures
- "what to check first"
- expected failure behavior

What does not belong here:
- secret values
- public-facing explanations
- one-off experimental notes

Tone:
- direct and operational
- steps should be runnable by a tired person without guessing

Update cadence:
- update when commands or env surfaces change
- update after a support process repeats twice
- update when a failure teaches a new first check

### Plans And Roadmap Docs

Where they live:
- `docs/plans/`

What belongs here:
- now/next/later decisions
- kanban operating model
- priority lanes for Book & Episodes, Revenue, Content Engine, Infrastructure / Repo Health, and Parked Experiments
- scoped future work
- parked questions
- decision points

What does not belong here:
- fake commitments
- implementation detail that belongs in an architecture doc
- backlog bloat that no one will read

Tone:
- clear, honest, and lightweight
- enough structure to choose the next move
- practical about the priority order: books and episodes first, revenue second, content engine third

Update cadence:
- update weekly or when priorities change
- retire stale plans into session notes or replace them with current state

## Public Docs Style Guide

Public docs should sound like High Ground Odyssey at its best: warm, witty, wise, and useful.

Use:
- short sections with clear teaching flow
- concrete "what this means for you" blocks
- light metaphor when it clarifies the thing
- honest boundaries around what is manual, simple, or still evolving
- language that respects the reader's intelligence

Avoid:
- corny jokes
- corporate hype
- fake certainty
- unsupported tax, payment, legal, or credential claims
- internal operational details
- implying SMS, payment, or calendar automation that does not exist

Pattern:
1. Name the human problem.
2. Explain the current simple path.
3. Say what happens next.
4. Say what is not automated yet.
5. Offer the next useful action.

Required safety checks:
- Do not claim tax deductibility.
- Do not claim payment automation beyond the configured external pay-what-you-can link.
- Do not say SMS is automated.
- Do not say Google Calendar is synced.
- Do not overpromise scheduling speed, outcomes, or availability.

## Team Docs Style Guide

Team docs should make the work easier to run.

Every operational doc should answer:
- What is the current state?
- What changed recently?
- What should I check first?
- What breaks softly?
- What blocks the user path?
- What remains manual?
- Who or what needs a decision?

Good team docs include:
- runbook steps
- escalation paths
- known limitations
- verification commands
- links to relevant session notes

Bad team docs hide:
- known manual steps
- missing automation
- environment assumptions
- old behavior that no longer matches code

## Agent Docs Style Guide

Agent docs should reduce blast radius.

Every agent-facing workflow should specify:
- task scope
- files to inspect
- files not to touch
- validation commands
- whether product code, schema, content, dependencies, or publish files are off limits
- git behavior
- expected final report shape

Agent docs should be exact enough that a future agent can say no to adjacent work.

Good agent docs say:
- "Do not assume Stripe checkout is active."
- "Do not remove the episodes loader guard casually."
- "Stage only docs related to this task."

Bad agent docs say:
- "Improve the app."
- "Clean this up."
- "Make it production ready."

## Update Rules

- If a conclusion will matter next turn, document it.
- If product behavior changes, update `docs/project-context/current-state.md` and, when relevant, `docs/architecture/system-overview.md`.
- If the domain model or source-of-truth boundary changes, update `docs/architecture/domain-model.md`.
- If an environment variable, setup command, or deployment path changes, update `docs/runbooks/local-dev.md`, `.env.example` if appropriate, and the relevant deploy doc.
- If a process repeats, promote it to `docs/workflows/` or `docs/runbooks/`.
- If a decision retires old architecture, write a session note and update the durable architecture doc.
- If a docs draft may become public, keep it under `docs/public/` until there is an explicit product pass to wire it into the site.
- If docs disagree with code, code wins and docs must be corrected.

## Promotion Path

Use this flow to keep docs from becoming a junk drawer:

1. Session note captures what happened.
2. Current-state doc captures what is true now.
3. Architecture doc captures stable boundaries.
4. Runbook captures repeatable operations.
5. Workflow doc captures repeatable agent/team process.
6. Public doc captures what users should know.

If a note does not earn promotion, leave it in `docs/sessions/` as history.
