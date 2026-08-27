# Quipsly user and support operations

Quipsly deliberately separates identity proof from product authority. No single
Google or Firebase console can answer both questions correctly.

## Sources of truth

| Concern | Authority | Staff surface |
| --- | --- | --- |
| Password, Google credential, verified email, disabled credential, token revocation | Firebase Authentication | Firebase console and `/admin/support` |
| Quipsly person and linked Firebase subjects | Postgres `User` and `UserAuthIdentity` | `/admin/support` |
| Platform staff access | Postgres `UserRole` | `/admin/support` for an `OWNER` |
| Coach/client product persona | Postgres `UserRole`, `CoachProfile`, `ClientProfile` | `/admin/support` and `/admin/users` |
| Organization access | `OrganizationMember` | `/admin/support` |
| Nest/project access | `StudioProjectAccessGrant` and invitation ledger | `/admin/support`, Nest access, `/admin/users` |
| Coaching relationship access | `CoachingEngagementMember` | Coaching workspace and `/admin/support` |
| Exact live-Session access | `CallParticipant` and invitation capability | Session workspace and `/admin/support` |
| Subscription entitlement | `Subscription`, provider event ledger, membership records | Product operations and billing tools |
| Infrastructure changes | Google Cloud Audit Logs | Google Cloud console |
| Product/support mutations | Quipsly `UserEvent` and provider ledgers | `/admin/support` and `/admin/product-ops` |

Firebase custom claims are not Quipsly's role database. They are intentionally
avoided for mutable product roles because claims live in cached ID tokens and
are constrained in size. See Firebase's official
[custom claims guidance](https://firebase.google.com/docs/auth/admin/custom-claims)
and [Admin user management](https://firebase.google.com/docs/auth/admin/manage-users).

## Role model

- `OWNER` administers users, roles, support, and product operations.
- `SUPPORT_AGENT` can inspect customer identity/workflow health, suspend or
  resume access, and revoke sessions. It cannot grant itself or others roles.
- `PRODUCT_ANALYST` can see aggregate product operations and GA4 readback. It
  cannot inspect arbitrary customer records unless separately granted support.
- `COACH`, `CLIENT`, `TEAM_SCHEDULER`, and `NETWORK_PASS` are product-entry
  capabilities. A person may hold more than one; they are not tenant access.
- Organization, Nest, coaching-engagement, and Session roles are scoped grants,
  not global app roles. Staff status never silently grants access to customer
  content.

## Daily support path

Open `/admin/support`, search by exact email/name/user ID, and use the selected
person view for identity links, last sign-in evidence, roles, memberships,
scoped grants, recent Sessions, invitation/reminder delivery, and deletion
status. Customer content—notes, transcripts, recordings, and creative work—is
not rendered there.

Suspending an account disables every Firebase subject in the person's explicit
identity ledger, revokes each subject's refresh tokens, marks the Quipsly
person inactive, and records aggregate sync evidence. Resuming reverses the
explicit access hold; it does not fabricate a new identity. “Revoke login
sessions” forces reauthentication across all linked credentials without
suspending the customer. A stale provider subject is recorded but does not
prevent the app-owned safety hold from taking effect.

Pre-provisioning creates the app record and starter workspace but does not mark
the email verified. Verification is recorded only after Firebase proves the
mailbox, except for isolated `@dev.test` reviewer accounts whose Firebase user
is explicitly created and verified by the owner-only acceptance tool.

## Emergency recovery

Database roles are authoritative. Full production releases explicitly set
`QUIPSLY_ADMIN_BREAK_GLASS_ENABLED=false`; an email address alone grants no
staff or Nest access.

If every database `OWNER` role is accidentally lost, the targeted hotfix lane
can temporarily set both:

```bash
QUIPSLY_ADMIN_BREAK_GLASS_ENABLED=true
QUIPSLY_ADMIN_EMAILS=exact-operator@example.com
```

Use that session only to restore a database `OWNER` and read back the audit
event, then deploy or hotfix again with the override disabled. The emergency
email list never bypasses customer Nest, document, coaching, or Session access.

## Why Quipsly has an app-owned support console

Firebase and Google Cloud remain excellent low-level tools for credential and
infrastructure diagnosis. They do not understand a Quipsly coaching
relationship, Nest invitation, recording state, subscription, deliverability
projection, or cross-device workflow. `/admin/support` joins those systems
without exposing customer content and is therefore the normal support surface;
a separate admin service is not required yet. A future `admin.quipsly.com` can
route to the same authenticated application rather than duplicating authority.
