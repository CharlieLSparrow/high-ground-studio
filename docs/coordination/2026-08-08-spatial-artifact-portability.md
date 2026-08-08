# Spatial artifact portability and executor custody

Date: 2026-08-08

## Decision

Quipsly now treats a 360 edit as two different kinds of product truth:

- source ranges, timeline placement, and the reversible pan/tilt/roll/FOV recipe
  are portable canonical intent;
- exact INSV replicas, reviewed equirectangular stitch masters, and rendered
  flat reframes are executor-local bytes until an explicit object-storage
  promotion creates a portable artifact.

The shared media package defines `executor-local` and
`portable-object-storage` authority. Spatial contract v2 uses the first form
at every local byte boundary and deliberately does not imply that a local file
has been promoted to cloud storage.

## Enforced path

1. The queue selects one fresh online local executor and opaque storage scope.
2. Every required INSV member and reviewed stitch master must have exact
   custody on that executor. A trusted-looking absolute path is no longer
   sufficient render authority.
3. Spatial job identity freezes the execution target alongside the portable
   recipe and source/timeline fingerprints.
4. PostgreSQL claims match both node and storage scope, so a worker cannot
   steal a path-bearing job addressed to another Mac.
5. Worker receipts repeat the same custody for stitch output, reframe output,
   and worker identity. Cross-scope results fail contract validation.
6. Registration retains custody on `StudioMediaDerivative`; provenance names
   the artifact `executor-local` while preserving the recipe and source
   evidence needed to rematerialize it elsewhere.
7. Source Story queries and local derivative playback resolve against the
   selected/current executor. Paths remain withheld from browser projections.

## Proof

- Shared package, media processor, and web TypeScript checks pass.
- Fifteen focused spatial contract, verifier, and filesystem worker tests pass.
- The local derivative route has a three-test custody and path-security suite.
- The 17-test PostgreSQL Source Story journey passes. Its second online Mac has
  no access to the first Mac's reviewed stitch master, cannot queue from it,
  and does not inherit the resulting derivative.
- The PostgreSQL derivative readback retains the exact custodian, storage
  scope, and `executor-local` provenance.

## Remaining boundary

Episode proof renders still use an older local-only contract. They must adopt
the same execution-target and portability authority before Advanced Studio can
truthfully combine conventional camera media and 360 reframes across Macs.
Portable object promotion and cloud rendering remain later, explicit actions;
this slice does not claim those bytes moved.
