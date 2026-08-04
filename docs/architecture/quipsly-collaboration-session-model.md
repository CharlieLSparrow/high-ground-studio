# Quipsly collaboration and live-session model

Status: adopted architecture; browser conversation client implemented; provider configuration and browser local-master capture remain deployment gates

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
Capture already records file-backed local sources and uploads them through the
canonical resumable contract. The intended Mac/browser lane records the Shure
or chosen mic locally while publishing a separately processed conversation
copy, and records/imports a Canon source independently. Each source carries its
own monotonic start/stop evidence and joins the Session clock before editor
alignment.

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

Still gated:

1. configure a LiveKit deployment and scoped server credentials in local,
   preview, and production environments;
2. implement the browser local-master recorder and resumable upload adapter,
   including long-take recovery and exact source-clock receipts;
3. complete two-person browser/iPhone acceptance with device route loss,
   reconnect, headphones, drift, and source/editor readback;
4. add a deliberate bridge from Episode Watch commands to low-latency room data
   while preserving the database receipt as authority;
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
