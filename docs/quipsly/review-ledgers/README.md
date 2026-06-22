# Quipsly review ledgers

Append-only local review receipts live here while the Nest -> Studio -> Tower loop is still becoming durable app state.

These files are not publication receipts and do not mutate canon by themselves. They record review decisions so humans and agents can see who decided what, when, and why.

Current ledgers:

- `episode-1-writing-review-ledger.jsonl`: review decisions for the Episode 1 writing draft, handoff, checklist, and Tower publication packet.

Expected JSONL behavior:

- one JSON object per line;
- append only;
- include actor, outcome, note, artifact paths, and truth boundary;
- later migrate into app-owned review records when the Nest/Tower data model is ready.
