# Proposal: First Foundation Schema Migration

Date: 2026-06-04
Context: Quipsly Access Readiness and Assistant Boundaries

## Overview
This proposal documents the first wave of database schema changes to transform Quipsly from a single-tenant workspace model into a multi-tenant SaaS foundation, whilst persisting durable assistant capabilities.

## 1. Access Foundation Changes
**Problem:** Projects and workspaces lacked explicit linkage to an `Organization` and `User` tracking for creators and modifiers.
**Changes made:**
- Added `StudioWorkspace.organizationId String?` and `organization Organization? @relation(...)`
- Added `Organization.studioWorkspaces StudioWorkspace[]`
- Added `StudioProject.createdByUserId String?` and `updatedByUserId String?`
- Added corresponding `User` relations (`studioProjectsCreated`, `studioProjectsUpdated`)

**Why now:** This paves the way for the access helper (`project -> workspace -> organization -> members`) without instantly breaking legacy local development (fields are optional).

## 2. Assistant Persistence Models
**Problem:** The Quipsly assistant requires auditable boundaries so drafting and rewriting can be powerful without becoming invisible or deceptive. We need durable models to store session contexts and human-in-the-loop review actions.
**Changes made (Confirmed in schema):**
- `StudioAssistantSession` (maps to `projectId` and `documentId`)
- `StudioAssistantMessage` (persists conversation flow and context)
- `StudioAssistantAction` (stores proposed mutating tool actions, status, and payload)
- `StudioAssistantLedger` (logs status changes like PENDING -> APPROVED)

## Migration/Backfill Path
Before we activate broad application route gating:
1. Run `prisma db push` or create a migration for these changes.
2. Backfill existing `StudioWorkspace` rows with the appropriate `organizationId` for early-access users.
3. Validate smoke tests to ensure `StudioProject` reads continue working without lockouts.

## Rollback Plan
Since the new fields are additive and optional, rollback consists of ignoring the new fields in API queries and optionally dropping the new tables/columns via standard Prisma migration rollback if critically flawed. No destructive actions occurred on existing columns.
