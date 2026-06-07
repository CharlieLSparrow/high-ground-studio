# Quipsly Live Nests Real-Work Path

Updated: 2026-06-06

## Product Rule

Real work starts from a Nest.

Routes like `/create`, `/editor`, `/recorder`, and `/call` are tools. They should be launched from a selected Nest whenever possible, and they should preserve the `project=<nest-slug>` query once launched.

## Current Live Path

1. `/projects` is the customer-facing Nest hub.
2. `/nests/[slug]` is the Nest control room.
3. `/create?project=<slug>` opens the living document spine.
4. `/editor?project=<slug>&episode=<episode-slug>` opens the media/timeline editor for the same Nest.
5. `/recorder?project=<slug>&episode=<episode-slug>` opens the recorder room for the same Nest.
6. `/call?project=<slug>&episode=<episode-slug>&room=<episode-slug>&role=host` opens the live-call room.
7. `/nests/[slug]/access` manages collaborator grants.

## Access Rule

Regular users should see Nests through explicit active `StudioProjectAccessGrant` records. Admins can see the full registry for management.

A private Home Nest is still an ordinary `StudioProject` with `sourceLabel = nest-kind:home`. New uploads should land in the user's Home Nest unless a working Nest is supplied.

## Admin Live Bootstrap

The `/projects` hub includes an admin-only `Bootstrap Live Nests` action. It creates or updates these real-work Nests without duplicating them:

- `high-ground-odyssey-manuscript`
- `quipsly-product`
- `marine-biology-research`
- `quiplore-quote-library`
- `charlie-melissa-fiction-lab`
- `homer-travel-footage`
- `photography-client-proofing`

The implementation lives in `apps/quipsly/src/lib/studio/live-work-nests.ts`.

## No Quality Gate Posture

Workflow labels like Data Ingestion, Knowledge Processing, Content Creation, and Content Publishing are transparent routing labels. They are not approval gates, confidence scores, or judgement calls.

The UI should show what is available and linked, then let humans decide what to do next.

## Agent Guidance

When building new features:

- Prefer launching tools from `/nests/[slug]`.
- Preserve explicit `project=<slug>` in tool routes.
- Do not create new dev-lab fallbacks for customer workflows.
- Do not list every project to a non-admin user.
- Attach media to Home Nest first if no working Nest is selected.
- Keep private fiction, marine biology, and HGO work access-controlled by Nest grants.
