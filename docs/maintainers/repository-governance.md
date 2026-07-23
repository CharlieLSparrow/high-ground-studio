# Repository governance

## Ownership

`CODEOWNERS` is the executable ownership map. The repository owner is the
default reviewer until collaborators with durable product responsibility have
write access. Add named owners by surface rather than removing the fallback.

## Merge policy

The target policy for `main` is:

- pull request required;
- at least one approving review;
- required status checks for repository contract, binary budget, and affected
  surface;
- conversation resolution required;
- branch must be current before merge;
- force pushes and deletion blocked;
- squash merge preferred for bounded feature branches.

Repository settings must be changed deliberately and verified on GitHub; files
alone do not enable branch protection.

## Releases

- A release identifies an immutable source SHA.
- Preview, schema migration, smoke, promotion, and rollback are separate steps.
- Production credentials are unavailable to untrusted pull requests.
- A simulator or build result never substitutes for physical-device,
  credentialed-runtime, or delivery readback.

## Dependency maintenance

Dependabot monitors pnpm, GitHub Actions, Capture Ruby tooling, and the Nest
Dockerfile. Minor and patch Node updates are grouped. Major upgrades require a
separate compatibility plan and consuming-runtime proof.

## Documentation ownership

The root README, contributor/security policies, development guide,
architecture map, ADR index, testing matrix, and release index are maintained
interfaces. CI validates their presence and local links.

Historical session notes are evidence, not automatic authority. Durable
decisions move into architecture, decisions, or runbooks.

## Access onboarding

A collaborator receives the least privilege needed:

1. read access and local synthetic-data setup;
2. triage or pull-request collaboration;
3. write access after review responsibility is clear;
4. deployment, Cloud, App Store Connect, or production-data access only for a
   documented release role.

Never distribute credentials through repository files, issues, or pull-request
comments.

## License gate

The repository currently has no open-source license. Choosing one changes reuse
rights and must be an explicit owner decision before the project is described
as open source.
