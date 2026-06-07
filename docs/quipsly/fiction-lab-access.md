# Fiction Lab Access

Updated: 2026-06-07

## Product Rule

`charlie-melissa-fiction-lab` is the private Nest for Charlie and Melissa fiction/comic source work.

It should be visible only to:

- explicitly granted users through `StudioProjectAccessGrant`,
- configured Quipsly admins in admin registry views,
- bootstrap private-fiction owner emails used for recovery/import workflows.

Unauthorized users should not see the Nest on `/projects` and should receive `notFound()` on private fiction packet routes.

## Current Surfaces

- `/nests/charlie-melissa-fiction-lab`: normal Nest dashboard with document, access, media, private packet, scroll preview, and storyboard links.
- `/create?project=charlie-melissa-fiction-lab`: private living story-bible/source document.
- `/nests/charlie-melissa-fiction-lab/access`: invite/view collaborator grants.
- `/fiction-tools/private/my-heart-is-a-junkyard-starship/issue-001-tenderness-of-unlawful-design`: guarded private packet route.
- `/fiction-tools/private/my-heart-is-a-junkyard-starship/issue-001-tenderness-of-unlawful-design/scroll`: guarded vertical scroll preview.

## Data Posture

The repo-local private fiction seed remains source material for now. DB rows are projections for story bible, storyboard, and scroll tooling.

Do not create a second project slug for this comic work. Use `charlie-melissa-fiction-lab` as the Nest/project attachment point.

## Agent Guidance

- Do not expose private fiction packet routes in public marketing or output pages.
- Do not add broad fallback access to fiction tools.
- Prefer Nest grants over hardcoded email exceptions for collaborators.
- Keep generated drafts, panels, story bible entities, and storyboard frames traceable back to the source packet or approved user edits.
