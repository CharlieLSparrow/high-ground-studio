# Team Kanban

The internal board data lives at:

- `apps/web/content/internal/kanban/board.json`

Use the board like this:

- Charlie can use `/team/kanban` to move cards between `backlog`, `todo`, `doing`, and `done`.
- Charlie can add simple new cards through the page form.
- For richer edits, bulk cleanup, or careful wording changes, edit `board.json` directly.
- AI should treat `board.json` as the source of truth and keep the card language grounded in the real repo state.

Current rule:

- UI is fine for quick status updates and basic story entry.
- JSON is still the easiest place for precise edits to summaries, links, tags, and seeded planning context.
