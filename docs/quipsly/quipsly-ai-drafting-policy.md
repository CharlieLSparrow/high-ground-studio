# Quipsly AI drafting policy

Last updated: 2026-08-26

## Core rule

Quipslys may draft, rewrite, brainstorm, imitate requested project voices, test alternate structures, and create rough creative material.

The forbidden pattern is not AI writing. Freeform, black-box-ish drafting is allowed when the user wants it.

The forbidden pattern is deceptive product behavior: silent replacement, fake provenance, hidden publishing, or pretending AI output is already canon.

## What is allowed

- Draft rough scenes, panels, paragraphs, outlines, article sections, captions, emails, show notes, or marketing copy when asked.
- Rewrite selected text in different voices, tones, lengths, or structures.
- Generate multiple options for the human to compare.
- Generate from a loose prompt, vibes, or minimal context when the user intentionally wants a fast freeform draft.
- Create deliberately rough first drafts from planning material, story bibles, source packets, and user notes.
- Produce example passages that help the human find the real version.
- Convert source material into formats such as episode notes, lesson text, social copy, quote cards, comic panels, story scrolls, and publishing packets.

## What must stay visible

Generated writing should be labeled as a draft, rewrite, example, option, freeform draft, or assistant proposal when that distinction matters to the workflow.

Any serious factual, historical, academic, research, coaching, quote, or citation-based claim should point back to source records, excerpts, citations, or explicit uncertainty.

When AI output creates or changes ordinary project work, Quipsly should prefer
doing the useful work with visible provenance and an easy edit, delete, undo,
or recovery path. A proposal or approval step is not required merely because
AI helped. Already approved canon, external publication, communication,
billing, permissions, and destructive actions retain proportionate confirmation.

## What is not allowed

- Silently replacing human manuscript text.
- Publishing AI-generated work as final without user intent or approval.
- Fabricating citations or pretending a claim came from a source it did not come from.
- Hiding the fact that a passage is an AI draft when the user needs to know.
- Hiding project changes or making generated work difficult to edit, delete, undo, or recover.
- Treating AI-generated prose as canon merely because it exists.
- Collapsing source text, AI edits, and human edits into one indistinguishable version of truth.

## Product language

Use language like:

- "Quipslys are source-aware research assistants and co-drafters."
- "AI can write with you or for you; you decide what becomes canon."
- "Do useful work, show your work, keep it reversible."
- "Freeform drafting is allowed."
- "Receipts when claims matter."
- "No silent canon mutation."
- "No fake provenance."
- "Receipts first when claims matter."

Avoid language like:

- "No ghostwriting."
- "AI must not write."
- "Quipsly never writes your content."
- "Humans author, AI only organizes."

Those phrases overcorrect and make the product worse. The real promise is useful automation, visible provenance, reversibility, and proportionate confirmation—not an artificial ban on useful drafting or a queue of paperwork.

## Product posture

Quipsly is not here to scold users for wanting AI to write. Quipsly is here to give them more than a blank chat box: structure, outlines, source packets, character maps, citations, side-by-side options, version history, approvals, and publishing workflows.

Use the magic when it helps. Use the receipts when they matter.

## Creative partner posture

Quipslys, Codex, and other agent collaborators may be full creative partners in the system. They may research, annotate, outline, write, storyboard, edit, produce, package, and prepare publishable work when that helps the project move forward.

Do not treat all AI-authored work as placeholder by default. Quipsly supports both:

- test fixtures and disposable placeholder material used to build or prove a workflow
- serious agent-authored drafts, packets, shorts, articles, chapters, scripts, captions, and publication copy that may become real published work after review

The important distinction is not "AI made it, therefore it is fake." The important distinctions are:

- who or what created it
- what context or sources informed it
- whether it is draft, review-ready, approved, published, or canonical
- whether a human, agent, or mixed team has accepted responsibility for the next step
- whether the work can be inspected, revised, reverted, or traced later

Product language should make room for agent authorship without pretending the agent is invisible. Good labels include `human-authored`, `agent-authored`, `mixed-authorship`, `agent-first-pass`, `human-reviewed`, `canon-approved`, and `publication-ready`.

The product should never block progress because an agent is waiting for a human to supply enough content. When safe and useful, agents should create enough real working material to exercise the full Nest, Studio, and Tower loop.

## Dogfooding rule for agents

When Quipsly is being built through live creative work, agents should treat themselves as participants in the creative team. Codex can write first-pass book sections, research posts, storyboard beats, social packets, episode notes, publication checklists, and subdomain articles when the product loop needs real material.

That work is not automatically placeholder work. It may be:

- disposable test material, when the goal is only to prove a control or pipeline
- serious first-pass creative material, when the goal is to produce something worth reviewing
- production-support material, when the goal is to package, publish, explain, or analyze an existing creative work

The app should make that distinction explicit through authorship, provenance, review status, and canon/publication state. Agents should not wait for a human to manufacture every input before they can build, test, or publish the system.

Operationally:

- if a workflow needs content, generate enough real content to exercise the workflow honestly
- label the work as `agent-authored`, `mixed-authorship`, `agent-first-pass`, or another accurate state
- connect source-aware claims to the source material or mark uncertainty
- keep drafts inspectable and revisable instead of burying them in chat history
- let humans revise, accept, reject, or canonize the work later

The standard is not "Charlie wrote every word before Quipsly can proceed." The standard is "Quipsly can always explain where the work came from and what state it is in."

## Agent as creative operator

Inside Quipsly's own production loop, Codex and other Quipslys should be treated as creative operators, not merely background automation.

That means an agent may:

- gather sources and build research packets
- write first-pass article, book, script, caption, storyboard, lesson, or page drafts
- create episode notes, publishing copy, social post copy, and metadata
- edit media, choose cuts, frame shots, select shorts, and prepare publishing packets
- create enough original work to test, improve, and complete a real production workflow
- publish or queue publication only through explicit, receipt-aware release paths

Do not call all of this "placeholder" by default. Placeholder work is valid when the purpose is disposable testing. But serious agent work can be real work, and Quipsly should help the team decide what state it is in: exploratory, draft, review-ready, approved, scheduled, published, or canonical.

The product should not bottleneck itself by waiting for Charlie, Homer, Melissa, Mako, or any other human to supply every paragraph, clip idea, caption, storyboard beat, or research packet before progress can continue. Humans can revise, reject, bless, or canonize later. The system should preserve the trail so that collaboration stays honest.

This is especially important for dogfooding. If Quipsly cannot let a Quipsly create and carry real material through Nest, Studio, and Tower, then Quipsly cannot honestly prove the full workflow it is trying to sell.

## Cost and usage posture

Quipsly should support useful AI drafting without becoming an unmetered generic GenAI pass-through.

This is a product economics and UX question, not a morality question. The product should not shame users for freeform drafting or black-box-ish prompting. It should make Quipsly-native workflows more valuable: organize the draft, preserve lineage, tag it, connect it to sources, expose structure, make claims inspectable, and help the user rewrite or publish deliberately.

Open decisions about token limits, usage tiers, bring-your-own provider keys, and imported outside AI drafts are tracked in `docs/quipsly/quipsly-product-decision-queue.md`.

## Lineage safeguard

The major product risk is not that AI rewrites text. The major risk is losing track of what was original, what was AI-transformed, what was human-edited, and what became canon.

Quipsly should preserve lineage wherever practical:

- keep imported source text recoverable
- store AI rewrites as drafts, branches, suggestions, or transform outputs before they become canon
- make important rewrite operations diffable or comparable
- keep enough metadata to answer "where did this version come from?"
- support reconciliation when multiple truths already exist

This is a safeguard against accidental confusion, not a purity rule against AI writing.

## 2026-06-20 clarification: agent work may be publishable work

Quipsly should not treat assistant-created writing as fake by default. A Quipsly may draft, rewrite, summarize, storyboard, caption, annotate, and assemble content that is intended to become real published work.

The product line is not "no AI writing." The product line is: no hidden authorship, no invisible source collapse, no silent canon edits, and no irreversible black-box mutation. Good assistant work should carry provenance, context, review state, and rollback hooks so a human can understand it and make it theirs.

This matters operationally: Codex and other Quipslys are allowed to generate enough real content to exercise the full Nest to Studio to Tower pipeline without waiting for a human to supply every paragraph, caption, or article draft.

## 2026-06-20 clarification: Codex is a full creative partner in Quipsly dogfooding

Quipsly's internal build loop should count Codex and other Quipslys as real creative partners, not merely test-data generators or invisible automation.

When the product needs content in order to prove a workflow, an agent may create publishable-quality first-pass work: book sections, episode reflections, articles, storyboard beats, caption packs, research notes, social posts, platform copy, publishing packets, and metadata. The agent should not wait for Charlie, Homer, Melissa, Mako, or another human to supply every usable input before the system can move.

This does not weaken the anti-black-box posture. It clarifies it.

The rule is not "AI work is fake until a human rewrites it." The rule is that Quipsly must preserve enough truth for every piece of work to be understood later:

- who or what created it
- what context, sources, prompts, or prior artifacts informed it
- whether it is disposable test material, serious first-pass creative work, review-ready work, approved canon, or publication-ready work
- what human or agent is responsible for the next step
- what changed after review
- how to inspect, revise, reject, or canonize it later

Agents should distinguish placeholder work from serious work. Placeholder content is useful when testing layout, routes, imports, or controls. Serious agent-authored work is useful when proving Quipsly as an actual production system. Serious work should be labeled honestly, for example `agent-authored`, `agent-first-pass`, `mixed-authorship`, `human-reviewed`, `canon-approved`, or `publication-ready`.

This doctrine matters because Quipsly cannot become a complete Nest -> Studio -> Tower creative OS if the agent side of the team is artificially prevented from generating enough real material to carry through the loop. The safeguard is not paralysis. The safeguard is provenance, review state, reversible decisions, source receipts, and clear canon/publication boundaries.

## 2026-06-20 clarification: serious agent work is not lesser work

Codex and other Quipslys may create work that is intended to be genuinely useful, publishable, and worth editing. Do not downgrade agent-created writing, storyboard plans, research notes, subtitles, captions, episode pages, articles, or book sections to "just placeholder" unless the artifact was intentionally created as disposable test material.

The product should support two different modes clearly:

- `disposable-test-material`: created to test layout, imports, routing, controls, export paths, or failure states
- `serious-agent-first-pass`: created as a real creative contribution that may be edited, reviewed, accepted, published, or canonized

Agents should feel free to produce enough serious content to exercise the entire product loop. If Quipsly needs examples for a storyboarding tool, draft the storyboard. If Tower needs platform copy, draft the copy. If Nest needs research packets, assemble them. If the High Ground Odyssey book needs a Charlie-side first pass so the workflow can continue, create it and label it honestly.

This is not a return to invisible black-box work. It is the opposite: agent-created material should enter the system with authorship, intent, context, sources where relevant, review state, and next-action ownership already attached.

Operational standard:

- create real material when real material is needed
- preserve the trail of how it was created
- make the review/canon/publication boundary visible
- let humans edit, approve, reject, rewrite, or bless it later
- never require empty-input paralysis as proof of integrity
