# Current State

Date: 2026-05-07

## What The Repo Is Right Now

High Ground Studio is a monorepo with:
- a primary Next.js app in `apps/web`
- a Vite motion playground in `apps/motion-lab`
- a shared motion engine package in `packages/motion-engine`
- a Prisma/Postgres data model for identity, clients, memberships, and appointments
- a large content tree spanning published MDX, staging content, and raw manuscript/research material

## What Is Real And Working

- Google sign-in is wired through NextAuth in `apps/web/src/auth.ts`.
- App users are persisted in Prisma and merged by primary/alias email in `apps/web/src/lib/server/user-identity.ts`.
- Role-aware gating exists for team/internal access in `apps/web/src/lib/authz.ts` and `apps/web/src/lib/content-access.ts`.
- `/dashboard` renders signed-in client membership, appointment, recent coaching request, and converted appointment data from Prisma.
- `/dashboard?intent=coaching` renders the signed-in coaching request form and posts to `submitCoachingRequestAction`.
- `/dashboard` shows recent coaching request status, assigned coach when present, converted appointment summaries, Google Calendar add links for converted appointments, and a pay-what-you-can contribution CTA when `HGO_COACHING_DONATION_URL` and appointment data are present.
- `/team/clients` supports:
  - pre-provisioning client users
  - alias email capture
  - promoting existing users to clients
  - seeding membership plans
  - granting/updating memberships
- `/team/coaching-requests` supports:
  - viewing the 50 most recent coaching requests
  - status counts for `NEW`, `CONTACTED`, `SCHEDULED`, `CLOSED`, and `DECLINED`
  - assigning a coach and saving internal notes
  - marking requests contacted, closed, or declined
  - converting eligible requests into appointments
- `/team/appointments` supports:
  - creating appointments
  - updating appointments
  - marking appointments canceled/completed
  - generated Google Calendar event-template links
  - a visible donation-link configured/missing indicator
- `/library` works as a curated index using hand-authored episode/reading metadata from `src/lib/site.ts` and `src/lib/reading.ts`.
- `/coaching` is a stable public front door for coaching offers and sign-in handoff.
- New coaching requests create/confirm the client role and client profile, store a `CoachingRequest`, and attempt a best-effort internal Resend email notification after the database transaction commits.
- Coaching request email notifications go to active users with `OWNER`, `TEAM_SCHEDULER`, or `COACH` roles and do not block the user success redirect if email fails.
- The internal Learning to Lead Story Map can save database-backed Live Story Drafts attached to Story Candidates and Homer source blocks. These drafts are live app state, not canonical manuscript truth.
- The private Studio `/manuscript` desk can save and load manual server snapshots through Cloud SQL-backed `StudioManuscriptSnapshot` rows. The browser-local draft remains the active working copy; server snapshots are cross-device checkpoints, not autosave, collaboration, or canonical manuscript truth.
- The private Studio `/manuscript` desk now has a Manuscript Library MVP in
  `Backup` mode. A named `StudioManuscript` can group manual snapshots, mark a
  manuscript as `WORKING` or `SYNTHETIC`, and load the latest snapshot for that
  selected manuscript. Existing snapshots without a manuscript id remain
  loadable as legacy/orphan snapshots.
- The private Studio `/manuscript` desk now includes a Publish / handoff mode
  that derives browser-only readiness reports and Markdown exports from the
  existing browser-local draft, structure regions, author marks, cited
  quotations, quote review metadata, and manual snapshot status. These exports
  do not write server files or canonical public content.
- The private Studio `/manuscript` desk now includes a synthetic smoke draft and
  real-manuscript readiness gate. The smoke draft is fake text only and is meant
  to test marks, structure, quotes, quote reviews, manual snapshots,
  phone/second-browser loading, Recording / Reading mode, and Publish exports
  before real manuscript material enters Studio.
- The private Studio `/manuscript` desk can generate a browser-only HGO episode
  projection JSON draft from synthetic/tagged manuscript metadata in Publish
  mode. The export is a projection draft/staged review draft, not raw
  manuscript draft JSON, not a server publish, not canonical public content,
  and not public-safe until citation/public-safety review is complete.
- Studio now has a local-only synthetic collaboration lab at
  `/manuscript/collaboration-lab`. It uses Yjs in browser/session memory to
  model two manuscript-shaped clients, synthetic block edits, synthetic tags,
  manual sync, snapshot export, and convergence checks. It is not connected to
  production `/manuscript`, does not write localStorage, does not call server
  routes, does not autosave, and does not enable real simultaneous editing.
- Studio has pure collaboration lab validation through
  `pnpm studio:collab:test`, `pnpm studio:collab:checkpoint:test`,
  `pnpm studio:collab:adapter:test`, `pnpm studio:collab:span:test`, and
  `pnpm studio:collab:agentic-smoke`. These use synthetic data only and write
  generated reports under ignored `artifacts/` paths.
- Studio has a local-only collaboration checkpoint bridge. It exports a Yjs lab
  client into `studio-collaboration-checkpoint-v1`, validates safety flags,
  imports the checkpoint into a new synthetic client, and confirms blocks, text,
  tags, empty blocks, and summaries survive. It is not a production manual
  server snapshot and does not touch production `/manuscript` save/load.
- Studio has a synthetic-only collaboration Manuscript adapter bridge. It
  converts `studio-collaboration-checkpoint-v1` into
  `studio-collaboration-manuscript-adapter-v1`, creates a valid synthetic
  `ManuscriptDraft` subset with title, ordered paragraph blocks, block ids,
  text, synthetic author/tag metadata, empty structure regions, and empty quote
  reviews, then converts back into a collaboration checkpoint/client. It is not
  a production Manuscript Desk import, does not call snapshot APIs, does not
  write localStorage, does not autosave, and does not touch manual snapshots.
- Studio collaboration now has synthetic span semantics. The local Yjs lab can
  add addressable synthetic spans over block text, sync them between Charlie and
  Homer clients, carry them through snapshots/checkpoints, and map
  non-overlapping spans into `semanticHighlightMark` ranges in the synthetic
  Manuscript adapter payload. The lab UI now leads with a shared long manuscript
  surface to reinforce that collaboration should happen over one manuscript
  stream, not disconnected cards.
- Studio collaboration now has synthetic local presence and manuscript margin
  awareness in `/manuscript/collaboration-lab`. Presence tracks Charlie and
  Homer active block/span/mode/last action in React state only and renders
  margin cues around the shared manuscript surface. Presence is explicitly not
  durable manuscript content and is excluded from snapshots, checkpoints,
  Manuscript adapter payloads, localStorage, server routes, and production
  manual snapshots.
- Studio collaboration now has synthetic span-anchored review notes in
  `/manuscript/collaboration-lab`. Notes can be authored by Charlie or Homer,
  marked `open`, `addressed`, or `archived`, and shown as margin/side-panel
  context around the shared manuscript surface. For this sprint they are
  React-state-only local annotations: not source text, not presence, not Yjs
  snapshot state, not collaboration checkpoints, not Manuscript adapter payloads,
  not localStorage, not server routes, and not production manual snapshots.
- Studio collaboration now has a synthetic annotation durability decision
  helper and lab UI summary. It compares annotation event log, checkpoint
  metadata, and separate annotation store options, then recommends event-log
  operations plus a separate annotation store for future durable review notes.
  Checkpoint metadata is explicitly not the primary recommended store because
  manual snapshots should remain rollback anchors, not comment warehouses.
- HGO has a browser-only `/projection-preview/import` route that accepts pasted
  projection JSON, validates lifecycle/visibility/citation state, and renders it
  with the same projection preview component without persisting or publishing it.
  It warns when Studio browser bridge drafts include pull quotes, staged
  status/visibility, unresolved citation state, or live/public state.
- HGO has a synthetic-only staged projection surface at `/projection-stage` and
  `/projection-stage/[slug]`. It uses the same projection renderer and a
  fixture-backed repository to show staged review/readiness architecture without
  replacing public `/episodes`, persisting projection artifacts, or using real
  HGO/manuscript content.
- HGO has a synthetic-only staged review gate at `/projection-stage/review`.
  It groups projection fixtures into blocked, needs-review, and live-safe
  states using pure promotion-readiness helpers. It makes blockers and warnings
  visible but does not offer a real publish action.
- HGO has a no-persistence staged import review route at
  `/projection-stage/import`. It accepts pasted Studio/HGO projection JSON in
  browser state only, validates it, runs the staged review gate against it, and
  renders it through the shared projection renderer with staged links. It can
  also create a browser-only downloadable staged artifact JSON review packet
  containing the projection, validation warnings, review gate, and explicit
  `persisted: false` / `published: false` safety flags. It does not persist,
  publish, write local storage, replace public `/episodes`, or use real content.
- HGO has a browser-only staged artifact inspection route at
  `/projection-stage/artifact`. It accepts pasted `hgo-staged-artifact-v1`
  JSON, validates the artifact contract, validates the embedded projection,
  checks embedded review-gate id/slug/title/status/visibility identity, shows
  safety flags, and renders the embedded projection. It does not persist,
  publish, write local storage, verify public safety, replace public
  `/episodes`, or use real content.
- HGO has a browser-session staged artifact Store Lab at
  `/projection-stage/store-lab`. It imports validated `hgo-staged-artifact-v1`
  JSON into React state only, models future private-store lifecycle behavior,
  shows review status, promotion readiness, archive behavior, event logs, and a
  simulated promotion-candidate boundary. It does not persist, write
  localStorage/sessionStorage, call a server route, publish, replace
  `/episodes`, or use real content.
- HGO has a pure staged artifact contract test command,
  `pnpm hgo:artifact:test`, covering synthetic artifact creation, parser and
  validator state, invalid version, persisted/published safety failures,
  missing projection, review-gate mismatches, credential-marker rejection, safe
  file naming, and summary fields.
- HGO has a pure staged artifact Store Lab test command,
  `pnpm hgo:store-lab:test`, covering session-only import, invalid artifact
  rejection, persisted/published rejection, duplicate active artifact behavior,
  review status updates, simulated promotion-candidate gating, archive behavior,
  summary counts, lookup, and status grouping.
- HGO has a docs-only future private staged artifact store plan in
  `docs/architecture/hgo-private-staged-artifact-store-plan.md`. It deliberately
  does not add Prisma schema, API routes, server writes, Cloud SQL mutation, or
  publish behavior.
- The repo now has an agentic Studio/HGO smoke command,
  `pnpm studio:hgo:agentic-smoke`, that uses synthetic data only to exercise
  Studio manuscript helper payloads, HGO projection generation, HGO validation,
  and machine-readable report output. It is API/helper-level for now because
  authenticated browser automation needs a safe test-auth or private storage
  state path.
- The repo also has an operator-assisted browser smoke command,
  `pnpm studio:hgo:browser-smoke`. It requires a private Playwright storage
  state at `artifacts/auth/studio-storage-state.json`; if that file is missing,
  it writes a machine-readable `blocked` report without opening a browser or
  performing server writes. When valid auth state is supplied, it may create
  synthetic-only Studio manuscript/snapshot records and then preview the HGO
  projection import.
- HGO has a no-auth browser smoke command,
  `pnpm hgo:projection:browser-smoke`, for the projection import/render path.
  It uses synthetic HGO projection JSON only, opens `/projection-preview/import`,
  confirms validation warnings and the shared renderer, checks
  `/projection-stage`, `/projection-stage/review`, `/projection-stage/import`,
  `/projection-stage/artifact`, `/projection-stage/store-lab`, and a staged
  detail route, verifies known real-content markers are absent, writes a
  machine-readable report, and performs no server writes. If `HGO_BASE_URL` is
  not set, it starts the web app locally on an available test port and shuts it
  down after the run.
- HGO also has a no-auth visual smoke command,
  `pnpm hgo:projection:visual-smoke`, for synthetic screenshot artifacts. It
  visits the projection preview map, import route, rendered import state, and
  synthetic projection detail routes, including Store Lab empty, imported,
  reviewed, and archived states, writes a route-matrix report, captures screenshots
  under `artifacts/playwright/hgo-projection-visual-smoke/`, checks known
  real-content markers are absent, and performs no server writes.

## Current Coaching Workflow

- `/coaching` is the public coaching front door. Its `Book a Session` calls to action send signed-in users to `/dashboard?intent=coaching` and anonymous users through sign-in with that dashboard intent as the callback.
- `/dashboard?intent=coaching` is the active signed-in intake surface. The form captures preferred contact method, optional phone, optional note, and an SMS consent notice if the user selects text follow-up.
- Submitting a coaching request writes Prisma state first, then attempts internal email notification. The primary user path succeeds even if the email attempt returns a structured failure.
- `/dashboard` shows the latest coaching request plus recent older requests. Converted requests show appointment summaries and Google Calendar links.
- `/team/coaching-requests` is the internal request queue and appointment conversion screen. Conversion creates an `Appointment`, marks the request `SCHEDULED`, assigns the coach, links `convertedAppointmentId`, appends internal scheduling notes, and revalidates `/team/coaching-requests`, `/team/appointments`, and `/dashboard`.
- `/team/appointments` remains the general internal appointment scheduling and editing screen. It can create appointments directly or manage appointments produced from coaching request conversion.
- Donation support is currently an external pay-what-you-can link controlled by `HGO_COACHING_DONATION_URL`.
- Google Calendar support is link-generation only through `buildGoogleCalendarEventUrl()`. No Google Calendar OAuth, API event creation, event update, or cancellation sync exists.
- SMS/Twilio sending is not wired into the current coaching request flow. A server-only Twilio helper exists, but there are no active call sites from coaching actions.

## What Is Intentionally Not Finished

- Stripe checkout is not active.
- Stripe webhook/commercialization automation is not active.
- Full Stripe Checkout is not active for coaching. The current donation path is an external link, typically a Stripe Payment Link, not app-owned checkout/session/webhook state.
- The floating cart UI exists in layout, but checkout is placeholder-only client code in `src/components/cart/Cart.tsx`.
- The episodes route is not on a fully settled content-loading architecture yet.
- SMS/Twilio notification delivery is not active.
- Google Calendar API/OAuth synchronization is not active.
- Email notification delivery has no retry queue or persisted delivery status.
- Story Draft promotion into real `ManuscriptBlock` truth is not active.
- Story Draft revision history is not active.
- Studio Manuscript autosave is not active.
- Studio Manuscript production simultaneous editing is not active. A local-only
  Yjs collaboration lab exists, but it is synthetic-only and not wired into the
  real Manuscript Desk save/load path.
- Studio collaboration checkpoints are local lab checkpoints only. They are not
  production manual snapshots, autosave, server persistence, or a replacement
  for rollback anchors.
- Studio collaboration Manuscript adapter payloads are synthetic bridge payloads
  only. They are not production imports, server snapshots, autosave state, or a
  collaboration-enabled replacement for `/manuscript`.
- Studio collaboration span semantics are synthetic text-offset lab semantics.
  They are not production comments, not real source spans, not DOM selections,
  and not wired to production `/manuscript`.
- Studio collaboration presence is local lab awareness only. It is not
  provider-backed, not persisted, not checkpointed, not stored in localStorage,
  and not wired to production `/manuscript`.
- Studio collaboration review notes are local lab annotations only. They are
  not source text, not persisted, not checkpointed, not stored in localStorage,
  and not wired to production `/manuscript`. A future production implementation
  should use annotation events plus a separate annotation store rather than
  checkpoint metadata as the primary durable comment store.
- Studio Manuscript Library deletion, destructive cleanup, ownership transfer,
  and automatic orphan-snapshot migration are not active.
- Studio Manuscript publishing exports are working handoff artifacts, not a
  canonical publishing database or public projection pipeline.
- Studio Manuscript synthetic readiness checks are browser-local safety
  guidance. They do not write canonical content and do not replace the manual
  judgment required for the first real manuscript import.
- The Studio-to-HGO projection bridge is browser-only/manual. It does not create
  a DB projection table, live publish API, public deployment pipeline, autosave,
  collaboration layer, or server-side staged artifact store.
- The HGO staged projection surface is synthetic-only. It is a review-stage
  architecture prototype, not a public publishing system or real staged content
  store.
- The HGO staged review gate is also synthetic-only. It prepares future
  staged-to-live promotion checks but does not publish, persist, or approve
  anything.
- The HGO staged import review route is no-persistence. It prepares a later
  private staged artifact store and can download browser-created artifact JSON,
  but pasted JSON and generated artifacts are not saved to local storage, server
  state, content files, or Prisma.
- The HGO staged artifact inspection route is also no-persistence. It validates
  browser-created artifact JSON and renders embedded projection state, but it
  does not save, approve, publish, or verify real public-safety status.
- The HGO staged artifact Store Lab is session-only. It models private-store
  lifecycle state without writing localStorage, server state, Prisma rows,
  content files, or public routes.
- Agentic Studio/HGO browser smoke does not automate Google OAuth and has no
  committed auth state. Operators must create private storage state locally
  before a full browser run. Missing auth state is a `blocked` result, not a
  product failure.
- The HGO no-auth browser smoke does not exercise Studio auth, manuscript
  library, or snapshot UI. It covers HGO projection import, staged review gate,
  staged projection routes, and rendering.
- The HGO no-auth visual smoke is a screenshot/report artifact pass for later
  human review. It does not exercise Studio auth, manuscript library, snapshot
  UI, real publishing, or real content.

## Current Stabilization Decisions

- The earlier Stripe checkout attempt was rolled back to a non-broken state.
- The episodes route currently uses a guarded loader in `apps/web/src/lib/source.ts`.
- The Fumadocs source is only enabled when `ENABLE_EPISODES_FUMADOCS=1`.
- That guard is temporary and reversible.

## Build Reality

Recently verified in local Codex sessions:
- `pnpm --filter web build` passes.
- `pnpm --filter web exec next build --webpack` passes in the current environment.
- `pnpm --filter web exec tsc --noEmit` passed during the 2026-05-07 coaching current-state sync.
- `pnpm --filter web exec next build --webpack` passed during the 2026-05-07 coaching current-state sync.

Session evidence:
- `docs/sessions/episodes-loader-guard-result.md`

Interpretation:
- both production build paths are currently green
- the older Turbopack/PostCSS failure described in session notes is now historical stabilization context, not the current repo state

## Content Reality

- `apps/web/content/publish` is the current published MDX surface and the only content directory explicitly wired into `apps/web/source.config.ts`.
- `apps/web/content/_staging` is a structured working/staging area and is not currently consumed directly by the live app code.
- `apps/web/content/_inbox` contains raw source material and research, not just ready-to-publish content, and is not part of the live content source path.
- `/library` and other curated discovery surfaces currently depend on hand-maintained metadata in `src/lib/site.ts` and `src/lib/reading.ts`, not dynamic enumeration of the content tree.

## Known Repo Friction

- The durable docs layer is new and should be kept current as repo memory evolves.
- Published MDX page source and curated discovery metadata are split across different files and must currently be kept aligned by convention.
- There are backup/scratch artifacts in the repo, including:
  - `apps/web/src/app/schedule/page.backup.tsx`
  - `pnpm-workspace.yaml.save`
  - `prisma.config.ts.bak`
  - many `.DS_Store` files

These should be treated as cleanup candidates later, not as authoritative product code.
