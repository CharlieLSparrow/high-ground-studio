# Coaching forms

Date: 2026-08-26
Status: production forms and explicit lifecycle automation implemented; exact-source local acceptance passed

## Product intent

Forms are part of the coaching relationship, not a separate survey portal.
They support a small, understandable loop:

1. A coach chooses or publishes a reusable form.
2. The coach sends one fixed version to one active client relationship and,
   when useful, one exact Session.
3. The client can save a private draft across visits.
4. The client deliberately shares the answers.
5. The coach reads the submitted revision in the same Coaching workspace.

The ordinary interface avoids provider terminology, workflow administration,
and mandatory configuration. The current starting library contains First
conversation, Before our Session, and After our Session.

## Persistence and authority

`CoachingFormTemplate` is coach-owned reusable identity.
`CoachingFormTemplateVersion` is an immutable published definition.
`CoachingFormAssignment` binds one exact version to an active relationship,
client, assigning coach, and optional booking/Session. It never follows a later
template edit. `CoachingFormResponseRevision` retains every private-draft or
submitted revision with request identity and input hash.

The database independently enforces template/version, relationship/member,
assignment, optional Session, and revision integrity. Service operations use
serializable transactions and advisory locks for publish, assignment, and
response races.

`CoachingFormAutomationPolicy` is the coach's current explicit pre/post-Session
rule. `CoachingFormAutomationPolicyRevision` retains every immutable timing,
status, and version-strategy change. `CoachingFormAutomationOverride` is an
append-only Session-specific send-now, skip, or restore decision.
`CoachingFormAutomationReceipt` is created in the same serializable transaction
as the assignment and uniquely binds policy, booking event, exact template
version, assignment, release time, due time, and manual-override state.

Authorization rules are intentionally narrow:

- only the owning coach can publish and assign;
- only an active relationship's exact client can save answers;
- the client can read their current draft;
- the coach can see draft progress but not draft answers;
- the coach can read a submitted response;
- a submitted response cannot be changed back to draft;
- inactive relationships do not expose historic forms through ordinary reads;
- form operations do not implicitly send email, create messages, tasks, goals,
  reminders, calendar events, or recording actions.
- one policy/event can materialize only one assignment even when the page,
  scheduler, or retry reconciles concurrently;
- pausing stops scheduled materialization while preserving visible deliberate
  send-now control;
- deleting a coaching relationship cascades its private form and automation
  evidence without weakening retained evidence inside a live relationship.

## API and interface

- `GET /api/coaching/forms` returns the actor's authorized forms workspace.
- `POST /api/coaching/forms` publishes a starter or assigns an exact version.
- The same POST boundary saves an automation policy, saves a Session override,
  or asks the current coach's policies to reconcile.
- `POST /api/cron/coaching-form-automation` runs one bounded reconciliation
  pass only with its dedicated bearer secret. It fails closed when unconfigured.
- `GET /api/coaching/forms/:assignmentId/response` returns only the actor's
  permitted response projection.
- `PUT /api/coaching/forms/:assignmentId/response` saves a client draft or
  submitted correction using a UUID request identity.
- `/coaching/forms` renders coach library/assignment history and client work in
  one responsive surface. The Coaching navigation and exact relationship page
  link to it.

Supported field kinds are short text, long text, number, scale, boolean,
single-select, multi-select, and date. Definitions and answers have explicit
size/count bounds, and draft validation remains distinct from submission
validation.

The coach-owned builder uses those same server contracts. It can create,
duplicate, reorder, configure, preview, and publish all supported question
types. Unfinished edits are retained in browser storage under the exact signed
in account and template identity. Publishing clears that local draft only after
the server returns the immutable version receipt. Editing never mutates a
version already held by an assignment.

## Acceptance evidence

Focused proof:

- automation cron/form regression suites: 12/12;
- real-loopback PostgreSQL automation lifecycle suite: 3/3, including
  concurrency, version changes, override isolation, and deletion cascade;
- Session alignment service suite: 11/11;
- shared media-processing, media-processor, and Quipsly strict TypeScript;
- alignment evidence/job/cloud-worker suites: 11/11 total;
- all 132 committed migrations current in the isolated recovery lab;
- optimized Quipsly production build;
- rendered phone-width form operation proving publish, assignment, private
  draft, coach non-disclosure, submission/readback, immutable version, no
  horizontal overflow, neighboring-list isolation, and unauthorized write 404.

Integrated proof is the exact clean candidate
`c457cfdd916e55def9ff9e8cd800fa1b6e26cc7c`, with receipt
`artifacts/coaching-acceptance/7edc333a/fresh-coaching-flight-receipt.json`.
That flight passed the form journey inside the complete fresh coach/client
product journey. It also authored a two-question custom form at 390 pixels,
reordered fields, previewed it, published and assigned version one, recovered a
version-two edit after reload, and proved the assignment still referenced
version one. It then authored two additional unique forms through the rendered
phone-width builder, attached visible before/after rhythms, paused/resumed one,
sent an after-form immediately, retained exact receipts, and proved the client
received the forms without seeing coach automation controls. The operated
automation journey also passed twice consecutively against retained test data.

The full flight used a local mailbox and fake browser-media adapters plus
controlled text-to-speech. It did not prove physical devices, real inboxes,
natural human comprehension, production deployment, or cohort scale. The
recovery lab now regenerates Prisma, restarts source-bound services when the
commit changes, stamps the live Nest SHA, and refuses exact-source acceptance
when the health endpoint and candidate do not match.

## Next mature extensions

The implemented builder, automation, storage, and version contracts are ready
for, but do not yet claim:

1. quiet in-product reminders and optional provider delivery backed by a
   durable outbox and visible receipt, never hidden notification side effects;
2. Quipsly Capture parity for completing and reviewing forms without a browser;
3. reviewed promotion of submitted answers into notes, goals, or tasks;
4. template retirement/restore and an explicit version-difference view;
5. client export, accessibility, locale/timezone, and aggregate outcome tools.

The next build lane should bring the same calm Forms inbox, completion,
submission, and coach review to Quipsly Capture, then add quiet in-product
reminders through a durable visible delivery ledger. Automatic promotion into
tasks, goals, or notes should remain an explicit reviewed action rather than an
unexplained side effect.
