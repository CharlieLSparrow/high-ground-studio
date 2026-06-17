
## Codex sprint note - 2026-06-05 art manifest integration

- New shared manifest: `packages/quipsly-domain/src/generated-art.ts`.
- Public images are duplicated into both app public folders intentionally because each Next app serves its own `/public` directory.
- Watch for future drift: if an asset is renamed in one app, keep both public folders and the manifest aligned.
- Long-term target: move approved art into a bucket/CDN or shared asset pipeline instead of committing large PNG batches to every app.
