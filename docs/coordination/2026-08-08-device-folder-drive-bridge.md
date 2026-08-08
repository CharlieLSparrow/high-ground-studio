# Device Folder and Drive-for-desktop Bridge

**Date:** 2026-08-08
**Status:** implemented locally; native account handoff and explicit folder grant remain for hands-on acceptance

## Outcome

Quipsly Studio can now follow a user-granted Mac folder into the same canonical
Nest external-media library used by Google Drive. This is the cheap hybrid path
for large Insta360 archives:

1. Google Drive for desktop or another creator-owned volume retains the source
   files.
2. The Mac performs a bounded metadata scan only. It does not read media bytes,
   hydrate streamed originals, upload files, or calculate whole-file hashes.
3. Nest receives opaque device, grant, folder, and file identities plus safe
   display names, sizes, timestamps, and package health.
4. The Mac stores only relative file locators in a permission-restricted local
   ledger beneath Application Support. Nest never receives an absolute path.
5. Exact-byte source sets, proxies, and renders remain unavailable until an
   explicit local conform or preparation operation reads and verifies the
   required bytes.

This is one provider-neutral library ledger, not a second media database.
Missing observations remain reversible `not-observed` state and never delete
sources, cards, ranges, placements, or revisions.

## Product boundary

| Evidence | Nest may do | Mac may do |
| --- | --- | --- |
| Folder metadata observation | Show inventory, ready/held packages, changes, and collaboration context | Refresh the user-granted folder |
| Metadata-bound source revision | Organize the source unit; keep it unavailable for exact render work | Resolve its relative locator behind the grant |
| SHA-256 verified bytes | Bind an immutable source set and downstream provenance | Hash, conform, proxy, analyze, or render after an explicit operation |

The first database operation deliberately attempted to create a source set from
size/timestamp evidence. The canonical source-set guard rejected it with
`source-set-member-unverified`. The implementation was corrected to retain the
useful source/library projection while deferring source-set creation until
exact byte evidence exists. This is a validated trust boundary, not paperwork.

## UX

The existing **External originals access** panel now includes:

- an explicit Nest destination picker sourced from the verified native account;
- **Follow in Nest**, separate from **Match lanes**;
- a progress message that says the scan reads names and metadata but does not
  download or upload originals;
- a receipt summary for file count, ready packages, held packages, source
  members, revision, and the exact-byte follow-up boundary.

Nest now labels these libraries **Mac folder**, not Drive. It suppresses Drive
refresh, cloud transfer, browse preparation, and final-quality Drive conform
controls, and directs creators back to the granting Mac for those operations.

## Real Drive evidence

The user-supplied shared parent was re-inspected read-only through the connected
Drive account. On 2026-08-08 it contained:

- 8 immediate `-Original` capture folders;
- 33 visible media files;
- 440,033,618,057 bytes of observed media metadata;
- 16 complete non-zero INSV/LRV pairs;
- 2 currently empty capture folders;
- 1 zero-byte LRV;
- 8 held expected segments after folder-name expectations are included.

No media was downloaded, uploaded, renamed, moved, shared, or changed. The
snapshot differs from the earlier 30-file/13-ready observation, which is useful
evidence that the intake model must support incremental and in-flight uploads.

## Verification

- Device-folder contract and package tests: pass.
- Source-library UI tests, including no misleading Drive operations: pass.
- Quipsly TypeScript: pass.
- Disposable PostgreSQL operation: pass for canonical references, source unit,
  source/library replay, provider-neutral projection, path withholding, held
  zero-byte refresh, and no deletion of earlier references.
- Signed Quipsly Studio Debug build: pass; Team and Keychain entitlement
  verification pass; launched app agent health is `ok`.
- Native UI acceptance is open because browser automation cannot dispatch the
  registered `quipslymac://` custom-scheme callback. The already signed-in
  one-use handoff page was left open for one human click. After that, grant or
  restore the intended Drive-for-desktop folder and press **Follow in Nest**.

## Next slice

The next mature step is not automatic raw-media hydration. It is an explicit
Mac preparation queue that:

- estimates transfer and disk impact before a streamed file is touched;
- lets the creator choose LRV-only browse preparation or exact INSV conform;
- hashes exact bytes, registers a local replica without publishing its path,
  and only then binds the immutable source set;
- creates resumable proxies, contact sheets, waveforms, and 360 reframing
  artifacts with visible provenance and cancellation/recovery receipts;
- reports device availability so collaborators know whether a local-only source
  can currently be prepared or rendered.
