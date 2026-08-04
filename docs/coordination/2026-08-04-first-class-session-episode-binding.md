# First-class recording Session to Episode binding

Date: 2026-08-04

Status: implemented, migrated locally, and operated against retained data

## Outcome

Podcast recording Sessions now bind to their exact
`StudioEpisodeProduction` through nullable `CallRoom.episodeProductionId`.
The relation is not unique because an episode may legitimately contain several
recording Sessions, rehearsals, pickups, or takes. Coaching, research, and team
Sessions remain unbound unless their domains later gain a genuinely different
continuity record.

The previous `metadataJson.episodeSlug` value remains during a compatibility
window. New podcast Session creation resolves the supplied slug by the exact
`projectId_slug` compound key and writes both the relational key and normalized
compatibility value. A non-podcast binding, unknown episode, or cross-project
slug fails before room creation.

## Read boundary

Episode Room queries prefer the first-class relation. Legacy metadata is read
only when `episodeProductionId` is null:

1. `episodeProductionId = exact episode id`; or
2. `episodeProductionId IS NULL` and the legacy slug equals the exact episode
   slug.

This distinction is deliberate. A non-null conflicting relation cannot be
overridden by convenient metadata. Every query also requires the recording
Session and episode to belong to the same project, and Session-page projection
rejects a related episode whose project differs from the room project.

## Migration and retained data

Migration `20260805003000_add_call_room_episode_binding`:

- adds the nullable column;
- backfills only podcast rooms whose legacy slug resolves in the same project;
- adds `ON DELETE SET NULL` / `ON UPDATE CASCADE` foreign-key behavior; and
- adds an episode/status/recording-start lookup index.

The local retained database migrated 4 podcast rooms. All 4 resolve to an
episode in the same project; 0 cross-project relations exist. Retained coaching
rooms remain null. One unmatched legacy podcast slug intentionally remains null
and visible for repair rather than being guessed or silently discarded.

## Operated proof

The local database acceptance creates two projects and two episodes, then:

- resolves and persists a same-project first-class podcast binding;
- reads back the exact relational episode;
- proves a null-relation legacy room remains compatible;
- deliberately creates an adversarial cross-project relation whose metadata
  points at the expected episode and proves the Episode Room query excludes it;
- rejects cross-project slug resolution; and
- rejects episode binding for coaching.

The focused binding operation passed 3/3 database assertions and removed its
exact test rows. A separate production-route operation passed 7/7, including
signed-in API creation, exact relation readback, and rejection without residue.
Focused Session/Episode projection suites passed 70/70. The complete Nest run
passed 299 suites / 1,565 runnable tests, typecheck passed, and the optimized
production build generated all 172 pages. Mobile source contracts passed 98/98
and Capture/App Store static contracts passed 1,025/1,025.

## Compatibility exit and rollback

Do not remove the metadata fallback until deployed readback shows no legitimate
null-relation podcast rooms and supported Capture builds all write the new key.
Before fallback removal, add an explicit repair surface for the remaining
unmatched rows.

During the compatibility window, code rollback is safe because metadata is
still written and retained. If a database rollback is required after code has
returned to metadata-only reads, verify no required binding lacks metadata,
then drop the index, foreign key, and nullable column. Do not drop the column
while any deployed binary still selects or writes it.

Deleting an episode sets the relation to null. While compatibility reads exist,
a later episode with the same project and slug could make legacy metadata
resolvable again. Treat that as a migration-window behavior and remove or
tombstone the legacy binding when implementing destructive Episode deletion.
