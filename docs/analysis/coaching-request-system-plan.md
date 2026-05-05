# Coaching Request System Plan

## Current Repo Findings

### Identity and client records
- `prisma/schema.prisma` already has a canonical `User` model with:
  - `primaryEmail`
  - optional `name` / `image`
  - marketing preference fields: `newsletterOptIn`, `announcementsOptIn`
  - one-to-one `clientProfile`
  - role rows through `UserRole`
- `ClientProfile` is intentionally thin right now:
  - `id`
  - `userId`
  - `displayName`
  - `notes`
- `apps/web/src/lib/server/user-identity.ts` already supports pre-provisioning and reuse of users via:
  - `upsertPreprovisionedUser(...)`
  - alias email support
  - optional client-profile creation
- Practical implication:
  - the repo already knows how to create or reuse a client-facing user without inventing a second identity system.

### Roles and access control
- `AppRole` currently includes:
  - `OWNER`
  - `TEAM_SCHEDULER`
  - `COACH`
  - `CLIENT`
- `apps/web/src/lib/authz.ts` exposes:
  - `canAccessInternalContent`
  - `canManageClients`
  - `canManageAppointments`
  - `canManageMemberships`
- Internal team pages are gated by `/team/layout.tsx`, which:
  - redirects unauthenticated users to sign-in
  - hides internal routes with `notFound()` for non-team users
- Practical implication:
  - a coaching-request queue can safely live under `/team` without introducing a new authorization pattern.

### Appointment system
- `Appointment` already exists in Prisma and is a real scheduled-event model, not a lead/request model.
- Required/meaningful appointment fields include:
  - `clientUserId`
  - `createdByUserId`
  - `scheduledStart`
  - `scheduledEnd`
  - `status`
  - `locationType`
  - optional `coachUserId`, `notes`, `clientNotes`, `locationDetails`
- `apps/web/src/app/team/appointments/page.tsx` + `actions.ts` already provide staff scheduling workflows for:
  - create
  - update
  - cancel
  - complete
- Practical implication:
  - unscheduled intake should **not** be forced into `Appointment`. The current schema assumes a real scheduled window.

### Client / member surfaces
- `apps/web/src/app/team/clients/page.tsx` and `actions.ts` already support:
  - pre-provisioning clients
  - promoting existing users to clients
  - granting memberships
  - seeding membership plans
- `apps/web/src/app/dashboard/page.tsx` is the existing signed-in member home.
  - It already shows memberships and upcoming appointments.
  - It is the most natural place to surface coaching-request status for clients.
- Practical implication:
  - a separate `/member` route is not required for MVP. Extending `/dashboard` is lower-risk unless brand/navigation demands a new alias later.

### Public coaching page state
- `apps/web/src/app/coaching/page.tsx` is currently a polished public page, but it still assumes priced rhythms:
  - `$57`
  - `$97`
  - “choose this rhythm” CTA
- `apps/web/src/lib/server/membership-plan-catalog.js` also still encodes fixed-price plan catalog values.
- Practical implication:
  - public coaching copy and the request flow should be decoupled from the existing membership-plan catalog for this credentialing phase.

### Existing payment / donation / notification infrastructure
- I did **not** find an active Stripe integration, donation flow, Twilio integration, or mailer utility currently wired into app code.
- There is an old experimental scheduling stub:
  - `apps/web/src/actions/scheduleAction.ts`
  - `apps/web/src/components/schedule/BookingForm.tsx`
- That code is not integrated with the current Prisma appointment system and should be treated as legacy/experimental, not as the foundation for the new funnel.
- `pnpm-lock.yaml` references `nodemailer`, but no current mailer utility surfaced in active app code during this audit.
- Practical implication:
  - MVP should assume **internal queue first**, with notification infrastructure added only if a real implementation already exists or is added deliberately later.

## Recommended Public Routes
- `/coaching`
  - Keep as the marketing/explanation + request-entry page.
  - Replace fixed-price rhythm selection with a donation-supported request form during credentialing.
- `/coaching/requested`
  - Recommended lightweight thank-you / next-steps route after successful submission.
  - Purpose: avoid ambiguity after POST, give clear expectations, and reduce the need to immediately rely on dashboard state.
- `/dashboard`
  - Recommended existing member/client home for authenticated users.
  - Add coaching request status here rather than inventing a second member area in Phase 1.
- Optional later alias: `/member`
  - Only if branding/navigation needs a cleaner member-facing label.
  - For MVP, this is unnecessary duplication.

## Recommended Internal Routes
- Keep `/team/appointments` for real scheduled appointments only.
- Add `/team/coaching-requests`.
  - This should be the staff intake queue for unscheduled requests.
  - It should show request details, status, assigned coach, and conversion state.
- Recommended queue actions:
  - mark new / contacted / scheduled / closed
  - assign coach
  - create appointment from request
  - link resulting appointment back to the request
- Conversion pattern:
  - staff opens a coaching request
  - staff schedules a real appointment using the existing appointment workflow
  - request stores `convertedAppointmentId`
- Practical implication:
  - request intake and scheduled appointment management stay related, but they do not collapse into the same model.

## Recommended Data Model

### New model: `CoachingRequest`
A separate model is the right move. An unscheduled request has a different lifecycle, different validation, and different audit meaning from a real appointment.

### Recommended enums
```prisma
enum ContactPreference {
  EMAIL
  PHONE_CALL
  TEXT
}

enum CoachingRequestStatus {
  NEW
  CONTACTED
  SCHEDULED
  CLOSED
  DECLINED
}
```

### Recommended Prisma model
```prisma
model CoachingRequest {
  id                    String                @id @default(cuid())
  clientUserId          String
  preferredContactMethod ContactPreference
  email                 String
  phone                 String?
  availabilityNotes     String?
  coachingGoals         String
  contactConsent        Boolean
  status                CoachingRequestStatus @default(NEW)
  assignedCoachUserId   String?
  convertedAppointmentId String?
  internalNotes         String?
  createdAt             DateTime              @default(now())
  updatedAt             DateTime              @updatedAt

  clientUser            User                  @relation("CoachingRequestClient", fields: [clientUserId], references: [id], onDelete: Cascade)
  assignedCoachUser     User?                 @relation("CoachingRequestCoach", fields: [assignedCoachUserId], references: [id], onDelete: SetNull)
  convertedAppointment  Appointment?          @relation(fields: [convertedAppointmentId], references: [id], onDelete: SetNull)

  @@index([clientUserId, createdAt])
  @@index([status, createdAt])
  @@index([assignedCoachUserId, status])
  @@unique([convertedAppointmentId])
}
```

### Recommended related model updates
- `User` should likely gain:
  - `coachingRequests` relation for requests created by that client
  - `assignedCoachingRequests` relation for requests assigned to a coach
- `Appointment` does **not** need structural changes beyond optional back-reference if desired later.
- Keep request `email` and `phone` denormalized on the request row.
  - Reason: intake contact details are part of the submission record and may differ from the user’s future canonical identity state.

### Why separate request contact info from `User`
- It preserves intake truth at the moment of submission.
- It avoids prematurely bloating `User` with one-off lead form fields.
- It allows the app to evolve toward consent/history later.

## Public Form Behavior

### Form fields
Recommended required fields:
- `name`
- `email`
- `preferredContactMethod`
- `coachingGoals`
- `contactConsent`

Recommended optional fields:
- `phone`
- `availabilityNotes`

### Validation rules
- `name`: non-empty, trimmed, reasonable max length
- `email`: valid email, lowercased before identity lookup/upsert
- `phone`: optional, but required if preferred contact method is `PHONE_CALL` or `TEXT`
- `preferredContactMethod`: must be one of the enum values
- `coachingGoals`: non-empty, minimum useful length threshold
- `availabilityNotes`: optional, max length bounded
- `contactConsent`: must be checked

### Spam guardrails
MVP-safe guardrails:
- server-side validation only, no client trust
- honeypot field
- submission rate limiting later if abuse appears
- message length caps to avoid giant payload abuse
- avoid open email/SMS side effects in the first implementation

### Consent wording
Recommended consent text:
> I agree that High Ground Odyssey may contact me about this coaching request using the method I selected above.

If text messaging is later added, expand wording to explicitly cover SMS consent and carrier-message expectations.

## Homer Notification Strategy

### MVP
- Internal queue only: `/team/coaching-requests`
- This is the safest first implementation because it avoids fake notification plumbing and secret-management drift.

### Near-term if existing email infra appears or is added deliberately
- Email notification to one internal address or distribution list
- Trigger on new request creation
- Keep implementation narrow and auditable

### Later
- SMS notification via Twilio or equivalent
- Store secrets in env vars / deployment secret manager only
- Add explicit contact/notification preferences for staff if the workflow grows

### Recommendation
Do **not** add SMS in the first implementation unless a real, already-supported SMS pipeline exists. Nothing in the current repo suggests that it does.

## Member Page Strategy
Use the existing `/dashboard` for MVP.

### Additions to dashboard
- coaching request status card
- request submission timestamp
- assigned coach if available
- scheduled appointment link/summary if converted
- donation/payment info block

### Suggested sections
- `Coaching Request`
  - status
  - preferred contact method
  - latest next-step message
- `Upcoming Sessions`
  - reuse existing appointment rendering
- `Support This Coaching`
  - donation/pay-what-you-can explanation
  - placeholder payment/donation action until a real link exists

### Why `/dashboard` instead of a new client portal route
- It already exists.
- It already requires authentication.
- It already surfaces the right adjacent nouns: memberships and appointments.
- It avoids building parallel member navigation too early.

## Donation / Pay-What-You-Can Wording

### Headline
Coaching support during a credentialing season

### Short explanation
These sessions are part of an active coaching credentialing process. There is no fixed fee right now. After a session, you are invited to give whatever amount feels appropriate and sustainable for you.

### Form intro
If you would like to begin a coaching conversation, tell us a little about what you are navigating and how you would prefer to be contacted. We will follow up personally about fit, scheduling, and next steps.

### Donation explanation
During this phase, coaching is donation-supported rather than fixed-rate. If a session is helpful, you may donate afterward in whatever amount feels fair and manageable. That allows the session to count toward paid coaching hours without forcing a rigid price before the work begins.

### Post-submit message
Thank you. Your coaching request is in. We will review it personally and follow up using the contact method you selected.

### Member-page donation block
This coaching relationship is currently donation-supported. After each session, you may give an amount that feels appropriate and sustainable for your situation. If a donation is made, the session counts toward paid coaching hours in this credentialing phase.

## Implementation Phases

### 1. Schema + request creation
- add `CoachingRequest` model + enums
- add public server action/form handling
- create or reuse `User` + `ClientProfile`
- create `CoachingRequest`

### 2. Public coaching page
- replace fixed-price CTA path with request-first flow
- add credentialing/donation-supported copy
- add thank-you route

### 3. Internal request queue
- add `/team/coaching-requests`
- list/filter incoming requests
- assign coach / update status / add internal notes

### 4. Member page
- show request status on `/dashboard`
- show appointment conversion linkage

### 5. Donation/payment link
- add a real donation target or payment link once business handling is decided
- keep wording truthful until then

### 6. SMS notification
- only after queue + member flow are stable
- only with explicit infrastructure and consent handling

## Risks / Guardrails
- **SMS consent**: do not imply text messaging without explicit consent language and infrastructure.
- **Avoiding fake appointment dates**: unscheduled requests must not be shoved into `Appointment`.
- **Public repo / secrets**: no Twilio, Stripe, or email secrets belong in code or docs.
- **Spam**: public request forms invite abuse; start with honeypot + bounded inputs.
- **Payment phrasing**: do not imply checkout or automated billing if none exists.
- **Auth / account creation ambiguity**: decide whether public form submitters are silently pre-provisioned users who later sign in with Google, or whether they are required to authenticate at submission time. Current repo patterns suggest pre-provision + later sign-in is viable.
- **Production migration requirement**: Prisma schema changes and deployment migration are part of the real rollout, not an afterthought.
- **Membership-plan drift**: current fixed-price `MembershipPlan` catalog should not leak into the credentialing-phase public request UI without explicit business review.

## Recommended Next Codex Prompt
Use this prompt for Phase 1:

```text
You are Codex working inside my local `high-ground-studio` repo.

Goal:
Implement Phase 1 of the coaching request system:
- Prisma schema for `CoachingRequest`
- public coaching request form on `/coaching`
- internal coaching request queue at `/team/coaching-requests`
- request creation should create or reuse the client `User` / `ClientProfile`
- do not add SMS or payment integrations yet

Constraints:
- Do not force unscheduled requests into `Appointment`
- Do not touch manuscript/book files
- Do not touch publish episode files
- Do not add dependencies unless absolutely necessary
- Keep `/dashboard` unchanged in this pass unless needed for a minimal post-submit link

Implementation requirements:
1. Update `prisma/schema.prisma` with:
   - `ContactPreference`
   - `CoachingRequestStatus`
   - `CoachingRequest`
   - relations back to `User`
2. Add request creation server action(s)
3. Update `/coaching` to:
   - replace fixed-price CTA path with donation-supported coaching request copy
   - include a form for:
     - name
     - email
     - phone
     - preferred contact method
     - availability notes
     - coaching goals
     - contact consent
4. On submit:
   - create or reuse a user/client profile
   - create a coaching request row
   - redirect to a simple success page or authenticated next-step page
5. Add `/team/coaching-requests`:
   - team-gated under the existing `/team` layout
   - list requests with status, contact info, goals preview, assigned coach, and created date
   - no scheduling conversion UI yet beyond placeholder affordance if needed
6. Keep the wording warm and legitimate:
   - no fixed fee during credentialing phase
   - donation-supported / pay-what-you-can after sessions
   - do not sound spammy

Validation:
- run Prisma/client generation or the repo’s normal Prisma workflow if needed
- run `pnpm --filter web build`
- report exact failures if any
- confirm no unrelated files were modified

Git behavior:
- commit only scoped changes
- do not stage `.DS_Store`
- commit with:
  `app: add coaching request intake flow`
- push to `main`
```
