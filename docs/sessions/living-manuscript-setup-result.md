# Living Manuscript Setup Result

Date: 2026-05-05

## Added

Created the first preserved folder and file structure for the `Learning to Lead` living manuscript system:

- `apps/web/content/books/learning-to-lead/README.md`
- `apps/web/content/books/learning-to-lead/sources/README.md`
- `apps/web/content/books/learning-to-lead/manuscript/README.md`
- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- `apps/web/content/books/learning-to-lead/arrangements/README.md`
- `apps/web/content/books/learning-to-lead/arrangements/book-v1.yml`
- `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`
- `apps/web/content/books/learning-to-lead/arrangements/public-site.yml`
- `apps/web/content/books/learning-to-lead/generated/README.md`
- `apps/web/content/books/learning-to-lead/templates/manuscript-block-example.mdx`
- `apps/web/content/books/learning-to-lead/templates/arrangement-example.yml`
- `docs/architecture/living-manuscript-system.md`

Also added a short cross-reference to the new system in:

- `docs/architecture/content-pipeline.md`

## Intentionally not done

- Did not convert the root DOCX
- Did not move the root DOCX
- Did not create baseline Markdown
- Did not extract comments
- Did not seed real manuscript blocks
- Did not generate outputs
- Did not modify `apps/web/content/publish`
- Did not modify current packet files
- Did not change route behavior

## Recommended next prompt

Convert the root DOCX into preserved baseline Markdown, extract comments/provenance, and seed coarse first-pass blocks into:

- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
