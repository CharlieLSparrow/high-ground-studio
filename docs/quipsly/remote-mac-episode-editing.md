# Remote Mac Episode Editing

Purpose: let Charlie and Mako open the same episode from Quipsly Mac, get the media manifest they need, and edit against the same Nest timeline truth with a small safe delay.

## Current split

- Nest owns the episode production record, timeline JSON, imported media list, collaborator presence, and edit-focus lease.
- Quipsly Mac owns local files, media probe/proxy/upload work, and the native cockpit around the embedded Nest editor.
- The web editor remains the live timeline editor inside the Mac app.
- The local engine remains responsible for ffmpeg/proxy/import work. It is not the collaboration source of truth.

## Workflow

1. Mako signs into Nest once from Quipsly Mac.
2. She opens `Episode Sync`.
3. She enters the project slug and episode slug, for example `high-ground-odyssey-manuscript` and `episode-4`.
4. Quipsly Mac loads the Nest collaboration state:
   - active collaborators,
   - current soft edit-focus holder,
   - timeline fingerprint,
   - current asset manifest.
5. She opens `Episode Editor` inside the Mac app.
6. The web editor heartbeats presence and polls Nest for remote timeline changes.
7. If her local timeline is clean and Nest has a newer fingerprint, the editor pulls the newer timeline.
8. If she has unsaved local changes and Nest has a newer fingerprint, the editor warns instead of overwriting.

## Conflict policy

This is intentionally a soft-collaboration model first:

- `Claim edit focus` is a visible hand-raise, not a hard lock.
- Save uses the existing expected timeline fingerprint guard.
- Clean editors can auto-pull newer Nest timelines.
- Dirty editors never get silently overwritten.
- If two editors save competing cuts, the later save path must reconcile with the current Nest fingerprint.

## Asset policy

The first pass exposes the manifest and can download source/playback URLs into a Quipsly-managed local cache:

- `ready` means the manifest has a source/playback URL that can be opened, copied, or downloaded from Quipsly Mac.
- `needs-download` means the asset exists in the episode model but still needs local retrieval or relink work.
- `missing-source` means the timeline clip needs a source repaired before final export.
- `held` means the file is intentionally parked and should not be used until reviewed.

Current cache path:

```text
~/Library/Application Support/Quipsly/EpisodeAssets/<project>/<episode>/<assetId>/
```

Next layer: per-user local availability checks and resumable background downloads for huge camera files.

## Endpoints

- `GET /api/episode-production/collaboration?projectSlug=<slug>&episodeSlug=<slug>`
- `POST /api/episode-production/collaboration`

Supported actions:

- `heartbeat`
- `claim-edit-lease`
- `release-edit-lease`

The endpoint accepts normal Nest browser auth or the Mac handoff bearer token.

## Local availability layer

Quipsly Mac now checks each manifest asset against the local cache and classifies it independently from the Nest/source status:

- `Cached on this Mac`: expected file exists in the Quipsly cache and has bytes.
- `Missing locally`: Nest has a source/playback URL, but this Mac has not downloaded it yet.
- `No source URL yet`: Nest knows the asset, but the Mac cannot fetch it until the episode media source is repaired or registered.
- `Cached file needs relink`: a file exists in the cache folder, but not under the expected filename. This is safe; it just needs an explicit relink/accept step before we trust it.

The Mac cockpit actions are intentionally direct:

- `Download`: fetches the asset into the managed cache without deleting source files.
- `Open cached`: opens the local cached file when present.
- `Reveal`: opens the asset cache folder in Finder.
- `Copy URL` / `Open`: operate on the Nest source/playback URL.

This keeps remote editors from guessing whether a clip is missing from Nest, missing only from their Mac, or present but needing relink attention.

## Admin handoff path

Use `/admin/users` for remote editor provisioning.

The `Remote episode editor handoff` card is the preferred flow for Mako-style editing access:

1. Enter the collaborator email.
2. Confirm the Nest/project slug, for example `high-ground-odyssey-manuscript`.
3. Confirm the episode slug, for example `episode-4`.
4. Use role `Editor` when the collaborator should save timeline changes.
5. Submit the invite.
6. Copy the returned sign-in link; it uses `/api/auth/signin?callbackUrl=/editor?...` so the collaborator lands directly in the episode editor after login.

The server action creates or updates the app-owned user record, upserts the Nest access grant, and derives the editor callback from the submitted project and episode. This keeps invite-first collaboration email-owned instead of requiring the account to exist first.
