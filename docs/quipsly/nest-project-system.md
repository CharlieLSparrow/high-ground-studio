# Quipsly Nest Project System

## Product language

Use **Nest** in the UI for the user-facing project container.

The backing Prisma model can remain `StudioProject` for now. That lets us ship the product language without forcing a schema migration every time the product metaphor gets clearer.

## Current model

- A **Nest** is the container for one body of work: a book, course, study library, fiction world, podcast season, media production, gallery, or research packet.
- A **writing document** is for original authoring: books, articles, talks, scripts, show manuscripts, and other work the human is writing.
- A **study document** is source-first: imported books, course pages, research pages, highlights, notes, and analysis layered over original source text.
- A **public packet** is the safe projection sent to a public destination like HighGroundOdyssey.com. Public packets must not contain private operator notes, messy drafts, or backstage metadata.

## Current implementation

- UI route: `/projects` is the Nest hub.
- Compatibility route: `/nests` renders the same hub.
- Existing create route: `/create?project=<nest-slug>` opens the living document for a Nest.
- Backing model: `StudioProject`.
- Temporary type carrier: `StudioProject.sourceLabel = nest-kind:<kind>`.
- Document title carries the first-document shape until we add first-class document metadata.

## Important publishing distinction

The document outline count is generated from tagged Chapter/Episode heading blocks in the current Nest.

The HighGroundOdyssey publisher panel can show more published episodes than the outline because Episodes 1-3 currently come from safe starter public packets. The next bridge should generate those packets from tagged Chapter/Episode boundaries with a preview diff before public publish.

## Future schema pass

When the workflow proves itself, add first-class fields instead of encoding in `sourceLabel`:

- `StudioProject.nestKind`
- `StudioDocument.documentKind`
- `StudioDocument.sourceIngestMode`
- `StudioDocument.originalSourceJson`
- `StudioPublicProjectionDestination`

Do this as an additive migration with runtime fallback for old records.
