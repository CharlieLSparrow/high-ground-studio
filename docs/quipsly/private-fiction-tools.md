# Private fiction tools seed

Quipsly now has a repo-local private fiction seed for Charlie's comic/story experiments:

- Owner email: `CharlieLSparrow@gmail.com`
- Normalized access email: `charlielsparrow@gmail.com`
- Seed root: `content/private/fiction/charlie-l-sparrow/my-heart-is-a-junkyard-starship/`
- First issue: `issue-001-tenderness-of-unlawful-design`

This is intentionally not public content. It is source material for fiction tooling, story bible, storyboard builder, and vertical scroll experiments.

## Current seed files

- `source.md`: raw pasted packet.
- `issue.json`: canonical parsed issue packet with metadata, creative rules, acts, and 128 panels.
- `story-bible-seed.json`: import-ready entities, motifs, timeline events, and relationships.
- `storyboard-seed.json`: import-ready storyboard and frame data.
- `scroll-seed.json`: phone-first vertical scroll experience seed.
- `heartward-spiral-summary.md`: shared-universe notes from the same packet.

## Guarded API shape

The private loader is:

`/api/private-fiction/seeds/my-heart-is-a-junkyard-starship/issue-001-tenderness-of-unlawful-design`

Optional artifacts:

- `?artifact=issue`
- `?artifact=storyBible`
- `?artifact=storyboard`
- `?artifact=scroll`
- `?artifact=source`
- `?artifact=summary`

The endpoint requires a signed-in user whose email matches `CharlieLSparrow@gmail.com`. Non-authorized users receive a generic not-found response so private project names are not advertised.

## Private app surfaces

- `/fiction-tools/private/my-heart-is-a-junkyard-starship/issue-001-tenderness-of-unlawful-design`
- `/fiction-tools/private/my-heart-is-a-junkyard-starship/issue-001-tenderness-of-unlawful-design/scroll`

Both routes are guarded by `canAccessPrivateFictionNest()` and should return `notFound()` for unauthorized users.

## Quipsly DB projection

The local seed remains canon. Quipsly DB rows are projections that can be refreshed idempotently.

Importer script:

`scripts/import-comic-storyboard.mjs`

Run shape:

`node --env-file=/absolute/path/to/apps/quipsly/.env.local scripts/import-comic-storyboard.mjs`

Projection records:

- Private workspace slug: `charlielsparrow-gmail-com-workspace`
- Private project slug: `charlie-melissa-fiction-lab`
- Storyboard: `My Heart Is a Junkyard Starship: Tenderness of Unlawful Design`
- Frames: 128 `StudioStoryboardFrame` records keyed by storyboard plus `frameNumber`
- Story bible: 16 `StoryEntity` records keyed by project plus type plus name

The importer preserves existing `imageUrl` values on frames so generated/uploaded art is not wiped by a seed refresh.

## Product rule

Do not fork this into separate truths. The fiction system should keep one canon packet and project it into:

- Story bible entities and relationships.
- Storyboard frames.
- Vertical scroll/webtoon surfaces.
- Future media generation packets.
- Future Quipsly assistant research/continuity workflows.

If the schema evolves, prefer upgrading the seed/import shape over creating isolated one-off fiction, comic, or storyboard formats.
