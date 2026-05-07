# Charlie Presentation Taxonomy

Last updated: 2026-05-07

## Purpose

Charlie material is not one thing. The current living manuscript and viewer can show Charlie blocks, but the product need is broader than "Charlie card beside Homer prose."

Before changing viewer code or manuscript structure, this taxonomy defines the semantic jobs Charlie material can perform and how those jobs should appear in Book View, Story View, and Episode View.

## Current Repo Findings

`learning-to-lead.living.mdx` currently has 43 `ManuscriptBlock` entries.

Charlie blocks:

| Count | Type |
| --- | --- |
| 7 | `research-bridge` |
| 1 | `charlie-reflection` |

Current Charlie block IDs:

- `charlie-early-days-effort-and-joy-sidebar`
- `charlie-early-days-psychological-safety-sidebar`
- `charlie-early-days-incentives-sidebar`
- `charlie-early-days-autonomy-and-purpose-sidebar`
- `charlie-early-days-start-with-why-sidebar`
- `charlie-early-days-meaning-and-endurance-sidebar`
- `charlie-early-days-listening-culture-sidebar`
- `charlie-early-days-warmth-and-attention-close`

The current metadata can distinguish broad `research-bridge` versus `charlie-reflection`, plus pairings through `pairsWith`. It is not enough to reliably distinguish inline prose, sidebar reflection, production note, clip candidate, reaction cue, episode-only narration, or clean book prose.

Specific viewer gaps:

- `charlie-early-days-effort-and-joy-sidebar` is a research bridge, but the ID and editorial use call it a sidebar. The metadata does not say whether it belongs in the clean book manuscript, a margin note, or episode prep only.
- `charlie-early-days-listening-culture-sidebar` includes a `clip-candidate` tag and pairs with `homer-values-simple-solutions`, even though the Episode 4 flow uses it as the Pillow Incident sidebar. The viewer can show the pairing, but cannot express the cross-chapter production intent cleanly.
- `charlie-early-days-warmth-and-attention-close` is a `charlie-reflection` with notes saying it is a chapter close. The viewer can style it warmly, but the metadata does not make "chapter close" or "episode close" a first-class presentation role.
- Episode 5 and 6 intake files include Charlie inline reactions, trust research, production markers, and clip cues. Those jobs would be flattened if imported only as `research-bridge` or `charlie-reflection`.

## Recommended Metadata Direction

Future blocks should keep `voice="charlie"` but add enough semantic detail to avoid guessing.

Possible fields or conventions:

- `type`: the primary content kind, such as `charlie-inline`, `charlie-reflection`, `research-bridge`, `production-note`, `clip-candidate`, `reaction-cue`, `chapter-close`, `source-note`.
- `presentation`: the intended default display, such as `inline`, `sidebar`, `callout`, `prep-note`, `clip-card`, `close`.
- `audience`: `book`, `episode`, `team`, `public`, or a small array if the block legitimately serves multiple audiences.
- `pairsWith`: the Homer/source block IDs this material responds to.
- `citationStatus`: `not-needed`, `needs-verification`, `verified`, or `do-not-publish-yet`.
- `source`: exact intake, recording, OneNote import, or source document provenance.
- `notes`: short editorial guidance, not hidden prose.

Do not add all of these fields mechanically. Use the smallest metadata set that prevents future ambiguity.

## Content Categories

### Inline Charlie Prose

What it means: Charlie narration intended to read as part of the main essay or chapter flow.

When to use it: Use when Charlie is not commenting from the side, but carrying the actual argument or connective tissue.

Default placement:

- Book View: inline only if it belongs in the clean manuscript.
- Story View: inline among source blocks, clearly labeled.
- Episode View: host narration beat if included in the episode arrangement.

Visual treatment: Minimal separation; a small Charlie label is enough. Do not make it feel like a warning box.

Metadata support: `type="charlie-inline"`, `presentation="inline"`, `audience={["book", "episode"]}` when both are true.

Clean book manuscript: Yes, if polished and intended for readers.

Podcast/show prep: Yes, if it is a host narration beat.

Risk if misused: Side commentary can accidentally become fake book prose, making the chapter feel over-authored or less like Homer.

### Sidebar Reflection

What it means: A warm aside, application note, or personal reflection that supports a Homer story without replacing it.

When to use it: Use when Charlie adds meaning, application, or a reader-facing nudge around a specific story.

Default placement:

- Book View: sidebar or margin callout only if the book design wants visible sidebars.
- Story View: paired card beside or after the Homer block.
- Episode View: optional host aside, usually after the story beat.

Visual treatment: Warm callout with light separation from baseline prose.

Metadata support: `type="charlie-reflection"`, `presentation="sidebar"`, `pairsWith`.

Clean book manuscript: Maybe. It depends on whether the final book wants sidebars.

Podcast/show prep: Yes, often useful as a host reaction or transition.

Risk if misused: Too many sidebars can slow the story and make the reader feel interrupted.

### Research Bridge / Field Note

What it means: A bridge from Homer story to research, history, psychology, leadership theory, or an external framework.

When to use it: Use when the outside source clarifies the principle and the citation path can be verified.

Default placement:

- Book View: sidebar, endnote-linked prose, or omitted from clean manuscript until citation-ready.
- Story View: research card paired to the relevant story.
- Episode View: prep card, talking point, or short scripted bridge.

Visual treatment: Field-note card with citation status visible when in team/internal modes.

Metadata support: `type="research-bridge"`, `citationStatus`, `source`, `pairsWith`, `audience`.

Clean book manuscript: Only when source claims are verified and the prose is intentionally book-shaped.

Podcast/show prep: Yes, especially as a fact-checked bridge.

Risk if misused: Unverified research can create false authority or legal/editorial cleanup later.

### Production Note

What it means: Internal guidance for recording, editing, sequencing, or host delivery.

When to use it: Use for "ask Homer here," "hold for clip," "cut if long," "verify quote," or "this is probably Episode 6, not Episode 5."

Default placement:

- Book View: hidden.
- Story View: visible only in team/editorial mode.
- Episode View: visible in prep/board mode, not reader mode.

Visual treatment: Clearly internal note, visually distinct from prose.

Metadata support: `type="production-note"`, `audience={["team", "episode"]}`, `presentation="prep-note"`.

Clean book manuscript: No.

Podcast/show prep: Yes.

Risk if misused: Internal scaffolding can leak into public-facing drafts or distract from the actual story.

### Clip Candidate

What it means: A possible media, quote, scene, or audio/video reference for episode production.

When to use it: Use when a clip or pop-culture reference may help the episode but needs rights, citation, or editorial review.

Default placement:

- Book View: hidden unless converted into clean prose or a verified reference.
- Story View: visible as production metadata, not manuscript body.
- Episode View: clip card or cue in prep mode.

Visual treatment: Compact cue card with source, rights/citation status, and placement.

Metadata support: `type="clip-candidate"`, `clipTitle`, `clipSource`, `citationStatus`, `rightsStatus`, `pairsWith`.

Clean book manuscript: Usually no.

Podcast/show prep: Yes.

Risk if misused: The team can mistake a fun reference for a cleared production asset.

### Reaction Cue

What it means: A planned host reaction, question, laugh line, challenge, or conversational turn.

When to use it: Use for recorded conversation flow, not permanent book prose.

Default placement:

- Book View: hidden.
- Story View: visible only in editorial/team mode.
- Episode View: inline prep cue near the relevant story beat.

Visual treatment: Small cue label, more like stage direction than prose.

Metadata support: `type="reaction-cue"`, `speaker`, `timing`, `pairsWith`, `audience={["episode", "team"]}`.

Clean book manuscript: No.

Podcast/show prep: Yes.

Risk if misused: The episode can feel scripted in the wrong places, or book prose can inherit recording-room scaffolding.

### Chapter / Episode Close

What it means: A designed closing turn that gathers the lesson and lands the emotional or practical point.

When to use it: Use when a section needs a final reader/listener-facing resolution.

Default placement:

- Book View: final prose block if clean and book-ready.
- Story View: close block at the end of a chapter group.
- Episode View: closing narration or final discussion prompt.

Visual treatment: More elevated than a sidebar; quieter than a hero block.

Metadata support: `type="chapter-close"` or `type="episode-close"`, `presentation="close"`, `audience`.

Clean book manuscript: Yes if polished and intended for the book.

Podcast/show prep: Yes if it helps land the episode.

Risk if misused: A close can prematurely resolve material that still needs a story, question, or Homer reaction.

### Source / Provenance Note

What it means: A record of where material came from and what still needs verification.

When to use it: Use whenever source origin matters for future editing, rights, citation, or trust.

Default placement:

- Book View: hidden unless converted into endnotes or acknowledgments.
- Story View: metadata panel or editorial note.
- Episode View: prep metadata, especially for quotes and clips.

Visual treatment: Metadata row or small provenance card.

Metadata support: `type="source-note"`, `source`, `sourceDate`, `citationStatus`, `rightsStatus`, `notes`.

Clean book manuscript: Usually no, except as formal endnote/source material.

Podcast/show prep: Yes.

Risk if misused: Missing provenance forces future editors to re-discover source truth from scratch.

## Working Rule

Do not import Charlie material into the living manuscript until its job is clear. First decide whether it is clean prose, a sidebar, a research bridge, a production note, a clip cue, a reaction cue, a close, or a provenance note. Then choose the smallest block shape that preserves that job.
