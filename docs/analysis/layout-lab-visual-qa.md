# Layout Lab Visual QA

Date: 2026-04-28

Method:
- reviewed the current layout-lab surfaces under a local team-capable session so the server would honor the `hgo_layout_variant` cookie
- captured screenshots for `cinematic`, `editorial`, and `signal` on:
  - `/`
  - `/coaching`
  - `/library`
  - `/episodes/write-it-down`
- enabled `ENABLE_EPISODES_FUMADOCS=1` for the representative episode route review
- screenshot evidence was captured locally during the pass; the representative episode route failed before the intended page shell rendered
- screenshots were kept local for QA only and were not copied into the repo

Important current limitation:
- `/episodes/write-it-down` is not visually reviewable as an episode page right now
- with the guarded loader enabled, both `next dev` and `next start` hit `ERR_UNSUPPORTED_ESM_URL_SCHEME` from `fumadocs-mdx:` before the intended episode shell renders
- that is a route/runtime blocker, not a visual polish issue
- treat that episode runtime failure as a separate future investigation, not part of this layout-lab visual QA pass

## Route: `/`

### Variant: `cinematic`
What looks strong:
- strongest immediate brand signature of the three home variants
- hero headline is memorable and visually distinct from the other variants
- the transition from the dark hero into the warmer featured-content section feels intentional and cinematic

What looks weak:
- the hero has a very large empty vertical field before the featured section begins
- the archive cards still show large black media wells on the right side, which reads more like missing presentation than intentional restraint

Likely polish issues:
- Home hero vertical whitespace feels oversized on desktop
  - Severity: medium
  - Priority: P2
- Archive cards use empty black media panes that pull attention away from the text side
  - Severity: medium
  - Priority: P2

Recommended next polish steps:
- tighten the home hero height or pull the featured section higher on large screens
- either populate the archive media panes or collapse those cards to a text-led treatment when no supporting media is shown

### Variant: `editorial`
What looks strong:
- the warm palette and calmer typography fit the literary/documentary intent well
- featured content feels more like a magazine lead story than a promo block
- the section naming and calmer CTA language feel coherent with the variant direction

What looks weak:
- the hero still spends a lot of vertical space on atmosphere before content density increases
- the same empty black archive media panes remain visible here and feel more out of place in the editorial mode than in cinematic

Likely polish issues:
- Editorial hero still has too much vertical air relative to its text density
  - Severity: medium
  - Priority: P2
- Archive cards mix polished editorial copy with obviously empty right-hand panes
  - Severity: medium
  - Priority: P2

Recommended next polish steps:
- slightly shorten the hero stack on desktop
- replace the archive media well with an editorial thumbnail, pull-quote, or purely text-driven composition

### Variant: `signal`
What looks strong:
- strongest information hierarchy for quick browsing and discovery
- the access panel is useful and explains the current product state clearly
- the lead-story plus queue structure makes this variant feel purpose-built for discoverability

What looks weak:
- the queue area leaves a lot of pale open space once the two poster cards end
- the split hero composition can feel slightly disconnected on wide screens, with the access card floating apart from the main message

Likely polish issues:
- Queue section under-fills the page when there are only two poster cards
  - Severity: low
  - Priority: P3
- Signal hero composition could use tighter alignment between the main copy block and the access panel
  - Severity: low
  - Priority: P3

Recommended next polish steps:
- either reduce the queue title scale or add a tighter card grid treatment when item count is low
- nudge the access panel closer into the hero composition so the top section feels more integrated

## Route: `/coaching`

### Variant: `cinematic`
What looks strong:
- retains the current brand atmosphere while keeping the two-plan offer clear
- plan cards are readable and the pricing block hierarchy is easy to scan
- the darker upper shell helps the subscription cards feel prominent

What looks weak:
- the hero headline wraps into a very large, dense text block on desktop
- the hero consumes a lot of width without giving the copy a cleaner readable measure

Likely polish issues:
- Coaching hero headline has awkwardly large multiline wrapping on desktop
  - Severity: medium
  - Priority: P2

Recommended next polish steps:
- reduce the headline width or scale slightly so the line breaks feel less heavy
- consider a slightly narrower hero text column before touching anything else

### Variant: `editorial`
What looks strong:
- warm palette works well for reflective coaching language
- pricing section still reads clearly despite the softer tone
- this is the most naturally “bookish” version of the coaching front door

What looks weak:
- secondary UI elements, especially the muted button and subtle borders, verge on feeling a little too quiet in places
- the same long desktop headline wrapping issue remains here

Likely polish issues:
- Secondary controls and card boundaries are slightly too subdued for the amount of warm background glow behind them
  - Severity: low
  - Priority: P3
- Coaching hero line breaks remain too large and dense
  - Severity: medium
  - Priority: P2

Recommended next polish steps:
- slightly raise border or button contrast in the editorial coaching surface
- tighten the headline measure on large screens

### Variant: `signal`
What looks strong:
- clearest conversion-oriented presentation of the coaching page
- plan cards are easiest to compare in this mode
- the flatter panel language fits the “practical offer page” goal well

What looks weak:
- the lower informational cards blend into the pale background more than they should
- some panel separations rely on subtle borders that are easy to miss at a glance

Likely polish issues:
- Lower-card separation is a bit weak in the lighter signal environment
  - Severity: low
  - Priority: P3
- Coaching hero line breaks are still heavier than ideal
  - Severity: medium
  - Priority: P2

Recommended next polish steps:
- strengthen border/shadow contrast slightly on the lower explanatory cards
- tighten hero text measure the same way as the other coaching variants

## Route: `/library`

### Variant: `cinematic`
What looks strong:
- the route feels connected to the main brand language while staying readable
- section progression from episodes into paired reading is clear
- the lighter lower background helps the reading cards stand off from the page

What looks weak:
- the long episode cards feel a little oversized relative to the amount of content inside them
- the lower glow/shadow treatment is heavier than it needs to be for a browse surface

Likely polish issues:
- Episode list cards could be tighter vertically for faster scanning
  - Severity: low
  - Priority: P3
- Lower glow/shadow on the library page is slightly overdramatized for a browsing surface
  - Severity: low
  - Priority: P3

Recommended next polish steps:
- trim card padding in the episode list slightly
- reduce the bottom glow intensity so the browse experience feels a bit more efficient

### Variant: `editorial`
What looks strong:
- strongest overall fit for a “story library” surface
- headline, background, and card tone all reinforce the reading-first intent
- the paired-reading cards feel especially natural in this variant

What looks weak:
- episodes and paired-reading cards are visually closer together than they ideally should be
- section distinction leans heavily on labels rather than stronger structural contrast

Likely polish issues:
- Episode and reading sections could use a bit more visual differentiation
  - Severity: low
  - Priority: P3

Recommended next polish steps:
- introduce slightly different card weight or spacing between episodes and paired-reading blocks
- keep the editorial palette; the issue is separation, not overall look

### Variant: `signal`
What looks strong:
- strongest scanability of the three library variants
- cleanest card structure for discovery and quick open decisions
- the lighter lower field supports the “library shelf” feel well

What looks weak:
- the page gets slightly airy once the layout moves into the lower card grid
- some of the book-card text on the pale field would benefit from a touch more emphasis

Likely polish issues:
- Lower grid feels a little sparse because large cards are combined with generous negative space
  - Severity: low
  - Priority: P3
- Book-card text emphasis is a little soft on the pale lower field
  - Severity: low
  - Priority: P3

Recommended next polish steps:
- slightly tighten card padding or grid gap in the lower section
- raise heading/subheading contrast a notch on the book cards

## Route: `/episodes/write-it-down`

### Variant: `cinematic`
What looks strong:
- not meaningfully reviewable as an episode page in the current state

What looks weak:
- the route fails before the intended shell renders

Likely polish issues:
- Runtime/content-loader blocker prevents any real visual review
  - Severity: high
  - Priority: P1

Recommended next polish steps:
- fix the current `fumadocs-mdx:` loader/runtime path so the route can render at all before doing episode-shell polish

### Variant: `editorial`
What looks strong:
- not meaningfully reviewable as an episode page in the current state

What looks weak:
- same runtime failure as cinematic

Likely polish issues:
- Runtime/content-loader blocker prevents any real visual review
  - Severity: high
  - Priority: P1

Recommended next polish steps:
- fix the current `fumadocs-mdx:` loader/runtime path so the route can render at all before doing episode-shell polish

### Variant: `signal`
What looks strong:
- not meaningfully reviewable as an episode page in the current state

What looks weak:
- same runtime failure as the other two variants

Likely polish issues:
- Runtime/content-loader blocker prevents any real visual review
  - Severity: high
  - Priority: P1

Recommended next polish steps:
- fix the current `fumadocs-mdx:` loader/runtime path so the route can render at all before doing episode-shell polish

## Cross-Route Summary

Highest-value polish opportunities:
1. Fix the `/episodes/*` loader/runtime blocker before treating the route family as visually QA-ready.
2. Tighten the home hero vertical spacing on `cinematic` and `editorial`.
3. Replace or remove the empty black archive media wells on the home archive cards.
4. Tighten the coaching hero text measure across all three variants.
5. Add slightly clearer structural separation in the signal/editorial browse surfaces where large cards and pale fields start to feel too airy.

Variant-level read:
- `cinematic`: strongest brand mood, but most prone to oversized atmosphere and heavy negative space
- `editorial`: best literary fit, especially for `/library`, but it exposes any placeholder-like presentation more quickly than the other modes
- `signal`: strongest utility/discovery mode, especially for `/coaching` and `/library`, but it can feel sparse when content counts are low
