# Quipsly Episode Room

Status: production deployed; physical capture and media qualification remain open
Last updated: 2026-07-27

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

Clients poll the lightweight runtime state every 750 ms. The protocol can later travel over a LiveKit data channel without changing command semantics or persisted receipts.

Browser autoplay policies can block remote audio playback. A blocked participant sees a deliberate `Tap to join playback on this device` control. Remote Pause always remains enforceable because pausing media is not autoplay-restricted.

## Shared writing protocol

Episode Room does not own another copy of the manuscript. It reads the
episode-bounded rows from the canonical `StudioDocument`.

The runtime response includes an opaque writing version derived from:

- the document update time;
- the latest active bounded block update time;
- the active bounded block count;
- the latest document-operation receipt identity.

The client sends its known version on each runtime poll. When the version is
unchanged, the response contains only bounded writing metadata. When it
changes, the server returns the newest episode-bounded text snapshot and the
room replaces its read model without a page reload. The room visibly reports
that the shared manuscript was refreshed.

This is deliberately revision-aware read synchronization, not a second
collaborative editor. `Write` and `Open this manuscript` route to the exact
canonical document ID. All normal edits remain attributable
`StudioDocumentOperation` mutations in Writing.

The empty-document Episode Room import:

- is serialized behind the episode-production row lock;
- is idempotent by `clientRequestId`;
- refuses to overwrite any active document blocks;
- records an `episode-room-text-import` document-operation receipt containing
  the imported stable identities and a SHA-256 content fingerprint;
- is marked non-reversible because there is not yet a dedicated import-undo
  command;
- refreshes the room through the same writing-version protocol instead of
  reloading the page.

At most 400 writing blocks render in the live room. If the bounded document is
larger, the UI states the exact total and routes to Writing for the complete
manuscript instead of silently implying that the visible subset is complete.

## Timeline alignment

Binding an Episode Room to an accessible podcast `CallRoom` establishes the
recording epoch from that room's server-owned `recordingStartedAt`. The room
selector is project- and episode-scoped, and the Episode Room cannot accept a
client-invented recording timestamp. The selected room must still be
`RECORDING` when it is bound and before every subsequent `PLAY`; an old
`recordingStartedAt` on an `OPEN` or stopped room cannot keep advancing an
Episode Room clock. A stale recording clock is visibly held and its play and
seek controls fail closed. A rehearsal clock remains available for
non-recording preparation, but it is visibly labeled and is not recording
evidence.

`PLAY` opens a watch segment. `PAUSE`, `SEEK`, `SELECT_CLIP`, `REMOVE_CLIP`, and `ENDED` close the current segment with:

- source-media start and end seconds;
- episode-clock start and end seconds;
- session identity;
- start and end receipt IDs;
- exact accepted timestamps and actors.

`SYNC_TIMELINE` is explicit and is rejected while playback is active. It
materializes only watch segments from the current Episode Room pass, replaces
only prior `quipsly-episode-room-watch.v1` derivatives, and leaves every other
timeline clip untouched. Historical passes remain preserved in the Episode
Room receipt history instead of being stacked into the current editorial
timeline. Video derivatives use track `V9`; audio derivatives use `A9`. The
operation is deterministic and safe to repeat.

The shared episode editor reads those derivatives as a dedicated **Shared
Watch derivatives** lane below the protected decision timeline. Every rendered
span keeps its watch-segment and start/end receipt identities. A derivative
outside the protected source baseline is visibly held; it cannot expand or
rewrite that baseline.

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

On 2026-07-27 the same persisted episode was used to prove the shared-writing
seam in the rendered app:

- Episode Room imported four useful producer-review paragraphs into the empty
  canonical episode document without a reload;
- PostgreSQL readback showed an attributable
  `episode-room-text-import` operation followed by a reversible
  `block-content-save` operation;
- the contextual `Write` link opened document
  `document_046c4d894947c8c3fb2e1781`, not the Nest's arbitrary default page;
- a producer-review sentence was edited and saved in Writing;
- the already-open Episode Room observed the new opaque version, fetched the
  changed snapshot, and rendered the exact saved sentence on the next polling
  interval without navigation or manual refresh.

This proves cross-surface canonical-document synchronization for one
authenticated local editor. It does not replace the separate-account access
proof already recorded above or claim conflict-free simultaneous text editing.

Later on 2026-07-27 the rendered two-account workflow closed the remaining
Episode Room-to-editor loop:

- the canonical Session-access predicate was shared with Episode Room, so both
  `codex@dev.test` and the separate `charlie.local@quipsly.test` collaborator
  saw and could open the same accessible Capture session;
- the persisted Capture room was correctly identified as `OPEN`, so its stale
  recording epoch stopped ticking and Play/seek were disabled rather than
  creating another far-future span;
- a new rehearsal pass was started explicitly; one account played and the
  other paused while its browser displayed the autoplay join control, and both
  rooms converged at `1.07` seconds without the prior backward jump;
- each account posted a new episode-thread message and both already-open rooms
  refreshed without navigation;
- the canonical manuscript was edited again in Writing and both open Episode
  Rooms rendered the saved sentence without navigation;
- explicit sync replaced the old generated watch derivatives with exactly one
  current-pass `V9` derivative beginning at episode second `21.953` with
  duration `1.072`, while all ten historical watch segments remained in the
  Episode Room receipt history;
- the rendered shared episode editor showed `1 synced`, the receipt-bound
  `quipsly-episode-room-test.mp4` span, and the statement that the protected
  source baseline stayed unchanged. Neither the Episode Room nor the editor
  emitted a browser-console error.

Focused contract and component verification passes 20/20, strict TypeScript
passes, repository health is healthy, and the canonical local release gate
passes both production builds and all static product/release contracts. The
coaching/capture schema probe also passes when explicitly pointed at the local
PostgreSQL database used for this dogfood run.

This proves the current-pass timeline semantics, separate-account control,
blocked-autoplay Pause authority, canonical Session access, and the rendered
editor derivative lane. At that local checkpoint it did not prove
physical-iPhone alignment, provider egress, production deployment, or
publication.

## Production release evidence

The Episode Room collaboration slice reached `nest.quipsly.com` on 2026-07-27
through the committed-source, zero-traffic preview release train.

- Source `0575a79ee83a82eaff72cd3afd24da5fbf314dc5` first deployed as
  zero-traffic revision `studio-00412-gor`. Its signed reviewer journey passed
  Firebase login, session-cookie and native-session checks, a database-backed
  Capture Session workspace, Home Nest, Writing, Editor, Recorder, Research,
  Publishing, logout, and both configured public hosts before it was promoted.
- A read-only owner render then exercised the real production
  `high-ground-odyssey-manuscript / episode-4` aggregate. Episode Room rendered
  171 canonical manuscript blocks, the existing podcast Capture session, four
  registered media candidates, the episode thread, and the Write/Record/Edit/
  Publish handoffs. The shared editor rendered Episode 4's protected baseline
  and an honest empty **Shared Watch derivatives** lane (`0 synced`); production
  had no current-pass watch derivative to invent.
- That rendered audit also caught two boundary defects missed by route smoke:
  an obsolete/nonexistent Nest slug threw an unhandled server error instead of
  the private 404 boundary, and locale-dependent server/client timestamp text
  could emit React hydration error 418. The owner-visible canonical production
  aggregate itself remained readable.
- Repair source `9d3faeccf1f469decaaddbcf3d3e9eabfe3cebde`
  classifies deliberate access failures without hiding infrastructure faults,
  maps missing/denied private Episode Rooms to not found, and hydrates a
  deterministic UTC timestamp before switching to the collaborator's local
  presentation. New page and timestamp tests cover those seams.
- The repair passed 742 app tests, 109 release contracts, strict TypeScript,
  strict committed-source Next builds, repository health, and the complete
  signed preview journey. Cloud Build
  `96cce766-d602-4789-aef8-624181f91166` produced immutable runtime image
  `sha256:60a1814125d5b08ce0f659db7edcb09d65e70a63fa5c6c8e27d4610c3a6a1a41`.
  Zero-traffic revision `studio-00414-tut` was promoted only after that gate.
- Production now sends 100% of Nest traffic to `studio-00414-tut`. Billing,
  Cloud SQL, Cloud Run readiness, domain/certificate routing, public legal and
  support pages, and all 104 mobile Capture release checks passed after
  promotion. The promoted revision had no Cloud Run error-level entries in the
  release observation window.

This closes production deployment for the web Episode Room and shared-editor
slice. It does not qualify physical iPhone/Mac clock alignment, Canon R8 live
signal, MV7i headphone monitoring or unplug recovery, two-participant
LiveKit coexistence, cloud proxy processing of a real long take, TestFlight,
App Store submission, or proof-watch/listen of a published episode.

## Access and collaboration

- Nest `OWNER` and `EDITOR` roles can control playback, attach media, sync the timeline, and post to episode chat.
- `VIEWER` can read the text, follow room state, watch attached media, and read chat.
- Active project collaborators use the same canonical Session-access
  predicate in the Session workspace and Episode Room; the room does not carry
  a narrower duplicate policy.
- Episode chat is separate from the default Nest thread.
- The global floating Nest chat is suppressed inside Episode Room because the episode thread is already present.

## Acceptance path

Automated:

1. reducer tests prove play/pause segment alignment, seek boundaries, idempotency, revision conflict, clock projection, and pause-before-sync;
2. route tests prove malformed-command rejection, authenticated actor binding,
   revision conflicts, opaque writing-version forwarding, episode-thread write
   authorization, and viewer denial;
3. local-vault tests prove exact-byte persistence, private file mode,
   traversal denial, production denial, loopback-database binding, and
   temporary-root confinement;
4. strict TypeScript and the 149-route production Next build complete;
5. the repository contract suite keeps both file and URL imports bound to the
   authenticated Nest actor.

Real workflow:

1. open a real High Ground Odyssey episode;
2. open its exact manuscript from Episode Room and make an attributable edit;
3. verify the already-open room refreshes the saved text without navigation;
4. upload a short MP4 or audio clip;
5. open the room in two authenticated accounts;
6. prepare or select the exact podcast Capture room;
7. grant current-policy consent in Capture and apply a real recording-start
   receipt;
8. bind the Episode Room to that server recording clock;
9. play from account A and pause from account B;
10. verify both players stop and the actor receipt is visible;
11. seek and resume;
12. post messages from both accounts and verify they remain episode-scoped;
13. sync watched spans;
14. open Edit and verify the source plus receipt-backed timeline derivatives;
15. confirm unrelated timeline clips and source media remain unchanged;
16. apply the matching recording-stop receipt and verify the room is no longer
    recording.

TestFlight and physical-iPhone proof add:

1. start the associated Capture room recording;
2. perform the same shared watch sequence;
3. promote the recording;
4. compare recorded-start evidence with the Episode Room epoch;
5. proof-watch and listen to the aligned result.
