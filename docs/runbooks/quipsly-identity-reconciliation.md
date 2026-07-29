# Quipsly identity reconciliation

Quipsly owns one canonical human record even when that person uses several
verified email addresses or authentication providers. Firebase proves a
credential. It does not decide which Nest, projects, notes, tasks, sessions, or
roles belong to a person.

## Production identity boundary

- `User` is the canonical person.
- `UserEmail` stores alternate verified addresses for that person.
- `UserAuthIdentity` stores provider subjects such as Firebase UIDs.
- `User.firebaseUid` is a compatibility pointer, not the complete identity
  ledger.
- project access checks resolve the primary email and every owned alias.
- a provider credential may be attached only after its verified email resolves
  unambiguously to one active Quipsly person.
- provider credentials never reactivate an inactive Quipsly account.

Do not create a second `User` merely because Google, password authentication,
or a future provider returns a different subject for an already-owned email
alias.

## Audit the app-owned ledger

The read-only audit is redacted by default:

```bash
node scripts/quipsly-identity-integrity-audit.mjs
```

For Cloud SQL, supply the database URL through process environment and use the
Cloud SQL proxy rewrite. Never paste or print the URL. A passing result requires
zero hard issues and zero warnings.

## Merge a duplicate app person into an alias

The duplicate app record must have no Firebase UID, no provider identity, and
no foreign-key-owned records. The command is a dry run unless `--apply` is
present:

```bash
node scripts/quipsly-merge-user-email-alias.mjs \
  --canonical-email canonical@example.com \
  --alias-email alternate@example.com \
  --label "verified alternate login"
```

Review the receipt, take a database backup for a production merge, and then
repeat with `--apply`. Historical email attribution strings remain unchanged.

## Reconcile an existing password-only Firebase alias

Use this narrower workflow when:

1. the canonical Quipsly person is active and verified;
2. the alternate email is already a `UserEmail` owned by that person;
3. the canonical Firebase credential is verified and includes Google;
4. the alternate Firebase credential is enabled, unverified, and
   password-only;
5. the alternate Firebase UID owns no `User.firebaseUid` pointer and no
   `UserAuthIdentity`.

Run the production-safe dry run:

```bash
bash scripts/quipsly-live-firebase-email-alias-reconcile.sh \
  --canonical-email canonical@example.com \
  --alias-email alternate@example.com
```

After reviewing every precondition, repeat with `--apply`. The reconciler:

- changes only `emailVerified` on the existing Firebase credential;
- does not delete, recreate, disable, or reset its password;
- writes `identity.firebase_email_alias_verified_v1` to the canonical
  Quipsly person's event log;
- reads Firebase back after the change;
- stays idempotent on later runs.

This makes the existing password path usable without another email. It does not
silently link Google. Provider linking remains a separate, explicit user flow.

## Google provider ownership

Nest web and Quipsly Capture must use OAuth clients owned by the same
`quipsly-reef` Firebase project:

- one web/server client for Firebase's Google provider;
- one iOS client for
  `com.highgroundodyssey.HighGroundCapture`;
- the reversed iOS client ID as an app URL scheme;
- `nest.quipsly.com` and the Firebase auth handler on the provider allowlist.

Do not leave a Quipsly Firebase provider pointed at a client from
`high-ground-odyssey`. Do not copy a client secret into the iPhone app. The
Firebase Apple configuration contains non-secret app identifiers; server
secrets remain provider-side.

Accepting Google's user-data policy is a legal agreement and requires the
account holder's explicit confirmation at action time. After that confirmation:

1. provision project-owned web and iOS OAuth clients;
2. point the Firebase Google provider at the project-owned web client;
3. download and inspect a fresh Apple configuration;
4. configure `GIDClientID`, `GIDServerClientID`, and the reversed URL scheme;
5. test Google sign-in with both the primary email and an owned alias;
6. confirm both subjects resolve to the same Quipsly `User`;
7. confirm a different person's email cannot claim that user.

## Required receipts

Identity work is not complete from a successful provider popup alone. Keep:

- redacted database integrity audit;
- provider record readback;
- canonical-plus-alias authorization smoke;
- identity-ledger readback after sign-in;
- separate-account denial proof;
- real Nest and physical-device login proof.

Never print passwords, tokens, session cookies, Firebase UIDs, database URLs, or
OAuth client secrets in an operator receipt.
