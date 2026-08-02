# Episode 8 source-backed room and real Shared Watch operation

Date: 2026-08-02 MDT

Status: implemented and operated locally; intentionally not deployed

## Outcome

Quipsly can now create an Episode Room from the real High Ground Odyssey
Episode 8 manuscript, preserve every source block and anchor, import the real
`Ted Lasso Be Curious.mp4` source, record a watched span through Shared Watch,
project that receipt-backed span onto the canonical episode timeline, and play
and pause the resulting edit in the full Nest editor.

This is not fixture-only acceptance. The rendered operation used the local
Nest, Firebase Auth Emulator, PostgreSQL, the actual Episode 8 manuscript, and
the actual downloaded clip. No source manuscript block or source-media byte
was rewritten.

## Episode Room source boundary

The owner-confirmed creation transaction copied active blocks from the private
`high-ground-odyssey-manuscript` source into the authorized
`high-ground-odyssey` Episode Room. It uses Serializable isolation, an
episode-scoped advisory lock, actor-bound idempotency, and one reversible
operation receipt. The source and destination are both checked at their exact
Nest boundary before any write.

The rendered source was:

- `Podcast Ep 8: May 13 - I wasn't born a leader`;
- source document `cms5j2n8700pr4axls09rne3u`;
- 114 active source blocks; and
- suggested canonical route
  `episode-8-i-wasnt-born-a-leader` with title
  `Episode 8: I wasn't born a leader`.

The created destination document is `cmsc3mz3j0004azxlai88ecz3`. Independent
readback found 114 destination blocks in orders 0 through 113, 114 unique
stable anchors back to the source block IDs, one human/applied/reversible
receipt, a current source hash matching the receipt, and an unchanged source
timestamp. The receipt reports `sourceMutated=false`,
`externalSideEffects=false`, `providerCalendarMutated=false`,
`recordingStarted=false`, and `publicationCreated=false`.

## Real source media and watched span

The exact local source was `/Users/wall-e/Downloads/Ted Lasso Be Curious.mp4`:

- 19,100,059 bytes;
- SHA-256
  `acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`;
- H.264, 1280 by 638, 24000/1001 frames per second;
- AAC stereo, 44.1 kHz; and
- 254.630023 seconds.

The file was selected through the rendered Episode Room upload control. Nest
registered imported media `cmsc3rlcy003hazxlo5n5yn0w` and ingest source
`cmsc3rlcn003gazxloqz9sfio`, then served the immutable bytes through
`/api/ingest/media/cmsc3rlcn003gazxloqz9sfio`.

The rehearsal clock produced one receipt-backed Shared Watch segment:

- source range 00:00.000 through 00:13.182;
- episode range 00:09.064 through 00:22.246;
- derivative track `V9`; and
- `generatedFrom=quipsly-episode-room-watch.v1` with the session, watch
  segment, start receipt, and end receipt retained in `recordingSync`.

The editor reopened the exact production `cmsc3mz4r003bazxl4yepdf8h` and
reported one clip, one receipt-backed Shared Watch span, no missing media, no
track gap, and no overlap.

## Truthful media readiness repairs

Operating the real editor found two boundary defects that automated happy-path
tests had not exposed.

First, imported-media health correctly probed the protected playback URL while
the timeline derivative incorrectly probed its canonical asset ID as if it
were a URL. The same source was therefore simultaneously healthy in the media
pool and broken on the timeline. Timeline probes now resolve through the same
canonical imported-media resolver used by source and program monitors. The
rendered result is 2/2 checked, 2 preview-usable, 2 render-usable, zero broken,
and **Render-ready**.

Second, proxy summary logic independently OR'ed import metadata and registered
media-asset readiness. One asset could consequently count as both proxy-ready
and proxy-needed. Registered `StudioMediaAsset` readiness is now authoritative
when available; import metadata is an explicit fallback only. The rendered
inventory now reports zero proxy-ready, one proxy-needed, and `asset truth`.
This does not contradict render readiness: the immutable original is playable
and renderable now, while a dedicated collaboration proxy is still required
before trusting shared remote editing performance.

## Operated playback acceptance

The local editor loaded the authenticated owner and exact Episode 8 route. The
selected clip health readback reported HTTP metadata 200, `video/mp4`,
reachable, preview-usable, render-usable, and no media error.

The rendered **Cue in** control moved the playhead to 00:09.064. **Play active
edit** advanced the episode playhead to 00:22 while two decoded video monitors
advanced to approximately 13.2 seconds of source time. Browser media readback
reported `readyState=4`, 1280 by 638 decoded dimensions, 254.630023-second
duration, and no `MediaError`. The rendered **Pause** control stopped both
monitors cleanly.

The original file checksum remained unchanged after import, watch, timeline
projection, health checking, playback, and pause.

## Verification

- Episode Room directory, suggestion, route, editor, and proxy-readiness Jest:
  5 suites / 20 tests, pass.
- Strict Quipsly TypeScript and generated route types: pass.
- Release cadence contract: pass.
- Git diff validation: pass.
- All 41 migrations on a disposable PostgreSQL database: pass.
- Episode Room persistence integration on the disposable database: pass.
- Zero Prisma migration diff after the clean chain: pass.
- Rendered source-backed Episode 8 creation: pass.
- Real media upload, Shared Watch derivative, health, play, and pause: pass.

No Cloud Build, Cloud Run deployment, production database mutation, provider
calendar call, invitation, message, publication, TestFlight action, or source
deletion occurred. The retained local room and imported clip remain available
for continued Episode 8 work.

## Remaining acceptance boundary

This proves one substantial real Episode Room writing-to-Shared-Watch-to-editor
slice on local Nest. It does not satisfy the full goal's second real episode,
two genuine coaching workflows, physical-iPhone capture and failure recovery,
separate-account rendered privacy, transcript correction against playback,
final Studio proof-watch/listen, portable export/restore, or production release
readback. A dedicated collaboration proxy and a clean episode audio spine also
remain necessary before this Episode 8 room is a trustworthy multi-source
podcast edit.
