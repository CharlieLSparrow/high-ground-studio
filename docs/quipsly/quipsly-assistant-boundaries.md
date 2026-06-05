# Quipsly Assistant Boundaries

Date: 2026-06-04

Purpose: define the first safe product boundary for Quipslys as research assistants, not substitute writers.

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

They should not:

- secretly rewrite manuscript prose
- imitate the user's voice without approval
- publish public content directly
- mutate private project state without visible approval
- hide what changed
- make provider, billing, or entitlement changes invisibly
- Quipslys may draft examples, but never black-box write.

The short version: Quipsly gathers knowledge so humans create wisdom.

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

### Core Rule: “Quipslys may draft examples, but never black-box write”
The assistant is a research helper and librarian. It is strictly prohibited from writing or rewriting prose directly inside the manuscript without visibility. Any generated text must be explicitly presented to the human as a suggestion.

### Human-in-the-Loop review flow (Approve / Reject / Undo / Audit)
1. **Proposal**: Every mutating action suggested by the assistant is recorded as a `StudioAssistantAction` with status `PENDING`.
2. **Review UI**: The user reviews the explanation, riskLevel, and payload details in the sidebar panel.
3. **Approve**: Clicking "Accept" shifts the action status to `APPROVED`, writes a ledger event, and executes the mutation.
4. **Reject**: Clicking "Dismiss" changes the action status to `REJECTED` and writes a ledger event.
5. **Undo**: Approved actions can be undone. Clicking "Undo" executes a reversion, transitions the action status to `UNDONE`, and logs the event.
6. **Audit**: All state transitions are logged in `StudioAssistantLedger`, enabling full timeline trace and rollback diagnostics.

## Voice rule

The assistant can help draft notes, packets, outlines, and summaries. It should avoid presenting generated prose as the user's manuscript voice.

If it offers wording, label it clearly as a suggestion or research-note draft.

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

The assistant should feel like a brilliant librarian sitting beside the author with sticky notes, not like a novelist trying to steal the pen.
