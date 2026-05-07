# Coaching Page Wording Layout Pass Result

Date: 2026-05-07

## Files Changed

- `apps/web/src/app/coaching/page.tsx`
- `docs/sessions/coaching-page-wording-layout-pass-result.md`

## Copy Changes

- Updated public-facing coaching identity language from Scott to Homer on the `/coaching` page.
- Changed the hero eyebrow to `Coaching with Homer`.
- Changed the hero headline to `Find your footing.`
- Replaced the hero body copy with language centered on finding clarity and a next move the user can stand on.
- Updated the hero contribution note to:
  - clarify donation-supported coaching
  - keep the amount flexible
  - reference Homer credentialing hours
- Updated the three supporting cards to:
  - `What to bring`
  - `What happens next`
  - `Donation-supported`
- Updated the final CTA strip to:
  - eyebrow `Ready when you are`
  - heading `Start with a simple conversation.`

## Layout Changes

- Added a compact three-step row directly below the hero.
- Steps:
  - `Request a session`
  - `Homer follows up personally`
  - `Talk it through and find your footing`
- Kept the hero image, overlay, CTA placement, and overall page structure intact.

## Validation Performed

- Ran `pnpm --filter web exec next build --webpack`.
  - Result: passed.
- Ran `pnpm --filter web exec tsc --noEmit`.
  - Initial standalone run failed because `.next/types` references were stale/missing before the webpack build refreshed them.
  - Reran `pnpm --filter web exec tsc --noEmit` after the webpack build.
  - Result: passed.
- Confirmed no manuscript/book files were modified.
- Confirmed no publish episode files were modified.

## Known Limitations

- The rest of the product still uses Scott language in other routes and workflows where this pass did not intentionally make changes.
- The three-step row is intentionally modest and static; it is not interactive or personalized.

## Recommended Next Action

- Do one visual QA pass on `/coaching` across desktop and mobile to confirm the new copy cadence and the three-step row spacing feel balanced against the hero image treatment.
