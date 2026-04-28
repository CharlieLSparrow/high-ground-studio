# Env Example Plan

Date: 2026-04-27

Scope:
- Verify actual env-var usage from source.
- Add a checked-in `.env.example`.
- Align the narrow setup docs with the new example file.

Verified source usage:
- `DATABASE_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `AUTH_SECRET`
- `NEXTAUTH_SECRET`
- `HGO_OWNER_EMAILS`
- `HGO_TEAM_SCHEDULER_EMAILS`
- `HGO_COACH_EMAILS`
- `ENABLE_EPISODES_FUMADOCS`

Plan:
1. Create `.env.example` using only the variables actually used by the current repo.
2. Group variables by purpose and mark transitional/optional values inline.
3. Update `AGENTS.md` and `docs/runbooks/local-dev.md` to reference `.env.example` and clarify the `AUTH_SECRET` vs `NEXTAUTH_SECRET` reality.
