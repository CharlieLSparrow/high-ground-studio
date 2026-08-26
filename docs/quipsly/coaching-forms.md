# Coaching forms

Date: 2026-08-26
Status: production architecture implemented; local operated acceptance passed

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

## API and interface

- `GET /api/coaching/forms` returns the actor's authorized forms workspace.
- `POST /api/coaching/forms` publishes a starter or assigns an exact version.
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

## Acceptance evidence

Focused proof:

- form domain and service suite: 8/8;
- Session alignment service suite: 11/11;
- shared media-processing, media-processor, and Quipsly strict TypeScript;
- alignment evidence/job/cloud-worker suites: 11/11 total;
- all 131 committed migrations applied from zero;
- optimized Quipsly production build;
- rendered phone-width form operation proving publish, assignment, private
  draft, coach non-disclosure, submission/readback, immutable version, no
  horizontal overflow, neighboring-list isolation, and unauthorized write 404.

Integrated proof is the exact clean candidate
`31a673f1ecf24ca0ef93ab80f43d3ab37426db0a`, with receipt
`artifacts/coaching-acceptance/2317b78e/fresh-coaching-flight-receipt.json`.
That flight passed the form journey inside the complete fresh coach/client
product journey. It used local mailbox and fake browser-media adapters plus
controlled text-to-speech. It did not prove physical devices, real inboxes,
natural human comprehension, production deployment, or cohort scale.

## Next mature extensions

The implemented storage and version contracts are ready for, but do not yet
claim:

1. a coach-facing custom form builder with add, reorder, configure, preview,
   publish, retire, duplicate, and version-difference workflows;
2. explicit automation policies that assign pre/post forms exactly once from a
   booking or Session lifecycle event;
3. quiet in-product reminders and optional provider delivery backed by a
   durable outbox and visible receipt, never hidden notification side effects;
4. Quipsly Capture parity for completing and reviewing forms without a browser;
5. reviewed promotion of submitted answers into notes, goals, or tasks;
6. client export, accessibility, locale/timezone, and aggregate outcome tools.

The next build lane should start with the custom builder and preview because it
makes the form system genuinely coach-owned without prematurely automating
messages or follow-through.
