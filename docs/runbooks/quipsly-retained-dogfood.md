# Retained Quipsly dogfood data

Quipsly acceptance work should leave behind useful longitudinal product state.
The goal is to operate the same notes, tasks, goals, projects, tags, sources,
Sessions, recordings, and follow-through over multiple releases instead of
proving only that a disposable fixture can be created once.

This policy applies to local development, Firebase emulators, preview
revisions, production QA accounts, TestFlight, and physical-device rehearsals.
It does not turn QA data into customer data or authorize external side effects.

## Default

- Retain useful QA identities and product artifacts unless a harness is
  explicitly testing deletion or disposable-account cleanup.
- Operate the rendered web or native product whenever practical. API and
  database readback prove the boundary after the user-visible journey; they do
  not replace it.
- Reuse the retained corpus to test upgrades, search, tagging, portability,
  account switching, offline recovery, schema migrations, and cross-surface
  continuity.
- Never mark an artifact complete, delivered, published, transcribed, synced,
  or shared unless that exact state was produced and read back.

## Identity and naming

Every retained identity must be a dedicated QA identity, never a real
collaborator's login. Every retained artifact must be obvious in ordinary UI:

- Display title prefix: `QA Retained ·`
- Slug prefix: `qa-retained-`
- Machine-generated request or run ID prefix: `qa-retained-`
- Recommended tag: `#qa-retained`

The receipt for a retained journey records, when available:

- environment and canonical origin;
- Quipsly user ID and a redacted identity label;
- app version/build and exact source commit;
- backend revision and exact source commit;
- simulator or physical-device boundary;
- artifact IDs, hashes, and canonical URLs;
- external side effects requested and observed;
- outsider-denial and second-account isolation results.

Passwords, bearer tokens, session cookies, API keys, database URLs, OAuth
secrets, private signing material, and unredacted credentials never belong in a
receipt, Git, screenshots, or test content. Store durable QA credentials only
in an approved local credential store. If a harness cannot preserve a login
secret safely, its retained records are evidence artifacts rather than a
reusable interactive account.

### Reusable local coaching identities

The retained coaching seed remains ephemeral by default so CI and ordinary
one-off runs do not silently create durable credentials. On a developer Mac,
opt in to longitudinal reuse with:

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
QUIPSLY_RETAINED_COACHING_BASE_URL=http://127.0.0.1:3012 \
QUIPSLY_RETAINED_COACHING_CREDENTIAL_STORE=keychain \
node scripts/quipsly-retained-coaching-follow-up-seed.mjs
```

Keychain mode is macOS-only and accepts only the fixed reserved `.test`
identities. It stores generated passwords in exact generic-password items under
service `com.quipsly.qa.retained-coaching`, marks new items
`AfterFirstUnlockThisDeviceOnly`, passes secrets through process standard input
rather than command arguments, and never includes them in the seed receipt.
Unexpected Keychain failures fail closed; only an exact item-not-found result
permits credential creation.

After seeding, prove all three retained identities through Firebase, the Nest
session exchange, and the relationship-protected follow-up route:

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
QUIPSLY_RETAINED_COACHING_BASE_URL=http://127.0.0.1:3012 \
node scripts/quipsly-retained-coaching-keychain-smoke.mjs
```

This smoke is deliberately loopback-only. It prints role/status evidence, not
passwords, tokens, cookies, or unredacted identities. The default `temporary`
seed mode remains the portable CI path. Production QA accounts require a
separate explicit credential and side-effect plan; local Keychain reuse does
not authorize creating them.

To operate the rendered product rather than stopping at route proof, run:

```bash
QUIPSLY_RETAINED_COACHING_BASE_URL=http://127.0.0.1:3012 \
node scripts/quipsly-retained-coaching-browser-smoke.mjs
```

This Playwright journey uses the real email/password login form, follows the
visible Session navigation from Overview to Outputs, and checks the coach,
released-client, and concealed-outsider projections. Coach runs at a desktop
viewport; client and outsider run at a phone-sized `390x844` viewport. It
checks the follow-up surface for horizontal overflow and browser exceptions,
then explicitly clears each Nest session. Tracing and screenshots are disabled
so an unredacted test identity or filled password does not become an artifact.

### Reusable local media-production identity

The retained Capture-to-follow-through corpus has its own fixed Keychain
service, `com.quipsly.qa.retained-product`. Reconcile its canonical PostgreSQL
identity, emulator login, and active Nest grant with:

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
node scripts/quipsly-retained-product-keychain-seed.mjs
```

The seed refuses non-local Firebase and database targets, requires the exact
retained `.test` identity and Nest, preserves the canonical Firebase UID, and
does not mutate product records. It may recreate the emulator user after an
emulator reset, but never prints the password or writes a credential packet.

Operate its persisted note, task, goal, tag, relationship, plan, and Today
projections through the rendered product with:

```bash
QUIPSLY_RETAINED_PRODUCT_BASE_URL=http://127.0.0.1:3012 \
node scripts/quipsly-retained-product-browser-smoke.mjs
```

This journey follows the canonical `#rehearsal` tag across note, task, and goal
results, opens project and global Work over the same IDs, and finishes on a
phone-width Today surface. It performs no product mutation or external action,
captures no screenshot or trace, and explicitly clears its Nest session.

To create and retain a new project plus tagged Task, private document-kernel
Note, and active Goal through the compiled iPhone app, use:

```bash
pnpm quipsly:retained:native-project -- \
  --project "QA Retained · Native work <source> <run>" \
  --task "QA Retained · Organize work <source> <run>" \
  --tag "QA Retained · Longitudinal QA"
```

Set the documented local Firebase, Nest, and PostgreSQL environment variables
before running it. The operation refuses non-loopback targets and duplicate
exact project names. It retrieves the fixed media operator password from the
same dedicated Keychain service, operates the compiled app, and independently
checks the complete canonical graph. Successful and failed product artifacts
are retained; only hashes and the local result-bundle path are printed.
The first exact-commit operation and its retained fixture chronology are in
`docs/coordination/2026-07-31-retained-native-project-operation.md`.

## Environment boundaries

### Local and emulator

Local QA is the broadest retained lane. It may exercise complete notes, tasks,
goals, projects, tags, annotations, Session context, capture recovery, uploads,
portability, and editor handoff using clearly labeled synthetic content.

The canonical retained local corpus and its verified portability package are
documented in
`docs/coordination/2026-07-31-retained-capture-follow-through-dogfood.md`.

### Preview and production

Production QA data remains private to a dedicated test user and private test
Nest. A production journey must:

1. target an exact zero-traffic preview revision before promotion;
2. avoid real client, collaborator, or customer identities;
3. disable email, SMS, calendar, payment, publication, and invitation side
   effects unless the exact external action is the approved subject of the
   test;
4. prove an unrelated authenticated account cannot discover the retained
   private objects;
5. record the exact deployed source and schema state;
6. read the canonical records back after the rendered journey.

`scripts/quipsly-mobile-capture-generated-auth-smoke.mjs` supports
`--keep-artifacts=1`, but its default generated password is intentionally not
printed. Use that option for retained production evidence only; do not mistake
it for a reusable longitudinal login until the credential is deliberately
stored through an approved secure workflow.

### TestFlight and physical devices

Simulator evidence does not become physical-device evidence. Retain the app's
local receipt, source hash, upload state, recovery state, and corresponding
private Nest records after a physical rehearsal. Preserve original recording
sources; create versioned derivatives rather than overwriting them.

## Retention and removal

- Do not automatically delete a healthy retained corpus at the end of a test.
- Prefer soft archive or a dedicated archived QA Nest when artifacts become
  noisy in normal product views.
- Preserve release receipts and small manifests in managed evidence storage;
  keep large media in managed media storage rather than Git.
- A test that proves permanent deletion may delete only its exact predeclared
  QA targets and must independently confirm the rest of the retained corpus is
  unchanged.
- Purge retained data only for a clear privacy, security, cost, or product
  reason. Record what was removed and whether recovery remains possible.

## Acceptance standard

A retained dogfood journey passes only when the user-visible flow works, the
canonical state matches it, another account is denied, no unapproved external
effect occurred, and the evidence can be tied to an exact source/build. A row
insert, mocked preview, or screenshot alone is not a product acceptance test.
