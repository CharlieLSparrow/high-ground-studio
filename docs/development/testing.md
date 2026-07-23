# Testing and proof

Quipsly uses layered proof. Passing one layer does not imply the next.

| Layer | Question | Examples |
| --- | --- | --- |
| Source | Is the intended committed input present and scoped? | changed-surface planner, release context, source SHA |
| Deterministic | Does code compile and behavior pass without mutable external state? | unit tests, typecheck, simulator UI suite, production build |
| Local runtime | Can a person complete the workflow and read it back? | create note/task/goal/tag, reload, search |
| Credentialed runtime | Do identity, authorization, storage, and persistence work in the intended environment? | separate-account access test, staging upload |
| Delivery | Did the actual artifact reach the user-facing channel? | physical iPhone, TestFlight install, Cloud Run revision, published page |

## Repository checks

```bash
node --test scripts/ci/audit-repository-contract.test.mjs
node scripts/ci/audit-repository-contract.mjs
node --test scripts/ci/audit-binary-assets.test.mjs
node --test scripts/ci/plan-changed-surfaces.test.mjs
```

## Nest

```bash
pnpm --filter quipsly exec tsc --noEmit --incremental false
pnpm --filter quipsly build
bash scripts/release/quipsly-build-context.test.sh
```

For visible product behavior, use the signed-in dogfood sequence in
[Nest local development](../runbooks/quipsly-nest-local.md): create records,
link them, find them across Home Nest, Work, Today, and Search, then reload.

## Capture

CI runs the deterministic Capture suite on the pinned iOS simulator. Release
claims additionally require:

1. archive and App Store export from an exact source SHA;
2. IPA signing and privacy-key verification;
3. install and workflow smoke on a physical iPhone;
4. TestFlight-installed smoke;
5. App Store Connect processing and compliance readback.

## Schema changes

- Add forward-only Prisma migrations.
- Generate the client and validate affected packages.
- Apply only to an explicit safe target.
- Prove runtime behavior after migration.
- Document rollback or forward-repair strategy.

## Evidence safety

Shared logs and screenshots must use synthetic or approved data. Never attach
credentials, auth tokens, production database rows, private recordings,
transcripts, coaching details, or unpublished source material to CI or issues.
