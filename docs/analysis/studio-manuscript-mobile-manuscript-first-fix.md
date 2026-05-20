# Studio Manuscript Mobile Manuscript-First Fix

Date: 2026-05-20

## Phone Test Finding

The first mobile Recording / Reading pass still opened like an admin cockpit:
the phone viewport showed status, menus, and recording controls before the
manuscript. That is backwards for the recording use case.

## Why Manuscript-First Matters

The long-wall manuscript is the home surface. On a phone, Homer / Scott should
feel like he opened a readable script, not a control console. Controls are
still necessary, but they should support the script after the text is already
visible.

## Mobile Control Hierarchy

The mobile hierarchy is now:

1. Manuscript.
2. Tiny mode/status affordance.
3. Collapsed tools.
4. Advanced editing, import, inspector, and export controls last.

Dense panels should not sit above the manuscript on phone widths. Recording
tools, quick views, outline jumps, and focus controls belong in a collapsed
mobile tools drawer or below the manuscript.

## Why Controls Collapse On Mobile

Mobile reading and recording are attention-sensitive. A full-width header,
draft status panel, import toolbar, or outline list consumes the first viewport
and forces the reader to hunt for the words. Collapsing those controls keeps
the manuscript visible while preserving access to quick actions when needed.

## Deferred

- A dedicated mobile gesture model.
- Saved mobile tool presets.
- Clip markers.
- Recording comments.
- Take markers.
- Audio sync.
- Multi-user collaboration.
