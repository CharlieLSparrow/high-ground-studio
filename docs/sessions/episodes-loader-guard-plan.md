# Episodes Loader Guard Plan

Date: 2026-04-27

Scope:
- Add a temporary, reversible guard around the episodes/Fumadocs loader integration.
- Keep the blast radius limited to the episodes source boundary and route usage.

Goal:
- Test whether the `fumadocs-mdx:collections/server` integration is the compile trigger for the stalled production build.

Plan:
1. Move the Fumadocs source loading behind a runtime guard in `apps/web/src/lib/source.ts`.
2. Update the episodes route to consume the guarded source asynchronously and handle the disabled state cleanly.
3. Run one clean production build.
4. Record whether the guarded build passes and whether that confirms the Fumadocs loader as the trigger.
