# Episode Room Media Vault Watch release

Released: 2026-07-30 MDT / 2026-07-31 UTC

## Exact identities

- Feature and deployed source:
  `6d4bdbfda5a39a275826502f872fb808aa78eda6`
- Cloud Build:
  `deaf26e4-51f5-4823-9221-394c94c441c2`
- Cloud Run revision:
  `studio-00466-lib`
- Runtime image:
  `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio@sha256:3625dbfcfeeb931acd32a76cceadcb8734765ceaa752bb153ccb83491b546d78`
- Build manifest list:
  `sha256:e1679ae9ba1e26bbb4cb3dc2c97eb8304e3486a38e06ff7275fcaaec8b2be3ec`
- Traffic:
  `100% studio-00466-lib`
- Previous proven revision / rollback target:
  `studio-00464-sig`

## Released product behavior

- An Episode Room editor can search and attach existing audio or video from
  that exact Nest's Media Vault without another upload.
- Direct project relations, the project's media bin, and explicit project
  attachments are canonical scope. Foreign-Nest and unscoped global assets
  are excluded.
- The command atomically adds the preserved source to the episode's imported
  media projection and shared Watch. It does not copy or mutate source bytes.
- The existing revisioned Episode Room command receipt makes a retry
  idempotent, so a network replay cannot create duplicate media or Watch rows.
- The existing shared Watch then supplies either editor's Play, Pause, Seek,
  watched-span receipts, Capture-clock binding, and explicit non-destructive
  episode timeline synchronization. Quipsly Capture can consume the attached
  Watch source without a new native binary.
- Saved Media Vault clip names remain visible as provenance. This release
  deliberately plays the whole source; exact saved-range Watch playback is a
  later coordinated web and native transport change.
- Viewer access remains read-only: viewers can inspect source provenance but
  cannot change shared Watch.

## Operated acceptance

A retained, clearly labeled local QA identity exercised the complete product
path in the rendered app:

1. Opened a real episode production.
2. Found `BigBuckBunny_Travel_Vlog.mp4` in the same Nest's Media Vault.
3. Read the retained saved clip `Canonical tag focus QA`.
4. Added the existing source to Watch.
5. Started a rehearsal clock.
6. Played and paused actual video.
7. Produced one receipt-backed watched span.
8. Synced that span into one episode timeline derivative.
9. Read the persisted result back from PostgreSQL:
   one imported source, one Watch clip, one watched segment, and one timeline
   derivative.

The QA identity, source, clip, episode, Watch receipt, and timeline derivative
remain intentionally available for longitudinal regression testing. The
phone-width UI was inspected at 390 by 844 and corrected so long source names,
saved-clip context, and the Watch action remain reachable.

## Qualification and release proof

- Focused Episode Room route and rendered UI tests: 18/18.
- Real PostgreSQL Media Vault integration tests: 3/3.
- Complete Quipsly Jest: 189 active suites / 941 tests.
- Cross-surface release contracts: 168/168.
- Capture-to-Nest source-evidence contract: 10/10.
- Exact Session source-evidence tests: 30/30.
- Quipsly TypeScript 7 and optimized 150-route production build passed in the
  worktree, the materialized exact-commit context, and Cloud Build.
- Cloud Build verified six required route bundles inside the final image.
- A generated preview reviewer exercised Firebase login, first-party session
  exchange, native session check, Home Nest, Projects, Session workspace,
  account switching, admin authority, writing, editor, recorder, Research,
  Publishing, logout, and configured public hosts.
- Reviewer cleanup deleted two grants, one Home Nest, one membership, one
  database actor, and one Firebase actor, then independently verified both
  stores clean.
- Post-promotion status passed billing, Cloud SQL, Cloud Run, domain and
  certificate routing, public routes, 108 mobile Capture checks, and recent
  billing-error log review.
- Independent `https://nest.quipsly.com/api/health` readback reports exact
  source `6d4bdbfda5a39a275826502f872fb808aa78eda6` and revision
  `studio-00466-lib`.

## Architecture and scope boundary

This is a projection over existing canonical `StudioMediaAsset`,
`StudioEpisodeProduction`, and Episode Room records. It adds no schema
migration and creates no second media authority.

No native source changed, so Quipsly Capture Build 18 remains the current
approved TestFlight build. This release does not prove a physical TestFlight
install, genuine two-person consent and capture, exact saved-range playback,
or completed High Ground Odyssey and coaching workflows.
