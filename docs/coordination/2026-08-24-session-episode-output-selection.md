# Session-owned Episode output selection

Date: 2026-08-24

## Outcome

The existing Session output graph is the canonical place to choose which
reviewed bytes become an Episode package candidate. Recording Quality remains
asset-scoped: a recording can be reused, repaired, compared, or retained
without pretending it owns Episode identity. The Session supplies the bound
canonical Episode, its multitrack program or exact single-source branches, the
append-only selection history, and the open metadata/hosting/publication facts.

The audited implementation already provides:

- immutable Session source to reviewed master to encoded AAC to proof-listen to
  output-packet lineage;
- a preferred promoted multitrack Episode program without erasing single-source
  repair branches;
- separate exact-byte approval and packet selection;
- reversible selection and append-only withdrawal history;
- stable Episode GUID and packet digest;
- explicit incomplete metadata and public-enclosure facts; and
- no upload, RSS mutation, or publication side effect from selection.

## Episode lineage repair

Packet selection previously proved that an asset was attached to the Nest but
did not independently prove that it belonged to the requested Episode. A
crafted API request could therefore attempt to package a proof-listened asset
from another Episode in the same Nest.

The server now requires one of two canonical associations before it reads
delivery approval or begins a transaction:

1. derivative attachment metadata names the exact Episode production; or
2. retained capture attachment metadata names a Call Room whose current
   project and Episode binding both match the requested Episode.

Older retained attachments that carry only their canonical Recording Asset ID
remain compatible: the service follows that row to its Call Room and requires
the same project/Episode match. It does not trust an unattached filename, URL,
or label as lineage.

An unbound or cross-Episode asset fails with
`PODCAST_PACKET_ASSET_EPISODE_MISMATCH`. No approved-delivery loader, output
packet write, or selection receipt runs after that failure. Program-mix assets
use their exact server-written Episode production identity and do not fall
back to a room lookup.

## Ambiguous browser response recovery

Session packet selection, withdrawal, and encoded-program review now use a
small in-memory request journal. One user intent retains its stable request UUID
and exact request body until Nest acknowledges it. Retrying after a dropped
response therefore cannot silently create a second selection or change a
timestamp inside proof-listening evidence.

A full reload does not persist browser mutation intent across accounts. It
instead reloads canonical server selection state, which is the safer recovery
source. This avoids putting account-partitioned production decisions in shared
browser storage.

## Evidence and limits

- 17 focused packet service, route, graph, and request-journal tests pass.
- The request-journal test proves identical UUID and timestamped body reuse,
  distinct intent isolation, and post-acknowledgement replacement.
- The service test proves another Episode's asset is rejected before reading
  approved delivery evidence or writing packet/selection records.
- Strict Quipsly TypeScript passes.

This is local service and component evidence. An authenticated two-Episode
browser flight should later create approved artifacts in one Nest, attempt the
wrong Episode coordinates, select the correct program, simulate a lost
response, refresh, and verify one current packet plus append-only history. No
deployment, upload, hosting, RSS change, or publication was performed here.
