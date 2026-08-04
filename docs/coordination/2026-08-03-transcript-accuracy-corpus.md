# Transcript accuracy-corpus checkpoint

Date: 2026-08-03

External mutation: none

## Outcome

The transcript desk now turns real listening into an immutable private accuracy
reference. Quipsly does not infer truth from provider confidence, transcript
text, filenames, or an agent checkbox. It requires protected playback, current
release/consent, exact source identity, and a reviewed receipt for every source
segment.

The UI also measures whole-source playback in one-second bins. Seeking does not
count as listening, and the server rejects approval unless the receipt covers
the complete source. This closes the deletion-error gap where every provider
segment could be reviewed while untranscribed audio between or after segments
was never heard.

## Operated correction

The first retained HGO browser read exposed an accidental Prisma relation that
existed in the generated schema but not the committed migration. The resulting
query expected a nonexistent `callParticipantId` column. The stray relation was
removed, Prisma was regenerated, the local lane was restarted from the current
worktree, and the real page then rendered the corpus surface successfully.

That failure is why the retained local workflow remains an acceptance gate:
the focused TypeScript and component tests could not reveal a generated-query /
database-shape mismatch.

## Verification

- Prisma format and validation: pass.
- Local migration deploy and status: all 48 migrations applied.
- Focused server, route, and UI suites: 19/19 pass including the database smoke.
- Local PostgreSQL incomplete-playback rejection plus
  approval/replay/conflict/privacy proof: 1/1 pass.
- Nest strict TypeScript: pass.
- Local lane health, auth emulator, signed-out shell, and projects shell: pass.
- Retained HGO UI: private transcription lab visible; exact blockers read 0/5
  reviewed and no reference words; approval controls are absent.

No HGO segment was marked reviewed and no evaluation window was approved. A
provider transcript is not a listening substitute, and this checkpoint does
not manufacture a human approval to make the progress board greener.

Architecture and next gates are in
`docs/architecture/transcript-accuracy-corpus.md`.
