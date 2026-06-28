# Studio 360 workflow packet

Last updated: 2026-06-24

The Studio 360 workflow packet maps Insta360-style source assets into safe
import, proxy, reframe, and export-prep groups. It is not a renderer by itself;
it is the calm routing layer that tells Quipsly what assets exist and what they
need next.

## Command

```bash
./script/agentctl.sh studio360-workflow-packet 220
```

Smoke command:

```bash
./script/agentctl.sh studio360-workflow-smoke 32
```

Latest observed output:

```text
/Volumes/My Passport/Quipsly Media Workspace/Studio360/20260624-084742-360-workflow/index.html
```

Latest counts:

- 220 media assets.
- 91 grouped source sets.
- 100 Insta360 original videos.
- 103 low-res companions.
- 6 proxy assets.
- 81 groups with low-res companions.
- 2 groups needing proxies.
- 2 generic review-source groups.

## Proxy prep proof

Latest real proxy prep command:

```bash
./script/agentctl.sh studio360-proxy-prep first-actionable
```

Latest managed proxy prep output:

```text
/Volumes/My Passport/Quipsly Media Workspace/Studio360/proxy-prep/20250619-073835/20260624-084946/proxy-prep-manifest.json
/Volumes/My Passport/Quipsly Media Workspace/Studio360/proxy-prep/20250619-073835/20260624-084946/proxies/20250619-073835-review-proxy.mp4
```

The proxy prep selected the camera low-res companion
`LRV_20250619_073835_01_018.lrv`, copied it into Quipsly-managed proxy-prep
storage, probed it successfully as an H.264/AAC 1664x832 review proxy, and
recorded `originalsMutated=false`.

The companion grouping bug was fixed on 2026-06-24. Group keys now use the
shared timestamp/source number instead of preserving the `VID`/`LRV` prefix,
so original video and low-res companion files land in the same source group.

Latest safe proxy-prep failure receipt:

```text
/Volumes/My Passport/Quipsly Media Workspace/Studio360/proxy-prep/20250905-110050/20260624-090022/proxy-prep-manifest.json
```

That group attempted to transcode
`VID_20250905_110050_00_028.insv`, but ffmpeg reported `moov atom not found`.
The command now writes a calm failed manifest and `latest-360-proxy-prep-failure.json`
instead of leaving only raw terminal output. The receipt keeps
`originalsMutated=false` and routes the next action to companion search,
re-download/repair, or parking the group as media-repair-needed.

## Product rules

- `.insv`, `.insp`, and source media remain whole.
- Reframing/keyframes/output formats are metadata and export decisions.
- Low-res companions and proxies are review aids, not replacements for source truth.
- New proxy/export work should be versioned and should never overwrite originals.

## Next best improvements

- Generate missing proxies for the remaining `needs-proxy` groups.
- Route `proxy-ready` groups into the editor's keyframe/reframe controls.
- Add 16:9 and 9:16 export recipes over the same source group metadata.
- Add agent controls for selecting a group, creating a proxy, and opening a reframe review.

## 2026-06-24 - Reframe/export-prep packet

Command:

```bash
./script/agentctl.sh studio360-reframe-packet 120
```

Latest packet:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/reframe-prep/20260624-110050/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/reframe-prep/20260624-110050/360-reframe-packet.json`
- CSV: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/reframe-prep/20260624-110050/360-reframe-recipes.csv`
- Markdown: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/reframe-prep/20260624-110050/START-HERE-360-reframe-prep.md`

Result:

- 91 grouped 360 source sets inspected.
- 182 recipe records created: one `16:9` and one `9:16` recipe per group.
- 89 groups are ready for reframe review.
- 1 group needs proxy creation before useful review.
- 1 group needs media/proxy repair before useful review.

Product truth:

- This is recipe metadata only.
- No original media is mutated.
- No video export is rendered.
- No external publishing is performed.
- The pointer `/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-reframe-packet.json` tracks the current packet while preserving prior versioned sessions.

## 2026-06-24 - OS board reviewer actions

The 360 workflow is now visible from the broader Quipsly OS board as action cards. This makes the reframe packet usable without asking a reviewer to understand the full packet schema first.

Current card types:

- `Repair media/proxy prep before reframing`: the source/proxy path needs attention before review.
- `Create a managed proxy`: the original exists, but Quipsly should create a safe review proxy first.
- `Review 16:9 and 9:16 reframe recipes`: the source group is ready for human/agent framing review.

Current latest board:

- `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-110919-quipsly-os/index.html`

Important boundary:

The card is not a publishing receipt or rendered export. It is a calm next-action surface for deciding what to inspect, repair, or reframe next.

## 2026-06-24 15:00 MDT - Expanded repair evidence for 20250905-110050

The damaged-source repair task for `20250905-110050` now has a versioned expanded-search packet:

- Markdown: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/media-repair-tasks/20250905-110050-expanded-search-20260624-145949.md`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/media-repair-tasks/20250905-110050-expanded-search-20260624-145949.json`

Evidence summary: an expanded external-drive search found a second candidate at `/Volumes/My Passport/Podcast_Episodes/Session_2_Sep_2025/VID_20250905_110050_00_028.insv`, but it is byte-identical to the damaged copy already known in `Insta360 Download`, and both fail ffprobe with `moov atom not found` / invalid data. No usable LRV/MP4 companion was found in the expanded search.

Next safest action remains repair/re-copy/re-download, or mark the group parked/irrelevant in metadata if not needed. Originals were not mutated.

