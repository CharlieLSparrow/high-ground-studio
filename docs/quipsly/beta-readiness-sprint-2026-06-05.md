# Quipsly Beta Readiness Sprint - 2026-06-05

## Product spine decisions

- Use **Nests** as the customer-facing project container. Existing `StudioProject` records remain the backing implementation.
- Keep the one-living-document model for writing and study surfaces. Structure comes from tags and boundaries, not separate piles of cloned text.
- Treat document kind as product vocabulary: original writing, study source, research packet, production room, and publish packet.
- Publishing should flow through public-safe packets. Public sites should never depend on raw private manuscript/editor state.
- Recording interruptions are normal production data. The recorder should preserve starts, stops, upload status, and segment order so the editor can stack takes safely.

## Implementation moved forward

- Added reusable Nest document-kind domain contracts in `packages/quipsly-domain/src/nests.ts`.
- Added `/nests` and `/nests/[slug]` app routes so the product language has a stable URL shape while reusing the existing project hub and manuscript route.
- Added publishing destination status helpers and UI rail so publishing candidates can show per-destination readiness instead of a vague single status.
- Added a recorder-side recording spine summary/export concept and an editor-side recording handoff summary.
- Confirmed the HGO public home page and episode pages are already packet-fed and render the latest episode from the public packet store.

## Beta quality bar

Before inviting paying Patreon supporters broadly, every user-facing path should answer these questions without developer context:

1. **Where am I?** Nest name, document title, project slug if needed, and whether the surface is writing, study, production, or publishing.
2. **What is safe?** Source health, publish destination readiness, sync state, and save status should be visible in plain English.
3. **What do I do next?** Empty states and checklists should suggest the next human action, not expose internal plumbing.
4. **Can I recover?** Assistant actions, sync changes, and timeline edits should be inspectable and reversible where practical.
5. **What gets published?** Public pages should show provenance and only consume public-safe episode packets.

## Marginalia guidance

- Big schema proposals are welcome, but schema edits and route deletions still need Codex/user approval before implementation.
- New features should report their public entrypoint, hidden/admin entrypoint, backing data shape, and rollback path.
- Prefer additive routes and compatibility redirects over breaking bookmarks during beta.
- Do not make Patreon the source of truth for app access; ingest provider state, then reconcile to app-owned membership/entitlement records.
- Use Quipsly assistant language as research, organization, and drafting support. Freeform drafting is allowed; source-aware drafting and citations matter when claims matter; important changes should stay inspectable and recoverable.
