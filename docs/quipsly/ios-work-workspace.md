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

Restore requires the same owner and a snapshot no older than 30 days. Sign-out deletes the Work cache. An offline snapshot is visibly labeled and Task/Goal mutations remain disabled until Nest verifies current revisions. Protected quick-capture outboxes remain the only offline write path.

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

## Open release gates

This checkpoint is signed-simulator and local-service proof. It is not:

- an unlocked physical-iPhone proof;
- a TestFlight-installed proof;
- deployed production parity;
- App Store Connect compliance/submission authorization;
- completion of the required real episode and coaching workflows.

Those gates remain tracked in the unified product goal and App Store readiness runbook.
