# Legacy Editor Quarantine

Status: active safety note.

The old editor code is not deleted because it may still contain recoverable
ideas, but it must not be treated as active product code.

## Active editor

```text
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
```

This is the native editor to build, run, test, and improve.

## Quarantined editor/reference trees

```text
/Users/wall-e/Dev/high-ground-studio/apps/quipsly-mac
/Users/wall-e/Dev/high-ground-studio/apps/quipsly-video
```

These folders are allowed to exist as archaeology. They are not allowed to pull
new feature work away from QuipslyStudio.

## What quarantine means

- Do not add new editor features to quarantined trees.
- Do not run quarantined apps as proof that QuipslyStudio works.
- Do not copy old workflows directly into QuipslyStudio if they violate the
  whole-source/proxy-first/metadata-decision model.
- If a useful idea is recovered, rewrite it in QuipslyStudio terms:
  Source Grove, Program Output, Episode Spine, SHOW/SKIP metadata, short
  recipes, transcript packets, release packets, and proof ledgers.

## When moving code out of the repo makes sense

Moving old folders outside the repo can reduce fear and agent confusion, but it
should be done as an explicit cleanup operation rather than as an emotional
panic delete.

Recommended future operation:

1. Confirm no active scripts import from the legacy folders.
2. Copy or move the old trees to a dated archive folder outside the active repo,
   for example:

   ```text
   /Users/wall-e/Dev/_quipsly-legacy-archives/YYYY-MM-DD/
   ```

3. Leave a tiny tombstone README in each old repo location pointing to the
   archive and the canonical QuipslyStudio path.
4. Re-run only the narrow checks needed to prove QuipslyStudio still launches.

Until that operation happens, this document is the warning label on the crypt.

## Agent instruction

If you are an AI agent and your task touches a native editor, start here:

```text
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
```

If you think you need `apps/quipsly-mac` or `apps/quipsly-video`, stop and
explain why before editing.
