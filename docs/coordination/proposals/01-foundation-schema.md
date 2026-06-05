# Proposal: Foundation Schema & Assistant Persistence Bundle

Date: 2026-06-04
Status: PROPOSED

## 1. Problem
Currently, workspaces and projects operate globally without tenancy isolation. In addition, assistant message histories and proposed edits (actions/ledgers) are volatile, preventing robust review logs, rollbacks, and team collaboration.

## 2. Proposed Changes
Apply additive fields and new models to the Prisma schema:
- **Tenancy Layer**:
  - `StudioWorkspace.organizationId` (links workspace to its tenant organization)
- **Creator Audit Layer**:
  - `StudioProject.createdByUserId` / `StudioProject.updatedByUserId` (tracks creator/modifier users)
- **Assistant Persistence Layer**:
  - `StudioAssistantSession`: Container for chat sessions.
  - `StudioAssistantMessage`: Individual role/content message records.
  - `StudioAssistantAction`: Individual proposed write actions with risk levels and status tracking.
  - `StudioAssistantLedger`: State change history records for auditing/undo.

## 3. Migration & Compatibility
- Additive migrations ensure zero destructive data alterations.
- Local dev mode handles null session structures gracefully via dev mock bypass.
- Gating routes will only occur after database migrations are applied and default tenant data has been backfilled.
