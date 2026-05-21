# Studio Manuscript Sticky Glass Shell Result

Date: 2026-05-21

## Purpose

Polish the `/manuscript` desktop and tablet shell so the manuscript remains the
dominant surface while command and tool controls stay available.

This pass is layout and styling only. It does not change manuscript persistence,
server snapshot semantics, database schema, Prisma models, Cloud SQL, Cloud Run
configuration, secrets, IAM, DNS, OAuth, billing, autosave, collaboration, Yjs,
or canonical manuscript/content paths.

## What Changed

- Reworked the desktop/tablet command bar into a thinner sticky glass rail.
- Removed the heavy panel treatment from the command bar and replaced it with a
  translucent background, subtle border, compact shadow, and backdrop blur.
- Kept the essential command bar facts visible:
  - manuscript title
  - active author
  - current mode
  - cited quote count
  - saved time
  - active Focus View count when relevant
  - Recording / Reading state when relevant
  - Recording / Reading toggle
  - Full manuscript action while Focus View is active
  - Backup action
- Tightened the desktop/tablet tools sidebar so it remains sticky below the new
  command rail.
- Kept the sidebar internally scrollable for long `Structure`, `Quotes`, and
  `Backup` panels.
- Adjusted manuscript block scroll margin to match the thinner command rail so
  block, structure, and quote jumps should land below the sticky shell.
- Changed footnote help panels to viewport-positioned overlays so sticky and
  scrollable containers do not clip them.

## Product Behavior

The manuscript surface should read as the page's main object. The command bar
now behaves like a compact bookmark rail, and the sidebar behaves like a sticky
tool tray that follows the reader without covering the manuscript.

Mobile remains manuscript-first: the desktop command bar and sidebar stay hidden
at phone widths, and mobile bottom tools remain the mobile control path.

## Smoke Guidance

The manual smoke checklist now includes a Sticky Glass Shell section:

- open `/manuscript` on desktop
- scroll a long synthetic manuscript
- confirm the command bar stays thin and sticky
- confirm the sidebar stays visible and scrolls internally
- confirm jump-to-block, structure jump, and quote navigation clear the bar
- confirm help footnotes are not clipped by sticky or scrollable shell layers
- narrow to mobile and confirm manuscript-first behavior remains

## Boundaries Preserved

- No database schema changes.
- No Prisma model changes.
- No Cloud SQL changes.
- No Cloud Run config changes.
- No Secret Manager changes.
- No IAM changes.
- No DNS, OAuth, or billing changes.
- No autosave.
- No Yjs or collaboration.
- No canonical manuscript/content path changes.
