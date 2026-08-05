# Quipsly LiveKit cost and environment proposal

Status: provider conversation configuration is live; durable optional-egress
ledger and destination rail are qualified; real egress remains disabled

Last verified: 2026-08-04

## Recommendation

Continue using LiveKit Cloud **Build ($0/month)** for cross-device call
acceptance and early beta, while using the open-source LiveKit server locally
for development. Keep provider egress disabled until the zero-traffic real
START/webhook/STOP/storage acceptance below. Quipsly's protected local sources
remain the production recording plane; the managed provider is initially the
low-latency conversation plane plus an optional safety witness.

Move to **Ship ($50/month)** only when one of these is true:

- beta usage is consistently approaching the Build WebRTC/data allowance;
- Scott or another collaborator needs LiveKit dashboard team collaboration;
- Quipsly needs email support for production realtime incidents;
- a release-readiness review explicitly accepts the fixed monthly cost.

Current official pricing lists Build at $0 with no credit card, 5,000 WebRTC
participant-minutes, 100 concurrent connections, and 50 GB downstream transfer.
Ship starts at $50/month with 150,000 participant-minutes and 250 GB downstream
transfer, then $0.0005 per WebRTC minute and $0.12/GB. A two-person 90-minute
episode consumes about 180 participant-minutes, so the Build allowance covers
roughly 27 such calls before transfer or another quota becomes the tighter
limit.

Provider composite recording is deliberately excluded from this estimate.
Build includes only 60 shared transcode minutes and two concurrent exports.
Quipsly should not spend those minutes until a controlled acceptance run. The
egress command outbox, per-room lock, consent recheck, deterministic destination,
authenticated webhook receipt, provider-off UX, and reconciliation path are now
implemented. They deliberately preserve the local sources and capture-group
clock as the only production/synchronization authority.

- [LiveKit Cloud pricing](https://livekit.com/pricing)
- [LiveKit local server instructions](https://docs.livekit.io/transport/self-hosting/local/)
- [LiveKit self-hosting comparison](https://docs.livekit.io/transport/self-hosting/)

## Environment layout

| Environment | Realtime provider | Credentials | Media truth |
| --- | --- | --- | --- |
| local | `livekit-server --dev` on loopback/LAN | documented dev key only; never accepted outside local mode | local OPFS/iPhone files plus local Capture vault |
| preview | separate LiveKit Cloud project if Build project quota permits; otherwise time-bounded preview room namespace | preview-only secret versions | preview GCS vault; zero production traffic |
| production | LiveKit Cloud Build initially | production-only secret versions | production GCS vault and verified Quipsly receipts |

Nest owns token minting. The browser and iPhone receive only short-lived,
room-scoped participant tokens. They never receive the LiveKit API secret.
Each active device gets a device-scoped provider identity while retaining one
canonical Quipsly `CallParticipant`.

Required server variables:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

The keys must be separate by environment, stored in the existing secret
manager, attached to an exact Cloud Run revision, and verified by readback.
Local dev values must be accepted only for loopback/LAN development.

## Provisioning acceptance

Before any production traffic:

1. Create the provider project and record its account owner, plan, region/data
   policy, and deletion policy in the operator inventory.
2. Add environment-scoped secret versions without printing values to logs or
   committing them.
3. Run a local two-browser test against the local server.
4. Deploy an exact-SHA, zero-traffic preview revision and prove outsider denial,
   signed-in token minting, two-device join, reconnect, and no hidden recording.
5. Run browser plus iPhone with external mic/headphones, retain independent
   local sources, upload, verify, and play them from the Session/editor.
6. Confirm the LiveKit dashboard and Quipsly audit both show expected
   participant-minutes and no egress jobs.
7. Promote only that verified revision and add a monthly usage review at 50%,
   75%, and 90% of the free allowance.

## Rollback

Disable token minting by removing the provider variables from a new revision or
switching rooms back to `planned`. Existing retained local sources, Session
threads, consent receipts, transcripts, notes, goals, and tasks remain usable.
No data migration or application rewrite is required to replace LiveKit later.

## Browser source upload boundary

Browser-retained sources use an origin-bound GCS resumable session, 8 MiB
chunks, server range receipts, and a persisted local upload cursor. Production
still requires a narrowly scoped bucket CORS rule for the exact Nest origins,
`PUT`, and exposed `Content-Type`, `Range`, and `x-goog-resumable` response
headers. Do not use `*` for the media-vault origin. Inspect and propose the
exact existing-rule merge before mutating the bucket.
