# Book Writing in Quipsly: Web vs Desktop Decision Brief

Generated: 2026-06-28

## Product verdict

Start serious book writing in the web Nest app first, while building the native desktop Nest writer as the calmer long-term daily writing home.

This is not a philosophical compromise. It is the least scary production path:

- The web app already owns projects/nests, auth, documents, collaboration, review, and publishing runway truth.
- The desktop app is currently strongest for local-heavy Studio work: media, proxies, exports, local files, and agent-operable editing.
- The writing model must stay one living manuscript, not a web manuscript plus a desktop manuscript.

## Recommended working mode

Use both, but not symmetrically yet.

1. Web Nest app is the current canonical writing surface.
2. Native desktop Nest writer becomes the local-first focus/capture surface.
3. Both must share the same document/kernel model before the desktop app is trusted for canonical book writing.
4. Until native sync is real, desktop writing should create local draft packets, snapshots, and reviewable proposals, not silently replace canonical manuscript text.

## Why web first

Current Quipsly readiness signals favor web:

- Daily Writing Desk readiness reports `webReadyOrPartial: 9` and `nativeReadyOrPartial: 1`.
- Web has routes for `/projects`, `/nests`, `/create`, and `/manuscript`.
- Web already sits close to access control, project registry, Nest collaboration, assistant ledgers, review packets, and Tower handoff.
- Collaboration with Homer/Mako is far easier to prove in web first.

## Why desktop still matters

The desktop app should become the daily writing app once it has the right shape:

- Native Mac focus and keyboard feel matter for long writing sessions.
- Offline/local drafts are emotionally important for systems anxiety.
- File access and local export can make panic recovery much stronger than browser-only writing.
- The best Quipsly future is not a website with a textbox; it is a calm native creative cockpit that syncs to Nest.

## Competitive pattern notes

- Scrivener proves long-form writers value binder/corkboard/snapshot/compile workflows for large projects.
- Ulysses proves focused writing, library organization, goals, clean export, and cross-device Apple-native polish are powerful for daily writing.
- Obsidian proves local-first files and offline ownership feel safe and flexible, especially for knowledge work.
- Google Docs proves web collaboration, comments, and offline-capable review matter, but it is not designed around a rich book/source/episode production spine.

Quipsly should borrow the emotional wins, not clone the tools:

- Scrivener's confidence around big structures.
- Ulysses' calm daily writing feel.
- Obsidian's local ownership and linked thinking.
- Google Docs' collaboration and review simplicity.

## Minimum web fixes before Charlie should write in earnest

1. One obvious Daily Writing Desk entry from `/projects` and the HGO Nest.
2. Visible save/autosave/checkpoint state that is impossible to miss.
3. One-click named snapshot before risky edits.
4. Panic export: copy/export current draft to Markdown and DOCX-ready packet.
5. Chapter/Episode boundary tagging and removal must be obvious and low-friction.
6. Source trail/revision/source packets visible beside the writing surface.
7. AI draft output must be inspectable: preview, diff, approve/reject, ledger.
8. Recent changes and rollback must be visible enough to reduce fear.
9. Clear label that web is canonical for now.

## Minimum desktop fixes before desktop becomes canonical writing home

1. A first-class Native Nest Writer module, not writing buried inside Quipsly Studio video UI.
2. Same document/kernel model as web.
3. Local draft storage with visible unsynced/synced/conflict state.
4. Snapshot/export packet available even with no network.
5. Keyboard-first chapter/episode/section navigation.
6. Source/reference side panel.
7. Safe sync to web canonical manuscript with diff/review, not blind overwrite.
8. Panic button: reveal local draft folder, copy Markdown, export DOCX-ready packet.
9. Agent-accessible controls for read, select, annotate, propose, diff, and report state.

## The anti-drift rule

There must never be two manuscript truths.

Desktop can draft locally. Web can host canonical collaboration. Both can render the same document. But promotion from local draft to canonical manuscript must be explicit, inspectable, and reversible until sync/conflict handling is genuinely mature.

## Living documents vs fixed source documents

Quipsly needs two annotation postures:

- Living writing documents: our books, articles, scripts, episode pages, and drafts. These are editable. The current canonical head can change, but changes must leave snapshots, operation history, reviewable draft proposals, and recovery exports. Tags and annotations should move with the writing when possible.
- Fixed source documents: imported books, PDFs, articles, course pages, research papers, and source archives. These should preserve the source artifact and layer highlights, notes, tags, citations, summaries, and packets over stable anchors.

The shared principle is transparency, not immobility. Living documents can evolve; fixed documents should preserve source fidelity. In both cases, Quipsly should make provenance, history, and recovery obvious enough that users feel free to think instead of afraid to touch the work.

## Practical next sprint

Build the Web Daily Writing Desk hardening pass first:

- Add obvious Daily Writing entry.
- Add visible save/checkpoint/snapshot/export strip.
- Add panic export packet.
- Add recent changes/rollback preview.
- Add source trail panel.
- Prove writing a fresh HGO book section in the real route.

Then build Native Nest Writer v0:

- Native module opens the current HGO writing packet and a local draft document.
- Save local drafts into a Quipsly-managed folder.
- Export Markdown/DOCX-ready packets.
- Sync/promote disabled until diff/review exists.

## Decision checkpoint

Charlie can start writing in the web app as soon as the Web Daily Writing Desk hardening pass is complete. Desktop should follow quickly as the preferred focus environment, but only as local draft/snapshot/export until the shared document model is proven.
