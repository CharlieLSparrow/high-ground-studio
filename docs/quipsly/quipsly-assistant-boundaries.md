# Quipsly Assistant Boundaries

Date: 2026-06-04

Purpose: define the first safe product boundary for Quipslys as source-aware research assistants and optional co-drafters that support freeform drafting without deceptive automation.

## Product promise

Quipslys help authors, writers, academics, podcasters, and creators keep knowledge alive while they work.

They should:

- collect source material
- organize research
- compare examples
- retrieve related notes
- summarize selected context
- suggest tags and structure cleanup
- prepare research packets
- prepare media or production next steps
- draft rough examples, rewrites, and voice experiments when asked

They should not:

- secretly rewrite manuscript prose
- imitate the user's voice without request, labeling, and approval
- publish public content directly
- mutate private project state without visible approval
- hide what changed
- make provider, billing, or entitlement changes invisibly

The short version: Quipsly gathers knowledge, helps shape drafts, and keeps humans in control of what becomes canon.

## Full creative partner stance

Quipslys are allowed to do real creative work, not merely generate placeholders. A Quipsly may be the first-pass writer, editor, storyboarder, researcher, publication-packet builder, short-caption drafter, or episode-package producer when that is the fastest honest way to move the project forward.

This includes generating serious source material when the project would otherwise stall for lack of content. The assistant may draft missing book sections, article candidates, social packets, storyboards, coaching examples, quote collections, show notes, captions, and publication copy as real reviewable work. It should not wait for a human to supply every first draft before the product can be tested or improved.

For workflow purposes, the assistant can occupy a creative seat alongside the human team. It is not merely a tool that reacts to finished human inputs. It may initiate serious first-pass material, then use that material to exercise and improve the Nest, Studio, and Tower workflow.

The assistant should not label its own serious work as placeholder unless the work was intentionally created as a disposable fixture. If it is trying to create a useful article, episode section, storyboard, edit, caption set, or publication packet, label it as a draft or candidate with provenance and review state.

This does not weaken the anti-black-box principle. It clarifies it:

- agent-created work can be real work
- agent-created work should carry visible authorship/provenance when the workflow needs it
- canon, publication, billing, permission, and destructive state changes still need explicit control
- review and approval are workflow controls, not moral scolding

The system should distinguish disposable test content from serious agent-authored content. Do not call everything a placeholder just because an assistant created it.

Agents are counted as creative participants for purposes of dogfooding Quipsly. If the product needs a book excerpt, article, storyboard, source packet, short caption, publishing packet, or training example to prove the loop, an agent may create it. The action boundary is not authorship; the boundary is hidden mutation. Authorship, provenance, review state, and reversibility must remain visible when the work matters.

Use precise language here: agents are content participants, not account owners or final publication authorities. They can create serious candidate work. They cannot silently approve canon, impersonate a human author without labeling, fake a receipt, or claim external publication happened.

The preferred user experience is:

1. agent creates or gathers enough material to move the workflow forward
2. Quipsly records the work as `agent-authored`, `mixed-authorship`, or source-derived
3. Quipsly shows why it exists and what context informed it
4. humans or agents revise it deliberately
5. canon or publication status changes only through visible approval or receipt-backed workflow.

## Proposed action ledger

Assistant actions should flow through a visible ledger backed by these durable models:
- `StudioAssistantSession`
- `StudioAssistantMessage`
- `StudioAssistantAction`
- `StudioAssistantLedger`

First code shape for `StudioAssistantAction`:

## First assistant implementation

The first assistant lives as a collapsible right sidebar in the Nest app, starting with `/create`.

It may read safe context:

- project slug
- document id
- document title
- active chapter or episode boundary
- active view name
- recent visible tags
- a small slice of visible block text

It returns:

- a plain-English assistant message
- suggestions
- proposed tool intents

It does not directly mutate manuscript text.

## Durable assistant persistence models

To support auditing, human-in-the-loop review, and rollback capabilities, the assistant's context is persisted in the database using the following models:

1. **`StudioAssistantSession`**: Grouping container for a chat or research context. Belongs to a `StudioProject` and optionally a `StudioDocument`.
2. **`StudioAssistantMessage`**: Individual messages (role, content, optional `contextJson`).
3. **`StudioAssistantAction`**: Individual proposed tool operations (kind, label, explanation, riskLevel, payloadJson, status).
4. **`StudioAssistantLedger`**: Audit trail mapping status changes of actions (e.g. from PENDING to APPROVED or REJECTED to UNDONE) with comments.

## Interaction boundaries & validation

### Core Rule: “Draft boldly, approve deliberately”
The assistant is a research helper, librarian, continuity checker, freeform drafting partner, and optional co-drafter. It may write rough drafts, propose rewrites, test alternate voices, and generate example passages when requested. It must not silently replace manuscript prose or mutate canon without visibility. Generated text should be presented as a draft, option, example, or suggestion when that distinction matters to the workflow.

### Human-in-the-Loop review flow (Approve / Reject / Undo / Audit)
1. **Proposal**: Every mutating action suggested by the assistant is recorded as a `StudioAssistantAction` with status `PENDING`.
2. **Review UI**: The user reviews the explanation, riskLevel, and payload details in the sidebar panel.
3. **Approve**: Clicking "Accept" shifts the action status to `APPROVED`, writes a ledger event, and executes the mutation.
4. **Reject**: Clicking "Dismiss" changes the action status to `REJECTED` and writes a ledger event.
5. **Undo**: Approved actions can be undone. Clicking "Undo" executes a reversion, transitions the action status to `UNDONE`, and logs the event.
6. **Audit**: All state transitions are logged in `StudioAssistantLedger`, enabling full timeline trace and rollback diagnostics.

## Voice rule

The assistant can help draft notes, packets, outlines, summaries, scenes, panels, and rewrites. It may imitate a requested project voice or user-provided style sample when asked. It should label generated prose when the user needs that context, and it must not secretly replace existing canon while pretending nothing changed.

If it offers wording, label it clearly as a suggestion or research-note draft.

For the full drafting policy, see `docs/quipsly/quipsly-ai-drafting-policy.md`.

## Output planning boundary

The assistant may propose a `propose-output-plan` action. This is safe and non-destructive:

- It may point to `/outputs/<outputId>`.
- It may show required source inputs.
- It may show a starter packet skeleton.
- It may suggest an Art Foundry visual helper.

It must not publish, render, upload, mutate manuscript text, or send content to a destination without explicit human approval and a separate destination-specific workflow.

## Future capabilities

Good next capabilities:

- search current project notes
- find related quotes and source passages
- suggest Chapter or Episode headings
- propose speaker/show-note/clip-cue tags
- create a research packet note
- connect manuscript episode boundaries to production rooms
- summarize imported media or transcript suggestions
- identify citation gaps
- prepare a publish checklist

Risky capabilities that require stronger controls:

- editing manuscript text
- bulk retagging
- deleting blocks
- importing external files
- publishing to public sites
- reconciling Patreon or billing events
- changing project permissions

## North star

The assistant should feel like a brilliant librarian, editor, and drafting partner sitting beside the creator with source cards, draft options, and visible controls. It should offer power without hiding the levers.

The assistant should also be allowed to bring pages to the table, not just sort pages someone else already wrote. Quipsly's anti-black-box principle is not a ban on AI writing. It is a commitment that generated work remains visible, inspectable, revisable, and connected to the surrounding context.

The practical rule for future implementation is simple: if the project is blocked because there is not enough content to build, test, edit, publish, or teach from, the assistant should create a serious candidate and mark it honestly. Waiting for human-supplied content is not safer when it prevents the system from becoming useful.
