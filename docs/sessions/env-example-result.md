# Env Example Result

Date: 2026-04-27

What was verified from source:
- `DATABASE_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `AUTH_SECRET`
- `NEXTAUTH_SECRET`
- `HGO_OWNER_EMAILS`
- `HGO_TEAM_SCHEDULER_EMAILS`
- `HGO_COACH_EMAILS`
- `ENABLE_EPISODES_FUMADOCS`

What was created:
- `.env.example`

What was updated:
- `AGENTS.md`
- `docs/runbooks/local-dev.md`

Auth secret reality:
- current code prefers `AUTH_SECRET`
- `NEXTAUTH_SECRET` is still supported as a legacy fallback if `AUTH_SECRET` is unset

Notes:
- `.env.example` includes only variables actually used by the current codebase
- `ENABLE_EPISODES_FUMADOCS` is left commented because it is optional and transitional
- `NODE_ENV` was not included because it is standard runtime/framework behavior, not repo-specific app configuration
