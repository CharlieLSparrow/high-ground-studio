# Episode 5 Arrangement Plan

Date: 2026-05-07

## Purpose

This is a planning document only.

It decides the next likely arrangement edit after the narrow Episode 5 Charlie-reflection normalization. It does not modify `podcast-season-1.yml`, `season-one.yml`, the living manuscript, publish files, episode packets, or raw intake files.

## Current Arrangement State

`apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml` currently has a broad `values` arrangement key:

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

That key is useful as a coarse Chapter Two candidate, but it is too wide for Episode 5. It includes likely Episode 6 material and later Chapter Two material, and it does not yet include the four newly normalized Episode 5 Charlie reflection blocks.

Current production state also still uses `arrangementKeys: ["values"]` for Episode 5. That is accurate as a temporary broad reference, but it should not be treated as a clean Episode 5 sequence.

No Episode 5-specific `values-toolkit` arrangement key exists yet.

## Proposed New Arrangement Key

Recommended next arrangement key:

- Key: `values-toolkit`
- Title: `The Values Toolkit`
- Status: `candidate`

This should be an internal candidate arrangement, not a public publish source.

## Proposed Internal Episode 5 Sequence

Recommended block order using only existing approved/normalized blocks:

```yml
  values-toolkit:
    title: "The Values Toolkit"
    status: "candidate"
    blocks:
      - homer-values-tip-nevada-promise
      - charlie-values-winnemucca-promise-reaction
      - charlie-values-trust-through-dependability-bridge
      - homer-values-milk-down-the-drain
      - charlie-values-forgive-and-fire-standards-reflection
      - charlie-values-roy-coaching-before-removal-reflection
```

Sequence rationale:

- Start with the Tip/Winnemucca promise because it is the clearest trust story and emotional hook.
- Follow immediately with the two approved Charlie trust reflections, keeping them paired to the Tip story.
- Move to Milk Down the Drain as the second Homer story, shifting from kept promises to costly mistakes and restored confidence.
- Close the candidate sequence with the two approved Charlie standards/coaching reflections, which make the practical leadership application explicit.

Excluded on purpose:

- Research blocks are excluded because citation and quote verification remain open.
- Clip candidates are excluded because rights, public-use, and replacement decisions remain open.
- Production notes are excluded because they do not belong in an arrangement that may be read as episode draft sequence.
- Episode 6 material is excluded because the Episode 5/6 boundary still needs post-recording review.
- The two revise-before-approve Charlie blocks are excluded because they were not part of the approved normalization scope.

## Production State Update Plan

After the arrangement key is created in a future edit:

- Episode 5 in `apps/web/content/books/learning-to-lead/episode-production/season-one.yml` should reference `values-toolkit`.
- The broad `values` key can remain temporarily for Episode 6 and later Chapter Two candidate work.
- Episode 6 should not change until post-recording review confirms its final arc and boundary.
- The cockpit can continue to show structured intake references and unresolved decisions separately from the arrangement sequence.

Recommended future Episode 5 production-state change:

```yml
    arrangementKeys:
      - "values-toolkit"
```

Do not delete or rename `values` in the same pass.

## Risks / Guardrails

- Do not publish from this arrangement.
- Do not include clip, research, or production-note material.
- Do not pull Episode 6 blocks into this sequence yet.
- Do not remove the broad `values` arrangement until Episode 6 is reviewed.
- Keep `values-toolkit` as an internal candidate arrangement until the episode draft and public publish path are reviewed separately.
- Do not treat this arrangement as final show notes or a public episode page.

## Approval Checklist

- [ ] Four new Charlie blocks reviewed in manuscript context.
- [ ] `values-toolkit` key approved.
- [ ] Proposed block order approved.
- [ ] Broad `values` retained temporarily.
- [ ] Episode 6 boundary acknowledged.

## Recommended Next Action

If Homer/Charlie/Chuck accept this plan, run a narrow arrangement edit that adds only the `values-toolkit` key to `podcast-season-1.yml`, updates Episode 5 production state to reference it, and validates arrangement references without touching Episode 6.
