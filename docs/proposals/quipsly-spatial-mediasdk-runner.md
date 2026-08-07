# Quipsly licensed spatial stitch runner proposal

Status: proposal only, 2026-08-07. No provider resources or paid services have been activated.

## Decision requested

Approve these two reversible preparation steps:

1. Apply for an Insta360 Desktop MediaSDK license for Quipsly and obtain the current Ubuntu 22.04 x86_64 package and redistribution terms.
2. Build the licensed adapter against Quipsly's existing `spatial-stitch-master` receipt contract, first in an isolated local Linux/GPU acceptance lane. Do not deploy a cloud runner until its output matches the reviewed Insta360 Studio master on retained footage.

A later, separate approval would activate the optional Cloud Run GPU Job described below.

## Why this boundary

The official Insta360 Desktop MediaSDK 3.x repository says that the SDK:

- stitches INSV panoramic media and exports MP4;
- supports current consumer cameras including X3, X4, X4 Air, and X5;
- targets Windows x64 and Ubuntu 22.04 x86_64;
- requires a GPU in version 3.x;
- is obtained through Insta360's SDK application process.

Sources:

- [Insta360 Desktop MediaSDK-Cpp](https://github.com/Insta360Develop/Desktop-MediaSDK-Cpp)
- [Insta360 SDK application](https://www.insta360.com/sdk/apply)

Quipsly already freezes the exact source set, output profile, stitch settings, byte hashes, review evidence, and final receipt. The licensed adapter therefore replaces only the implementation that produces the 5760x2880 stitch master. It does not change Story cards, Episode placements, reframing recipes, the web editor, or local rendering.

## Execution ladder

### Lane A: creator Mac, available now

- Browse and organize from the lightweight proxy in Quipsly.
- Export one full-resolution equirectangular master from Insta360 Studio.
- Verify, seal, and register it locally.
- Render 720p review proofs and 4K edit sources on the creator's Mac.
- Cloud GPU cost: $0.

This remains a supported path after cloud automation exists. It is also the disaster-recovery path if provider capacity, credentials, or SDK licensing changes.

### Lane B: licensed acceptance executor

- Ubuntu 22.04 x86_64 with one supported NVIDIA GPU.
- No public endpoint and no standing worker.
- Reads a frozen job manifest and exact INSV members from an isolated test vault.
- Produces the same 5760x2880 HEVC stitch-master receipt as Lane A.
- Must pass byte-drift, complete-decode, duration, frame-rate, projection, and retained-footage visual acceptance before cloud packaging.

### Lane C: optional scale-to-zero cloud job

- Cloud Run Job, not a request-serving Cloud Run service.
- One NVIDIA L4, 4 vCPU, 16 GiB, non-zonal redundancy, parallelism 1.
- Starts only for an explicitly queued cloud stitch; scales to zero afterward.
- Materializes the exact source package into same-region object storage for the job. A Drive URL is identity and origin evidence, not a seekable render filesystem.
- Writes the stitch master and canonical receipt to same-region object storage.
- Quipsly verifies and registers the result through the same workflow state machine used locally.
- Original-package staging receives a short lifecycle; retained originals remain in the creator-owned vault unless the user explicitly elects Quipsly-managed storage.

Google documents Cloud Run GPU Jobs as an on-demand background-video-processing option with one GPU per instance. The L4 minimum is 4 vCPU and 16 GiB. [Cloud Run GPU Jobs](https://docs.cloud.google.com/run/docs/configuring/jobs/gpu)

## Cost envelope

Current listed Tier 1, non-zonal L4 rates are:

| Resource | Rate per second | Proposed allocation |
| --- | ---: | ---: |
| NVIDIA L4 | $0.0001867 | 1 |
| CPU | $0.000018 per vCPU | 4 vCPU |
| Memory | $0.000002 per GiB | 16 GiB |

The resulting compute ceiling is approximately **$0.0002907 per running second**, or **$1.05 per runner-hour**, before ephemeral disk, storage, network transfer, build/registry, tax, or SDK licensing charges. Source: [Cloud Run pricing](https://cloud.google.com/run/pricing).

Illustrative compute-only cost per one hour of source footage:

| Stitch runtime | Cost |
| --- | ---: |
| 15 minutes | $0.26 |
| 30 minutes | $0.52 |
| 60 minutes | $1.05 |
| 120 minutes | $2.09 |

Those are planning bounds, not measured performance claims. The acceptance executor must benchmark retained X3 footage before Quipsly displays an estimate to a user.

## Spend and safety controls

Cloud activation must include all of these controls:

- concurrency and parallelism fixed at 1 for the first release;
- scale-to-zero only; no minimum instances and no continuously running GPU worker;
- dispatcher-side per-job byte, duration, and estimated-cost limits;
- a maximum execution timeout and a kill path for stalled jobs;
- idempotent job identities so retries cannot silently double-charge;
- a project daily compute ceiling enforced by Quipsly, in addition to Google Cloud budget alerts;
- a monthly budget alert at 50%, 80%, and 100%; alerts are observability, not the enforcement boundary;
- same-region staging and outputs to avoid unnecessary transfer;
- lifecycle deletion for temporary originals and failed partial outputs;
- output registration only after exact-source re-hash and complete decode;
- cost, runtime, adapter version, source bytes, and output bytes recorded on every receipt.

## Google Drive role

For ordinary video, Quipsly can retain a Drive file ID and immutable revision evidence, create a lightweight collaboration proxy, and fetch the original only for final render. The Drive API supports downloading stored blob content with `files.get` and `alt=media`; file capabilities and revisions must be checked before work is accepted. [Drive files.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get)

For an Insta360 camera package, both required INSV members must be materialized together before stitching. Quipsly should not pretend that Drive is a low-latency frame server or mount it as the rendering filesystem. This preserves the cheap creator-owned source vault without making render correctness depend on opportunistic network seeks.

## Acceptance before activation

The cloud job is not production-ready until it proves all of the following on retained media:

1. Same exact INSV package and stitch settings as the reviewed local control.
2. Expected 2:1 projection, dimensions, duration, frame rate, stabilization, horizon, and audio.
3. Complete output decode without concealed FFmpeg errors.
4. Visual seam and horizon review at representative points.
5. Retry and cancellation do not duplicate derivatives or leak partial files.
6. Source mutation during processing fails closed and removes the output.
7. Measured wall time, GPU time, staging bytes, output bytes, and total provider cost appear in the receipt and Quipsly operations UI.
8. A local job can take over the same frozen manifest if cloud execution is unavailable.

## Recommendation

Proceed with the SDK application and isolated adapter now. Keep the current reviewed-Studio/local-render path as the production default. Activate one scale-to-zero L4 Cloud Run Job only after the retained-footage parity suite passes and the measured cost is visible inside Quipsly.
