# Shared spaces and conversations

Date: 2026-09-06
Status: Accepted direction; replacement implementation is not complete.

## Why this is the next structural change

Quipsly's first commercial workflow is coaching, but its foundation must also
support collaborative writing, podcasts, media production, and training. The
user has explicitly authorized replacement of prelaunch schemas and workflows;
synthetic records are not compatibility contracts. Keep valuable source media,
credentials, provider configuration, and demonstrated behavior.

Current code has useful parts but no single shared-work model:

- `StudioWorkspace` groups `StudioProject` records; the latter are presented as
  Nests. The workspace has an `ownerLabel`, and
  `resolveStudioProjectAccess` uses that email-shaped label as ownership proof.
- `StudioProjectAccessGrant` identifies members by email; coaching engagement
  membership uses user IDs; session access combines participants, bookings, and
  project grants. Those are distinct rules, not one reusable membership system.
- `StudioNestChatThread` encodes episode/session/engagement/story-card scope in
  string keys. `SessionConversationMessage` is a separate message store with
  replies, revision history, idempotent requests, and read cursors.
- A generic `Editor` and a separate manuscript-collaboration implementation use
  Hocuspocus/Yjs. Having that code does not establish reliable simultaneous
  editing of every canonical note or document.
- Simple notes previously opened a manuscript-oriented `/create` surface. A
  focused `/notes/:id` now uses canonical note revisions and recoverable saves;
  it is not yet a full rich-text/coauthoring editor.

Evidence: `prisma/schema.prisma`, `src/lib/server/studio-project-access.ts`,
`session-access.ts`, `coaching-engagement.ts`, `src/app/api/nest-chat/route.ts`,
`src/app/api/sessions/[roomId]/conversation/route.ts`, and
`src/components/Editor.tsx` under `apps/quipsly` unless otherwise specified.
These are maintainability and consistency findings, not claims of a verified
customer-data breach.

## Decision

1. Use an immutable user ID as the principal. Verified provider identities and
   email addresses belong to that user. Email is an invitation/delivery address,
   not an ongoing ownership key. Account linking is explicit; no silent alias
   widening or label-based ownership in the replacement boundary.
2. Model a Nest as a personal/team home and a Space as an ongoing subject of
   work: a client relationship, episode, book, or course. Reconcile the existing
   workspace/project/engagement records into this model, not another parallel
   Nest system. Exact display terminology remains a UX decision.
3. Use one membership/authorization implementation, with explicit scope and
   small capability roles. Coaching role labels describe the relationship;
   they must not independently implement platform access rules. Private spaces
   and private drafts remain distinct from shared workspace material.
4. Use one conversation/message implementation for spaces and contextual
   threads. Reuse the stronger existing session behavior: durable IDs, retries,
   replies, edit history, deletion, and read cursors. Conversation links to work;
   it does not become the storage format for documents, tasks, or timelines.
5. Use typed application commands/queries for people and agents. UI routes are
   adapters. Realtime notifications announce durable changes; reconnect reads
   canonical state. Revocation must apply to reads, writes, sockets, and jobs.
6. Use CRDT collaboration for simultaneous document editing where warranted,
   integrated with canonical document identity and persistence. Do not maintain
   an independently editable CRDT document and database document with unrelated
   save paths. Keep original recording/transcript anchors through text edits.
7. Keep scheduling/call/recording capabilities attached to the space. Booking a
   session should not require creating another collaboration container, and
   ending a call should not strand the notes or conversation.

## Technology and scope tradeoffs

Retain Next.js, TypeScript, PostgreSQL/Prisma, and Swift for the first slice.
There is concrete evidence of fragmented application models, not evidence that
these technologies prevent the desired product. Move policy out of framework
routes so replacing a host later does not require replacing the product again.
Keep a modular monolith for transactional application work; media processing
and realtime delivery can have different execution lifecycles.

Do not replace these models with a universal untyped node/property graph. Shared
identity, membership, linking, and conversation are reusable primitives; a
recording, document, assignment, and timeline still have different invariants.
Do not force every task into chat: retain excellent direct tools alongside it.

This deliberately rejects both extremes: indefinite compatibility layers around
failed prototypes, and a technology rewrite before proving one useful outcome.
Delete superseded implementations when the replacement workflow runs end to
end. Do not put a second membership or chat subsystem into ordinary navigation
as an experiment.

## First complete replacement slice

Build one private client space: create it, invite a second account, converse,
write shared notes, schedule/join a call, return to the same space with its
recording/transcript/tasks, and share the intended output. A third account must
not discover or access it. Then use the same space structure for an episode
with a script, clips, conversation, session, and timeline.

Test membership revocation, reconnect, duplicate send, simultaneous text edits,
reload, private versus shared notes, and source-linked outputs through the app.
Those checks define an actual coherent foundation; counting routes, tables, or
lines of code does not.

## Product references

- [Notion teamspaces](https://www.notion.com/en-gb/help/intro-to-teamspaces)
  distinguish a shared home and its membership from the content inside it.
- [Teams shared channels](https://learn.microsoft.com/en-us/microsoftteams/shared-channels)
  provide scoped ongoing conversation, including history for new members.
- [Teams shared files](https://support.microsoft.com/en-us/teams/files/share-files-in-microsoft-teams)
  keep material from conversations discoverable outside the message stream.

These are useful interaction patterns, not specifications to clone. Quipsly's
advantage should be direct creative tools and useful AI work in that shared
context, with much less setup.
