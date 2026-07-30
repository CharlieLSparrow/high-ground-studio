# Quipsly iPhone and Future iPad Workflow

Status: iPhone production boundary; iPad studio deferred

Last reviewed: 2026-07-30

## Current product

Quipsly Capture currently targets iPhone only (`TARGETED_DEVICE_FAMILY = 1`).
Its root is `ContentView` and its authenticated operating surface is
`CapturePhoneShell`.

The five destinations are Today, Record, Work, Library, and Account. They share
canonical Nest identities for projects, Sessions, notes, tasks, goals, tags,
annotations, and source evidence while the iPhone remains the trustworthy
local/offline capture edge.

Active local recording stays reachable if authentication expires. A recently
verified actor may recover that actor's protected offline Library and journal
private retry-safe work, but cannot mutate consent, rooms, uploads, or other
network truth until Nest verifies the same identity again.

## Editing and publishing

The iPhone does not compile a duplicate editor or publisher.

- Nest owns collaborative episode writing, Session chat, research, notes,
  goals, tasks, calendar, tags, annotations, and review state.
- QuipslyStudio owns synchronized timeline editing, proof-watch/listen,
  non-destructive decisions, reframing, export, and publishing preparation.
- Capture owns immutable local sources, capture-clock evidence, marks,
  recoverable upload, lightweight review, and explicit Studio handoff.

The retired iPad/sample editor graph used placeholder media and simulated export
and publishing success. It was removed rather than hidden behind navigation.

## Future iPad decision

An iPad production surface is a new qualified product increment, not an
automatic expansion of the iPhone target. Research may justify a manuscript,
cue, review, or control surface, but implementation must:

1. use the canonical document, Session, source, lane, revision, and tag
   identities;
2. preserve immutable media and reversible editorial decisions;
3. avoid a fourth timeline or publishing authority;
4. meet keyboard, pointer, Dynamic Type, VoiceOver, interruption, thermal, and
   long-source performance gates; and
5. pass real-device and cross-device persisted-state proof before distribution.

Until those gates exist, iPad users should use Nest for collaborative work and
QuipslyStudio for deep production.
