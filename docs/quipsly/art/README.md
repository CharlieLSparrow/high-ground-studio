# Quipsly Art Foundry

Quipsly art should be treated as reusable product infrastructure, not loose screenshots in Downloads.

## Create a prompt brief

```bash
scripts/quipsly/create-quipsly-art-brief.mjs \
  --role librarian \
  --subject "finding examples in a writer's source library" \
  --surface "Quipsly marketing and Nest assistant sidebar"
```

This writes `.json` and `.md` briefs to `docs/quipsly/art/generated-briefs/`.

## Ingest fresh Downloads art

```bash
scripts/quipsly/ingest-quipsly-downloads.mjs --count 12 --hint "ChatGPT Image"
```

This copies the newest matching images into both:

- `apps/quipsly/public/images/quipsly-generated/`
- `apps/quiplore/public/images/quipsly-generated/`

After review, add named entries to `packages/quipsly-domain/src/generated-art.ts` so app pages use semantic IDs like `curious-librarian` instead of raw filenames.

## ComfyUI note

Use the generated prompt brief in local ComfyUI. If a stable ComfyUI workflow JSON becomes standard, add it under `docs/quipsly/art/comfy-workflows/` and teach `create-quipsly-art-brief.mjs` to fill the positive/negative prompt nodes.

Optional helper:

```bash
pnpm quipsly:art:comfy -- --brief docs/quipsly/art/generated-briefs/example.json --dry-run
pnpm quipsly:art:comfy -- --brief docs/quipsly/art/generated-briefs/example.json --workflow docs/quipsly/art/comfy-workflows/your-api-workflow.json
```

The helper only queues a real ComfyUI job when an explicit API-format workflow is supplied. It replaces `__QUIPSLY_POSITIVE_PROMPT__` and `__QUIPSLY_NEGATIVE_PROMPT__` placeholders before posting to local ComfyUI.

## Manifest APIs

Current approved/candidate art can be read from:

- Quipsly Nest: `/api/quipsly-art`
- Quipsly Nest library manifest: `/api/quipsly-art/library`
- QuipLore: `/api/quipsly-art`

Both routes return the shared `packages/quipsly-domain/src/generated-art.ts` manifest. The image files still need to exist in each app's `public/images/quipsly-generated/` folder until we move approved art to a shared bucket/CDN.

## Browser Art Foundry

Nest now includes `/art-foundry`, which has a browser prompt builder backed by `/api/quipsly-art/briefs`.

The brief endpoint also accepts `outputId` for output-aware briefs. Example payload:

```json
{
  "outputId": "youtube-video-package"
}
```

When `outputId` is present, the endpoint infers a sensible Art Foundry role and subject from `packages/quipsly-domain/src/output-catalog.ts`.

The browser prompt builder can also start from an output type such as YouTube package, SCORM course, quote feed, or photo gallery. That preselects a sensible helper role and product surface before generating the brief.

Use it when you want a quick on-demand Quipsly concept without shell access:

1. Pick a role.
2. Describe the subject.
3. Set mood and surface.
4. Copy the prompt into ComfyUI or another image generator.
5. Ingest the approved result and add it to the manifest.

QuipLore also has `/visual-library` for public browsing of the shared generated-art manifest.

The Art Foundry image library is filterable and copyable in-browser. Use it to copy public paths, alt text, or manifest JSON without guessing filenames.
