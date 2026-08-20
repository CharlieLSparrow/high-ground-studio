# Quipsly Coaching minimally instructed human flight

This is the real UX test. It is not a fixture smoke, a route checklist, or an
operator demonstration. Run it only after automated release gates pass.

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
