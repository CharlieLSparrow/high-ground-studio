# Next Marginalia Prompts - Beta Readiness Push

Use these lane names consistently. Each agent should update only its named report file unless explicitly instructed otherwise.

## AG-Editor-Spine

Report file: `docs/coordination/antigravity-reports/editor-qa.md`

Prompt: Deep QA and product hardening pass on `/create` and `/editor` for beta authors. Verify the one-living-document model still feels obvious, Chapter/Episode boundaries are fast to create/remove, the editor recording handoff card is understandable, and the timeline/save/spine states do not create panic. Propose concrete small patches only after documenting risks. Do not delete routes or schema.

## AG-Mobile-Recording

Report file: `docs/coordination/antigravity-reports/mobile-recording.md`

Prompt: Test and harden the recorder/mobile workflow around interrupted recordings. Confirm multiple start/stop takes preserve timestamps, upload/local/error states, and editor handoff expectations. Focus on iPhone/mobile browser clarity: manuscript first, recording controls obvious, clip watching non-distracting. Report exact failure cases and propose fixes.

## AG-Publishing-Integrations

Report file: `docs/coordination/antigravity-reports/publishing-integrations.md`

Prompt: Audit publishing-suite status model and public-safe packet flow. Verify HGO episode packets, destination status rail, calendar, analytics, Patreon package prep, YouTube/social/manual export language. Propose how each destination becomes beta-usable without pretending full API automation exists yet.

## AG-Release-Captain

Report file: `docs/coordination/antigravity-reports/deployment-readiness.md`

Prompt: Prepare the next beta deploy plan without running deploy unless explicitly released. Inspect the release train scripts, health endpoints, host routing for quipsly.com/nest.quipsly.com, Cloud Run expectations, and known build-risk files. Produce a go/no-go checklist with exact commands and rollback path.

## AG-Patreon-Support

Report file: `docs/coordination/antigravity-reports/patreon-support.md`

Prompt: Audit beta access messaging and app-owned entitlement flow. Verify `/support`, webhook/reconcile docs, admin Patreon surface, and any paid-tier eligibility assumptions. Propose the smallest signed-in beta access status page that does not make Patreon the source of truth.

## AG-Research-RAG

Report file: `docs/coordination/antigravity-reports/research-rag.md`

Prompt: Research Library source-aware pass. Review the new source-aware labels/helpers and propose the first real persistence/UI path for source documents, overlays, citations, and research packets. Keep Quipslys framed as research assistants and drafting partners with receipts when claims matter; do not frame AI writing as forbidden.

## AG-Assistant

Report file: `docs/coordination/antigravity-reports/assistant-qa.md`

Prompt: Audit Quipsly assistant boundaries and action ledger flow against the beta promise. Suggest UI improvements for approve/reject, recent changes, diagnostic export, and rollback visibility. Any write-like action must remain human-approved and inspectable.

## AG-Marketing

Report file: `docs/coordination/antigravity-reports/marketing-site.md`

Prompt: Make Quipsly marketing concrete. Explain the real workflows now present: Nests, writing/study documents, source-aware research, freeform drafting, recorder/editor handoff, publishing packets, Patreon beta access, and HGO proof pages. Keep the helpful librarian/co-drafter tone. Avoid vague philosophy-only copy.

## AG-HighGroundOdyssey

Report file: `docs/coordination/antigravity-reports/high-ground-odyssey.md`

Prompt: Public HGO audit. Verify the home page, episode pages, Patreon CTA, interactive reader, and public API routes present episodes 1-3 clearly. Propose any visual/content cleanup needed for Scott/Homer-facing demos. Do not alter private manuscript data.

## AG-QuipLore

Report file: `docs/coordination/antigravity-reports/quiplore.md`

Prompt: QuipLore integration planning pass. Define how Quipsly research packets, quote overlays, citations, and publishing packets should feed QuipLore without making QuipLore a clone of Nest. Prioritize quote passports, save/curate flows, feeds, and social publishing.

## AG-Story-Course-Scroll

Report file: `docs/coordination/antigravity-reports/story-course-scroll.md`

Prompt: Design the shared interaction engine for stories, courses, comics, quote feeds, photo galleries, and mobile learning cards. Tie it back to Nest document kinds and publishing packets. Identify one beta-friendly vertical slice that can be built without fragmenting the core editor.

## AG-Fiction-Analysis

Report file: `docs/coordination/antigravity-reports/fiction-analysis.md`

Prompt: Fiction/book analysis pass. Propose how study documents, overlays, character/scene tags, quotes, examples, and research packets support fiction and nonfiction analysis while respecting privacy boundaries for customer Nests.

## AG-Project-Management

Report file: `docs/coordination/antigravity-reports/project-management.md`

Prompt: Project management/chat/work-unit pass. Propose how team chat, shareable work units, comments, GIFs, and activity feeds fit into Nests without bloating the manuscript editor. Include data boundaries and beta-safe MVP.

## AG-iOS-Companion

Report file: `docs/coordination/antigravity-reports/ios-companion.md`

Prompt: iPhone app plus mobile web companion pass. Review any existing iOS app stubs and define the smallest useful beta app: session manuscript, recording, upload, clip watch, and recovery. Keep mobile browser fallback first-class.

## AG-Integration-Auditor

Report file: `docs/coordination/antigravity-reports/integration-auditor.md`

Prompt: Cross-lane integration audit. Look for duplicated concepts, stale `apps/studio` references, unsafe route deletions, schema changes without docs, hidden hard-coded project slugs, and public/private data leaks. Classify findings as Keep, Adjust, Quarantine, or User Decision.
