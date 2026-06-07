# ComfyUI workflow templates

This folder is for API-format ComfyUI workflows that Codex can safely fill from a Quipsly art brief.

## Template rule

Export a ComfyUI workflow in API format, then replace the text prompt fields with these placeholders:

- `__QUIPSLY_POSITIVE_PROMPT__`
- `__QUIPSLY_NEGATIVE_PROMPT__`
- `__QUIPSLY_ROLE__`
- `__QUIPSLY_SUBJECT__`
- `__QUIPSLY_SURFACE__`

Then queue it with:

```bash
pnpm quipsly:art:comfy -- --brief docs/quipsly/art/generated-briefs/example.json --workflow docs/quipsly/art/comfy-workflows/your-workflow.json
```

Use a dry run when you only want to inspect the brief payload:

```bash
pnpm quipsly:art:comfy -- --brief docs/quipsly/art/generated-briefs/example.json --dry-run
```

The script defaults to `http://127.0.0.1:8188` and also respects `COMFYUI_URL`.

## Safety

- Do not commit model files, generated previews, or massive ComfyUI outputs here.
- Do not hardcode local absolute model paths in reusable templates if avoidable.
- Keep generated image ingestion going through `pnpm quipsly:art:ingest` or the shared manifest path.
