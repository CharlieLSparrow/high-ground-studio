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

## Executor-aware source library

The follow-on slice now scopes new local derivatives as well. Collaboration
proxy identity includes executor custody, so the same exact Drive source can
have independent proxies on two Macs without a job or derivative collision.
The proxy, contact sheet, and complete audio-navigation job remain pinned to
one scope; supersession and reconciliation cannot cross scope boundaries.
Custody is an all-or-nothing database invariant, legacy unscoped derivative
uniqueness remains enforced, and an executor cannot be deleted while it still
owns local derivatives.

Source Room now exposes a **Local media computer** selector backed by the
ranked online executor inventory. Source pages, followed-library health,
materialization, proxy generation, filmstrip, waveform, and final-quality
storage planning all use that exact node and storage scope. If the selected
computer goes offline, Quipsly holds the operation rather than silently
substituting another Mac. Legacy unscoped artifacts remain a narrow fallback;
artifacts scoped to a different executor never appear ready.

Visual and audio navigation identities now include the exact input proxy ID,
so byte-identical proxy generations on two executors cannot share a job. A
two-executor PostgreSQL test proves that each projection contains only its own
replica, derivative, and job. The retained Episode 5 filmstrip and complete
81.69-second audio analysis pass after restarting the actual worker from the
new code, and the synthetic Drive operation again proves exact source bytes,
proxy, contact sheet, waveform, and frequency evidence without downloading a
real Drive original.

## Native device-folder receipt v2

The macOS folder workflow now joins the same executor boundary. Before a
folder observation, preparation, or in-place verification, the app resolves
the active worker root to its canonical filesystem path and derives the exact
node and storage-scope IDs used by the local media worker. Nest verifies that
tuple against a fresh online heartbeat.

Device library locator v2, preparation plan v2, verification plan v2, and both
receipt v2 contracts carry that custody. Stable workflow identities include
the node and scope. Exact LRV replicas are retained with both database foreign
keys, device-backed proxy selection is scope-aware, and in-place verification
jobs preserve separate evidence for each executor. Readiness is the union of a
scope's exact replica and its own verification receipts; another Mac's global
source checksum is not mistaken for local byte availability.

The PostgreSQL operation uses two simultaneously online executor fixtures. It
proves the second executor sees zero retained LRV, proxy, and verification
readiness after the first executor completes all three. A receipt carrying the
second executor identity against the first executor's folder library is
rejected. Swift and Node identity derivation were compared directly on the
live temporary workspace and produce the same opaque tuple.

## Remaining boundary

Spatial/render producers must declare whether their output is executor-local
or portable object storage. Legacy device replicas remain readable only as an
unscoped fallback where the older workflow requires them; no new native
receipt can create unscoped local custody.
