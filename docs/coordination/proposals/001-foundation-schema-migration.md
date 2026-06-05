# Proposal 001: First Foundation Schema Migration

Date: 2026-06-04
Status: Executed

## Goal
Implement the first pass of the Quipsly foundation schema to support organization-based access control and a durable assistant action ledger, without locking out local development or prematurely introducing billing complexity.

## Schema Changes

### Ownership & Access
- Added `StudioWorkspace.organizationId String?` and `organization Organization? @relation(...)`
- Added `Organization.studioWorkspaces StudioWorkspace[]`
- Added audit fields to `StudioProject`:
  - `createdByUserId String?`
  - `updatedByUserId String?`
  - Optional `User` relations (`createdBy`, `updatedBy`)
  - Inverse relations on `User` model: `studioProjectsCreated`, `studioProjectsUpdated`

### Assistant Persistence
- Created `StudioAssistantSession` (belongs to `StudioProject` and optionally `StudioDocument`)
- Created `StudioAssistantMessage` (stores role, content, contextJson, and timestamps)
- Created `StudioAssistantAction` (stores kind, label, explanation, riskLevel, payloadJson, status)
- Created `StudioAssistantLedger` (stores state transitions, notes, timestamps)

## Rationale
This aligns with the `access-readiness-plan.md` strategy: preparing the data model for organization-level tenancy and ensuring the Quipsly assistant operates strictly as an auditable, non-destructive librarian (per `quipsly-assistant-boundaries.md`).

## Next Steps
- Execute a one-time data backfill script to associate existing local `StudioWorkspace` records with an `Organization` and existing `StudioProject` records with a `createdByUserId`.
- Implement `requireProjectAccess` and begin securing APIs (without broad middleware gating yet).
