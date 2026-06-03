# Deploy Watch Report

**Status:** Green
**Build ID:** 56a4c626-bde3-46f9-8604-3fbabb26f030
**Cloud Run Revision:** studio-00185-b8p
**Rollback Command:** `gcloud run services update studio --project=high-ground-odyssey --region=us-central1 --revision=studio-00184-brm`

## Checks run
- **Prisma validation**: Passed successfully. Output:
  ```
  Loaded Prisma config from prisma.config.ts.
  Prisma schema loaded from prisma/schema.prisma.
  The schema at prisma/schema.prisma is valid 🚀
  ```
- **API Health Smoke** (`https://studio-hm2odnvjga-uc.a.run.app/api/health`): Passed successfully. Output: `{"ok":true,"service":"high-ground-studio","app":"studio"}`
- **Create Page Smoke** (`https://studio-hm2odnvjga-uc.a.run.app/create`): Passed successfully.
- **Editor Smoke** (`https://studio-hm2odnvjga-uc.a.run.app/editor`): Passed successfully. Verified the following text in deployed client JS bundle `/_next/static/chunks/0m2rlj9j~2eze.js`:
  - Add at playhead
  - Guided sync wizard
  - Something looks wrong
  - Sync preview - confidence check

Codex can continue coding.
