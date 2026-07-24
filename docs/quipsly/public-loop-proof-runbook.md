# Quipsly / HGO public loop proof runbook

Date: 2026-07-06
Status: source proof active; live public loop promoted on 2026-07-07; native provider/transcription configuration still pending

## Current live status

Last promoted Nest/Quipsly revision: `studio-00310-rdn` at 100% traffic.

Current live proof commands:

```bash
node scripts/hgo-quipsly-public-loop-status.mjs --json --warn-only
node scripts/quipsly-coaching-payment-contract-smoke.mjs --static-only --json
node scripts/hgo-quipsly-public-integration-smoke.mjs --json
node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json
```

Current live status from the 2026-07-07 promotion:

- HGO `/coaching` is the public coaching/story doorway and no longer shows stale `Book a Session` / `Donation-supported` copy.
- Quipsly.com `/coaching` is the public coaching/capture product page, not the private Nest fallback.
- Nest `/api/coaching/public` returns calm side-effect-free JSON.
- Nest `/api/mobile/capture/readiness` returns calm side-effect-free JSON.
- Nest `/api/mobile/capture/review-digest` returns calm authenticated JSON failure when unauthenticated, not stale 404 HTML.
- Stripe is configured but live charging is intentionally held: `stripeConfigured: true`, `stripeLiveAllowed: false`.
- The Nest coaching runway includes the Homer-friendly **Coach setup** card, custom booking prices, and Stripe-hosted Checkout link creation behind explicit operator action.
- The public coaching packet and public pages expose a plain-English **coachee path** and **Homer operator path** so normal humans do not need to reason about Stripe, calendar receipts, capture rooms, or transcript jobs before taking the next step.

Still pending before calling the whole lane production-complete:

- signed-in visual smoke of `/coaching` in Chrome or Playwright with a real test account
- LiveKit provider-room credentials and provider egress proof
- cloud storage and transcription provider configuration proof
- real reviewer device/TestFlight capture smoke
- explicit user approval before live Stripe charges, external calendar mutations, recording, inviting, sending, or publishing

## Public loop contract

The public coaching/capture loop has four owners:

- `HighGroundOdyssey.com`: public coaching, story, and business doorway.
- `Quipsly.com`: product education funnel for Research, Studio, Tower, and coaching capture.
- `nest.quipsly.com`: operational truth for users, Nests, bookings, consent, payment evidence, capture rooms, recordings, transcripts, coaching packets, and review state.
- native capture app: local-first capture surface. Local recordings remain source truth until upload/server verification and explicit retention policy.

No provider is the hidden owner:

- Stripe is payment evidence, not booking truth.
- Calendar providers are scheduling evidence, not source truth.
- LiveKit/WebRTC providers are meeting and egress evidence, not consent truth.
- Firebase proves identity; Quipsly owns users, Nests, roles, grants, and free-account state.
- Transcription providers produce transcript evidence; Quipsly stores repairable transcript segments and packets.

## What proves the loop locally

Run the combined public-loop preflight before spending Cloud Build time:

```bash
corepack pnpm quipsly:public-loop:preflight
```

That command is the release-clear version: it expects source checks, production
builds, live drift checks, and operator deploy auth to be healthy enough to move
toward preview deploy.

For a faster source-only pass while iterating, run the underlying checks directly:

```bash
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node --check scripts/quipsly-coaching-public-handoff-smoke.mjs
node scripts/quipsly-coaching-lifecycle-static-smoke.mjs
node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
node scripts/quipsly-capture-reviewer-runway-static-smoke.mjs
corepack pnpm --filter quipsly typecheck
```

If changing public routing or Next route layout, also run production builds before deploy:

```bash
corepack pnpm --filter quipsly build
corepack pnpm --filter web build
```

The compact status command runs the source contract, operator auth check, live
route matrix, and live public integration smoke together:

```bash
node scripts/hgo-quipsly-public-loop-status.mjs --json --warn-only
```

Use `--skip-integration` only for a faster partial check while iterating. Do not
use a skipped integration result as live-public proof.

While iterating locally, the combined preflight can be made faster and
source-only without changing the release bar:

```bash
RUN_BUILDS=0 RUN_LIVE_PACKET=0 RUN_LIVE_MATRIX=0 RUN_LIVE_INTEGRATION=0 RUN_OPERATOR_AUTH=0 \
  corepack pnpm quipsly:public-loop:preflight
```

If that passes, it means source contracts are coherent. It does not mean deploy
is ready. Before release, remove those skips. `RUN_LIVE_PACKET=1` checks the
Nest public coaching packet directly; `STRICT_LIVE_PACKET=1` makes live packet
drift a hard failure instead of a warning. `RUN_OPERATOR_AUTH=1` is required for
preview-deploy clearance.

## What proves the loop in preview

After operator auth is green, deploy no-traffic preview revisions for both app surfaces. Do not promote traffic first.

Required operator gate:

```bash
bash scripts/release/quipsly-gcloud-auth-check.sh
```

If it fails, refresh credentials:

```bash
gcloud auth login --update-adc --brief
bash scripts/release/quipsly-gcloud-auth-check.sh
```

Preview smoke must prove:

- HGO `/coaching` renders the Quipsly operational handoff, not stale `Book a Session` / `Donation-supported` copy.
- `quipsly.com/coaching` renders the public coaching/capture product page, not the private Nest fallback.
- Nest `/api/coaching/public?source=route-matrix` returns calm JSON with `ok: true` and `packetKind: quipsly-public-coaching-handoff-v1`.
- The public coaching packet includes `publicLoop.owners`, `publicLoop.proofLadder`, and `publicLoop.safeNextActions` so reviewers can see who owns what, what proof tier is current, and what is safe next without guessing from UI copy.
- Nest `/api/mobile/capture/readiness` returns calm JSON with `ok: true`.
- Nest `/api/mobile/capture/review-digest` returns calm unauthenticated JSON auth failure, not stale 404 HTML.

Use the route matrix and integration smoke against preview base URLs when available:

```bash
node scripts/quipsly-coaching-public-handoff-smoke.mjs \
  --base-url=<preview-or-domain> \
  --json

node scripts/hgo-quipsly-public-route-matrix.mjs \
  --hgo-root-url=<preview-or-domain> \
  --hgo-app-url=<preview-or-domain> \
  --quipsly-marketing-url=<preview-or-domain> \
  --nest-url=<preview-or-domain> \
  --json

node scripts/hgo-quipsly-public-integration-smoke.mjs \
  --hgo-base-url=<preview-or-domain> \
  --quipsly-base-url=<preview-or-domain> \
  --nest-base-url=<preview-or-domain> \
  --json
```

## What proves the loop live

Only after preview passes, promote traffic and run:

```bash
node scripts/quipsly-coaching-public-handoff-smoke.mjs --base-url=https://nest.quipsly.com --json
node scripts/hgo-quipsly-public-route-matrix.mjs --json
node scripts/hgo-quipsly-public-integration-smoke.mjs --json
```

Live success means both the route matrix and integration smoke pass, proving route presence and connected product behavior:

- HGO public coaching route no longer shows stale `Book a Session` or `Donation-supported` markers.
- Quipsly.com `/coaching` no longer falls through to `Your private creative workspace lives here` or `Sign in to Nest`.
- The route matrix reports `finalUrl`, `redirected`, and final-host agreement. If `https://quipsly.com/coaching` ends at `https://nest.quipsly.com/coaching`, treat that as a host-boundary/deployed-image failure, not merely a copy-marker failure.
- Nest public packet/readiness routes no longer return 404 HTML.
- The public copy and JSON routes agree that Nest owns booking/capture/transcript/packet truth.
- The public packet exposes the same ownership/proof/safe-action ladder used by the release process: source-ready is not live proof, preview is not customer-visible proof, and device review still requires a real reviewer session.

## Historical known blocker

This was the latest blocker before the 2026-07-07 live promotion:

```text
gcloud user credentials cannot mint an access token.
Application Default Credentials cannot mint an access token.
Cannot access deploy project high-ground-odyssey.
Cannot access Firebase project quipsly-reef.
```

This blocker was cleared by refreshing gcloud/ADC auth before the live promotion.
If it reappears, it blocks deploy/promotion, but it does not block source-level
improvements, local validation, docs, route clarity, native capture readiness,
transcript-to-packet UX, or smoke-script hardening.

## Do not claim

Do not claim any of these until live route proof or receipts exist:

- a booking was created.
- a card was charged.
- a call was recorded.
- a transcript or coaching packet exists for a real session.
- anything was published, scheduled, uploaded, or receipt-backed.

Use these words instead when accurate:

- source-ready
- preview-ready
- live-route-proven
- live-drift-known
- local-contract-passing
- blocked-by-operator-auth
- review-ready
- receipt-backed

## 2026-07-07 Quipsly.com coaching route hardening

The Quipsly marketing proxy now explicitly treats `/public/*` as marketing-owned and documents the host-aware `/coaching` split. On `quipsly.com`, `/coaching` rewrites to `/public/coaching` so the public product-education page renders. On `nest.quipsly.com`, the operational `/coaching` workbench remains private/app-owned. The static HGO/Quipsly handoff smoke now requires this boundary so a future route/proxy edit cannot silently collapse Quipsly.com coaching back into the Nest fallback.

Validation run:

- `node --check scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs`
- `node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs`
- `RUN_BUILDS=0 RUN_LIVE_PACKET=0 RUN_LIVE_MATRIX=0 RUN_LIVE_INTEGRATION=0 RUN_OPERATOR_AUTH=0 bash scripts/release/hgo-quipsly-public-loop-preflight.sh`

## 2026-07-07 classified route-matrix diagnostics

`node scripts/hgo-quipsly-public-route-matrix.mjs --json` now turns each failing public-loop check into a small work order. Failed checks include:

- `failureSummary`: the immediate symptom, such as stale markers, wrong final host, stale 404 HTML, or JSON contract mismatch.
- `likelyCause`: the most likely operational cause, such as stale app image, host-boundary drift, or contract drift.
- `nextAction`: the next safe repair step.
- `fixLane`: the responsible deployment/source lane.

Current live classified failures still point to deployment drift, not a new source-contract problem:

- HGO `/coaching` routes: stale product copy from older `apps/web` deployment.
- `quipsly.com/coaching`: host-boundary drift or stale Quipsly proxy image, landing on `nest.quipsly.com` instead of `quipsly.com`.
- Nest public/mobile capture JSON routes: older live Nest image without the routes, returning 404 HTML.

Use this classified matrix as the public-loop work board after operator auth is refreshed and preview deploy begins.

## 2026-07-07 compact public-loop status

Use this command when an operator or agent needs the current public-loop truth without rereading the full runbook:

```bash
node scripts/hgo-quipsly-public-loop-status.mjs --warn-only
```

For machine-readable handoff:

```bash
node scripts/hgo-quipsly-public-loop-status.mjs --json --warn-only
```

For a slower local readiness refresh:

```bash
node scripts/hgo-quipsly-public-loop-status.mjs --deep-local --json --warn-only
```

This command intentionally does not deploy or promote. It combines:

- the fast HGO/Quipsly source contract smoke,
- operator deploy-auth readiness,
- the live public route matrix,
- optional deep local readiness.

The output uses explicit state labels such as `source-contract-smoke-ready`, `deploy-auth-blocked`, `auth-ready-live-drift-present`, and `route-matrix-live-clean`. Treat it as the shared operator dashboard for the current coaching/capture public loop.

Current trajectory decision from the Quipsly/HGO architecture review:

- HighGroundOdyssey.com is the public coaching/story doorway and should explain the human service clearly.
- Quipsly.com is the product-education funnel for Research, Studio, Tower, coaching capture, and source-safe creative workflows.
- Nest owns operational truth: users, booking/capture state, consent, recording evidence, transcripts, packets, review state, and receipts.
- Native capture should remain local-first and source-safe: local segments and manifests stay truth until server verification succeeds.

That means the immediate integration work is not to merge the public sites into one app. The immediate work is to keep handoffs honest and testable: public copy points to Quipsly/Nest actions, Nest exposes calm JSON and operational state, native capture proves source-safe recording/readback, and Tower later records publication/payment receipts without pretending they happened.

## 2026-07-07 shared public-loop ownership map

The public-loop ownership/proof/safe-action map now lives in the shared Quipsly domain package:

```ts
QUIPSLY_PUBLIC_LOOP_STATUS
```

Source owner:

- `packages/quipsly-domain/src/coaching-public.ts`

Consumers:

- `apps/quipsly/src/app/api/coaching/public/route.ts`
- `apps/quipsly/src/app/(marketing)/public/coaching/page.tsx`

Do not duplicate the owner/proof/action ladder in route or page files. HGO, Quipsly.com, and Nest should all tell the same story:

- HGO teaches and routes.
- Quipsly.com educates and funnels.
- Nest owns operational truth.
- Native capture stays local-first and source-safe.

Quipsly.com should render more than the owner cards. It should also render the shared proof ladder and safe next actions so reviewers can see the difference between source proof, preview proof, live proof, and device proof without inspecting JSON.

Validation:

```bash
node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
node scripts/hgo-quipsly-release-readiness.mjs --local-only --json
```

## 2026-07-07 live coaching public-loop promotion

Promoted the user-friendly coaching/capture public-loop pass after no-traffic preview proof.

Live revisions after promotion:

- `studio-00355-joz` at 100% traffic with tag `quipsly-web-preview`.
- `web-00147-vix` at 100% traffic with tag `web-preview`.

Validation summary after promotion:

- `node scripts/hgo-quipsly-public-route-matrix.mjs --json`: 7 checks, 0 failures.
- `node scripts/hgo-quipsly-public-integration-smoke.mjs --json`: 7 checks, 0 failures.
- `node scripts/hgo-quipsly-public-loop-status.mjs --json --warn-only`: `public-loop-live-clean`.
- `node scripts/quipsly-coaching-payment-contract-smoke.mjs --static-only --json`: 24 checks, 0 failures.

Operational note: the HGO Cloud Build pushed `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:web-20260707-110538`, then failed with the known Kaniko post-push image-discovery error. The image was deployed directly to the `web-preview` Cloud Run tag with `gcloud run deploy --no-traffic --tag=web-preview`, preserving the existing service settings, then preview-smoked before promotion.

Preview-smoke note: tagged Cloud Run preview URLs are not the custom `quipsly.com` host, so the release runway now smokes the public Quipsly coaching page at `/public/coaching` on the preview service while live smoke still proves `https://quipsly.com/coaching` through the host-aware proxy rewrite.

Product proof now live:

- HighGroundOdyssey.com explains coaching and routes to Quipsly-owned operational state.
- Quipsly.com explains Research, Studio, Tower, and the coaching/capture lane.
- Nest exposes the public coaching packet, coachee journey, Homer operator journey, mobile capture readiness, and authenticated review-digest boundary.
- No route claims payment, recording, transcription, scheduling, publication, or external side effects without receipts.
