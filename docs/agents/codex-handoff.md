# Codex Handoff

## First Five Minutes

Read in this order:
- `AGENTS.md`
- `docs/project-context/current-state.md`
- `docs/architecture/system-overview.md`
- `docs/runbooks/local-dev.md`
- `docs/agents/codex-continuity.md`
- `docs/agents/autonomous-codex-operating-mode.md`
- `docs/agents/multi-agent-collaboration.md`
- `docs/coordination/agent-board.md`
- the most recent relevant file in `docs/sessions/`

## Current Repo Truths

- The main app is `apps/web`.
- Team workflows are real and Prisma-backed.
- The coaching page is a public offer/front-door page and sign-in handoff, not a live Stripe checkout funnel.
- Signed-in users request coaching from `/dashboard?intent=coaching`.
- `/dashboard` shows recent coaching requests and converted appointment summaries.
- `/team/coaching-requests` is the internal queue for request management and request-to-appointment conversion.
- Converting a coaching request creates an appointment, marks the request `SCHEDULED`, assigns the coach, links `convertedAppointmentId`, and revalidates dashboard/team routes.
- Coaching donation support is an external pay-what-you-can link via `HGO_COACHING_DONATION_URL`.
- Google Calendar support is generated link-only, not OAuth/API sync.
- Resend email notifications are wired for new coaching requests and are best-effort after the request transaction commits.
- SMS/Twilio notification sending is not wired into the active coaching request flow.
- The episodes route is stabilized with a guarded loader, not a final content architecture.
- Studio `/content-studio` is a private browser-first command surface for
  podcast, book, episode-page, monetization, and coaching project boards. It
  supports JSON handoff packets and manual Prisma-backed server checkpoints
  once the `StudioContentWorkspaceSnapshot` schema change has been applied. It
  does not call providers or publish content.
- Both current production build paths pass.
- The content tree is much larger than the current published surface.
- Codex has approval to commit, push, and deploy independently when a coherent
  slice is verified, documented, and has a known rollback path. See
  `docs/agents/autonomous-codex-operating-mode.md` for the safety stops.

## Files Future Agents Will Commonly Need

Auth and identity:
- `apps/web/src/auth.ts`
- `apps/web/src/lib/server/user-identity.ts`
- `apps/web/src/lib/authz.ts`
- `apps/web/src/lib/content-access.ts`

Data model:
- `prisma/schema.prisma`
- `apps/web/src/lib/prisma.ts`

Team workflows:
- `apps/web/src/app/team/clients/page.tsx`
- `apps/web/src/app/team/clients/actions.ts`
- `apps/web/src/app/coaching/actions.ts`
- `apps/web/src/app/coaching/page.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/team/coaching-requests/page.tsx`
- `apps/web/src/app/team/coaching-requests/actions.ts`
- `apps/web/src/app/team/appointments/page.tsx`
- `apps/web/src/app/team/appointments/actions.ts`
- `apps/web/src/lib/calendar-links.ts`
- `apps/web/src/lib/server/coaching-notifications.ts`
- `apps/web/src/lib/server/email.ts`

Content:
- `apps/studio/src/app/content-studio/page.tsx`
- `apps/studio/src/app/content-studio/content-studio-client.tsx`
- `apps/web/src/app/episodes/[[...slug]]/page.tsx`
- `apps/web/src/lib/source.ts`
- `apps/web/source.config.ts`
- `apps/web/src/lib/site.ts`
- `apps/web/src/lib/reading.ts`

## Current Risk Areas

- The repo contains backup/artifact files that are not authoritative.
- `apps/web/src/lib/server/sms.ts` exists but is a dormant helper in the current coaching workflow; do not document SMS as live without verifying active call sites.
- The content directories can be mistaken for one another unless you explicitly distinguish:
  - `content/publish`
  - `content/_staging`
  - `content/_inbox`

## Default Verification Path

Use both production build paths when you need to verify a meaningful repo change:

```bash
pnpm --filter web build
```

and:

```bash
pnpm --filter web exec next build --webpack
```

If a future failure appears only in one builder, compare it against the recent episodes session notes before changing app code.

## What To Update When You Learn Something Important

If you discover a stable repo truth, update one of:
- `docs/project-context/current-state.md`
- `docs/architecture/*`
- `docs/runbooks/*`
- `docs/workflows/*`
- a new `docs/sessions/*.md` file if it is still an in-flight conclusion

For human-readable release notes on the live site, update the public build
journal with:

```bash
pnpm progress:story:add -- --title "Short title" --summary "What changed"
```
