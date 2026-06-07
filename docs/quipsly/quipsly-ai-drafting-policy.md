# Quipsly AI drafting policy

Last updated: 2026-06-06

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

When AI output would change canon, manuscript text, storyboard order, publishing packets, public pages, or project state, it should flow through visible approval, diff, ledger, or undoable action history. Users may still intentionally accept an AI draft as their own work; the product's job is to make that choice clear and recoverable, not to shame it.

## What is not allowed

- Silently replacing human manuscript text.
- Publishing AI-generated work as final without user intent or approval.
- Fabricating citations or pretending a claim came from a source it did not come from.
- Hiding the fact that a passage is an AI draft when the user needs to know.
- Mutating private project state without visible approval.
- Treating AI-generated prose as canon merely because it exists.
- Collapsing source text, AI edits, and human edits into one indistinguishable version of truth.

## Product language

Use language like:

- "Quipslys are source-aware research assistants and co-drafters."
- "AI can write with you or for you; you decide what becomes canon."
- "Draft boldly, approve deliberately."
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

Those phrases overcorrect and make the product worse. The real promise is control, provenance, and approval, not an artificial ban on useful drafting.

## Product posture

Quipsly is not here to scold users for wanting AI to write. Quipsly is here to give them more than a blank chat box: structure, outlines, source packets, character maps, citations, side-by-side options, version history, approvals, and publishing workflows.

Use the magic when it helps. Use the receipts when they matter.

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
