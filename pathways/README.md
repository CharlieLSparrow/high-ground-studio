# Pathways Study Workbench

Local-first tools for turning public BYU Pathway / BYU-I course pages into one editable study surface.

## What This Gives You

- Imports the existing course-map CSVs into a structured SQLite database.
- Fetches public course pages, extracts lesson text, source links, media links, and available caption/transcript files.
- Generates `web/data/course_data.json` for the browser app.
- Opens a static study workbench where source material stays read-only and your working version is editable.
- Saves rewrites, hidden/deleted blocks, tags, annotations, and transcript notes in browser storage.
- Exports and imports your personal study layer as JSON.
- Exports course Markdown notes from your edited working copy, including focused review sheets.

## Quick Start

Install UI dependencies:

```bash
npm install
```

Build Tailwind styles:

```bash
npm run build:css
```

During UI work, keep Tailwind watching:

```bash
npm run watch:css
```

Build or refresh the data:

```bash
python3 scripts/ingest_course_materials.py --source-csv byu_pathway_full_course_map.csv
```

Run the full local app with SQLite-backed autosave:

```bash
python3 scripts/workbench_server.py --port 8788
```

Then open:

```text
http://127.0.0.1:8788
```

Run the static-only fallback:

```bash
python3 -m http.server 8787 -d web
```

Then open:

```text
http://localhost:8787
```

The static fallback still edits in the browser, but it cannot sync your study layer to `data/pathways_user.sqlite` or use the SQLite search API.

## Review Exports

The app can export:

- Full edited course
- Only rewritten blocks
- Only annotated blocks
- All blocks tagged `example`
- All blocks tagged `confusing`
- Any custom tag

Use the Review Export panel on the right side of the app. Preview shows the matching block count before export.

## Browse Model

The first screen is a visual course catalog:

- Course cards show lesson count, block count, media count, edit progress, and a compact lesson map.
- Catalog filters narrow by certificate/path, search text, and sort order.
- The lesson shelf for the active course shows page/block/media counts and tag signals for each lesson.
- Opening a course or lesson jumps into the editable study reader below the catalog.

The UI uses Tailwind CLI output in `web/tailwind.generated.css` plus project-specific CSS in `web/styles.css`.

## Person And Agent Surfaces

- Header modes split the workspace into `Browse`, `Study`, `Review`, and `Agent`.
- `Focus` in the header collapses browsing/sidebar panels into the study reader.
- The Study Cockpit shows active shelf, touched blocks, visible courses, and shelf progress.
- Review mode builds a queue from tagged blocks and can mark items as `mastered`.
- The Agent Context panel exports the current course, filters, selection, storage state, key files, and operating commands.
- Rendered course, lesson, page, and block nodes include stable `data-agent-*` attributes for browser automation and future agents.

If network access is unavailable, generate a link-only seed from the audited CSV:

```bash
python3 scripts/ingest_course_materials.py --offline
```

For the smaller curated page set, omit `--source-csv byu_pathway_full_course_map.csv`. The broader full map captures more public URLs, including downloadable resources that may only produce source-link placeholder blocks.

Import one course while developing:

```bash
python3 scripts/ingest_course_materials.py --course CSE-110
```

Search the imported SQLite index:

```bash
python3 scripts/search_course_materials.py "functions" --course "CSE 111"
```

Generate the full-degree assignment summary from the same assignment terms used by the UI filter:

```bash
python3 scripts/summarize_assignments.py
```

This writes `docs/full-degree-assignment-summary.md` for reading and `web/data/assignment_summary.json` for app/agent use.

## Course Project Workspace

Use `course-projects/` for your own coursework projects, code, submissions, experiments, and project notes. It has one folder per imported course and stays separate from refreshable source data.

Scaffold study-example completion folders from the assignment summary:

```bash
python3 scripts/scaffold_example_completions.py
```

The scaffold command is conservative by default: it creates missing files and skips anything that already exists, so your edited examples are not overwritten. Use `--force` only when you intentionally want to regenerate scaffold files.

## Data Files

- `byu_pathway_course_pages_audited.csv`: audited public course page map.
- `byu_pathway_full_course_map.csv`: broader crawler map used for the full public-content import.
- `data/pathways_workbench.sqlite`: normalized imported source data.
- `blocks_fts` in SQLite: full-text index over course code, lesson, page title, and source text.
- `web/data/course_data.json`: app-ready source snapshot.
- `data/pathways_user.sqlite`: your synced edits, tags, annotations, hidden blocks, and pasted transcripts when using `scripts/workbench_server.py`.
- Browser local storage: fallback copy of your edits, tags, annotations, and hidden blocks.

See `docs/architecture.md` for the data model and next build path.

## Design Boundary

The importer treats course pages as source material. The app never mutates that source. Your edits live in a separate personal layer, so refreshes can pull new source material without overwriting your rewritten notes.
