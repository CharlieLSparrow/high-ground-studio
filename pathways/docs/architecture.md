# Study Workbench Architecture

## Core Idea

The workbench separates course source material from the learner's working copy.

- Source layer: imported public course pages, stored in SQLite and generated JSON.
- Working layer: edits, tags, annotations, hidden blocks, and pasted transcripts, synced to local SQLite when `scripts/workbench_server.py` is running and mirrored in browser local storage as a fallback.
- Export layer: Markdown study notes generated from the current course and your working copy.

This keeps refreshes safe. The importer can rebuild source data from upstream pages without overwriting personal notes.

## Import Pipeline

`scripts/ingest_course_materials.py` can read either course map CSV. The full public-content run uses `byu_pathway_full_course_map.csv`; the smaller curated run uses `byu_pathway_course_pages_audited.csv`. It fetches each reachable page, extracts readable blocks, links, media references, and direct transcript files where available.

Outputs:

- `data/pathways_workbench.sqlite`
- `web/data/course_data.json`

SQLite tables:

- `courses`
- `pages`
- `blocks`
- `blocks_fts`
- `media`
- `transcript_cues`
- `import_runs`

`blocks_fts` is an FTS5 index for source search outside the browser app.

Non-HTML resources such as `.docx`, `.pdf`, `.xlsx`, `.py`, images, archives, and some raw text assets may be stored as source-link placeholder blocks when the importer cannot extract readable page text from them. The source URL remains available in the app and SQLite.

## Browser App

The static app in `web/` loads `web/data/course_data.json`.

Styling is split between generated Tailwind CSS and project CSS:

- `web/tailwind.input.css`: Tailwind v4 input and source hints.
- `web/tailwind.generated.css`: generated Tailwind CLI output served by the app.
- `web/styles.css`: project-specific component styling and layout refinements.

Main workflow:

1. Browse the visual course catalog.
2. Filter by certificate/path, search text, material size, media, or edit progress.
3. Pick a course or lesson from the catalog shelf.
4. Read source blocks on the left side of each study row.
5. Rewrite or delete in the editable working block on the right.
6. Tag blocks from the inspector.
7. Add annotations and examples.
8. Paste transcripts or caption text when needed.
9. Export either the backup JSON study layer or focused course Markdown notes.

Catalog-derived stats are calculated in the browser from the imported source snapshot and the local study layer. They are intentionally cheap and reversible: course cards and lesson cards are navigation surfaces, not canonical records.

## Workspace Modes

The header mode dock sets `body[data-ui-mode]`:

- `browse`: catalog, course cards, aisle filters, study cockpit, and lesson shelf.
- `study`: editable source/working-copy reader.
- `review`: tag-driven review queue with a mastered action.
- `agent`: inspector-oriented view for context export and handoff.

`Focus` is separate from mode selection. It adds `body.focus-mode` and temporarily hides catalog/sidebar/inspector surfaces so the reader is centered.

## Agent-Friendly UI Contract

Rendered UI nodes include stable machine-readable attributes:

- Course cards: `data-agent-course-code`, `data-agent-certificate`, `data-agent-page-count`, `data-agent-block-count`, `data-agent-touched-blocks`
- Lesson cards: `data-agent-course-code`, `data-agent-lesson`, `data-agent-page-count`, `data-agent-block-count`, `data-agent-touched-blocks`
- Page sections: `data-agent-page-id`, `data-agent-course-code`, `data-agent-lesson`, `data-agent-source-url`
- Study blocks: `data-agent-block-id`, `data-agent-page-id`, `data-agent-course-code`, `data-agent-lesson`, `data-agent-block-type`, `data-agent-block-position`, `data-agent-source-url`

The Agent Context panel creates a compact JSON packet from browser state. It is intended for handoff, debugging, and future automation without requiring another agent to infer current state from the DOM.

The app is intentionally static: no build step, no npm install, and no server-side auth. A local HTTP server is enough.

## Local API Server

`scripts/workbench_server.py` serves `web/` and adds a local API:

- `GET /api/health`: server and database status.
- `GET /api/state`: current personal study layer from `data/pathways_user.sqlite`.
- `POST /api/state`: replace the personal study layer from the browser's current edited state.
- `PUT /api/blocks/{block_id}`: upsert one edited block state.
- `DELETE /api/blocks/{block_id}`: remove one edited block state.
- `PUT /api/transcripts/{block_id}`: upsert pasted transcript cues for one block.
- `DELETE /api/transcripts/{block_id}`: remove pasted transcript cues for one block.
- `GET /api/search?q=...&course=...&limit=...`: SQLite FTS source search.

The browser detects this API automatically. If it is unavailable, the app falls back to browser-only storage. Normal editing uses the incremental block/transcript endpoints; full-state replacement is reserved for JSON import and localStorage-to-SQLite reconciliation.

User SQLite tables:

- `user_blocks`
- `user_transcripts`
- `user_events`

## Transcript Strategy

The importer records media links and direct `.vtt` or `.srt` transcript files when public pages expose them. Many course video platforms do not expose transcripts as direct public files, so the app also supports pasting VTT, SRT, or plain transcript text onto the selected block.

Future upgrade path:

- Add provider-specific transcript adapters only for sources the learner is authorized to access.
- Store pasted transcript cues in a file-backed user database instead of browser storage.
- Add timestamp links from transcript cues to matching video embeds where provider URLs support it.

## Next Useful Big Swings

- Add page/block virtualization if a single course view becomes slow on older machines.
- Add richer review sessions: queue by tag, track last reviewed time, and mark confidence.
- Add import adapters for Canvas exports or LMS-provided transcript downloads.
- Add side-by-side diffing between source blocks and rewritten working blocks.
