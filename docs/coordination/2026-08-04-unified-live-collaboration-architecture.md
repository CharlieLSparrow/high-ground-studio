# Unified live collaboration architecture

Date: 2026-08-04

Status: current-state audit plus accepted implementation direction

Product surfaces: Quipsly Nest, Quipsly Capture, Episode Room, Session workspace

## Outcome

Quipsly already has one real browser/iPhone media room rather than separate
"web meeting" and "phone recording" prototypes. A signed-in participant can:

- join the same LiveKit room from a browser or Quipsly Capture;
- choose a named external browser microphone, camera, and supported audio output;
- use the call feed for conversation while retaining an independent local
  source on each recording device;
- keep durable Session chat, invitations, participant access, consent,
  recordings, transcript evidence, notes, tasks, goals, and output receipts on
  the canonical `CallRoom`;
- bind a podcast `CallRoom` to exactly one same-Nest
  `StudioEpisodeProduction`, which owns the manuscript, shared Watch clips,
  episode-wide thread, milestones, editor, and publishing continuity.

The remaining domain gap is coaching continuity. Coaching has canonical
bookings, Sessions, notes, goals, tasks, follow-up, and cross-Session
projections, but it does not yet have a first-class long-lived coaching
engagement aggregate or engagement-scoped conversation.

## The intended ownership model

| Boundary | Lifetime | Owns | Must not own |
| --- | --- | --- | --- |
| Session (`CallRoom`) | One call, interview, meeting, or recording take | participant access, consent, live provider identity, local/provider source receipts, Session thread, transcript evidence, take-specific notes | episode manuscript, publishing state, all coaching history, project-wide chat |
| Episode (`StudioEpisodeProduction`) | Whole podcast episode | manuscript boundary, shared clips and Watch receipts, episode thread, recording Sessions, milestones, timeline/editor handoff, publishing | raw participant access for every take, implicit recording actions |
| Coaching engagement (next canonical aggregate) | Whole coach/client relationship or program | explicit members and roles, privacy policy, shared coaching thread, engagement goals, Session sequence, client-safe resources and follow-through | private coach notes, provider credentials, automatic transcript-to-work promotion |
| Nest (`StudioProject`) | Whole project or organization | membership, tags, research/writing/media vocabulary, project work, authorized resources | automatic access for coaching clients, one giant undifferentiated conversation |

The media transport is deliberately shared. The surrounding experience is
purpose-specific:

- `PODCAST`: camera-forward recording, Episode relationship, run of show,
  shared clips, take sources, edit timeline, production work, publishing.
- `COACHING`: audio-first by default, prior commitments, private/team/client-safe
  notes, consent-gated transcript, shared goals, follow-up.
- `RESEARCH_INTERVIEW`: source and consent provenance, evidence transcript,
  annotations, citations, later writing uses.
- `INTERNAL_MEETING`: agenda, decisions, tasks, handoffs, and project
  continuity.

Purpose changes labels, defaults, privacy, and continuity. It does not fork the
call protocol, capture ledger, or transcript evidence model.

## Browser studio contract

The browser live room supports external input by exact `deviceId` and retains
the label as a usability fallback when browsers rotate identifiers. Preflight
does not request microphone or camera permission until the participant acts.
The participant can test the selected setup before joining.

The live conversation path uses echo cancellation, noise suppression, and
automatic gain control for intelligibility. The independent retained source
requests unprocessed 48 kHz audio and, for video, up to the measured camera
profile. The source profile records what the browser actually supplied; UI must
never call a USB camera feed 4K merely because 4K was requested.

Joining never starts recording. Retained browser recording requires:

1. durable local browser storage;
2. the exact selected input;
3. headphones attestation;
4. versioned participant consent and separate transcription permission;
5. a visible record action;
6. durable START and STOP receipts;
7. exact-byte hash and resumable upload verification.

The call and retained source remain separate so a network interruption does not
destroy the local original. Provider/server egress is another explicit visible
recording source, not an inferred side effect of joining.

## Live-operation UX repair in this slice

- Microphone, camera, and output selectors remain available after joining.
- A participant can switch live-call devices without leaving the room.
- Device-list refresh no longer changes a connected room back to preflight or
  error presentation.
- Device switching locks while a retained local source is starting, recording,
  or stopping. The active take keeps its measured source identity.
- An audio-only participant can start a selected camera after joining.
- Session chat is a desktop sidecar beside the live room in both the generic
  Session workspace and the embedded Episode recording room.
- The exact bound Nest and Episode slug now reach browser-source upload metadata
  even when recording from the Session workspace rather than Episode Room.

## Conversation scopes

Two podcast threads are intentional:

- `session:<callRoomId>` is take-specific: device checks, who is late, immediate
  recording decisions, source handoff, and issues with this recording.
- `episode:<episodeSlug>` is episode-wide: writing, clip selection, editing,
  approvals, publishing, and collaboration spanning every take.

Chat is durable conversation, not canonical work. A message or transcript can
propose a note, decision, goal, task, edit, or calendar commitment, but the
appropriate review operation must create the canonical record.

Coaching currently has only the Session thread. The system must not emulate
coaching continuity with an arbitrary project-wide thread because that would
blur client membership and expose unrelated Nest content. The next schema slice
should introduce `CoachingEngagement` and `CoachingEngagementMember`, bind
bookings and CallRooms to the engagement, and authorize an
`engagement:<id>` thread through that membership boundary.

## Next production slices

1. **First-class coaching engagement.** Add the engagement aggregate,
   membership/access receipts, booking and Session bindings, private continuity
   page, and engagement-scoped durable thread. Backfill only when one client and
   coach pair is unambiguous; otherwise require an explicit repair decision.
2. **Durable plus low-latency chat.** Keep PostgreSQL as authority and add a
   LiveKit data-channel hint (or equivalent) so active rooms update immediately
   while reconnect/poll remains deterministic.
3. **Composable live dock.** Let participants keep call controls, Session chat,
   roster/consent, and the purpose-specific active tool visible together:
   podcast run of show/Watch, coaching shared commitments, research questions,
   or meeting agenda.
4. **Studio monitoring.** Add calibrated input level, clipping/true-peak risk,
   channel mapping, sample-rate/profile readback, headphone/output confidence,
   and a short recorded confidence take. Never replace post-capture waveform,
   loudness, spectral, sync, and drift analysis with a decorative meter.
5. **Multi-source recording contract.** Represent call audio, isolated local
   audio, camera video, screen/shared media, and provider safety recording as
   distinct source tracks with one Session clock and explicit alignment
   evidence.
6. **Purpose-aware handoff.** Podcast sources flow to Episode editor and
   publishing; coaching evidence flows to reviewed private/team/client-safe
   notes and commitments; research evidence flows to annotations/citations;
   meetings flow to reviewed decisions and work.

## Explicitly not claimed yet

- Browser device selection is implemented and covered by component/type gates,
  but the in-app browser automation surface rejected localhost navigation, so
  this slice does not claim a fresh visual browser acceptance receipt.
- Coaching does not yet have an engagement-wide chat or collaboration page.
- Session chat currently polls durable storage; it is not yet provider-hinted
  real-time messaging.
- Browser recording is a retained combined camera-plus-audio source or an audio
  source, not yet a multi-track ISO capture graph.
- Requested camera resolution is not proof of delivered 4K.
- Joining a call is not recording evidence.
