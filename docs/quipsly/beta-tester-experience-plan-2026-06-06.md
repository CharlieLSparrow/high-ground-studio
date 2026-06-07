# Quipsly beta tester experience plan

Last updated: 2026-06-06

## North star

Beta testers should feel like they opened a calm creative workshop, not a prototype maze.

The product can still be incomplete. It cannot feel incoherent. A beta user should always understand:

- where they are,
- what object they are working on,
- what is safe,
- what Quipsly can help with,
- what changed,
- how to recover,
- and what the next useful action is.

## Product promise for beta

Quipsly is a creative operating system for people who write, study, record, organize, and publish from the same body of work.

The important beta promise is not "every integration is done." The promise is:

- your work belongs to a Nest,
- your Nest can contain writing, study material, media, research, and publishable outputs,
- Quipslys help collect, organize, compare, retrieve, cite, prepare, and propose,
- humans direct, select, edit, and approve,
- everything important is inspectable,
- and public publishing flows through safe output packets instead of raw private working documents.

## The first five minutes must feel excellent

### 1. Landing

When a supporter or invited tester reaches Quipsly, they should see a clear beta welcome, not a generic dashboard.

Required experience:

- `quipsly.com` explains the product in plain language and sends people to beta access/support.
- `nest.quipsly.com` is the app, not a copy of the marketing site.
- If a user is not signed in or not eligible, the app explains why and gives the least-scary next step.
- If a user is eligible, they land on their Nests, not a hidden route.
- If the app receives an ambiguous route like `/create` without a project, it redirects or explains rather than silently choosing a dev manuscript.

### 2. First Nest

The first screen after access should ask, "What are you making or studying?"

Starter Nest types:

- Writing document: book, article, essay, talk, script, episode writing.
- Study document: imported book, article, course page, PDF, transcript, or research source with annotations.
- Production room: episode recording, media sync, transcript, and timeline.
- Research packet: quotes, examples, notes, citations, and source comparisons.
- Fiction world: story bible, scenes, continuity notes, characters, and relationship maps.
- Course or lesson: mobile-first lesson flow, quiz, flash cards, and SCORM-ready projections.
- Gallery or review: photo/client review, ratings, selections, notes, and delivery packets.
- Mixed Nest: flexible workspace for users who do not know yet.

Each Nest should seed an editable welcome/how-to document written inside the actual editor. The tutorial is the first real document.

### 3. First editor action

The first useful editor action should be obvious without docs.

Required editor clarity:

- "Make a heading block, tag it Chapter or Episode, and the outline becomes navigation."
- Chapter and Episode tags are primary.
- Other tags are available only when the surface needs them, not in the default authoring menu.
- Tag removal is visible and immediate.
- Autosave status is visible.
- Recent changes and assistant actions are inspectable.
- Empty states say what to do next.
- The document should not jump around when tagging, saving, or focusing.

### 4. First Quipsly interaction

The assistant should feel like an enthusiastic research librarian and co-drafting partner, not hidden automation.

Default assistant prompts:

- "Help me organize this document."
- "Suggest Chapter or Episode structure."
- "Find related blocks."
- "Make a research packet from this section."
- "What outputs could this become?"
- "What do I need before publishing this?"
- "Draft three possible openings from my notes."
- "Rewrite this section in a clearer or more playful voice."

Guardrails:

- No direct manuscript mutation without approval.
- No silent or unlabeled writing.
- Every proposed action has a label, explanation, risk level, payload, status, and rollback path where practical.
- Drafts, rewrites, and voice experiments are allowed as visible options for a human to accept, edit, rewrite, or reject.

### 5. First output moment

The user should quickly understand that Quipsly is not just a note app.

The starter document should show that the same Nest can project into:

- book/manuscript,
- episode page,
- YouTube/video,
- podcast feed,
- Patreon post,
- quote card/feed,
- course lesson,
- SCORM package,
- story/comic/scroll experience,
- photo review gallery,
- social post,
- and research packet.

For beta, many of these can be "not ready yet" as long as the status is honest and the path is visible.

## P0: beta must not embarrass us

These are required before broad Patreon beta access.

### Access and tenancy

- Patreon supporter access works for any active paid supporter.
- App-owned access remains source of truth; Patreon is provider input.
- `requireProjectAccess` or equivalent helpers do not create records.
- All write routes require explicit Nest/project scope.
- Owner-only shortcuts are visibly owner-only.
- Dev/demo data is hidden from normal testers unless intentionally opened.

### Routing

- `quipsly.com` is public marketing/help.
- `nest.quipsly.com` is the app.
- `quiplore.com` is public quote/archive.
- `highgroundodyssey.com` is public content/projection.
- Ambiguous app routes redirect to the Nest hub instead of defaulting to `quipsly-dev-lab` or the HGO manuscript.

### Core app surfaces

- `/projects` and `/nests` explain what a Nest is.
- `/create?project=*` loads the selected Nest clearly.
- The editor shows Nest name, document title, document kind, save status, and active lens.
- The project switcher cannot make users feel trapped in the wrong Nest.
- The starter document teaches by being editable.

### Recovery

- Recent assistant actions are visible.
- Approved assistant actions are inspectable.
- Tag changes and block edits do not feel irreversible.
- Sync/media panels have "Something looks wrong" language where relevant.
- Diagnostic export exists for the assistant/editor/session state.

### Public safety

- Public episode pages read public-safe packets.
- Private manuscript state is not exposed to public sites.
- Public pages show publication status/provenance in operator views.
- Publish buttons make destination and risk clear.

## P1: beta should feel magical

These make testers tell someone else about it.

### Friendly Nests

- New Nest creation feels like picking a creative mission, not filling out a database form.
- Nest cards show type, last edited, next step, outputs available, and whether anything needs attention.
- Each Nest type has a starter document with personality and concrete examples.

### Editor delight

- Chapter/Episode tagging feels like a power move.
- Outline navigation feels instantaneous and trustworthy.
- Book Mode, Show Mode, Quote Database, and Published Episodes are explained as lenses, not separate content piles.
- Keyboard behavior feels normal: Enter splits, Backspace at start merges, delete/remove is discoverable.
- The active block is visually calm and obvious.

### Assistant usefulness

- Quipsly can propose output plans from the current document.
- Quipsly can create local research packet previews.
- Quipsly can find similar blocks/sources.
- Quipsly can explain why it suggested something.
- Quipsly says "I can prepare this for you" more often than "I wrote this for you."

### Beta feedback loop

- Every major screen has "Confused?" or "Something weird?" feedback.
- Feedback includes route, Nest, browser, selected block, and safe diagnostic JSON.
- A beta tester can say "this scared me" without filing a formal bug.
- The app has a short beta changelog or "what changed" surface.

## P2: make it more awesome than expected

These are not all required before first beta, but they define the shape of the product.

### Output catalog as the unifying abstraction

Every output is a projection from a Nest:

- books,
- Kindle packages,
- episode pages,
- YouTube videos,
- shorts/reels,
- podcast feeds,
- Patreon posts,
- quote feeds/cards,
- SCORM courses,
- mobile lessons,
- quizzes,
- flash cards,
- comics,
- story scrolls,
- galleries,
- client review boards,
- and social media variants.

The user should not copy assets into five tools. They should prepare one source spine and choose projections.

### Study documents

Study documents should preserve a source-aware layer:

- imported original text,
- editable notes/overlays,
- highlights/tags,
- quotes,
- questions,
- research packets,
- citations,
- and assistant retrieval.

The source can be immutable later, but the user experience should still feel like "mark it up and make it mine."

### Media and sync

The recording/editor stack should treat interruptions, device breaks, and later uploads as normal.

Required product shape:

- recording sessions are the spine,
- starts/stops are preserved,
- media imports attach to a Nest and episode,
- spine audio is first-class,
- sync changes are logged,
- and playback/editing can hydrate from the same episode production payload.

### Visual companions

Quipsly characters are not decoration. They can become:

- assistant avatars,
- empty-state helpers,
- onboarding guides,
- mode indicators,
- output mascots,
- and shareable brand assets.

The Art Foundry should help generate consistent Quipsly assets on demand, but manual curation remains important.

## P3: grown-up SaaS polish

These make beta sustainable instead of heroic.

### Admin and support

- Supporter/member lookup.
- User/Nest admin.
- Feature flags by role and route.
- Safe impersonation or diagnostic view for owner/admin.
- Clear support queue from in-app feedback.

### Observability

- Health endpoints.
- Preview deploy smoke.
- Release promotion and rollback.
- Route-level error tracking.
- Assistant action logging.
- Media pipeline status.
- Public publish packet validation.

### Legal and trust

- Privacy policy.
- Terms.
- Beta disclaimer.
- AI assistance boundaries.
- Public/private data explanation.
- Patreon/supporter access explanation.
- Source/citation handling policy.

## Beta tester "awesome" checklist

Use this as the product QA checklist before inviting testers.

- Can a new eligible user understand what Quipsly is in 30 seconds?
- Can they enter the app without route weirdness?
- Can they create a Nest?
- Can they open the seeded welcome document?
- Can they understand Chapter/Episode tagging without us explaining it live?
- Can they ask Quipsly for help without fearing it will overwrite their work?
- Can they see recent changes?
- Can they recover or report confusion?
- Can they tell which outputs are ready, draft, blocked, or future?
- Can they find the Patreon/support CTA?
- Can they understand what is private versus public?
- Can we diagnose their issue from a feedback payload?
- Can Release Captain preview, smoke, promote, and roll back without improvising?

## What to build next

Recommended next Codex pass:

1. Audit the routes and high-risk files in `docs/coordination/BETA-MANIFEST.md` section 3.
2. Add a beta welcome/onboarding surface to `/projects` or `/nests`.
3. Make the starter document more explicit about the first five minutes.
4. Add or strengthen a global beta feedback/diagnostic button.
5. Make route/domain split impossible to misunderstand.
6. Ensure hidden/internal features are gated or labeled.
7. Hand Release Captain a precise preview-smoke-promote checklist.

## Working rule for the Marginalia

Big ideas are welcome. Big changes are welcome. But beta-facing changes must name:

- public route,
- hidden/admin route if any,
- backing data shape,
- Nest/project access rule,
- empty state,
- rollback/recovery path,
- and how a confused beta tester will know what to do next.
