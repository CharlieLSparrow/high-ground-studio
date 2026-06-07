# Premiere to Quipsly import workflow

Premiere `.prproj` files are gzipped XML. Quipsly can read them without Premiere installed and create a reviewable import packet for each episode.

## What the importer preserves

- Project and episode slug.
- Original `.prproj` path.
- Primary-sequence media references, file paths, proxy flags, durations, and local availability checks.
- Full project media inventory as diagnostics, without staging unused project references by default.
- iCloud history paths when Premiere remembers them.
- Sequences, tracks, active clips, raw Premiere ticks, and seconds-converted timing.
- Source usage ranges per media asset.
- Candidate deactivated source ranges where Premiere appears to have cut material out.
- `importedMedia` placeholder records that the Nest editor/Mac app can turn into real uploaded assets later.
- Ranked spine-audio candidates, without automatically setting the episode spine.

## What it does not do yet

- It does not upload files.
- It does not mutate the live database.
- It does not claim every candidate deactivated range is final truth.
- It does not download iCloud placeholders automatically.

## Command

```bash
node scripts/quipsly/import-premiere-project.mjs \
  --input /Users/wall-e/Desktop/Podcast/1/Episode1.prproj \
  --project high-ground-odyssey-manuscript \
  --episode episode-1
```

Default output:

```text
content/quipsly/premiere-imports/<episodeSlug>.json
```

For the known Episode 1-3 Premiere projects on Charlie's Mac, regenerate all packets with:

```bash
node scripts/quipsly/import-known-premiere-projects.mjs
```

Use `--only episode-2` for a single packet. The batch command prints a compact health summary including needed primary media, skipped project media, missing needed media, iCloud-history count, active clip count, inactive-source candidate count, and the top spine candidate.

## Media scope rule

Premiere projects can remember old bins, previous exports, nested experiments, proxy files, and half-forgotten media references. Quipsly should not treat all of those as urgent import work.

The packet therefore uses a strict scope:

- `media` means assets referenced by the chosen primary sequence. This is the only list the Mac app stages/imports by default.
- `quipslyEpisodeProductionPatch.importedMedia` is generated from that same primary-sequence list.
- `projectMediaInventory` preserves every media reference found in the `.prproj` for diagnostics and future recovery.
- `skippedProjectMedia` lists project-wide references not used by the chosen primary sequence.
- `summary.missingMediaCount` counts missing primary-sequence media only.
- `summary.projectMissingMediaCount` counts missing project-wide references for diagnostic context.

If a primary-sequence file is missing and has iCloud history paths, the packet includes explicit `brctl download ...` hints. The importer does not trigger iCloud downloads automatically; that must remain a deliberate operator action so we do not pull mystery gigabytes while editing.

## Local-first Mac staging

The Mac app can stage one of these generated packet JSON files from the Episode Import panel:

1. Open Quipsly Mac.
2. Open `Import to Episode`.
3. Click `Stage Premiere packet`.
4. Choose one of the packet files in `content/quipsly/premiere-imports/`.
5. Leave `Start available media immediately after staging` off for a safe inventory pass.
6. Turn it on when you want existing local media to flow into probe, proxy, upload, and Nest registration.

Available primary-sequence media becomes queued import work. Missing primary-sequence files and iCloud-history-only files are held with a plain-English reason so the editor can download or relink the originals before retrying. Project-wide media that is not used by the chosen primary timeline is not staged unless a human explicitly asks to recover it.

## Missing primary media recovery

Use the relinker when a packet says the primary timeline needs a file that is not currently present at Premiere's remembered path:

```bash
node scripts/quipsly/relink-premiere-packet-media.mjs \
  --packet content/quipsly/premiere-imports/episode-1.json \
  --search-root /Users/wall-e/Desktop/Podcast \
  --json
```

Add `--apply` only when you want unambiguous matches written back into the packet:

```bash
node scripts/quipsly/relink-premiere-packet-media.mjs \
  --packet content/quipsly/premiere-imports/episode-1.json \
  --search-root /Users/wall-e/Desktop/Podcast \
  --apply
```

The relinker searches only `packet.media`, which is the primary-sequence media list. It does not walk `projectMediaInventory` or resurrect old Premiere bin references. If the search root is offline or unavailable, it reports that safely and leaves the packet unchanged.

In Quipsly Mac, use `Find missing media` from the `Premiere packet health` card. The default is to apply only unambiguous relinks. Ambiguous or still-missing files stay held so we can skip them for now and import them later.

The packet also carries the translated timeline clips, deactivated-source candidates, and suggested spine-audio candidates. Those stay as diagnostics until we explicitly wire the timeline import action in Nest.

## Draft edit review

After staging a packet, open the Mac app's `Premiere Draft Edit` section.

That surface builds a local, non-destructive draft edit packet:

- Active Premiere timeline clips become Quipsly draft timeline clips.
- Registered Quipsly assets replace Premiere placeholder asset IDs when they can be matched.
- Unregistered, held, or missing media remains visibly marked instead of disappearing.
- Premiere cut-out source gaps become `deactivatedSourceRanges`, not destructive deletions.
- Suggested spine audio is displayed, but not applied automatically.

`Copy draft JSON` and `Save draft JSON` are the safest local handoffs.

`Stage in Nest` saves the draft under `productionJson.premiereDraftEdits` and appends sync history. It is deliberately draft-only: the active episode timeline is not overwritten. A later production action can promote or merge a staged draft after creating a backup/snapshot.

If some old Premiere media is still missing, use `Stage matched-only rescue`. That creates a separate review draft containing only clips whose media has been registered as Quipsly assets. Unmatched/missing clips are skipped for now, not deleted from history: the original packet still contains them, the missing-media report names them, and a later relink/import pass can regenerate the full draft.

The `Recoverable missing media` panel in `Premiere Draft Edit` shows the exact held/unmatched primary-timeline files, the paths Premiere expected, and likely folders to search next. Use it to decide whether to recover media now or proceed with `Stage matched-only rescue`.

## Web editor promotion

The Nest `/editor` route now reads `productionJson.premiereDraftEdits` and shows a `Premiere draft edits` review panel in the media/sync lane.

Promotion is intentionally explicit:

1. Review clip count, matched asset count, held media count, and inactive source ranges.
2. Optionally click `Preview locally` to load the draft in the editor without saving it. Autosave is paused for this preview.
3. Confirm the staged draft is the edit you want to become active.
4. Click `Promote to active timeline`.
5. The API creates a backup record in `productionJson.timelineBackups`.
6. The active `timelineJson.timelineClips` is replaced by the draft clips.
7. The staged draft remains available for audit/history.

This means Episode 1-3 Premiere projects can become Quipsly-native active timelines without silently deleting the previous edit state.

The editor also shows `Timeline backups`. Restoring a backup creates a fresh pre-restore backup before replacing the active timeline, so promotion and restoration are both reversible review actions rather than one-way trapdoors.

## Quipsly mapping

Premiere active timeline clips map to Quipsly timeline clips:

- `startIn` is timeline start in seconds.
- `duration` is active edited duration in seconds.
- `sourceStart` and `sourceEnd` identify the original source slice.
- `trackId` maps to `V*` for video and `A*` for audio.
- `deactivated` remains `false` for active Premiere clips.

Premiere cut-out material maps to reviewable candidate ranges:

- `premiereDeactivatedSourceCandidates` contains source-level gaps.
- `confidence: "medium"` means Premiere used the same source before and after the gap.
- `confidence: "low"` means source head/tail was outside the edit and may simply be dead air, setup, or unused leftover recording.

The next production step is to let the Mac/local engine consume the packet, download or locate missing media, probe/proxy/upload assets, then attach the packet to the Nest episode production room.

## Safe spine rule

Premiere projects often contain old experiments, backups, and duplicate bins. The importer therefore does not set `spineAudioAssetId` automatically. It writes `premiereSuggestedSpineAudioCandidates` so the editor can present calm choices and let a human confirm the actual spine.

Spine candidates are ranked by active-sequence usage first, then local availability. That is intentional: a missing audio file used throughout the Premiere edit is more important than a convenient local audio file that does not appear in the chosen sequence. The correct next action may be "recover/download/relink this likely spine," not "use whatever file happens to exist."
