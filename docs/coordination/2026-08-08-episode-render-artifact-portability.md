# Episode proof render portability and executor custody

Date: 2026-08-08

## Decision

An Episode edit and a local proof render are different kinds of product truth:

- the edit branch, source selections, timing decisions, and annotations are
  portable canonical intent;
- exact camera/audio inputs and the generated MP4 proof are executor-local
  bytes until Quipsly performs an explicit verified promotion to portable
  object storage.

Episode proof contract v2 applies the shared `executor-local` artifact
authority to the execution target, every source, the output target, the result,
and the worker receipt. A local path is never treated as global availability.

## Enforced path

1. Planning selects one compatible, fresh local executor and its opaque storage
   scope. The UI names that Mac and explains that the proof bytes stay there
   while the shared edit remains portable.
2. Queuing repeats the exact node selected by the plan. If it disappears,
   Quipsly holds the operation rather than silently substituting another Mac.
3. Every source is checksum- and size-bound and must carry the same executor
   authority as the job and target.
4. PostgreSQL claims filter both custodian node and storage scope. The worker
   also validates the target before any renderer is called.
5. The worker resolves each source inside the authorized media root once,
   retains that resolved path for the before/after drift check, and emits an
   unapproved, non-publication result receipt with matching custody.
6. Server registration requires the same executor/storage scope to remain
   online, verifies byte count, SHA-256, and complete FFmpeg decode, then
   records custody on the asset attachment.
7. Generic protected playback requires one unambiguous v2 custody receipt, the
   registered executor scope to be current, and the web process itself to
   derive the same node/scope from its canonical media root and filesystem
   identity. Missing, ambiguous, foreign, or merely remote custody fails closed
   without changing ordinary Studio source behavior.

## UX contract

The Episode editor keeps responsive browser preview separate from exact-source
proof creation. Render planning has no side effects and shows source count,
bytes, quality, cost, and executor locality. Only the explicit render action
creates a job. The result remains a review artifact, never an approved master
or publication package.

## Proof

- Shared media package, local media processor, and Quipsly web TypeScript checks
  pass.
- Eight contract/worker tests cover source authority mismatch, wrong-worker
  refusal before rendering, exact input preservation, receipt identity, and
  executor-scoped PostgreSQL claim predicates.
- Twelve server/access tests cover exact executor selection, no silent
  substitution, browser-only holds, missing custody, valid custody projection,
  and inherited Capture release state.
- Six executor-storage tests and three local derivative route tests prove that
  an online remote Mac is insufficient: the serving process must own the same
  canonical filesystem scope.
- The Episode Editor component suite confirms the named executor and locality
  disclosure are visible and that queueing sends the exact planned node.
- The cache-disabled production Next.js build passed all 194 routes and the
  bundled media-processor build passed. The isolated 250 MB Next build output
  was removed afterward; no source or retained media was deleted.
- After the Advanced Studio integration, 30 focused handoff, UI, contract,
  authorization, and worker tests pass. Strict web TypeScript passes, and a
  second cache-disabled production build emitted its build ID, standalone
  server, static assets, 110 page modules, and 222 route modules. Its isolated
  70 MB build directory was removed afterward.

## Next boundary

Advanced Studio now receives the entire freshly authenticated Episode payload
only after its branch revision, branch fingerprint, timeline fingerprint, and
source-projection fingerprint match the handoff. Its former generic export
dead end is replaced by the same side-effect-free exact-source plan used by the
Episode workspace. The playhead is frozen when the creator opens readiness;
the plan names the Mac, source count and bytes, quality, cost, and locality.
Only an explicit action queues the exact planned executor, and Advanced Studio
follows the durable job through server verification to protected playback.

This remains deliberately a review-render boundary. Advanced Studio states
that unsaved experiments are not silently included and that a proof is not a
final master. The next product slice is final conform: a generation-locked full
source manifest, verified promotion where portable object storage is selected,
complete output and sync validation, explicit approval, and a distinct publish
action. Google Drive remains an external source vault, not the authority for
mutable in-progress render outputs.
