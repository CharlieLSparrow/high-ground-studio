# Transcript worker activation readiness

Date: 2026-08-01
Status: production release path hardened; provider activation held on one human-owned secret

## Outcome

Quipsly already owns the durable transcript queue, generation-bound media
manifest, provider-response receipt, normalized timed-word result, consent
reconciliation, protected correction desk, packet snapshot, and explicit
task/goal/writing review paths. The remaining production defect was not another
transcript UI. It was the release seam between that application contract and
the dedicated Cloud Run worker.

The worker release now maps one full committed SHA to one registry tag, reads
and validates its digest before deciding to build, reuses an existing exact-
source image, rejects any tag that does not equal that full source identity,
refuses immutable-tag replacement, and deploys the Job by digest. Every exit
path distinguishes true not-found from registry authorization or service
failure.

The canonical zero-traffic Nest release now supports an explicit
`ENABLE_TRANSCRIPT_WORKER=1` gate. It refuses activation unless:

- the Deepgram secret has an enabled version;
- the worker Job uses an immutable image digest;
- the Job uses the dedicated worker service account;
- its media bucket, committed build identity, and secret reference match;
- the key is not exposed as plaintext environment state; and
- Nest has `roles/run.jobsExecutor` without
  `roles/run.jobsExecutorWithOverrides`.

Only then does the preview receive the four worker-routing environment values.
The release remains at zero traffic and must pass the normal authenticated
smoke and promotion boundary.

## Operated cloud readback

- Selected Google credentials and ADC tokens work.
- ADC initially lacked a quota project. Setting it to `quipsly-reef` restored a
  successful Firebase Admin `listUsers(1)` authorization check.
- Transcript storage folders and the worker/Nest append-only policies pass the
  existing least-privilege preparation audit against
  `high-ground-odyssey-media`.
- The dedicated worker service account exists.
- The `quipsly-deepgram-api-key` Secret Manager resource exists but contains no
  enabled version.
- No `quipsly-transcript-worker` Cloud Run Job exists.
- The real activation gate stopped on the missing provider version before
  materializing a release context, running Cloud Build, deploying a Job or Nest
  revision, calling Deepgram, or touching PostgreSQL.

## Verification

- Worker behavior, cloud-fixture, and release tests: 13/13.
- Preview, release-pipeline, and canonical-entrypoint tests: 20/20.
- The complete Nest regression passes 218 suites / 1,118 runnable tests; 35
  suites / 105 tests remain deliberately environment-gated.
- Media-package typecheck/build, worker typecheck/build, Nest typecheck, and the
  optimized Next production build pass.
- Both changed shell entry points parse, `git diff --check` passes, and the
  bounded transcript-worker release context materializes as 23 files / 0.8 MiB
  from one committed source.
- Final cloud readback still reports zero enabled provider-secret versions and
  no worker Job. The newest Cloud Build predates this operation, independently
  confirming the failed activation check purchased no build.

## Exact loop-back trigger

The account owner must create or retrieve the authorized Deepgram API key and
add it as an enabled version of `quipsly-deepgram-api-key` in project
`high-ground-odyssey`. The value must not be pasted into Codex, git, a command
argument, or shell history.

After that version exists:

1. deploy the committed worker SHA;
2. apply and read back `PHASE=activate` worker access;
3. execute the authorized short cloud fixture and prove no-billable-call replay;
4. deploy an exact-source zero-traffic Nest preview with
   `ENABLE_TRANSCRIPT_WORKER=1`;
5. prove consent revocation creates zero disclosed transcript rows, then restore
   consent without another provider call;
6. complete authenticated preview and production readback; and
7. run real podcast and coaching recording-to-review-to-Studio workflows.

This checkpoint does not claim a provider call, transcript accuracy, human
playback review, physical-iPhone capture, production activation, or completed
episode/coaching acceptance.
