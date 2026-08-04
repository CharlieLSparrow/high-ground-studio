# Quipsly collaboration and live-session model

Status: adopted architecture; browser conversation and retained-source clients implemented; provider configuration and physical cross-device acceptance remain deployment gates

Last reviewed: 2026-08-04

## Product rule

A call is not a separate Quipsly product area. It is one capability of a
**Session**. The Session is the durable record of one scheduled or spontaneous
encounter: who participated, what everyone consented to, what devices joined,
what source media was retained, and what transcript, notes, goals, tasks, or
editor handoffs came out of the encounter.

Longer-lived work surrounds Sessions:

- an **Episode** owns manuscript, prepared clips, production dates, the
  persistent Episode thread, recording Sessions, timeline, edit decisions, and
  publication;
- a **Coaching engagement** projects continuity across repeated Sessions,
  including intake, shared goals, commitments, notes, and follow-up;
- a **Session** owns one meeting's preparation, live room, meeting thread,
  consent, source recordings, transcript, notes, work, and outputs.

This prevents three bad outcomes: duplicating calls for every product area,
showing publishing machinery in coaching, and forcing episode collaborators to
use a meeting chat as the permanent production conversation.

## Surface map

| Surface | Lifespan | Owns | Does not own |
| --- | --- | --- | --- |
| Episode Room | outline to publication | manuscript, Watch clips, production runway, Episode thread, linked recording Sessions, editor and publish handoffs | call transport or recording consent |
| Coaching engagement | client relationship | repeated Session continuity, shared goals, open commitments, coaching plan | episode timeline or publication |
| Session workspace | one encounter | preparation, Live Room, Session thread, consent, recordings, transcript, notes, tasks, goals, outputs | persistent episode-wide decisions |
| Live Session | while people are present | selected call devices, realtime participants, network state, mute/camera state | retained source truth, transcript authority, provider recording authority |

The web route is `/sessions/:callRoomId?mode=live`. An Episode Room links to
that same route for its selected recording Session and can expose the Live
Session inline. Quipsly Capture joins the same provider room from iPhone.

## Two media planes

Quipsly deliberately separates conversation from production sources.

### Conversation plane

LiveKit carries low-latency audio and optional camera video between browser and
native participants. The browser client:

- asks for microphone and camera permission separately;
- enumerates and names external inputs and, where supported, outputs;
- previews the exact selected setup and exposes a microphone confidence meter;
- obtains a short-lived, room-scoped token from Nest;
- attaches remote audio/video tracks and exposes roster, active-speaker,
  reconnect, mute, camera, and leave state;
- never implies that joining starts any recording.

The implementation follows LiveKit's room, local-participant, track, and active
device APIs. Browser capture requires a secure context; `localhost` is valid for
development. Output routing uses `HTMLMediaElement.setSinkId` only when the
browser supports it, otherwise Quipsly points to the system output selector.

- [LiveKit JavaScript client reference](https://docs.livekit.io/reference/client-sdk-js/)
- [LiveKit room connection](https://docs.livekit.io/intro/basics/connect/)
- [LiveKit token authentication](https://docs.livekit.io/home/concepts/authentication/)
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId)

### Retained-source plane

Production-quality local files remain independent and immutable. iPhone
Capture records file-backed local sources and uploads them through the
canonical resumable contract. The Mac/browser lane now records the selected
mic, or selected camera plus mic, to the origin-private file system in regular
chunks while publishing a separately processed conversation copy. It records
the actual browser track settings and processing flags rather than claiming a
requested resolution or unprocessed signal was achieved. A Canon USB webcam
feed may be useful local/reference video; the camera's internal recording can
still be imported as the higher-fidelity master.

Each browser source has a durable IndexedDB ledger plus an OPFS file, unique
capture/upload/receipt IDs, chunk byte offsets and recorder timecodes, exact
size and streamed SHA-256, consent and participant bindings, and explicit
local/held/uploading/verifying/verified states. START and STOP go through the
same append-only room receipt ledger as iPhone Capture. Completed files use the
same direct-to-vault resumable-v2 manifest and verified editor-finalization
contract. Local deletion is intentionally absent until retention policy and a
verified server receipt both permit it.

All-party consent is not checked only once. The browser reads the current
consent snapshot during recording and stops visibly if a participant joins,
revokes consent, or the readback becomes unavailable. Flushed source bytes are
preserved locally; an interrupted or held take never masquerades as verified.

The standalone `/recorder` page remains a legacy episode experiment. Its
global IndexedDB chunk store and paused upload path are not canonical and must
be retired or migrated onto the Session recorder before it can be a release
surface.

Provider egress is optional safety/reference media. It never silently becomes
the only master. Starting provider recording remains a separate, consent-gated,
visible command with durable idempotency and reconciliation requirements.

## Identity and simultaneous devices

Authorization uses the canonical `CallParticipant` and Quipsly user. Realtime
media identity adds a bounded client-instance suffix. Therefore one person may
join from iPhone and Mac without LiveKit treating the second device as a
replacement for the first. Token metadata retains the canonical participant
and user IDs plus client kind and display label for audit and UI projection.

Legacy clients that omit a client instance retain the canonical participant
identity. New browser clients persist a random installation-scoped identifier
in local storage; it is not an account identifier or credential.

## Conversation scopes

Every message must make its scope obvious:

- `episode:<episodeSlug>` is the persistent production thread across writing,
  recording, editing, approval, and publishing;
- `session:<callRoomId>` is the thread for one meeting: arrival, agenda,
  handoffs, links, and immediate follow-up;
- coaching continuity is projected from repeated Session artifacts and shared
  work rather than copied into a faux Episode thread.

The two threads may be visible near each other, but Quipsly never merges them
implicitly. A deliberate promote/link action can later carry a Session decision
into the Episode thread with provenance.

## Shared Watch authority and realtime delivery

Episode Watch is one shared transport, not a collection of loosely synchronized
players. Any collaborator with edit permission can play, pause, seek, select a
clip, or end a watched range. Nest first accepts that action against an expected
Episode Room revision and writes the canonical receipt, watched source span,
and Episode-clock alignment. Browser and iPhone players only follow that
accepted room state.

When both devices are in the Live Session, the sender also publishes a small
reliable LiveKit data hint containing the exact project, episode, Session,
revision, receipt, and command identifiers. Receivers validate all boundaries
and then fetch the canonical Episode Room over authenticated HTTPS. They never
apply a room-data payload directly. Stale, malformed, cross-episode, and
cross-Session packets are ignored. Normal polling remains the recovery path for
packet loss, participants outside the call, and provider outages.

This produces low-latency controls without turning LiveKit into a second state
store. Reconnect, editor assembly, audit history, and exact watched ranges stay
deterministic even if the call plane disappears.

## Episode versus coaching behavior

| Capability | Podcast Episode Session | Coaching Session |
| --- | --- | --- |
| External browser mic/camera and iPhone interop | yes | yes |
| Meeting-specific Session thread | yes | yes |
| Persistent surrounding thread | Episode thread | engagement/client continuity |
| Prepared shared media | Episode Watch with revisioned control receipts | optional coaching material, not an episode timeline |
| Retained outputs | aligned sources, transcript, edit handoff | transcript, shared/private notes, goals, tasks, follow-up |
| Publishing and social workflow | visible | absent |
| Consent | participant-scoped recording/transcription consent | participant-scoped recording/transcription plus coaching privacy policy |

## Current operational truth

Implemented in the browser:

- one Live Room mode in the canonical Session workspace;
- external microphone, camera, and output selection with honest permission and
  timeout states;
- real LiveKit room client rather than the retired console-log stub;
- browser/iPhone device-scoped coexistence tokens;
- a durable Session thread distinct from the Episode thread;
- Episode Room creation/binding of a Podcast Session and direct Live Room
  handoff;
- explicit language that a connected conversation is not recording.
- a separate visible retained-source recorder for studio audio or camera plus
  audio, with headphones attestation and actual device/profile evidence;
- OPFS media plus an IndexedDB recovery ledger, regular chunk flushing,
  streamed checksum, manual download, retryable handoff, and no automatic
  source deletion;
- current-policy recording/transcription choices and all-party consent
  readback before and during recording;
- canonical START/STOP receipts and resumable-v2 upload/finalization shared
  with iPhone Capture.
- revisioned Episode Watch control from browser or iPhone, plus reliable
  room-data wakeups that always reconcile against the canonical HTTPS room.

Still gated:

1. approve and configure a LiveKit deployment and scoped server credentials in local,
   preview, and production environments;
2. complete signed-in physical browser validation of OPFS recovery, long takes,
   container salvage after browser loss, external-device contention, exact
   upload/finalization, and editor playback;
3. complete two-person browser/iPhone acceptance with device route loss,
   reconnect, headphones, drift, and source/editor readback;
4. operate shared Watch with two real participants and verify control latency,
   clip preparation, reconnect, exact ranges, and editor projection;
5. finish the provider-recording outbox, per-room lock, and reconciliation
   before enabling egress START in production.

## Provider decision

Use managed LiveKit Cloud for the first production call plane unless the cost
proposal changes materially. It minimizes TURN, regional routing, upgrades,
and realtime incident-response burden while Quipsly differentiates on local
source quality, audio transparency, transcription, automation, and workflow.
Run a local LiveKit server for deterministic development and CI. Keep the
provider behind Nest-issued tokens so self-hosting remains an operational
option rather than an application rewrite.

See `docs/operations/quipsly-livekit-cost-and-environment-proposal.md` for the
current cost envelope and provisioning decision.
