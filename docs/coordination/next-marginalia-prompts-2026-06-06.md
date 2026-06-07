# Next Marginalia prompts - 2026-06-06

Use these if the Antigravity lanes need another coordinated pass after the midnight Art Foundry / output catalog sprint.

## Unified context for all lanes

Codex added:

- `packages/quipsly-domain/src/art-recipes.ts`
- `packages/quipsly-domain/src/generated-art.ts` manifest helpers
- `packages/quipsly-domain/src/output-catalog.ts`
- Nest `/art-foundry`
- Nest `/outputs`
- Nest `/outputs/[outputId]` output plan pages
- Nest `/beta-readiness`
- QuipLore `/visual-library`
- public Quipsly `/quipslys`
- non-mutating APIs for output catalog, individual output readiness, Nest-kind output maps, and art manifests/briefs
- `pnpm quipsly:art:comfy` optional local ComfyUI queue helper

Respect the host split:

- `quipsly.com` is public marketing.
- `nest.quipsly.com` is the app.
- `quiplore.com` is public quote/archive.

Do not run deploy unless assigned release work. Do not mutate real manuscript content.

## AG-Editor-Spine

Prompt: Review how the one living document should expose output readiness without adding heavy UI. Use `/api/output-catalog/<outputId>` and `/api/output-catalog/nest-kind/<nestKind>` as the source contracts. Propose and, if safe, implement a small non-destructive panel or metadata hint showing which outputs could be produced from the current document/chapter/episode. Report to `docs/coordination/antigravity-reports/editor-qa.md`.

## AG-Assistant

Prompt: Teach the Quipsly assistant to reference the output catalog and Art Foundry contracts when suggesting safe next steps. It should still not mutate manuscript text. Add only inspectable, approved-action suggestions. Report to `docs/coordination/antigravity-reports/assistant-qa.md`.

## AG-Research-RAG

Prompt: Design how source-aware research packets feed quote cards, SCORM/course packets, and HGO episode pages. Focus on citations, provenance, and retrieval shape. Implement only small safe helpers if obvious. Report to `docs/coordination/antigravity-reports/research-rag.md`.

## AG-Video-Editor

Prompt: Map the YouTube video package output catalog entry onto the current `/editor` state. Identify missing fields for title, description, chapters, thumbnail, clip ranges, and render metadata. Implement small UI/status improvements only if safe. Report to `docs/coordination/antigravity-reports/video-editor.md`.

## AG-Storyboard

Prompt: Connect storyboard frames to output catalog concepts without moving schema unless necessary. Show how storyboards could feed visual-story, YouTube package, and social cuts outputs. Report to `docs/coordination/antigravity-reports/storyboard.md`.

## AG-Project-Management

Prompt: Review Nests/projects with the new output catalog in mind. Propose how each Nest can show documents, study sources, media rooms, and available outputs without hardcoding customer slugs. Implement a small safe navigation/readiness improvement if obvious. Report to `docs/coordination/antigravity-reports/project-management.md`.

## AG-Marketing

Prompt: Expand public Quipsly copy around concrete workflows now represented by `/outputs`, `/quipslys`, and Art Foundry. Keep the enthusiastic librarian/co-drafter positioning, make clear that freeform AI drafting is allowed, and show specific user journeys for authors, podcasters, academics, photographers, and course creators. Report to `docs/coordination/antigravity-reports/marketing-positioning.md`.

## AG-Patreon-Support

Prompt: Review how Patreon support/beta access should be explained now that output catalog and visual companions exist. Keep Patreon as provider input, not app source of truth. Propose clear supporter CTA copy and entitlement reconciliation next steps. Report to `docs/coordination/antigravity-reports/patreon-support.md`.

## AG-Mobile-Recording

Prompt: Review mobile recording through the output catalog lens: podcast RSS, YouTube package, HGO episode page, and social cuts. Identify the smallest mobile UX additions needed to make recordings output-ready. Report to `docs/coordination/antigravity-reports/mobile-recording.md`.

## AG-Agent-Coordination

Prompt: Update coordination guidance so agents know output catalog and Art Foundry are shared contracts. Watch for route collisions, duplicate public/app surfaces, and schema proposals that should become standalone files. Report to `docs/coordination/antigravity-reports/agent-coordination.md`.

## AG-HighGroundOdyssey

Prompt: Review HGO episode pages against the output catalog `hgo-episode-page` contract. Identify what fields are missing from public packets for Episodes 1-3 and Episode 4. Implement only safe public visual/copy polish if obvious. Report to `docs/coordination/antigravity-reports/high-ground-odyssey.md`.

## AG-QuipLore

Prompt: Build on QuipLore `/visual-library` and the `quote-feed` output entry. Propose the first quote-card generator flow using verified quote, source, context note, and visual companion. Implement a small non-destructive public UI improvement if safe. Report to `docs/coordination/antigravity-reports/quiplore.md`.

## AG-Fiction-Analysis

Prompt: Map fiction/nonfiction study and analysis tools to output catalog concepts: book export, visual story scroll, quote feed, and research packets. Keep Melissa/Homer privacy boundaries in mind. Report to `docs/coordination/antigravity-reports/fiction-analysis.md`.

## AG-Publishing-Integrations

Prompt: Use `packages/quipsly-domain/src/output-catalog.ts`, `/outputs/[outputId]`, and the packet skeletons from `/api/output-catalog/<outputId>` as the contract for destination workflows. For each `now` output, identify required credentials, packet fields, publish status, and safe test mode. Implement a small safe status/readiness helper if obvious. Report to `docs/coordination/antigravity-reports/publishing-integrations.md`.

## AG-Scroll-Experiences

Prompt: Use the `story-scroll`, `scorm-course`, `quote-feed`, and `photo-gallery-review` output entries to design the reusable vertical/horizontal interaction engine. Propose component/data boundaries before schema changes. Report to `docs/coordination/antigravity-reports/scroll-experiences.md`.
