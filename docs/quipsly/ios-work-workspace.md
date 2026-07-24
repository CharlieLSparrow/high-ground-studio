# iPhone Work Workspace

Last verified: 2026-07-24

## Product job

`Work` is the iPhone return path for project work captured in Quipsly.

It keeps four canonical Nest record families together:

- actor-scoped Tasks;
- actor-owned Goals and their latest progress evidence;
- document-kernel Notes;
- the Nest's active and retired tag vocabulary.

It does not replace:

- `Today`, which ranks time-sensitive follow-through;
- `Record`, which owns consented source capture and Session work;
- `Library`, which protects local recording originals;
- the Nest web app, which remains the complete canonical editing and administration surface.

## Navigation

The iPhone root destinations are:

1. Today
2. Record
3. Work
4. Library
5. Account

Work starts with a project picker, an honest count summary, direct Task/Note/Goal capture, tag lenses, then the project records. It does not put taxonomy administration or production tooling in the first-use path.

## Canonical read contract

`GET /api/mobile/capture/work`

Optional query:

```text
projectId=<StudioProject.id>
```

The response kind is `quipsly-mobile-work-v1`.

The endpoint:

- requires a verified Quipsly actor;
- lists only projects returned by active project access grants;
- rejects a requested project outside that list without querying its work;
- uses the same actor-scoped Task and owned-Goal predicates as the Nest project workspace;
- excludes unreviewed transcript candidates;
- reads everyday Notes from `StudioDocument` records labeled `document-kind:note`;
- returns canonical `StudioTag` identities and aggregate use counts;
- makes Owner/Editor versus Viewer write capability explicit;
- has no external side effects.

The API advertises the route through both Capture readiness and Session discovery responses.

## Capture and mutation contract

The Work surface does not create a second mobile record model.

- New Task, Note, and Goal opens the existing protected quick-entry sheet already bound to the selected writable Nest.
- The phone journals the complete request before network sync.
- Retry retains the same UUID and project identity.
- Tags are selected from that Nest's canonical active vocabulary; new names use the existing protected tag intent.
- Existing Tasks and Goals expose the same complete tag-set editor directly in Work. It searches the selected Nest's active vocabulary and keeps one persistent `Save changes` action reachable above long lists and the software keyboard.
- A Task or Goal tag change enters the actor-partitioned protected work-tag outbox before sync, retains one request UUID across retry, uses optimistic revision evidence, and replaces only that record's canonical tag links.
- Pending and held tag decisions render beside the affected Work record. A held decision can be discarded explicitly; a pending decision is reconciled through the same Today/Nest mutation client instead of inventing a Work-only write route.
- Task completion and Goal check-ins reuse the existing optimistic Today mutation contract.
- Acknowledgement and held/retry state are visible inside Work, not hidden on the Record tab.

Viewers can read their permitted project workspace but cannot capture or mutate project work.

## Offline and account isolation

The last successful Work response is cached under Application Support with `completeFileProtectionUntilFirstUserAuthentication`.

The envelope contains:

- schema version;
- normalized verified owner email;
- save time;
- the exact canonical response.

Restore requires the same owner and a snapshot no older than 30 days. Sign-out deletes the Work cache. An offline snapshot is visibly labeled. Completion and Goal-progress changes remain disabled until Nest verifies current revisions, while an explicit complete tag-set choice can enter the protected work-tag outbox and reconcile after reconnect. Protected quick-capture and tag-decision outboxes are the only offline write paths.

## Verification

The 2026-07-24 checkpoint proved:

- route unit coverage for signed-out denial, out-of-grant project denial, actor-scoped projection, candidate quarantine, Notes, and tag usage;
- all 21 tracked TypeScript projects with pinned TypeScript 7.0.2;
- native iOS simulator build with the production target and LiveKit package graph;
- deterministic iPhone UX for project selection, tag filtering, Task/Goal/Note readback, and project-prebound capture;
- signed native Firebase login against local Nest and PostgreSQL;
- real creation and same-surface readback of Task `mobile-task-45b7f66a-25b9-4b7a-ad48-7697a223bf49`;
- exact project `High Ground real-work dogfood`;
- exact active canonical tag `Proof listen`;
- a single persisted Task row;
- no provider, Calendar, message, invitation, delivery, source, or publication side effect.

Temporary emulator credentials and the temporary Firebase Auth user were removed. The canonical local dogfood Task remains as useful project work.

The follow-on Work-native retag checkpoint additionally proved:

- existing Task and Goal tag controls are visible and reachable from their Work cards;
- a large persistent save action works with a searched real taxonomy;
- signed native creation of Task `mobile-task-4e32e027-e14d-4403-81f9-687387468d13` (`iPhone Work retag proof 20260724T182249`);
- same-surface mutation and readback from `Proof listen` to the complete two-tag set `Product development` plus `Proof listen`;
- independent PostgreSQL reconciliation of exactly two `ActionItemTagLink` rows;
- receipt `work-tags-fd2a3fd8-0c6e-47b9-93ed-4afc932a9a5b`, bound to the exact actor, Task, project, and tag identities with `externalSideEffects:false`;
- signed XCUITest completion in 73.923 seconds;
- deterministic navigation and Work journeys passing 2/2 on the final UI;
- 74/74 mobile source contracts, 104/104 local source-and-network contracts, 633/633 Capture App Store static checks, and 21/21 pinned TypeScript 7.0.2 projects;
- deletion of seven superseded failed-run synthetic Task rows after confirming they had no Goal, occurrence, reminder, or work-plan dependencies.

The successful proof Task remains; temporary credentials and the temporary verified Firebase emulator user were removed.

## Open release gates

This checkpoint is signed-simulator and local-service proof. It is not:

- an unlocked physical-iPhone proof;
- a TestFlight-installed proof;
- deployed production parity;
- App Store Connect compliance/submission authorization;
- completion of the required real episode and coaching workflows.

Those gates remain tracked in the unified product goal and App Store readiness runbook.
