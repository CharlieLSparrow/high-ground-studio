# Episode 5 Normalization Approval Matrix

Date: 2026-05-07

## Purpose

This matrix is for Homer, Charlie, and Chuck approval before any edits are made to `learning-to-lead.living.mdx`.

It converts the Episode 5 normalization dry run into a decision table: approve, park, revise, or reject. The defaults below are recommendations for review, not canonical manuscript changes.

## Decision Legend

- Approve: safe to include in the next narrow normalization pass if Homer/Charlie agree.
- Revise: the idea may belong, but wording, tone, sensitivity, or scope needs work before block creation.
- Park until verified: preserve as intake or production truth, but do not normalize until citations, rights, or public-use decisions are resolved.
- Park: keep out of the next manuscript pass unless a human deliberately promotes it.
- Reject: do not create the block.

## Recommended Defaults

| Proposed block ID | Type | Paired Homer block | Proposed role | Recommended default | Why | Human decision | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `charlie-values-winnemucca-promise-reaction` | `charlie-reflection` | `homer-values-tip-nevada-promise` | Sidebar or short episode narration beat about trust becoming proof when the Winnemucca promise is kept. | approve | Directly supports the Episode 5 trust spine, uses no outside source claim, and can be reviewed as Charlie reflection without disturbing Homer baseline prose. | TBD | Confirm final wording and whether it is book sidebar, episode narration, or both. |
| `charlie-values-trust-through-dependability-bridge` | `charlie-reflection` | `homer-values-tip-nevada-promise` | Bridge from "trusted leaders are followed" to dependable follow-through. | approve | Low-risk support block that makes the leadership principle explicit while staying close to the Tip story. | TBD | Keep as Charlie reflection unless external trust frameworks are introduced. |
| `charlie-values-forgive-and-fire-standards-reflection` | `charlie-reflection` | `homer-values-milk-down-the-drain` | Reflection on forgiving mistakes while keeping standards. | approve | Cleanly supports the milk story and the Episode 5 standards question without requiring citation or clip clearance. | TBD | Best treated as sidebar/reflection rather than rewritten Homer prose. |
| `charlie-values-roy-coaching-before-removal-reflection` | `charlie-reflection` | `homer-values-milk-down-the-drain` | Reflection on coaching first, holding standards, and removing only when required. | approve | Directly serves the Episode 5 leadership application and can remain a Charlie/Homer application block without outside-source dependency. | TBD | Keep separate from Jocko/Dichotomy reference until citation status is resolved. |
| `charlie-values-tip-kindred-spirit-reaction` | `charlie-reflection` | `homer-values-tip-nevada-promise` | Personal/family-memory reaction to Tip and the household cadence around him. | revise | It may be warm and useful, but it is more personal and tonal than the core trust blocks. It needs human review before canonicalizing. | TBD | Decide whether this is book sidebar, episode-only reaction, or parked family color. |
| `charlie-values-neurodivergence-follow-through-reflection` | `charlie-reflection` | `homer-values-tip-nevada-promise` | Optional reflection on executive-function friction and follow-through. | revise | Sensitive personal framing needs careful tone and consent before it becomes manuscript truth. | TBD | Approve only if the final wording is precise, useful, and not overexposed. |
| `research-values-speed-of-trust-bridge` | `research-bridge` | `homer-values-tip-nevada-promise` | Trust tax/friction bridge tied to Stephen M. R. Covey's *The Speed of Trust*. | park until verified | Useful, but it becomes false authority if citation and framing are not checked. | TBD | Verify source, quote/paraphrase boundary, and whether it belongs in book or episode prep. |
| `research-values-watson-education-quote` | `quote-context` | `homer-values-milk-down-the-drain` | Watson/IBM costly-mistake anecdote paired with restored confidence. | park until verified | The anecdote and quote wording need verification before public or manuscript use. | TBD | Do not normalize until citation and exact wording are confirmed. |
| `research-values-dichotomy-firing-bridge` | `research-bridge` | `homer-values-milk-down-the-drain` | Jocko/*The Dichotomy of Leadership* bridge around liked leaders who cannot meet the standard. | park until verified | The idea may support the Roy/coaching section, but source details and usage need checking. | TBD | Keep the Charlie coaching reflection independent from this source claim. |
| `clip-values-samwise-candidate` | `clip-candidate` | `homer-values-tip-nevada-promise` | Clip or pop-culture cue for trust, loyalty, and follow-through. | park until verified | Clips are not cleared public material and should stay in show-prep review until rights/public-use decisions are clear. | TBD | Clarify whether this is a real clip, conversational shorthand, or replaceable metaphor. |
| `clip-values-nate-candidate` | `clip-candidate` | `homer-values-milk-down-the-drain` | Clip or cue for mistakes, trust, and restored confidence. | park until verified | Needs rights/citation/public-use decision before any public derivative. | TBD | Keep out of clean book prose. |
| `clip-values-roy-firing-candidate` | `clip-candidate` | `homer-values-milk-down-the-drain` | Clip or cue for coaching, standards, and removal. | park until verified | Needs rights/citation/public-use decision before any public derivative. | TBD | Keep separate from the Charlie coaching-before-removal block. |
| `production-values-team-development-note` | `production-note` | `homer-values-milk-down-the-drain` | Internal team-development prompt. | park | Production notes do not belong in clean manuscript prose unless deliberately rewritten into a publishable block later. | TBD | Preserve in production/intake context only. |
| `production-values-diversity-note` | `production-note` | `homer-values-milk-down-the-drain` | Internal diversity prompt. | park | The semantic job is not clear enough for normalization, and raw production prompts should not leak into manuscript truth. | TBD | Re-scope later as Charlie reflection only if Homer/Charlie want it. |
| `production-values-radio-dead-cow-fragment` | `production-note` | None yet | Parked responsibility/radio/dead-cow fragment near the Episode 5/6 boundary. | park | The boundary is unresolved and the fragment is not ready as clean prose or a stable story unit. | TBD | Decide later whether it belongs in Episode 6 or a later farm-responsibility section. |

## Why These Defaults

- Approve low-risk Charlie reflection blocks that directly support the Episode 5 spine.
- Revise personal or sensitive Charlie material before canonicalizing it.
- Park research until citations, quote wording, and source framing are checked.
- Park clips until rights, citation, and public-use decisions are clear.
- Park production notes because they do not belong in clean manuscript prose.
- Keep the Episode 6 boundary clean by not pulling radio, dead-cow, or broader trust/consistency fragments into Episode 5 yet.

## If Defaults Are Accepted

The next narrow manuscript edit would be:

- Add four approved Charlie/reflection blocks only:
  - `charlie-values-winnemucca-promise-reaction`
  - `charlie-values-trust-through-dependability-bridge`
  - `charlie-values-forgive-and-fire-standards-reflection`
  - `charlie-values-roy-coaching-before-removal-reflection`
- Preserve existing Homer baseline prose.
- Do not add research blocks yet.
- Do not add clip blocks yet.
- Do not add production-note blocks yet.
- Do not update arrangement YAML until new block IDs exist and validate.
- Leave Episode 6 untouched.

## Human Review Checklist

- [ ] Episode 5 spine approved.
- [ ] Title/slug deferred or selected.
- [ ] Four default Charlie blocks approved.
- [ ] Two Charlie blocks marked revise.
- [ ] Research parked.
- [ ] Clips parked.
- [ ] Production notes parked.
- [ ] Radio/dead-cow parked.
- [ ] Episode 6 boundary acknowledged.

## Recommended Next Action

Review this matrix with Homer/Charlie/Chuck. If the defaults are accepted, run a narrow Episode 5 living-manuscript normalization pass that creates only the four approved Charlie/reflection blocks and leaves research, clips, production notes, arrangements, and Episode 6 untouched.
