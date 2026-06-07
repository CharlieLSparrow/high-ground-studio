# Quipsly Project Structure

Quipsly should feel like a grown-up creative workspace, not a pile of routes. The project model is:

1. Project

A project is the top-level container: `high-ground-odyssey-manuscript`, `quipsly-dev-lab`, a romance series, a course notebook, or a future client workspace.

Projects own documents, tags, media assets, episode production rooms, publishing state, and permissions.

Project slugs should not be scattered through routes. Quipsly uses a shared project registry at `apps/quipsly/src/lib/studio/project-registry.ts`.

Nests should also make output paths visible without turning each output into a separate authoring silo. The shared output catalog lives at `packages/quipsly-domain/src/output-catalog.ts`, with app views at `/outputs` and `/outputs/<outputId>`.

The live real-work route map is tracked in `docs/quipsly/live-nests-real-work.md`. The short version: `/projects` is the Nest hub, `/nests/[slug]` is the Nest control room, and tool routes like `/create`, `/editor`, `/recorder`, and `/call` should preserve an explicit `project=<slug>`.

That registry owns:

- slug normalization
- default project selection
- built-in bootstrap templates
- project creation
- living manuscript document creation
- project switcher listing

Routes may pass `?project=<slug>`, but they should not recreate workspace/project/document upsert logic locally.

2. Document

A document is the writing surface. It should feel like OneNote plus a manuscript editor: continuous, editable, and understandable without thinking about database rows.

The default document for a writing project is the living manuscript. Other documents can be notebooks, research packs, publishing plans, or onboarding guides.

3. Structure tags

`Chapter` and `Episode` are structure tags applied to heading blocks.

The document outline is derived from those tags in document order:

- A `Chapter` block starts a chapter range until the next chapter.
- An `Episode` block starts an episode range until the next episode.
- Episodes may visually nest under the most recent chapter.
- The title comes from the tagged block text.

Do not create special one-off tags like `episode-4` for normal manuscript navigation.

4. Annotation tags

Quotes, show notes, speaker labels, clip cues, internal notes, and similar marks are annotations on content. They are useful, but they should not crowd the primary authoring controls.

The manuscript UI should expose only the small set needed for the current work mode. Legacy tags may render so old data remains readable, but they should not become the core navigation model.

5. Production rooms

A production room is owned by a project and linked to an episode boundary. It owns recording state, imported media, spine audio, sync decisions, timeline clips, transcript state, and publishing packets.

The production room should not require the manuscript to carry video-specific state. It should reference the episode boundary and project, then keep media-specific metadata in production JSON or normalized media tables.

Production routes should call the shared project registry before creating `StudioEpisodeProduction`. This prevents `/create`, `/recorder`, `/call`, `/editor`, and AI media endpoints from accidentally creating different documents for the same project slug.

6. Media assets

Media assets are project-scoped first. They can optionally attach to an episode production room.

Media should be connected by stable IDs and explicit relationships, not by fragile manuscript tag piles.

7. Views and lenses

Views are filters over the same project data. They should hide or focus content, not create alternate truth.

Default lenses can be derived from document structure. Persisted custom views are useful later, but they should not replace the simple outline model.

8. Agent friendliness

Agents should be able to:

- Load a project by slug.
- Find the living manuscript document.
- Read structure boundaries from tagged heading blocks.
- Add/remove tags without needing hidden UI state.
- Find or create a production room for a selected episode boundary.
- Attach media assets to the project or episode room.
- Save reversible changes with clear undo history.

North star: the manuscript is the spine, the production room is the workshop, and tags/relationships are the connective tissue.
