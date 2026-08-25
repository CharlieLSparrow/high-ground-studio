# Native coaching relationship continuity

Date: 2026-08-25

## Product boundary

An iPhone coaching client space now carries four durable kinds of continuity:

- **Conversation** spans the whole coaching relationship.
- **Sessions** return to each scheduled or completed call and its retained work.
- **Shared notes, tasks, and goals** remain canonical relationship work.
- **Private notes** remain visible only to their author.

This is intentionally different from the exact-call Session Conversation.
Session Conversation coordinates one call. Coaching Conversation stays with the
coach/client relationship across calls. Neither conversation silently creates
notes, tasks, goals, recordings, transcript decisions, messages, or calendar
changes.

## Architecture

Capture reuses the protected native collaboration client rather than creating
a second chat store. Its engagement scope binds to
`engagement:<coachingEngagementId>`, requires the exact project slug carried by
the authorized mobile relationship projection, and rejects a response whose
engagement ID or thread key does not match the requested context.

The server resolves engagement threads through
`coachingEngagementAccessWhere` before project-level Nest access. That keeps a
client's relationship access narrower than Nest membership: a client can read
the relationship thread without receiving project research, other clients,
production work, or private notes. The protected offline cache remains
partitioned by stable account owner and file-protected while the phone is
locked. Sends retain one client message ID across retry.

Session continuity is projected from the same actor-filtered Capture Session
response already used by the recorder. The client-space destination filters by
canonical coaching engagement ID and opens the exact room through the existing
authoritative Session refresh path.

## Operated evidence

The retained fresh-phone operation at source `e24a92da` passed on the iPhone 17
Pro Simulator with one selected compiled UI test and no unexpected runtime
warnings. Through ordinary app controls, a disposable non-staff coach:

1. set up coaching;
2. created a client relationship and appointment;
3. opened the native client space;
4. posted and read back a relationship-wide message;
5. saw Session continuity;
6. created a shared note, task, goal, and author-private note;
7. entered the exact scheduled Session.

Independent authenticated readback then proved the invited client could read
the exact iPhone-authored message and all shared work but could not receive the
coach's private note. A fresh unrelated account received private `404`
responses for both relationship conversation and relationship work.

Receipt:
`artifacts/coaching-acceptance/phone-start-23fea04a/phone-start-receipt.json`

XCTest result:
`artifacts/coaching-acceptance/phone-start-23fea04a/capture-phone-start.xcresult`

## Remaining human and physical evidence

This run proves local compiled product behavior, canonical persistence, and
account isolation. It does not prove physical-iPhone behavior, real invitation
delivery, push/realtime delivery, routed audio, or first-time human
comprehension. Those remain explicit in the deferred validation ledger and do
not block unrelated product work.
