# Quipsly Studio video-proxy duration integrity

Status: implemented and covered by media-core tests as of 2026-07-28.

## Why this boundary exists

A media container can outlive its video track. Episode 4 exposed the concrete
failure: the Part 2 recap container and audio track are 57.2 seconds, while the
source video track is about 55.157 seconds. The generated proxy correctly
contains about 55.167 seconds of video. Comparing the proxy with the container
duration therefore makes a correct proxy look truncated, while trusting only
file existence can create a false green lane with a silent visual tail.

Video lanes must use video-track evidence. Container duration is not
authoritative for a video lane.

## Readiness contract

Every existing, generated, relinked, or attached video proxy passes the same
fail-closed policy before it becomes production-ready:

1. Probe the proxy video track. A missing, unreadable, or invalid track blocks
   the lane.
2. If the explicitly authorized source is available, probe its video track and
   compare source track to proxy track.
3. Accept a difference of at most 0.5 seconds to cover frame-boundary and
   transcode rounding.
4. When the source is unavailable, compare the proxy video track with the
   stored lane duration. A material mismatch blocks and asks for source access
   because Quipsly cannot distinguish a truncated proxy from a container audio
   tail.
5. For an accepted video lane, use the best playable-duration evidence:
   source video-track duration when available, otherwise proxy video-track
   duration.

The UI reports `Proxy validating`, `Proxy ready`, or `Proxy blocked`. Merely
finding a file at the proxy path is never enough for a green state.

## Persistent evidence

`VideoLaneMetadata` stores:

- `sourceVideoTrackDuration`
- `proxyVideoTrackDuration`
- `proxyDurationValidatedAt`
- `proxyDurationValidationBasis`

This evidence is serialized with the native session and exposed in the agent
state and media-recovery report. It is cleared when the original or proxy is
relinked, regenerated, or replaced. Changing or restoring an explicit
protected-folder grant invalidates the in-memory validation cache so a formerly
blocked lane can be checked again.

The semantic `restore-media-access` command restores only the exact folder
bookmark the user previously granted. It cannot choose or broaden a folder
grant. If that bookmark is absent, stale beyond recovery, or outside the source
path, the lane remains blocked and the app asks the user to re-grant the folder
through the native picker.

Each asynchronous validation has a unique run ID. Results from a superseded
validation cannot mutate a newly loaded session or a lane whose proxy changed
while the probe was running.

Duration-validation failures have their own lane-scoped error channel. They do
not reuse the proxy-generation failure map: otherwise a failed pre-grant probe
can short-circuit readiness before a post-grant validation has a chance to run.
An explicitly authorized source-probe failure is reported as such instead of
silently falling back to stored duration.

## Safety and source ownership

- Validation is read-only.
- Protected originals are probed only through an explicit folder grant.
- Proxies do not become canonical source media.
- Source files and proxies are never trimmed or rewritten by reconciliation.
- Reconciliation updates the lane duration and its validation evidence, then
  schedules a normal working-session autosave.
- A checkpoint is still protected by the native-session checkpoint policy; its
  first background save forks a working copy.

## Verification

`VideoProxyDurationPolicyTests` covers:

- a longer audio/container tail with matching source and proxy video tracks;
- a materially truncated proxy;
- proxy-backed reconciliation when the source is unavailable;
- a material stored-duration mismatch that requires source access; and
- invalid duration evidence.

The app-level acceptance gate must additionally:

1. load a real session through the exact signed build;
2. wait for all video lanes to leave `Proxy validating`;
3. confirm the Episode 4 recap is reconciled from source/proxy video-track
   evidence;
4. confirm every ready lane carries persistent duration evidence;
5. independently probe all ready files; and
6. relaunch and prove the reconciled working session survives.

Automated tests alone do not close that gate.

## 2026-07-28 Episode 4 acceptance

The app-level gate passed in the Apple Development-signed Mac app built from
commit `8053fb3` (CDHash
`b251846675f522f411790574e6a41cc1ad79bf23`, Team `585GUXMY5M`).

The cold pre-grant state truthfully reported:

- nine video lanes `Proxy ready`;
- one recap lane `Proxy blocked`;
- three audio lanes `Audio proxy-safe`; and
- one Office Space source `Held for recovery`.

The recap was blocked because its stored/container duration was `57.200`
seconds while its proxy video track was `55.167` seconds. The semantic
`restore-media-access` command restored only the saved
`/Volumes/My Passport/Quipsly Media Vault` bookmark. That explicit grant
allowed the source video track to be probed at `55.157` seconds. The source and
proxy video tracks differed by only about `0.010` seconds, so the app
reconciled the lane to `55.157` seconds and persisted
`source-video-track-vs-proxy-video-track` evidence.

The settled session reported ten video lanes `Proxy ready`, three audio lanes
`Audio proxy-safe`, one intentionally held lane, and `productionReady=true`.
Independent `ffprobe` readback found exactly one video track in every ready
proxy. Every app duration matched its proxy video track within `0.010`
seconds. The recap readback was:

- source video track: `55.156738` seconds;
- proxy video track: `55.166667` seconds; and
- source container: `57.200000` seconds.

The reconciled evidence survived autosave, checkpoint fork, full app quit,
relaunch, and explicit working-session reload. This closes the Episode 4
duration-integrity acceptance gate. It does not approve the episode
editorially or substitute for a human proof-watch/listen.
