# Company Support Requests

Date: 2026-05-07

## Purpose

This deploy note covers the public company family support page at:

- `/support/company-family`

It includes:

- an external family support contribution link
- a public contact form for lodging/support coordination
- internal email notification to company support coordinators

## Database Change

This feature adds a Prisma-backed `CompanySupportRequest` model.

Before running the app against an environment that should accept these
requests:

```bash
pnpm db:generate
pnpm db:push
```

For production, run `pnpm db:push` in the production environment after
reviewing the schema change.

## Required Environment Variables

- `HGO_COMPANY_FAMILY_SUPPORT_URL`
- `RESEND_API_KEY`
- `HGO_EMAIL_FROM`
- `HGO_SITE_URL`

Notes:

- `HGO_COMPANY_FAMILY_SUPPORT_URL` should be the external giving page URL.
- `HGO_SITE_URL` is used to build internal email links back to the public
  support page.
- If email env vars are missing, form submission still succeeds, but internal
  notification email will not send.

## Validation

Recommended verification after deploy:

1. Open `/support/company-family`.
2. Confirm the support button appears only when
   `HGO_COMPANY_FAMILY_SUPPORT_URL` is configured.
3. Submit a test support request.
4. Confirm the success message appears.
5. Confirm the request is stored in the database.
6. Confirm internal notification email is delivered if email env vars are set.
