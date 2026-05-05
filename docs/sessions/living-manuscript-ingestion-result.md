# Living Manuscript Ingestion Result

Date: 2026-05-05

## Method

Used a preservation-first local OOXML parse with Python `zipfile` + `xml.etree.ElementTree`.

Reason:

- `pandoc` was not available locally in this environment
- the DOCX contained extractable `word/comments.xml`
- the manuscript appears to use textual chapter markers rather than reliable Word heading styles

## Files created or updated

Created:

- `apps/web/content/books/learning-to-lead/sources/leadership-my-story-24MAR19.baseline.md`
- `apps/web/content/books/learning-to-lead/sources/leadership-my-story-24MAR19.comments.json`
- `apps/web/content/books/learning-to-lead/sources/leadership-my-story-24MAR19.outline.md`
- `docs/sessions/living-manuscript-ingestion-result.md`

Updated:

- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- `apps/web/content/books/learning-to-lead/arrangements/book-v1.yml`
- `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`
- `apps/web/content/books/learning-to-lead/arrangements/public-site.yml`

## Comments extraction

- Comments extracted: yes
- Extracted comments count: 12
- Output file: `apps/web/content/books/learning-to-lead/sources/leadership-my-story-24MAR19.comments.json`

## Living manuscript seeding

- Coarse `ManuscriptBlock` count: 17
- Voice used: `homer`
- Status used: `baseline`
- Granularity: acknowledgments, preface, introduction, chapter-scale blocks, and one ending/extra-material block

## Conversion issues or suspicious sections

- Word heading styles were not meaningfully present; section detection relied on textual headings
- `Chapter five: Leaders Make It Happen` appears with lowercase `five` in the source
- `Chapter 8: Learn` appears with numeral `8` in the source
- `Chapter Nine: Leadership Philosophy` is extremely short in the source manuscript
- The source contains obvious fragment markers and incomplete lines in several places
- Concluding material continues after the main Chapter Twelve body and was split into `homer-ending-and-extra-material`

## Intentionally not done

- Did not alter current public route files in `apps/web/content/publish`
- Did not alter episode packets in `apps/web/content/episodes`
- Did not add Charlie material
- Did not polish or rewrite Scott/Homer’s prose
- Did not build generation logic
- Did not create a database-backed story-card layer
- Did not move the original DOCX from the repo root

## Recommended next action

Review the seeded baseline blocks section by section, then:

1. decide where Charlie reflections should pair with the Homer baseline
2. tighten obviously fragmentary sections while preserving provenance
3. introduce finer-grained sub-blocks only where arrangement reuse actually requires it
