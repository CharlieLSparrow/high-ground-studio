# Quipsly call experience product standard

Date: 2026-08-22  
Status: active product and acceptance rule

## Product promise

A person who can use FaceTime, Google Meet, or Zoom should be able to join a
Quipsly call without instructions. The call itself is deliberately familiar.
Quipsly earns its difference after that baseline works: participant-owned local
masters, visible audio confidence, trustworthy recovery, precise transcription,
and useful shared work after the conversation.

The default journey is:

1. Open the scheduled Session or its invite link.
2. See one green room with a preview, microphone/camera state, and one **Join
   call** action.
3. Grant an operating-system or browser permission only when the platform truly
   requires it. A previously retained permission is reused.
4. Talk using conventional mute, camera, participant, and leave controls.
5. Start a retained recording with clear participant consent. High-quality
   sources upload progressively while the call continues.
6. Leave only after Quipsly clearly reports whether this device's source is
   safely uploaded or still recovering.
7. Return to the same Session for the synchronized recording, transcript, notes,
   tasks, goals, and private sharing.

## What the market teaches us

Established meeting products converge on a green room with a preview, visible
mic/camera state, optional device selection, and one join action. Google Meet
also exposes a microphone activity check and a speaker test before joining;
Zoom offers an optional speaker/microphone test while allowing returning users
to join computer audio automatically.

Remote-production products add local high-quality capture and progressive
upload. Riverside's guest flow uses an invite link, device check, lobby, one
join action, automatic local recording when the host records, visible upload
progress, and an explicit upload-complete state. Its host can see each
participant's upload percentage. Descript Rooms similarly combines the live
conversation with local multi-participant recording and sends the result to its
editor.

Recurring complaints reveal the failure modes Quipsly must design out:

- guests are forced through an unnecessary login or cannot find the mobile join
  control;
- scheduling creates generic or ambiguous room links instead of one event-bound
  destination;
- upload progress or recovery is unclear, especially for the final few percent;
- a locally recorded track is lost, delayed, out of sync, or difficult to
  download independently;
- recording/transcription behavior consumes resources or changes output without
  a clear user action;
- post-call editing requires too many clicks or technical media knowledge;
- AI edits make harsh or incorrect cuts without a reviewable proposal.

## Quipsly rules

### Standard by default

- One event-bound invite opens one Session. Never reuse an ambiguous generic
  link for unrelated client appointments.
- The green room is the only pre-call room. Do not stack consent pages,
  permission pages, device pages, and join pages vertically.
- Joining does not start recording.
- Join with the remembered working setup. Device settings and sound checks are
  optional and nearby, not mandatory gates.
- Ask for camera/microphone access only through the platform's standard prompt.
  Never reproduce browser or iOS permission bureaucracy in product copy.
- Remember the selected microphone, camera, output, camera-on state, and
  join-muted state per device. If a hardware identifier rotates, match the
  retained human-readable label before falling back safely.
- Conventional in-call controls remain in predictable locations and use
  conventional labels: Mute, Camera, Leave, Participants, Chat, and Record.
- Reconnect automatically when safe. Interrupt only when the user must act.
- A client invited to a private coaching Session should not need broad Quipsly
  setup before the call. Authentication and profile completion must be no more
  than the minimum required to establish the private recipient boundary.

### Quality that is obvious, not magical

- Show live microphone confidence without making a sound check mandatory:
  signal present, healthy range, hot, or clipping risk.
- Record each participant locally and upload progressively in independently
  verifiable chunks.
- Show every participant's retained-source state to the host and their own state
  to the participant: recording, uploading, safely retained, recovering, or
  action required.
- Preserve immutable originals. Sync and mastery create derived versions with
  receipts; they never overwrite sources.
- Never guess synchronization. Use shared session clocks and reviewed alignment
  evidence, and expose uncertainty when it remains.
- Keep every transcript segment bound to the exact source and timing evidence.
  Corrections change text; media cuts require safe word timing or remain
  proposed.

### Calm post-call workflow

- Default to one recommended high-quality track per participant.
- Put technical source selection and precise numeric timing behind optional
  details.
- The main edit begins with familiar start/end trim controls, then transcript
  editing when trustworthy source timing is ready.
- A prepared copy stays private. The coach listens and uses one explicit **Share
  with [client]** action; do not add a second confirmation checkbox for the same
  reversible private action.
- Sharing, revoking, downloading, and recovery remain visible and attributable.
- Automation proposes notes, tasks, goals, chapters, removals, and audio
  mastery. People can accept, revise, or undo the result without touching the
  source recording.

## Acceptance evidence

Automation should prove component state, request boundaries, resumable upload,
checksums, multi-source overlap, sync receipts, source-bound transcript timing,
private output authorization, and cross-account isolation.

Human evidence should separately prove that an unfamiliar coach and client can:

- follow only the invite;
- join from phone or browser;
- hear and control each other;
- understand recording consent;
- finish or recover both local uploads;
- play the synchronized result;
- trim, listen, share, and reopen the private copy;
- see only the Session, notes, tasks, and recordings they are authorized to see.

Automated evidence never substitutes for that human acceptance, but waiting for
a tester does not stop independent product work.

## Research references

- Google Meet green-room device check and speaker test:
  <https://support.google.com/meet/answer/10409699>
- Google Meet automatic troubleshooting and device guidance:
  <https://support.google.com/meet/answer/10620583>
- Zoom optional pre-join audio test and automatic computer-audio behavior:
  <https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062765>
- Riverside guest join and mobile lobby flow:
  <https://support.riverside.com/hc/en-us/articles/5252042203037-Join-a-studio-as-a-guest>
- Riverside participant upload visibility and recovery states:
  <https://support.riverside.com/hc/en-us/articles/5457425335965-Recordings-status-guide>
- Descript Rooms product model:
  <https://help.descript.com/hc/en-us/articles/28800967976205-Get-Started-with-Descript-Rooms>
- Descript Rooms recovery and local-storage troubleshooting:
  <https://help.descript.com/hc/en-us/articles/30294178004621-Troubleshooting-Issues-with-Descript-Rooms>
- Recent Descript user feedback on scheduling, mobile join, track retrieval, and
  excessive clicks:
  <https://www.reddit.com/r/Descript/comments/1u9iuv0/used_rooms_for_the_first_time/>
  and <https://www.reddit.com/r/Descript/comments/1si8k8h/am_i_the_only_one_frustrated_with_descript_right/>
- Recent production-user feedback on sync drift and upload visibility:
  <https://www.reddit.com/r/podcasting/comments/1snt1fj/riverside_just_keeps_getting_worse/>

