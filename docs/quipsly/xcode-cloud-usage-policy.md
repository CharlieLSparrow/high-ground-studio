# Xcode Cloud usage policy

Last verified: 2026-08-05

Xcode Cloud is corroborating clean-room evidence, not Quipsly Capture's main
development loop or its only TestFlight delivery path.

## Incident and correction

The original workflow ran a clean iOS, macOS, and visionOS archive on every
branch change. That shape was reasonable as a generated first workflow but was
not reasonable for a high-velocity monorepo. In the newest 200 Xcode Cloud
records on August 5, 47 builds had started and 153 later pushes were canceled
before starting after the monthly limit was reached.

The workflow is now named **Manual iOS Clean-Room Release**, has no automatic
branch/tag/pull-request/schedule condition, contains one required iOS archive,
and is disabled through the August 16 renewal. Deactivation preserves workflow
and build history. It is not deletion or disconnection.

## Evidence ladder

1. Run static contracts, unit tests, and focused UI journeys locally while a
   feature is moving.
2. At a coherent checkpoint, materialize one committed SHA and run the full
   serialized UI suite plus signed archive/export locally.
3. Upload that exact qualified archive directly to App Store Connect when a
   tester-facing change is worth installing. TestFlight does not require an
   Xcode Cloud build.
4. Use the manual Xcode Cloud iOS workflow for occasional independent
   clean-room corroboration: a major release candidate, a toolchain change, or
   a scheduled weekly health check while quota remains.
5. Add macOS or visionOS actions only when those products have their own
   release candidate and acceptance plan.

This preserves fast iteration without abandoning the independent environment
that Xcode Cloud usefully provides.

## Guardrail

Run the checked-in read-only audit before enabling or editing the workflow:

```bash
pnpm quipsly:xcode-cloud:audit -- --strict --expect-disabled
```

It fails closed when an automatic start condition, non-iOS action, multiple
actions, or an unexpectedly enabled held workflow appears. It also reports the
latest 200 build-run outcomes without printing the App Store Connect key.

Apple Developer Program membership currently includes 25 compute hours per
month. Parallel tasks each consume compute time; unused hours do not roll over.
The next paid tier is 100 hours for US$49.99/month. Quipsly should not upgrade
merely to compensate for an over-broad trigger. Reconsider a paid tier only
when deliberate clean-room jobs regularly consume the free allowance.

Official references:

- <https://developer.apple.com/xcode-cloud/get-started/>
- <https://developer.apple.com/documentation/xcode/xcode-cloud-workflow-reference>
- <https://developer.apple.com/documentation/appstoreconnectapi/workflows>
