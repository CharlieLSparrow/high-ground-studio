# Retained coaching draft-revision checkpoint

Date: 2026-08-01

Branch: `codex/quipsly-product-20260724`

## Outcome

The assigned coach can now reopen the current private client follow-up draft,
adjust its title, opening note, next-Session focus, and included canonical
records, inspect the exact revised snapshot, and save a new immutable revision
before release. Saving does not expose the draft to the client and does not
email, message, publish, schedule, change consent, or mutate the selected source
note, task, or goal.

The update boundary uses a client-generated UUID as both the stable request
identity and the immutable `SessionOutputRevision` identity. An exact retry
returns current canonical truth; reuse for different intent conflicts. The
server re-reads Session access, coach assignment, recipient identity, eligible
source records, draft status, and expected revision inside one Serializable
transaction. A compare-and-swap update advances the monotonic output revision
and appends `DRAFT_UPDATED`; stale writers cannot silently overwrite one
another. Released history is never editable.

## Rendered retained operation

The local operation used the retained coach and separate retained client
accounts against loopback Nest, the Firebase Auth emulator, and local
PostgreSQL. Short-lived mode-0600 emulator credentials restored sign-in without
resetting any product records or printing a secret.

Through the rendered product, the coach:

1. opened the prior coaching Session's Outputs desk;
2. prepared a new private follow-up from the three currently eligible canonical
   records;
3. read back private revision 1;
4. changed the opening note and saved;
5. read back private revision 2 and the explicit immutable-history/private
   visibility notice.

The separate client account opened the same Session and continued to see only
the earlier released revision. The private QA title and draft-state marker were
absent. Independent PostgreSQL readback found exactly:

- output status `DRAFT`, revision `2`;
- revision operations `DRAFT_CREATED`, `DRAFT_UPDATED`;
- zero delivery events for the private output;
- false external-message, provider-calendar, and publication claims;
- unchanged retained released-output revision and content hash;
- unchanged global delivery-event and Calendar-evidence counts.

After screenshots and database readback, the operator deleted only that exact
private QA output. Cascade cleanup removed its two revision rows and restored
the pre-operation output count. The retained released client artifact and all
canonical coaching records remain in place.

External mode-0600 evidence:

- `/Volumes/My Passport/Quipsly QA Artifacts/Coaching Draft Revisions/20260801T152127762Z/receipt.json`
- `/Volumes/My Passport/Quipsly QA Artifacts/Coaching Draft Revisions/20260801T152127762Z/coach-private-revision-1.png`
- `/Volumes/My Passport/Quipsly QA Artifacts/Coaching Draft Revisions/20260801T152127762Z/coach-private-revision-2.png`
- `/Volumes/My Passport/Quipsly QA Artifacts/Coaching Draft Revisions/20260801T152127762Z/client-released-artifact-only.png`

## Verification

- follow-up route and rendered component: 9/9;
- real PostgreSQL lifecycle: 1/1, including exact replay, simultaneous
  two-writer conflict with one winner, stale-write conflict, client update
  denial, release from the winning revision, acknowledge, revoke, and five-row
  immutable history;
- retained-operation safety contracts: 2/2;
- rendered coach/client operation: pass, zero browser exceptions;
- Quipsly TypeScript: pass.

The reusable commands are:

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  QUIPSLY_RETAINED_COACHING_CREDENTIAL_STORE=temporary \
  QUIPSLY_RETAINED_COACHING_CREDENTIAL_DIRECTORY=/absolute/private/directory \
  pnpm quipsly:retained:coaching-auth-seed

DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
  QUIPSLY_RETAINED_COACHING_BASE_URL=http://127.0.0.1:3012 \
  QUIPSLY_RETAINED_COACHING_CREDENTIAL_STORE=temporary \
  QUIPSLY_RETAINED_COACHING_CREDENTIAL_DIRECTORY=/absolute/private/directory \
  pnpm quipsly:retained:coaching-draft-revision
```

Both commands refuse non-loopback infrastructure. The auth-only seed changes no
database state. The operation performs no external delivery and cleans up only
its exact private QA draft.
