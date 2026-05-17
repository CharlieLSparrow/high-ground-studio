# Studio Tailwind Conversion Result

Date: 2026-05-17

## Summary

This pass moved `apps/studio` away from a large custom `.studio-*` CSS selector
system and toward Tailwind CSS utilities.

The goal was UI infrastructure, not behavior change. The private auth gate,
server actions, local persistence behavior, Prisma schema, and workbench data
flow were left unchanged.

## What Changed

- `apps/studio` now uses Tailwind 4 through `@tailwindcss/postcss`.
- Studio has its own `postcss.config.mjs`, matching the existing `apps/web`
  Tailwind/PostCSS pattern.
- The workbench and access screens now use component-level Tailwind utility
  classes.
- A small local `studio-ui.tsx` helper centralizes repeated Studio primitives:
  chips, glyph, panel/card classes, labels, metadata text, and primary/secondary
  button classes.

## What CSS Remains Global

`apps/studio/src/app/globals.css` now keeps only:

- `@import "tailwindcss"`
- Studio color and shadow theme tokens
- base `html` and `body` background/font styles
- small global form/button font and cursor defaults

Bootstrap is not part of Studio.

## Why Tailwind Fits Studio

Studio is becoming a private editor and research workbench with many repeated
states: source blocks, semantic tags, selected spans, knowledge nodes,
provenance panels, structures, projections, review states, and future editor
surfaces.

Tailwind keeps those state-specific styles close to the components that own
them while still allowing shared Studio tokens for color, panels, and status
chips. That is a better fit than growing another large custom selector system.

## Behavior Status

The visible layout, dark workbench direction, private/auth states, source
column, tagging controls, knowledge panel, future lanes, and action messaging
were preserved.

No Prisma schema, auth behavior, database behavior, TipTap/Yjs integration,
cloud deployment, or public projection behavior changed.

## Next Recommended Slice

Extract the most repeated source/tag/node panel pieces into small reusable
Studio components before adding new editor surfaces. Do that while keeping the
plain durable tagging loop stable.
