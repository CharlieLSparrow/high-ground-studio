# Browser Episode Editor MVP

Status: implementation contract

## Product boundary

The browser editor is the shared decision surface for High Ground Odyssey. It is not a second renderer, a second media vault, or a simplified copy of the native Studio timeline.

The first useful loop is:

1. Open the High Ground Odyssey Nest.
2. Open the shared episode editor.
3. Switch to an episode.
4. Scrub one shared sequence clock.
5. Press a display key or add a timestamped note/tag.
6. The operation saves automatically with actor and time provenance.
7. Quipsly Studio consumes the same branch metadata for the production render.

## Storage truth

| Concern | Canonical home |
| --- | --- |
| User identity | Firebase identity linked to the app-owned User |
| Nest membership and editor permission | PostgreSQL access grants |
| Original media | Immutable external/cloud media vault |
| Browser playback | Proxy objects referenced by the baseline source manifest |
| Episode sync | Versioned `StudioEditBaseline` metadata |
| Edit choices | `StudioEditBranch.stateJson` plus append-only `StudioEditOperation` rows |
| Notes and tags | `StudioTimelineAnnotation` plus canonical `StudioTag` records |
| Final rendering | Local Quipsly Studio using the same baseline and branch contract |

Do not copy edit state into Firestore. Do not put original media in PostgreSQL. Do not make reviewers organize files before they can edit.

## Baselines and branches

A baseline names a protected synchronization result. It records source identities, proxy references, offsets, duration, a source fingerprint, and a compact sync summary. Baselines are immutable. A corrected sync creates baseline version 2 rather than rewriting version 1.

A branch is lightweight edit intent layered over one baseline. The MVP exposes one obvious branch named `Shared editor cut`. Later branches can represent producer alternatives, Part 1/Part 2, platform formats, shorts, and experiments without copying media.

The UI should say what a person needs to know:

- Protected sync baseline v1
- Shared editor cut, revision 42
- 3 sources, 3 browser proxies

It should not require a reviewer to understand object paths or branch internals.

## Program decisions

Program decisions are sparse events. A decision starts at its sequence timestamp and remains active until the next decision.

| Key | Decision |
| --- | --- |
| 1 | Charlie |
| 2 | Homer |
| 3 | Both |
| 4 | Skip |
| 5 | Charlie and clip |
| 6 | Homer and clip |
| 7 | Both and clip |

Audio policy is independent from visual selection. The browser MVP records visual intent and a conservative audio policy. Complex clip weaving, J/L cuts, reframing, and local mastering remain native Studio work until the shared contract can express them cleanly.

## Provenance and training data

Every new operation records:

- authenticated app user ID when available
- email and display-name snapshots
- actor type: `human`, `agent`, or `import`
- exact server creation time
- client request ID for idempotence
- branch revision before and after the operation
- operation payload and sequence timestamp

Old decisions without trustworthy event dates are not assigned invented dates. One import receipt records the real import time and a truthful cutoff: `sourceTimestampPrecision=before-cutoff` and `sourceCreatedBefore=<episode updatedAt>`. This is useful training provenance without pretending to know more than we do.

Agent operations use the same operation endpoint with `actorType=agent` and a stable agent identity. They must not masquerade as a human account.

## Permission meaning

"Everyone with a High Ground Odyssey login" means every authenticated user with an active High Ground Odyssey Nest grant can open the same page. Owners and editors can save edit operations. Viewers can inspect the branch without modifying it. Mako should receive an Editor grant.

## Conflict behavior

The branch uses optimistic revision checks. If two people edit at once, the second stale operation receives a conflict and the newest shared branch is returned. No whole timeline blob is silently overwritten. The client can then reapply the small intended operation against the current revision.

## File organization

People save episodes by naming and switching episode records, not by choosing folders. The baseline source manifest points at immutable sources and proxies. The branch contains only metadata. Local renders remain versioned delivery artifacts and never become the edit source of truth.

## Next hardening increments

1. Populate browser proxy URLs from the canonical media-vault asset graph.
2. Add transcript word timing and episode-document context panels.
3. Add decision-boundary drag and operation-level undo.
4. Add explicit Part 1, Part 2, and short branches.
5. Add agent tokens that preserve `actorType=agent` through the same API.
6. Add browser-to-native handoff and render receipt readback.
