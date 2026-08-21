# Charlie account separation readback

Date: 2026-08-20
Status: production read-only proof passed; physical sign-in remains open

## Result

The earlier behavior where `charlielsparrow@gmail.com` appeared to enter the
`charlie@highgroundodyssey.com` account is no longer present in the canonical
production identity ledger.

Read-only Cloud SQL and Firebase Admin readback proves:

- the two emails are separate primary emails on separate active `User` rows;
- neither email is an alias of the other;
- Firebase exposes two distinct verified subjects;
- each exact Firebase subject belongs to its matching canonical user;
- the Gmail subject is not bound to the High Ground user;
- both users currently have the generic `COACH` role;
- neither user has an active native-device session, so an old native session
  cannot remain authoritative after the next sign-in;
- Gmail-scoped Nest access is limited to its private Home Nest and the explicit
  marine-biology research viewer grant in this readback; and
- there are no current Session or coaching invitations scoped to the Gmail
  address.

No database or Firebase state changed.

## Operator repair

`quipsly-plan-user-email-separation.mjs` previously treated an already-correct
two-user state as a failure because it recognized only the pre-separation alias
shape. The read-only operator now distinguishes:

1. an alias that is safe to separate;
2. two independently bound users that are already separated; and
3. an unsafe or ambiguous binding.

The pure decision model has three regression tests covering those states. A
fresh production readback now exits successfully with `alreadySeparated=true`
and recommends no mutation.

## Remaining acceptance

This proves the canonical server-side boundary, not the cached UI on a real
iPhone. The next physical flight must sign into Capture as each email in turn,
confirm the displayed account, and verify the Gmail account cannot see the High
Ground podcast Nest or Sessions.
