# Shared source-clock listening moments

Date: 2026-08-07

Status: production-shaped review-compression slice

External mutation: none

## Outcome

Quipsly's Session review no longer asks a person to replay the same nearby
source context once for transcript uncertainty, again for an audible-event
detector, again for Dialogue Repair, and again for an edit suggestion. The
existing authority-specific records remain unchanged, but exact ranges on the
same immutable source are projected into bounded **shared listening moments**.

This is an attention projection, not another evidence table. It writes no
review, changes no media, merges no confidence score, and grants no treatment,
edit, mastering, promotion, delivery, or publication authority.

## Research decision

Professional audio products make automation useful when the change remains
inspectable:

- Auphonic's editor overlays machine-generated cut and denoise regions on input
  and output waveforms, lets a person adjust, disable, compare, undo, and
  reprocess them, and exposes multitrack algorithm regions instead of hiding
  the operation. [Auphonic Editor](https://auphonic.com/help/web/auphoniceditor.html)
- Adobe Premiere runs speech enhancement in the background with visible
  progress and retains a Mix Amount control between enhanced and original
  audio. Its repair guidance explicitly says the proper reduction depends on
  acceptable damage and requires reviewing the result.
  [Enhance Speech](https://helpx.adobe.com/premiere/desktop/add-audio-effects/adjust-volume-and-levels/enhance-speech.html) and
  [Repair dialogue](https://helpx.adobe.com/in/premiere/desktop/add-audio-effects/adjust-volume-and-levels/repair-dialogue.html)
- iZotope RX separates purpose-built Mouth De-click, De-click, De-bleed,
  De-plosive, De-hum, Dialogue Isolate, and repair-assistant tools. That
  reinforces Quipsly's existing distinction between a bounded defect, a
  cross-track relationship, and whole-program mastering.
  [RX features](https://www.izotope.com/en/products/rx/features)
- ITU-R BS.1770-5 and EBU R128 define interoperable loudness and true-peak
  measurement. They support Quipsly's objective measurements, but neither
  turns a measurement into proof that a repair sounds better.
  [ITU-R BS.1770-5](https://www.itu.int/rec/R-REC-BS.1770-5-202311-I/en) and
  [EBU loudness guidance](https://tech.ebu.ch/loudness/)

The Quipsly opportunity is to combine this inspectability with a stronger
evidence graph: one source-clock moment can carry several preserved reasons,
each returning to its own canonical review surface.

## Projection contract

The deterministic projector:

1. retains the existing per-authority cap and consequence ranking;
2. groups only records bound to the same room, media asset, and immutable
   source identity;
3. adds two seconds of context around each exact range;
4. joins nearby context only when the gap is at most 1.5 seconds and the final
   moment remains no longer than 25 seconds;
5. caps a single unusually long preview at 25 seconds, preserves its complete
   exact range, and tells the reviewer to finish on the authority surface;
6. preserves every original item, confidence label, boundary, reason, and
   direct Transcript, Audio Studio, or Studio Editor locator; and
7. estimates a source-review budget from one shared context pass plus bounded
   decision time.

The budget explicitly excludes matched A/B, full-mix comparison, proof-listen,
and downstream editing time. It is a deterministic workload estimate, not
telemetry about how long a person listened or proof that audio reached human
ears.

## UX

The Session card now leads with:

- high- and ordinary-review signal counts;
- number of bounded shared listening moments;
- an estimated source-review budget; and
- duplicate context seconds avoided when more than one authority points at the
  same moment.

Selecting a moment plays its combined protected source context. The adjacent
panel retains a separate card for every authority, including its confidence
semantics, safety boundary, reason for ranking, and exact deep links. Subsecond
source ranges display tenths instead of collapsing a short defect into a
misleading whole-second label.

## Verification and honest gate

- Model and component suites cover same-source clustering, cross-source
  refusal, preservation of every evidence item, the 25-second moment bound,
  attention-budget savings, empty-state honesty, accessibility labels, and
  exact deep links.
- The complete Session directory passes 147 tests across 21 suites, with the
  guarded database integration suite skipped in the ordinary test run.
- The guarded retained-data operation separately passes against
  `retained-coaching-follow-up-20260731`. Its one promoted source currently
  projects two unresolved audible-event signals into one 15-second moment
  instead of an estimated 24 seconds of separate review, avoiding nine seconds
  of duplicate context without discarding either signal.
- Quipsly typecheck and the production Next.js build pass.
- The in-app browser rejected the retained localhost Session under its URL
  policy during the preceding operated pass. This slice therefore does not
  claim a live human listen, repair judgment, or production deployment.
- The next real-work gate is to open a retained High Ground Odyssey or coaching
  source, compare the projected budget with actual review time, and record a
  genuine authority-specific decision after listening. A matched A/B or
  program-mix review remains a separate step.
