# Exact-generation cloud spectral evidence checkpoint

Date: 2026-08-05

## Outcome

Quipsly now materializes the high-resolution spectral evidence pyramid from a
private GCS source without treating provider recording, a mutable object name,
or a client-supplied byte range as authority. The implementation is committed
at `d3f9f46dea3a7c0a70fda3390d8bb7ce5481ba7f`.

The processor lane:

- consumes a create-once manifest bound to exact source generation, SHA-256,
  size, project, asset, and analyzer contract;
- fully downloads and rehashes that generation before analysis;
- writes one deterministic `.qspx` pack with a GCS generation precondition;
- performs a full exact-generation pack readback and rehash;
- verifies that the source generation and hash are still unchanged;
- publishes durable result, retry-lease, or dead-letter evidence without
  weakening any other media lane.

Nest re-inspects both objects before completion. Authenticated tile requests
resolve one declared level and tile index into one server-owned exact-generation
range read. Source paths, pack paths, hashes, identities, leases, arbitrary
offsets, and public URLs are not client inputs.

## Real storage proof

The credentialed `high-ground-odyssey-media` fixture used an 11-second source
and produced:

- overview: 1 tile at 300 seconds;
- browse: 1 tile at 30 seconds;
- detail: 3 tiles at 5 seconds;
- total pack: 491,520 bytes.

Full pack SHA-256, exact-generation range bytes, unchanged source hash,
create-once result replay, and all-version cleanup passed. Independent listings
found no retained source, control, or output fixture versions. Managed folders
now cover `media-vault/control/audio-spectral-evidence/` and
`media-vault/spectral/`; the processor has scoped create/read authority and
Nest has read-only output authority. Cloud Scheduler remains disabled by
contract and provider room recording remains optional.

## Remaining release boundary

This proves committed code and real GCS semantics, not the deployed processor
image or a physical multi-device take. Build/deploy stays cadence-gated. After
deployment, the acceptance run must preserve a browser and iPhone source in one
capture group, inspect opening and later drift, fetch private spectral tiles,
and play the assembled Session result.

