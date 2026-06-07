# Quipsly Nest project system

Last updated: 2026-06-05

## Product rule

A Nest is the beta-user-facing project boundary.

Documents are work surfaces inside a Nest. Media, recorder rooms, editor timelines, assistant sessions, research packets, publishing packets, and analytics must attach to the Nest instead of drifting into hardcoded defaults.

## Beta default

Do not silently route users into a shared manuscript or dev lab when a route is missing `project`.

Safe fallback behavior:

- `/create` without `project` should route to `/projects?fallback=true`.
- recorder/call/editor/media APIs should ask for a Nest or return a clear missing-project state.
- owner-only shortcuts may link to the High Ground Odyssey manuscript, but they should be explicit.

## Document kinds

Quipsly needs at least two first-class document experiences:

- `Writing document`: original authoring. Books, articles, talks, scripts, episodes, coaching content, and publishable source material.
- `Study document`: source-aware reading and analysis. Imported books, course pages, PDFs, web pages, quotes, highlights, annotations, and notes layered on top of source material.

Both should use the same living-document spine where possible:

- text remains editable,
- structure is represented by Chapter and Episode heading tags,
- lenses hide or focus content without copying it,
- publishing and media tools pull from tagged boundaries.

## Starter document rule

New Nests should seed a real editable welcome/how-to document inside the editor. Starter documents should also teach likely output paths from the shared output catalog so beta users understand that books, courses, episode pages, feeds, quote cards, and galleries are projections from the same Nest.

This is intentional. Users should learn Quipsly by editing the same type of document they will use for real work, not by reading a detached tutorial page.

Current starter seeds live in:

- `apps/quipsly/src/app/(app)/create/starterDocuments.ts`

Each Nest kind gets a starter document shaped for the work:

- `writing`: one living document, Chapter/Episode headings, show notes, quotes.
- `study`: source notes, questions, highlights, research packets.
- `production`: episode control room, clip cues, media, sync safety.
- `research`: evidence packets, quotes, sources, examples.
- `fiction`: story bible, scenes, continuity notes.
- `course`: lessons, checks, SCORM/mobile learning flow.
- `gallery`: client review, selections, media grouping.
- `mixed`: flexible start-anywhere workspace.

## Anti-regression checks for agents

- Do not add new route-level defaults that silently use `quipsly-dev-lab`.
- Do not hardcode the High Ground Odyssey manuscript as the fallback for beta users.
- Do not create project/document records from access-check helpers.
- Do not make Study documents a separate app if the tagged living-document spine can support them.
- Do not let media import, recorder, or publishing writes proceed without an explicit `projectSlug`.


## 2026-06-05 Codex beta update: customer-facing Nest route and document kinds

Current product language:

- **Nest** is the customer-facing project container.
- `StudioProject` remains the backing database implementation.
- `/projects` remains the existing hub route.
- `/nests` is now a customer-facing alias for the same hub.
- `/nests/<slug>` redirects into `/create?project=<slug>` so links can use Nest language without duplicating editor code.

Shared document-kind vocabulary now lives in `packages/quipsly-domain/src/nests.ts`:

- `original-content`: living manuscripts, articles, books, scripts, talks, podcast episode writing.
- `study-source`: imported books, course pages, web pages, transcripts, and other source material with overlays on top.
- `research-packet`: curated source, quote, example, citation, and note bundles.
- `production-room`: episode recording, timeline, transcript, and media-sync workspaces.
- `publish-packet`: public-safe projections for owned sites, feeds, social, Patreon, courses, galleries, and exports.

Design rule: do not split these into disconnected products unless the tagged living-document spine genuinely cannot support the workflow. Start by adding document kinds, packet views, overlays, and destination states around the Nest.
