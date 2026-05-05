# Charlie Interjection Formatting Audit

## Scope
This audit covers every `ManuscriptBlock` in `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx` where `voice="charlie"`.

## Summary
- Charlie blocks found: `8`
- IDs unique: `yes`
- Sources present on all Charlie blocks: `yes`
- `needs-citation` present where frameworks/books/quotes are mentioned: `yes`
- Clear `pairsWith` present on sidebar blocks with an obvious Homer counterpart: `yes`
- Chapter-close reflection intentionally left without a single `pairsWith` target: `yes`

## Charlie Block Inventory
| Block ID | Type | Source | `pairsWith` status | Formatting issues fixed | Metadata issues fixed | Remaining concerns |
| --- | --- | --- | --- | --- | --- | --- |
| `charlie-early-days-effort-and-joy-sidebar` | `research-bridge` | `episode-04-early-days intake` | Paired to `homer-early-days-preschool-memories` | Converted parenthetical opener to `###` mini-heading; inserted paragraph spacing | None needed | Kotler / Pink references still need citation and eventual `quoteRefs` |
| `charlie-early-days-psychological-safety-sidebar` | `research-bridge` | `episode-04-early-days intake` | Paired to `homer-early-days-first-grade-name-calling` | Converted parenthetical opener to `###`; added paragraph spacing; removed stray leading-space indentation in the “It is structural” line | None needed | Project Aristotle / Amy Edmondson references still need citation |
| `charlie-early-days-incentives-sidebar` | `research-bridge` | `episode-04-early-days intake` | Paired to `homer-early-days-second-grade-quiet-time` | Converted parenthetical opener to `###`; added paragraph spacing; removed trailing whitespace | Corrected small typo from `behaviour` to `behavior` | Freakonomics / behavioral-design references still need citation |
| `charlie-early-days-autonomy-and-purpose-sidebar` | `research-bridge` | `episode-04-early-days intake` | Paired to `homer-early-days-third-grade-busy-work` | Converted parenthetical opener to `###`; added paragraph spacing | None needed | Self-Determination Theory / Shackleton references still need citation |
| `charlie-early-days-start-with-why-sidebar` | `research-bridge` | `episode-04-early-days intake` | Paired to `homer-early-days-seventh-grade-keyboarding` | Converted parenthetical opener to `###`; added paragraph spacing; removed trailing space | Corrected small typo from `thing's` to `things` | Sinek / Commander’s Intent references still need citation |
| `charlie-early-days-meaning-and-endurance-sidebar` | `research-bridge` | `episode-04-early-days intake` | Paired to `homer-early-days-farm-years` | Converted parenthetical opener to `###`; added paragraph spacing | Tightened obvious apostrophe/quote typos only (`wouldn't` / `I've` / `wasn't`) without changing meaning | Frankl / narrative-psychology references still need citation |
| `charlie-early-days-listening-culture-sidebar` | `research-bridge` | `episode-04-early-days intake` | Paired to `homer-values-simple-solutions` | Converted parenthetical opener to `###`; added paragraph spacing | Existing cross-chapter `notes` retained | This remains an Episode 4 interjection tied to a Homer story that still lives in Chapter Two values material |
| `charlie-early-days-warmth-and-attention-close` | `charlie-reflection` | `episode-04-early-days intake` | No single `pairsWith`; chapter-close reflection | Added paragraph spacing throughout; removed accidental leading spaces in the cadence lines at the end | Added a `notes` field clarifying it is a chapter-close reflection rather than a single paired sidebar | `The Charisma Myth` reference still needs citation; no `quoteRefs` yet |

## Type Review
- `research-bridge` remains correct for the six framework-heavy interjections plus the listening-culture field note.
- `charlie-reflection` remains correct for `charlie-early-days-warmth-and-attention-close` because it functions as a personal chapter close rather than a framework explainer.
- No current Charlie block is better modeled as `pop-culture-bridge` or a pure `clip-candidate`.

## Metadata Review
- All Charlie blocks now include required metadata: `id`, `title`, `type`, `voice`, `status`, `chapter`, `tags`, and `source`.
- All framework-heavy Charlie blocks retain `needs-citation` tags.
- `pairsWith` is present everywhere there is a clear, single Homer target.
- The chapter-close reflection intentionally uses a `notes` field instead of forcing an artificial `pairsWith` target.

## Remaining Concerns
- None of the Charlie blocks resolve to a quote library yet. That is expected, but every framework-heavy block still needs future `quoteRefs` once the quote/citation layer exists.
- `charlie-early-days-listening-culture-sidebar` is structurally cross-chapter. It belongs to Episode 4 shaping, but its Homer source anchor remains `homer-values-simple-solutions` in Chapter Two. That should continue to be handled by arrangement logic, not source duplication.
- The current cleanup normalizes readability, but these blocks are still draft interjections. They have not been editorially tightened or citation-checked.
