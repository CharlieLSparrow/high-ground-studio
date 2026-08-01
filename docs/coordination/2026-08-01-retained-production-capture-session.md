# Retained production Capture session

Date: 2026-08-01

## Outcome

Quipsly now has one durable, private production QA identity and one explicitly
named podcast Session for longitudinal Capture testing. The account is a
verified synthetic `.test` user whose password remains in macOS Keychain. The
Session is intentionally retained so later TestFlight builds can prove the
same login, Session history, consent transition, recording, upload, transcript,
timeline, notes, tasks, goals, and tags without manufacturing a fresh world for
each test.

This checkpoint operated real production application state. It did not grant
another person's consent, join a provider room, start a recording, send an
invite, create a calendar event, charge Stripe, or publish anything.

## Exact production and client identities

- Nest source: `811a29db16d1493032b2ccc285438bd5b45854ab`
- Cloud Run revision: `studio-00486-son`
- Cloud Run platform image digest:
  `sha256:a4b015fb43779799b1159c86073e75a086d1f20ed70f9fb3f90642de3081f9be`
- Capture source: `4ef8ddbacbba7949b16607d8dae5454ff28e9082`
- TestFlight version/build: `1.0 (25)`
- App Store Connect build: `bacb25d1-1e0a-40aa-90a3-3e7cd195ee33`

## Retained Session truth

- Title: `QA Retained · Capture Build 25 longitudinal session · 2026-08-01`
- Session/call-room ID: `cmsa2xxoo001i01s639zmnn5u`
- Purpose/status: `PODCAST` / `PLANNED`
- Participant ID: `cmsa2xxp5001j01s6s7bo95a4`
- Consent receipt ID: `cmsa2xxpt001k01s6wf55prxq`
- Consent state: `GRANTED` for the dedicated synthetic participant; transcript
  consent remains off
- Capture state: `ready-provider`; `canRecordNow=true`
- Provider readiness: `livekit-ready`; one redacted 600-second join token was
  prepared without joining the provider and has expired
- Recordings/transcripts: zero / none

The account currently sees ten retained Sessions. The live proof no longer
selects an arbitrary ready row: it requires the exact expected title and fails
closed if that Session is missing or renamed.

## Evidence durability

The first product operation created and read back the Session correctly, but
the evidence wrapper could not persist its receipt because the requested
external directory did not yet exist. The wrapper now creates the parent,
writes through a private temporary file, and atomically replaces the target.
Receipts use mode `0600`, including blocked/missing-Keychain reports, because
they contain QA identity and internal record identifiers.

A second read-only production run used `create-session=0`, required the exact
retained title, and passed Firebase sign-in, account lookup, verified-email,
native-session, Home Nest, mobile Sessions, participant, consent, lifecycle,
and safe-recording-boundary checks. It created no duplicate Session.

The synthetic participant then accepted the server's current consent
presentation for audio/video capture with transcription disabled. Before/after
diagnostics and short-lived token preparation proved no provider join,
recording, media/storage mutation, invite, Stripe, or Calendar effect. Fresh
Sessions readback retained exactly ten Sessions and showed `GRANTED`,
`canRecordNow=true`, `ready-to-capture`, and `ready-provider`.

That real operation exposed one contradictory top-level next action: a ready,
consented Session still said that recording required consent. The server copy
now keeps provider preparation neutral—joining alone does not start
recording—and regression coverage exercises an exact consented, first-capture
projection.

- Private receipt:
  `/Volumes/My Passport/Quipsly QA Artifacts/Retained Production/2026-08-01/capture-build25-reviewer-session.json`
- Consent/room receipt:
  `/Volumes/My Passport/Quipsly QA Artifacts/Retained Production/2026-08-01/capture-build25-consent-room.json`
- Receipt modes at readback: `-rw-------`

## Operating policy

Useful synthetic artifacts may remain in this private QA account. Future tests
should reuse the same identity and prefer stable, clearly labeled Sessions,
projects, tags, notes, tasks, goals, recordings, uploads, transcripts, and
timelines. Every operation must retain provenance and distinguish simulator,
fixture, production API, TestFlight, and physical-device evidence.

Consent, invitations, payment, publication, messages to real people, and real
calendar/provider effects remain explicit boundaries. Physical iPhone proof
also remains open until CoreDevice enumerates the device; native API visibility
is not an installed-app or real-camera claim.
