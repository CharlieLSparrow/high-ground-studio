# Quipsly Capture uniform-IAM production repair

**Date:** 2026-07-28  
**Source:** `f15fe8f40395cfafdbe3650c4e9608ebbea30ee8`  
**Production revision:** `studio-00416-moz`  
**Status:** root cause repaired, exact preview smoked, immutable revision
promoted to 100%, production readback passed; physical TestFlight capture
rehearsal remains open

## Incident boundary

The real native production recovery run reached Nest successfully but did not
complete its media upload. This was not an iOS recording, retry, or local
outbox defect.

The first run, local recording
`2B3BB60E-C127-481B-8819-C90022FC7986`, proved that the Cloud Run service
account could not create an object in `gs://high-ground-odyssey-media`.
Bucket readback showed uniform bucket-level access enabled and only
`roles/storage.objectViewer` assigned to the Nest service account.

After applying least-privilege managed-folder IAM, the second run, local
recording `CEF7ADE3-471E-4C09-8476-7194E9F97B0F`, received HTTP 201 from Nest
and persisted its resumable-control manifest. The direct GCS session then
returned HTTP 400:

`Cannot insert legacy ACL for an object when uniform bucket-level access is enabled.`

The server created its resumable upload with `private: true`. That option asks
Google Cloud Storage to apply a legacy object ACL, which is invalid when
uniform bucket-level access is authoritative.

## Production architecture

Capture privacy is now enforced only through uniform IAM:

| Managed folder | Nest service-account capability |
| --- | --- |
| `media-vault/recordings/` | `roles/storage.objectCreator` and `roles/storage.objectViewer` |
| `media-vault/control/mobile-capture-resumable/` | `roles/storage.objectUser` |
| `media-vault/control/mobile-capture-verification-queue/` | `roles/storage.objectUser` |

Nest can create immutable recording objects and inspect them, but cannot
overwrite or delete those recordings. It can update only the two control
folders that require resumable-session and verification-queue state. No
bucket-wide object-admin role or per-object ACL participates in the contract.

`apps/quipsly/src/lib/server/mobile-capture-resumable-store.ts` no longer asks
for `private: true` or any `predefinedAcl`. The contract test rejects either
legacy-ACL option. `scripts/release/quipsly-nest-media-access.sh` applies or
audits the exact managed-folder policy, understands both current and legacy
gcloud uniform-access schemas, and is mandatory in the Nest release preflight.

## Verification

Before deployment:

- resumable-upload contract: 9/9 passed;
- release-pipeline contract: 8/8 passed;
- Quipsly TypeScript check passed;
- release shell syntax passed;
- live managed-folder IAM apply/readback passed.

The exact committed source was materialized into a bounded 1112-file,
110.9-MiB release context. Cloud Build
`989ceb8a-4483-4490-b951-621ac7f6f482` succeeded and verified all six required
Quipsly route bundles in the built image.

No-traffic revision `studio-00416-moz` then passed:

- source/release-channel identity readback;
- exact committed production compilation and 150-page static generation;
- uniform-IAM managed-folder access preflight;
- production recovery and Firebase Admin gates;
- public health, privacy, support, and configured-host checks;
- authenticated Firebase login/session/logout;
- database-backed project, Nest, recorder, and synthetic reviewer Session;
- all 104 production mobile Capture contract checks.

The preview tag was re-resolved after smoke to prevent a mutable-tag race.
Traffic was promoted by immutable revision name. Post-promotion production
readback proved `studio-00416-moz` at 100%, healthy Cloud SQL, domain
certificate/routing, public routes, all 104 mobile checks, and no recent
billing-disabled errors.

## Remaining evidence

The server boundary is repaired and live. Completion still requires the
TestFlight-installed Build 6 to perform a new consented recording, force local
process death, recover and play it while offline, reconnect, complete the
uniform-IAM upload and verification sequence, and read the same recording
identity from Nest/Studio. The earlier held recordings remain incident
evidence and must not be relabeled as successful physical-device proof.
