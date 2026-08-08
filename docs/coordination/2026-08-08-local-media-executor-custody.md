# Local media executor custody

Date: 2026-08-08

## Outcome

Quipsly no longer treats `local-cache` as a globally reachable storage
provider. Every newly materialized Drive replica is owned by one local media
worker and one opaque storage scope. A ready replica therefore means **the
selected executor can open the verified bytes**, not merely that some Mac once
reported a path.

## Boundary

- `AgentNode` identifies the Mac worker. The stable node ID is derived from the
  host identity.
- `storageScopeId` identifies one canonical local media root on that worker.
  It is a SHA-256-derived opaque identifier over the host, canonical root, and
  filesystem identity; the path never reaches the web projection.
- Drive materialization job v2 binds the source revision, provider receipt,
  custodian node, storage scope, and materialization profile into its stable
  identity.
- Only the named node/scope can claim that job. The completion receipt repeats
  the custody identifiers and the database transaction verifies them before
  retaining the replica.
- The collaboration-proxy job spawned from a verified Drive LRV carries the
  same execution target. A second Mac cannot claim a proxy job whose exact
  source replica it cannot read.
- Local reconciliation selects only replicas assigned to its own node and
  scope. It cannot mark another Mac's healthy file missing or recover a stale
  path by coincidence.
- Final-conform planning counts exact bytes only on the currently selected
  executor. A replica on another Mac is useful retained evidence, but is not
  render-ready on this Mac.

## Migration behavior

Migration `20260808213000_scope_local_media_replicas_to_executor` adds nullable
custody fields and a custodian relation. Existing replicas intentionally remain
legacy-unscoped. The migration does not guess ownership from absolute paths;
those artifacts become current only after an owning worker re-verifies or
rematerializes them.

## Verification

- Shared media-processing and local-worker TypeScript checks pass.
- Quipsly web TypeScript check passes.
- Sixteen filesystem/contract worker tests pass, including partial resume,
  provider drift, immutable receipt binding, path escape rejection, and
  same-size corruption.
- Five focused web contract tests pass.
- Four PostgreSQL integration tests pass against the migrated local database.
- The retained operation generated a synthetic 3,676,170-byte LRV, retained an
  exact MD5/SHA-256-bound replica on one scope, created a 121,682-byte
  collaboration proxy on the same executor, and proved the provider fixture
  remained unchanged. No shared-Drive original was downloaded.
- Persistent local services were restarted from this worktree; local doctor
  passed and the online worker readback includes an opaque scope with no path.

## Current operational hold

The active cache is temporary and the system volume currently has less free
space than Quipsly's 5 GiB reserve. The connected My Passport volume is also
99% utilized. Real shared-Drive transfers remain correctly held until a roomy,
durable media workspace is mounted and selected. This is a capacity hold, not
an architecture or OAuth blocker.

## Next boundary

`StudioMediaDerivative` is still a legacy global-local lane. Drive
materialization and its immediate collaboration proxy are now executor-routed,
but visual, waveform, and render derivatives should adopt the same explicit
custody model before Quipsly schedules those stages across multiple Macs.
