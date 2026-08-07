# Followed Google Drive library

**Date:** 2026-08-07
**Status:** Local implementation and PostgreSQL operation complete; real OAuth
selection and production preview remain acceptance gates.

## Outcome

A user-selected Google Drive folder is now durable Quipsly product state rather
than a one-time import gesture. Source Room can show the library's safe current
inventory, ready and held Insta360 segments, latest successful scan, files not
observed on the latest scan, and whether the current collaborator owns the
credential required to refresh it.

Google Drive remains the source vault. The new state stores provider identity
and reconciliation evidence; it does not copy originals, publish a Drive URL,
or grant one collaborator use of another person's OAuth credential.

## Research decision

Google Drive provides both full listings and a change feed. Change tokens are
valuable as a later optimization, but notification and token delivery are not
source truth. The selected-folder full scan is the current correctness
baseline. A future change-feed worker may decide *when* to refresh; it must not
decide that canonical Quipsly source history should be deleted.

The connection keeps the non-sensitive `drive.file` scope and Google Picker
selection boundary. Shared-drive requests use `supportsAllDrives` and
`includeItemsFromAllDrives`. No broader whole-Drive scope is required.

Primary references:

- <https://developers.google.com/workspace/drive/api/guides/manage-changes>
- <https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list>
- <https://developers.google.com/workspace/drive/api/guides/api-specific-auth>
- <https://developers.google.com/workspace/drive/api/guides/picker>
- <https://developers.google.com/workspace/drive/api/guides/enable-shareddrives>

## Domain model

- `StudioExternalMediaLibrary` is the current followed-root projection. The
  root locator and resource key are server-only.
- `StudioExternalMediaLibraryItem` retains every observed provider object,
  including unrecognized files. State is reversible: `present` or
  `not-observed`.
- `StudioExternalMediaLibraryOperation` is the append-only attach, refresh, and
  disconnect ledger. Its shared snapshot contains counts and fingerprints, not
  provider object IDs.

An observation binds to an external reference and source unit when the object
is a recognized camera-package member. An unrecognized file still participates
in inventory reconciliation without being misrepresented as editable media.

## Invariants

1. Refresh can create new observations and immutable source revisions.
2. Refresh can update a current capability projection when provider evidence
   changes.
3. Refresh cannot delete an external reference, source revision, range, card,
   storyboard placement, or source unit.
4. A missing object becomes `not-observed` and increments an observation count.
5. A returning object becomes `present` and resets that count.
6. A previously non-empty library receiving an empty listing is inconclusive;
   Quipsly preserves the prior successful inventory and changes nothing.
7. Only the OAuth connection owner can refresh. Existing editorial work remains
   visible to authorized Nest collaborators.
8. Disconnect deletes the encrypted credential and moves both references and
   followed libraries to `needs-reauth` without deleting editorial history.

## Operated proof

The local PostgreSQL operation used a disposable owner, collaborator, project,
Drive connection, and evolving 360 package:

- attached one complete INSV/LRV segment;
- replayed the identical request without another receipt;
- changed the LRV revision and size;
- introduced a second complete segment;
- omitted the first original and observed it remain as `not-observed`;
- restored that original and observed it return to `present`;
- read the library as another user and proved refresh authority was withheld;
- proved serialized client state contained neither the root ID nor resource
  key;
- disconnected Drive and proved the library advanced to `needs-reauth` with a
  fourth append-only operation.

The fixture was removed by cascading the disposable project. Original media
was never involved or mutated.

## Open gates

- select the supplied real 360 folder through Quipsly's own OAuth and Picker;
- perform a retained refresh after a real file finishes syncing;
- interrupt and resume one real LRV transfer;
- restart the worker during that transfer and prove recovery;
- play the collaboration proxy and mark a range as a second account;
- conform one original package and render from exact local replicas;
- add explicit cache pinning and recoverable eviction.
