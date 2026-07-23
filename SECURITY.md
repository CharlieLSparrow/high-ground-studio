# Security policy

Quipsly handles identity, recordings, transcripts, notes, coaching material,
tasks, goals, and publishing workflows. Treat authorization and data isolation
failures as release blockers.

## Supported code

Security fixes target the current default branch and the production revisions
derived from it. Historical branches and local experiments are not supported
release lines.

## Report a vulnerability privately

Do not open a public issue.

Use GitHub's private vulnerability reporting flow:

[Report a vulnerability](https://github.com/CharlieLSparrow/high-ground-studio/security/advisories/new)

If that flow is unavailable, contact the repository owner through their GitHub
profile without including exploit details or user data in a public message.

Include:

- affected surface and commit or deployed revision;
- impact and required attacker access;
- minimal reproduction using synthetic data;
- whether credentials or private data may have been exposed;
- suggested mitigation, if known.

We aim to acknowledge a complete report within three business days. Timing for
remediation and disclosure depends on severity and whether a deployed system is
affected.

## Security expectations

- Never commit secrets, signing keys, service-account JSON, auth cookies,
  production database exports, or App Store Connect API keys.
- Use separate synthetic identities for authorization tests.
- Prove direct-object authorization; hiding a record from search is not an
  access-control test.
- Keep local emulators and local upload vaults loopback-only.
- Treat recordings, transcripts, coaching notes, and unpublished manuscripts
  as private by default.
- Use immutable source revisions and preserve release receipts.
- Rotate exposed credentials immediately and invalidate derived sessions.

Public proof artifacts must not contain personal, client, or production data.
