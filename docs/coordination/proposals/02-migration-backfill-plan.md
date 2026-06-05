# Proposal: Migration and Backfill Sequence for Foundation Schema

Date: 2026-06-04
Status: PROPOSED

## 1. Schema Review Findings

The foundation schema pass was reviewed and validated using `pnpm prisma validate`. The schema is structurally sound and ready for migration.

**Relation Correctness & Naming:**
- `StudioWorkspace.organizationId` correctly references `Organization` with `onDelete: Cascade`.
- `StudioProject` correctly uses named relations (`"StudioProjectCreatedBy"` and `"StudioProjectUpdatedBy"`) to disambiguate the multiple `User` foreign keys.
- Both use `onDelete: SetNull`, ensuring that deleting a creator's user account doesn't destroy the project.
- The `StudioAssistantSession`, `Message`, `Action`, and `Ledger` models correctly cascade down from `StudioProject` and `StudioAssistantSession`, ensuring clean cleanup if a project is deleted.

**Indexes:**
- Required foreign key indexes are all present (e.g., `@@index([organizationId])` on Workspace, `@@index([createdByUserId])` on Project).
- Assistant models are properly indexed by their parent IDs (`@@index([sessionId])`, `@@index([actionId])`).

## 2. Safest Deployment & Backfill Sequence

Because the new fields (`organizationId`, `createdByUserId`, `updatedByUserId`) are **nullable** (`String?`), we can perform a zero-downtime, non-destructive migration. 

### Phase 1: Local Preparation
1. **Generate Migration**: Run `pnpm prisma migrate dev --name add_foundation_and_assistant_persistence` to generate a formal SQL migration rather than relying on `db push`. 
2. **Draft Backfill Script**: Create `scripts/backfill-tenant-ownership.ts`. This script will:
   - Identify active users without an `Organization` and create one for them.
   - Iterate over existing `StudioWorkspace` records and assign them to the appropriate `Organization`.
   - Iterate over existing `StudioProject` records and assign `createdByUserId` based on their owner context (e.g., matching manuscript owner emails to User records).
3. **Local Test**: Run the migration and backfill script locally against dev data.

### Phase 2: Production Deployment (Cloud Run)
1. **Merge & Deploy DB Schema**: Merge the migration into `main`. The CI/CD pipeline should run `pnpm prisma migrate deploy` before the new Cloud Run revision serves traffic. Since the fields are nullable, the app continues functioning normally.
2. **Run Backfill in Prod**: Execute the backfill script against the production database. In a GCP Cloud Run environment, the safest method is deploying the script as a one-off **Cloud Run Job** (or securely executing it locally via Cloud SQL Auth Proxy if network policy allows).
3. **Verify Data Integrity**: Check the database or internal admin tools to ensure all `StudioWorkspace` rows have a non-null `organizationId`.

### Phase 3: Enforcing Gates
1. **Deploy Access Controls**: Once the data is confirmed whole, merge and deploy the PR that implements `requireProjectAccess()` and route gating. This guarantees no users are locked out of their workspaces due to missing tenant IDs.
