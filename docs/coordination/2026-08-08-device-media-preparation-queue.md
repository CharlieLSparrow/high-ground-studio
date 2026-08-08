# Device-folder browse preparation and Nest visibility

Date: 2026-08-08

## Outcome

Quipsly Studio can now turn a followed Drive-for-desktop or external-device
Insta360 library into exact, locally retained browsing media without copying
full-resolution INSV originals into Quipsly storage.

The user first follows a granted folder. Nest keeps provider-neutral package
identity and health. The Mac then exposes an explicit **Prepare browse media**
operation for the LRV companions in complete packages. That operation:

1. resolves the opaque file identity through the private Mac-only locator
   ledger;
2. rechecks the source byte count and modification time;
3. checks the active worker volume while preserving a 10 GB reserve;
4. streams the file in 4 MiB chunks to a private partial file while computing
   SHA-256;
5. fsyncs, permissions-hardens, and atomically publishes the exact local
   replica;
6. rechecks the source after the copy and submits a path-free receipt; and
7. asks the existing local proxy pipeline to build collaboration video,
   visual navigation, and audio navigation.

Completed items survive retry. A matching-size existing local replica is read
in lockstep with the currently granted source, compared byte for byte, and
hashed before reuse. Partial files are removed on cancellation or failure. The
source file is never opened for writing.

## Trust boundary

The API does not trust a Mac-provided path or an arbitrary checksum receipt.
Registration must match all current server facts:

- Nest and library;
- library creator and current actor;
- Mac installation and security-scoped folder grant;
- present inventory item and opaque external file identity;
- attached reference and immutable source revision;
- observed device metadata revision and byte count;
- browse-proxy package role; and
- a deterministic relative locator computed by the server.

The database retains only the relative worker locator. Local source paths stay
in the Mac ledger. A receipt conflict, stale observation, path traversal,
absolute path, size drift, or checksum contradiction fails closed.

## Storage model

- Google Drive or an external drive remains source truth.
- Only the lightweight LRV is copied during browse preparation.
- The local replica is exact source bytes, not a derivative.
- The collaboration proxy, contact sheet, and audio navigation are separate
  append-only derivatives.
- Full-resolution INSV members remain in place until an explicit conform or
  render workflow is approved.
- An active durable Quipsly workspace is preferred. Development falls back to
  the same temporary worker root used by the local media worker and clearly
  remains a non-production storage mode.

## Collaborative UX

The followed-library card in Nest now reports five distinct stages for a
device library: exact LRV, collaboration proxy, visual map, waveform, and
complete browsing readiness. The browser can inspect progress but cannot start
a Drive or server transfer for device-folder media. Preparation remains on the
Mac that owns the folder grant.

## Verification

- Device preparation and folder contracts: 10/10 tests passed.
- Source-picker/component suite plus contracts: 18/18 tests passed.
- Real PostgreSQL device-folder integration: 1/1 passed, including canonical
  attachment, exact replica registration, device-backed proxy queueing,
  readiness projection, replay safety, and path withholding.
- Local external proxy worker: 4/4 passed, including a real relative LRV beneath
  the worker root and source-byte preservation.
- Quipsly and media-processor TypeScript checks passed.
- Quipsly production web build passed (194 static pages generated).
- QuipslyMac Debug compilation passed without signing.
- Launch-boundary testing caught that manually signing the unsigned artifact
  was insufficient: AMFI rejected its restricted keychain entitlement because
  the bundle did not contain a matching provisioning profile.
- The existing valid Mac team profile was installed into Xcode's standard
  local profile store. Automatic signing then selected Apple Development team
  `585GUXMY5M`, embedded profile
  `7a3c1c7a-6874-45b7-b385-6d6e990e3a8a`, and produced an app that passed
  strict deep validation, launched, and returned the Quipsly Studio
  accessibility surface from the exact built bundle.

The real LRV operation remains intentionally held. The system volume has only
about 2.7 GB available, `/Volumes/My Passport` has about 61 GB available and is
99% full, and no durable Quipsly media workspace is active. The 10 GB reserve
would therefore stop preparation rather than creating a fragile temporary
replica. No supplied 360 media was copied or changed.

## Next production slice

1. Activate a roomy dedicated SSD-backed Quipsly media workspace, then operate
   the new button against the real followed folder after the user
   grants/restores the folder.
2. Let the worker complete proxy, visual, and audio jobs for a bounded LRV and
   read the finished artifacts back in Nest.
3. Add an explicit original-verification/conform mode that hashes INSV members
   in place or retains them only after a separate storage review.
4. Bind a complete Insta360 source set only after every required member has
   exact-byte evidence and the browsing clock has measured duration.
5. Connect source-set ranges to the storyboard and episode editor while
   preserving Drive/external-device originals as source truth.
