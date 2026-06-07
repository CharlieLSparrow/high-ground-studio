# Quipsly product decision queue

Last updated: 2026-06-06

Purpose: keep important unresolved product, pricing, architecture, and policy questions from getting lost while we build fast.

This file is for queued decisions, not final doctrine. Items here should be researched, challenged, and converted into implementation plans only after we understand the tradeoffs.

## P0 - AI usage economics and anti-token-furnace design

Status: queued for deep best-practice research

Owner lanes to involve:
- Product Owner / Codex
- AG-Assistant
- AG-Data-Architecture
- AG-Patreon-Support
- AG-Marketing
- AG-Research-RAG

### Problem

Quipsly should support AI drafting, rewriting, brainstorming, and freeform creative generation when users want it. But Quipsly should not accidentally become a cheap, unmetered generic GenAI front end where users burn our provider budget black-box prompting without using the distinctive Quipsly workflow.

The product promise is not "AI may not write." The product promise is that Quipsly gives creators more than a blank chat box:

- source capture
- annotation
- tagging
- outline and structure visibility
- version lineage
- transparent rewrites
- research packets
- provenance and citations where claims matter
- editing and publishing workflows

### Key questions

- What usage limits should exist for beta, free, paid, Patreon-supported, and internal users?
- Should Quipsly meter by token, request, project, feature, or output type?
- Should long-form black-box drafting have stricter limits than source-aware rewrite, tagging, outline, retrieval, or organization tasks?
- Should users be encouraged to bring outside AI drafts into Quipsly for cleanup, tagging, transparency, organization, and rewrite workflows?
- Should Quipsly support user-provided API keys for Gemini, OpenAI, Anthropic, or other providers?
- If user-provided keys are supported, how do we store them safely, scope them per user/project, redact them from logs, and explain billing responsibility?
- Should BYO-key usage be limited to advanced users or paid plans only?
- What is the best practice for preventing abuse without making the creative flow feel stingy, preachy, or broken?
- How should we expose usage status in the UI without creating systems anxiety?
- What should happen when a user hits a limit: upsell, wait, use smaller scope, bring your own key, or import external drafts?

### Product hypotheses to research

- Quipsly should be generous with high-value, Quipsly-native tasks such as organizing, tagging, outlining, retrieval, citation checks, document analysis, and transformation of selected context.
- Quipsly should be more careful with huge open-ended generation tasks that are indistinguishable from generic chatbot use.
- "Bring your outside AI draft here and we will make it transparent, structured, editable, tagged, and publishable" may be a strong product lane.
- Smaller scoped generation inside selected blocks, selected chapters, selected scenes, or selected source packets may be healthier than massive whole-book generation as the default UX.
- BYO provider keys could be valuable for power users, but they introduce security, support, provider-policy, and UX complexity.
- The product should avoid moralizing about black-box drafting. It should instead make Quipsly-native workflows so useful that users naturally move from opaque generation into transparent creative control.

### Guardrails that are already decided

- AI drafting is allowed.
- Freeform drafting is allowed.
- Black-box-ish drafting is not forbidden by product morality.
- Silent mutation of canon is not allowed.
- Fake provenance is not allowed.
- Hidden publishing is not allowed.
- Source, AI draft, human edit, accepted canon, and published output should remain distinguishable when it matters.

### Research inputs needed

Ask for current best practices and examples across:

- SaaS AI usage metering
- consumer AI writing apps
- AI coding tools with usage tiers
- BYO API key patterns
- enterprise and education AI quota design
- abuse prevention for LLM-backed apps
- UX patterns for usage limits that do not shame users
- token budgeting for document editors and assistant sidebars
- provider cost modeling for Gemini/OpenAI-style workloads

### Likely implementation surfaces

- `User` / organization / membership entitlement schema
- per-user and per-organization AI usage ledger
- project-level assistant budget settings
- provider key vault or secret reference table
- feature-specific usage classes such as draft, rewrite, organize, retrieve, cite, summarize, transcribe, analyze
- assistant UI usage meter
- admin/operator usage dashboard
- Patreon/support tier mapping
- "import outside AI draft" workflow

### Do not accidentally decide yet

- Do not set exact quota numbers without cost modeling.
- Do not ban black-box writing.
- Do not promise BYO keys until security and support costs are understood.
- Do not build a complex billing engine before the beta access path is stable.
- Do not hide usage limits until users hit them; that creates systems anxiety.

## P1 - Imported AI drafts as first-class material

Status: queued

Related to: P0 AI usage economics

Idea: Let users paste or import AI-generated text from outside tools, then use Quipsly to make it useful:

- detect or label it as imported draft material when the user chooses
- tag structure, claims, characters, scenes, quotes, and source gaps
- create a rewrite plan
- create a source/citation checklist
- split it into editable blocks or a living document
- compare it to human notes, study documents, and research packets
- turn it into transparent draft lineage instead of an opaque wall of words

This could let Quipsly stay useful to people who already use ChatGPT, Gemini, Claude, or local models heavily without making Quipsly carry every generation cost itself.
