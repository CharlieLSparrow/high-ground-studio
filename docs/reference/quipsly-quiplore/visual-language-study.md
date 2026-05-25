# Quipsly / QuipLore Visual Language Study

Date: 2026-05-25

Source assets live in:

```text
docs/reference/quipsly-quiplore/visual-assets/
```

## Summary

The uploaded visual references define a coherent direction: a warm literary
storybook archive anchored by Quipsly as a small, expressive sparrow character
who collects, protects, and shares meaningful words.

The strongest production path is not a loose quote meme aesthetic. It is a
trustworthy quote archive with tactile paper UI, gentle illustrated warmth,
visible provenance, and a character system that makes the experience friendly
without weakening source rigor.

## Most Build-Ready References

### `quiplore-person-page-einstein-layout.png`

This is the most immediately useful app reference.

Carry forward:

- top navigation with QuipLore identity, primary sections, search, notification,
  and profile/avatar slot
- large person hero with breadcrumb, name, date range, role, bio, tags, counts,
  and immersive illustration
- tab bar for quotes, about, life/legacy, Quipsly notes, and featuring Nests
- main quote list paired with right-side person facts and Quipsly note panel
- Nests/Lorelists section below quote list
- bottom CTA strip

Adjust before implementation:

- simplify cards for mobile density
- make verification/source status visible on quote rows
- avoid relying only on save counts as the trust signal
- reserve large illustrated hero treatments for top person pages and special
  collections, not every small UI card

### `quipsly-character-states-brainstorm.png`

This is the best character behavior and UI state reference.

Carry forward:

- happy, curious, excited, thinking, proud, and oops states
- Quipsly carrying a satchel of quotes
- building a Nest as a core product metaphor
- loading, empty state, achievement, and notification variants
- app icon ideas with close-cropped character faces

Implementation implication:

- create a small `QuipslyState` asset/slot taxonomy before producing many
  one-off illustrations.
- useful states: `idle`, `curious`, `found`, `thinking`, `saving`, `writing`,
  `nesting`, `sleeping`, `celebrating`, `oops`.

### `quipsly-character-model-sheet.png`

This gives enough consistency to make Quipsly repeatable.

Carry forward:

- round body
- oversized glossy eyes
- small dark beak with warm orange mouth accent
- soft tuft
- round cheeks
- short tail
- tiny feet
- warm brown/cream base palette

Production implication:

- use this as the canonical silhouette reference.
- future generated or hand-drawn assets should be checked against this sheet.

### `quipsly-character-variety-system.png`

This is the diversity and customization reference.

Carry forward:

- feather/skin tone spectrum
- hair/tuft and marking variation
- accessories and role themes
- app icon variants
- explicit message that different stories can share the same heart

Guardrail:

- diversity cannot become a costume-only system. Variation should include body
  tone, feather pattern, shape, posture, expression, accessories, and setting.
- cultural styling needs care and should be used when it supports the page or
  story, not as decoration.

## Visual System Rules

### Overall Feeling

- cozy
- literary
- trustworthy
- warm
- tactile
- curious
- gentle
- source-aware

Avoid:

- meme-page looseness
- generic AI gradients
- hustle-poster quote art
- cluttered scrapbook UI
- aggressive gamification
- dark, heavy fantasy UI for the core product

### Palette

Starter palette from the SVG trace and visual references:

```text
parchment: #fdf1dc
warm-paper: #f8d9b0
tan-shadow: #e2b17b
quipsly-brown: #ad6b35
ink-brown: #4c331b
```

Additional app palette direction:

- botanical green for QuipLore identity and success/collection states
- restrained gold for discovery, featured state, and warmth
- plum for occasional Quipsly/world accents
- blue-gray or slate for source/evidence/status UI

Guardrail:

- do not let the app become all beige. Source state, navigation state, actions,
  and warnings need distinct, accessible colors.

### Typography

The references suggest a mixed editorial system:

- expressive serif for brand marks and page heroes
- readable serif or humanist body copy for long context
- small caps or label-style text for archive metadata
- restrained sans-serif for controls, counts, and dense UI labels

Implementation direction:

- choose web-safe or bundled fonts later.
- do not use handwriting-style text for critical UI, source metadata, or long
  quote records.

### Surfaces And Shape

Carry forward:

- parchment backgrounds
- soft paper cards
- archive label pills
- ribbon/banner accents only for special headers
- rounded card corners, but usually modest
- illustrated panels with soft borders and warm shadows
- side panels that feel like source cards, not floating marketing cards

Implementation direction:

- keep card radius near the repo's default design guidance unless a special
  illustrated panel needs a softer storybook shape.
- avoid nested cards inside cards.
- page sections should breathe; individual repeated items can be cards.

## Product Patterns From The References

### Person Pages

The Einstein layout establishes the first page template:

- public person hero
- topic chips
- quote count / saved count / Nest count
- quote tab
- about facts
- Quipsly note
- Nests featuring the person
- page-level share controls

Add missing production-critical pieces:

- verified/source status per quote
- variant/misquote panel
- primary source/work links
- "why this attribution" explainer
- internal confidence and review shape in data, even if not all fields are
  visible at first

### Quote Cards

The grid references show a reusable card pattern:

- character or scene on one side
- quote text on the other
- small title/source label
- small icon accent
- warm border

Production card variants:

- compact feed card
- quote passport preview
- person-page quote row
- Lorelist item
- share image card
- empty/loading/notification card

### Home / Introduction

The introduction references show:

- hero with Quipsly, nest, books, ink, and quote scraps
- "what Quipsly does" feature list
- quotable person card grid
- three-part product explanation: build your Nest, discover/connect, share
- personalized footer CTA pattern

Carry forward the structure, but avoid hardcoding personal greetings unless the
user is signed in.

### Two-Site Model

`quiplore-quipsly-two-site-homepage-brainstorm.png` reinforces a useful
boundary:

- QuipLore: public quote archive and curation product
- Quipsly: world, agents, tools, lore, and supporting intelligence layer

The current docs already align with this split.

## IP-Sensitive References

These files are useful for studying layout, density, card rhythm, and how a
Quipsly-led scene can make a quote domain playful:

- `quipsly-movie-tv-cosplay-card-grid.png`
- `ip-reference-star-trek-card-grid.png`
- `ip-reference-lotr-lesson-page.png`

Do not ship these exact concepts, names, costumes, universes, or quotes as
production content without separate legal/editorial review.

Reusable pattern:

- themed quote card grid
- source/universe landing page
- lesson/theme rows
- narrative CTA panels
- small Quipsly scenes that introduce and connect quotes

Production-safe alternative:

- use public-domain works, original fictional sample worlds, or licensed
  editorial packages.
- make "inspired by" pages focus on source-backed public-safe data, not
  unreviewed fandom art.

## Source And Verification Notes

The image text is visual placeholder content.

Do not ingest image quote text as verified data. Many image quotes need source
review before public use. Treat them as layout examples only.

Production quote records need:

- exact text
- source/work
- attribution
- evidence
- status
- variant or misquote notes
- review trail

## First Implementation Translation

For `apps/quiplore`, start with these design tokens and components:

- color tokens from the starter palette
- `QuipCard`
- `VerificationBadge`
- `SourceBadge`
- `QuipslyPanel`
- `PersonHero`
- `QuotePassportPreview`
- `LorelistCard`
- `NestPreview`
- `QuipStreamCard`
- `ArchiveLabel`

For `packages/quipsly-domain`, make sure the seed data can support the visual
surface without flattening source truth:

- `QuoteText`
- `Attribution`
- `SourceWork`
- `Evidence`
- `VerificationStatus`
- `QuoteProjection`
- `PersonProfile`
- `Lorelist`

## Open Visual Decisions

- final QuipLore wordmark
- final Quipsly wordmark
- whether QuipLore and Quipsly use separate primary colors
- exact production typography
- icon library and custom icon treatment
- final Quipsly pose/state asset list
- policy for person-inspired Quipsly styling
- production approach for share card image generation
- whether app runtime should use raster illustrations, vector cutouts, CSS
  tokens, or a mix

## Immediate Recommendation

Use `quiplore-person-page-einstein-layout.png`,
`quipsly-character-states-brainstorm.png`, and
`quipsly-character-model-sheet.png` as the primary build references for the
first UI slice.

Use the fandom/IP-specific grids only as composition studies.
