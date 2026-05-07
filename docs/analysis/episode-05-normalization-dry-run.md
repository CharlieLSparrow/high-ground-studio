# Episode 5 Normalization Dry Run

Date: 2026-05-07

## Purpose

This is a proposed normalization plan only.

It turns the Episode 5 review packet into a concrete dry run for a future living-manuscript edit. It names candidate block IDs, block types, metadata, pairings, and possible arrangement changes before canonical manuscript truth changes.

Do not treat this document as approval to edit `learning-to-lead.living.mdx`. The next manuscript pass should happen only after Homer/Charlie approve the story spine, Charlie roles, research/clip handling, and Episode 5/6 boundary.

## Current Canonical State

### Existing Homer Blocks

These `ManuscriptBlock` entries already exist in `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`:

| Block ID | Type | Voice | Status | Role in Episode 5 |
| --- | --- | --- | --- | --- |
| `homer-values-army-leadership-and-integrity` | `leadership-principle` | `homer` | `baseline` | Values and integrity setup; useful context, but not necessarily core Episode 5 sequence. |
| `homer-values-tip-nevada-promise` | `story` | `homer` | `baseline` | Core Tip/Winnemucca promise story and trust spine. |
| `homer-values-milk-down-the-drain` | `story` | `homer` | `baseline` | Core milk mistake, forgiveness, confidence, standards, and forgive/fire material. |
| `homer-values-mundane-greatness` | `leadership-principle` | `homer` | `baseline` | Better fit for Episode 6 unless Episode 5 deliberately broadens into consistency. |
| `homer-values-grudges-and-listening` | `story` | `homer` | `baseline` | Better fit for Episode 6 trust/listening unless boundary changes. |

### Missing Episode 5 Support Blocks

The living manuscript does not currently contain Episode 5-specific:

- Charlie Tip reaction blocks.
- Charlie trust/dependability support blocks.
- Charlie forgive/fire or coaching-before-removal reflection blocks.
- Episode 5 research/field-note blocks.
- Episode 5 clip candidate blocks.
- Episode 5 production-note blocks.

### Existing Charlie Blocks

The only current Charlie blocks are Episode 4 / Early Days material:

- `charlie-early-days-effort-and-joy-sidebar`
- `charlie-early-days-psychological-safety-sidebar`
- `charlie-early-days-incentives-sidebar`
- `charlie-early-days-autonomy-and-purpose-sidebar`
- `charlie-early-days-start-with-why-sidebar`
- `charlie-early-days-meaning-and-endurance-sidebar`
- `charlie-early-days-listening-culture-sidebar`
- `charlie-early-days-warmth-and-attention-close`

None of those blocks cover the Episode 5 values/trust material.

### Current Podcast Arrangement

`apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml` currently has a broad `values` candidate:

```yml
  values:
    title: "Values"
    status: "candidate"
    blocks:
      - homer-values-definition-and-relative-worth
      - homer-values-army-leadership-and-integrity
      - homer-values-tip-nevada-promise
      - homer-values-milk-down-the-drain
      - homer-values-mundane-greatness
      - homer-values-grudges-and-listening
      - homer-values-simple-solutions
      - homer-values-autonomy-and-army-choice
      - homer-values-basic-training-arrival-and-humor
      - homer-values-basic-training-wrestling-and-proving-yourself
      - homer-values-basic-training-egos-and-direction
      - homer-values-basic-training-cs-gas-and-preparation
      - homer-values-language-discipline-and-reputation
      - homer-values-icon-health-and-early-leadership
```

That arrangement is too broad to represent Episode 5 cleanly. It overlaps Episode 6 and likely later Chapter Two episodes.

## Proposed Episode 5 Spine

Recommended sequence for a narrow Episode 5 normalization:

1. Tip / Winnemucca promise.
2. Charlie trust/dependability support.
3. Milk down the drain.
4. Forgive and Fire / Standards.
5. Roy / coaching before removal.
6. Park radio/dead-cow fragments unless approved.

This keeps Episode 5 centered on values, trust, mistakes, standards, and coaching-before-removal. It leaves ordinary consistency, grudges/listening, and broader farm responsibility mostly for Episode 6 unless humans decide otherwise.

## Proposed New Blocks

Metadata fields below use current `ManuscriptBlock` conventions where possible. `audience` and `presentation` are recommendations only; they are not first-class supported fields in the current block schema unless a later schema/design pass adds them.

### `charlie-values-tip-kindred-spirit-reaction`

- Title: `Charlie: Tip, Kindred Spirit, and Family Memory`
- Type: `charlie-reflection`
- Voice: `charlie`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["values", "trust", "family", "episode-05", "podcast-candidate"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `["homer-values-tip-nevada-promise"]`
- Audience/presentation recommendation: sidebar or episode reaction; book inclusion only if Homer/Charlie want a visible Charlie aside.
- Body summary: Charlie's affection for Tip, identification with Tip, and family-memory reaction around Mom's "Tip! That will be enough!" cadence.
- Citation/rights status: no outside citation needed; family-memory approval needed.
- View placement: Book View maybe; Story View yes; Episode Everything yes; Episode Draft yes if approved; public Live only after copy review.

### `charlie-values-winnemucca-promise-reaction`

- Title: `Charlie: No Matter How Far`
- Type: `charlie-reflection`
- Voice: `charlie`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["values", "trust", "promise", "episode-05", "podcast-candidate"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `["homer-values-tip-nevada-promise"]`
- Audience/presentation recommendation: sidebar or short episode narration beat.
- Body summary: Reflects on the oddly specific promise request and why the fulfilled Winnemucca drive turns trust from an idea into proof.
- Citation/rights status: no outside citation needed.
- View placement: Book View maybe; Story View yes; Episode Everything yes; Episode Draft yes if approved; public Live only after review.

### `charlie-values-trust-through-dependability-bridge`

- Title: `Charlie: Trust Is Dependability`
- Type: `charlie-reflection`
- Voice: `charlie`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["values", "trust", "dependability", "leadership", "episode-05", "podcast-candidate"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `["homer-values-tip-nevada-promise"]`
- Audience/presentation recommendation: inline bridge if approved; otherwise sidebar/reflection.
- Body summary: Bridges "leaders who are trusted are followed" into the practical idea that trust is built through consistent, dependable follow-through.
- Citation/rights status: no outside citation required if kept as Charlie reflection; citation needed if it leans on external trust frameworks.
- View placement: Book View maybe; Story View yes; Episode Everything yes; Episode Draft yes if approved; public Live only after review.

### `charlie-values-neurodivergence-follow-through-reflection`

- Title: `Charlie: Follow-Through Is Harder Than It Looks`
- Type: `charlie-reflection`
- Voice: `charlie`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["trust", "dependability", "neurodivergence", "episode-05", "needs-review"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `["homer-values-tip-nevada-promise"]`
- Audience/presentation recommendation: optional sidebar; do not include unless Charlie approves tone and specificity.
- Body summary: Reflects on how follow-through and dependability can be difficult, especially when executive-function friction is real.
- Citation/rights status: personal reflection; sensitivity/tone review needed.
- View placement: Book View maybe; Story View yes; Episode Everything yes; Episode Draft only if approved; public Live only after careful review.

### `research-values-speed-of-trust-bridge`

- Title: `Research: The Speed Of Trust`
- Type: `research-bridge`
- Voice: `research`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["trust", "leadership", "research", "needs-citation", "episode-05"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `["homer-values-tip-nevada-promise"]`
- Audience/presentation recommendation: research/field-note card; not clean book prose until verified.
- Body summary: Captures the trust tax/friction framing connected to Stephen M. R. Covey's *The Speed of Trust*.
- Citation/rights status: needs citation verification.
- View placement: Book View only after citation-ready rewrite; Story View yes; Episode Everything yes; Episode Draft maybe; public Live only after verification.

### `research-values-watson-education-quote`

- Title: `Research: Watson And Costly Mistakes`
- Type: `quote-context`
- Voice: `research`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["trust", "mistakes", "leadership", "quote-context", "needs-citation", "episode-05"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `["homer-values-milk-down-the-drain"]`
- Audience/presentation recommendation: research/quote note; not public until verified.
- Body summary: Frames the Thomas J. Watson / IBM anecdote about retaining someone after an expensive mistake as a parallel to restored confidence.
- Citation/rights status: needs citation and quote wording verification.
- View placement: Book View only after verification; Story View yes; Episode Everything yes; Episode Draft maybe; public Live only after verification.

### `charlie-values-forgive-and-fire-standards-reflection`

- Title: `Charlie: Forgive The Mistake, Keep The Standard`
- Type: `charlie-reflection`
- Voice: `charlie`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["leadership", "standards", "trust", "episode-05", "podcast-candidate"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `["homer-values-milk-down-the-drain"]`
- Audience/presentation recommendation: sidebar/reflection; possible episode narration beat.
- Body summary: Explores the difference between forgiving a costly mistake and tolerating a destructive pattern.
- Citation/rights status: no outside citation required.
- View placement: Book View maybe; Story View yes; Episode Everything yes; Episode Draft yes if approved; public Live after review.

### `research-values-dichotomy-firing-bridge`

- Title: `Research: Dichotomy Of Leadership And Removal`
- Type: `research-bridge`
- Voice: `research`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["leadership", "standards", "coaching", "needs-citation", "episode-05"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `["homer-values-milk-down-the-drain"]`
- Audience/presentation recommendation: research/field-note card; not public until verified.
- Body summary: Captures the Jocko Willink / *The Dichotomy of Leadership* reference about a liked leader who still could not meet the required standard.
- Citation/rights status: needs citation verification.
- View placement: Book View only after verification; Story View yes; Episode Everything yes; Episode Draft maybe; public Live only after verification.

### `charlie-values-roy-coaching-before-removal-reflection`

- Title: `Charlie: Coach Before Removal`
- Type: `charlie-reflection`
- Voice: `charlie`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["leadership", "coaching", "standards", "people", "episode-05", "podcast-candidate"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `["homer-values-milk-down-the-drain"]`
- Audience/presentation recommendation: sidebar/reflection; strong Episode Draft candidate if approved.
- Body summary: Reflects on coaching first, holding people to standards, regretting holding on too long, and not removing people simply because they disagree.
- Citation/rights status: no outside citation required if kept as Charlie/Homer application.
- View placement: Book View maybe; Story View yes; Episode Everything yes; Episode Draft yes if approved; public Live after review.

### `clip-values-samwise-candidate`

- Title: `Clip Candidate: Samwise`
- Type: `clip-candidate`
- Voice: `editorial`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["clip", "trust", "episode-05", "needs-rights-review"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `["homer-values-tip-nevada-promise"]`
- Audience/presentation recommendation: Episode Everything and show prep only.
- Body summary: Production cue for the Samwise trust/support reference connected to Tip and loyal follow-through.
- Citation/rights status: rights/citation review required; not cleared public material.
- View placement: Book View no; Story View editorial only; Episode Everything yes; Episode Draft only as a cue; public Live no unless cleared or paraphrased safely.

### `clip-values-nate-candidate`

- Title: `Clip Candidate: Nate`
- Type: `clip-candidate`
- Voice: `editorial`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["clip", "mistakes", "trust", "episode-05", "needs-rights-review"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `["homer-values-milk-down-the-drain"]`
- Audience/presentation recommendation: Episode Everything and show prep only.
- Body summary: Production cue for the Nate reference paired with costly mistakes and restored confidence.
- Citation/rights status: rights/citation review required; not cleared public material.
- View placement: Book View no; Story View editorial only; Episode Everything yes; Episode Draft only as a cue; public Live no unless cleared or replaced.

### `clip-values-roy-firing-candidate`

- Title: `Clip Candidate: Roy Firing`
- Type: `clip-candidate`
- Voice: `editorial`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["clip", "coaching", "standards", "episode-05", "needs-rights-review"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `["homer-values-milk-down-the-drain"]`
- Audience/presentation recommendation: Episode Everything and show prep only.
- Body summary: Production cue for the Roy firing/coaching-before-removal reference.
- Citation/rights status: rights/citation review required; not cleared public material.
- View placement: Book View no; Story View editorial only; Episode Everything yes; Episode Draft only as a cue; public Live no unless cleared or replaced.

### `production-values-team-development-note`

- Title: `Production Note: Team Development`
- Type: `production-note`
- Voice: `editorial`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["production-note", "team-development", "episode-05", "needs-decision"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `["homer-values-milk-down-the-drain"]`
- Audience/presentation recommendation: internal Episode Everything only.
- Body summary: Preserves the `Team development inject` cue if humans want it retained for show prep.
- Citation/rights status: not applicable.
- View placement: Book View no; Story View editorial only; Episode Everything yes; Episode Draft no unless explicitly needed as recording cue; public Live no.

### `production-values-diversity-note`

- Title: `Production Note: Diversity`
- Type: `production-note`
- Voice: `editorial`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["production-note", "diversity", "episode-05", "needs-decision"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `["homer-values-milk-down-the-drain"]`
- Audience/presentation recommendation: internal Episode Everything only.
- Body summary: Preserves the `Diversity inject` cue if humans want it retained for show prep.
- Citation/rights status: not applicable.
- View placement: Book View no; Story View editorial only; Episode Everything yes; Episode Draft no unless explicitly needed as recording cue; public Live no.

### `production-values-radio-dead-cow-fragment`

- Title: `Parked Fragment: Radio Responsibility And Dead Cow`
- Type: `production-note`
- Voice: `editorial`
- Status: `draft`
- Chapter: `chapter-two-values`
- Tags: `["production-note", "parked", "responsibility", "episode-05", "episode-06-boundary", "needs-decision"]`
- Source: `episode-05-values-toolkit.md / _inbox/Episode 5 - Chapter 2.md`
- Pairs with: `[]`
- Audience/presentation recommendation: parked internal note only; do not normalize as prose.
- Body summary: Preserves radio/responsibility/dead-cow fragments while humans decide whether they belong in Episode 5, Episode 6, or later farm-responsibility material.
- Citation/rights status: not applicable.
- View placement: Book View no; Story View editorial only; Episode Everything maybe; Episode Draft no; public Live no.

## Proposed Arrangement Changes

Do not modify arrangements during the dry run.

After approved blocks exist, prefer adding a separate Episode 5 key rather than replacing the broad `values` candidate immediately.

Proposed key:

- `values-toolkit`

Reason:

- `values` currently spans too much Chapter Two material and overlaps Episode 6.
- A separate Episode 5 key allows Episode 5 to become reviewable without destroying the coarse candidate map needed for Episode 6 and later splits.
- After Episode 6 post-recording review, `values` can be retired, renamed, or rebuilt into separate final episode keys.

Possible future arrangement shape:

```yml
  values-toolkit:
    title: "The Values Toolkit"
    status: "candidate"
    blocks:
      - homer-values-tip-nevada-promise
      - clip-values-samwise-candidate
      - charlie-values-tip-kindred-spirit-reaction
      - charlie-values-winnemucca-promise-reaction
      - charlie-values-trust-through-dependability-bridge
      - research-values-speed-of-trust-bridge
      - charlie-values-neurodivergence-follow-through-reflection
      - homer-values-milk-down-the-drain
      - clip-values-nate-candidate
      - research-values-watson-education-quote
      - charlie-values-forgive-and-fire-standards-reflection
      - clip-values-roy-firing-candidate
      - research-values-dichotomy-firing-bridge
      - charlie-values-roy-coaching-before-removal-reflection
      - production-values-team-development-note
      - production-values-diversity-note
```

Warnings:

- Clip and production-note blocks should appear only in internal Episode View / show-prep contexts, not clean book or public Live output.
- If the current arrangement system cannot distinguish internal prep from public derivative output, keep clip/production blocks in production state only and omit them from `podcast-season-1.yml`.
- `charlie-values-neurodivergence-follow-through-reflection` should be omitted unless Charlie approves tone and placement.
- `production-values-radio-dead-cow-fragment` should remain parked and should not be part of the Episode 5 arrangement unless humans explicitly assign it.
- Episode 5 and Episode 6 still overlap around trust, consistency, responsibility, and later Chapter Two material.

Recommended arrangement decision after block creation:

- Add `values-toolkit` as an Episode 5-specific candidate.
- Update `episode-production/season-one.yml` Episode 5 `arrangementKeys` from `values` to `values-toolkit` only after the new arrangement validates.
- Keep the broad `values` key temporarily until Episode 6 is reviewed.

## Approval Checklist Before Manuscript Edit

- [ ] Episode 5 story spine approved.
- [ ] Charlie inline items approved.
- [ ] Charlie sidebar/reflection items approved.
- [ ] Research bridges approved or parked.
- [ ] Clip candidates approved as episode-only cues.
- [ ] Radio/dead-cow fragments parked or assigned.
- [ ] Title/slug selected or deferred.
- [ ] Episode 6 boundary acknowledged.
- [ ] Decision made on whether internal clip/production blocks belong in `podcast-season-1.yml` or only in production state.

## Recommended Narrow Edit If Approved

If Homer/Charlie approve the dry run, the next pass should:

1. Add only approved Episode 5 Charlie/support blocks to `learning-to-lead.living.mdx`.
2. Preserve all existing Homer block wording.
3. Avoid splitting Homer blocks unless the review specifically asks for a split.
4. Keep citations and clip/rights items visibly marked as unverified.
5. Skip parked radio/dead-cow fragments unless explicitly approved.
6. Add a session note documenting exact block IDs created.
7. Run manuscript ID uniqueness and arrangement-reference validation.

## Recommended Next Action

Review this dry run with Homer/Charlie and mark each proposed block as approve, park, revise, or reject before editing the living manuscript.
