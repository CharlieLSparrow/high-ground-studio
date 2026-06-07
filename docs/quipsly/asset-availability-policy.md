# Quipsly Asset Availability Policy

Updated: 2026-06-07

## Product Rule

A Nest is an attachment and collaboration point, not a storage bucket. Assets can be attached to one Nest, several Nests, or the user's private Home Nest while they are still being sorted.

The system should feel simple:

- Every signed-in user gets a private Home Nest.
- New uploads land in Home Nest unless a specific Nest is supplied.
- Attaching an asset to a working Nest makes it available there.
- Sharing a Nest shares the assets attached to that Nest.
- Sharing a Home Nest is allowed, but it is a deliberate collaboration action because it exposes the user's personal intake area.

## Availability Rule

An asset is visible to a user when at least one of these is true:

- The asset is attached to a Nest the user can read.
- The asset is attached to the user's Home Nest.
- The asset is a legacy `isGlobal` asset.

The preferred durable path is project attachment through `StudioMediaAsset.projects`. The old `isGlobal` flag remains as a compatibility bridge for existing demo/global assets, but new authenticated uploads should not rely on it.

## Current Implementation Contract

The application should preserve these rules in code:

- `ensureHomeNestForEmail()` creates a regular `StudioProject` Home Nest, owner grant, Home Vault document, and `Inbox` bin for each signed-in user.
- `/media` calls `ensureHomeNestForEmail()` before listing assets so a signed-in user always has a personal intake Nest.
- Mobile ingest endpoints attach to the supplied working Nest when a valid `projectSlug` or `projectId` is present.
- If mobile ingest has no valid working Nest, it should attach to the current actor's Home Nest.
- Manual or demo asset creation should attach to the selected Nest, or to the current actor's Home Nest when no working Nest is selected.
- New authenticated asset creation should set `isGlobal = false` whenever a Home Nest or working Nest attachment exists.
- `isGlobal = true` is reserved for legacy/demo compatibility when no authenticated actor or Home Nest context exists.

## Home Nest

Home Nest is implemented as an ordinary `StudioProject` with:

- `sourceLabel = nest-kind:home`
- an owner `StudioProjectAccessGrant`
- an `Inbox` `MediaBin`
- normal `StudioMediaAsset.projects` attachments

This keeps one asset system. We do not need a separate private-media library, asset ACL table, or team-ingestion table until a real workflow proves that project grants are not expressive enough.

## Attach And Detach Behavior

Attach:

- Connect `StudioMediaAsset.projects` to the selected Nest.
- Set `isGlobal` to false for that asset.

Detach:

- Disconnect the selected Nest.
- If that would leave the asset attached nowhere, reattach it to the actor's Home Nest.
- Only fall back to `isGlobal` when there is no signed-in actor/Home Nest context.

Sharing:

- Access to a working Nest exposes assets attached to that working Nest.
- Access to Home Nest exposes personal intake assets attached to Home Nest, so sharing Home Nest should be deliberate and clearly explained.
- Do not add separate per-asset sharing UI until there is a real workflow that cannot be expressed as Nest attachment.

## Team Intake

Team-wide intake should use a shared Nest, for example `Marine Biology Intake` or `Homer Travel Footage`. That Nest can be shared with the team, and anything attached there becomes available to that team without inventing a second sharing model.

## Future Pressure Points

Add a true asset-level grant table only if users need to share one file without sharing any Nest.

Add shared media trees only if MediaBin sharing becomes a real workflow, such as "share this footage folder with three unrelated Nests."

Add storage ownership/accounting only when billing, quota, deletion rights, or cloud-cost ownership becomes concrete.
