# iPhone Work Workspace

Last verified: 2026-07-30

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

An Owner can also open **New project** directly from Work. The phone creates a
real private Nest and selects the exact server-returned project after a
canonical readback; it never inserts a local-only placeholder project.

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
- returns canonical `StudioTag` identities, aggregate use counts, update
  revisions, aliases, archive state, and merge redirects;
- makes Owner/Editor versus Viewer write capability explicit;
- has no external side effects.

The API advertises the route through both Capture readiness and Session discovery responses.

## Canonical project-creation contract

`POST /api/mobile/capture/projects`

The request includes a human-readable name, supported Nest kind, optional
description, and a device-generated UUID retained for every retry. The response
kind is `quipsly-mobile-project-create-v1`.

The endpoint:

- requires a verified beta-enabled Quipsly actor;
- creates a private `StudioProject`, primary living `StudioDocument`, two
  starter blocks, and an active Owner grant in one serializable transaction;
- records an actor-bound `create-nest` operation receipt;
- serializes retries by actor and request UUID;
- returns the original project only when every protected request field matches;
- rejects a reused request UUID with changed content;
- treats a readable slug as presentation, never ownership identity;
- suffixes same-name collisions rather than reopening an existing project or
  granting its ownership to another actor;
- performs no invitation, message, calendar, provider-room, media, or
  publishing side effect.

After a successful POST, Capture reloads Work by the exact returned project ID
and considers creation complete only when that canonical project is selected.
If the response or readback is interrupted, the sheet remains open and Retry
reuses the same UUID, so a completed project cannot be duplicated.

Nest's `/projects` creation form uses this same kernel instead of maintaining a
second ownership rule. Its UUID is generated on the server, retained while the
form reports a retryable error, and passed into the same actor-bound receipt.
The submit control becomes an explicit `Creating private Nest…` state, prevents
repeat clicks, and states the private/no-external-side-effects boundary before
the write. A successful create redirects only after the canonical transaction
returns its exact slug.

## Capture and mutation contract

The Work surface does not create a second mobile record model.

- New Task, Note, and Goal opens the existing protected quick-entry sheet already bound to the selected writable Nest.
- The phone journals the complete request before network sync.
- Retry retains the same UUID and project identity.
- Tags are selected from that Nest's canonical active vocabulary; new names use the existing protected tag intent.
- The tag lens opens a native shared-vocabulary manager. Owners and Editors can
  rename, archive, and restore a tag against its exact live `updatedAt`
  revision. Rename retains the former label as a searchable alias; archive
  removes a tag from new choices but preserves every existing assignment.
- Shared-vocabulary administration is deliberately online-only. A stale
  revision returns a visible conflict and reloads canonical state; Capture
  never queues or replays taxonomy changes whose meaning may have changed.
- Owners and Editors can also create a canonical vocabulary entry before any
  Task, Goal, Note, Session, or document needs it. Creation reuses an active
  tag or historical alias when possible, records the first append-only
  revision for a new identity, and explicitly changes no assignment.
- Merge remains in Nest's full vocabulary manager because it rewrites multiple
  assignments and requires side-by-side impact, history, and rollback review.
  Capture shows merge redirects read-only and links directly to that same
  project-scoped manager.
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

Rename, archive, restore, and merge are not tag decisions on one record; they
change the meaning of shared vocabulary. They therefore require a live
canonical read and never enter an outbox.

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

The 2026-07-29 project-creation checkpoint additionally proved:

- same-name project collision allocation without reopening an existing Nest;
- exact request replay without a second project, document, grant, or receipt;
- conflict rejection when a request UUID is reused with changed content;
- signed-out and beta-access denial plus actor-bound canonical route input;
- four focused route/kernel suites passing 24/24;
- TypeScript 7 application typecheck;
- production iOS target simulator build with LiveKit linked;
- the deterministic Work UI journey passing on iPhone 16e, including a
  reachable New Project control that cannot pretend to write in preview mode.
- Nest form parity for exact actor, project purpose, shared template title, and
  retry UUID, with visible pending/error behavior and no divergent creation
  kernel.

Production deployment and TestFlight distribution are now proven by the
Build 18 release checkpoint below. A signed physical-iPhone
creation/readback remains a release gate; this checkpoint does not claim it.

The 2026-07-30 shared-vocabulary checkpoint additionally proves:

- one server taxonomy service powers native and web rename/archive/restore;
- the native response exposes aliases, archive timestamps, merge redirects,
  usage impact, and optimistic revision evidence;
- API tests cover signed-out denial, incomplete input, successful alias-
  preserving rename, stale-revision conflict, and exact mobile projection;
- preview mode exposes the complete vocabulary UX while keeping every mutating
  control disabled;
- higher-impact merge remains routed to Nest's project-scoped manager with its
  audited rollback semantics.

The direct-vocabulary-authoring follow-on additionally proves:

- the same `StudioTag` identity can be deliberately created in iPhone Work
  without inventing a placeholder Task, Goal, Note, Session, or document;
- creation rechecks an active Owner/Editor grant inside a serializable
  transaction and records revision 1 with a unique receipt;
- retry and former-name reuse converge on the same canonical identity instead
  of creating a duplicate;
- the result is immediately available to permission-filtered global Search;
- native preview mode renders the real creation control but cannot pretend to
  mutate a Nest;
- the complete Work UI journey passes on iPhone 17 Pro;
- durable local QA created and retained canonical tag
  `Capture vocabulary dogfood` (`cms8666060000x6xlax1zfsxi`) in
  `High Ground real-work dogfood` under `quipsly.qa@local.test`;
- a second operation reused that exact identity at revision 1, while
  independent before/after counts remained zero for Task, Goal, Session, Note,
  and document assignments.

The exact-tag-focus follow-on additionally proves:

- iPhone Work filters by the selected `StudioTag.id` and now exposes an
  explicit, accessible `Showing #tag in Nest` state;
- Nest tag entry points use `/find?tag=<StudioTag.id>` rather than turning the
  label back into a text query;
- exact focus reapplies Task, Goal, Session, note, document, writing,
  annotation, and source visibility rules after resolving the tag;
- two visible Nests can carry the same human label without mixing results;
- a tag outside the actor's visible Nest set discloses no identity;
- merge redirects preserve the old tag URL and visibly resolve to the
  canonical target.

The full contract and current media-navigation boundary are recorded in
[`canonical-tag-focus.md`](./canonical-tag-focus.md).

Run the durable dogfood check only against the dedicated local QA database:

```bash
QUIPSLY_DURABLE_TAG_QA=1 \
QUIPSLY_LOCAL_DATABASE_URL=<explicit-local-postgresql-url> \
pnpm --filter quipsly exec jest --runInBand \
  --runTestsByPath src/lib/server/work-tags.durable.integration.test.ts
```

The artifact is intentionally retained. The check neither creates a user nor
falls back to a production account; it fails unless the dedicated QA actor and
writable QA Nest already exist.

Durable QA artifacts are a maintained regression workspace, not automatic
cleanup debt. Keep useful records clearly labeled and isolated under dedicated
test identities so later releases can prove continuity, rename stability, and
cross-surface behavior against the same canonical IDs. Generated disposable
smoke identities may still be deleted by their owning harness; durable QA must
never borrow a real user's identity or silently target production data.

## Open release gates

Build 18 and Nest revision `studio-00462-luc` close deployed production parity
and external TestFlight distribution for this slice. The remaining boundaries
are:

- an unlocked physical-iPhone proof;
- a TestFlight-installed proof;
- completion of the required real episode and coaching workflows.

Those gates remain tracked in the unified product goal and App Store readiness runbook.

## 2026-07-30 exact tag focus production and Build 18 release

- Exact committed web/runtime source
  `041461d9ea78419ae5d97f3869df802ec7ef0eb2` built in Cloud Build operation
  `f2ba4e3a-51b8-4f54-bc2e-5acb5795db7f`, then deployed first as zero-traffic
  Nest revision `studio-00462-luc`.
- A generated verified Firebase reviewer exercised public routes, authenticated
  login, the private Home Nest, episode production, Sessions, Projects, account
  switching, the admin boundary, writing, editor, recorder, research,
  publishing, logout, and the 108-check mobile contract before traffic moved.
  Its two grants, Home Nest, membership, database actor, and Firebase actor
  were independently verified removed after acceptance.
- Production now serves `studio-00462-luc` at 100% from immutable runtime image
  digest
  `sha256:5c3e62c58d2669b8541927e9691a3196a9fd103fbe415db0c99f103b8547ed7a`.
- Build 18 was qualified from exact committed native source
  `5a04798690dc6e71293919519b6a371d60e2416b`. Its only change after the
  web/runtime source was a bounded XCUITest scrolling repair discovered by
  the first exact-source qualification attempt; the complete rerun passed all
  45 serialized iPhone and Share Extension journeys.
- Signed archive/export, nested signature, entitlement, App Store profile,
  privacy-manifest, and packaged-purpose-string inspection passed. The exact
  upload-bound 20,894,573-byte IPA has SHA-256
  `628c3bc3e2b1a89dc62155e1bee2a706ea775de7f55384178c186623090efd5d`.
- App Store Connect build `084577b9-4fca-43b0-bb59-5f1a068e7ae8` is `VALID`,
  `APPROVED`, and `IN_BETA_TESTING` in the external
  **Quipsly Capture Rehearsal** group with automatic notification.
- Independent public-link readback passed the exact app title, open-beta
  heading, and `itms-beta` handoff at
  `https://testflight.apple.com/join/XwRRcYUm`.
- The released slice gives exact canonical tag focus across Nest and iPhone
  Work, including same-label Nest isolation, merge redirects, separate-account
  nondisclosure, and an explicit accessible native selection state.
- The labeled durable QA artifact under `quipsly.qa@local.test` remains
  intentionally retained with `exactTagFocus:true`, revision 1, and zero Task,
  Goal, Session, Note, or document assignments.
- Apple processing and public delivery do not prove a physical TestFlight
  installation or a real two-person recording; those gates remain open.

## 2026-07-30 media tag-focus continuation

- Nest exact tag focus now projects authorized media clips as well as canonical
  Work, Session, writing, source, and annotation records. Clip links reopen the
  exact logger row and preserve the tag-focused return path.
- Media access is rechecked independently from tag access across the asset's
  direct project, media-bin project, and explicit project attachments.
  Viewer access is read-only; legacy global assets remain read-only; an
  inaccessible ID discloses no asset or clip identity.
- Nest Owners and Editors can now create reusable vocabulary directly from the
  vocabulary manager without creating or tagging a placeholder record. The
  action remains live-only and makes no iPhone outbox or assignment claim.
- A clearly labeled local QA identity, Home Nest, dummy asset, canonical tag,
  and 4.00s–12.00s clip remain intentionally retained as a long-term
  regression fixture. This does not replace physical TestFlight and genuine
  recording proof.

## Historical 2026-07-30 production and Build 17 release

- Exact committed source
  `b0211cf8a528ce248edb38725631279a2438d847` built in Cloud Build operation
  `d3bd1555-b320-4ceb-acd7-318e18649c36`, then deployed first as zero-traffic
  Nest revision `studio-00460-tix`.
- A generated verified Firebase reviewer exercised public routes, authenticated
  login, the private Home Nest, episode production, Sessions, Projects, account
  switching, the admin boundary, writing, editor, recorder, research,
  publishing, logout, and the 108-check mobile contract before traffic moved.
- Production now serves `studio-00460-tix` at 100% from immutable runtime image
  digest
  `sha256:2bf8ee96aeeec487929a6e0b582b0b10b15d74d1677234e8bc3739381ce2d5fb`.
  Reviewer grants, Home Nest, memberships, database actor, and Firebase actor
  were independently verified removed after acceptance.
- Build 17 passed all 45 serialized iPhone and Share Extension journeys,
  signed archive/export, nested signature, entitlement, App Store profile,
  privacy-manifest, and packaged-purpose-string inspection.
- The exact upload-bound 20,891,711-byte IPA has SHA-256
  `055bca4210bda089cf613a1618d97bfb6e96566efb3f7f289a917118148975d4`.
  App Store Connect build `e3d69f71-90b5-4da8-91c3-c597cb942994` is `VALID`,
  `APPROVED`, and `IN_BETA_TESTING` in the external
  **Quipsly Capture Rehearsal** group with automatic notification.
- Independent public-link readback passed the exact app title, open-beta
  heading, and `itms-beta` handoff at
  `https://testflight.apple.com/join/XwRRcYUm`.
- The transcript provider remains deliberately held: the live Nest revision
  has no transcript-provider environment and no transcript worker Job exists.
  Secret resource `quipsly-deepgram-api-key` exists for future controlled
  activation but has zero secret versions, so no provider credential can be
  consumed.
- This release makes deliberate creation and reuse of the canonical Nest tag
  vocabulary available in iPhone Work without placeholder records or hidden
  assignments. The labeled durable QA artifact under
  `quipsly.qa@local.test` remains intentionally retained.
- Apple processing and public delivery do not prove a physical TestFlight
  installation or a real two-person recording; those gates remain open.

## Historical 2026-07-30 production and Build 16 release

- Exact committed source
  `356f6d821eafac018c5116cb4d888425c442cf42` deployed first as zero-traffic
  Nest revision `studio-00458-xac`.
- A generated verified Firebase reviewer exercised the private Home Nest,
  Sessions, writing, editor, recorder, research, publishing, admin boundary,
  logout, and the 108-check mobile contract before traffic changed.
- At that checkpoint production served `studio-00458-xac` at 100% from immutable image digest
  `sha256:5126998e2c6f490a1b0e76fd4c172dcf4afced2139216ae9f93b664629a2a66a`.
  Reviewer grants, Home Nest, membership, database actor, and Firebase actor
  were independently verified removed after acceptance.
- Build 16 passed all 45 serialized iPhone and Share Extension journeys,
  signed archive/export, nested signature, entitlement, App Store profile,
  privacy-manifest, and packaged-purpose-string inspection.
- The 20,866,985-byte IPA has SHA-256
  `237cb1e8e286d06b23744d42a4d7193fec3f04b0edd4699fd2df47a6e00cf7ca`.
  App Store Connect build `0c67b80d-0df3-4c48-9844-ba963202515d` is `VALID`,
  `APPROVED`, and `IN_BETA_TESTING` in the external
  **Quipsly Capture Rehearsal** group with automatic notification.
- Independent public-link readback passed the exact app title, open-beta
  heading, and `itms-beta` handoff at
  `https://testflight.apple.com/join/XwRRcYUm`.
- The transcript provider remained deliberately held at that checkpoint.
