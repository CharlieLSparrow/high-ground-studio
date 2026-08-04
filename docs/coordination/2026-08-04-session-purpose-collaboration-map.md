# Session purpose and collaboration map

Date: 2026-08-04

Status: implemented and locally qualified

## Outcome

Quipsly has one canonical `CallRoom`/Session media and evidence kernel. It does
not create a second call product for podcasts, coaching, research interviews,
or team meetings. The Session workspace now projects that kernel into four
purpose-specific journeys and names each lane for the job a person is actually
doing.

| Canonical mode | Coaching | Podcast | Research interview | Team meeting |
| --- | --- | --- | --- | --- |
| Prepare | Prepare | Run of show | Source plan | Agenda |
| Live | Coaching room | Recording room | Interview room | Team room |
| Recordings | Recordings | Takes | Sources | Recordings |
| Transcript | Review transcript | Edit transcript | Evidence transcript | Decision transcript |
| Notes | Coaching notes | Production notes | Research notes | Meeting notes |
| Work | Goals & commitments | Episode work | Findings & tasks | Decisions & tasks |
| Outputs | Follow-up | Editor & publish | Writing uses | Handoffs |

Switching purpose projection or workspace mode creates no duplicate record.
Every mode reads the same Session, consent, source, transcript, notes, goals,
tasks, delivery, and handoff evidence.

## Collaboration scopes

The UI now explains three scopes instead of expecting collaborators to infer
them from navigation:

1. **Session scope:** participants, consent, live media, local/server takes,
   Session thread, transcript review, and immediate notes for one call or take.
2. **Continuity scope:** the exact Episode Room for a podcast; coaching,
   research, or project continuity for other purposes.
3. **Canonical continuation:** reviewed notes, tasks, goals, calendar work,
   editor handoffs, delivery receipts, and publication state. Chat and
   transcripts may propose work but never silently become it.

For podcast Sessions, Nest now prefers nullable
`CallRoom.episodeProductionId`. New Session creation resolves the requested
slug through the same-project episode compound key and writes the relational
binding plus a temporary compatibility slug. Legacy metadata is considered
only when the relation is null; a conflicting relation never falls back to
metadata. Only that server-validated relationship can produce links to the
exact Episode Room, episode thread, and episode editor. A missing or invalid
relationship fails visibly to “Episode relationship needs attention”; Quipsly
does not guess from the title. See
`docs/coordination/2026-08-04-first-class-session-episode-binding.md`.

The Episode Room now exposes a stable `#episode-thread` destination. Its
Session-only thread remains separate and describes its narrower scope.

## Browser and iPhone boundary

`LiveSessionRoom` remains the shared browser call surface for every purpose.
It supports explicit external microphone, camera, and output selection while
another participant joins the same provider room from iPhone Capture. Joining
the call does not start retained browser media or iPhone recording. Each source
remains separately consented, recoverable, checksummed, uploaded, and aligned.

Podcast Episode Rooms embed the same live Session beside manuscript, Watch,
timeline, episode thread, milestones, editor, and publishing paths. Coaching
uses the same transport but keeps private/team/client-safe notes, commitments,
and follow-up boundaries.

## Qualification

- Focused Session, collaboration-model, workspace-language, purpose, page, and
  Episode Room suites: 60 tests passed.
- Complete Nest regression after first-class Episode binding: 299 suites and
  1,565 runnable tests passed; 39 environment-gated suites and 115 tests
  remained explicitly skipped. The new binding operation and production-route
  operation also passed separately against local PostgreSQL.
- Quipsly TypeScript passed after generated route types.
- The optimized Nest production build compiled, typechecked, and generated all
  172 static pages. Mobile source contracts passed 98/98 and Capture/App Store
  static contracts passed 1,025/1,025.
- Retained local database readback found both journey kinds. The retained
  podcast calendar runway Session resolves to its exact episode production;
  retained coaching Sessions remain project- or engagement-scoped and cannot
  acquire an episode link.
- The embedded browser localhost control attempt was denied by browser URL
  safety policy. No alternate browser-control path was used. Component render
  tests cover the purpose-specific accessible names and exact destinations;
  a visible operated pass remains to be repeated when the supported browser
  lane permits localhost control.

## Follow-on hardening

The nullable first-class Episode ↔ Session key, reversible same-project
backfill, Capture creation write, Episode Room dual-read, and retained migration
readback are complete. Keep the compatibility read until supported Capture
builds all write the relation and an explicit repair surface resolves the
remaining unmatched legacy row. Calendar and import workflows should pass an
episode identifier through the same resolver rather than writing metadata or a
foreign key directly.

Do not add a separate CoachingRoom or PodcastRoom database aggregate. Purpose
projections should remain views over the Session spine, with purpose-specific
records added only where the domain is genuinely different (episode production,
coaching engagement/client follow-up, research evidence uses, or publishing).
