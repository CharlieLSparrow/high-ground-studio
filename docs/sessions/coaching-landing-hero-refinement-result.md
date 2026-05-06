# Coaching Landing Hero Refinement Result

## Files changed
- `apps/web/src/app/coaching/page.tsx`
- `docs/sessions/coaching-landing-hero-refinement-result.md`

## Hero changes
- Replaced the previous split-panel hero with a full-width banner-style hero section.
- Added a large visual placeholder area sized like a real image region.
- Added layered dark gradient overlays so future hero text remains readable over photography.
- Moved the primary coaching message into the hero overlay area for a more direct landing-page feel.
- Removed secondary hero buttons from the main hero.

## Copy changes
- Updated the hero copy to:
  - eyebrow: `Coaching with Scott Sparrow`
  - headline: `Talk through the next right step.`
  - body focused on clarity, steadiness, and courage
  - donation note focused on pay-what-you-can credentialing-season coaching
- Updated the three context cards to the requested copy.
- Added a final CTA strip with `Ready to talk it through?`

## CTA behavior
- Primary CTA remains `Book a Session`.
- Signed-in users go to `/dashboard?intent=coaching`.
- Signed-out users go through sign-in with callback to `/dashboard?intent=coaching`.
- Team-only shortcut to `/team/coaching-requests` remains available lower on the page, outside the main hero.

## Validation performed
- Ran `pnpm --filter web build`.
- Confirmed no manuscript or book files were modified.
- Confirmed no publish episode files were modified.

## Known limitations
- The hero still uses a placeholder instead of a real Scott coaching image.
- The team shortcut remains a simple text button below the main landing content rather than a dedicated internal utility section.

## Recommended next action
- Replace the placeholder with a real coaching photo and adjust crop/focal positioning against the gradient overlay in production.
