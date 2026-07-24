# Quipsly Nest / Studio / Tower product map

Status: working product doctrine, not a hard implementation silo.

## The simple promise

Build in the Nest. Produce in the Studio. Broadcast from the Tower.

Quipsly is one creative operating system with three major workflow lenses:

- Nest: capture, curate, cultivate.
- Studio: create, captivate, integrate.
- Tower: publish, analyze, monetize.

These words are for humans. They should make the product easier to understand,
market, and navigate. They are not permission to split Quipsly into unrelated
truth systems.

## The core rule

Nest / Studio / Tower are lenses over shared Quipsly objects, not separate
databases or disconnected apps.

Shared objects include:

- Nest: the project/workspace container, collaborators, permissions, and context.
- Capture: idea, note, recording, upload, call, import, or source event.
- SourceAsset: original media, document, image, transcript, quote, or reference.
- Annotation: tag, highlight, note, quote, correction, edit decision, or research link.
- Production: video edit, manuscript, podcast session, scroll story, course, comic, gallery, or article.
- Output: rendered video, short, podcast audio, episode page, book export, social packet, or course package.
- Publication: intended destination, schedule, copy, platform-specific payload, and status.
- Receipt: proof that something was posted, scheduled, published, paid, or measured.
- Analytics: response, reach, engagement, revenue, learning, and next-action evidence.

If a future app needs its own local cache or native data store, it still syncs
back to these shared concepts instead of inventing a private parallel truth.

## Creative partner rule

Codex, Quipslys, and other agent collaborators are counted as creative
participants in the Quipsly production loop.

They may create real work, not only placeholders:

- research packets
- book sections
- episode notes
- storyboard beats
- article drafts
- social copy
- short captions
- publishing packets
- edit decisions
- metadata and platform descriptions

This is required for dogfooding. Quipsly cannot prove the full Nest -> Studio ->
Tower loop if agents have to wait for a human to supply every paragraph, clip
idea, caption, source summary, or article draft before the product can move.

The safeguard is not agent paralysis. The safeguard is visible truth:

- authorship: human-authored, agent-authored, or mixed-authorship
- intent: disposable fixture, serious first pass, review-ready, approved, or canonical
- provenance: source-aware, freeform, prompt-derived, imported, or mixed
- review state: needs review, accepted, revised, rejected, scheduled, or published
- reversibility: diff, ledger, receipt, rollback, or recoverable source trail

Do not call all agent-created content placeholder work by default. Placeholder
content is valid when the goal is disposable testing. Serious agent-authored
content is valid when the goal is to create something worth reviewing or
publishing.

Agents are not limited to filling gaps after humans create source material.
When the loop needs real material, Codex and Quipslys may create the working
material themselves: book passages, article drafts, research packets, story
beats, storyboard scripts, social copy, teaching examples, and publication
packets. The product should treat that work as content with provenance, review
state, and publication state, not as a lesser class of text.

This is especially important for dogfooding. If Quipsly waits for Charlie,
Homer, Mako, or Melissa to provide every piece of source content before Nest,
Studio, and Tower can be exercised, the product will under-test the exact
creative pipeline it is supposed to make easier.

## Nest

Tagline: capture, curate, cultivate.

Human feeling: warm, protected, organic, forgiving.

Primary job:

- Catch raw material before it disappears.
- Help creators organize chaos without making capture feel like paperwork.
- Let Quipsly assistants fetch context, suggest links, tag, compare, and organize.
- Keep authors, researchers, coaches, and creators close to their source material.

Likely surfaces:

- Web Nest hub.
- Native Mac Nest app for writing, study documents, asset libraries, chat, and project work.
- Native iPhone/iPad capture apps for notes, voice, camera, scan, links, and quick tagging.

Example High Ground Odyssey jobs:

- The book/manuscript lives mostly here.
- Episode planning notes and source passages live here.
- Raw brainstorm calls and podcast prep notes land here.
- Media can be attached to a Nest, but reusable assets may also start in a Home Nest.

## Studio

Tagline: create, captivate, integrate.

Human feeling: focused, calm, capable, professional, low-friction.

Primary job:

- Turn source truth into finished work.
- Provide specialized creation tools without losing provenance.
- Keep source media and documents intact; edit through metadata, recipes, decisions, and versions.
- Make agents and humans able to use the same creative surfaces.

Likely surfaces:

- Quipsly Studio Video: native Mac editor first, then iPad where it genuinely helps.
- Writing Studio: focused manuscript/draft production when Nest writing needs a production mode.
- Scroll Studio: stories, comics, courses, photo galleries, and mobile-native content packages.
- Audio/Session Studio: podcast, coaching, call capture, transcript, and episode prep.

Example High Ground Odyssey jobs:

- Episode 1-3 original Quipsly edits.
- 16:9 YouTube episode masters.
- 9:16 Shorts/Reels/TikTok-style clips.
- Podcast audio exports.
- Transcript-aware editing and clip discovery.
- Agent first-cut editing and human correction notes.

## Tower

Tagline: publish, analyze, monetize.

Human feeling: clear, panoramic, relieved, confident.

Primary job:

- Turn outputs into real publication workflows.
- Track where each artifact is going, when it ships, and what proof exists.
- Keep publishing, receipts, monetization, and analytics calm instead of scattered across ten tabs.
- Help creators learn from response without making data feel like judgment.

Likely surfaces:

- Web Tower dashboard for publishing calendars, receipts, analytics, and monetization.
- Native Mac Tower app only if heavy operator workflows need it.
- iPhone/iPad Tower views for quick status checks, approvals, and receipt capture.

Example High Ground Odyssey jobs:

- YouTube long-form publishing packet.
- YouTube Shorts, Instagram, Facebook, LinkedIn packets.
- Patreon posts and supporter updates.
- Podcast hosting/RSS/Spotify/Apple readiness.
- HighGroundOdyssey.com episode pages.
- Receipt tracking and analytics after publication.

## Boundary examples

The same object may appear in multiple lenses:

- A manuscript is born and organized in Nest, shaped in Studio when it becomes a production draft, and packaged in Tower when it becomes a book, article, episode page, or Patreon post.
- A raw recording lands in Nest, is synchronized and edited in Studio, and becomes several Tower outputs.
- A short clip recipe belongs to Studio while it is being edited, then becomes a Tower publication packet with copy, schedule, receipt, and analytics.
- A quote may be captured in Nest, designed in Studio, and distributed through Tower or QuipLore.

The boundary is not "which app owns the object." The boundary is "what job is
the human trying to do right now?"

## Near-term build strategy

Do not start five full native apps at once.

Use the High Ground Odyssey proof chain:

1. Nest: keep the book, episode notes, source passages, chat, and raw project truth connected.
2. Studio: finish the native video editor loop for Episodes 1-3, including shorts and podcast audio.
3. Tower: build just enough publication packet, schedule, receipt, and analytics workflow to actually ship those episodes.

This lets the full product architecture grow from real work instead of a
beautiful diagram that nobody can use.

## Product guardrails

- Do not duplicate truth across Nest, Studio, and Tower.
- Do not block a user from work because a feature "belongs" to another lens.
- Do not let marketing language dictate schema.
- Do not turn every output type into a separate silo.
- Do not build rigor gates that judge the user; show available evidence and next actions.
- Do not make humans the bottleneck for every serious draft or source packet.
- Do make capture faster than the user's default note app.
- Do make Studio tools better than tolerating Premiere/Canva/Docs pain.
- Do make Tower prove publication truth through receipts, not vibes.
- Do let Codex and Quipslys create serious publishable-intent artifacts when that helps the loop move, then keep authorship/review/canon/publication truth clear.

## Open decisions

- Which native Nest app comes first: Mac writing/study hub, iPhone capture, or iPad reading/annotation?
- Does Tower need a native Mac app soon, or is the first serious Tower surface web-first?
- Which Studio products earn separate native apps versus modes inside one Studio shell?
- How much publication automation should be direct integration versus packet/receipt-assisted manual workflow at beta?
- How do we price or limit high-token assistant drafting while keeping Quipsly useful for real creative work?

## Working answer for now

The current build loop remains:

Nest captures and organizes High Ground Odyssey truth.
Studio edits Episodes 1-3 and creates shorts/podcast outputs.
Tower prepares publication packets and receipt tracking.

Build the full lifecycle through one real creative proof chain before splitting
the company into many app teams.

## 2026-06-19 implementation checkpoint

The first native Studio slice now carries a small Nest layer directly inside the episode session:

- `NestDocument` holds seeded episode context or authored writing drafts.
- `NestBlock` holds reviewable source snippets, production-source references, or human/agent working notes.
- Seeded Episodes 1-3 context uses local artifacts first and keeps HighGroundOdyssey.com / YouTube references as fallback, not silent manuscript truth.
- `/state.nest` exposes document/block counts, selected document/block, fallback-source policy, and safe agent commands.

This is not the final Nest app. It is the first shared-truth bridge proving that Nest writing/context can travel with Studio editing and Tower publishing without becoming a disconnected silo.

## 2026-06-19 implementation checkpoint - Episode Spine as the loop contract

The native QuipslyStudio app now has an Episode Spine contract for the practical loop:

- Nest: source context, draft writing blocks, and review-labeled book/episode material.
- Studio: whole-lane proxy-first edit state, shorts recipes, and render readiness.
- Tower: publish ledger, release handoff artifacts, platform destinations, and receipt proof.

The design rule is intentionally strict: these are lenses over one production episode, not three disconnected applications. The current Episode 1 proof state is healthy but incomplete: Nest is seeded, Studio is render-ready, and Tower needs generated handoff artifacts plus real platform receipts before anything is considered published.

Homer chapter files from `apps/web/content/_inbox/HighGroundOdysseyBook` are treated as source context. They should help the product prove writing/research continuity, but they do not override Charlie/Homer reviewed manuscript truth.

## 2026-06-19 checkpoint - Episode 1 reached Tower handoff readiness

Episode 1 now proves the first honest connected loop better than before:

- Nest can seed episode/book context and expose it as review-labeled source material.
- Studio can hold the proxy-first edit, short recipes, and render/export derivative artifacts.
- Tower can assemble local publication handoff folders and keep receipt truth separate from artifact readiness.

Current verified status from `/episode_spine`: `ready-for-platform-posting`. This means artifacts are ready for human review and manual platform posting. It does not mean published. The next product need is a calmer receipt-capture and platform-posting workflow so publication proof is as easy to collect as artifacts are to generate.

## 2026-06-19 checkpoint - Tower receipt cockpit clarifies publication truth

The first receipt cockpit now exposes publication proof as its own operator workflow:

- `publicationReceiptCockpit.status`
- family summaries for 16:9 master, podcast audio, and social shorts
- platform summaries for YouTube, Patreon, podcast platforms, and social destinations
- a single next receipt target with a copyable command shape

This keeps the Tower lens honest. Local artifacts are ready for posting, but the episode is not published until public/scheduled URLs, provider IDs, or equivalent receipts are captured.

## Agent creative partner doctrine

The Nest / Studio / Tower loop assumes agents can produce real work, not only test placeholders.

Codex and Quipslys may draft source packets, write article/post/chapter drafts, make storyboard passes, generate short-copy candidates, prepare publication packets, and perform first-pass creative production. The product boundary is not "agents cannot create." The product boundary is "creation stays inspectable."

Every serious output should be able to answer:

- Who or what created this?
- What context, sources, or prior decisions informed it?
- Is it placeholder, draft, review-ready, approved, canonical, scheduled, or published?
- What changed after human or agent review?
- How can we revise, compare, or roll it back?

This doctrine matters because Quipsly must dogfood its own creative pipeline at product-development speed. Waiting for humans to supply every piece of content would starve the loop we are trying to prove.

In practical terms, agent-created content is part of the Nest / Studio / Tower operating model:

- Nest can hold agent-authored blocks beside human-authored and source-context blocks.
- Studio can use agent-created cuts, captions, storyboards, scripts, and short recipes as serious review candidates.
- Tower can use agent-prepared copy, packets, checklists, and receipts as production-support artifacts.

Agent work should not be demoted to "placeholder" unless it was intentionally made as a fixture. The system needs a visible state machine instead: placeholder, source-context, agent-first-pass, mixed draft, human-reviewed, canon-approved, render-ready, publication-ready, scheduled, published.

This is how Quipsly avoids black boxes while still using the full creative force of AI.

Focused operator doctrine and the current Episode 1 provenance packet live here:

- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/quipsly-content-partner-doctrine.md`
- `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/provenance-packets/episode-1-writing-provenance.json`

## 2026-06-19 checkpoint - Receipt truth enters the human Tower surface

The receipt cockpit is now visible inside the native Publish workbench, not only available through `/state` or `agentctl`.

The Tower lens now has a clearer operator path:

1. prepare exports and platform packets
2. review/approve the work
3. post or schedule on the destination platform
4. capture the receipt
5. let analytics attach to proved destinations later

The UI still does not pretend to publish through provider APIs. That restraint is intentional. The first Tower loop is a truthful command center before it becomes an integration layer.

## 2026-06-19 checkpoint - Durable Tower ledger beats transient path memory

Episode Spine now treats prepared social and podcast lanes as ready when the publish ledger contains artifact-ready, copy-ready records, even if the current app launch has not regenerated every helper path variable.

This matters because the spine is the shared contract between Nest, Studio, Tower, and agents. It should survive relaunches and handoffs by reading durable production truth first. Session-local path fields are helpful operator conveniences, not the canonical release state.
