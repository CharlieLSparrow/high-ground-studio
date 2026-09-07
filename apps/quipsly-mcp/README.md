# Quipsly agent tools

This local stdio adapter lets an agent work through Nest's authenticated HTTP
APIs as the signed-in person. It has no database credentials, fabricated agent
user, independent membership system, or approval queue. Work appears in the
same client space and is editable/removable/restorable through the product.

## Run

Install the repository's pinned dependencies, then run:

```sh
pnpm --filter quipsly-mcp build
pnpm --filter quipsly-mcp start
```

`QUIPSLY_API_BASE_URL` defaults to `https://nest.quipsly.com`. HTTP is permitted
only on loopback for development. `QUIPSLY_SESSION_TOKEN_FILE` defaults to
`~/.config/quipsly/agent-session.jwt`: an owner-only (0600), non-symlink file
containing the person's current Firebase ID token. Never put it in Git, tool
arguments, chat messages, or shared logs. The adapter rereads it for every call;
expired or revoked credentials fail through the same Nest authentication used
by Capture. It never follows HTTP redirects with credentials.

This is a developer adapter, not public remote-MCP OAuth onboarding. It does
not yet obtain/refresh the person's token itself or provide a separate agent
identity in the activity UI. A future connection flow must issue scoped access
and preserve agent attribution through the canonical application boundary.
Do not give it admin service-account credentials or use it to bypass login.

## Work and retry behavior

Discover coaching spaces with `get_coaching_home`, then use `read_client_work`
with search, pagination, or an exact item. Workspace overview results are bounded
and are not a complete archive. Create notes/tasks/goals directly. Tasks and
goals are shared; private notes stay author-only. Updates require the full
current editable fields and `updatedAt` version so unrelated edits, privacy,
ownership and dates are not silently overwritten. Removal returns a version
that can be passed to restore. Conversation messages are a sending action,
not a draft; invoke that tool when the person wants a message sent.

Reuse the original UUID and identical content after an uncertain create/send
response. There are no hidden write retries. On edit conflict, read back and
reconcile. The API owns authorization, transactions, retry deduplication and
recovery; the adapter must not duplicate those rules in direct database code.

## Tests

`pnpm --filter quipsly-mcp test` exercises real MCP client/server messages and
HTTP failure behavior without external services. TypeScript 7 CI also runs it.

For real persistence, start local Nest (3012) and Firebase Auth emulator (9099).
Set `QUIPSLY_QA_ENGAGEMENT_ID`, `QUIPSLY_QA_PROJECT_SLUG`, and
`QUIPSLY_QA_{COACH,CLIENT,OUTSIDER}_{EMAIL,PASSWORD}` to three synthetic local
accounts. Coach/client must belong to the chosen client space; outsider must
not. Run `pnpm --filter quipsly-mcp test:local`. It retains clearly labeled
synthetic notes/chat, tests shared/private visibility, retry, stale edits,
removal/restore and outsider denial, then prints a browser readback URL. It
cannot target production. Open that URL as the client and edit/reload the note.

Protocol result/error shape follows the [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
Nest verifies [Firebase ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens);
the adapter's file-format check is not identity verification.
