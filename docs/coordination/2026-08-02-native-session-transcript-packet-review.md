# Native Session transcript-packet review checkpoint

Date: 2026-08-02

Status: compiled iPhone-simulator operation passes against retained canonical
Session and v4 packet state; physical-iPhone acceptance remains open

## Product gap closed

A completed canonical Session could show transcript and packet readiness on the
Record tab without giving the operator a direct path to the actual source-
grounded packet review. The only native entry points depended on a matching
phone-local recording or on work that had already been materialized.

Record now shows a first-class **Review transcript and packet** card whenever
the selected Session has a completed transcript, packet summary, or explicit
packet-review capability. It opens the existing protected transcript desk and
does not start playback or make a candidate decision. The card reports whether
this phone holds the exact recording asset; otherwise it states **Review only —
exact local source unavailable**.

The transcript desk now exposes explicit loaded and error boundaries. A loaded
packet summarizes its note, task, and goal proposal counts and repeats that
every candidate remains a proposal until a person reviews source evidence and
explicitly creates canonical work. The existing jump menu is the stable native
navigation for Notes, Tasks, Goals, and Transcript.

## Operated proof

The retained operator authenticated the exact coach against loopback Firebase,
read the canonical packet, ran the compiled `HighGroundCapture` UI test on an
iPhone 17 Pro simulator, then re-read the packet.

- Session: `qa-retained-coaching-next-session-20260807`
- packet build: `bc1e5657-b99e-4f06-be2d-bb63f0f8549b`
- candidates: 2 notes, 0 tasks, 1 goal
- complete goal evidence: 3 immutable transcript segments
- before digest: `f569bf3a9ff2c932a9e51553af693008880efddcd7f9b1c88c665cf805304006`
- after digest: `f569bf3a9ff2c932a9e51553af693008880efddcd7f9b1c88c665cf805304006`
- canonical materialization: 0 notes, 0 tasks, 0 goals
- result bundle:
  `/private/tmp/quipsly-retained-native-transcript-packet-1785716905222-99941.xcresult`

The UI selected the exact retained Session, opened its direct review card,
waited for the packet-loaded boundary, jumped to Goals, found the deliberate
**Review & create goal** control, and rendered the complete source sentence plus
**Complete thought across 3 immutable transcript segments**. It did not tap any
decision.

## Defect found through operation

The first runtime test falsely reported a missing goal candidate. Its screen
recording proved the full candidate was present, but a blind swipe loop passed
the lazily rendered card before XCTest exposed a wrapper identifier. The test
now uses the same explicit Goals jump action as a person, waits for the unique
human creation control, and verifies the complete text with a label predicate
instead of XCTest's 128-character identifier shorthand.

## Verification and remaining boundary

- compiled runtime operation: 1/1 pass, no unexpected framework warnings;
- mobile Capture source contract: pass;
- operator static safety contract: covered by the repository contract suite;
- credentials remain in Keychain/short-lived runner state and are not printed;
- no cloud deployment, provider mutation, external delivery, or publication.

This proves a retained local simulator workflow, not physical-iPhone playback,
capture, offline failure recovery, or App Store completion. Physical acceptance
must repeat the direct Session entry and exact-source playback on a paired
iPhone that holds the matching immutable recording asset.
