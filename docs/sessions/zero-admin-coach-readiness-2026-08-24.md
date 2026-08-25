# Zero-admin fresh-coach readiness — 2026-08-24

## UX decision

A new coach should not have to finish a profile wizard before scheduling a useful first Session. Quipsly already renders:

- the signed-in coach identity,
- a detected local timezone,
- a sensible 60-minute default,
- an immediately usable scheduling form, and
- a collapsed **Coaching preferences** panel for optional changes.

The acceptance receipt previously reported `coachSetup: false` because it only recognized an explicitly submitted preferences form. That incorrectly penalized the intended zero-admin path and could incentivize adding bureaucracy to make a test green.

## Evidence contract

The fresh-start operation now proves through the rendered phone-width product that:

- the optional preferences panel is visible,
- its state is labeled `automatic`,
- it remains collapsed before first-session scheduling,
- no mandatory coach configuration is required, and
- the coach can schedule, invite, and hand off a private Session with those defaults.

The combined receipt reports `coachSetup: true` only when both `automaticCoachDefaultsRendered` and `mandatoryCoachConfigurationRequired === false` are observed. This means “ready to coach,” not “a setup form was submitted.”

## Verification

- Fresh coaching receipt contract test: 1 passed.
- Fresh rendered start journey: passed with new coach and client accounts, one-time invitation acceptance, exact Session return, client-only isolation, and no horizontal overflow at 390 px.
- The retained start artifact records `automaticCoachDefaultsRendered: true` and `mandatoryCoachConfigurationRequired: false`.

The journey uses the local verification-mail adapter and does not claim real mailbox delivery or minimally instructed human acceptance.
