# Proposal: First Foundation Migration

Date: 2026-06-04

## Problem

Quipsly is transitioning to a SaaS foundation for creators. The current schema lacks the necessary multi-tenant ownership relationships (Workspace -> Organization) and audit trails for projects (createdBy/updatedBy). Additionally, to support Quipsly as a research assistant that never black-box writes, we need durable persistence for assistant sessions, messages, proposed actions, and a ledger for auditing those actions.

## Proposed Schema Change

We are adding the following models and relations to Prisma:

1. **Multi-tenant & Audit Fields**:
   - `StudioWorkspace.organizationId String?`
   - `StudioWorkspace.organization Organization? @relation(...)`
   - `Organization.studioWorkspaces StudioWorkspace[]`
   - `StudioProject.createdByUserId String?`
   - `StudioProject.updatedByUserId String?`
   - `User.studioProjectsCreated StudioProject[] @relation("StudioProjectCreatedBy")`
   - `User.studioProjectsUpdated StudioProject[] @relation("StudioProjectUpdatedBy")`

2. **Assistant Persistence**:
   - `StudioAssistantSession` (belongs to `StudioProject`, optionally `StudioDocument`)
   - `StudioAssistantMessage` (role, content, contextJson, timestamps)
   - `StudioAssistantAction` (kind, label, explanation, riskLevel, payloadJson, status, timestamps)
   - `StudioAssistantLedger` (tracks action status changes, notes, timestamps)

## Why Now

We need to establish the access boundaries (Organization ownership) before gating routes or inviting outside users. We also need the assistant persistence models now so that we can build the Human-in-the-Loop review UI without losing the audit trail of AI-generated suggestions.

## Migration / Data Survival Path

These are additive changes. Existing workspaces will have a null `organizationId` initially.
- **Backfill**: We will need a script to create an Organization for the existing owner and associate the existing `StudioWorkspace` records with that Organization. Similarly, we will backfill `createdByUserId` for existing projects.

## Compatibility Plan

- Existing application logic relies on `workspaceId` on projects, which remains untouched.
- Route gating is explicitly deferred until after backfill and smoke testing to avoid locking out local/dev modes.

## Rollback Plan

If the assistant tables cause issues, they can be ignored or dropped since they don't block core manuscript rendering. If the organization relations cause issues, we can revert the Prisma schema and Prisma Client since the existing fields (`workspaceId`, `slug`) still handle routing.

## Smoke / Validation Path

1. Run `prisma generate` and `prisma db push` (or migrate dev) in a safe environment.
2. Verify local dev mode still allows access to existing projects.
3. Verify creation of a new project successfully populates the `createdByUserId` field if auth is present.
4. Verify creating a dummy assistant session and appending messages/actions works without foreign key violations.
