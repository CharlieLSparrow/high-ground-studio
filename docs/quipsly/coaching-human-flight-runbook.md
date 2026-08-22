# Quipsly Coaching minimally instructed human flight

This is the real UX test. It is not a fixture smoke, a route checklist, or an
operator demonstration. Run it only after automated release gates pass.

## Immediate Build 33 physical flight

The first physical flight is deliberately smaller than the complete cohort
journey below. It proves the released phone and browser call spine before the
same people spend time evaluating post-call editing. Passing this milestone
does not pass the complete human-flight or 50-coach release gate.

Current release target, read back on 2026-08-21:

- **Quipsly Capture 1.0 (33)** through the open Apple public beta at
  `https://testflight.apple.com/join/XwRRcYUm`;
- **Nest revision `studio-00523-yun`**, source
  `e73fef64880362f3c6c5fc793c5b047408d22a40`, serving 100% of production
  traffic;
- Homer signs into Quipsly with Google as `shomers@gmail.com`. His Apple
  TestFlight account may be a different address and does not determine his
  Quipsly identity;
- the client uses a separate ordinary identity that has not been granted any
  unrelated Quipsly access.

Send Homer this message and nothing else before he starts:

> Install or update Quipsly Capture from
> https://testflight.apple.com/join/XwRRcYUm, then continue with Google as
> shomers@gmail.com. Create a Coaching Session for this client's email and use
> Quipsly to invite them. At the scheduled time, both follow Quipsly's prompts,
> join, make a short recording, add one shared note and one assigned task, end
> the Session, and later reopen it to confirm the work is still there.

Give the client only the invitation Quipsly produced. The invitation should
explain the relationship and offer the supported app or browser path without
requiring a laptop, a redemption code, an internal route, or a room ID.

For this first flight, observe these facts without steering either person:

1. Homer installs or updates Build 33, signs into the intended Quipsly account,
   creates the Session, and produces the invitation through ordinary UI.
2. A signed-out client opens that exact invitation, uses a fresh identity,
   reaches only the invited coaching space, and can choose the supported app or
   browser path.
3. Consent, device readiness, Join, and Record appear in a conventional order.
   The call does not start recording implicitly.
4. Both endpoints hear each other. The intended endpoint starts and stops its
   participant-owned source, and a reconnect or background event has an
   understandable recovery path.
5. The shared note and assigned task are visible to the intended people and no
   unrelated Nest, podcast, client, or Session is visible.
6. After ending, both people can return through ordinary navigation. The
   recording state and retained shared work survive the return.
7. Run the canonical post-call readback below against the Session created by
   the people. Human listening and UI observations remain separate evidence.

If a person asks for help, record the question and exact answer, let the flight
continue, and mark hands-off acceptance failed. A useful recording may still be
kept as diagnostic evidence. After repairing any discovered problem, repeat
this same flight with a person who has not rehearsed the repair.

## Prepare without pre-solving the journey

1. Use two people who have not rehearsed the current build, two real inboxes,
   and ordinary supported devices.
2. Give each person a fresh or ordinary production account. Do not seed a room,
   copy a database ID, bookmark an internal route, or pre-open the destination.
3. Confirm the released web revision and iPhone build, service health, mailbox
   delivery configuration, recording storage, transcript worker, and call
   provider before the people begin.
4. Start the observer record. Record product version, device/browser, network,
   accessibility settings, start time, and the exact sentence given below.

If invitation email is not actually configured, run the journey to exercise
copy/share recovery but mark real-mail and self-service acceptance failed. A
manually delivered link is diagnostic evidence, not a mailbox pass.

## What the people receive

Give the coach only this sentence:

> Use Quipsly to invite this client, schedule and record a coaching Session,
> keep a shared note, task, and goal, then lightly edit and share the recording
> and transcript with the client.

Give the client only the invitation Quipsly produced. Do not supply a route,
menu name, room ID, workaround, or spoken tour.

This complete mission follows the immediate Build 33 flight. Do not interpret
a successful short call as proof that transcript correction, light editing,
sharing, revocation, and later cohort operation have passed.

## The actual product journey the observer expects

This is the observer's map, not a checklist to hand to either participant. The
names of pages, database records, test accounts, fixture Sessions, and direct
URLs are deliberately absent.

1. The coach follows the ordinary welcome path, signs in, and completes any
   first-time coaching setup the product requests.
2. The coach schedules a real Session for the client in the correct timezone.
3. The coach sends the private invitation from the Session Quipsly just
   created. The client receives it in their real inbox, understands it, signs
   in with the invited identity, and accepts it.
4. Both people can find the same coaching relationship and upcoming Session
   through ordinary product navigation. Neither person gains access to an
   unrelated Nest, client, or Session.
5. Before the conversation, either participant can add useful shared context;
   the coach can also keep genuinely private preparation private.
6. Each person checks the microphone, camera when wanted, and listening output.
   They understand the consent state, join the call, and deliberately start
   their own high-quality recording only after everyone is ready.
7. The call remains understandable while each endpoint records its own source.
   Ending, backgrounding, a brief disconnect, or delayed upload has a visible
   state and a recoverable next action.
8. After the Session, Quipsly brings the participant-owned sources into one
   synchronized Session and shows what is safe, incomplete, or needs attention.
9. Quipsly creates a speaker-attributed transcript. A person can play the exact
   source, correct words and speakers, and understand uncertainty without
   rewriting the original media.
10. The coach and client can create, find, change, assign, and complete the
    shared notes, tasks, and goals that belong to this relationship. Suggested
    follow-up remains editable until a person accepts it.
11. The coach makes a light, reversible edit, previews the result, chooses the
    exact recipient, and shares only the intended recording and transcript.
    The client can play or download it, and revoked access stops working.
12. Later, both people return independently and find the Session, follow-up,
    recording, transcript, notes, tasks, and goals without the observer.

If a person needs help, record the exact moment and help given, let them finish,
and keep self-service acceptance failed. Repair the product after the flight;
do not repair roles, records, or navigation behind the scenes while it is in
progress.

## Canonical post-call readback

After both people finish, connect the production Cloud SQL proxy without
changing the Session and run the exact-room verifier:

```bash
QUIPSLY_PRODUCTION_POST_CALL_READBACK=1 \
DATABASE_URL='postgresql://…' \
npm run quipsly:coaching:post-call-readback -- \
  --room-id '<room-id-created-by-the-flight>' \
  --output '/absolute/private/path/post-call-readback.json'
```

The verifier opens a read-only, repeatable-read transaction. Its private
mode-0600 receipt binds invitation delivery and acceptance, separate account
identities, current consent, endpoint checks and grants, recording transitions,
source expectations, verified local media, at least two seconds of overlap
across the required masters, resumable-queue drainage, finalization, one
completed participant-bound transcript per person whose immutable source hash
matches and whose timed segments remain inside that source, a verified private
assembled playback whose immutable render receipt includes every required
participant master, and shared work to the exact canonical Session. Email
delivery and accepted
share/copy handoff remain separate facts; either supported invitation path can
satisfy the Session handoff. Names, addresses, content bodies, and storage
locations are excluded.

This receipt cannot prove audible quality, comprehension, hands-off navigation,
later cross-device discovery, or outsider concealment. Record those direct
observations separately. `automatedEvidencePassed: true` makes the Session
eligible for human acceptance; it never sets `humanAcceptance.satisfied`.

## Observer rules

- Let the product teach the workflow. Silence is part of the test.
- Stop an unsafe recording, privacy mistake, destructive action, or accidental
  third-party communication.
- Record every pause, backtrack, misprediction, help request, browser or device
  switch, permission surprise, and point where visibility or recording state is
  misunderstood.
- If help is required, record the exact help and let the people continue, but
  keep self-service acceptance failed.
- Never repair the database, change access manually, or substitute a retained
  test artifact during the run.

## Evidence the product must leave

The observer verifies afterward—not by steering the people—that the same
canonical records connect:

1. coach, client, invitation delivery and acceptance;
2. appointment, timezone and external calendar state;
3. Session, consent, call participation and independently owned local sources;
4. upload/finalization, source overlap and synchronization evidence;
5. speaker-attributed transcript and protected playback;
6. shared note, task and goal plus any deliberately private work;
7. edit decisions, private preview, named recipient and explicit release;
8. recipient playback/download and a successful revoke-denial check;
9. later independent return by both people to the same relationship and
   Session.

## Pass rule

Both people complete the job and return later without observer help. No
unresolved data-loss, privacy, invitation, call-entry, finalization, transcript,
or recipient-access failure remains. “No event received” is unknown, not pass.

Run cohorts in order: 2, then 10, then 50 coaches. A lower cohort can advance
only after its failures are repaired and a new minimally instructed pair proves
the repaired path. Automated fixtures continue to protect regressions, but they
never promote themselves into this human result.
