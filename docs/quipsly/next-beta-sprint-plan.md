# Quipsly next beta sprint plan

Last updated: 2026-06-06

Status: product-owner operating map

## Product owner thesis

Quipsly is becoming a creative operating system where Nests are attachment points, not buckets.

The useful abstraction:

- Assets, documents, chats, outputs, research packets, and media jobs can attach to a Nest.
- The underlying object should still be able to serve multiple Nests over time.
- The user experience should feel like a cockpit, not a filing cabinet.

The immediate beta experience should make users feel:

> I know where my work is, I know who can access it, I can talk about it, and I can publish or produce from it without re-copying everything into a separate tool.

## Priority 0: keep live surfaces boringly accessible

Goals:

- `quipsly.com` is marketing/support.
- `nest.quipsly.com` is the app hub.
- `studio-hm2odnvjga-uc.a.run.app` remains a fallback app URL.

Implementation next:

- Add smoke checks to the Deploy Captain runbook.
- Fix Cloud Build IAM or remove the deploy step from deploy YAML.
- Shrink build context so every small release is not a 344 MB ritual.

## Priority 1: Nest as work cockpit

Goals:

- `/projects` shows every Nest the user can work in.
- `/nests/[slug]` becomes the cockpit: manuscript, media, chat, outputs, collaborators, recent activity.
- `/create`, `/editor`, `/media`, `/outputs`, and native apps all use the same projectSlug/Nest context.

Implementation next:

- Add a persistent Nest context selector to the app shell.
- Add visible published destinations and pending outputs to the Nest dashboard.
- Add clearer links from each Nest dashboard to document, editor, media, chat, and access.

## Priority 2: collaboration memory

Goals:

- One default Nest chat thread exists everywhere.
- GIFs work because tone matters and because the user explicitly wants them.
- Later, chat messages can become tasks, review requests, clip comments, or assistant memories.

Implementation next:

- Finish DB schema sync.
- Smoke the web chat panel.
- Add native auth/login path before promising native chat to outside testers.
- Add a simple activity feed model after chat settles.

## Priority 3: editor spine

Goals:

- One living document remains the authoring truth.
- Chapter/Episode tags create outline boundaries dynamically.
- Text, show notes, quotes, clips, speaker ownership, and publication links live in the document, not separate fragile copies.

Implementation next:

- Continue reducing scroll jumps.
- Make tag removal and outline navigation dead obvious.
- Add published episode link tags for previously published HGO episodes.
- Make outputs from the editor visible back on the Nest dashboard.

## Priority 4: media and publishing pipeline

Goals:

- Media ingestion can be global/user-home by default but attachable to Nests.
- Episode production can designate spine audio, sync assets, and publish episode pages.
- HGO is slaved to Quipsly publication packets, not manually maintained as a separate truth.

Implementation next:

- Add media asset availability model: home Nest attachment by default, additional Nest attachments explicit.
- Add import-to-Nest and attach-existing-asset flows.
- Add HGO published destination cards to outputs.

## Priority 5: native apps

Goals:

- Mac app is a real local production cockpit for media, ML/photo pipelines, local folders, and Nest connection.
- iPad app is the studio surface.
- iPhone app is capture/session-first.

Implementation next:

- Do not overpromise native auth until we wire real session/token bridge.
- Use web API contracts everywhere possible.
- Keep native tools honest: local capabilities plus cloud Nest sync.

## Priority 6: beta readiness

Goals:

- Patreon supporters and invited collaborators land in something useful.
- Charlie can manage users, Nests, and access without DB spelunking.
- New testers can start with a welcome/how-to Nest that teaches features inside the document itself.

Implementation next:

- Create welcome Nest/document for new users.
- Add admin user management polish.
- Add invite email later; grants-by-email are sufficient for early manual onboarding.

## Product risk watchlist

- Schema drift: solve with explicit migration discipline, not schema paralysis.
- Build/deploy slowness: solve with Deploy Captain plus CI cleanup.
- Native auth fiction: be honest until real.
- Over-gating workflows: transparency over judgment, no confidence-score moralizing.
- Duplicated truths: assets/documents can attach to many Nests, but the source object should remain singular.
