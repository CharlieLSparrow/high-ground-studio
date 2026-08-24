# Post-call playback readiness

Date: 2026-08-24

## Product correction

The Session source journey previously treated exact-byte retention, a completed
transcript, and editor materialization as enough to call a source journey
complete. That was stronger than the evidence: a protected playback route might
not exist yet, and the exact source might not have completed a decode check.

The journey now separates six checkpoints:

1. planned source identity;
2. capture boundary evidence;
3. exact-byte retention and release;
4. protected playback readiness;
5. source-bound transcription; and
6. editor materialization.

Released bytes without a protected player remain **in progress**. Audio reaches
playback-ready only when its authenticated route exists and an exact-source,
complete decode reports a positive duration. Video reaches playback-ready only
when its authenticated route has a positive duration and the retained capture
profile reports a real video track with positive encoded dimensions. A failed
or blocked audio decode becomes visible attention without replacing or mutating
the original.

## User experience

When the protected route exists, the expanded Session recording details include
an ordinary native browser audio or video player next to the source journey.
The UI no longer describes verified server bytes alone as ready to play. The
separate Playback checkpoint explains whether materialization, decode, or media
profile validation is still pending.

## Truth boundary

Automated evidence proves only that an authenticated source route is bound to
the retained source and that the named decode or video-profile checks passed.
It does not prove that a person listened, watched, perceived correct sync, or
accepted the media. Those remain runtime acceptance evidence and are retained
in the deferred validation ledger.

## Qualification

- `session-source-journey.test.ts`: complete path, missing playback route, and
  failed exact-source decode.
- `session-finishing-cockpit-card.test.tsx`: protected player and explicit
  human-listening boundary render in the Session UI.
- 11 focused Jest tests pass.
- strict Quipsly TypeScript passes after Next route type generation.

