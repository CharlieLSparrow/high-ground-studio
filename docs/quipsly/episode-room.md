# Quipsly Episode Room

Status: first end-to-end vertical slice
Last updated: 2026-07-26

## Product promise

An Episode Room is the canonical collaborative workspace for one episode from outline through publication. It brings together:

- the episode-bounded writing source;
- audio and video the hosts plan to watch together;
- a shared playback clock that either editor can play, seek, or pause;
- append-only playback receipts that align watched media with the recording;
- the non-destructive episode timeline;
- one episode-scoped collaboration thread;
- direct handoffs to Write, Record, Edit, and Publish.

The room is not a media-player widget. It is the live operational view of one `StudioEpisodeProduction`.

Canonical route:

`/nests/:projectSlug/episodes/:episodeSlug`

## Research-derived interaction decisions

Riverside's Media Board proves that prepared audio/video should be playable inside the recording studio and recorded as its own track. Riverside's aligned-track model preserves raw tracks while adding timeline padding, and its producer role gives more than one trusted operator access to media playback. Quipsly adopts the useful principles while making the shared watch clock and alignment receipts explicit.

- [Riverside producer role and Media Board permissions](https://support.riverside.fm/hc/en-us/articles/5252621451805-The-producer-role-Details)
- [Riverside Media Board supported files](https://support.riverside.fm/hc/en-us/articles/5450149546525-Media-Board-Supported-files)
- [Riverside raw versus aligned tracks](https://support.riverside.fm/hc/en-us/articles/6518046195613-What-is-the-difference-between-an-aligned-track-and-a-raw-track)

Descript proves that script, media, timeline, and collaboration should remain visibly connected. Quipsly keeps episode text readable beside playback, stores comments in the episode thread, and projects watched media to a non-destructive timeline instead of modifying source files.

- [Descript commenting in projects](https://help.descript.com/hc/en-us/articles/10255722202381-Commenting-in-projects)
- [Descript editor interface](https://help.descript.com/hc/en-us/articles/37585546799757-The-editor-interface)
- [Descript timeline overview](https://help.descript.com/hc/en-us/articles/10249275208717-Timeline-overview)
- [Descript edit like a document](https://help.descript.com/hc/en-us/articles/15726742913933-Edit-like-a-doc)

## Ownership boundaries

| Concern | Canonical owner |
| --- | --- |
| Episode identity and aggregate | `StudioEpisodeProduction` |
| Immutable uploaded media | `StudioMediaAsset` and media-vault object |
| Import provenance and episode attachment | `productionJson.importedMedia` |
| Shared watch state and receipts | `productionJson.episodeRoom` |
| Derived watched timeline clips | `productionJson.timelineClips` |
| Episode writing source | `StudioDocument` and bounded `StudioDocumentBlock` rows |
| Episode collaboration thread | `StudioNestChatThread` with key `episode:<episodeSlug>` |
| Deep editorial decisions | protected baseline and shared branch in the episode editing desk |
| Capture evidence | `CallRoom`, `RecordingAsset`, and Capture state receipts |

No source media is trimmed, overwritten, or duplicated by Episode Room commands.

For local development, `scripts/dev/quipsly-local-up.sh` opts into a
development-only media vault below the operating-system temporary directory.
That path is allowed only outside production and only when `DATABASE_URL`
targets loopback PostgreSQL. Production still fails closed unless a configured
cloud media bucket exists.

## Shared playback protocol

The persisted state uses `quipsly-episode-room.v1`.

Every mutation contains:

- a stable `clientRequestId` for idempotency;
- the caller's `expectedRevision`;
- an authenticated Nest actor;
- an authoritative server acceptance time.

The row is locked inside a serializable transaction. A stale command receives a revision conflict. The client refreshes and retries once for live controls, which makes a participant's Pause resilient without silently overwriting another operation.

Commands:

- `START_SESSION`
- `ADD_CLIP`
- `REMOVE_CLIP`
- `SELECT_CLIP`
- `PLAY`
- `PAUSE`
- `SEEK`
- `ENDED`
- `SYNC_TIMELINE`

Clients poll only the lightweight runtime state every 750 ms. Episode text is loaded once. The protocol can later travel over a LiveKit data channel without changing command semantics or persisted receipts.

Browser autoplay policies can block remote audio playback. A blocked participant sees a deliberate `Tap to join playback on this device` control. Remote Pause always remains enforceable because pausing media is not autoplay-restricted.

## Timeline alignment

Binding an Episode Room to an accessible podcast `CallRoom` establishes the
recording epoch from that room's server-owned `recordingStartedAt`. The room
selector is project- and episode-scoped, and the Episode Room cannot accept a
client-invented recording timestamp. A rehearsal clock remains available for
non-recording preparation, but it is visibly labeled and is not recording
evidence.

`PLAY` opens a watch segment. `PAUSE`, `SEEK`, `SELECT_CLIP`, `REMOVE_CLIP`, and `ENDED` close the current segment with:

- source-media start and end seconds;
- episode-clock start and end seconds;
- session identity;
- start and end receipt IDs;
- exact accepted timestamps and actors.

`SYNC_TIMELINE` is explicit and is rejected while playback is active. It replaces only prior `quipsly-episode-room-watch.v1` derivatives and leaves every other timeline clip untouched. Video derivatives use track `V9`; audio derivatives use `A9`. The operation is deterministic and safe to repeat.

Physical-device validation is still required before claiming sample-accurate alignment between the server episode clock and an iPhone recording clock. The current receipt model preserves enough evidence to measure and correct that offset rather than pretending it is zero.

## Current dogfood evidence

On 2026-07-26 the local app was operated against the real
`high-ground-odyssey / episode-4-part-2` production record:

- a six-second MP4 with audio was uploaded through the rendered Episode Room
  and read back through the authorized media endpoint;
- `codex@dev.test` started the episode clock, played the clip, exercised media
  end, rewind, replay, and a deliberate mid-clip Pause;
- a genuinely separate Chrome profile signed in as
  `charlie.local@quipsly.test`, observed the first participant's Play, issued
  Pause, and stopped both browsers on revision 10;
- PostgreSQL readback attributed that Pause to `Charlie Local`, retained the
  server acceptance time and client request identity, and closed the watch
  segment at source position `1.891518`;
- the second participant explicitly synchronized revision 11, producing three
  receipt-backed `V9` timeline clips while preserving the source asset;
- both authenticated accounts posted into
  `episode:episode-4-part-2`, and each browser observed the other account's
  message.
- the rendered Episode Room prepared podcast `CallRoom`
  `cms2cybai000kfixlx7z738do` through the real mobile Capture session route;
- the current consent policy, separate audio/video/transcription choices, and
  audible-participant attestation were accepted through the Capture consent
  API before an app-owned `START_RECORDING` receipt changed the room to
  `RECORDING`;
- Episode Room bound revision 12 to that exact room and its authoritative
  `2026-07-26T22:22:47.000Z` recording timestamp;
- a real shared-media run then ended at revision 14, closed a fourth watched
  span, and explicit sync advanced revision 15 to four derived timeline clips;
- PostgreSQL readback retained the exact `recordingRoomId`,
  `recordingStartedAt`, source and end receipt IDs, and immutable source-media
  coordinates on the fourth `V9` timeline clip;
- the matching `STOP_RECORDING` receipt applied successfully and returned the
  dogfood room to `OPEN`.

These are local synthetic-media and test-account receipts kept in the local
dogfood database. They prove the multi-account web contract and the
Capture-to-Episode-Room server-clock seam. They do not prove physical iPhone
alignment, provider egress, production deployment, or episode publication.

## Access and collaboration

- Nest `OWNER` and `EDITOR` roles can control playback, attach media, sync the timeline, and post to episode chat.
- `VIEWER` can read the text, follow room state, watch attached media, and read chat.
- Episode chat is separate from the default Nest thread.
- The global floating Nest chat is suppressed inside Episode Room because the episode thread is already present.

## Acceptance path

Automated:

1. reducer tests prove play/pause segment alignment, seek boundaries, idempotency, revision conflict, clock projection, and pause-before-sync;
2. route tests prove malformed-command rejection, authenticated actor binding,
   revision conflicts, episode-thread write authorization, and viewer denial;
3. local-vault tests prove exact-byte persistence, private file mode,
   traversal denial, production denial, loopback-database binding, and
   temporary-root confinement;
4. strict TypeScript and the 149-route production Next build complete;
5. the repository contract suite keeps both file and URL imports bound to the
   authenticated Nest actor.

Real workflow:

1. open a real High Ground Odyssey episode;
2. upload a short MP4 or audio clip;
3. open the room in two authenticated accounts;
4. prepare or select the exact podcast Capture room;
5. grant current-policy consent in Capture and apply a real recording-start
   receipt;
6. bind the Episode Room to that server recording clock;
7. play from account A and pause from account B;
8. verify both players stop and the actor receipt is visible;
9. seek and resume;
10. post messages from both accounts and verify they remain episode-scoped;
11. sync watched spans;
12. open Edit and verify the source plus receipt-backed timeline derivatives;
13. confirm unrelated timeline clips and source media remain unchanged;
14. apply the matching recording-stop receipt and verify the room is no longer
    recording.

TestFlight and physical-iPhone proof add:

1. start the associated Capture room recording;
2. perform the same shared watch sequence;
3. promote the recording;
4. compare recorded-start evidence with the Episode Room epoch;
5. proof-watch and listen to the aligned result.
