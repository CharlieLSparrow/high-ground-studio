
## 2026-06-06 Fiction Tools Assistant Interaction Model - AG-Assistant

Timestamp: 2026-06-06 local
Agent lane: AG-Assistant
Task: Review interaction model for private fiction seeds (e.g., My Heart Is a Junkyard Starship).

### 1. Context the Assistant May Read
To support deep continuity and narrative analysis without hallucinating, the assistant must read across the unified fiction canon. When a user invokes the assistant in a fiction project, it reads:
- **Active Selection:** The currently focused `StudioBlock` or text selection in the editor.
- **Immediate Viewport:** The surrounding manuscript blocks for local pacing.
- **Story Bible Context:** The canonical `story-bible-seed.json` (or database equivalent), specifically retrieving Characters, Motifs, Timeline Events, and Relationships relevant to the active scene.
- **Cross-Surface Projections:** Awareness of the current `scroll-seed.json` pacing rules or `storyboard-seed.json` visual frames if the user is in those specific views.

### 2. Proposed Action Kinds
The AI interacts purely through structured tool intents that the UI renders as actionable cards.
- **`PROPOSE_ENTITY` / `PROPOSE_ENTITY_UPDATE`:** (Existing) Extracts characters, settings, or themes from the text and proposes adding them to the Story Bible with a strict `sourceExcerpt`.
- **`CHECK_CONTINUITY` / `PROPOSE_CONTINUITY_FIX`:** Scans a draft block against the Story Bible. If a character is marked "Never visually shown as a body" but the text says "He raised his hand," the assistant proposes a continuity warning.
- **`FIND_RELATED_PANELS`:** Retrieves storyboard frames or prior scenes matching the current motif or location, displaying them as a read-only visual reference card.
- **`SUGGEST_STORYBOARD_CLEANUP`:** Detects unassigned panels, missing visual descriptions, or mismatched continuity in storyboard frames and proposes a metadata update.
- **`SUGGEST_SCROLL_PACING`:** Analyzes word density and suggests splitting a block to create vertical space/tension in the scroll webtoon format.

### 3. What the Assistant Must Never Do Automatically
- **Silent Mutation:** It must never rewrite manuscript prose, alter storyboard frame order, or change scroll spacing without an explicit "Approve" click.
- **Canon Forcing:** It must never enforce continuity. If the author wants to break a Story Bible rule, the assistant can flag it but cannot prevent the author from typing or saving.
- **Hidden Canon Mutation:** It must never generate or insert new narrative chapters, panels, or rewrites as hidden canon. It may draft new material when asked, including loose freeform drafts, but persistent manuscript/storyboard changes should be labeled, previewed, or recoverable.

### 4. Connection to StudioAssistantAction & Ledger Models
- **Proposal Phase:** When the assistant identifies pacing issues or continuity errors, it creates a `StudioAssistantAction` with `status: "proposed"`. The `payloadJson` contains the exact `SourceSelector` (which block/text) and the rationale.
- **Approval Phase:** The human author reviews the card in the sidebar. Clicking "Approve" updates the action to `"approved"`.
- **Safe Persistence:** For beta, this approval logs a JSON `SourceOverlay` entry to the `StudioAssistantLedger` (e.g., `newStatus: "saved"`), turning the assistant`s insight into a durable research note without mutating the manuscript.
- **Rollback/Undo:** Because the action is cleanly isolated in the `StudioAssistantAction` and `StudioAssistantLedger` tables, clicking "Undo" simply transitions the status to `"undone"` and archives the note. The core fiction manuscript remains structurally untouched and perfectly intact.

### 5. Addendum: Ghostwriting & Co-Writing
After further product review, the strict "No Ghostwriting" rule was determined to be an overly aggressive constraint. We absolutely want Quipslys to generate rough drafts, provide multiple rewrite options, and assist with creative blocks.
The constraint is specifically against hidden canon mutation. The assistant may freely draft and rewrite text, including freeform drafts. Persistent manuscript/storyboard changes should move through `PROPOSE_DRAFT`, `PROPOSE_REWRITE`, diff/approve UI, or another recoverable action path before they become canon.
