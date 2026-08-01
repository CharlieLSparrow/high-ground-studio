# Quipsly Capture App Review notes

Quipsly Capture is an iPhone-first companion for coaching conversations,
podcast sessions, interviews, field notes, and follow-through. The reviewer
account contains only synthetic test records.

## Sign-in and test path

1. Sign in with the demo account supplied in App Store Connect.
2. Open Today and Work. Create a disposable note, task, goal, project, and tag;
   confirm that the records remain after relaunch.
3. Open the supplied synthetic capture session.
4. Choose a source mode and complete the explicit consent sheet. Audio/video
   recording, transcription permission, and confirmation that everyone who may
   be heard agreed are separate choices. Completing consent does not start a
   recording.
5. Record and stop a short disposable audio take. Optionally choose Solo video,
   prepare either iPhone camera, and use Flip once during a disposable take.
6. Open Library. The app separately reports local-save, upload,
   cloud-verification, and processing states. A failed network operation leaves
   the protected local original available for retry.
7. Open Account to reach Privacy and Request Account Deletion.

## Recording behavior

- Joining a session never starts local or provider recording.
- Recording state remains visible through text, shape, timer, controls, and
  VoiceOver.
- Camera flips and pause/resume preserve honest source boundaries in one capture
  group instead of presenting multiple files as one uninterrupted source.
- Local originals are not automatically deleted after upload. The owner can
  explicitly delete one local original after a separate irreversible-deletion
  confirmation; that does not delete cloud media or the Quipsly account.
- Verified cloud bytes remain held from transcription and downstream use unless
  the session's consent and processing-release gates allow them.

## Account and policy notes

The app currently requires an authorized Quipsly account. Some processing and
cross-device features require an internet connection. The in-app account-
deletion action creates a reviewed request so shared, payment, consent, and
retention-sensitive records are not silently erased.

Privacy policy: https://quipsly.com/privacy

Account deletion: https://quipsly.com/privacy/account-deletion

One-to-one coaching payments, when enabled, are for eligible real-time
person-to-person services. Quipsly software access and other digital goods are
not sold through that coaching checkout path.
