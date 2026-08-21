# Quipsly Coaching Build 33 release report

Audited: 2026-08-21

Status: **released for the two-person physical flight; hands-off acceptance is
not yet proved.** Build 33 supersedes Build 32 without weakening the original
acceptance bar.

## Exact release identity

- iOS app: **Quipsly Capture 1.0 (33)**
- native source: `b84e75f8608455247c7083b933c15be645d67e8d`
- App Store Connect build: `9a7944d0-55d7-46da-9755-694384fbe9fd`
- public beta: `https://testflight.apple.com/join/XwRRcYUm`
- Nest revision: `studio-00523-yun`, 100% production traffic
- Nest source/image tag:
  `e73fef64880362f3c6c5fc793c5b047408d22a40` /
  `source-e73fef64880362f3c6c5fc793c5b047408d22a40`
- transcript worker source:
  `18bf57766be9496aaf86756fbbfba127d7e2d387`
- transcript worker image digest:
  `sha256:abf11ba878379a8b1ee28a8f520407cad0fe64145925e3bcde34a397df8bf967`

Apple readback at `2026-08-21T15:53:22Z` reported the exact build `VALID`,
`IN_BETA_TESTING`, assigned to the external public-link group, and an anonymous
public-link tester in `INSTALLED` state. That anonymous installation cannot be
attributed to Homer's named Apple invitation. The physical Account support
snapshot and the real flight remain the identity-specific evidence.

## Product acceptance matrix

`PROVED` means the requirement's full evidence exists. `PARTIAL` means useful
evidence exists but the human or physical scope is still missing. Automated
evidence is never promoted into a human observation.

| # | Requirement | State | Current authority | Missing proof |
| --- | --- | --- | --- | --- |
| 1 | Clean coach creates and schedules generic Coaching Session and invites a client | PARTIAL | Fresh ordinary coach/client production API smoke covered self-service setup, appointment lifecycle, invitation linking, and cleanup | Homer must do it through ordinary released UI without help |
| 2 | App/browser invitation and isolated fresh-client entry | PARTIAL | Public TestFlight handoff is open; generated invited-user production smoke exposed only Home Nest plus the invited project and denied other projects | A fresh human must understand and accept the produced invitation on a supported endpoint |
| 3 | Compact sequential lobby without engineering bureaucracy | PARTIAL | Build 33 passed 67 serialized native journeys; production web UI was inspected at desktop and phone widths | The released two-person journey must feel sequential to both people; first-session web cleanup commit `db8721c1` is intentionally held for the next release train |
| 4 | Standard permissions and canonical revocable in-app consent | PARTIAL | Native/web contracts cover request, grant, decline, persistence, and revocation against the canonical Session | Real iOS/browser prompts and cross-endpoint consent readback must be observed |
| 5 | Reliable two-person audio/video, open/record/reconnect/background/route safety | PARTIAL | Crash regressions and deterministic reconnect/route journeys pass; browser calling has worked in an earlier assisted test | Build 33 physical iPhone plus browser call, audible quality, background/reconnect, and crash-free operation |
| 6 | Correct, actionable recording availability and start/stop | PARTIAL | Fresh production smoke proved all-party consent unlock and paid-room hold; native journeys cover recording transitions | Homer must understand and operate Record without hidden administration |
| 7 | Participant-owned masters, resumable upload, sync, playable post-call Session | PARTIAL | Source/upload/finalization contracts pass; production Google Speech V2 cloud fixture preserved source identity, immutable provider response, word timing, replay no-op, and cleanup | Two real participant sources, overlap, playback, and assembled Session readback |
| 8 | Shared recording state, attribution, notes/tasks, recovery, transcript path | PARTIAL | Production coach/client smoke and Session evidence tests cover canonical collaboration records | Both people must create and later rediscover the shared work through UI |
| 9 | Strict identity and tenant isolation | PARTIAL | Fresh invited-user production smoke passed exact-project allowlist and negative `/api/mac/session-check`; generated test users were cleaned up | During the flight, the client must see no unrelated data and an unrelated signed-in account must be denied the exact Session |
| 10 | Quiet primary journey; diagnostics and receipts remain secondary | PARTIAL | Build 33 primary surfaces and support-snapshot privacy contracts pass; production mobile browser inspection found no app-origin console failure | Human observation must confirm that support/audit detail does not obstruct the journey |

## Engineering and release evidence

- Build 33 is the canonical TestFlight target in
  `scripts/release/quipsly-capture-release-target.mjs`.
- The Apple public-link verifier passed the exact app title, heading, canonical
  HTTPS URL, and `itms-beta` handoff.
- Build 33 passed 67 serialized iPhone and Share Extension journeys plus signed
  archive/export verification before external beta assignment.
- Nest strict production build passed from the materialized committed source.
- Session source-evidence suite passed 66/66.
- Production mobile Capture contract passed 136/136.
- The live generated coach/client smoke exercised setup, hold/book/reschedule/
  cancel, calendar export, invitation linking, consent decline/grant, recording
  unlock, paid-room hold, and exact cleanup.
- The live invited-user smoke exercised Home Nest plus exactly one invited
  project, negative project visibility, canonical routes, and exact cleanup.
- Transcript worker tests passed 18/18. The real cloud fixture completed through
  Google Speech-to-Text V2 `chirp_3` with one speaker, 15 retained words, source-
  bounded timing, immutable provider evidence, create-once replay, and cleanup.
- Production health passed billing, Cloud SQL, Cloud Run readiness and traffic,
  domain/SSL, public routes, Firebase-first auth, and recent billing-error scan.

These checks prove that the release is eligible for a physical flight. They do
not prove intelligible live audio, camera behavior, human comprehension, real
source playback, or later human discovery.

## Physical flight and post-call proof

Use [`coaching-human-flight-runbook.md`](./coaching-human-flight-runbook.md).
Give Homer only its one-paragraph mission and give the client only Quipsly's
invitation. Any rescue keeps hands-off acceptance false, even when the resulting
Session remains useful diagnostic evidence.

After the Session, run the read-only canonical verifier:

```bash
QUIPSLY_PRODUCTION_POST_CALL_READBACK=1 \
DATABASE_URL='postgresql://…' \
npm run quipsly:coaching:post-call-readback -- \
  --room-id '<room-created-by-the-flight>' \
  --output '/private/tmp/quipsly-build33-post-call-readback.json'
```

The receipt must report `automatedEvidencePassed: true`. Separately observe:

1. both people completed ordinary navigation without rescue;
2. both heard intelligible live audio and understood call/recording state;
3. a person listened to every retained source and the assembled playback;
4. coach and client independently returned and found the Session and shared
   work; and
5. an unrelated signed-in identity could not open the exact Session.

Only those combined authorities satisfy the active goal.

## Rollback and recovery

Current production traffic is pinned to `studio-00523-yun`. Recent ready
revisions include `studio-00520-mim` and `studio-00518-dih`; readiness alone is
not permission to roll back. Before any rollback, identify the exact previously
accepted revision, inspect its source and environment, and smoke its protected
routes.

Runtime rollback changes traffic only:

```bash
ROLLBACK_REVISION=<verified-previous-ready-revision> \
  scripts/release/quipsly-rollback.sh
```

Database recovery is restore-forward: stop writes, preserve failed-state
evidence, restore the pre-migration backup to a separately named instance,
compare, and make an explicit recovery decision. Never destructively reverse
production from an unreviewed local command.

Keep local originals until verified cloud proof and human playback pass. A
failed upload or transcript is a recoverable processing state, never authority
to discard the participant-owned master.

## Honest remaining limitations

- The physical Build 33 Homer/client flight has not happened.
- Anonymous public-link installation does not prove which Apple Account owns
  the installed copy.
- Real invitation-mail delivery remains a separate observation from a working
  accepted share-link handoff.
- Provider recording is reference/fallback evidence, not the unexplained media
  authority.
- Fifty authenticated read workflows passed the bounded capacity lane, but 50
  simultaneous calls, recordings, uploads, transcripts, and humans are not
  proved.
- The quieter first-session web change is committed at `db8721c1` but was held
  by the Cloud Build cadence guard; it is not part of `studio-00523-yun`.

