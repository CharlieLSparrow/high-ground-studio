# Company Family Support Page Result

Date: 2026-05-07

## Files Changed

- `apps/web/src/app/support/company-family/page.tsx`
- `apps/web/src/app/support/company-family/actions.ts`
- `apps/web/src/lib/server/company-support-notifications.ts`
- `prisma/schema.prisma`
- `.env.example`
- `docs/runbooks/local-dev.md`
- `docs/deploy/company-support-requests.md`
- `docs/sessions/company-family-support-page-result.md`

## Route Created

- Public route: `/support/company-family`

Current page behavior:

- quiet public support page
- family support contribution section
- public lodging/support contact form
- placeholder photo section for company images
- not linked from main nav in this pass

## Env Var Required

- `HGO_COMPANY_FAMILY_SUPPORT_URL`

When configured:

- the hero `Support the Family` button opens the external giving page

When missing:

- no broken link is shown
- the page shows `The family support link will be added soon.`

## Form Behavior

- Server action: `submitCompanySupportRequestAction`
- Fields:
  - name
  - email
  - phone
  - preferred contact method
  - support type
  - note
  - honeypot `company`
- Honeypot submissions redirect quietly to success.
- Valid requests are stored in Prisma `CompanySupportRequest`.
- Success redirect:
  - `/support/company-family?support=requested`
- Error redirect:
  - `/support/company-family?error=...#request-help`

## Notification Behavior

- Internal notifications use `apps/web/src/lib/server/company-support-notifications.ts`.
- Recipients are active users with roles:
  - `OWNER`
  - `TEAM_SCHEDULER`
  - `COACH`
- Notifications use the existing shared Resend email helper.
- If recipients are missing or email env vars are missing, the request still
  succeeds and the issue is logged.

## Prisma Schema Changed

- Yes.
- Added `CompanySupportRequest`.
- Manual follow-up required:
  - `pnpm db:generate`
  - `pnpm db:push`

## Validation Performed

- Ran `pnpm db:generate`.
- Ran `pnpm --filter web exec next build --webpack`.
  - Result: passed.
- Ran `pnpm --filter web exec tsc --noEmit`.
  - Initial standalone run failed before `.next/types` existed.
  - Reran after webpack build refreshed `.next/types`.
  - Result: passed.
- Confirmed no manuscript/book files were modified.
- Confirmed no publish episode files were modified.
- Confirmed no coaching page files were modified.

## Known Limitations

- Support contribution link is external.
- No admin dashboard for support requests yet.
- No slideshow images exist yet.
- No moderation workflow exists yet.
- No public naming is included until family-approved wording is provided.

## Recommended Next Action

- Add the external support URL in the production environment, run the Prisma
  schema push in the target environment, and do one live submission test to
  confirm the request save path and internal email notification both work.
