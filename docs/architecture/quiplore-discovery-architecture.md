# QuipLore Discovery Architecture

QuipLore can borrow the best mechanics from short-form vertical discovery
without copying the addiction incentives that make those feeds feel disposable.
The discovery surface should be fast, beautiful, and reactive, but the product
goal is curation and source-aware exploration.

This document expands the QuipStream section in the Quipsly/QuipLore foundation.

## Product Thesis

QuipStream is a vertical, card-by-card quote discovery experience inspired by
the interaction shape of YouTube Shorts and Instagram Reels:

- one primary object on screen
- fast next/previous navigation
- immediate save/share/react controls
- a recommendation loop that adapts during the session
- simple escape hatches into deeper context

The QuipLore difference is that the primary success event is not passive watch
time. The product should optimize for useful discovery:

- quote saved to a Nest
- quote added to a Lorelist
- Quote Passport opened
- source or context expanded
- theme/person/source followed
- variant or misquote explored
- user says why something did or did not work

QuipStream should feel like discovery, not homework. Quote Passports make the
archive trustworthy when the user wants depth.

## Interaction Model

The MVP should use a full-height vertical stream on mobile and a centered stream
rail on desktop.

Each QuipStream card should include:

- quote text
- attribution
- verification/source badge
- theme/person/source chips
- save action
- add-to-Lorelist action
- open Quote Passport action
- more like this / less like this feedback
- skip

Optional card modules:

- short source context
- variant or misquote callout
- Quipsly note
- related person/work hint
- story teaser
- merch-safe/share-card preview

Cards should be stable projections over canonical quote data. The stream card is
not the quote source of truth.

## Discovery Modes

QuipStream should eventually support several entry modes. These can share the
same card UI and event pipeline.

- For You: personalized mixed discovery.
- Verified: high-confidence quotes only.
- By Theme: curiosity, courage, grief, wit, love, leadership, etc.
- By Person: focused stream for a quotable person page.
- By Source: quotes from a book, speech, interview, poem, episode, or archive.
- Lorelist Builder: stream candidates optimized for an active collection.
- Story Trail: a sequence with editorial context between quote cards.
- Newly Reviewed: recently verified, corrected, disputed, or debunked quotes.
- Curator Picks: human-curated sets with optional commentary.

MVP can ship with `For You`, `By Theme`, and `By Person` as UI filters over
seed data. The event contract should still model the richer future modes.

## Feedback Signals

Every QuipStream impression should become an analytics event. The first version
can log locally or to a thin server endpoint, but the schema should be stable
enough to later feed BigQuery and recommendation training.

Core events:

- stream session started
- quote impression shown
- quote impression exited
- dwell duration
- next / previous
- save
- unsave
- add to Lorelist
- remove from Lorelist
- open Quote Passport
- open person page
- open source page
- expand source/context
- expand variants/misquotes
- copy/share
- more like this
- less like this
- hide theme/person/source
- not useful
- too cheesy
- report issue
- merch interest
- story interest

Derived signals:

- save rate by theme/person/source
- Passport open rate after impression
- source expansion rate
- Lorelist add rate
- repeated skips by theme/person/source
- completion or abandonment of a session batch
- exploration diversity within a session
- quote fatigue from repeated themes or formats

The event model should preserve the displayed projection, ranking inputs, and
review state at impression time. If the quote record changes later, the historic
event should still explain what the user saw.

## Recommendation Path

The ranking system should grow in layers.

### V0: Editorial Rules

Start deterministic:

- curated seed sets
- hand-authored themes
- verification status filters
- simple novelty and diversity rules
- no repeated person/source/theme in tight succession
- avoid showing uncertain or disputed material without visible context

### V1: Semantic Relatedness

Add vector search over:

- quote text
- source context
- themes/tags
- person profiles
- source descriptions
- curator notes

Use SQL filters for trust boundaries before vector ranking. For example, a
high-confidence stream should filter to acceptable verification states before
semantic similarity is applied.

### V2: Collaborative Signals

Use aggregate behavior:

- users who saved this also saved
- Lorelists that contain this also contain
- people who opened this source also explored
- theme transitions that lead to saves
- quote/person/source clusters with high curation value

### V3: Learned Ranking

Train a ranker when there is enough interaction volume. The model should not
optimize only for dwell time. Candidate objective labels should include:

- saved
- added to Lorelist
- opened Quote Passport
- expanded source/context
- followed a theme/person/source
- returned to the app after the session
- gave positive explicit feedback
- did not immediately unsave or remove

Negative labels should include:

- immediate skip
- less like this
- too cheesy
- not useful
- report issue
- repeated fatigue against a theme/person/source

## Data Model Additions

The broader Quipsly data model should reserve room for these entities:

- QuipStreamSession
- QuipStreamImpression
- QuipStreamAction
- RecommendationCandidate
- RecommendationDecision
- RecommendationFeedback
- UserInterestProfile
- StreamBatch
- StreamMode

Important rules:

- An impression points at the projected quote payload displayed to the user.
- A recommendation decision stores candidate IDs, ranking scores, filters, and
  explanation/debug metadata.
- A stream session stores entry mode, device class, authenticated/anonymous
  state, locale, and experiment assignment.
- Feedback can be explicit, like `more_like_this`, or implicit, like dwell and
  skip speed.
- Anonymous events should be useful without creating dark identity behavior.
  Authenticated accounts can attach deeper preference and curation history.

## API Shape

Initial Quipsly API endpoints can be simple:

- `POST /v1/quipstream/sessions`
- `GET /v1/quipstream/sessions/{sessionId}/next`
- `POST /v1/quipstream/events`
- `GET /v1/quipstream/modes`

Later API endpoints:

- `GET /v1/quipstream/sessions/{sessionId}/debug`
- `POST /v1/quipstream/feedback`
- `GET /v1/recommendations/quotes`
- `GET /v1/recommendations/lorelist-candidates`

The API should return cards as projections, not raw database rows. Each card
payload should include enough source/review metadata for the UI to display
trust state without additional round trips.

## Trust And Safety

QuipStream must not hide uncertainty behind beautiful cards.

- Verification badges are always visible.
- Disputed/misattributed quotes should be shown only in modes where the user
  expects that context, or with an explicit callout.
- User-facing explanations should be short, but the Quote Passport must carry
  the deeper evidence trail.
- Recommendation logic should avoid amplifying unsourced quotes just because
  they perform well.
- Agent-generated stories, summaries, and context notes need review state before
  public high-confidence placement.

## Anti-Goals

Do not build:

- an endless quote-image slot machine
- a hidden feed that optimizes for raw time spent
- cards that detach quotes from source/review state
- a recommendation system that treats disputed quotes as equivalent to verified
  quotes
- a copied short-video UI with no reason to exist in a quote product

## MVP Build Slice

The first implementation should prove the loop:

1. Load a seed batch of quote projections.
2. Display one full-height QuipStream card at a time.
3. Support next/previous with touch, wheel, keyboard, and visible controls.
4. Let the user save to a UI-only Nest.
5. Let the user add to a UI-only Lorelist.
6. Let the user open a Quote Passport.
7. Capture an in-memory event log for impressions and actions.
8. Expose a development panel or console output that shows the event stream.

This can ship before accounts, database writes, or ML. The important part is to
lock the interaction and event vocabulary early.

## External Pattern References

These are product-pattern references, not sources to copy visually.

- YouTube Shorts uses a vertically scrollable Shorts feed and distinguishes
  simple view starts from engaged views in analytics.
- Instagram Reels popularized short, remixable, shareable vertical discovery
  inside Instagram's Explore and sharing surfaces.

