# Coaching Page Subscription Focus Result

Date: 2026-04-28

What was changed:
- updated the public coaching landing page at `apps/web/src/app/coaching/page.tsx`
- removed the public `Single Session` pricing card
- changed the pricing layout from three columns to two columns for the two subscription offers
- revised the hero copy to frame the page as a subscription-focused public front door
- revised the process copy so it refers to choosing a recurring coaching rhythm instead of a general coaching path
- removed the remaining indirect one-off pricing reference from the monthly plan bullets

What was intentionally not changed:
- no Stripe checkout work
- no internal membership or appointment logic
- no dashboard or team-console behavior
- no content changes outside the public coaching page

Result:
- the public landing page now presents only:
  - `1 Session / Month`
  - `2 Sessions / Month`
- single-session coaching is no longer mentioned on the landing-page experience
- the page still accurately reflects current repo truth: a presentable front door with internal/manual follow-through rather than completed checkout automation
