# Episodes 01-06 OneNote Intake Audit

Date: 2026-05-07

## Purpose

This audit inventories the latest OneNote-exported Season One episode files under `apps/web/content/_inbox/` and classifies their intake value before any living-manuscript or viewer changes.

Raw OneNote files are staging truth, not canonical manuscript truth. They can be fresher than the current living manuscript, but they should not be normalized directly until their Homer baseline, Charlie material, research, clips, and production notes are separated.

## Raw File Inventory

All six expected raw inbox files were found and are already tracked by Git.

| Episode | Raw file | Working title | Production status | Homer baseline | Charlie material | Clips | Research/context | Production notes | Formatting artifacts | More current than existing breakdown? | Confidence | Recommended next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `apps/web/content/_inbox/Episode 1 - Preface.md` | Preface Pilot Episode / Write It Down | Recorded / published in current public set | Yes | Yes, clearly labeled as Charlie's Preface | No obvious clip markers | Franklin quote/context | Minimal | Very few; voices are clearly labeled | No full breakdown file exists; raw is relatively clean and useful for later boundary audit | High | Leave for later packet/public/living-manuscript boundary review. |
| 2 | `apps/web/content/_inbox/Episode 2 - Introduction.md` | It's a metaphor! / Look for Lessons | Recorded / published in current public set | Yes | Yes, clear `Charlie's Part` section | No obvious clip markers | Apophenia, pareidolia, pattern/data framing | Minimal | Checklist markers `1. - [ ]` and `- [ ]` appear inside prose | No full breakdown file exists; raw is useful but has formatting cleanup needs | Medium-high | Later review should remove checklist artifacts before any normalization. |
| 3 | `apps/web/content/_inbox/Episode 3 - Chapter 0.md` | Chapter Zero: In The Beginning | Recorded / published in current public set | Yes | Yes, clear `Charlie's Part` section | No obvious clip markers | Family-history research and `Do you know` scale references | Some alternate-draft structure implied | Duplicate/alternate sections: raw long form followed by formatted sectioned material and repeated headings | No full breakdown file exists; raw is useful but risky because it contains alternate drafts | Medium | Treat as duplicate/alternate-draft intake; do not normalize until source version is selected. |
| 4 | `apps/web/content/_inbox/Episode 4.1 and 4.2 - Chapter 1.md` | The Early Days | Recorded / incorporated into living manuscript | Yes | Yes, explicit Charlie sidebars and close | Mary Poppins and possible story/clip candidates | Flow, Daniel Pink, psychological safety, incentives, self-determination, Shackleton, Sinek, Frankl, Challenger, Just Listen, Charisma Myth | Low | Mostly normalized Markdown headings with sidebars | Yes for comparison purposes, but Episode 4 has already been incorporated from matching intake | Medium-high | Compare against existing living-manuscript incorporation before changing anything. |
| 5 | `apps/web/content/_inbox/Episode 5 - Chapter 2.md` | The Values Toolkit | Recorded | Yes | Yes, extensive inline reactions, trust reflection, and coaching/firing commentary | Samwise, Nate, Roy Firing | J.C. Watts, Speed of Trust, Thomas J. Watson/IBM, Dichotomy of Leadership | Yes | Heavy `==...==`, raw emphasis, production inserts, trailing fragments | Yes; it is richer than the previous Episode 5 breakdown | Medium-high | Highest-priority normalization candidate after human review of the structured classification. |
| 6 | `apps/web/content/_inbox/Episode 6 - Chapter 2 Continued.md` | Trust Through Consistency | Prepped / recording next | Yes | Yes, extensive trust/consistency reflection and draft closing material | Rocky, Joe vs the Volcano, Joe Quitting, McFarland USA, Miracle on Ice, Sound of Music | Mayer/Davis/Schoorman trust model, Jay Shetty, Toyota andon, Phillippa Lally habit research | Yes | Heavy `==...==`, `//` comment, malformed table fragment, duplicate/alternate drafts, unresolved questions | Yes; it is richer than the previous Episode 6 breakdown | Medium | Preserve and classify now; review after recording before final normalization. |

## Episode-By-Episode Summary

### Episode 1

Episode 1 is relatively clean because Homer/Charlie preface voices are clearly labeled. It has preserved Homer preface material and a clearly labeled Charlie preface. It does not need an Episode 5/6-style classification pass right now.

Treatment:

- Keep as staging truth.
- Use later for packet/public/living-manuscript boundary review.
- Do not rewrite or normalize in this pass.

### Episode 2

Episode 2 has a clear Charlie section but also checklist/formatting artifacts. The `1. - [ ]` and `- [ ]` markers appear to be OneNote/task-list residue rather than intentional manuscript structure.

Treatment:

- Preserve the raw file.
- Later cleanup should remove checklist artifacts before normalization.
- Charlie's pattern/apophenia material should be classified before any book or episode derivative.

### Episode 3

Episode 3 appears to contain both original/raw material and more formatted sectioned material. It includes duplicate headings and an alternate-draft shape, followed by a Charlie section.

Treatment:

- Do not normalize directly.
- First decide which source layer is baseline, which layer is a formatted rewrite, and whether both need preservation.
- Handle duplicate/alternate-draft material carefully so source provenance is not lost.

### Episode 4

Episode 4 is closest to normalized already. It has clear Markdown headings, explicit Charlie sidebars, and a chapter close. The current living manuscript already includes Chapter One split Homer blocks plus eight Episode 4 Charlie draft blocks.

Treatment:

- Compare the raw OneNote file against existing living-manuscript incorporation before changing anything.
- Do not duplicate the Pillow Incident material; current incorporation intentionally references the Chapter Two block in the podcast arrangement.
- Keep future changes focused on verification and missing cues.

### Episode 5

Episode 5 is the highest-priority normalization candidate because it is recorded and rich with values/trust material, clips, and Charlie interjections.

The raw file includes:

- Homer baseline candidates for Tip/Winnemucca, milk down the drain, forgiveness, firing, and standards.
- Charlie inline candidates around Tip, trust, neurodivergence, reliability, and firing.
- Research/field-note candidates around J.C. Watts, *The Speed of Trust*, IBM/Thomas J. Watson, and *The Dichotomy of Leadership*.
- Clip candidates: Samwise, Nate, Roy Firing.
- Production notes: "Scott gets real...", team development inject, diversity inject, radio/dead-cow fragments.

Treatment:

- Use `episode-05-values-toolkit.md` as the structured intake layer.
- Do not normalize into the living manuscript until a human confirms which Charlie material is book prose, sidebar, episode-only reaction, or production note.
- Keep clip markers as clip candidates, not clean book prose.

### Episode 6

Episode 6 should be preserved and classified, but final normalization may wait until after the recording if that is safer.

The raw file includes:

- Homer baseline candidates for farm discipline, habits, grudges, communication, flashlight/listening, canal-company time, early employment, autonomy, and correction.
- Charlie material around trust repair, consistency systems, narrative/story-making, Joe Versus the Volcano, closure after trust ruptures, and sidekick leadership.
- Research/field-note candidates around the Mayer/Davis/Schoorman trust model, Jay Shetty/Wednesday Rule, Toyota andon, and Phillippa Lally habit formation.
- Clip candidates: Rocky, Miracle on Ice/Herbies, Joe vs the Volcano, Joe Quitting, Sound of Music, McFarland USA.
- Production artifacts: malformed table, `//` note, duplicate/alternate Charlie drafts, and unresolved questions.

Treatment:

- Use `episode-06-trust-through-consistency.md` as the structured intake layer.
- Preserve current prep truth.
- Re-review after recording before deciding whether this is a clean Episode 6 or part of a rebuilt Episode 5/6 arc.

## Formatting Patterns Found

- `==...==` appears heavily in Episodes 5 and 6 as raw OneNote/export highlighting.
- Checklist markers appear in Episode 2.
- Episode 3 includes duplicated/alternate sections and repeated headings.
- Episode 4 is relatively clean Markdown with sidebars.
- Episode 6 includes a malformed table fragment and `//` comment.
- Episodes 5 and 6 contain production notes mixed directly into prose.

## Classification Challenges

- Charlie material shifts between inline reaction, sidebar reflection, research bridge, production note, and possible clean prose.
- Clip labels are useful production anchors but are not rights-cleared public material.
- Episode 5 and Episode 6 overlap around trust, consistency, responsibility, and Chapter Two values.
- Some raw material is recorded/prepped truth but not yet canonical manuscript structure.
- Some research and quote claims need verification before public-facing derivatives.

## Recommended Treatment By Episode

- Episode 1: leave intact; later boundary audit.
- Episode 2: leave intact; later remove checklist artifacts and classify Charlie pattern material.
- Episode 3: leave intact; first resolve duplicate/alternate draft handling.
- Episode 4: compare against existing incorporation before changing living manuscript blocks.
- Episode 5: use the updated structured intake file as the next living-manuscript normalization candidate.
- Episode 6: preserve and classify now; re-review after recording before final normalization.

## Risks If We Normalize Too Quickly

- Charlie production notes could leak into clean book prose.
- Clip candidates could be mistaken for cleared public assets.
- Duplicate Episode 3 material could create conflicting canonical source text.
- Episode 5 and 6 boundaries could be locked before the recorded Episode 6 shape is clear.
- Research claims could be over-polished before citation verification.
- The content engine could optimize around stale or provisional episode splits instead of actual writing/recording needs.

## Recommended Next Book & Episodes Action

Review the updated Episode 5 structured intake with Homer/Charlie, then run a narrow Episode 5 living-manuscript normalization pass that preserves Homer baseline, keeps Charlie/support blocks separate, and leaves Episode 6 untouched until after recording review.
