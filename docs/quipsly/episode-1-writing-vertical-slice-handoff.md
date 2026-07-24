# Episode 1 writing vertical slice handoff

Status: WIP dogfood map. Not validation proof.

This handoff connects the first serious agent-authored High Ground Odyssey writing draft to the same Nest -> Studio -> Tower loop used by the Episode 1 media work.

## What exists

- Source draft:
  `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-first-pass.md`
- Tower publication packet:
  `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/publication-packets/hgo-episode-1-the-wednesday-rule-writing-publication-packet.md`
- Nest ingest command:
  `script/agentctl.sh nest-serious-draft-file "Episode 1 - The Wednesday Rule" /Users/wall-e/Dev/high-ground-studio/docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-first-pass.md episode-1 "book,writing,episode-1,agent-first-pass" "agent first-pass draft created to dogfood the Nest Studio Tower loop"`
- Tower packet review command:
  `script/agentctl.sh publication-writing-packet`
- Tower packet JSON command:
  `script/agentctl.sh publication-writing-packet --json`

## What this proves

- Codex/Quipslys can create serious first-pass writing material without treating it as disposable placeholder text.
- The work can be labeled with authorship, review state, canon state, and publication state before it enters any public channel.
- The same Episode 1 vertical slice can carry writing, editing, shorts, podcast, and publication preparation as connected Quipsly truth.

## What this does not prove

- The draft is not canon-approved.
- The packet is not human-reviewed.
- Nothing has been scheduled or published from this writing packet.
- No external receipt has been captured.
- No live app validation has been run for this handoff yet.

## Next dogfood pass

1. Load the Episode 1 QuipslyStudio session.
2. Run the Nest ingest command above.
3. Inspect `GET /nest_writing_queue`.
4. Generate or inspect the Nest writing review packet.
5. Inspect `script/agentctl.sh publication-writing-packet --json`.
6. Decide whether the draft needs human edits, agent revision, source enrichment, or Tower copy refinement.

## Product rule

Quipsly is not anti-AI-writing. Quipsly is anti-invisible mutation, anti-fake provenance, anti-lost-thread, and anti-receipt-free publication claims.

Agent-authored work can be serious, useful, and eventually publishable. It must remain inspectable, revisable, rejectable, attributable, and clearly separated from canon approval until review happens.

Codex and Quipslys should not wait passively for humans to provide enough prose, captions, storyboards, articles, or publication copy to test the system. They are allowed to create serious reviewable candidate material for the loop. The boundary is not whether an agent wrote it. The boundary is whether the system preserves authorship, intent, provenance, review state, canon state, publication state, and the ability to reject or supersede the work later.

For the Episode 1 proof loop, this means Codex may draft missing context, create reviewable book-pass material, prepare social and episode copy, and build publication packets as a content partner. Those artifacts should be treated as real candidates unless explicitly labeled placeholder. They are still not canon-approved, human-approved, published, scheduled, or externally receipted until the relevant review and receipt artifacts say so.
